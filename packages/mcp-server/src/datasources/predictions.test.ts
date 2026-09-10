import test from 'node:test';
import assert from 'node:assert/strict';
import type { GeminiHttpClient } from '../client/http.js';
import * as predictions from './predictions.js';

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

test('getTerms is a public GET to /v1/prediction-markets/terms', async () => {
  const terms = { content: 'legal text', termsType: 'prediction-markets', updatedAt: '2026-01-01', version: 3 };
  const { client, calls } = fakeClient(terms);

  const result = await predictions.getTerms(client);

  assert.strictEqual(calls.length, 1);
  assert.deepStrictEqual(calls[0], {
    kind: 'publicGet',
    endpoint: '/v1/prediction-markets/terms',
    params: undefined,
  });
  assert.strictEqual(result, terms);
});

test('getTermsStatus is a signed GET to /v1/prediction-markets/terms/status', async () => {
  const status = { hasAcceptedLatest: false, latestVersion: 3 };
  const { client, calls } = fakeClient(status);

  const result = await predictions.getTermsStatus(client);

  assert.strictEqual(calls.length, 1);
  assert.deepStrictEqual(calls[0], {
    kind: 'authenticatedGet',
    endpoint: '/v1/prediction-markets/terms/status',
    params: undefined,
  });
  assert.strictEqual(result, status);
});

test('acceptTerms posts to /v1/prediction-markets/terms/accept with no body', async () => {
  const { client, calls } = fakeClient({ success: true });

  const result = await predictions.acceptTerms(client);

  assert.strictEqual(calls.length, 1);
  const call = calls[0]!;
  assert.strictEqual(call.kind, 'authenticatedPost');
  assert.strictEqual(call.endpoint, '/v1/prediction-markets/terms/accept');
  assert.strictEqual(call.body, undefined, 'accept sends no request body');
  assert.deepStrictEqual(result, { success: true });
});
