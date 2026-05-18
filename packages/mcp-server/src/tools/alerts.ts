import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { wrapHandler, type ToolDefinition } from './index.js';
import { AlertStore } from '../alerts/store.js';
import {
  ALERT_CATEGORIES,
  DEFAULT_COOLDOWN_MS,
  type AlertCategory,
  type AlertEvent,
} from '../alerts/types.js';
import { getCategoryDef, listCategoryDefs } from '../alerts/categories/index.js';
import { getSupervisor } from '../alerts/supervisor/index.js';
import {
  notifyDaemonReload,
  testFireRule,
  getDaemonStatus,
  readDaemonMeta,
  deleteDaemonMeta,
} from '../alerts/ipc.js';
import { createNotifier, probeNotifier } from '../alerts/notifier/index.js';
import {
  installMacosSenderBundle,
  uninstallMacosSenderBundle,
  MACOS_SENDER_BUNDLE_ID,
} from '../alerts/notifier/macos-sender.js';
import { readRecentEvents } from '../alerts/log.js';

/**
 * Concrete `params` examples per category, returned by gemini_alert_categories
 * so the agent has a working starting point in addition to the JSON schema.
 */
const CATEGORY_EXAMPLES: Record<AlertCategory, Record<string, unknown>> = {
  'price.threshold': { symbol: 'BTCUSD', direction: 'below', threshold: '50000' },
  'price.percent_change': {
    symbol: 'BTCUSD',
    direction: 'below',
    pct: 0.1,
    windowMs: 600_000,
  },
  'price.absolute_change': {
    symbol: 'BTCUSD',
    direction: 'either',
    delta: '500',
    windowMs: 60_000,
  },
  'balance.change': { currency: 'USD', direction: 'below', delta: '1000' },
  'order.filled': { symbol: 'BTCUSD' },
  'order.stop_triggered': { symbol: 'BTCUSD' },
  'funding_rate.threshold': { symbol: 'BTCPERP', direction: 'above', threshold: '0.01' },
  'transfer.deposit_confirmed': { currency: 'BTC' },
  'position.liquidation_risk': { symbol: 'BTCPERP', marginPctRemaining: 20 },
  'prediction.settled': {},
};

const CATEGORY_DESCRIPTIONS: Record<AlertCategory, string> = {
  'price.threshold': 'Fires when a symbol crosses a fixed price threshold (above or below).',
  'price.percent_change':
    'Fires when a symbol moves by `pct` percent in either direction within `windowMs` milliseconds. Uses a rolling baseline so it can re-arm after each fire.',
  'price.absolute_change':
    'Fires when a symbol moves by an absolute `delta` (price units, e.g. dollars) within `windowMs` milliseconds. Use direction="either" for any move, or "above"/"below" to require a specific direction.',
  'balance.change':
    'Fires when an account balance for `currency` rises or falls by either an absolute `delta` or a relative `pct`.',
  'order.filled':
    'Fires when a matching order transitions to fully-filled. Match by orderId, clientOrderId, or symbol.',
  'order.stop_triggered':
    'Fires when a stop order leaves the order book with executed_amount > 0 (i.e., the stop tripped).',
  'funding_rate.threshold':
    'Fires when the perpetual funding rate for `symbol` crosses a threshold.',
  'transfer.deposit_confirmed':
    'Fires when a deposit reaches confirmed status. Optional `currency` filter.',
  'position.liquidation_risk':
    'Fires when remaining margin for `symbol` drops at or below `marginPctRemaining` percent.',
  'prediction.settled':
    'Fires when a prediction market event settles. Optional `eventTicker` filter.',
};

export interface AlertToolDeps {
  store?: AlertStore;
}

