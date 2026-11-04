import test from 'node:test';
import assert from 'node:assert/strict';
import { HmacAuth } from '@gemini-markets/sdk/server';
import { config } from '../../config.js';
import { createSdkClient, type SdkClient } from '../../client/sdk.js';
import * as predictions from './orders.js';

type Fn =
  | 'placeOrder'
  | 'cancelOrder'
  | 'placeOrderBatch'
  | 'cancelOrderBatch'
  | 'getActiveOrders'
  | 'getOrderHistory';

interface Call {
  fn: Fn;
  input: unknown;
}

// A fake SDK client that records exactly what each datasource function passed to it.
// Responses are what the SDK itself returns: int64 orderIds already decoded to bigint.
function fakeClient(responses: Partial<Record<Fn, unknown>> = {}) {
  const calls: Call[] = [];
  const method = (fn: Fn, fallback: unknown) => async (input?: unknown) => {
    calls.push({ fn, input });
    return responses[fn] ?? fallback;
  };
  const client = {
    predictions: {
      placeOrder: method('placeOrder', { orderId: 1n }),
      cancelOrder: method('cancelOrder', { result: 'ok', message: 'cancelled' }),
      placeOrderBatch: method('placeOrderBatch', { results: [] }),
      cancelOrderBatch: method('cancelOrderBatch', { results: [] }),
      getActiveOrders: method('getActiveOrders', { orders: [], pagination: { limit: 50, offset: 0 } }),
      getOrderHistory: method('getOrderHistory', { orders: [], pagination: { limit: 50, offset: 0 } }),
    },
  } as unknown as SdkClient;
  return { client, calls };
}

async function withAccount<T>(account: string, fn: () => Promise<T>): Promise<T> {
  const saved = config.account;
  config.account = account;
  try {
    return await fn();
  } finally {
    config.account = saved;
  }
}

const baseOrder = {
  symbol: 'GEMI-PRES2028-VANCE',
  side: 'buy' as const,
  outcome: 'yes' as const,
  quantity: '10',
  price: '0.42',
};

// ----------------------------------------------------------------------------
// What each function passes to the SDK
// ----------------------------------------------------------------------------

test('placeOrder sends a limit order with makerOrCancel: false and no timeInForce by default', async () => {
  const { client, calls } = fakeClient();

  await withAccount('', () => predictions.placeOrder(client, baseOrder));

  assert.deepStrictEqual(calls, [
    {
      fn: 'placeOrder',
      input: { ...baseOrder, orderType: 'limit', makerOrCancel: false },
    },
  ]);
});

test('placeOrder forwards a supported timeInForce unchanged', async () => {
  const { client, calls } = fakeClient();

  await withAccount('', () => predictions.placeOrder(client, { ...baseOrder, timeInForce: 'fill-or-kill' }));

  assert.deepStrictEqual(calls[0]!.input, {
    ...baseOrder,
    orderType: 'limit',
    timeInForce: 'fill-or-kill',
    makerOrCancel: false,
  });
});

test('placeOrder maps timeInForce maker-or-cancel onto the SDK makerOrCancel flag', async () => {
  const { client, calls } = fakeClient();

  await withAccount('', () => predictions.placeOrder(client, { ...baseOrder, timeInForce: 'maker-or-cancel' }));

  const input = calls[0]!.input as Record<string, unknown>;
  assert.strictEqual(input['makerOrCancel'], true);
  assert.strictEqual('timeInForce' in input, false, 'the SDK rejects timeInForce: maker-or-cancel');
});

test('cancelOrder converts an 18-digit orderId to an exact bigint, never Number()', async () => {
  const { client, calls } = fakeClient();

  await withAccount('', () => predictions.cancelOrder(client, '145828833218573125'));

  assert.deepStrictEqual(calls[0]!.input, { orderId: 145828833218573125n });
});

test('placeOrderBatch maps every order and preserves request order', async () => {
  const { client, calls } = fakeClient();

  await withAccount('', () =>
    predictions.placeOrderBatch(client, [
      { ...baseOrder, symbol: 'GEMI-A' },
      { ...baseOrder, symbol: 'GEMI-B', timeInForce: 'immediate-or-cancel' },
      { ...baseOrder, symbol: 'GEMI-C', timeInForce: 'maker-or-cancel' },
    ])
  );

  assert.deepStrictEqual(calls[0]!.input, {
    orders: [
      { ...baseOrder, symbol: 'GEMI-A', orderType: 'limit', makerOrCancel: false },
      {
        ...baseOrder,
        symbol: 'GEMI-B',
        orderType: 'limit',
        timeInForce: 'immediate-or-cancel',
        makerOrCancel: false,
      },
      { ...baseOrder, symbol: 'GEMI-C', orderType: 'limit', makerOrCancel: true },
    ],
  });
});

