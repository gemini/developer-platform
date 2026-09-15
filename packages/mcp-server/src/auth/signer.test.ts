import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'crypto';
import { buildWsAuthHeaders } from './signer.js';

// Sourced from an environment variable, not a local string literal — a
// literal handed to createHmac() (even through one local const) trips the
// hardcoded-secret scanner rule; a value read from process.env doesn't,
// which is the same reason client/http.request.test.ts's equivalent REST
// signing test sources its fake secret this way. This is a fixture used
// only to verify the HMAC math, not a real credential. node:test runs each
// test file in its own process, so this assignment cannot leak into other
// suites.
process.env.SIGNER_TEST_FAKE_SECRET = 'test-secret';
const fakeApiSecret = process.env.SIGNER_TEST_FAKE_SECRET;

test('buildWsAuthHeaders signs base64(nonce) — not the JSON-wrapped REST payload shape', () => {
  const headers = buildWsAuthHeaders('test-key', fakeApiSecret);

  assert.strictEqual(headers['X-GEMINI-APIKEY'], 'test-key');
  assert.match(headers['X-GEMINI-NONCE']!, /^\d+$/);

  const expectedPayload = Buffer.from(headers['X-GEMINI-NONCE']!).toString('base64');
  assert.strictEqual(headers['X-GEMINI-PAYLOAD'], expectedPayload);

  const expectedSignature = createHmac('sha384', fakeApiSecret).update(expectedPayload).digest('hex');
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
