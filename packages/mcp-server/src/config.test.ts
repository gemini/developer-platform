import test from 'node:test';
import assert from 'node:assert/strict';

const PROD_URL = 'https://api.gemini.com';
const SANDBOX_URL = 'https://api.sandbox.gemini.com';

// config.ts snapshots process.env when the module is first imported, so the env vars
// have to be in place before the module graph loads — same reason client/sdk.test.ts
// and client/http.request.test.ts use dynamic imports here. node:test runs each test
// file in its own process, so this assignment cannot leak into other suites.
process.env.GEMINI_API_BASE_URL = SANDBOX_URL;
delete process.env.GEMINI_SDK_ENV;
delete process.env.GEMINI_API_NONCE_MODE;

const { config, resolveSdkEnv, resolveNonceMode } = await import('./config.js');

test('resolveNonceMode defaults to incremental when unset or empty, preserving PR #75 behaviour', () => {
  assert.strictEqual(resolveNonceMode(undefined), 'incremental');
  assert.strictEqual(resolveNonceMode(''), 'incremental');
});

test('resolveNonceMode accepts the two exact key contracts', () => {
  assert.strictEqual(resolveNonceMode('incremental'), 'incremental');
  assert.strictEqual(resolveNonceMode('time-based'), 'time-based');
});

test('resolveNonceMode throws on an unknown value instead of silently sending the wrong nonce unit', () => {
  assert.throws(() => resolveNonceMode('seconds'), /Invalid GEMINI_API_NONCE_MODE "seconds"/);
  assert.throws(() => resolveNonceMode('Time-Based'), /Invalid GEMINI_API_NONCE_MODE/);
});

test('config defaults nonceMode to incremental when GEMINI_API_NONCE_MODE is unset', () => {
  assert.strictEqual(config.nonceMode, 'incremental');
});

test('resolveSdkEnv derives sandbox from a sandbox base URL when the override is unset', () => {
  assert.strictEqual(resolveSdkEnv(SANDBOX_URL, undefined), 'sandbox');
});

test('resolveSdkEnv derives sandbox from a sandbox base URL when the override is empty', () => {
  assert.strictEqual(resolveSdkEnv(SANDBOX_URL, ''), 'sandbox');
});

test('resolveSdkEnv derives production from a production base URL when the override is unset', () => {
  assert.strictEqual(resolveSdkEnv(PROD_URL, undefined), 'production');
});

test('resolveSdkEnv derives production from a production base URL when the override is empty', () => {
  assert.strictEqual(resolveSdkEnv(PROD_URL, ''), 'production');
});

test('resolveSdkEnv lets an explicit override win over a production base URL', () => {
  assert.strictEqual(resolveSdkEnv(PROD_URL, 'sandbox'), 'sandbox');
});

test('resolveSdkEnv lets an explicit override win over a sandbox base URL', () => {
  assert.strictEqual(resolveSdkEnv(SANDBOX_URL, 'production'), 'production');
});

test('resolveSdkEnv throws on an invalid override instead of silently falling back', () => {
  assert.throws(() => resolveSdkEnv(PROD_URL, 'sandbx'), /Invalid GEMINI_SDK_ENV "sandbx"/);
});

test('resolveSdkEnv falls back to production for a malformed base URL rather than throwing', () => {
  assert.strictEqual(resolveSdkEnv('not-a-url', undefined), 'production');
});

test('config wires sdkEnv from GEMINI_API_BASE_URL at startup, so the two selectors cannot diverge', () => {
  // End-to-end check that config.ts actually calls resolveSdkEnv with
  // GEMINI_API_BASE_URL/GEMINI_SDK_ENV at module load, not just that the function
  // itself is correct in isolation (covered above).
  assert.strictEqual(config.baseUrl, SANDBOX_URL);
  assert.strictEqual(config.sdkEnv, 'sandbox');
});
