import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import type { SdkClient } from './sdk.js';

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
process.env.GEMINI_API_BASE_URL = 'https://api.gemini.com';
delete process.env.GEMINI_ACCOUNT;
delete process.env.GEMINI_API_NONCE_MODE;

const { createSdkClient } = await import('./sdk.js');
const { config } = await import('../config.js');
// This client also imports config; static loading would snapshot it before env setup.
const { GeminiHttpClient } = await import('./http.js');

type SdkFetch = NonNullable<NonNullable<Parameters<typeof createSdkClient>[0]>['fetch']>;
type CapturedRequest = { url: string; init: Parameters<SdkFetch>[1] };

function captureFetch(calls: CapturedRequest[]): SdkFetch {
  return async (url, init) => {
    calls.push({ url, init });
    return new Response(url.endsWith('/order') ? '{"orderId":1}' : '{}', {
      status: url.endsWith('/order') ? 201 : 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };
}

function signedPayload(call: CapturedRequest): Record<string, unknown> {
  const encoded = call.init.headers['X-GEMINI-PAYLOAD'];
  assert.ok(encoded, 'expected a signed payload');
  assert.strictEqual(
    call.init.headers['X-GEMINI-SIGNATURE'],
    createHmac('sha384', process.env.SDK_TEST_FAKE_SECRET!).update(encoded).digest('hex')
  );
  return JSON.parse(Buffer.from(encoded, 'base64').toString('utf8')) as Record<string, unknown>;
}

test('createSdkClient wires the configured HmacAuth into an actual authenticated request', async () => {
  assert.strictEqual(config.sdkEnv, 'production');

  // Exercise a real authenticated REST call (via an injected fake fetch, so nothing
  // touches the network) and inspect the signed headers HttpTransport actually sent.
  // Checking only that client.websocket.private.orders is a function — the previous
  // version of this test — passes even if createSdkClient silently dropped the
  // HmacAuth instance, since that surface exists regardless of whether auth is
  // configured; only an authenticated call proves auth was wired through.
  let capturedHeaders: Record<string, string> | undefined;
  const client = await createSdkClient({
    fetch: async (_url, init) => {
      capturedHeaders = init.headers;
      return new Response('{}', {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    },
  });
  try {
    await client.predictions.getPositions();

    assert.strictEqual(capturedHeaders?.['X-GEMINI-APIKEY'], process.env.SDK_TEST_FAKE_KEY);
    assert.ok(capturedHeaders?.['X-GEMINI-SIGNATURE'], 'expected a computed HMAC signature header');

    // client.websocket.private.orders remains a function once auth is configured — kept
    // as a cheap structural check, not invoked (that would open a real authenticated
    // WebSocket connection; see the "fails closed" test below for the meaningful WS
    // assertion, which throws before any connection is attempted either way).
    assert.strictEqual(typeof client.websocket.private.orders, 'function');
  } finally {
    client.close();
  }
});

test('standard REST targets retain SDK environment selection and, for time-based keys, epoch-second nonces', async (t) => {
  const saved = { baseUrl: config.baseUrl, sdkEnv: config.sdkEnv, nonceMode: config.nonceMode };
  const now = 2_000_000_000_123;
  t.mock.method(Date, 'now', () => now);
  try {
    config.nonceMode = 'time-based';
    for (const baseUrl of ['https://api.gemini.com', 'https://api.sandbox.gemini.com/']) {
      for (const sdkEnv of ['production', 'sandbox'] as const) {
        config.baseUrl = baseUrl;
        config.sdkEnv = sdkEnv;
        const calls: CapturedRequest[] = [];
        const client = await createSdkClient({ fetch: captureFetch(calls) });
        try {
          await client.predictions.getCategories();
          await client.predictions.getPositions();
          const origin = sdkEnv === 'sandbox'
            ? 'https://api.sandbox.gemini.com'
            : 'https://api.gemini.com';
          assert.deepStrictEqual(calls.map(({ url }) => url), [
            `${origin}/v1/prediction-markets/categories`,
            `${origin}/v1/prediction-markets/positions`,
          ]);
          assert.strictEqual(calls[0]!.init.headers['X-GEMINI-APIKEY'], undefined);
          assert.strictEqual(String(signedPayload(calls[1]!)['nonce']), String(Math.floor(now / 1000)));
        } finally {
          client.close();
        }
      }
    }
  } finally {
    Object.assign(config, saved);
  }
});

test('custom REST routing composes with injected fetch for public reads, signed queries and orders', async () => {
  const saved = { baseUrl: config.baseUrl, sdkEnv: config.sdkEnv };
  try {
    for (const baseUrl of ['https://api.qa100.aurora7.net', 'http://sandbox.example.invalid:8080/']) {
      config.baseUrl = baseUrl;
      config.sdkEnv = 'sandbox';
      const calls: CapturedRequest[] = [];
      const client = await createSdkClient({ fetch: captureFetch(calls) });
      const controller = new AbortController();
      const order = {
        symbol: 'GEMI-TEST',
        side: 'buy',
        outcome: 'yes',
        quantity: '1',
        price: '0.50',
        orderType: 'limit',
        makerOrCancel: false,
      } as const;
      try {
        await client.predictions.getCategories();
        await client.predictions.getPositions(
          { eventTicker: 'GEMI-TEST', limit: 7 },
          { signal: controller.signal, headers: { 'X-Test-Routing': 'preserved' } }
        );
        // This is an SDK request intercepted by fake fetch, never a real order.
        await client.predictions.placeOrder(order);

        const target = baseUrl.replace(/\/+$/, '');
        assert.strictEqual(calls.length, 3);
        assert.strictEqual(calls[0]!.url, `${target}/v1/prediction-markets/categories`);
        assert.strictEqual(calls[0]!.init.headers['X-GEMINI-APIKEY'], undefined);
        const read = calls[1]!;
        const url = new URL(read.url);
        assert.strictEqual(`${url.origin}${url.pathname}`, `${target}/v1/prediction-markets/positions`);
        assert.deepStrictEqual([...url.searchParams.entries()].sort(), [
          ['eventTicker', 'GEMI-TEST'], ['limit', '7'],
        ]);
        assert.strictEqual(read.init.method, 'POST');
        assert.strictEqual(read.init.headers['X-Test-Routing'], 'preserved');
        assert.ok(read.init.signal instanceof AbortSignal);
        assert.strictEqual(read.init.signal.aborted, false);
        assert.strictEqual(read.init.redirect, 'manual');
        assert.strictEqual(signedPayload(read)['request'], '/v1/prediction-markets/positions');
        const placed = calls[2]!;
        assert.strictEqual(placed.url, `${target}/v1/prediction-markets/order`);
        assert.strictEqual(placed.init.method, 'POST');
        assert.deepStrictEqual(JSON.parse(placed.init.body!), order);
        assert.strictEqual(placed.init.headers['X-GEMINI-APIKEY'], process.env.SDK_TEST_FAKE_KEY);
        assert.strictEqual(placed.init.redirect, 'manual');
        const payload = signedPayload(placed);
        assert.strictEqual(payload['request'], '/v1/prediction-markets/order');
        for (const [key, value] of Object.entries(order)) assert.strictEqual(payload[key], value);
      } finally {
        client.close();
      }
    }
  } finally {
    Object.assign(config, saved);
  }
});

test('custom SDK and legacy REST requests share increasing nonces in the same millisecond', async (t) => {
  const saved = { baseUrl: config.baseUrl, sdkEnv: config.sdkEnv, nonceMode: config.nonceMode };
  const now = 2_000_000_000_123;
  t.mock.method(Date, 'now', () => now);
  config.baseUrl = 'https://api.qa100.aurora7.net';
  config.nonceMode = 'incremental';
  const calls: CapturedRequest[] = [];
  const fakeFetch = captureFetch(calls);
  t.mock.method(globalThis, 'fetch', fakeFetch);
  const clients: SdkClient[] = [];
  try {
    const legacy = new GeminiHttpClient();
    // One uses the runtime fetch fallback, the other the explicit test override.
    clients.push(await createSdkClient(), await createSdkClient({ fetch: fakeFetch }));
    await legacy.authenticatedGet('/v1/account');
    await clients[0]!.predictions.getPositions();
    await legacy.authenticatedGet('/v1/account');
    await clients[1]!.predictions.getPositions();
    const nonces = calls.map((call) => Number(signedPayload(call)['nonce']));
    assert.strictEqual(nonces.length, 4);
    assert.ok(nonces[0]! >= now, 'custom REST nonces must be epoch milliseconds');
    assert.deepStrictEqual(nonces, nonces.map((_, index) => nonces[0]! + index));
    assert.ok(calls.every(({ url }) => url.startsWith(`${config.baseUrl}/v1/`)));
  } finally {
    for (const client of clients) client.close();
    Object.assign(config, saved);
  }
});

test('incremental keys use one millisecond sequence for SDK and legacy REST on standard hosts too', async (t) => {
  // The mode follows the key, not the host. Before this change standard hosts always sent seconds
  // to the SDK, so an incremental production key would have been rejected by a mode-blind SDK path.
  const saved = { baseUrl: config.baseUrl, sdkEnv: config.sdkEnv, nonceMode: config.nonceMode };
  const now = 2_000_000_000_456;
  t.mock.method(Date, 'now', () => now);
  config.baseUrl = 'https://api.gemini.com';
  config.sdkEnv = 'production';
  config.nonceMode = 'incremental';
  const calls: CapturedRequest[] = [];
  const fakeFetch = captureFetch(calls);
  t.mock.method(globalThis, 'fetch', fakeFetch);
  const clients: SdkClient[] = [];
  try {
    const legacy = new GeminiHttpClient();
    clients.push(await createSdkClient({ fetch: fakeFetch }));
    await legacy.authenticatedGet('/v1/account');
    await clients[0]!.predictions.getPositions();
    await legacy.authenticatedGet('/v1/account');
    const nonces = calls.map((call) => Number(signedPayload(call)['nonce']));
    assert.strictEqual(nonces.length, 3);
    assert.ok(nonces[0]! >= now, 'incremental nonces must be epoch milliseconds on standard hosts');
    assert.deepStrictEqual(nonces, nonces.map((_, index) => nonces[0]! + index));
  } finally {
    for (const client of clients) client.close();
    Object.assign(config, saved);
  }
});

test('time-based keys send epoch-second nonces from both legacy REST and the SDK on custom hosts', async (t) => {
  const saved = { baseUrl: config.baseUrl, sdkEnv: config.sdkEnv, nonceMode: config.nonceMode };
  const now = 2_000_000_000_789;
  t.mock.method(Date, 'now', () => now);
  config.baseUrl = 'https://api.qa100.aurora7.net';
  config.nonceMode = 'time-based';
  const calls: CapturedRequest[] = [];
  const fakeFetch = captureFetch(calls);
  t.mock.method(globalThis, 'fetch', fakeFetch);
  const clients: SdkClient[] = [];
  try {
    const legacy = new GeminiHttpClient();
    clients.push(await createSdkClient({ fetch: fakeFetch }));
    await legacy.authenticatedGet('/v1/account');
    await clients[0]!.predictions.getPositions();
    const nonces = calls.map((call) => Number(signedPayload(call)['nonce']));
    assert.strictEqual(nonces.length, 2);
    for (const nonce of nonces) assert.strictEqual(nonce, Math.floor(now / 1000));
  } finally {
    for (const client of clients) client.close();
    Object.assign(config, saved);
  }
});

test('createSdkClient omits auth in public-only mode, matching legacy fail-closed behavior', async () => {
  const savedKey = config.apiKey;
  const savedSecret = config.apiSecret;
  config.apiKey = '';
  config.apiSecret = '';
  try {
    const calls: CapturedRequest[] = [];
    const client = await createSdkClient({ fetch: captureFetch(calls) });
    try {
      await client.predictions.getCategories();
      assert.strictEqual(calls.length, 1);
      assert.strictEqual(calls[0]!.init.headers['X-GEMINI-APIKEY'], undefined);
      await assert.rejects(client.predictions.getPositions(), /AuthStrategy/);
      assert.strictEqual(calls.length, 1, 'unauthenticated private REST must not reach fetch');
      // No credentials configured — the private WS surface must fail closed, same as
      // the legacy GeminiHttpClient does today for authenticated REST calls. This
      // throws synchronously before any connection is attempted, so it's safe to call
      // directly (unlike the authenticated case above).
      assert.throws(() => client.websocket.private.orders({ scope: 'account' }));
    } finally {
      client.close();
    }
  } finally {
    config.apiKey = savedKey;
    config.apiSecret = savedSecret;
  }
});
