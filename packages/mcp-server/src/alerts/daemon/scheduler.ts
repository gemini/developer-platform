import type { AlertStore } from '../store.js';
import type { MarketDataStore } from '../../store/index.js';
import { evaluateRule } from '../evaluator.js';
import { getCategoryDef, listCategoryDefs } from '../categories/index.js';
import type { AlertEvent, AlertRule } from '../types.js';
import type { OrderRecord, OrderSnapshot } from '../categories/order.js';
import type { BalanceSnapshot } from '../categories/balance.js';
import type { TransferRecord, TransferSnapshot } from '../categories/transfer.js';
import type { FundingRateSnapshot } from '../categories/funding.js';
import type { PositionSnapshot } from '../categories/position.js';
import type { PredictionSnapshot } from '../categories/prediction.js';

export interface SchedulerFetchers {
  balances: () => Promise<BalanceSnapshot[]>;
  orders: () => Promise<OrderRecord[]>;
  transfers: () => Promise<TransferRecord[]>;
  fundingRate: (symbol: string) => Promise<FundingRateSnapshot>;
  positions: () => Promise<PositionSnapshot[]>;
  predictionsSettled: () => Promise<PredictionSnapshot>;
}

export interface SchedulerWsAdapter {
  subscribe(symbol: string): Promise<void> | void;
  unsubscribe(symbol: string): Promise<void> | void;
}

export interface SchedulerDeps {
  store: AlertStore;
  marketStore: MarketDataStore;
  fetchers: SchedulerFetchers;
  ws: SchedulerWsAdapter;
  notifier: (event: AlertEvent) => Promise<void> | void;
  logger?: (event: AlertEvent) => Promise<void> | void;
  /** Override poll interval per datasource id (ms). Used by tests. */
  pollMs?: Partial<Record<string, number>>;
  now?: () => number;
  /** When true, start() does not arm setInterval timers; callers drive ticks. */
  manualMode?: boolean;
}

interface PriceSample {
  price: string;
  timestamp: number;
}

interface RuleState {
  prev?: unknown;
  /**
   * In-memory authoritative cooldown timestamp (ms since epoch). Updated
   * synchronously the moment a rule fires, so subsequent WS ticks racing
   * with the persistent store.update see the cooldown immediately. The
   * on-disk lastFiredAt is for restart-survival only.
   */
  lastFiredAt?: number;
}

export interface SchedulerStatus {
  running: boolean;
  startedAt: number;
  firedCount: number;
  subscribedSymbols: string[];
  activePollers: string[];
}

const REST_DATASOURCES = [
  'rest.balances',
  'rest.orders',
  'rest.transfers',
  'rest.funding_rate',
  'rest.positions',
  'rest.predictions_settled',
] as const;

export class Scheduler {
  private readonly deps: SchedulerDeps;
  private readonly state = new Map<string, RuleState>();
  private readonly priceBuffers = new Map<string, PriceSample[]>();
  private readonly pollers = new Map<string, NodeJS.Timeout>();
  private readonly wsUnsubs = new Map<string, () => void>();
  private readonly subscribedSymbols = new Set<string>();
  private startedAt = 0;
  private firedCount = 0;
  private running = false;
  private inflight = new Set<Promise<void>>();
  /** Per-symbol max windowMs across all enabled price rules using that symbol. Refreshed on reload(). */
  private symbolMaxWindowMs = new Map<string, number>();

  constructor(deps: SchedulerDeps) {
    this.deps = deps;
  }

