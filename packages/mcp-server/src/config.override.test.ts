import test from 'node:test';
import assert from 'node:assert/strict';

// A second, separate test file (and so a separate process — node:test isolates each
// test file, and config.ts snapshots process.env at first import) so this scenario's
// env vars don't collide with config.test.ts's. Proves the module-load wiring itself
// passes GEMINI_SDK_ENV through to config, not just that resolveSdkEnv() honors an
// override when called directly (covered in config.test.ts) — a regression that
// stopped forwarding process.env.GEMINI_SDK_ENV into resolveSdkEnv's second argument
// would still pass every test in that file.
process.env.GEMINI_API_BASE_URL = 'https://api.sandbox.gemini.com';
process.env.GEMINI_SDK_ENV = 'production';

const { config } = await import('./config.js');

test('config honors an explicit GEMINI_SDK_ENV override at startup even against a sandbox base URL', () => {
  assert.strictEqual(config.baseUrl, 'https://api.sandbox.gemini.com');
  assert.strictEqual(config.sdkEnv, 'production');
});
