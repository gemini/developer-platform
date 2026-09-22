import test from 'node:test';
import assert from 'node:assert/strict';
import { WebSocketServer, type RawData } from 'ws';
import { WebSocketManager, toChannelSymbol, toEventTimeMs } from './manager.js';
import { config } from '../config.js';
import type { MarketDataStore } from '../store/index.js';
import type { CachedContractStatus, CachedOrderUpdate } from '../types/websocket.js';
import type { SdkClient } from '../client/sdk.js';

// Shared by the contractStatus/orders@account tests below: the fake stream
// resolves its `ready` promise (and, for the message tests, delivers its
// fixture frame) synchronously once subscribed — so the update may already
// be in the store by the time subscribeContractStatus()/
// subscribeAccountOrders() resolves. Check directly first, and only fall
// back to waiting on the next onUpdate (with a bounded timeout, so a real
// regression fails fast instead of hanging) if it genuinely hasn't arrived
// yet.
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

// Same reasoning as waitForContractStatus, for the order-update tests.
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

test('toEventTimeMs divides a nanosecond-scale value, matching real production traffic', () => {
  // ~1.79e18 — the actual magnitude captured live during manual testing for
  // this PR, which converts to a correct, present-day millisecond timestamp.
  assert.strictEqual(toEventTimeMs(1_789_420_240_479_000_000), 1_789_420_240_479);
});

test('toEventTimeMs leaves a millisecond-scale value unchanged', () => {
  // The exact fixture value a review cited as evidence order events use
  // milliseconds. Whether or not real traffic ever actually sends this
  // shape, a value at this magnitude is used as-is rather than divided —
  // dividing it would produce a nonsense January-1970 timestamp.
  assert.strictEqual(toEventTimeMs(1_710_000_000_000), 1_710_000_000_000);
});

// ---------------------------------------------------------------------------
// Fake SDK client / WebSocketStream test double.
//
// PREDICT-8823 moved subscribeContractStatus()/subscribeAccountOrders() off
// the legacy hand-rolled GeminiWebSocketClient onto the SDK's
// `client.websocket.public.contractStatus()` /
// `client.websocket.private.orders({scope:'account'})` streams. Those
// streams are already built, tested and covered (reconnect/backoff/
// message-limit/integer-safety) in the SDK's own websocket.test.ts — this
// file only needs a minimal double satisfying the surface
// WebSocketManager actually consumes: `.on('message', cb)` and `.ready`
// (awaited to know the subscribe ack landed) plus `.close()` (called from
// WebSocketManager.disconnect()).
// ---------------------------------------------------------------------------

class FakeWebSocketStream<T> {
  readonly ready: Promise<{ result: null }>;
  private resolveReady!: () => void;
  private rejectReady!: (err: Error) => void;
  private messageHandlers: Array<(msg: T) => void> = [];
  closed = false;

  constructor() {
    this.ready = new Promise((resolve, reject) => {
      this.resolveReady = () => resolve({ result: null });
      this.rejectReady = reject;
    });
  }

  on(event: 'message', cb: (msg: T) => void): this {
    if (event === 'message') this.messageHandlers.push(cb);
    return this;
  }

  off(): this {
    return this;
  }

  close(): Promise<void> {
    this.closed = true;
    return Promise.resolve();
  }

  /** Test helper: simulate the subscribe ack landing. */
  ackReady(): void {
    this.resolveReady();
  }

  /** Test helper: simulate the subscribe being rejected by the exchange/SDK. */
  failReady(err: Error): void {
    this.rejectReady(err);
  }

  /** Test helper: simulate a pushed frame. */
  emitMessage(msg: T): void {
    for (const handler of this.messageHandlers) handler(msg);
  }
}

interface FakeSdk {
  sdkClient: SdkClient;
  contractStatusStreams: FakeWebSocketStream<unknown>[];
  orderStreams: FakeWebSocketStream<unknown>[];
}

