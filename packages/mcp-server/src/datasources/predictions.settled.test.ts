import test from 'node:test';
import assert from 'node:assert/strict';
import type { GeminiHttpClient } from '../client/http.js';
import * as predictions from './predictions.js';

// A fake client that records exactly how each datasource function called it,
// without touching the network. This is the layer that would catch a wrong
// path, a param sent in the body instead of the query, or a body that isn't
// actually `undefined` when it should be — the most likely defects when
// wiring a signed-POST-with-query-params endpoint.
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

// ----------------------------------------------------------------------------
// getPositions — now forwards filters as query params on the existing
// signed-POST-with-no-body endpoint
// ----------------------------------------------------------------------------

test('getPositions with no opts sends no query params', async () => {
  const { client, calls } = fakeClient({ positions: [] });

  await predictions.getPositions(client);

  assert.strictEqual(calls.length, 1);
  const call = calls[0]!;
  assert.strictEqual(call.kind, 'authenticatedPost');
  assert.strictEqual(call.endpoint, '/v1/prediction-markets/positions');
  assert.strictEqual(call.body, undefined);
  assert.deepStrictEqual(call.params, {});
});

test('getPositions forwards eventTicker/limit/offset/sort as stringified query params, with an undefined body', async () => {
  const { client, calls } = fakeClient({ positions: [] });

  await predictions.getPositions(client, {
    eventTicker: 'FEDJAN26',
    limit: 25,
    offset: 10,
    sort: '-unrealizedPnl',
  });

  assert.strictEqual(calls.length, 1);
  const call = calls[0]!;
  assert.strictEqual(call.kind, 'authenticatedPost');
  assert.strictEqual(call.endpoint, '/v1/prediction-markets/positions');
  // Body must be the literal `undefined`, not `{}` — authenticatedPost only
  // defaults it internally, but the datasource must not pre-empt that by
  // passing an empty object of its own.
  assert.strictEqual(call.body, undefined);
  assert.deepStrictEqual(call.params, {
    eventTicker: 'FEDJAN26',
    limit: '25',
    offset: '10',
    sort: '-unrealizedPnl',
  });
});

test('getPositions with offset: 0 forwards it, not treated as absent', async () => {
  const { client, calls } = fakeClient({ positions: [] });

  await predictions.getPositions(client, { offset: 0 });

  const call = calls[0]!;
  assert.deepStrictEqual(call.params, { offset: '0' });
});

test('getPositions returns the response unchanged', async () => {
  const response = { positions: [{ symbol: 'GEMI-A' }] };
  const { client } = fakeClient(response);

  const result = await predictions.getPositions(client);

  assert.strictEqual(result, response);
});

// ----------------------------------------------------------------------------
// getSettledPositions — new endpoint, same signed-POST-with-query-params
// pattern
// ----------------------------------------------------------------------------

test('getSettledPositions with no opts sends no query params', async () => {
  const { client, calls } = fakeClient({ positions: [] });

  await predictions.getSettledPositions(client);

  assert.strictEqual(calls.length, 1);
  const call = calls[0]!;
  assert.strictEqual(call.kind, 'authenticatedPost');
  assert.strictEqual(call.endpoint, '/v1/prediction-markets/positions/settled');
  assert.strictEqual(call.body, undefined);
  assert.deepStrictEqual(call.params, {});
});

test('getSettledPositions forwards all 7 opts as stringified query params, with an undefined body', async () => {
  const { client, calls } = fakeClient({ positions: [] });

  await predictions.getSettledPositions(client, {
    eventTicker: 'FEDJAN26',
    limit: 50,
    offset: 5,
    sort: '-payout',
    search: 'fed',
    category: 'Politics',
    withCashOuts: true,
  });

  assert.strictEqual(calls.length, 1);
  const call = calls[0]!;
  assert.strictEqual(call.kind, 'authenticatedPost');
  assert.strictEqual(call.endpoint, '/v1/prediction-markets/positions/settled');
  assert.strictEqual(call.body, undefined);
  assert.deepStrictEqual(call.params, {
    eventTicker: 'FEDJAN26',
    limit: '50',
    offset: '5',
    sort: '-payout',
    search: 'fed',
    category: 'Politics',
    withCashOuts: 'true',
  });
});

test('getSettledPositions sends withCashOuts as the literal string "false", not the boolean', async () => {
  const { client, calls } = fakeClient({ positions: [] });

  await predictions.getSettledPositions(client, { withCashOuts: false });

  const call = calls[0]!;
  assert.deepStrictEqual(call.params, { withCashOuts: 'false' });
});

test('getSettledPositions with offset: 0 forwards it, not treated as absent', async () => {
  const { client, calls } = fakeClient({ positions: [] });

  await predictions.getSettledPositions(client, { offset: 0 });

  const call = calls[0]!;
  assert.deepStrictEqual(call.params, { offset: '0' });
});

test('getSettledPositions returns the response unchanged', async () => {
  const response = { positions: [{ instrumentSymbol: 'GEMI-A' }], total: 1 };
  const { client } = fakeClient(response);

  const result = await predictions.getSettledPositions(client);

  assert.strictEqual(result, response);
});
