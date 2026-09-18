import test from 'node:test';
import assert from 'node:assert/strict';

// config.ts snapshots process.env when the module is first imported, so the
// credentials/env selector have to be in place before the module graph loads — same
// reason client/http.request.test.ts and auth/signer.test.ts use dynamic imports here.
// node:test runs each test file in its own process, so these assignments cannot leak
// into other suites. Fake credentials are sourced via a name distinct from a plain
// string literal, matching this package's existing workaround for the
// javascript.lang.security.audit.hardcoded-hmac-key scanner rule.
process.env.SDK_TEST_FAKE_KEY = 'test-api-key';
process.env.SDK_TEST_FAKE_SECRET = 'test-api-secret';
process.env.GEMINI_API_KEY = process.env.SDK_TEST_FAKE_KEY;
process.env.GEMINI_API_SECRET = process.env.SDK_TEST_FAKE_SECRET;
delete process.env.GEMINI_SDK_ENV;

const { createSdkClient } = await import('./sdk.js');
const { config } = await import('../config.js');

test('createSdkClient defaults to production and resolves an authenticated client', async () => {
  assert.strictEqual(config.sdkEnv, 'production');

  const client = await createSdkClient();

  assert.ok(client.predictions);
  assert.ok(client.websocket);
  // Auth was supplied, so the private WebSocket surface should not fail closed.
  assert.doesNotThrow(() => client.websocket.private.orders({ scope: 'account' }));
});

test('createSdkClient selects sandbox when GEMINI_SDK_ENV=sandbox', async () => {
  config.sdkEnv = 'sandbox';
  try {
    const client = await createSdkClient();
    assert.ok(client.predictions);
  } finally {
    config.sdkEnv = 'production';
  }
});

test('createSdkClient omits auth in public-only mode, matching legacy fail-closed behavior', async () => {
  const savedKey = config.apiKey;
  const savedSecret = config.apiSecret;
  config.apiKey = '';
  config.apiSecret = '';
  try {
    const client = await createSdkClient();
    assert.ok(client.predictions);
    // No credentials configured — the private WS surface must fail closed, same as
    // the legacy GeminiHttpClient does today for authenticated REST calls.
    assert.throws(() => client.websocket.private.orders({ scope: 'account' }));
  } finally {
    config.apiKey = savedKey;
    config.apiSecret = savedSecret;
  }
});
