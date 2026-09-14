import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'crypto';
import { buildWsAuthHeaders } from './signer.js';

test('buildWsAuthHeaders signs base64(nonce) — not the JSON-wrapped REST payload shape', () => {
  const headers = buildWsAuthHeaders('test-key', 'test-secret');

  assert.strictEqual(headers['X-GEMINI-APIKEY'], 'test-key');
  assert.match(headers['X-GEMINI-NONCE']!, /^\d+$/);

  const expectedPayload = Buffer.from(headers['X-GEMINI-NONCE']!).toString('base64');
  assert.strictEqual(headers['X-GEMINI-PAYLOAD'], expectedPayload);

  const expectedSignature = createHmac('sha384', 'test-secret').update(expectedPayload).digest('hex');
  assert.strictEqual(headers['X-GEMINI-SIGNATURE'], expectedSignature);
});

test('buildWsAuthHeaders does not include the REST-only Content-Type/Content-Length headers', () => {
  const headers = buildWsAuthHeaders('k', 's');
  assert.strictEqual(headers['Content-Type'], undefined);
  assert.strictEqual(headers['Content-Length'], undefined);
});

test('buildWsAuthHeaders nonce is epoch seconds, not milliseconds', () => {
  const before = Math.floor(Date.now() / 1000);
  const headers = buildWsAuthHeaders('k', 's');
  const after = Math.floor(Date.now() / 1000);
  const nonce = Number(headers['X-GEMINI-NONCE']);

  assert.ok(nonce >= before && nonce <= after);
});