test('cancelOrderBatch passes orderId strings through unchanged', async () => {
  const { client, calls } = fakeClient();

  await withAccount('', () => predictions.cancelOrderBatch(client, ['111', '145828833218573125']));

  assert.deepStrictEqual(calls[0]!.input, { orderIds: ['111', '145828833218573125'] });
});

test('getActiveOrders sends only the filters that are set', async () => {
  const { client, calls } = fakeClient();

  await withAccount('', async () => {
    await predictions.getActiveOrders(client);
    await predictions.getActiveOrders(client, { symbol: '', limit: 10, offset: 0 });
    await predictions.getActiveOrders(client, { symbol: 'GEMI-A' });
  });

  assert.deepStrictEqual(
    calls.map((c) => c.input),
    [{}, { limit: 10, offset: 0 }, { symbol: 'GEMI-A' }]
  );
});

test('getOrderHistory sends only the filters that are set', async () => {
  const { client, calls } = fakeClient();

  await withAccount('', async () => {
    await predictions.getOrderHistory(client);
    await predictions.getOrderHistory(client, { status: 'cancelled', symbol: 'GEMI-A', limit: 5, offset: 10 });
  });

  assert.deepStrictEqual(
    calls.map((c) => c.input),
    [{}, { status: 'cancelled', symbol: 'GEMI-A', limit: 5, offset: 10 }]
  );
});

// ----------------------------------------------------------------------------
// Sub-account scope — the legacy client added GEMINI_ACCOUNT to every signed body
// ----------------------------------------------------------------------------

test('every order call adds config.account when GEMINI_ACCOUNT is set', async () => {
  const { client, calls } = fakeClient();

  await withAccount('sub-account-1', async () => {
    await predictions.placeOrder(client, baseOrder);
    await predictions.cancelOrder(client, '1');
    await predictions.placeOrderBatch(client, [baseOrder]);
    await predictions.cancelOrderBatch(client, ['1']);
    await predictions.getActiveOrders(client);
    await predictions.getOrderHistory(client);
  });

  assert.strictEqual(calls.length, 6);
  for (const call of calls) {
    assert.strictEqual((call.input as Record<string, unknown>)['account'], 'sub-account-1', call.fn);
  }
});

test('no order call adds an account when GEMINI_ACCOUNT is unset', async () => {
  const { client, calls } = fakeClient();

  await withAccount('', async () => {
    await predictions.placeOrder(client, baseOrder);
    await predictions.cancelOrder(client, '1');
    await predictions.getActiveOrders(client);
  });

  for (const call of calls) {
    assert.strictEqual('account' in (call.input as Record<string, unknown>), false, call.fn);
  }
});

// ----------------------------------------------------------------------------
// Response mapping — bigint orderIds become exact strings, everything else unchanged
// ----------------------------------------------------------------------------

test('placeOrder stringifies orderId and passes every other field through', async () => {
  const sdkOrder = {
    orderId: 145828833218573125n,
    hashOrderId: 'h1',
    status: 'open',
    symbol: 'GEMI-A',
    side: 'buy',
    outcome: 'yes',
    orderType: 'limit',
    quantity: '10',
    filledQuantity: '0',
    remainingQuantity: '10',
    price: '0.42',
    avgExecutionPrice: null,
    createdAt: '2026-01-01T00:00:00Z',
  };
  const { client } = fakeClient({ placeOrder: sdkOrder });

  const result = await withAccount('', () => predictions.placeOrder(client, baseOrder));

  assert.deepStrictEqual(result, { ...sdkOrder, orderId: '145828833218573125' });
});

test('getActiveOrders stringifies every orderId and keeps pagination', async () => {
  const { client } = fakeClient({
    getActiveOrders: {
      orders: [
        { orderId: 145828833218573125n, symbol: 'GEMI-A' },
        { orderId: 145828833218573126n, symbol: 'GEMI-B' },
      ],
      pagination: { limit: 50, offset: 0, count: 2 },
    },
  });

  const result = await withAccount('', () => predictions.getActiveOrders(client));

  assert.deepStrictEqual(result, {
    orders: [
      { orderId: '145828833218573125', symbol: 'GEMI-A' },
      { orderId: '145828833218573126', symbol: 'GEMI-B' },
    ],
    pagination: { limit: 50, offset: 0, count: 2 },
  });
});

