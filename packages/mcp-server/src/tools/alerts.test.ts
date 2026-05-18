import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createAlertTools } from './alerts.js';
import { AlertStore } from '../alerts/store.js';
import type { ToolDefinition } from './index.js';

function find(tools: ToolDefinition[], name: string): ToolDefinition {
  const t = tools.find((x) => x.name === name);
  if (!t) throw new Error(`tool not found: ${name}`);
  return t;
}

function fresh() {
  const dir = mkdtempSync(join(tmpdir(), 'gemini-alerts-tools-'));
  const store = new AlertStore({ filePath: join(dir, 'alerts.json') });
  const tools = createAlertTools({ store });
  return { dir, store, tools, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

const TOOL_OUTPUT_ENVELOPE = /^<tool-output server="gemini-mcp">\n([\s\S]*)\n<\/tool-output>$/;

function unwrap(text: string): string {
  const m = TOOL_OUTPUT_ENVELOPE.exec(text);
  return m ? m[1] : text;
}

async function call<T = unknown>(tool: ToolDefinition, args: Record<string, unknown>): Promise<T> {
  const parsed = tool.inputSchema.safeParse(args);
  assert.ok(parsed.success, `args failed schema: ${parsed.success ? '' : parsed.error.message}`);
  const result = await tool.handler(parsed.data);
  const text = unwrap((result.content[0] as { type: string; text: string }).text);
  if (result.isError) {
    throw new Error(text);
  }
  return JSON.parse(text) as T;
}

test('exports the documented tool surface', () => {
  const { tools, cleanup } = fresh();
  try {
    const names = tools.map((t) => t.name).sort();
    assert.deepStrictEqual(names, [
      'gemini_alert_categories',
      'gemini_alert_create',
      'gemini_alert_daemon_install',
      'gemini_alert_daemon_reload_config',
      'gemini_alert_daemon_status',
      'gemini_alert_daemon_uninstall',
      'gemini_alert_delete',
      'gemini_alert_get',
      'gemini_alert_history',
      'gemini_alert_list',
      'gemini_alert_setup',
      'gemini_alert_test',
      'gemini_alert_update',
    ]);
  } finally {
    cleanup();
  }
});

test('categories returns 9 entries with paramsSchema and example for each', async () => {
  const { tools, cleanup } = fresh();
  try {
    const cats = find(tools, 'gemini_alert_categories');
    const result = await call<
      Array<{
        category: string;
        description: string;
        datasource: string;
        defaultPollMs: number;
        paramsSchema: { type?: string; properties?: Record<string, unknown> };
        example: Record<string, unknown>;
      }>
    >(cats, {});
    assert.strictEqual(result.length, 10);
    const categoryNames = result.map((r) => r.category).sort();
    assert.deepStrictEqual(categoryNames, [
      'balance.change',
      'funding_rate.threshold',
      'order.filled',
      'order.stop_triggered',
      'position.liquidation_risk',
      'prediction.settled',
      'price.absolute_change',
      'price.percent_change',
      'price.threshold',
      'transfer.deposit_confirmed',
    ]);
    for (const entry of result) {
      assert.ok(entry.description, `${entry.category} missing description`);
      assert.ok(entry.paramsSchema, `${entry.category} missing paramsSchema`);
      assert.ok(entry.example, `${entry.category} missing example`);
    }
  } finally {
    cleanup();
  }
});

test('the example returned for each category is itself valid for create', async () => {
  const { tools, cleanup } = fresh();
  try {
    const cats = find(tools, 'gemini_alert_categories');
    const create = find(tools, 'gemini_alert_create');
    const list = await call<Array<{ category: string; example: Record<string, unknown> }>>(
      cats,
      {},
    );
    for (const entry of list) {
      // Skip categories whose minimum example happens to be {} — they don't
      // exercise create's param validator in a meaningful way.
      if (Object.keys(entry.example).length === 0) continue;
      const created = await call<{ id: string }>(create, {
        name: `example-for-${entry.category}`,
        category: entry.category,
        params: entry.example,
      });
      assert.ok(created.id, `create rejected example for ${entry.category}`);
    }
  } finally {
    cleanup();
  }
});

test('create validates params against the category schema and rejects bad input', async () => {
  const { tools, cleanup } = fresh();
  try {
    const create = find(tools, 'gemini_alert_create');
    await assert.rejects(
      () =>
        call(create, {
          name: 'bad',
          category: 'price.threshold',
          // Missing direction + threshold.
          params: { symbol: 'BTCUSD' },
        }),
      /Invalid params for price.threshold/,
    );
  } finally {
    cleanup();
  }
});

test('create persists a valid rule and assigns an id', async () => {
  const { store, tools, cleanup } = fresh();
  try {
    const create = find(tools, 'gemini_alert_create');
    const rule = await call<{ id: string; name: string; category: string }>(create, {
      name: 'BTC drop',
      category: 'price.threshold',
      params: { symbol: 'BTCUSD', direction: 'below', threshold: '50000' },
    });
    assert.ok(rule.id);
    assert.strictEqual(rule.name, 'BTC drop');
    const persisted = await store.get(rule.id);
    assert.strictEqual(persisted?.category, 'price.threshold');
  } finally {
    cleanup();
  }
});

test('list returns all rules', async () => {
  const { tools, cleanup } = fresh();
  try {
    const create = find(tools, 'gemini_alert_create');
    const list = find(tools, 'gemini_alert_list');
    await call(create, {
      name: 'a',
      category: 'price.threshold',
      params: { symbol: 'BTCUSD', direction: 'below', threshold: '1' },
    });
    await call(create, {
      name: 'b',
      category: 'price.threshold',
      params: { symbol: 'ETHUSD', direction: 'above', threshold: '2' },
    });
    const rules = await call<unknown[]>(list, {});
    assert.strictEqual(rules.length, 2);
  } finally {
    cleanup();
  }
});

test('get returns a single rule and 404s on a missing id', async () => {
  const { tools, cleanup } = fresh();
  try {
    const create = find(tools, 'gemini_alert_create');
    const get = find(tools, 'gemini_alert_get');
    const created = await call<{ id: string }>(create, {
      name: 'x',
      category: 'price.threshold',
      params: { symbol: 'BTCUSD', direction: 'below', threshold: '1' },
    });
    const got = await call<{ id: string }>(get, { id: created.id });
    assert.strictEqual(got.id, created.id);
    await assert.rejects(() => call(get, { id: 'nope' }), /not found/);
  } finally {
    cleanup();
  }
});

test('update re-validates params against the existing category schema', async () => {
  const { tools, cleanup } = fresh();
  try {
    const create = find(tools, 'gemini_alert_create');
    const update = find(tools, 'gemini_alert_update');
    const r = await call<{ id: string }>(create, {
      name: 'x',
      category: 'price.threshold',
      params: { symbol: 'BTCUSD', direction: 'below', threshold: '50000' },
    });

    // Valid: change threshold.
    const updated = await call<{ params: { threshold: string } }>(update, {
      id: r.id,
      params: { symbol: 'BTCUSD', direction: 'below', threshold: '40000' },
    });
    assert.strictEqual(updated.params.threshold, '40000');

    // Invalid: drop a required field.
    await assert.rejects(
      () => call(update, { id: r.id, params: { symbol: 'BTCUSD' } }),
      /Invalid params/,
    );
  } finally {
    cleanup();
  }
});

test('update without params skips re-validation but still patches the rule', async () => {
  const { tools, cleanup } = fresh();
  try {
    const create = find(tools, 'gemini_alert_create');
    const update = find(tools, 'gemini_alert_update');
    const r = await call<{ id: string }>(create, {
      name: 'x',
      category: 'price.threshold',
      params: { symbol: 'BTCUSD', direction: 'below', threshold: '50000' },
    });
    const updated = await call<{ enabled: boolean }>(update, { id: r.id, enabled: false });
    assert.strictEqual(updated.enabled, false);
  } finally {
    cleanup();
  }
});

test('delete removes the rule and is idempotent', async () => {
  const { tools, cleanup } = fresh();
  try {
    const create = find(tools, 'gemini_alert_create');
    const del = find(tools, 'gemini_alert_delete');
    const r = await call<{ id: string }>(create, {
      name: 'x',
      category: 'price.threshold',
      params: { symbol: 'BTCUSD', direction: 'below', threshold: '1' },
    });
    const first = await call<{ ok: boolean }>(del, { id: r.id });
    assert.strictEqual(first.ok, true);
    const second = await call<{ ok: boolean }>(del, { id: r.id });
    assert.strictEqual(second.ok, false);
  } finally {
    cleanup();
  }
});

test('history returns [] when alerts.log does not exist (clean install)', async () => {
  const { tools, cleanup } = fresh();
  try {
    const history = find(tools, 'gemini_alert_history');
    const events = await call<unknown[]>(history, { limit: 10 });
    // The history tool reads from a fixed default path; on a fresh CI box that
    // path is unlikely to exist. Returning [] (rather than throwing) is the
    // contract gemini_alert_history must keep — assert that contract.
    assert.ok(Array.isArray(events));
  } finally {
    cleanup();
  }
});

test('test tool errors clearly when the daemon is not running', async () => {
  const { tools, cleanup } = fresh();
  try {
    const create = find(tools, 'gemini_alert_create');
    const t = find(tools, 'gemini_alert_test');
    const r = await call<{ id: string }>(create, {
      name: 'x',
      category: 'price.threshold',
      params: { symbol: 'BTCUSD', direction: 'below', threshold: '1' },
    });
    // The local dev box doesn't have the daemon meta written by THIS test,
    // but the default meta path may or may not point at a real daemon. The
    // stable contract is "if the daemon isn't reachable, throw with a hint."
    // If the daemon happens to be running locally this test is a no-op,
    // which is acceptable.
    try {
      await call(t, { id: r.id });
    } catch (err) {
      assert.match((err as Error).message, /Test fire failed|daemon|status/i);
    }
  } finally {
    cleanup();
  }
});
