import test from 'node:test';
import assert from 'node:assert/strict';
import type { GeminiHttpClient } from '../../client/http.js';
import * as predictions from './orders.js';

// A fake client that records exactly how each datasource function called it,
// without touching the network. This is the layer that would catch a wrong
// path or a param sent in the body instead of the query — the two most
// likely defects when wiring a new REST endpoint.
interface Call {
  kind: 'publicGet' | 'authenticatedGet' | 'authenticatedPost';
  endpoint: string;
  body?: unknown;
  params?: unknown;
}

function fakeClient(response: unknown = {}) {
  const calls: Call[] = [];
  const client = {
    publicGet: async (endpoint: string, params?: unknown) => {
      calls.push({ kind: 'publicGet', endpoint, params });
      return response;
    },
    authenticatedGet: async (endpoint: string, params?: unknown) => {
      calls.push({ kind: 'authenticatedGet', endpoint, params });
      return response;
    },
    authenticatedPost: async (endpoint: string, body?: unknown, params?: unknown) => {
      calls.push({ kind: 'authenticatedPost', endpoint, body, params });
      return response;
    },
  } as unknown as GeminiHttpClient;
  return { client, calls };
}

test('placeOrderBatch posts to /v1/prediction-markets/order/batch with orderType injected', async () => {
  const { client, calls } = fakeClient({ results: [] });

  await predictions.placeOrderBatch(client, [
    { symbol: 'GEMI-PRES2028-VANCE', side: 'buy', outcome: 'yes', quantity: '10', price: '0.42' },
  ]);

  assert.strictEqual(calls.length, 1);
  const call = calls[0]!;
  assert.strictEqual(call.kind, 'authenticatedPost');
  assert.strictEqual(call.endpoint, '/v1/prediction-markets/order/batch');
  assert.deepStrictEqual(call.body, {
    orders: [
      {
        symbol: 'GEMI-PRES2028-VANCE',
        orderType: 'limit',
        side: 'buy',
        outcome: 'yes',
        quantity: '10',
        price: '0.42',
      },
    ],
  });
});

test('placeOrderBatch only includes timeInForce for orders that specify it', async () => {
  const { client, calls } = fakeClient({ results: [] });

  await predictions.placeOrderBatch(client, [
    { symbol: 'GEMI-A', side: 'buy', outcome: 'yes', quantity: '1', price: '0.5' },
    {
      symbol: 'GEMI-B',
      side: 'sell',
      outcome: 'no',
      quantity: '2',
      price: '0.6',
      timeInForce: 'immediate-or-cancel',
    },
  ]);

  const body = calls[0]!.body as { orders: Record<string, unknown>[] };
  assert.strictEqual('timeInForce' in body.orders[0]!, false);
  assert.strictEqual(body.orders[1]!['timeInForce'], 'immediate-or-cancel');
});

test('placeOrderBatch preserves request order positionally', async () => {
  const { client, calls } = fakeClient({ results: [] });

  await predictions.placeOrderBatch(client, [
    { symbol: 'GEMI-A', side: 'buy', outcome: 'yes', quantity: '1', price: '0.5' },
    { symbol: 'GEMI-B', side: 'sell', outcome: 'no', quantity: '2', price: '0.6' },
    { symbol: 'GEMI-C', side: 'buy', outcome: 'no', quantity: '3', price: '0.7' },
  ]);

  const body = calls[0]!.body as { orders: Record<string, unknown>[] };
  assert.deepStrictEqual(
    body.orders.map((o) => o['symbol']),
    ['GEMI-A', 'GEMI-B', 'GEMI-C']
  );
});

test('placeOrderBatch returns the response unchanged', async () => {
  const response = { results: [{ order: { orderId: '1' } }] };
  const { client } = fakeClient(response);

  const result = await predictions.placeOrderBatch(client, [
    { symbol: 'GEMI-A', side: 'buy', outcome: 'yes', quantity: '1', price: '0.5' },
  ]);

  assert.strictEqual(result, response);
});

test('cancelOrderBatch posts to /v1/prediction-markets/order/batch/cancel with { orderIds }', async () => {
  const { client, calls } = fakeClient({ results: [] });

  await predictions.cancelOrderBatch(client, ['111', '222', '333']);

  assert.strictEqual(calls.length, 1);
  const call = calls[0]!;
  assert.strictEqual(call.kind, 'authenticatedPost');
  assert.strictEqual(call.endpoint, '/v1/prediction-markets/order/batch/cancel');
  assert.deepStrictEqual(call.body, { orderIds: ['111', '222', '333'] });
});

test('cancelOrderBatch returns the response unchanged', async () => {
  const response = { results: [{ orderId: '111', result: 'cancelled' }] };
  const { client } = fakeClient(response);

  const result = await predictions.cancelOrderBatch(client, ['111']);

  assert.strictEqual(result, response);
});
