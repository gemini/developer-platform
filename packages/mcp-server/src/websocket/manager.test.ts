import test from 'node:test';
import assert from 'node:assert/strict';
import { WebSocketServer, type RawData } from 'ws';
import { WebSocketManager, toChannelSymbol } from './manager.js';
import { config } from '../config.js';
import type { MarketDataStore } from '../store/index.js';
import type { CachedContractStatus, CachedOrderUpdate } from '../types/websocket.js';

// Shared by the wire-level contractStatus tests below: the server sends its
// fixture synchronously right after acking the subscribe request, so it may
// already be in the store by the time subscribeContractStatus() resolves —
// check directly first, and only fall back to waiting on the next onUpdate
// (with a bounded timeout, so a real regression fails fast instead of
// hanging) if it genuinely hasn't arrived yet.
function waitForContractStatus(
  store: MarketDataStore,
  symbol: string,
  timeoutMs = 2000
): Promise<CachedContractStatus | undefined> {
  const existing = store.getContractStatus(symbol);
  if (existing) return Promise.resolve(existing);

  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      stop();
      resolve(undefined);
    }, timeoutMs);
    const stop = store.onUpdate(symbol, (event) => {
      if (event.kind !== 'contractStatus') return;
      clearTimeout(timer);
      stop();
      resolve(store.getContractStatus(symbol));
    });
  });
}

// Same reasoning as waitForContractStatus, for the order-update wire tests.
function waitForOrder(
  store: MarketDataStore,
  orderId: string,
  timeoutMs = 2000
): Promise<CachedOrderUpdate | undefined> {
  const existing = store.getOrder(orderId);
  if (existing) return Promise.resolve(existing);

  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      stop();
      resolve(undefined);
    }, timeoutMs);
    const stop = store.onOrderUpdate(orderId, (update) => {
      clearTimeout(timer);
      stop();
      resolve(update);
    });
  });
}

test('toChannelSymbol preserves case and hyphens for prediction-market symbols', () => {
  assert.strictEqual(toChannelSymbol('GEMI-PRES2028-VANCE'), 'GEMI-PRES2028-VANCE');
  assert.strictEqual(toChannelSymbol('gemi-pres2028-vance'), 'GEMI-PRES2028-VANCE');
});

test('toChannelSymbol lowercases spot symbols', () => {
  assert.strictEqual(toChannelSymbol('BTCUSD'), 'btcusd');
  assert.strictEqual(toChannelSymbol('EthUsd'), 'ethusd');
});

async function withEchoServer(run: (manager: WebSocketManager, receivedParams: string[]) => Promise<void>): Promise<void> {
  const receivedParams: string[] = [];
  const wss = new WebSocketServer({ port: 0 });
  await new Promise<void>((resolve) => wss.once('listening', resolve));

  wss.on('connection', (socket) => {
    socket.on('message', (data: RawData) => {
      const msg = JSON.parse(data.toString()) as { id: string; params: string[] };
      receivedParams.push(...msg.params);
      socket.send(JSON.stringify({ id: msg.id, result: msg.params }));
    });
  });

  const { port } = wss.address() as { port: number };
  const manager = new WebSocketManager(`ws://localhost:${port}`);

  try {
    await manager.initialize();
    await run(manager, receivedParams);
  } finally {
    manager.disconnect();
    await new Promise<void>((resolve, reject) => wss.close((err) => (err ? reject(err) : resolve())));
  }
}

test('subscribe() sends the wire channel name with correct casing for spot vs prediction symbols', async () => {
  await withEchoServer(async (manager, receivedParams) => {
    await manager.subscribe('GEMI-PRES2028-VANCE', 'bookTicker');
    await manager.subscribe('BTCUSD', 'bookTicker');

    assert.ok(receivedParams.includes('GEMI-PRES2028-VANCE@bookTicker'));
    assert.ok(receivedParams.includes('btcusd@bookTicker'));
  });
});