  private now(): number {
    return this.deps.now ? this.deps.now() : Date.now();
  }

  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;
    this.startedAt = this.now();
    await this.reload();
  }

  async stop(): Promise<void> {
    this.running = false;
    for (const t of this.pollers.values()) clearInterval(t);
    this.pollers.clear();
    for (const stop of this.wsUnsubs.values()) stop();
    this.wsUnsubs.clear();
    for (const s of this.subscribedSymbols) await this.deps.ws.unsubscribe(s);
    this.subscribedSymbols.clear();
    this.symbolMaxWindowMs.clear();
    this.priceBuffers.clear();
    await this.flush();
  }

  /**
   * Wait for any fire-and-forget WS-driven dispatches to finish. Useful for
   * tests, and called from stop() so cleanup doesn't race async work.
   */
  async flush(): Promise<void> {
    while (this.inflight.size > 0) {
      await Promise.allSettled([...this.inflight]);
    }
  }

  private track(p: Promise<void>): void {
    this.inflight.add(p);
    p.finally(() => this.inflight.delete(p));
  }

  /**
   * Re-read rules and reconcile WS subscriptions + REST pollers.
   * Idempotent — call after any external rules.json mutation.
   */
  async reload(): Promise<void> {
    const rules = (await this.deps.store.list()).filter((r) => r.enabled);

    await this.reconcileWsSubscriptions(rules);
    this.reconcileRestPollers(rules);

    // Drop state for rules that no longer exist or were disabled.
    const liveIds = new Set(rules.map((r) => r.id));
    for (const id of this.state.keys()) if (!liveIds.has(id)) this.state.delete(id);
  }

  status(): SchedulerStatus {
    return {
      running: this.running,
      startedAt: this.startedAt,
      firedCount: this.firedCount,
      subscribedSymbols: [...this.subscribedSymbols],
      activePollers: [...this.pollers.keys()],
    };
  }

  /** Public for tests / control plane: drive a single REST tick for one datasource. */
  async tickDatasource(ds: string): Promise<void> {
    if (!REST_DATASOURCES.includes(ds as (typeof REST_DATASOURCES)[number])) {
      throw new Error(`Unknown datasource: ${ds}`);
    }
    const rules = (await this.deps.store.list()).filter(
      (r) => r.enabled && getCategoryDef(r.category).datasource === ds,
    );
    if (rules.length === 0) return;
    await this.runDatasource(ds, rules);
  }

  // ---------------------------------------------------------------------------
  // WS reconciliation
  // ---------------------------------------------------------------------------

  private async reconcileWsSubscriptions(rules: AlertRule[]): Promise<void> {
    const needed = new Set<string>();
    const maxWindow = new Map<string, number>();
    for (const r of rules) {
      const def = getCategoryDef(r.category);
      if (def.datasource !== 'ws.price') continue;
      const sym = (r.params as { symbol?: string }).symbol;
      if (!sym) continue;
      const upper = sym.toUpperCase();
      needed.add(upper);

      // Track the longest baseline window any rule on this symbol needs,
      // so the price buffer keeps enough history to satisfy it.
      const windowMs = (r.params as { windowMs?: number }).windowMs;
      if (typeof windowMs === 'number' && windowMs > (maxWindow.get(upper) ?? 0)) {
        maxWindow.set(upper, windowMs);
      }
    }
    this.symbolMaxWindowMs = maxWindow;

    for (const sym of [...this.subscribedSymbols]) {
      if (needed.has(sym)) continue;
      await this.deps.ws.unsubscribe(sym);
      this.wsUnsubs.get(sym)?.();
      this.wsUnsubs.delete(sym);
      this.subscribedSymbols.delete(sym);
      this.priceBuffers.delete(sym);
    }

    for (const sym of needed) {
      if (this.subscribedSymbols.has(sym)) continue;
      await this.deps.ws.subscribe(sym);
      const stop = this.deps.marketStore.onUpdate(sym, () => {
        this.track(this.onPriceUpdate(sym));
      });
      this.wsUnsubs.set(sym, stop);
      this.subscribedSymbols.add(sym);
    }
  }

  private async onPriceUpdate(symbol: string): Promise<void> {
    const cached = this.deps.marketStore.getPrice(symbol);
    if (!cached) return;

    // Stamp samples with the scheduler's own clock so percent_change windows
    // line up with evaluator timestamps even when the test rig moves time.
    const ts = this.now();
    this.recordPriceSample(symbol, { price: cached.price, timestamp: ts });

    const rules = (await this.deps.store.list()).filter(
      (r) =>
        r.enabled &&
        getCategoryDef(r.category).datasource === 'ws.price' &&
        (r.params as { symbol?: string }).symbol?.toUpperCase() === symbol,
    );

    for (const rule of rules) {
      const snapshot = this.makePriceSnapshot(rule, symbol, cached.price, ts);
      if (!snapshot) continue;
      await this.dispatch(rule, snapshot);
    }
  }

  private recordPriceSample(symbol: string, sample: PriceSample): void {
    const buf = this.priceBuffers.get(symbol) ?? [];
    buf.push(sample);
    // Trim to 2× the longest windowMs any rule on this symbol cares about.
    // 2× gives slack so the boundary lookup in makePriceSnapshot still finds
    // a sample at the cutoff. Without an active windowed rule, we still keep
    // a few minutes so a freshly-added rule isn't starved on its first tick.
    const longest = this.symbolMaxWindowMs.get(symbol) ?? 5 * 60_000;
    const cutoff = sample.timestamp - longest * 2;
    while (buf.length > 1 && buf[0].timestamp < cutoff) buf.shift();
    this.priceBuffers.set(symbol, buf);
  }

  private makePriceSnapshot(
    rule: AlertRule,
    symbol: string,
    price: string,
    timestamp: number,
  ): unknown {
    if (rule.category === 'price.threshold') {
      return { price, timestamp };
    }
    if (rule.category === 'price.percent_change' || rule.category === 'price.absolute_change') {
      const windowMs = (rule.params as { windowMs?: number }).windowMs;
      if (!windowMs) return undefined;
      const buf = this.priceBuffers.get(symbol) ?? [];
      const cutoff = timestamp - windowMs;
      // Find oldest sample not older than cutoff (i.e. on the boundary).
      let baseline = buf[0];
      for (const s of buf) {
        if (s.timestamp <= cutoff) baseline = s;
        else break;
      }
      if (!baseline || baseline.timestamp > cutoff) {
        // We don't yet have enough history to compare — skip until window fills.
        return undefined;
      }
      return {
        price,
        baselinePrice: baseline.price,
        baselineAt: baseline.timestamp,
      };
    }
    return undefined;
  }

  // ---------------------------------------------------------------------------
  // REST poller reconciliation
  // ---------------------------------------------------------------------------

  private reconcileRestPollers(rules: AlertRule[]): void {
    const needed = new Map<string, number>();
    for (const r of rules) {
      const def = getCategoryDef(r.category);
      if (def.defaultPollMs <= 0) continue;
      const interval = this.deps.pollMs?.[def.datasource] ?? def.defaultPollMs;
      const cur = needed.get(def.datasource);
      needed.set(def.datasource, cur === undefined ? interval : Math.min(cur, interval));
    }

    for (const ds of [...this.pollers.keys()]) {
      if (!needed.has(ds)) {
        clearInterval(this.pollers.get(ds));
        this.pollers.delete(ds);
      }
    }

    if (this.deps.manualMode) return;
    for (const [ds, interval] of needed) {
      if (this.pollers.has(ds)) continue;
      // Fire once immediately so a freshly-installed rule gets evaluated without
      // waiting up to defaultPollMs (5min for funding rate, etc).
      void this.runDatasourceFromStore(ds);
      const timer = setInterval(() => {
        void this.runDatasourceFromStore(ds);
      }, interval);
      timer.unref?.();
      this.pollers.set(ds, timer);
    }
  }

  private async runDatasourceFromStore(ds: string): Promise<void> {
    const rules = (await this.deps.store.list()).filter(
      (r) => r.enabled && getCategoryDef(r.category).datasource === ds,
    );
    if (rules.length === 0) return;
    await this.runDatasource(ds, rules);
  }

  private async runDatasource(ds: string, rules: AlertRule[]): Promise<void> {
    try {
      switch (ds) {
        case 'rest.balances':
          return await this.runBalances(rules);
        case 'rest.orders':
          return await this.runOrders(rules);
        case 'rest.transfers':
          return await this.runTransfers(rules);
        case 'rest.funding_rate':
          return await this.runFundingRates(rules);
        case 'rest.positions':
          return await this.runPositions(rules);
        case 'rest.predictions_settled':
          return await this.runPredictions(rules);
        default:
          return;
      }
    } catch (err) {
      // Fetcher failures are transient — don't crash the daemon over an outage.
      // eslint-disable-next-line no-console
      console.error(`Scheduler datasource ${ds} fetch failed:`, err);
    }
  }

  private async runBalances(rules: AlertRule[]): Promise<void> {
    const balances = await this.deps.fetchers.balances();
    const byCurrency = new Map<string, BalanceSnapshot>();
    for (const b of balances) byCurrency.set(b.currency.toUpperCase(), b);
    for (const rule of rules) {
      const cur = (rule.params as { currency?: string }).currency;
      if (!cur) continue;
      const snap = byCurrency.get(cur.toUpperCase());
      if (!snap) continue;
      await this.dispatch(rule, snap);
    }
  }

  private async runOrders(rules: AlertRule[]): Promise<void> {
    const orders = await this.deps.fetchers.orders();
    const snap: OrderSnapshot = { orders };
    for (const rule of rules) await this.dispatch(rule, snap);
  }

  private async runTransfers(rules: AlertRule[]): Promise<void> {
    const transfers = await this.deps.fetchers.transfers();
    const snap: TransferSnapshot = { transfers };
    for (const rule of rules) await this.dispatch(rule, snap);
  }

  private async runFundingRates(rules: AlertRule[]): Promise<void> {
    const symbols = new Set<string>();
    for (const r of rules) {
      const s = (r.params as { symbol?: string }).symbol;
      if (s) symbols.add(s);
    }
    const snaps = new Map<string, FundingRateSnapshot>();
    await Promise.all(
      [...symbols].map(async (s) => {
        try {
          snaps.set(s.toUpperCase(), await this.deps.fetchers.fundingRate(s));
        } catch {
          // single-symbol failure must not block others
        }
      }),
    );
    for (const rule of rules) {
      const sym = (rule.params as { symbol?: string }).symbol;
      if (!sym) continue;
      const snap = snaps.get(sym.toUpperCase());
      if (!snap) continue;
      await this.dispatch(rule, snap);
    }
  }

  private async runPositions(rules: AlertRule[]): Promise<void> {
    const positions = await this.deps.fetchers.positions();
    const bySymbol = new Map<string, PositionSnapshot>();
    for (const p of positions) bySymbol.set(p.symbol.toUpperCase(), p);
    for (const rule of rules) {
      const sym = (rule.params as { symbol?: string }).symbol;
      if (!sym) continue;
      const snap = bySymbol.get(sym.toUpperCase());
      if (!snap) continue;
      await this.dispatch(rule, snap);
    }
  }

  private async runPredictions(rules: AlertRule[]): Promise<void> {
    const snap = await this.deps.fetchers.predictionsSettled();
    for (const rule of rules) await this.dispatch(rule, snap);
  }

  // ---------------------------------------------------------------------------
  // Dispatch
  // ---------------------------------------------------------------------------

  private async dispatch(rule: AlertRule, snapshot: unknown): Promise<void> {
    const now = this.now();
    const state = this.state.get(rule.id) ?? {};

    // Use the in-memory cooldown stamp as authoritative. Rule.lastFiredAt
    // from disk lags behind the actual fire by however long the async
    // store.update takes; relying on it caused this rule to fire ~14× in
    // 80 seconds with a 60s cooldown (smoke test 2026-05-07).
    const ruleForEval: AlertRule = state.lastFiredAt
      ? { ...rule, lastFiredAt: new Date(state.lastFiredAt).toISOString() }
      : rule;

    const result = evaluateRule({
      rule: ruleForEval,
      snapshot,
      prev: state.prev,
      now,
    });

    state.prev = snapshot;
    this.state.set(rule.id, state);

    if (!result.triggered) return;

    // Stamp the cooldown synchronously so any concurrent WS tick already
    // queued behind this dispatch sees the rule as cooling down.
    state.lastFiredAt = now;
    this.state.set(rule.id, state);

    const firedAt = new Date(now).toISOString();
    const event: AlertEvent = {
      ruleId: rule.id,
      ruleName: rule.name,
      category: rule.category,
      firedAt,
      reason: result.reason,
      snapshot: result.details,
    };

    try {
      await this.deps.notifier(event);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('notifier threw:', err);
    }

    if (this.deps.logger) {
      try {
        await this.deps.logger(event);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('logger threw:', err);
      }
    }

    this.firedCount += 1;
    await this.deps.store.update(rule.id, {
      lastFiredAt: firedAt,
      ...(rule.oneShot ? { enabled: false } : {}),
    });
  }
}

export function isRestDatasource(ds: string): boolean {
  return (REST_DATASOURCES as readonly string[]).includes(ds);
}

export function listRestDatasources(): readonly string[] {
  return REST_DATASOURCES;
}

// Re-exported for the daemon entry to wire concrete fetchers cleanly.
export { listCategoryDefs };