// By default the fake ack's the subscribe on the next microtask, mirroring
// a real subscribe ack arriving asynchronously over the wire.
function createFakeSdkClient(options?: { autoAck?: boolean }): FakeSdk {
  const autoAck = options?.autoAck ?? true;
  const contractStatusStreams: FakeWebSocketStream<unknown>[] = [];
  const orderStreams: FakeWebSocketStream<unknown>[] = [];

  const sdkClient = {
    websocket: {
      public: {
        contractStatus: () => {
          const stream = new FakeWebSocketStream<unknown>();
          contractStatusStreams.push(stream);
          if (autoAck) queueMicrotask(() => stream.ackReady());
          return stream;
        },
      },
      private: {
        orders: () => {
          const stream = new FakeWebSocketStream<unknown>();
          orderStreams.push(stream);
          if (autoAck) queueMicrotask(() => stream.ackReady());
          return stream;
        },
      },
    },
  } as unknown as SdkClient;

  return { sdkClient, contractStatusStreams, orderStreams };
}

test('subscribe() sends the wire channel name with correct casing for spot vs prediction symbols', async () => {
  // subscribe()/subscribeMultiple() still go through the legacy wire client —
  // untouched by this migration — so this test keeps a real echo server.
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
  const { sdkClient } = createFakeSdkClient();
  const manager = new WebSocketManager(`ws://localhost:${port}`, sdkClient);

  try {
    await manager.initialize();
    await manager.subscribe('GEMI-PRES2028-VANCE', 'bookTicker');
    await manager.subscribe('BTCUSD', 'bookTicker');

    assert.ok(receivedParams.includes('GEMI-PRES2028-VANCE@bookTicker'));
    assert.ok(receivedParams.includes('btcusd@bookTicker'));
  } finally {
    manager.disconnect();
    await new Promise<void>((resolve, reject) => wss.close((err) => (err ? reject(err) : resolve())));
  }
});

test('subscribeContractStatus() subscribes exactly once through the SDK public stream', async () => {
  const { sdkClient, contractStatusStreams } = createFakeSdkClient();
  const manager = new WebSocketManager('unused', sdkClient);

  await manager.subscribeContractStatus();

  assert.strictEqual(contractStatusStreams.length, 1);
  assert.deepStrictEqual(manager.getState().subscriptions, ['contractStatus']);
});

test('subscribeContractStatus() is idempotent — a second call does not open a second SDK stream', async () => {
  const { sdkClient, contractStatusStreams } = createFakeSdkClient();
  const manager = new WebSocketManager('unused', sdkClient);

  await manager.subscribeContractStatus();
  await manager.subscribeContractStatus();

  assert.strictEqual(contractStatusStreams.length, 1);
});

test('subscribeContractStatus() deduplicates truly concurrent callers', async () => {
  const { sdkClient, contractStatusStreams } = createFakeSdkClient();
  const manager = new WebSocketManager('unused', sdkClient);

  // Both calls start before either has awaited anything, so both would
  // observe "not subscribed yet" without the pendingSubscriptions guard —
  // this is the race the fix in subscribeOnce() targets, distinct from the
  // sequential idempotency case above.
  await Promise.all([manager.subscribeContractStatus(), manager.subscribeContractStatus()]);

  assert.strictEqual(contractStatusStreams.length, 1);
});

test('an SDK contractStatus frame lands in the store with the contract ID intact', async () => {
  // 17-18 digit contract IDs exceed Number.MAX_SAFE_INTEGER. The SDK's own
  // lossless parser hands these back as `bigint`, not `number` — modeled
  // here as a real bigint, not a numeric literal, since a JS literal at
  // this magnitude would itself round at parse time before we even get to
  // the adapter under test.
  const BIG_CONTRACT_ID = 145828833218573125n;

  const { sdkClient, contractStatusStreams } = createFakeSdkClient();
  const manager = new WebSocketManager('unused', sdkClient);
  const beforeIngestion = Date.now();

  await manager.subscribeContractStatus();
  contractStatusStreams[0]!.emitMessage({
    e: 'contractStatus',
    E: 1_700_000_000_000,
    s: 'GEMI-PRES2028-VANCE',
    k: 'PRES2028',
    c: 'GEMI-PRES2028-VANCE',
    i: BIG_CONTRACT_ID,
    p: '0.50',
    o: 'active',
    n: 'settled',
  });

  const store = manager.getStore();
  const status = await waitForContractStatus(store, 'GEMI-PRES2028-VANCE');
  const afterIngestion = Date.now();
  const { timestamp, ...rest } = status as CachedContractStatus;

  assert.deepStrictEqual(rest, {
    symbol: 'GEMI-PRES2028-VANCE',
    eventTicker: 'PRES2028',
    contractTicker: 'GEMI-PRES2028-VANCE',
    contractId: '145828833218573125',
    previousStatus: 'active',
    newStatus: 'settled',
    strikePrice: '0.50',
    eventTimeMs: 1_700_000_000_000,
  });
  // `timestamp` is our own receipt-time bookkeeping (set via Date.now() at
  // ingestion), distinct from the exchange's `eventTimeMs` — assert it
  // against a real bound instead of comparing the object to itself.
  assert.ok(timestamp >= beforeIngestion && timestamp <= afterIngestion);
});