test('subscribeContractStatus() sends the literal global channel name, with no symbol prefix', async () => {
  await withEchoServer(async (manager, receivedParams) => {
    await manager.subscribeContractStatus();

    assert.deepStrictEqual(receivedParams, ['contractStatus']);
  });
});

test('subscribeContractStatus() is idempotent — a second call does not re-subscribe over the wire', async () => {
  await withEchoServer(async (manager, receivedParams) => {
    await manager.subscribeContractStatus();
    await manager.subscribeContractStatus();

    assert.deepStrictEqual(receivedParams, ['contractStatus']);
  });
});

test('subscribeContractStatus() deduplicates truly concurrent callers', async () => {
  await withEchoServer(async (manager, receivedParams) => {
    // Both calls start before either has awaited anything, so both would
    // observe "not subscribed yet" without the pendingSubscriptions guard —
    // this is the race the fix in subscribeOnce() targets, distinct from
    // the sequential idempotency case above.
    await Promise.all([manager.subscribeContractStatus(), manager.subscribeContractStatus()]);

    assert.deepStrictEqual(receivedParams, ['contractStatus']);
  });
});

test('a real contractStatus wire message lands in the store with the contract ID intact', async () => {
  const wss = new WebSocketServer({ port: 0 });
  await new Promise<void>((resolve) => wss.once('listening', resolve));

  // 17-18 digit contract IDs exceed Number.MAX_SAFE_INTEGER. Built as a raw
  // string, not a JS numeric literal — `145828833218573125` as source code
  // would itself get rounded by V8 at parse time, before it's even sent.
  const BIG_CONTRACT_ID = '145828833218573125';

  wss.on('connection', (socket) => {
    socket.on('message', (data: RawData) => {
      const msg = JSON.parse(data.toString()) as { id: string; params: string[] };
      socket.send(JSON.stringify({ id: msg.id, result: msg.params }));
      socket.send(
        `{"e":"contractStatus","E":1700000000000,"s":"GEMI-PRES2028-VANCE",` +
          `"k":"PRES2028","c":"GEMI-PRES2028-VANCE","i":${BIG_CONTRACT_ID},` +
          `"p":"0.50","o":"active","n":"settled"}`
      );
    });
  });

  const { port } = wss.address() as { port: number };
  const manager = new WebSocketManager(`ws://localhost:${port}`);
  const beforeIngestion = Date.now();

  try {
    await manager.initialize();
    await manager.subscribeContractStatus();

    const store = manager.getStore();
    const status = await waitForContractStatus(store, 'GEMI-PRES2028-VANCE');

    const afterIngestion = Date.now();
    const { timestamp, ...rest } = status as CachedContractStatus;

    assert.deepStrictEqual(rest, {
      symbol: 'GEMI-PRES2028-VANCE',
      eventTicker: 'PRES2028',
      contractTicker: 'GEMI-PRES2028-VANCE',
      contractId: BIG_CONTRACT_ID,
      previousStatus: 'active',
      newStatus: 'settled',
      strikePrice: '0.50',
      eventTimeMs: 1_700_000_000_000,
    });
    // `timestamp` is our own receipt-time bookkeeping (set via Date.now() at
    // ingestion), distinct from the exchange's `eventTimeMs` — assert it
    // against a real bound instead of comparing the object to itself.
    assert.ok(timestamp >= beforeIngestion && timestamp <= afterIngestion);
  } finally {
    manager.disconnect();
    await new Promise<void>((resolve, reject) => wss.close((err) => (err ? reject(err) : resolve())));
  }
});

