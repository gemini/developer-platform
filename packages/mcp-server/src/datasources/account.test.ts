import test from 'node:test';
import assert from 'node:assert/strict';
import type { GeminiHttpClient } from '../client/http.js';
import { getAccounts } from './account.js';

const MASTER_KEY_ERROR =
  'Gemini API error 400: {"result":"error","reason":"InvalidApiKey","message":"Invalid API key"}';

function clientWith(authenticatedPost: GeminiHttpClient['authenticatedPost']): GeminiHttpClient {
  return { authenticatedPost } as unknown as GeminiHttpClient;
}

test('getAccounts maps a master-key rejection to an actionable error', async () => {
  const client = clientWith(async () => {
    throw new Error(MASTER_KEY_ERROR);
  });
  await assert.rejects(getAccounts(client), /requires a master API key.*gemini_get_account/s);
});

test('getAccounts passes through unrelated failures unchanged', async () => {
  const unrelated = new Error('Gemini API error 503: {"result":"error","reason":"Unavailable"}');
  const client = clientWith(async () => {
    throw unrelated;
  });
  await assert.rejects(getAccounts(client), (err) => err === unrelated);
});

test('getAccounts returns the account list for a master key', async () => {
  const accounts = [{ shortName: 'primary' }];
  const client = clientWith(async () => accounts);
  assert.deepEqual(await getAccounts(client), accounts);
});