test('placeOrderBatch keeps mixed accepted and rejected results in request order', async () => {
  const { client } = fakeClient({
    placeOrderBatch: {
      results: [
        { order: { orderId: 145828833218573125n, status: 'open', symbol: 'GEMI-A' } },
        { error: 'InvalidPrice', message: 'price must be between 0.01 and 0.99' },
      ],
    },
  });

  const result = await withAccount('', () => predictions.placeOrderBatch(client, [baseOrder, baseOrder]));

  assert.deepStrictEqual(result, {
    results: [
      { order: { orderId: '145828833218573125', status: 'open', symbol: 'GEMI-A' } },
      { error: 'InvalidPrice', message: 'price must be between 0.01 and 0.99' },
    ],
  });
});

test('cancelOrderBatch stringifies orderId on both successful and rejected results', async () => {
  const { client } = fakeClient({
    cancelOrderBatch: {
      results: [
        { orderId: 145828833218573125n, result: 'ok' },
        { orderId: 222n, error: 'OrderNotFound', message: 'no open order with that ID' },
      ],
    },
  });

  const result = await withAccount('', () => predictions.cancelOrderBatch(client, ['145828833218573125', '222']));

  assert.deepStrictEqual(result, {
    results: [
      { orderId: '145828833218573125', result: 'ok' },
      { orderId: '222', error: 'OrderNotFound', message: 'no open order with that ID' },
    ],
  });
});

// ----------------------------------------------------------------------------
// Through the real SDK — proves what actually reaches the wire. A mocked SDK can't
// catch the SDK's own request validation or int64 serialization.
// ----------------------------------------------------------------------------

interface Captured {
  url: string;
  payload: Record<string, unknown>;
  body: string | undefined;
}

async function realClient(responseBody: string, status = 200) {
  const captured: Captured[] = [];
  const client = await createSdkClient({
    auth: new HmacAuth({ apiKey: 'test-key', apiSecret: 'test-secret', nonceMode: 'time-based' }),
    fetch: async (url, init) => {
      const headers = init.headers as Record<string, string>;
      captured.push({
        url,
        payload: JSON.parse(Buffer.from(headers['X-GEMINI-PAYLOAD']!, 'base64').toString('utf8')),
        body: init.body as string | undefined,
      });
      return new Response(responseBody, { status, headers: { 'Content-Type': 'application/json' } });
    },
  });
  return { client, captured };
}

test('real SDK: a maker-or-cancel order is accepted and sent as makerOrCancel: true', async () => {
  const { client, captured } = await realClient('{"orderId":1}', 201);

  await withAccount('', () => predictions.placeOrder(client, { ...baseOrder, timeInForce: 'maker-or-cancel' }));

  assert.strictEqual(captured.length, 1);
  assert.strictEqual(captured[0]!.url.endsWith('/v1/prediction-markets/order'), true);
  assert.strictEqual(captured[0]!.payload['makerOrCancel'], true);
  assert.strictEqual('timeInForce' in captured[0]!.payload, false);
  assert.deepStrictEqual(JSON.parse(captured[0]!.body!), {
    ...baseOrder,
    orderType: 'limit',
    makerOrCancel: true,
  });
});

test('real SDK: the old timeInForce maker-or-cancel value is rejected before sending (regression guard)', async () => {
  const { client, captured } = await realClient('{}');

  await assert.rejects(
    client.predictions.placeOrder({
      ...baseOrder,
      orderType: 'limit',
      // Deliberately the pre-migration wire value the SDK does not accept.
      timeInForce: 'maker-or-cancel' as 'good-til-cancel',
      makerOrCancel: false,
    }),
    /timeInForce/
  );
  assert.strictEqual(captured.length, 0, 'nothing should reach the network');
});

test('real SDK: cancelOrder sends an 18-digit orderId as an exact JSON number', async () => {
  const { client, captured } = await realClient('{"result":"ok","message":"cancelled"}');

  await withAccount('', () => predictions.cancelOrder(client, '145828833218573125'));

  assert.match(captured[0]!.body!, /"orderId":145828833218573125\b/);
});

test('real SDK: GEMINI_ACCOUNT reaches both the signed payload and the literal body', async () => {
  const { client, captured } = await realClient('{"orderId":1}', 201);

  await withAccount('sub-account-1', () => predictions.placeOrder(client, baseOrder));

  assert.strictEqual(captured[0]!.payload['account'], 'sub-account-1');
  assert.strictEqual(JSON.parse(captured[0]!.body!)['account'], 'sub-account-1');
});

test('real SDK: an 18-digit orderId in the raw response survives as the exact string', async () => {
  const { client } = await realClient(
    '{"orders":[{"orderId":145828833218573125,"symbol":"GEMI-A"}],"pagination":{"limit":50,"offset":0}}'
  );

  const result = await withAccount('', () => predictions.getActiveOrders(client));

  assert.strictEqual(result.orders[0]!.orderId, '145828833218573125');
});
