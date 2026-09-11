import test from 'node:test';
import assert from 'node:assert/strict';

// config.ts snapshots process.env when the module is first imported, so the
// credentials have to be in place before the module graph loads — hence the
// dynamic imports below. node:test runs each test file in its own process, so
// these assignments cannot leak into other suites.
process.env.GEMINI_API_KEY = 'test-api-key';
process.env.GEMINI_API_SECRET = 'test-api-secret';
process.env.GEMINI_API_BASE_URL = 'https://api.gemini.invalid';
delete process.env.GEMINI_ACCOUNT;

const { GeminiHttpClient } = await import('./http.js');
const { config } = await import('../config.js');

interface CapturedCall {
  url: string;
  method: string;
  headers: Record<string, string>;
}

function stubFetch(body = '{}', status = 200) {
  const calls: CapturedCall[] = [];
  const original = globalThis.fetch;
  globalThis.fetch = (async (input: unknown, init: Record<string, unknown> = {}) => {
    calls.push({
      url: String(input),
      method: (init.method as string) ?? 'GET',
      headers: { ...((init.headers as Record<string, string>) ?? {}) },
    });
    return new Response(body, { status });
  }) as unknown as typeof fetch;
  return {
    calls,
    restore: () => {
      globalThis.fetch = original;
    },
  };
}

function signedPayload(headers: Record<string, string>): Record<string, unknown> {
  const encoded = headers['X-GEMINI-PAYLOAD'];
  assert.ok(encoded, 'X-GEMINI-PAYLOAD header is missing');
  return JSON.parse(Buffer.from(encoded, 'base64').toString('utf8')) as Record<string, unknown>;
}

// ----------------------------------------------------------------------------
// Signed GET — needed by private prediction endpoints such as terms/status
// ----------------------------------------------------------------------------

test('authenticatedGet issues a GET carrying the signed Gemini headers', async () => {
  const f = stubFetch('{"hasAcceptedLatest":true}');
  try {
    const client = new GeminiHttpClient();
    const res = await client.authenticatedGet<{ hasAcceptedLatest: boolean }>(
      '/v1/prediction-markets/terms/status'
    );

    assert.strictEqual(f.calls.length, 1);
    const call = f.calls[0]!;
    assert.strictEqual(call.method, 'GET');
    assert.strictEqual(call.url, 'https://api.gemini.invalid/v1/prediction-markets/terms/status');
    assert.strictEqual(call.headers['X-GEMINI-APIKEY'], 'test-api-key');
    assert.ok(call.headers['X-GEMINI-SIGNATURE']);
    assert.strictEqual(signedPayload(call.headers)['request'], '/v1/prediction-markets/terms/status');
    assert.strictEqual(res.hasAcceptedLatest, true);
  } finally {
    f.restore();
  }
});

// ----------------------------------------------------------------------------
// Query params on a signed request — the signature must cover the path ONLY
// ----------------------------------------------------------------------------

test('authenticatedPost puts params in the query string and signs the bare path', async () => {
  const f = stubFetch('{"positions":[]}');
  try {
    const client = new GeminiHttpClient();
    await client.authenticatedPost('/v1/prediction-markets/positions/settled', undefined, {
      eventTicker: 'FEDJAN26',
      limit: '25',
      withCashOuts: 'true',
    });

    const call = f.calls[0]!;
    assert.strictEqual(call.method, 'POST');
    const url = new URL(call.url);
    assert.strictEqual(url.pathname, '/v1/prediction-markets/positions/settled');
    assert.strictEqual(url.searchParams.get('eventTicker'), 'FEDJAN26');
    assert.strictEqual(url.searchParams.get('limit'), '25');
    assert.strictEqual(url.searchParams.get('withCashOuts'), 'true');

    // The regression this guards: including the query string in the signed
    // payload gets the request rejected by the API. Both SDKs sign the path
    // only for these endpoints.
    const payload = signedPayload(call.headers);
    assert.strictEqual(payload['request'], '/v1/prediction-markets/positions/settled');
    assert.ok(
      !String(payload['request']).includes('?'),
      'signed request path must not carry a query string'
    );
    assert.ok(!('eventTicker' in payload), 'query params must not leak into the signed body');
  } finally {
    f.restore();
  }
});

