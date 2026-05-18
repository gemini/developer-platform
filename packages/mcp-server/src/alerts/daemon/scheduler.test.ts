import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AlertStore } from '../store.js';
import { MarketDataStore } from '../../store/index.js';
import { Scheduler, type SchedulerDeps, type SchedulerFetchers } from './scheduler.js';
import type { AlertEvent, AlertRule, AlertCategory } from '../types.js';

function freshStore() {
  const dir = mkdtempSync(join(tmpdir(), 'gemini-alerts-sched-'));
  const store = new AlertStore({ filePath: join(dir, 'alerts.json') });
  return { store, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

interface Harness {
  store: AlertStore;
  marketStore: MarketDataStore;
  fetchers: SchedulerFetchers;
  fired: AlertEvent[];
  calls: { balances: number; orders: number; transfers: number; positions: number; predictions: number; fundingRate: string[]; ws: { subscribe: string[]; unsubscribe: string[] } };
  scheduler: Scheduler;
  cleanup: () => void;
  setNow: (ts: number) => void;
}

function build(opts: {
  rules?: Array<Parameters<AlertStore['create']>[0]>;
  fetcherOverrides?: Partial<SchedulerFetchers>;
  initialNow?: number;
} = {}): Harness {
  const { store, cleanup } = freshStore();
  const marketStore = new MarketDataStore();
  let now = opts.initialNow ?? Date.parse('2026-05-07T12:00:00.000Z');
  const calls = {
    balances: 0,
    orders: 0,
    transfers: 0,
    positions: 0,
    predictions: 0,
    fundingRate: [] as string[],
    ws: { subscribe: [] as string[], unsubscribe: [] as string[] },
  };

  const fetchers: SchedulerFetchers = {
    balances: async () => {
      calls.balances++;
      return [];
    },
    orders: async () => {
      calls.orders++;
      return [];
    },
    transfers: async () => {
      calls.transfers++;
      return { transfers: [] }.transfers;
    },
    fundingRate: async (s: string) => {
      calls.fundingRate.push(s);
      return { symbol: s, fundingRate: '0' };
    },
    positions: async () => {
      calls.positions++;
      return [];
    },
    predictionsSettled: async () => {
      calls.predictions++;
      return { events: [] };
    },
    ...opts.fetcherOverrides,
  };

  const fired: AlertEvent[] = [];
  const deps: SchedulerDeps = {
    store,
    marketStore,
    fetchers,
    ws: {
      subscribe: (s) => {
        calls.ws.subscribe.push(s);
      },
      unsubscribe: (s) => {
        calls.ws.unsubscribe.push(s);
      },
    },
    notifier: (e) => {
      fired.push(e);
    },
    manualMode: true,
    now: () => now,
  };
  const scheduler = new Scheduler(deps);
  const setNow = (ts: number) => {
    now = ts;
  };

  // Synchronously seed rules via the harness — caller awaits before start().
  return {
    store,
    marketStore,
    fetchers,
    fired,
    calls,
    scheduler,
    cleanup,
    setNow,
  };
}

const ruleDefaults: Partial<AlertRule> = {
  enabled: true,
  oneShot: false,
  cooldownMs: 60_000,
};

function ruleSpec(
  category: AlertCategory,
  params: Record<string, unknown>,
  overrides: Partial<AlertRule> = {},
) {
  return { category, name: category, params, ...ruleDefaults, ...overrides };
}

// ----------------------------------------------------------------------------
// REST coalescing
// ----------------------------------------------------------------------------

test('coalesces multiple balance rules into one balances() fetch per tick', async () => {
  const h = build();
  try {
    await h.store.create(ruleSpec('balance.change', { currency: 'USD', direction: 'above', delta: '1' }));
    await h.store.create(ruleSpec('balance.change', { currency: 'BTC', direction: 'above', delta: '1' }));
    await h.store.create(ruleSpec('balance.change', { currency: 'ETH', direction: 'above', delta: '1' }));

    await h.scheduler.start();
    await h.scheduler.tickDatasource('rest.balances');
    await h.scheduler.tickDatasource('rest.balances');

    assert.strictEqual(h.calls.balances, 2, 'one balances() call per tick, not per rule');
  } finally {
    await h.scheduler.stop();
    h.cleanup();
  }
});

test('per-symbol funding-rate fans out to one call per unique symbol per tick', async () => {
  const h = build();
  try {
    await h.store.create(
      ruleSpec('funding_rate.threshold', { symbol: 'BTCPERP', direction: 'above', threshold: '0.01' }),
    );
    await h.store.create(
      ruleSpec('funding_rate.threshold', { symbol: 'ETHPERP', direction: 'above', threshold: '0.01' }),
    );
    // Duplicate symbol should still be one call
    await h.store.create(
      ruleSpec('funding_rate.threshold', { symbol: 'BTCPERP', direction: 'below', threshold: '-0.01' }),
    );

    await h.scheduler.start();
    await h.scheduler.tickDatasource('rest.funding_rate');

    assert.strictEqual(h.calls.fundingRate.length, 2);
    const set = new Set(h.calls.fundingRate);
    assert.deepStrictEqual([...set].sort(), ['BTCPERP', 'ETHPERP']);
  } finally {
    await h.scheduler.stop();
    h.cleanup();
  }
});

test('balance.change fires when fetcher reports the threshold-crossing snapshot', async () => {
  let call = 0;
  const h = build({
    fetcherOverrides: {
      balances: async () => {
        call++;
        return [{ currency: 'USD', balance: call === 1 ? '10000' : '11000' }];
      },
    },
  });
  try {
    await h.store.create(
      ruleSpec('balance.change', { currency: 'USD', direction: 'above', delta: '500' }),
    );

    await h.scheduler.start();
    // First tick: establishes prev. Second: balance rose by 1000, > delta=500.
    await h.scheduler.tickDatasource('rest.balances');
    await h.scheduler.tickDatasource('rest.balances');

    assert.strictEqual(h.fired.length, 1);
    assert.strictEqual(h.fired[0].category, 'balance.change');
  } finally {
    await h.scheduler.stop();
    h.cleanup();
  }
});

// ----------------------------------------------------------------------------
// WS price path
// ----------------------------------------------------------------------------

test('reload() subscribes to symbols newly required by rules', async () => {
  const h = build();
  try {
    await h.scheduler.start();
    assert.deepStrictEqual(h.calls.ws.subscribe, []);

    await h.store.create(
      ruleSpec('price.threshold', { symbol: 'btcusd', direction: 'above', threshold: '50000' }),
    );
    await h.scheduler.reload();

    assert.deepStrictEqual(h.calls.ws.subscribe, ['BTCUSD']);
  } finally {
    await h.scheduler.stop();
    h.cleanup();
  }
});

test('reload() unsubscribes from symbols no longer needed', async () => {
  const h = build();
  try {
    const r = await h.store.create(
      ruleSpec('price.threshold', { symbol: 'BTCUSD', direction: 'above', threshold: '50000' }),
    );
    await h.scheduler.start();
    await h.store.delete(r.id);
    await h.scheduler.reload();

    assert.deepStrictEqual(h.calls.ws.unsubscribe, ['BTCUSD']);
  } finally {
    await h.scheduler.stop();
    h.cleanup();
  }
});

test('price.threshold fires when MarketDataStore emits a crossing price', async () => {
  const h = build();
  try {
    await h.store.create(
      ruleSpec('price.threshold', { symbol: 'BTCUSD', direction: 'above', threshold: '50000' }),
    );
    await h.scheduler.start();

    h.marketStore.updatePrice('BTCUSD', '49999');
    await h.scheduler.flush();
    assert.strictEqual(h.fired.length, 0, 'below threshold');

    h.marketStore.updatePrice('BTCUSD', '50001');
    await h.scheduler.flush();
    assert.strictEqual(h.fired.length, 1);
  } finally {
    await h.scheduler.stop();
    h.cleanup();
  }
});

test('long windowMs rules retain enough history (regression: 2h fallback bug)', async () => {
  const t0 = Date.parse('2026-05-07T12:00:00.000Z');
  const h = build({ initialNow: t0 });
  try {
    // 1-hour window — would have been silently dropped by the old 2h-cap
    // buffer trim logic on its first reload-after-time-passes.
    await h.store.create(
      ruleSpec('price.absolute_change', {
        symbol: 'BTCUSD',
        direction: 'either',
        delta: '100',
        windowMs: 60 * 60_000,
      }),
    );
    await h.scheduler.start();

    // Seed a sample at t0, then advance 65 minutes and push another.
    h.marketStore.updatePrice('BTCUSD', '50000');
    await h.scheduler.flush();

    h.setNow(t0 + 65 * 60_000);
    h.marketStore.updatePrice('BTCUSD', '50250');
    await h.scheduler.flush();

    // Baseline from t0 must still be in the buffer 65min later for this fire.
    assert.strictEqual(h.fired.length, 1);
    assert.match(h.fired[0].reason, /BTCUSD moved/);
  } finally {
    await h.scheduler.stop();
    h.cleanup();
  }
});

test('price.percent_change waits until window has data before firing', async () => {
  const t0 = Date.parse('2026-05-07T12:00:00.000Z');
  const h = build({ initialNow: t0 });
  try {
    await h.store.create(
      ruleSpec('price.percent_change', {
        symbol: 'BTCUSD',
        direction: 'below',
        pct: 0.1,
        windowMs: 60_000,
      }),
    );
    await h.scheduler.start();

    // First sample at t0: not enough history.
    h.marketStore.updatePrice('BTCUSD', '50000');
    await h.scheduler.flush();
    assert.strictEqual(h.fired.length, 0);

    // 61s later, price drops 0.2%. Baseline sample from t0 is now older
    // than windowMs and qualifies.
    h.setNow(t0 + 61_000);
    h.marketStore.updatePrice('BTCUSD', '49900');
    await h.scheduler.flush();
    assert.strictEqual(h.fired.length, 1);
  } finally {
    await h.scheduler.stop();
    h.cleanup();
  }
});

// ----------------------------------------------------------------------------
// Cooldown / oneShot
// ----------------------------------------------------------------------------

test('oneShot disables the rule after firing', async () => {
  const h = build();
  try {
    const r = await h.store.create(
      ruleSpec(
        'price.threshold',
        { symbol: 'BTCUSD', direction: 'above', threshold: '50000' },
        { oneShot: true },
      ),
    );
    await h.scheduler.start();
    h.marketStore.updatePrice('BTCUSD', '50001');
    await h.scheduler.flush();
    assert.strictEqual(h.fired.length, 1);

    const persisted = await h.store.get(r.id);
    assert.strictEqual(persisted?.enabled, false);
    assert.ok(persisted?.lastFiredAt);
  } finally {
    await h.scheduler.stop();
    h.cleanup();
  }
});

test('cooldown suppresses re-fire within window', async () => {
  const t0 = Date.parse('2026-05-07T12:00:00.000Z');
  const h = build({ initialNow: t0 });
  try {
    await h.store.create(
      ruleSpec(
        'price.threshold',
        { symbol: 'BTCUSD', direction: 'above', threshold: '50000' },
        { cooldownMs: 60_000 },
      ),
    );
    await h.scheduler.start();
    h.marketStore.updatePrice('BTCUSD', '50001');
    await h.scheduler.flush();
    assert.strictEqual(h.fired.length, 1);

    h.setNow(t0 + 30_000);
    h.marketStore.updatePrice('BTCUSD', '50002');
    await h.scheduler.flush();
    assert.strictEqual(h.fired.length, 1, 'still cooling down');

    h.setNow(t0 + 70_000);
    h.marketStore.updatePrice('BTCUSD', '50003');
    await h.scheduler.flush();
    assert.strictEqual(h.fired.length, 2, 'cooldown elapsed, fires again');
  } finally {
    await h.scheduler.stop();
    h.cleanup();
  }
});

test('notifier failure does not block lastFiredAt update or future fires', async () => {
  const orig = console.error;
  console.error = () => undefined;
  const h = build();
  try {
    h.scheduler['deps'].notifier = () => {
      throw new Error('toast crashed');
    };
    const r = await h.store.create(
      ruleSpec(
        'price.threshold',
        { symbol: 'BTCUSD', direction: 'above', threshold: '50000' },
        { oneShot: true },
      ),
    );
    await h.scheduler.start();
    h.marketStore.updatePrice('BTCUSD', '50001');
    await h.scheduler.flush();
    const persisted = await h.store.get(r.id);
    assert.strictEqual(persisted?.enabled, false, 'rule still disabled by oneShot');
    assert.ok(persisted?.lastFiredAt);
  } finally {
    await h.scheduler.stop();
    h.cleanup();
    console.error = orig;
  }
});