test('a contractStatus wire message without a strike price leaves strikePrice unset', async () => {
  const wss = new WebSocketServer({ port: 0 });
  await new Promise<void>((resolve) => wss.once('listening', resolve));

  wss.on('connection', (socket) => {
    socket.on('message', (data: RawData) => {
      const msg = JSON.parse(data.toString()) as { id: string; params: string[] };
      socket.send(JSON.stringify({ id: msg.id, result: msg.params }));
      // A real settlement event omits `p` entirely — only strike-setting
      // events (and some contract types) carry a strike price.
      socket.send('{"e":"contractStatus","E":1700000000000,"s":"GEMI-NOSTRIKE","k":"NS","c":"GEMI-NOSTRIKE","i":2,"o":"active","n":"settled"}');
    });
  });

  const { port } = wss.address() as { port: number };
  const manager = new WebSocketManager(`ws://localhost:${port}`);

  try {
    await manager.initialize();
    await manager.subscribeContractStatus();

    const store = manager.getStore();
    const status = await waitForContractStatus(store, 'GEMI-NOSTRIKE');

    assert.strictEqual(status?.newStatus, 'settled');
    assert.strictEqual(status?.strikePrice, undefined);
  } finally {
    manager.disconnect();
    await new Promise<void>((resolve, reject) => wss.close((err) => (err ? reject(err) : resolve())));
  }
});

function withCredentials(apiKey: string, apiSecret: string, run: () => Promise<void>): Promise<void> {
  const saved = { key: config.apiKey, secret: config.apiSecret };
  config.apiKey = apiKey;
  config.apiSecret = apiSecret;
  return run().finally(() => {
    config.apiKey = saved.key;
    config.apiSecret = saved.secret;
  });
}

test('subscribeAccountOrders() sends the literal global channel name, with no symbol prefix', async () => {
  await withCredentials('test-key', 'test-secret', () =>
    withEchoServer(async (manager, receivedParams) => {
      await manager.subscribeAccountOrders();
      assert.deepStrictEqual(receivedParams, ['orders@account']);
    })
  );
});

test('subscribeAccountOrders() throws clearly, without touching the wire, when credentials are not configured', async () => {
  await withCredentials('', '', () =>
    withEchoServer(async (manager, receivedParams) => {
      await assert.rejects(() => manager.subscribeAccountOrders(), /GEMINI_API_KEY and GEMINI_API_SECRET/);
      assert.deepStrictEqual(receivedParams, []);
    })
  );
});

test('subscribeAccountOrders() deduplicates truly concurrent callers', async () => {
  await withCredentials('test-key', 'test-secret', () =>
    withEchoServer(async (manager, receivedParams) => {
      await Promise.all([manager.subscribeAccountOrders(), manager.subscribeAccountOrders()]);
      assert.deepStrictEqual(receivedParams, ['orders@account']);
    })
  );
});