test('an SDK contractStatus frame without a strike price leaves strikePrice unset', async () => {
  const { sdkClient, contractStatusStreams } = createFakeSdkClient();
  const manager = new WebSocketManager('unused', sdkClient);

  await manager.subscribeContractStatus();
  // A real settlement event omits `p` entirely — only strike-setting events
  // (and some contract types) carry a strike price.
  contractStatusStreams[0]!.emitMessage({
    e: 'contractStatus',
    E: 1_700_000_000_000,
    s: 'GEMI-NOSTRIKE',
    k: 'NS',
    c: 'GEMI-NOSTRIKE',
    i: 2,
    o: 'active',
    n: 'settled',
  });

  const store = manager.getStore();
  const status = await waitForContractStatus(store, 'GEMI-NOSTRIKE');

  assert.strictEqual(status?.newStatus, 'settled');
  assert.strictEqual(status?.strikePrice, undefined);
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

test('subscribeAccountOrders() subscribes exactly once through the SDK private stream', async () => {
  await withCredentials('test-key', 'test-secret', async () => {
    const { sdkClient, orderStreams } = createFakeSdkClient();
    const manager = new WebSocketManager('unused', sdkClient);

    await manager.subscribeAccountOrders();

    assert.strictEqual(orderStreams.length, 1);
    assert.deepStrictEqual(manager.getState().subscriptions, ['orders@account']);
  });
});

test('subscribeAccountOrders() throws clearly, without touching the SDK, when credentials are not configured', async () => {
  await withCredentials('', '', async () => {
    const { sdkClient, orderStreams } = createFakeSdkClient();
    const manager = new WebSocketManager('unused', sdkClient);

    await assert.rejects(() => manager.subscribeAccountOrders(), /GEMINI_API_KEY and GEMINI_API_SECRET/);
    assert.strictEqual(orderStreams.length, 0);
  });
});

test('subscribeAccountOrders() deduplicates truly concurrent callers', async () => {
  await withCredentials('test-key', 'test-secret', async () => {
    const { sdkClient, orderStreams } = createFakeSdkClient();
    const manager = new WebSocketManager('unused', sdkClient);

    await Promise.all([manager.subscribeAccountOrders(), manager.subscribeAccountOrders()]);

    assert.strictEqual(orderStreams.length, 1);
  });
});

test('a fill-shaped SDK orderUpdate frame lands in the order store, not the trade store', async () => {
  // Both exceed Number.MAX_SAFE_INTEGER — modeled as real bigints, matching
  // what the SDK's lossless parser actually hands back for IDs at this
  // magnitude (see the contractStatus big-ID test above for why a numeric
  // literal here wouldn't prove anything).
  const BIG_ORDER_ID = 145828833218573125n;
  const BIG_TRADE_ID = 298374652910473625n;
  // Order events use nanosecond timestamps, same convention as trade/
  // bookTicker/depth/ticker — confirmed against the live AsyncAPI spec,
  // sdk-typescript's runtime validator, and directly against real
  // production data captured during manual testing for this ticket (a raw
  // E of ~1.79e18 converted to a correct, present-day eventTimeMs). Using a
  // realistic 19-digit nanosecond value here, not a misleadingly small
  // ms-shaped one, so this test's own fixture can't be misread as evidence
  // that E is milliseconds.
  const NANOS_E = 1_789_420_240_479_000_000n;
  const expectedEventTimeMs = Math.floor(Number(NANOS_E) / 1_000_000);

  await withCredentials('test-key', 'test-secret', async () => {
    const { sdkClient, orderStreams } = createFakeSdkClient();
    const manager = new WebSocketManager('unused', sdkClient);

    await manager.subscribeAccountOrders();

    // A fill event: e:'orderUpdate' but ALSO carries t/q/m — the exact
    // fields the legacy isTradeMessage guard duck-typed on. Proves the SDK
    // path still routes fills to the order store, not the trade store, now
    // that the discriminator-ordering fix in the old handleMessage no
    // longer applies (contractStatus/orderUpdate never reach handleMessage
    // at all any more).
    orderStreams[0]!.emitMessage({
      e: 'orderUpdate',
      E: NANOS_E,
      T: NANOS_E,
      s: 'GEMI-PRES2028-VANCE',
      i: BIG_ORDER_ID,
      c: 'my-client-id',
      S: 'BUY',
      o: 'LIMIT',
      X: 'FILLED',
      O: 'YES',
      p: '0.27',
      q: '100',
      z: '0',
      Z: '100',
      L: '0.27',
      t: BIG_TRADE_ID,
      n: '0.01',
      m: true,
    });

    const store = manager.getStore();
    const order = await waitForOrder(store, '145828833218573125');

    assert.ok(order, 'order update must have been captured');
    assert.strictEqual(order?.orderId, '145828833218573125');
    assert.strictEqual(order?.tradeId, '298374652910473625');
    assert.strictEqual(order?.status, 'FILLED');
    assert.strictEqual(order?.outcome, 'YES');
    assert.strictEqual(order?.symbol, 'GEMI-PRES2028-VANCE');
    assert.strictEqual(order?.isMaker, true);
    assert.strictEqual(order?.eventTimeMs, expectedEventTimeMs);
    // Sanity bound proving this is genuinely millisecond-scale (sometime
    // after 2001), not the raw nanosecond value passed through unconverted.
    assert.ok(order!.eventTimeMs > 1_000_000_000_000 && order!.eventTimeMs < 10_000_000_000_000);

    // The actual regression check: this must NOT have also landed in the
    // trade/price cache.
    assert.strictEqual(store.getTrades('GEMI-PRES2028-VANCE').length, 0);
    assert.strictEqual(store.getPrice('GEMI-PRES2028-VANCE'), undefined);
  });
});

test('a canceled SDK orderUpdate frame is captured with its reject reason', async () => {
  // The only other manager-level order fixture is a FILLED event — this
  // covers the non-fill terminal case (CANCELED, with a reject/cancel
  // reason and nothing executed) so a regression that drops `r` or
  // mishandles a terminal state without a fill wouldn't pass unnoticed.
  await withCredentials('test-key', 'test-secret', async () => {
    const { sdkClient, orderStreams } = createFakeSdkClient();
    const manager = new WebSocketManager('unused', sdkClient);

    await manager.subscribeAccountOrders();

    orderStreams[0]!.emitMessage({
      e: 'orderUpdate',
      E: 1_789_420_240_479_000_000n,
      T: 1_789_420_240_479_000_000n,
      s: 'GEMI-CANCEL-CHECK',
      i: 2,
      S: 'BUY',
      o: 'LIMIT',
      X: 'CANCELED',
      O: 'YES',
      p: '0.01',
      q: '1',
      z: '1',
      Z: '0',
      r: 'Requested',
    });

    const store = manager.getStore();
    const order = await waitForOrder(store, '2');

    assert.ok(order, 'order update must have been captured');
    assert.strictEqual(order?.status, 'CANCELED');
    assert.strictEqual(order?.rejectReason, 'Requested');
    assert.strictEqual(order?.remainingQty, '1');
    assert.strictEqual(order?.executedQty, '0');
    assert.strictEqual(order?.tradeId, undefined);
  });
});

test('subscribeContractStatus() propagates a rejected subscribe ack and does not record a subscription', async () => {
  const { sdkClient, contractStatusStreams } = createFakeSdkClient({ autoAck: false });
  const manager = new WebSocketManager('unused', sdkClient);

  const attempt = manager.subscribeContractStatus();
  contractStatusStreams[0]!.failReady(new Error('subscribe rejected with status 400'));

  await assert.rejects(() => attempt, /subscribe rejected with status 400/);
  assert.deepStrictEqual(manager.getState().subscriptions, []);

  // A retry after the failure must open a fresh stream rather than being
  // treated as already subscribed or stuck on the failed pending promise.
  const retry = manager.subscribeContractStatus();
  contractStatusStreams[1]!.ackReady();
  await retry;
  assert.strictEqual(contractStatusStreams.length, 2);
  assert.deepStrictEqual(manager.getState().subscriptions, ['contractStatus']);
});
