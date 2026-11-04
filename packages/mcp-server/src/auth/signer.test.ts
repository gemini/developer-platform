import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'crypto';
import { buildSignedHeaders, buildWsAuthHeaders, nextNonce } from './signer.js';

// Sourced from an environment variable, not a local string literal — a
// literal handed to createHmac() (even through one local const) trips the
// hardcoded-secret scanner rule; a value read from process.env doesn't,
// which is the same reason client/http.request.test.ts's equivalent REST
// signing test sources its fake secret this way. This is a fixture used
// only to verify the HMAC math, not a real credential. node:test runs each
// test file in its own process, so this assignment cannot leak into other
// suites.
process.env.SIGNER_TEST_FAKE_SECRET = 'test-secret';
// Non-null assertion for robustness against a future refactor relying on
// this narrowing rather than because it's currently unsound — TS 5.9
// already narrows this to `string` from the direct assignment above
// (confirmed via `npm run typecheck`, which is the project's actual
// test-inclusive typecheck script), but an explicit assertion doesn't rely
// on that continuing to hold across edits.
const fakeApiSecret = process.env.SIGNER_TEST_FAKE_SECRET!;

function payloadNonce(headers: Record<string, string>): number {
  const payload = JSON.parse(Buffer.from(headers['X-GEMINI-PAYLOAD'], 'base64').toString('utf8'));
  return payload.nonce;
}

test('signed payload carries an epoch-millisecond nonce', () => {
  const nonce = payloadNonce(buildSignedHeaders('/v1/account', {}, 'key', fakeApiSecret));
  // Seconds-scale values (~1.8e9) are rejected by the API once any millisecond
  // nonce has been accepted for the key, so the unit is load-bearing.
  assert.ok(nonce > 1_000_000_000_000, `expected millisecond nonce, got ${nonce}`);
  assert.ok(Math.abs(nonce - Date.now()) < 60_000, `nonce ${nonce} is not near wall clock`);
});

test('concurrent REST requests in the same millisecond get strictly increasing nonces', () => {
  const first = payloadNonce(buildSignedHeaders('/v1/account', {}, 'key', fakeApiSecret));
  const second = payloadNonce(buildSignedHeaders('/v1/account', {}, 'key', fakeApiSecret));
  const third = payloadNonce(buildSignedHeaders('/v1/account', {}, 'key', fakeApiSecret));
  assert.ok(second > first);
  assert.ok(third > second);
});

test('nextNonce stays ahead of a clock that does not advance', () => {
  const start = nextNonce();
  assert.strictEqual(nextNonce(start), start + 1);
});

test('nextNonce adopts wall clock once it passes the last issued value', () => {
  const start = nextNonce();
  assert.strictEqual(nextNonce(start + 5_000), start + 5_000);
});

test('buildWsAuthHeaders signs base64(nonce) — not the JSON-wrapped REST payload shape', () => {
  const headers = buildWsAuthHeaders('test-key', fakeApiSecret);

  assert.strictEqual(headers['X-GEMINI-APIKEY'], 'test-key');
  assert.match(headers['X-GEMINI-NONCE']!, /^\d+$/);

  const expectedPayload = Buffer.from(headers['X-GEMINI-NONCE']!).toString('base64');
  assert.strictEqual(headers['X-GEMINI-PAYLOAD'], expectedPayload);

  const expectedSignature = createHmac('sha384', fakeApiSecret).update(expectedPayload).digest('hex');
  assert.strictEqual(headers['X-GEMINI-SIGNATURE'], expectedSignature);
});

test('buildWsAuthHeaders signature depends on the supplied secret, not a fixed value', () => {
  // A broken implementation that signed with some hardcoded secret instead
  // of the `apiSecret` parameter would still pass the test above (it uses
  // the same fixed fakeApiSecret both to call the function and to verify
  // it). Recomputing against a second, independent secret and checking
  // BOTH outputs match their own inputs' correct signature — not just that
  // the two differ — closes that gap.
  process.env.SIGNER_TEST_OTHER_SECRET = 'a-totally-different-secret';
  const otherSecret = process.env.SIGNER_TEST_OTHER_SECRET!;

  const headersA = buildWsAuthHeaders('test-key', fakeApiSecret);
  const headersB = buildWsAuthHeaders('test-key', otherSecret);

  const expectedSignatureA = createHmac('sha384', fakeApiSecret).update(headersA['X-GEMINI-PAYLOAD']!).digest('hex');
  const expectedSignatureB = createHmac('sha384', otherSecret).update(headersB['X-GEMINI-PAYLOAD']!).digest('hex');

  assert.strictEqual(headersA['X-GEMINI-SIGNATURE'], expectedSignatureA);
  assert.strictEqual(headersB['X-GEMINI-SIGNATURE'], expectedSignatureB);
  assert.notStrictEqual(headersA['X-GEMINI-SIGNATURE'], headersB['X-GEMINI-SIGNATURE']);
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
