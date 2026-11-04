import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSignedHeaders, nextNonce } from './signer.js';

function payloadNonce(headers: Record<string, string>): number {
  const payload = JSON.parse(Buffer.from(headers['X-GEMINI-PAYLOAD'], 'base64').toString('utf8'));
  return payload.nonce;
}

test('signed payload carries an epoch-millisecond nonce', () => {
  const nonce = payloadNonce(buildSignedHeaders('/v1/account', {}, 'key', 'secret'));
  // Seconds-scale values (~1.8e9) are rejected by the API once any millisecond
  // nonce has been accepted for the key, so the unit is load-bearing.
  assert.ok(nonce > 1_000_000_000_000, `expected millisecond nonce, got ${nonce}`);
  assert.ok(Math.abs(nonce - Date.now()) < 60_000, `nonce ${nonce} is not near wall clock`);
});

test('concurrent requests in the same millisecond get strictly increasing nonces', () => {
  const first = payloadNonce(buildSignedHeaders('/v1/account', {}, 'key', 'secret'));
  const second = payloadNonce(buildSignedHeaders('/v1/account', {}, 'key', 'secret'));
  const third = payloadNonce(buildSignedHeaders('/v1/account', {}, 'key', 'secret'));
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