test('a fill-shaped orderUpdate wire message lands in the order store, not the trade store', async () => {
  const BIG_ORDER_ID = '145828833218573125'; // exceeds Number.MAX_SAFE_INTEGER
  const BIG_TRADE_ID = '298374652910473625';
  // Order events use nanosecond timestamps, same convention as trade/
  // bookTicker/depth/ticker — confirmed against the live AsyncAPI spec,
  // sdk-typescript's runtime validator, and directly against real
  // production data captured during manual testing for this ticket (a raw
  // E of ~1.79e18 converted to a correct, present-day eventTimeMs). Using a
  // realistic 19-digit nanosecond value here, not a misleadingly small
  // ms-shaped one, so this test's own fixture can't be misread as evidence
  // that E is milliseconds.
  const NANOS_E = '1789420240479000000';
  const expectedEventTimeMs = Math.floor(Number(NANOS_E) / 1_000_000);

  await withCredentials('test-key', 'test-secret', async () => {
    const wss = new WebSocketServer({ port: 0 });
    await new Promise<void>((resolve) => wss.once('listening', resolve));

    wss.on('connection', (socket) => {
      socket.on('message', (data: RawData) => {
        const msg = JSON.parse(data.toString()) as { id: string; params: string[] };
        socket.send(JSON.stringify({ id: msg.id, result: msg.params }));
        // A fill event: e:'orderUpdate' but ALSO carries t/q/m — the exact
        // fields isTradeMessage duck-types on. This is the end-to-end proof
        // that the ordering fix in handleMessage actually holds, not just
        // the isOrderUpdateMessage guard in isolation.
        socket.send(
          `{"e":"orderUpdate","E":${NANOS_E},"T":${NANOS_E},` +
            `"s":"GEMI-PRES2028-VANCE","i":${BIG_ORDER_ID},"c":"my-client-id",` +
            `"S":"BUY","o":"LIMIT","X":"FILLED","O":"YES","p":"0.27","q":"100",` +
            `"z":"0","Z":"100","L":"0.27","t":${BIG_TRADE_ID},"n":"0.01","m":true}`
        );
      });
    });

    const { port } = wss.address() as { port: number };
    const manager = new WebSocketManager(`ws://localhost:${port}`);

    try {
      await manager.initialize();
      await manager.subscribeAccountOrders();

      const store = manager.getStore();
      const order = await waitForOrder(store, BIG_ORDER_ID);

      assert.ok(order, 'order update must have been captured');
      assert.strictEqual(order?.orderId, BIG_ORDER_ID);
      assert.strictEqual(order?.tradeId, BIG_TRADE_ID);
      assert.strictEqual(order?.status, 'FILLED');
      assert.strictEqual(order?.outcome, 'YES');
      assert.strictEqual(order?.symbol, 'GEMI-PRES2028-VANCE');
      assert.strictEqual(order?.isMaker, true);
      assert.strictEqual(order?.eventTimeMs, expectedEventTimeMs);
      // Sanity bound proving this is genuinely millisecond-scale (sometime
      // after 2001), not the raw nanosecond value passed through unconverted.
      assert.ok(order!.eventTimeMs > 1_000_000_000_000 && order!.eventTimeMs < 10_000_000_000_000);

      // The actual regression check: this must NOT have also landed in the
      // trade/price cache via isTradeMessage's duck-typed match.
      assert.strictEqual(store.getTrades('GEMI-PRES2028-VANCE').length, 0);
      assert.strictEqual(store.getPrice('GEMI-PRES2028-VANCE'), undefined);
    } finally {
      manager.disconnect();
      await new Promise<void>((resolve, reject) => wss.close((err) => (err ? reject(err) : resolve())));
    }
  });
});

test('a canceled orderUpdate wire message is captured with its reject reason', async () => {
  // The only other manager-level order fixture is a FILLED event — this
  // covers the non-fill terminal case (CANCELED, with a reject/cancel
  // reason and nothing executed) so a regression that drops `r` or
  // mishandles a terminal state without a fill wouldn't pass unnoticed.
  await withCredentials('test-key', 'test-secret', async () => {
    const wss = new WebSocketServer({ port: 0 });
    await new Promise<void>((resolve) => wss.once('listening', resolve));

    wss.on('connection', (socket) => {
      socket.on('message', (data: RawData) => {
        const msg = JSON.parse(data.toString()) as { id: string; params: string[] };
        socket.send(JSON.stringify({ id: msg.id, result: msg.params }));
        socket.send(
          '{"e":"orderUpdate","E":1789420240479000000,"T":1789420240479000000,' +
            '"s":"GEMI-CANCEL-CHECK","i":2,"S":"BUY","o":"LIMIT","X":"CANCELED",' +
            '"O":"YES","p":"0.01","q":"1","z":"1","Z":"0","r":"Requested"}'
        );
      });
    });

    const { port } = wss.address() as { port: number };
    const manager = new WebSocketManager(`ws://localhost:${port}`);

    try {
      await manager.initialize();
      await manager.subscribeAccountOrders();

      const store = manager.getStore();
      const order = await waitForOrder(store, '2');

      assert.ok(order, 'order update must have been captured');
      assert.strictEqual(order?.status, 'CANCELED');
      assert.strictEqual(order?.rejectReason, 'Requested');
      assert.strictEqual(order?.remainingQty, '1');
      assert.strictEqual(order?.executedQty, '0');
      assert.strictEqual(order?.tradeId, undefined);
    } finally {
      manager.disconnect();
      await new Promise<void>((resolve, reject) => wss.close((err) => (err ? reject(err) : resolve())));
    }
  });
});
