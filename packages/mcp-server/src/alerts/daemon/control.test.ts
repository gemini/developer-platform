import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AlertStore } from '../store.js';
import { MarketDataStore } from '../../store/index.js';
import { ControlServer } from './control.js';
import { Scheduler, type SchedulerFetchers } from './scheduler.js';
import type { AlertEvent } from '../types.js';

function noopFetchers(): SchedulerFetchers {
  return {
    balances: async () => [],
    orders: async () => [],
    transfers: async () => [],
    fundingRate: async (s: string) => ({ symbol: s, fundingRate: '0' }),
    positions: async () => [],
    predictionsSettled: async () => ({ events: [] }),
  };
}

function build() {
  const dir = mkdtempSync(join(tmpdir(), 'gemini-alerts-control-'));
  const store = new AlertStore({ filePath: join(dir, 'alerts.json') });
  const marketStore = new MarketDataStore();
  const fired: AlertEvent[] = [];
  const scheduler = new Scheduler({
    store,
    marketStore,
    fetchers: noopFetchers(),
    ws: { subscribe: () => undefined, unsubscribe: () => undefined },
    notifier: () => undefined,
    manualMode: true,
  });
  const control = new ControlServer({
    scheduler,
    store,
    notifier: (e) => {
      fired.push(e);
    },
    pid: 12345,
    now: () => 1_700_000_000_000,
  });
  return {
    dir,
    store,
    scheduler,
    control,
    fired,
    cleanup: () => rmSync(dir, { recursive: true, force: true }),
  };
}

test('listens on 127.0.0.1 only', async () => {
  const h = build();
  try {
    const { port } = await h.control.start();
    assert.ok(port > 0);

    // Loopback fetch works.
    const ok = await fetch(`http://127.0.0.1:${port}/status`);
    assert.strictEqual(ok.status, 200);
  } finally {
    await h.control.stop();
    h.cleanup();
  }
});

test('GET /status returns the expected shape', async () => {
  const h = build();
  try {
    const { port } = await h.control.start();
    await h.scheduler.start();
    const res = await fetch(`http://127.0.0.1:${port}/status`);
    const body = (await res.json()) as Record<string, unknown>;
    assert.strictEqual(body.pid, 12345);
    assert.strictEqual(body.port, port);
    assert.strictEqual(body.running, true);
    assert.strictEqual(typeof body.uptimeMs, 'number');
    assert.deepStrictEqual(body.subscribedSymbols, []);
    assert.deepStrictEqual(body.activePollers, []);
  } finally {
    await h.scheduler.stop();
    await h.control.stop();
    h.cleanup();
  }
});

test('POST /reload calls scheduler.reload()', async () => {
  const h = build();
  let reloads = 0;
  // Wrap reload to count without breaking the real implementation.
  const orig = h.scheduler.reload.bind(h.scheduler);
  h.scheduler.reload = async () => {
    reloads++;
    return orig();
  };
  try {
    const { port } = await h.control.start();
    const res = await fetch(`http://127.0.0.1:${port}/reload`, { method: 'POST' });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(reloads, 1);

    await fetch(`http://127.0.0.1:${port}/reload`, { method: 'POST' });
    assert.strictEqual(reloads, 2);
  } finally {
    await h.control.stop();
    h.cleanup();
  }
});

test('POST /test-fire/:id fires the notifier with a test event for the given rule', async () => {
  const h = build();
  try {
    const r = await h.store.create({
      name: 'BTC drop',
      category: 'price.threshold',
      enabled: true,
      oneShot: false,
      cooldownMs: 60_000,
      params: { symbol: 'BTCUSD', direction: 'below', threshold: '50000' },
    });
    const { port } = await h.control.start();
    const res = await fetch(
      `http://127.0.0.1:${port}/test-fire/${encodeURIComponent(r.id)}`,
      { method: 'POST' },
    );
    assert.strictEqual(res.status, 200);
    assert.strictEqual(h.fired.length, 1);
    assert.strictEqual(h.fired[0].ruleId, r.id);
    assert.match(h.fired[0].reason, /test/i);
  } finally {
    await h.control.stop();
    h.cleanup();
  }
});

test('POST /test-fire/:id returns 404 for unknown rule', async () => {
  const h = build();
  try {
    const { port } = await h.control.start();
    const res = await fetch(`http://127.0.0.1:${port}/test-fire/nope`, { method: 'POST' });
    assert.strictEqual(res.status, 404);
  } finally {
    await h.control.stop();
    h.cleanup();
  }
});

test('unknown route returns 404', async () => {
  const h = build();
  try {
    const { port } = await h.control.start();
    const res = await fetch(`http://127.0.0.1:${port}/whatever`);
    assert.strictEqual(res.status, 404);
  } finally {
    await h.control.stop();
    h.cleanup();
  }
});

test('handler does not crash if notifier throws — returns 502', async () => {
  const h = build();
  // Replace the control server's notifier with a thrower for this test.
  const orig = console.error;
  console.error = () => undefined;
  try {
    const r = await h.store.create({
      name: 'crash',
      category: 'price.threshold',
      enabled: true,
      oneShot: false,
      cooldownMs: 60_000,
      params: { symbol: 'BTCUSD', direction: 'below', threshold: '50000' },
    });
    // Patch the deps via a fresh control server pointing at the same store.
    const crashing = new ControlServer({
      scheduler: h.scheduler,
      store: h.store,
      notifier: () => {
        throw new Error('boom');
      },
    });
    const { port } = await crashing.start();
    try {
      const res = await fetch(
        `http://127.0.0.1:${port}/test-fire/${encodeURIComponent(r.id)}`,
        { method: 'POST' },
      );
      assert.strictEqual(res.status, 502);
    } finally {
      await crashing.stop();
    }
  } finally {
    h.cleanup();
    console.error = orig;
  }
});