test('query serialization repeats arrays, sets scalars, and drops undefined', async () => {
  const f = stubFetch('{"data":[]}');
  try {
    const client = new GeminiHttpClient();
    await client.publicGet('/v1/prediction-markets/events', {
      'status[]': ['active', 'closed'],
      search: 'fed',
      limit: undefined,
    });

    const url = new URL(f.calls[0]!.url);
    assert.deepStrictEqual(url.searchParams.getAll('status[]'), ['active', 'closed']);
    assert.strictEqual(url.searchParams.get('search'), 'fed');
    assert.strictEqual(url.searchParams.has('limit'), false, 'undefined params must be dropped');
  } finally {
    f.restore();
  }
});

test('publicGet sends no credentials', async () => {
  const f = stubFetch('{"categories":[]}');
  try {
    const client = new GeminiHttpClient();
    await client.publicGet('/v1/prediction-markets/categories');

    const headers = f.calls[0]!.headers;
    assert.strictEqual(headers['X-GEMINI-APIKEY'], undefined);
    assert.strictEqual(headers['X-GEMINI-PAYLOAD'], undefined);
    assert.ok(headers['User-Agent']?.startsWith('gemini-mcp/'));
  } finally {
    f.restore();
  }
});

// ----------------------------------------------------------------------------
// Behavior preserved across the refactor
// ----------------------------------------------------------------------------

test('a signed GET fails closed when credentials are absent', async () => {
  const saved = { key: config.apiKey, secret: config.apiSecret };
  const f = stubFetch();
  try {
    config.apiKey = '';
    config.apiSecret = '';
    const client = new GeminiHttpClient();
    await assert.rejects(
      () => client.authenticatedGet('/v1/prediction-markets/terms/status'),
      /GEMINI_API_KEY and GEMINI_API_SECRET/
    );
    assert.strictEqual(f.calls.length, 0, 'must not reach the network without credentials');
  } finally {
    config.apiKey = saved.key;
    config.apiSecret = saved.secret;
    f.restore();
  }
});

test('the account override is signed into the payload on both methods', async () => {
  const saved = config.account;
  const f = stubFetch();
  try {
    config.account = 'primary';
    const client = new GeminiHttpClient();
    await client.authenticatedGet('/v1/prediction-markets/terms/status');
    await client.authenticatedPost('/v1/prediction-markets/order/batch', { orders: [] });

    assert.strictEqual(signedPayload(f.calls[0]!.headers)['account'], 'primary');
    const post = signedPayload(f.calls[1]!.headers);
    assert.strictEqual(post['account'], 'primary');
    assert.deepStrictEqual(post['orders'], []);
  } finally {
    config.account = saved;
    f.restore();
  }
});

test('a non-2xx response throws with the status and body', async () => {
  const f = stubFetch('{"reason":"AcceptTermsRequired"}', 403);
  try {
    const client = new GeminiHttpClient();
    await assert.rejects(
      () => client.authenticatedGet('/v1/prediction-markets/terms/status'),
      /Gemini API error 403: .*AcceptTermsRequired/
    );
  } finally {
    f.restore();
  }
});

test('int64 precision survives the shared response parser', async () => {
  // Raw JSON text, not JSON.stringify of an object literal: an 18-digit
  // literal in JS source is already truncated before the parser runs.
  const f = stubFetch('{"results":[{"order":{"orderId":145828833218573125}}]}');
  try {
    const client = new GeminiHttpClient();
    const res = await client.authenticatedPost<{
      results: { order: { orderId: string } }[];
    }>('/v1/prediction-markets/order/batch', { orders: [] });

    assert.strictEqual(res.results[0]!.order.orderId, '145828833218573125');
  } finally {
    f.restore();
  }
});
