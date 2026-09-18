import test from 'node:test';
import assert from 'node:assert/strict';
import type { GeminiHttpClient } from '../../client/http.js';
import * as predictions from './market-data.js';

// Regression coverage for PREDICT-8871: `category`/`status` were sent as
// `category[]`/`status[]`, a key shape the live API silently ignores (it
// falls back to unfiltered results instead of erroring). These assert the
// exact param key sent to the client has no `[]` suffix, so a regression
// back to the bracketed form fails loudly instead of silently no-op'ing a
// filter in production.
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

test('listEvents sends category/status as plain (unbracketed) query keys', async () => {
  const { client, calls } = fakeClient({ events: [] });

  await predictions.listEvents(client, { status: ['active'], category: ['Sports', 'Crypto'] });

  const call = calls[0]!;
  assert.strictEqual(call.kind, 'publicGet');
  assert.strictEqual(call.endpoint, '/v1/prediction-markets/events');
  assert.deepStrictEqual(call.params, { status: ['active'], category: ['Sports', 'Crypto'] });
});

test('listUpcoming sends category as a plain (unbracketed) query key', async () => {
  const { client, calls } = fakeClient({ events: [] });

  await predictions.listUpcoming(client, { category: ['Sports'] });

  assert.deepStrictEqual(calls[0]!.params, { category: ['Sports'] });
});

test('listNewlyListed sends category as a plain (unbracketed) query key', async () => {
  const { client, calls } = fakeClient({ events: [] });

  await predictions.listNewlyListed(client, { category: ['Sports'] });

  assert.deepStrictEqual(calls[0]!.params, { category: ['Sports'] });
});

test('listRecentlySettled sends category as a plain (unbracketed) query key', async () => {
  const { client, calls } = fakeClient({ events: [] });

  await predictions.listRecentlySettled(client, { category: ['Sports'] });

  assert.deepStrictEqual(calls[0]!.params, { category: ['Sports'] });
});

test('listCategories sends status as a plain (unbracketed) query key', async () => {
  const { client, calls } = fakeClient({ categories: [] });

  await predictions.listCategories(client, ['active']);

  assert.deepStrictEqual(calls[0]!.params, { status: ['active'] });
});