export function createAlertTools(deps: AlertToolDeps = {}): ToolDefinition[] {
  const store = deps.store ?? new AlertStore();

  return [
    {
      name: 'gemini_alert_categories',
      description:
        'List the alert rule categories supported by gemini_alert_create. Each entry includes a one-line description, the JSON-schema-rendered shape of `params`, a working example, the upstream datasource, and the default poll cadence. Call this before gemini_alert_create when you do not already know the param shape for a category.',
      inputSchema: z.object({}),
      handler: wrapHandler(async () =>
        listCategoryDefs().map((def) => ({
          category: def.category,
          description: CATEGORY_DESCRIPTIONS[def.category],
          datasource: def.datasource,
          defaultPollMs: def.defaultPollMs,
          paramsSchema: zodToJsonSchema(def.schema, { target: 'jsonSchema7' }),
          example: CATEGORY_EXAMPLES[def.category],
        })),
      ),
    },

    {
      name: 'gemini_alert_setup',
      description:
        'First-run check for the alert subsystem: probes OS notification health, installs the macOS sender app bundle (so toasts show the Gemini icon in the top-left), and sends a single test toast in-process. Call before gemini_alert_daemon_install.',
      inputSchema: z.object({}),
      handler: wrapHandler(async () => {
        const probe = probeNotifier();
        let senderBundle:
          | Awaited<ReturnType<typeof installMacosSenderBundle>>
          | { skipped: true; reason: string }
          | { error: string };
        if (process.platform === 'darwin') {
          try {
            senderBundle = await installMacosSenderBundle();
          } catch (err) {
            senderBundle = { error: err instanceof Error ? err.message : String(err) };
          }
        } else {
          senderBundle = { skipped: true, reason: 'macOS-only' };
        }

        const notifier = createNotifier({
          macosSender: process.platform === 'darwin' ? MACOS_SENDER_BUNDLE_ID : undefined,
        });
        const event: AlertEvent = {
          ruleId: 'setup',
          ruleName: 'setup',
          category: 'price.threshold',
          firedAt: new Date().toISOString(),
          reason: '[test] gemini_alert_setup probe',
        };
        try {
          await notifier(event);
          return { ok: true, probe, senderBundle };
        } catch (err) {
          return {
            ok: false,
            probe,
            senderBundle,
            error: err instanceof Error ? err.message : String(err),
          };
        }
      }),
    },

    {
      name: 'gemini_alert_daemon_install',
      description:
        'Install the alerts daemon as an OS-supervised service (launchd on macOS, systemd --user on Linux, Task Scheduler + AUMID on Windows). Bakes the current shell\'s GEMINI_* env vars into the unit.',
      inputSchema: z.object({
        nodePath: z.string().optional().describe('Override path to node binary; defaults to process.execPath'),
        daemonPath: z.string().optional().describe('Override path to the daemon entry; defaults to dist/alerts/daemon/index.js'),
      }),
      handler: wrapHandler(async (args: { nodePath?: string; daemonPath?: string }) => {
        const sup = getSupervisor();
        return sup.install({ nodePath: args.nodePath, daemonPath: args.daemonPath });
      }),
    },

    {
      name: 'gemini_alert_daemon_uninstall',
      description:
        'Stop and remove the OS-supervised alerts daemon. On macOS, also removes the sender app bundle installed by gemini_alert_setup.',
      inputSchema: z.object({}),
      handler: wrapHandler(async () => {
        const sup = getSupervisor();
        await sup.uninstall();
        await deleteDaemonMeta();
        if (process.platform === 'darwin') {
          await uninstallMacosSenderBundle();
        }
        return { ok: true };
      }),
    },

    {
      name: 'gemini_alert_daemon_status',
      description:
        'Get the alerts daemon status: supervisor (installed/running/PID) plus the daemon\'s own /status (uptime, fired count, subscribed symbols).',
      inputSchema: z.object({}),
      handler: wrapHandler(async () => {
        const sup = getSupervisor();
        const supervisor = await sup.status();
        const meta = await readDaemonMeta();
        const http = meta ? await getDaemonStatus() : null;
        return { supervisor, meta, http };
      }),
    },

    {
      name: 'gemini_alert_daemon_reload_config',
      description:
        'Re-bake the current shell\'s env vars into the supervisor unit and restart the daemon. Use after rotating GEMINI_API_KEY.',
      inputSchema: z.object({}),
      handler: wrapHandler(async () => {
        const sup = getSupervisor();
        const result = await sup.install();
        await sup.restart();
        return result;
      }),
    },

    {
      name: 'gemini_alert_create',
      description:
        'Create a new alert rule. The `params` object is validated against the category-specific schema (e.g. price.threshold requires symbol/direction/threshold).',
      inputSchema: z.object({
        name: z.string().min(1),
        category: z.enum(ALERT_CATEGORIES),
        params: z.record(z.string(), z.unknown()),
        enabled: z.boolean().optional().default(true),
        oneShot: z.boolean().optional().default(false),
        cooldownMs: z.number().int().positive().optional(),
      }),
      handler: wrapHandler(async (args: {
        name: string;
        category: (typeof ALERT_CATEGORIES)[number];
        params: Record<string, unknown>;
        enabled?: boolean;
        oneShot?: boolean;
        cooldownMs?: number;
      }) => {
        const def = getCategoryDef(args.category);
        const parsed = def.schema.safeParse(args.params);
        if (!parsed.success) {
          throw new Error(
            `Invalid params for ${args.category}: ${parsed.error.issues
              .map((i) => `${i.path.join('.') || '<root>'}: ${i.message}`)
              .join('; ')}`,
          );
        }
        const rule = await store.create({
          name: args.name,
          category: args.category,
          params: parsed.data as Record<string, unknown>,
          enabled: args.enabled ?? true,
          oneShot: args.oneShot ?? false,
          cooldownMs: args.cooldownMs ?? DEFAULT_COOLDOWN_MS,
        });
        await notifyDaemonReload();
        return rule;
      }),
    },

    {
      name: 'gemini_alert_list',
      description: 'List all alert rules with their last-fired timestamps.',
      inputSchema: z.object({}),
      handler: wrapHandler(async () => store.list()),
    },

    {
      name: 'gemini_alert_get',
      description: 'Get a single alert rule by id.',
      inputSchema: z.object({ id: z.string() }),
      handler: wrapHandler(async ({ id }: { id: string }) => {
        const rule = await store.get(id);
        if (!rule) throw new Error(`Rule not found: ${id}`);
        return rule;
      }),
    },

    {
      name: 'gemini_alert_update',
      description:
        'Update an existing alert rule. If `params` is provided, it is re-validated against the rule\'s category schema.',
      inputSchema: z.object({
        id: z.string(),
        name: z.string().optional(),
        enabled: z.boolean().optional(),
        oneShot: z.boolean().optional(),
        cooldownMs: z.number().int().positive().optional(),
        params: z.record(z.string(), z.unknown()).optional(),
      }),
      handler: wrapHandler(async (args: {
        id: string;
        name?: string;
        enabled?: boolean;
        oneShot?: boolean;
        cooldownMs?: number;
        params?: Record<string, unknown>;
      }) => {
        const { id, ...patch } = args;
        if (patch.params !== undefined) {
          const existing = await store.get(id);
          if (!existing) throw new Error(`Rule not found: ${id}`);
          const def = getCategoryDef(existing.category);
          const parsed = def.schema.safeParse(patch.params);
          if (!parsed.success) {
            throw new Error(
              `Invalid params: ${parsed.error.issues.map((i) => i.message).join('; ')}`,
            );
          }
          patch.params = parsed.data as Record<string, unknown>;
        }
        const rule = await store.update(id, patch);
        await notifyDaemonReload();
        return rule;
      }),
    },

    {
      name: 'gemini_alert_delete',
      description: 'Delete an alert rule.',
      inputSchema: z.object({ id: z.string() }),
      handler: wrapHandler(async ({ id }: { id: string }) => {
        const ok = await store.delete(id);
        await notifyDaemonReload();
        return { ok };
      }),
    },

    {
      name: 'gemini_alert_test',
      description:
        'Fire a synthetic test notification for a rule via the running daemon. Does not affect cooldown or lastFiredAt. Requires the daemon to be installed and running.',
      inputSchema: z.object({ id: z.string() }),
      handler: wrapHandler(async ({ id }: { id: string }) => {
        const result = await testFireRule(id);
        if (!result.ok) {
          throw new Error(
            `Test fire failed (status=${result.status ?? 'unreachable'}). Is the daemon running? Call gemini_alert_daemon_status.`,
          );
        }
        return result.body;
      }),
    },

    {
      name: 'gemini_alert_history',
      description: 'Read the last N fired alert events from the audit log (~/.gemini-mcp/alerts.log).',
      inputSchema: z.object({
        limit: z.number().int().positive().max(1000).optional().default(50),
      }),
      handler: wrapHandler(async ({ limit }: { limit?: number }) => readRecentEvents(limit ?? 50)),
    },
  ];
}
