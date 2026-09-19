import test from 'node:test';
import assert from 'node:assert/strict';

import type { GeminiHttpClient } from '../client/http.js';
import * as orders from './orders.js';

interface Call {
  endpoint: string;
  body?: unknown;
}

function fakeClient(response: unknown = {}) {
  const calls: Call[] = [];

  const client = {
    authenticatedPost: async (endpoint: string, body?: unknown) => {
      calls.push({ endpoint, body });
      return response;
    },
  } as unknown as GeminiHttpClient;

  return { client, calls };
}

test('getOrderStatus looks up an order by exchange order_id', async () => {
  const { client, calls } = fakeClient({ order_id: '123' });

  await orders.getOrderStatus(client, { orderId: '123' });

  assert.strictEqual(calls.length, 1);
  assert.strictEqual(calls[0]!.endpoint, '/v1/order/status');
  assert.deepStrictEqual(calls[0]!.body, { order_id: '123' });
});

test('getOrderStatus looks up an order by client_order_id for submission reconciliation', async () => {
  const { client, calls } = fakeClient({ client_order_id: 'agent-order-42' });

  await orders.getOrderStatus(client, { clientOrderId: 'agent-order-42' });

  assert.strictEqual(calls.length, 1);
  assert.strictEqual(calls[0]!.endpoint, '/v1/order/status');
  assert.deepStrictEqual(calls[0]!.body, { client_order_id: 'agent-order-42' });
});

test('newOrder falls back exactly once after a definite InvalidOrderType API rejection', async () => {
  const { GeminiApiError } = await import('../client/http.js');
  const calls: Call[] = [];

  const client = {
    authenticatedPost: async (endpoint: string, body?: unknown) => {
      calls.push({ endpoint, body });

      if (calls.length === 1) {
        throw new GeminiApiError(400, '{"reason":"InvalidOrderType"}');
      }

      return {
        order_id: '456',
        client_order_id: 'recovery-42',
      };
    },
    // The fallback needs a ticker price. Keep that read deterministic and local.
    publicGet: async () => ({
      bid: '100.00',
      ask: '101.00',
      last: '100.50',
    }),
  } as unknown as GeminiHttpClient;

  await orders.newOrder(
    client,
    'btcusd',
    '0.01',
    '0',
    'buy',
    'exchange market',
    undefined,
    'recovery-42'
  );

  const submissions = calls.filter((call) => call.endpoint === '/v1/order/new');

  assert.strictEqual(
    submissions.length,
    2,
    'a definite InvalidOrderType rejection may produce exactly one fallback submission'
  );

  assert.deepStrictEqual(submissions[0]!.body, {
    symbol: 'btcusd',
    amount: '0.01',
    price: '0',
    side: 'buy',
    type: 'exchange market',
    client_order_id: 'recovery-42',
  });

  assert.deepStrictEqual(
    submissions[1]!.body,
    {
      symbol: 'btcusd',
      amount: '0.01',
      price: '101.00',
      side: 'buy',
      type: 'exchange limit',
      client_order_id: 'recovery-42',
    },
    'the existing market-order fallback behavior is preserved'
  );
});

test('newOrder never submits a fallback order after an ambiguous transport failure', async () => {
  const { GeminiTransportError } = await import('../client/http.js');
  const calls: Call[] = [];
  let tickerReads = 0;

  const transportError = new GeminiTransportError(
    'POST',
    '/v1/order/new',
    new TypeError('socket closed')
  );

  const client = {
    authenticatedPost: async (endpoint: string, body?: unknown) => {
      calls.push({ endpoint, body });
      throw transportError;
    },
    publicGet: async () => {
      tickerReads += 1;
      return {
        bid: '100.00',
        ask: '101.00',
        last: '100.50',
      };
    },
  } as unknown as GeminiHttpClient;

  await assert.rejects(
    () =>
      orders.newOrder(
        client,
        'btcusd',
        '0.01',
        '0',
        'buy',
        'exchange market',
        undefined,
        'recovery-42'
      ),
    (err: unknown) => {
      assert.strictEqual(err, transportError);
      return true;
    }
  );

  assert.strictEqual(
    calls.filter((call) => call.endpoint === '/v1/order/new').length,
    1,
    'ambiguous submission outcome must never cause a second order mutation'
  );

  assert.strictEqual(
    tickerReads,
    0,
    'transport ambiguity must not even enter the market-order fallback path'
  );
});
