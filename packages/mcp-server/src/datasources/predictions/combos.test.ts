import test from 'node:test';
import assert from 'node:assert/strict';
import type { GeminiHttpClient } from '../../client/http.js';
import { listCombos, getCombo, createCombo } from './combos.js';

interface RecordedCall {
  method: 'publicGet' | 'authenticatedGet' | 'authenticatedPost';
  endpoint: string;
  body?: Record<string, unknown>;
  params?: Record<string, string | string[] | undefined>;
}

function fakeClient(response: unknown) {
  const calls: RecordedCall[] = [];
  const client = {
    publicGet: async (endpoint: string, params?: Record<string, string | string[] | undefined>) => {
      calls.push({ method: 'publicGet', endpoint, params });
      return response;
    },
    authenticatedGet: async (endpoint: string, params?: Record<string, string | string[] | undefined>) => {
      calls.push({ method: 'authenticatedGet', endpoint, params });
      return response;
    },
    authenticatedPost: async (
      endpoint: string,
      body?: Record<string, unknown>,
      params?: Record<string, string | string[] | undefined>
    ) => {
      calls.push({ method: 'authenticatedPost', endpoint, body, params });
      return response;
    },
  };
  return { client: client as unknown as GeminiHttpClient, calls };
}

// ----------------------------------------------------------------------------
// listCombos
// ----------------------------------------------------------------------------

test('listCombos with no opts sends no query params', async () => {
  const { client, calls } = fakeClient({ combos: [], pagination: { limit: 50, offset: 0 } });
  await listCombos(client);

  assert.strictEqual(calls.length, 1);
  assert.strictEqual(calls[0]!.endpoint, '/v1/prediction-markets/combos');
  assert.deepStrictEqual(calls[0]!.params, {});
});

test('listCombos with all opts sends exactly those params, correctly stringified', async () => {
  const { client, calls } = fakeClient({ combos: [], pagination: { limit: 10, offset: 5 } });
  await listCombos(client, {
    status: 'Active',
    contractId: '123456789012345678',
    instrumentRegistered: true,
    limit: 10,
    offset: 5,
  });

  assert.strictEqual(calls.length, 1);
  assert.strictEqual(calls[0]!.endpoint, '/v1/prediction-markets/combos');
  assert.deepStrictEqual(calls[0]!.params, {
    status: 'Active',
    contractId: '123456789012345678',
    instrumentRegistered: 'true',
    limit: '10',
    offset: '5',
  });
});

test('listCombos stringifies instrumentRegistered: false rather than dropping it', async () => {
  const { client, calls } = fakeClient({ combos: [], pagination: { limit: 50, offset: 0 } });
  await listCombos(client, { instrumentRegistered: false });

  assert.deepStrictEqual(calls[0]!.params, { instrumentRegistered: 'false' });
});

// ----------------------------------------------------------------------------
// getCombo
// ----------------------------------------------------------------------------

test('getCombo interpolates the instrument symbol into the path, unencoded', async () => {
  const { client, calls } = fakeClient({ contract: {}, legs: [] });
  // A symbol containing characters that would change under encodeURIComponent
  // (e.g. nothing to encode here, but the assertion below pins the literal,
  // unencoded interpolation convention shared with getEvent/getEventStrike).
  await getCombo(client, 'GEMI-COMBO-ABC123');

  assert.strictEqual(calls.length, 1);
  assert.strictEqual(calls[0]!.method, 'publicGet');
  assert.strictEqual(calls[0]!.endpoint, '/v1/prediction-markets/combos/GEMI-COMBO-ABC123');
});

// ----------------------------------------------------------------------------
// createCombo
// ----------------------------------------------------------------------------

test('createCombo posts { legs } with the exact legs array passed through', async () => {
  const { client, calls } = fakeClient({ alreadyExisted: false, combo: {} });
  const legs: Array<{ contractId: string; requiredOutcome: 'Yes' | 'No' }> = [
    { contractId: '111', requiredOutcome: 'Yes' },
    { contractId: '222', requiredOutcome: 'No' },
  ];
  await createCombo(client, legs);

  assert.strictEqual(calls.length, 1);
  assert.strictEqual(calls[0]!.method, 'authenticatedPost');
  assert.strictEqual(calls[0]!.endpoint, '/v1/prediction-markets/combos');
  // Capitalized outcomes must survive verbatim — not lowercased for
  // consistency with the rest of the codebase's 'yes'/'no' convention.
  assert.deepStrictEqual(calls[0]!.body, { legs });
  const sentLegs = (calls[0]!.body as { legs: Array<{ requiredOutcome: string }> }).legs;
  assert.strictEqual(sentLegs[0]!.requiredOutcome, 'Yes');
  assert.strictEqual(sentLegs[1]!.requiredOutcome, 'No');
});
