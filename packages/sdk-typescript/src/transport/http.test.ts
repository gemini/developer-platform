import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import {
  type AuthStrategy,
  type FetchLike,
  HttpTransport,
  readBoundedResponseBytes,
  readBoundedResponseText,
  type RestFileResponse,
} from "./http.js";
import {
  AcceptTermsRequired,
  ApiError,
  EndpointMismatch,
  InsufficientFunds,
  InvalidNonce,
  InvalidRequest,
  InvalidSignature,
  MissingNonce,
  MissingRole,
  NotFoundError,
  RateLimitError,
  SdkError,
  ServiceUnavailable,
  RequestAbortedError,
  serializeError,
} from "../errors.js";
import { fromBase64 } from "../utils/encoding.js";
import type { BoundaryRecord, BoundaryValue } from "../utils/boundary-value.js";
import { parseBoundaryRecord } from "../tests/support/http-fixtures.js";

// A stub auth strategy: fixed nonce, credential headers that echo the signed
// base64 so tests can prove the exact payload string reached the signer.
const stubAuth: AuthStrategy = {
  nextNonce: () => "1700000000000",
  credentialHeaders: async (payloadBase64: string) => ({
    "X-GEMINI-APIKEY": "test-key",
    "X-GEMINI-SIGNATURE": `sig(${payloadBase64})`,
  }),
};

function streamingTextResponse(
  body: string,
  status = 200,
  headers?: { get(name: string): string | null },
): Awaited<ReturnType<FetchLike>> {
  const bytes = new TextEncoder().encode(body);
  let offset = 0;
  return {
    status,
    headers,
    body: {
      getReader: () => ({
        read: async () => {
          if (offset >= bytes.byteLength) return { done: true };
          const chunk = bytes.slice(offset);
          offset = bytes.byteLength;
          return { done: false, value: chunk };
        },
      }),
    },
  };
}

function streamingBytesResponse(
  bytes: Uint8Array,
  status = 200,
  headers?: { get(name: string): string | null },
): Awaited<ReturnType<FetchLike>> {
  let read = false;
  return {
    status,
    headers,
    body: {
      getReader: () => ({
        read: async () => {
          if (read) return { done: true };
          read = true;
          return { done: false, value: bytes };
        },
      }),
    },
  };
}

function malformedFetch(value: BoundaryValue): FetchLike {
  // SAFETY: These fixtures intentionally violate FetchLike to exercise malformed response handling.
  return value as FetchLike;
}

// A fake transport that records the last request and returns a canned response.
function recordingFetch(response: { status: number; body: string }) {
  let captured: { url: string; init: Parameters<FetchLike>[1] } | undefined;
  const fetchImpl: FetchLike = async (url, init) => {
    captured = { url, init };
    return streamingTextResponse(response.body, response.status);
  };
  return {
    fetchImpl,
    last: () => {
      if (!captured) throw new Error("fetch was never called");
      return captured;
    },
  };
}

// A fake transport that returns a queued sequence of responses, one per call,
// and counts calls. The last entry repeats once the queue is drained.
function sequenceFetch(responses: Array<{ status: number; body: string }>) {
  let n = 0;
  const fetchImpl: FetchLike = async () => {
    const r = responses[Math.min(n, responses.length - 1)];
    n++;
    return streamingTextResponse(r.body, r.status);
  };
  return { fetchImpl, calls: () => n };
}

test("private request shapes the Gemini payload envelope", async () => {
  const { fetchImpl, last } = recordingFetch({ status: 200, body: '{"result":"ok"}' });
  const client = new HttpTransport({ env: "sandbox", auth: stubAuth, fetchImpl });

  await client.request({
    method: "POST",
    path: "/v1/prediction-markets/order",
    params: { symbol: "BTCUSD", amount: "1.5" },
  });

  const { url, init } = last();
  assert.equal(url, "https://api.sandbox.gemini.com/v1/prediction-markets/order");
  assert.equal(init.method, "POST");

  // Fixed private-REST headers.
  assert.equal(init.headers["Content-Length"], "0");
  assert.equal(init.headers["Content-Type"], "text/plain");
  assert.equal(init.headers["Cache-Control"], "no-cache");
  assert.equal(init.body, undefined, "private REST parameters belong only in the signed payload");

  // The payload is base64(JSON) with request + nonce + params.
  const b64 = init.headers["X-GEMINI-PAYLOAD"];
  const payload = JSON.parse(fromBase64(b64));
  assert.deepEqual(payload, {
    request: "/v1/prediction-markets/order",
    nonce: 1700000000000,
    symbol: "BTCUSD",
    amount: "1.5",
  });

  // Credential headers from the auth strategy are merged, signing that exact b64.
  assert.equal(init.headers["X-GEMINI-APIKEY"], "test-key");
  assert.equal(init.headers["X-GEMINI-SIGNATURE"], `sig(${b64})`);
});

test("declared query serialization preserves array and object wire formats", async () => {
  let requestedUrl = "";
  const client = new HttpTransport({
    env: "sandbox",
    fetchImpl: async (url) => {
      requestedUrl = url;
      return streamingTextResponse("{}");
    },
  });

  await client.requestPublic({
    method: "GET",
    path: "/v1/test",
    query: { symbols: ["BTC/USD", "ETH"], filter: { side: "buy", ignored: undefined } },
    queryParameters: [
      { name: "symbols", in: "query", required: false, style: "form", explode: false },
      { name: "filter", in: "query", required: false, style: "deepObject", explode: true },
    ],
  });

  assert.equal(
    requestedUrl,
    "https://api.sandbox.gemini.com/v1/test?symbols=BTC%2FUSD,ETH&filter%5Bside%5D=buy",
  );
});

test("private request signs the same canonical query path that it sends", async () => {
  const { fetchImpl, last } = recordingFetch({ status: 200, body: "{}" });
  const client = new HttpTransport({ env: "sandbox", auth: stubAuth, fetchImpl });

  await client.request({
    method: "POST",
    path: "/v1/report",
    query: { fromDate: "2026-01-01", toDate: "2026-01-31", numRows: 10 },
    queryParameters: [
      { name: "fromDate", in: "query", required: false, style: "form", explode: true },
      { name: "toDate", in: "query", required: false, style: "form", explode: true },
      { name: "numRows", in: "query", required: false, style: "form", explode: true },
    ],
  });

  const requestPath = "/v1/report?fromDate=2026-01-01&toDate=2026-01-31&numRows=10";
  assert.equal(last().url, `https://api.sandbox.gemini.com${requestPath}`);
  assert.equal(
    JSON.parse(fromBase64(last().init.headers["X-GEMINI-PAYLOAD"])).request,
    requestPath,
  );
});

test("private request can send a query while signing the bare request path", async () => {
  const { fetchImpl, last } = recordingFetch({ status: 200, body: "{}" });
  const client = new HttpTransport({ env: "sandbox", auth: stubAuth, fetchImpl });

  await client.request({
    method: "POST",
    path: "/v1/fundingPayment",
    query: { since: 1700000000000n, to: 1700003600000n },
    queryInRequest: false,
  });

  assert.equal(
    last().url,
    "https://api.sandbox.gemini.com/v1/fundingPayment?since=1700000000000&to=1700003600000",
  );
  assert.equal(
    JSON.parse(fromBase64(last().init.headers["X-GEMINI-PAYLOAD"])).request,
    "/v1/fundingPayment",
  );
});

test("REST requests use manual redirects and reject representative redirect responses before reading a body", async () => {
  for (const response of [
    { status: 301 },
    { status: 302 },
    { status: 307 },
    { status: 308 },
    { status: 0, type: "opaqueredirect" },
  ]) {
    let redirect: "manual" | undefined;
    let bodyCancelled = false;
    let bodyReads = 0;
    const client = new HttpTransport({
      env: "sandbox",
      fetchImpl: async (_url, init) => {
        redirect = init.redirect;
        return {
          ...streamingTextResponse("should not be read", response.status, {
            get: (name: string) => name.toLowerCase() === "location" ? "https://attacker.example" : null,
          }),
          body: {
            getReader: () => ({
              read: async () => {
                bodyReads++;
                return { done: false, value: new TextEncoder().encode("should not be read") };
              },
              cancel: async () => { bodyCancelled = true; },
            }),
          },
          ...response,
        };
      },
    });

    await assert.rejects(
      client.requestPublic({ method: "GET", path: "/v1/symbols" }),
      /unexpected redirect response/,
    );
    assert.equal(redirect, "manual");
    assert.equal(bodyCancelled, true);
    assert.equal(bodyReads, 0);
  }
});

test("response contract failures cancel the unread response body", async () => {
  let bodyCancelled = false;
  const client = new HttpTransport({
    env: "sandbox",
    fetchImpl: malformedFetch(async () => ({
      status: 200,
      headers: { get: () => "application/json" },
      body: {
        getReader: () => ({
          read: async () => ({ done: false, value: new TextEncoder().encode("should not be read") }),
          cancel: async () => { bodyCancelled = true; },
        }),
      },
    })),
  });

  await assert.rejects(
    client.requestPublic({
      method: "GET",
      path: "/v1/symbols",
      responseContract: { successStatuses: [201], responseContentTypes: ["application/json"] },
    }),
    /unexpected success status 200/,
  );
  assert.equal(bodyCancelled, true);
});

test("REST response bodies are bounded before parsing", async () => {
  let bodyCancelled = false;
  const client = new HttpTransport({
    env: "sandbox",
    maxResponseSizeBytes: 4,
    fetchImpl: async () => ({
      status: 200,
      headers: { get: (name: string) => name === "content-length" ? "5" : null },
      body: {
        getReader: () => ({
          read: async () => ({ done: true }),
          cancel: async () => { bodyCancelled = true; },
        }),
      },
    }),
  });

  await assert.rejects(client.requestPublic({ method: "GET", path: "/v1/symbols" }), /response exceeded/);
  assert.equal(bodyCancelled, true);
});

test("declared oversized responses do not wait for a stalled body cancellation", async () => {
  let cancelStarted = false;
  const stalledCancellation = new Promise<void>(() => undefined);

  await assert.rejects(
    readBoundedResponseText({
      status: 200,
      headers: { get: () => "5" },
      body: {
        getReader: () => ({
          read: async () => ({ done: true }),
          cancel: () => {
            cancelStarted = true;
            return stalledCancellation;
          },
        }),
      },
    }, 4),
    /response exceeded/,
  );
  assert.equal(cancelStarted, true);
});

test("streamed oversized responses do not wait for stalled body cancellation", async () => {
  const stalledCancellation = new Promise<void>(() => undefined);
  const oversizedResponse = (): Awaited<ReturnType<FetchLike>> => ({
    status: 200,
    body: {
      getReader: () => ({
        read: async () => ({ done: false, value: new Uint8Array([1, 2, 3, 4, 5]) }),
        cancel: () => stalledCancellation,
      }),
    },
  });
  const timeout = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error("bounded response cancellation hung")), 50);
  });

  await assert.rejects(
    Promise.race([readBoundedResponseText(oversizedResponse(), 4), timeout]),
    /response exceeded/,
  );
  await assert.rejects(
    Promise.race([readBoundedResponseBytes(oversizedResponse(), 4), timeout]),
    /response exceeded/,
  );
});

test("REST response limits count UTF-8 bytes when no content length is available", async () => {
  const client = new HttpTransport({
    env: "sandbox",
    maxResponseSizeBytes: 3,
    fetchImpl: async () => streamingTextResponse("éé"),
  });

  await assert.rejects(client.requestPublic({ method: "GET", path: "/v1/symbols" }), /response exceeded/);
});

test("bounded response helpers fail closed for non-streaming responses", async () => {
  await assert.rejects(
    readBoundedResponseText({ status: 200, body: null }, 2),
    /readable stream/,
  );
  await assert.rejects(
    readBoundedResponseBytes({ status: 200, body: null }, 2),
    /readable stream/,
  );
});

test("REST file response bodies are bounded before allocation", async () => {
  const client = new HttpTransport({
    env: "sandbox",
    maxResponseSizeBytes: 4,
    fetchImpl: async () => ({
      status: 200,
      headers: { get: (name: string) => name === "content-length" ? "5" : "application/octet-stream" },
      body: {
        getReader: () => ({
          read: async () => ({ done: true }),
          cancel: async () => undefined,
        }),
      },
    }),
  });

  await assert.rejects(
    client.requestPublic({ method: "GET", path: "/v1/file", responseMode: "file" }),
    /response exceeded/,
  );
});

test("REST streaming response bodies are cancelled when they exceed the limit", async () => {
  let cancelled = false;
  const client = new HttpTransport({
    env: "sandbox",
    maxResponseSizeBytes: 4,
    fetchImpl: malformedFetch(async () => ({
      status: 200,
      body: {
        getReader: () => ({
          read: async () => ({ done: false, value: new Uint8Array([1, 2, 3, 4, 5]) }),
          cancel: async () => { cancelled = true; },
        }),
      },
    })),
  });

  await assert.rejects(client.requestPublic({ method: "GET", path: "/v1/symbols" }), /response exceeded/);
  assert.equal(cancelled, true);
});

test("REST streaming response bodies decode successfully under the limit", async () => {
  const encoder = new TextEncoder();
  const chunks = [encoder.encode('{"ok":'), encoder.encode("true}")];
  const client = new HttpTransport({
    env: "sandbox",
    maxResponseSizeBytes: 16,
    fetchImpl: malformedFetch(async () => ({
      status: 200,
      body: {
        getReader: () => ({
          read: async () => chunks.length > 0
            ? { done: false, value: chunks.shift() }
            : { done: true },
        }),
      },
    })),
  });

  assert.deepEqual(await client.requestPublic({ method: "GET", path: "/v1/symbols" }), { ok: true });
});

test("REST streaming response bodies reject invalid chunks and cancel the reader", async () => {
  let cancelled = false;
  const client = new HttpTransport({
    env: "sandbox",
    maxResponseSizeBytes: 16,
    fetchImpl: malformedFetch(async () => ({
      status: 200,
      body: {
        getReader: () => ({
          read: async () => ({ done: false, value: "not bytes" }),
          cancel: async () => { cancelled = true; },
        }),
      },
    })),
  });

  await assert.rejects(
    client.requestPublic({ method: "GET", path: "/v1/symbols" }),
    /invalid chunk/,
  );
  assert.equal(cancelled, true);
});

test("REST streaming file response bodies assemble bytes under the limit", async () => {
  const chunks = [new Uint8Array([1, 2]), new Uint8Array([3, 4])];
  const client = new HttpTransport({
    env: "sandbox",
    maxResponseSizeBytes: 4,
    fetchImpl: async () => ({
      status: 200,
      body: {
        getReader: () => ({
          read: async () => chunks.length > 0
            ? { done: false, value: chunks.shift() }
            : { done: true },
        }),
      },
    }),
  });

  const response = await client.requestPublic<RestFileResponse>({ method: "GET", path: "/v1/file", responseMode: "file" });
  assert.deepEqual(response.bytes, new Uint8Array([1, 2, 3, 4]));
});

test("REST file responses preserve an empty successful body", async () => {
  const client = new HttpTransport({
    env: "sandbox",
    fetchImpl: async () => ({ status: 204, body: null }),
  });
  const response = await client.requestPublic<RestFileResponse>({ method: "GET", path: "/v1/file", responseMode: "file" });
  assert.deepEqual(response.bytes, new Uint8Array());
});

test("safe reads retry transient responses but mutations do not", async () => {
  const reads = sequenceFetch([{ status: 503, body: "{}" }, { status: 200, body: "{}" }]);
  const client = new HttpTransport({ env: "sandbox", fetchImpl: reads.fetchImpl, maxRetries: 1, sleep: async () => {} });
  await client.requestPublic({ method: "GET", path: "/v1/symbols", retryable: true });
  assert.equal(reads.calls(), 2);

  const mutations = sequenceFetch([{ status: 503, body: "{}" }, { status: 200, body: "{}" }]);
  const mutationClient = new HttpTransport({ env: "sandbox", auth: stubAuth, fetchImpl: mutations.fetchImpl, maxRetries: 1, sleep: async () => {} });
  await assert.rejects(() => mutationClient.request({ method: "POST", path: "/v1/order/new", retryable: false }), ServiceUnavailable);
  assert.equal(mutations.calls(), 1);
});

test("Retry-After overrides client jitter for a safe read", async () => {
  let calls = 0;
  let slept = 0;
  const client = new HttpTransport({
    env: "sandbox", maxRetries: 1, sleep: async (ms) => { slept = ms; },
    fetchImpl: async () => (++calls === 1
      ? streamingTextResponse("{}", 429, { get: () => "2" })
      : streamingTextResponse("{}")),
  });
  await client.requestPublic({ method: "GET", path: "/v1/symbols", retryable: true });
  assert.equal(slept, 2000);
});

test("aborting a request rejects promptly and passes the signal to fetch", async () => {
  const controller = new AbortController();
  let received: AbortSignal | undefined;
  const client = new HttpTransport({ env: "sandbox", fetchImpl: async (_url, init) => {
    received = init.signal;
    return new Promise(() => {});
  } });
  const pending = client.requestPublic({ method: "GET", path: "/v1/symbols", signal: controller.signal });
  await Promise.resolve();
  controller.abort();
  await assert.rejects(pending, RequestAbortedError);
  assert.equal(received?.aborted, true);
});

test("auth headers cannot override the transport envelope using different casing", async () => {
  const auth: AuthStrategy = {
    nextNonce: () => "1700000000000",
    credentialHeaders: async () => ({ "x-gemini-payload": "evil" }),
  };
  const { fetchImpl, last } = recordingFetch({ status: 200, body: "{}" });
  const client = new HttpTransport({ env: "sandbox", auth, fetchImpl });

  await assert.rejects(
    client.request({ method: "POST", path: "/v1/x" }),
    /reserved header.*x-gemini-payload/i,
  );
  assert.throws(() => last(), /fetch was never called/);
});

test("a params key clobbering `request` throws EndpointMismatch before any send", async () => {
  const { fetchImpl, last } = recordingFetch({ status: 200, body: "{}" });
  const client = new HttpTransport({ env: "sandbox", auth: stubAuth, fetchImpl });

  await assert.rejects(
    client.request({
      method: "POST",
      path: "/v1/prediction-markets/order",
      params: { request: "/v1/prediction-markets/cancel" },
    }),
    (err: BoundaryValue) => err instanceof EndpointMismatch,
  );

  // The guard fires before the network call.
  assert.throws(() => last(), /fetch was never called/);
});

test("a bigint request mismatch still throws EndpointMismatch, never a formatter TypeError", async () => {
  const { fetchImpl } = recordingFetch({ status: 200, body: "{}" });
  const client = new HttpTransport({ env: "sandbox", auth: stubAuth, fetchImpl });

  await assert.rejects(
    client.request({
      method: "POST",
      path: "/v1/prediction-markets/order",
      params: { request: 1n },
    }),
    (err: BoundaryValue) => err instanceof EndpointMismatch,
  );
});

test("caller params cannot override the credential-scoped nonce", async () => {
  const { fetchImpl, last } = recordingFetch({ status: 200, body: "{}" });
  const client = new HttpTransport({ env: "sandbox", auth: stubAuth, fetchImpl });

  await assert.rejects(
    client.request({ method: "POST", path: "/v1/x", params: { nonce: "stale" } }),
    /nonce.*reserved/i,
  );
  assert.throws(() => last(), /fetch was never called/);
});

test("a private request with no AuthStrategy fails loud", async () => {
  const { fetchImpl } = recordingFetch({ status: 200, body: "{}" });
  const client = new HttpTransport({ env: "sandbox", fetchImpl });

  await assert.rejects(
    client.request({ method: "POST", path: "/v1/prediction-markets/order" }),
    /auth/i,
  );
});

test("public request needs no auth, sends no payload, and builds a query string", async () => {
  const { fetchImpl, last } = recordingFetch({ status: 200, body: "[]" });
  let nonceCalls = 0;
  let authCalls = 0;
  const auth: AuthStrategy = {
    nextNonce: () => {
      nonceCalls++;
      return "1700000000000";
    },
    credentialHeaders: async () => {
      authCalls++;
      return { "X-GEMINI-APIKEY": "must-not-leak" };
    },
  };
  const client = new HttpTransport({ env: "production", auth, fetchImpl });

  await client.requestPublic({
    method: "GET",
    path: "/v1/prediction-markets/events",
    query: { limit: 10, category: "sports", status: ["active", "resolved"] },
  });

  const { url, init } = last();
  assert.equal(
    url,
    "https://api.gemini.com/v1/prediction-markets/events?limit=10&category=sports&status=active&status=resolved",
  );
  assert.equal(init.method, "GET");
  assert.equal("X-GEMINI-PAYLOAD" in init.headers, false);
  assert.equal("X-GEMINI-APIKEY" in init.headers, false);
  assert.equal(nonceCalls, 0, "public calls never advance private nonce state");
  assert.equal(authCalls, 0, "public calls never invoke the configured auth strategy");
});

test("public requests propagate custom trace and correlation headers", async () => {
  const { fetchImpl, last } = recordingFetch({ status: 200, body: "{}" });
  const client = new HttpTransport({ env: "sandbox", fetchImpl });

  await client.requestPublic({
    method: "GET",
    path: "/v1/symbols",
    headers: {
      traceparent: "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01",
      "x-correlation-id": "request-123",
    },
  });

  assert.equal(last().init.headers.traceparent, "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01");
  assert.equal(last().init.headers["x-correlation-id"], "request-123");
});

test("custom public headers cannot replace transport or auth headers", async () => {
  const { fetchImpl } = recordingFetch({ status: 200, body: "{}" });
  const client = new HttpTransport({ env: "sandbox", fetchImpl });

  await assert.rejects(
    client.requestPublic({ method: "GET", path: "/v1/symbols", headers: { Authorization: "evil" } }),
    /Authorization.*reserved/i,
  );
});

test("an explicit baseUrl overrides the selected environment", async () => {
  const { fetchImpl, last } = recordingFetch({ status: 200, body: "{}" });
  const client = new HttpTransport({
    env: "sandbox",
    baseUrl: "https://api.override.test",
    fetchImpl,
  });

  await client.requestPublic({ method: "GET", path: "/v1/symbols" });

  assert.equal(last().url, "https://api.override.test/v1/symbols");
});

test("file response mode returns bytes and content metadata without parsing success text", async () => {
  const fetchImpl: FetchLike = async () => ({
    ...streamingBytesResponse(new Uint8Array([97, 44, 98])),
    status: 200,
    headers: {
      get: (name) => ({
        "content-type": "text/csv",
        "content-disposition": "attachment; filename=FundingAmount_BTCGUSDPERP.csv",
      })[name.toLowerCase()] ?? null,
    },
  });
  const client = new HttpTransport({ env: "production", fetchImpl });

  const result = await client.requestPublic({
    method: "GET",
    path: "/v1/fundingamountreport/records.xlsx",
    responseMode: "file",
  });

  assert.deepEqual(result, {
    bytes: new Uint8Array([97, 44, 98]),
    contentType: "text/csv",
    contentDisposition: "attachment; filename=FundingAmount_BTCGUSDPERP.csv",
  });
});

test("file response mode preserves empty bodies and typed error mapping", async () => {
  const emptyFetch: FetchLike = async () => ({
    ...streamingBytesResponse(new Uint8Array(0)),
    status: 200,
  });
  const empty = await new HttpTransport({ env: "production", fetchImpl: emptyFetch }).requestPublic({
    method: "GET",
    path: "/v1/report.xlsx",
    responseMode: "file",
  });
  assert.deepEqual(empty, { bytes: new Uint8Array(0), contentType: undefined, contentDisposition: undefined });

  const errorFetch: FetchLike = async () => streamingTextResponse(
    '{"reason":"InvalidNonce","message":"bad nonce"}',
    400,
  );
  await assert.rejects(
    new HttpTransport({ env: "production", fetchImpl: errorFetch }).requestPublic({
      method: "GET",
      path: "/v1/report.xlsx",
      responseMode: "file",
    }),
    (error: BoundaryValue) => error instanceof InvalidNonce,
  );
});

test("an auth strategy can omit nonce for OAuth payloads", async () => {
  const oauthAuth: AuthStrategy = {
    nextNonce: () => undefined,
    credentialHeaders: async () => ({ Authorization: "Bearer test-token" }),
  };
  const { fetchImpl, last } = recordingFetch({ status: 200, body: "{}" });
  const client = new HttpTransport({ env: "sandbox", auth: oauthAuth, fetchImpl });

  await client.request({ method: "POST", path: "/v1/x", params: { symbol: "BTCUSD" } });

  const { init } = last();
  const payload = JSON.parse(
    fromBase64(init.headers["X-GEMINI-PAYLOAD"]),
  );
  assert.deepEqual(payload, { request: "/v1/x", symbol: "BTCUSD" });
  assert.equal(init.headers.Authorization, "Bearer test-token");
});

test("invalid auth nonces fail as SdkError before fetch", async () => {
  const { fetchImpl, last } = recordingFetch({ status: 200, body: "{}" });

  for (const nonce of ["not-a-number", "01", "1e3"]) {
    const auth: AuthStrategy = {
      nextNonce: () => nonce,
      credentialHeaders: async () => ({}),
    };
    const client = new HttpTransport({ env: "sandbox", auth, fetchImpl });

    await assert.rejects(
      client.request({ method: "POST", path: "/v1/x" }),
      (error: BoundaryValue) => error instanceof SdkError,
    );
  }
  assert.throws(() => last(), /fetch was never called/);
});

test("private request preserves an oversized nonce as an exact JSON number", async () => {
  const auth: AuthStrategy = {
    nextNonce: () => "9007199254740993",
    credentialHeaders: async () => ({}),
  };
  const { fetchImpl, last } = recordingFetch({ status: 200, body: "{}" });
  const client = new HttpTransport({ env: "sandbox", auth, fetchImpl });

  await client.request({ method: "POST", path: "/v1/x" });

  const json = fromBase64(
    last().init.headers["X-GEMINI-PAYLOAD"],
  );
  assert.equal(json, '{"request":"/v1/x","nonce":9007199254740993}');
});

test("private request accepts a documented fractional nonce", async () => {
  const auth: AuthStrategy = {
    nextNonce: () => "1700000000.5",
    credentialHeaders: async () => ({}),
  };
  const { fetchImpl, last } = recordingFetch({ status: 200, body: "{}" });
  const client = new HttpTransport({ env: "sandbox", auth, fetchImpl });

  await client.request({ method: "GET", path: "/v1/x" });

  const json = fromBase64(
    last().init.headers["X-GEMINI-PAYLOAD"],
  );
  assert.equal(json, '{"request":"/v1/x","nonce":1700000000.5}');
});

test("private request normalizes only schema-declared int64 response fields", async () => {
  const body = '{"orderId":42,"count":3,"ratio":0.5,"amount":"100.00000001"}';
  const { fetchImpl } = recordingFetch({ status: 200, body });
  const client = new HttpTransport({ env: "sandbox", auth: stubAuth, fetchImpl });

  const res = await client.request<{
    orderId: bigint;
    count: number;
    ratio: number;
    amount: string;
  }>({
    method: "POST",
    path: "/v1/x",
    responseInt64Paths: [["orderId"]],
  });

  assert.equal(res.orderId, 42n);
  assert.equal(res.count, 3);
  assert.equal(res.ratio, 0.5);
  assert.equal(res.amount, "100.00000001");
});

test("public request normalizes schema-declared int64 fields in nested arrays", async () => {
  const { fetchImpl } = recordingFetch({
    status: 200,
    body: '{"items":[{"instrumentId":7},{"instrumentId":8}]}',
  });
  const client = new HttpTransport({ env: "sandbox", fetchImpl });

  const res = await client.requestPublic<{ items: Array<{ instrumentId: bigint }> }>({
    method: "GET",
    path: "/v1/instruments",
    responseInt64Paths: [["items", "*", "instrumentId"]],
  });

  assert.deepEqual(res.items.map(({ instrumentId }) => instrumentId), [7n, 8n]);
});

test("a response bigint can be sent back as an exact JSON integer request parameter", async () => {
  const orderId = 12345678901234567890n;
  const { fetchImpl, last } = recordingFetch({ status: 200, body: "{}" });
  const client = new HttpTransport({ env: "sandbox", auth: stubAuth, fetchImpl });

  await client.request({ method: "POST", path: "/v1/order/cancel", params: { orderId } });

  const encoded = fromBase64(last().init.headers["X-GEMINI-PAYLOAD"]);
  assert.match(encoded, /"orderId":12345678901234567890/); // numeric token, not a quoted string
  assert.equal(parseBoundaryRecord(encoded).orderId, orderId);
});

test("private requests preserve exact numeric JSON without JSON.rawJSON or marker collisions", () => {
  const packageDirectory = fileURLToPath(new URL("../..", import.meta.url));
  const script = `
    delete JSON.rawJSON;
    const { HttpTransport } = await import("./src/transport/http.ts");
    let sent = false;
    const client = new HttpTransport({
      env: "sandbox",
      auth: {
        nextNonce: () => "9007199254740993",
        credentialHeaders: async () => ({}),
      },
      fetchImpl: async (_url, init) => {
        const payload = Buffer.from(init.headers["X-GEMINI-PAYLOAD"], "base64").toString("utf8");
        if (payload !== '{"request":"/v1/x","clientOrderId":"__gemini_raw_json_0__0__","orderId":12345678901234567890,"__gemini_raw_json_0__0__":"property","nonce":9007199254740993}') {
          throw new Error("numeric payload was not serialized exactly: " + payload);
        }
        return {
          status: 200,
          body: {
            getReader: () => ({
              read: async () => {
                if (sent) return { done: true };
                sent = true;
                return { done: false, value: new TextEncoder().encode("{}") };
              },
            }),
          },
        };
      },
    });
    await client.request({
      method: "POST",
      path: "/v1/x",
      params: {
        clientOrderId: "__gemini_raw_json_0__0__",
        orderId: 12345678901234567890n,
        __gemini_raw_json_0__0__: "property",
      },
    });
  `;

  execFileSync(process.execPath, ["--import", "tsx", "--input-type=module", "--eval", script], {
    cwd: packageDirectory,
    stdio: "pipe",
  });
});

// The error table, driven through BOTH envelopes the repo emits:
//   gateway: { result: "error", reason, message }
//   PM svc:  { error, message }   (inconsistent code casing)
const ERROR_CASES: Array<{
  name: string;
  status: number;
  body: string;
  is: new (...args: never[]) => SdkError;
  reason?: string;
}> = [
  {
    name: "400 + reason InvalidNonce (gateway envelope)",
    status: 400,
    body: '{"result":"error","reason":"InvalidNonce","message":"bad nonce"}',
    is: InvalidNonce,
    reason: "InvalidNonce",
  },
  {
    name: "403 + error MissingRole (PM envelope)",
    status: 403,
    body: '{"error":"MissingRole","message":"no role"}',
    is: MissingRole,
    reason: "MissingRole",
  },
  {
    name: "403 + AcceptTermsRequired",
    status: 403,
    body: '{"result":"error","reason":"AcceptTermsRequired"}',
    is: AcceptTermsRequired,
    reason: "AcceptTermsRequired",
  },
  {
    name: "403 + TERMS_NOT_ACCEPTED PM envelope",
    status: 403,
    body: '{"error":"TERMS_NOT_ACCEPTED","message":"Prediction markets terms must be accepted before placing orders"}',
    is: AcceptTermsRequired,
    reason: "TERMS_NOT_ACCEPTED",
  },
  {
    name: "403 + terms sentence in the error field",
    status: 403,
    body: '{"error":"Prediction markets terms must be accepted before placing orders"}',
    is: AcceptTermsRequired,
    reason: "Prediction markets terms must be accepted before placing orders",
  },
  {
    name: "400 + MissingNonce",
    status: 400,
    body: '{"result":"error","reason":"MissingNonce"}',
    is: MissingNonce,
    reason: "MissingNonce",
  },
  {
    name: "400 + InvalidSignature",
    status: 400,
    body: '{"result":"error","reason":"InvalidSignature"}',
    is: InvalidSignature,
    reason: "InvalidSignature",
  },
  {
    name: "406 + InsufficientFunds",
    status: 406,
    body: '{"result":"error","reason":"InsufficientFunds"}',
    is: InsufficientFunds,
    reason: "InsufficientFunds",
  },
  {
    name: "429 + reason RateLimit maps to RateLimitError",
    status: 429,
    body: '{"result":"error","reason":"RateLimit"}',
    is: RateLimitError,
    reason: "RateLimit",
  },
  {
    name: "400 unknown reason falls back to status default InvalidRequest",
    status: 400,
    body: '{"error":"UNKNOWN_BAD_REQUEST"}',
    is: InvalidRequest,
  },
  {
    name: "403 unknown reason falls back to status default MissingRole",
    status: 403,
    body: '{"error":"UNKNOWN_FORBIDDEN"}',
    is: MissingRole,
  },
  {
    name: "404 unknown reason falls back to status default NotFoundError",
    status: 404,
    body: '{"error":"NOT_FOUND","message":"missing"}',
    is: NotFoundError,
  },
  {
    name: "500 unknown reason falls back to ServiceUnavailable",
    status: 500,
    body: '{"error":"An unexpected error occurred"}',
    is: ServiceUnavailable,
  },
  {
    name: "402 unmapped status falls back to generic ApiError",
    status: 402,
    body: '{"error":"Whatever"}',
    is: ApiError,
  },
];

test("a 429 then 200 retries after a jittered backoff and returns the body", async () => {
  const { fetchImpl, calls } = sequenceFetch([
    { status: 429, body: "" },
    { status: 200, body: '{"ok":true}' },
  ]);
  const sleeps: number[] = [];
  const client = new HttpTransport({
    env: "sandbox",
    auth: stubAuth,
    fetchImpl,
    backoff: { baseMs: 500, factor: 2 },
    random: () => 0, // jitter floor -> delay is exactly raw/2, deterministic
    sleep: async (ms) => {
      sleeps.push(ms);
    },
  });

  const res = await client.request<{ ok: boolean }>({ method: "GET", path: "/v1/x", retryable: true });

  assert.equal(res.ok, true);
  assert.equal(calls(), 2); // one retry
  assert.deepEqual(sleeps, [250]); // backoffDelay(0) = 500/2
});

test("constructor rejects retry counts that cannot provide a finite bound", () => {
  for (const maxRetries of [Number.NaN, Number.POSITIVE_INFINITY, -1, 1.5]) {
    assert.throws(
      () => new HttpTransport({ env: "sandbox", maxRetries }),
      (err: BoundaryValue) => err instanceof SdkError && /maxRetries.*non-negative integer/i.test(err.message),
    );
  }
  for (const maxResponseSizeBytes of [Number.NaN, Number.POSITIVE_INFINITY, 0, -1, 1.5]) {
    assert.throws(
      () => new HttpTransport({ env: "sandbox", maxResponseSizeBytes }),
      (err: BoundaryValue) => err instanceof SdkError && /maxResponseSizeBytes.*safe integer/i.test(err.message),
    );
  }
});

test("maxRetries zero surfaces the first 429 without sleeping", async () => {
  const { fetchImpl, calls } = sequenceFetch([{ status: 429, body: "" }]);
  let sleeps = 0;
  const client = new HttpTransport({
    env: "sandbox",
    auth: stubAuth,
    fetchImpl,
    maxRetries: 0,
    sleep: async () => {
      sleeps++;
    },
  });

  await assert.rejects(
    client.request({ method: "GET", path: "/v1/x", retryable: true }),
    (err: BoundaryValue) => err instanceof RateLimitError,
  );
  assert.equal(calls(), 1);
  assert.equal(sleeps, 0);
});

test("exhausting 429 retries throws RateLimitError after the bounded backoffs", async () => {
  const { fetchImpl, calls } = sequenceFetch([{ status: 429, body: "" }]);
  const sleeps: number[] = [];
  const client = new HttpTransport({
    env: "sandbox",
    auth: stubAuth,
    fetchImpl,
    maxRetries: 2,
    backoff: { baseMs: 500, factor: 2 },
    random: () => 0,
    sleep: async (ms) => {
      sleeps.push(ms);
    },
  });

  await assert.rejects(
    client.request({ method: "GET", path: "/v1/x", retryable: true }),
    (err: BoundaryValue) => err instanceof RateLimitError,
  );

  assert.equal(calls(), 3); // initial + 2 retries
  assert.deepEqual(sleeps, [250, 500]); // backoffDelay(0), backoffDelay(1)
});

test("429 backoff applies non-floor jitter and caps later attempts", async () => {
  const { fetchImpl } = sequenceFetch([
    { status: 429, body: "" },
    { status: 429, body: "" },
    { status: 429, body: "" },
    { status: 200, body: "{}" },
  ]);
  const sleeps: number[] = [];
  const client = new HttpTransport({
    env: "sandbox",
    auth: stubAuth,
    fetchImpl,
    maxRetries: 3,
    backoff: { baseMs: 100, factor: 10, capMs: 1_000 },
    random: () => 0.5,
    sleep: async (ms) => {
      sleeps.push(ms);
    },
  });

  await client.request({ method: "GET", path: "/v1/x", retryable: true });

  assert.deepEqual(sleeps, [75, 750, 750]); // 75% equal jitter; raw delay capped at 1,000ms
});

// A fake that records the offset/limit of each page request and returns a
// queued page body per call.
function paginatingFetch(pages: string[]) {
  const offsets: number[] = [];
  const limits: number[] = [];
  let n = 0;
  const fetchImpl: FetchLike = async (_url, init) => {
    const payload = JSON.parse(
      fromBase64(init.headers["X-GEMINI-PAYLOAD"]),
    );
    offsets.push(payload.offset);
    limits.push(payload.limit);
    const body = pages[Math.min(n, pages.length - 1)];
    n++;
    return streamingTextResponse(body);
  };
  return { fetchImpl, offsets, limits };
}

test("paginate walks offsets and stops on a short page", async () => {
  const { fetchImpl, offsets } = paginatingFetch([
    '[{"id":1},{"id":2},{"id":3}]', // full page (limit 3) -> keep going
    '[{"id":4},{"id":5}]', // short page (< 3) -> stop
  ]);
  const client = new HttpTransport({ env: "sandbox", auth: stubAuth, fetchImpl });

  const ids: bigint[] = [];
  for await (const item of client.paginate<{ id: bigint }>({
    method: "POST",
    path: "/v1/list",
    limit: 3,
    responseInt64Paths: [["*", "id"]],
  })) {
    ids.push(item.id);
  }

  assert.deepEqual(ids, [1n, 2n, 3n, 4n, 5n]);
  assert.deepEqual(offsets, [0, 3]); // second page requested at offset = limit
});

test("paginate errors omit caller query values", async () => {
  const { fetchImpl } = paginatingFetch(["{}"]);
  const client = new HttpTransport({ env: "sandbox", auth: stubAuth, fetchImpl });

  await assert.rejects(async () => {
    for await (const _item of client.paginate({ method: "POST", path: "/v1/list?account=private-account" })) { /* consume */ }
  }, (err: BoundaryValue) => {
    assert.ok(err instanceof SdkError);
    assert.equal(err.message.includes("private-account"), false);
    assert.equal(err.message.includes("/v1/list"), true);
    return true;
  });
});

test("paginate stops at maxItems and bounds the final page", async () => {
  const { fetchImpl, limits } = paginatingFetch([
    '[{"id":1},{"id":2}]',
    '[{"id":3},{"id":4}]',
  ]);
  const client = new HttpTransport({ env: "sandbox", auth: stubAuth, fetchImpl });
  const items: BoundaryValue[] = [];
  for await (const item of client.paginate({ method: "GET", path: "/v1/items", limit: 2, maxItems: 3, retryable: true })) items.push(item);
  assert.deepEqual(items, [{ id: 1 }, { id: 2 }, { id: 3 }]);
  assert.deepEqual(limits, [2, 1]);
});

test("paginate can fail loudly when offset drift repeats a logical record", async () => {
  const { fetchImpl } = paginatingFetch([
    '[{"id":1},{"id":2}]',
    '[{"id":2},{"id":3}]',
  ]);
  const client = new HttpTransport({ env: "sandbox", auth: stubAuth, fetchImpl });

  const pending = (async () => {
    for await (const _item of client.paginate<{ id: number }>({
      method: "POST",
      path: "/v1/orders",
      limit: 2,
      dedupeKey: (item) => String(item.id),
    })) { /* consume until the duplicate is detected */ }
  })();

  await assert.rejects(pending, /duplicate item key 2/);
});

test("paginate unwraps a documented response envelope using its explicit item key", async () => {
  const { fetchImpl, offsets } = paginatingFetch([
    '{"orders":[{"id":1},{"id":2}],"pagination":{"limit":2,"offset":0,"total":3}}',
    '{"orders":[{"id":3}],"pagination":{"limit":2,"offset":2,"total":3}}',
  ]);
  const client = new HttpTransport({ env: "sandbox", auth: stubAuth, fetchImpl });

  const ids: number[] = [];
  for await (const item of client.paginate<{ id: number }>({
    method: "POST",
    path: "/v1/orders/active",
    limit: 2,
    itemsKey: "orders",
  })) {
    ids.push(item.id);
  }

  assert.deepEqual(ids, [1, 2, 3]);
  assert.deepEqual(offsets, [0, 2]);
});

test("paginate sends public offsets as query parameters without requiring auth", async () => {
  const urls: string[] = [];
  const pages = [
    '{"data":[{"id":1},{"id":2}],"pagination":{"limit":2,"offset":0,"total":3}}',
    '{"data":[{"id":3}],"pagination":{"limit":2,"offset":2,"total":3}}',
  ];
  const fetchImpl: FetchLike = async (url) => {
    urls.push(url);
    const body = pages[Math.min(urls.length - 1, pages.length - 1)];
    return streamingTextResponse(body);
  };
  const client = new HttpTransport({ env: "sandbox", fetchImpl });

  const ids: number[] = [];
  for await (const item of client.paginate<{ id: number }>({
    method: "GET",
    path: "/v1/prediction-markets/events",
    params: { status: ["active", "resolved"] },
    limit: 2,
    itemsKey: "data",
    visibility: "public",
  })) {
    ids.push(item.id);
  }

  assert.deepEqual(ids, [1, 2, 3]);
  assert.deepEqual(urls, [
    "https://api.sandbox.gemini.com/v1/prediction-markets/events?status=active&status=resolved&limit=2&offset=0",
    "https://api.sandbox.gemini.com/v1/prediction-markets/events?status=active&status=resolved&limit=2&offset=2",
  ]);
});

test("paginate can send private offsets in the URL while signing the canonical query path", async () => {
  const urls: string[] = [];
  const payloads: Array<BoundaryRecord> = [];
  const pages = [
    JSON.stringify({ payouts: Array.from({ length: 100 }, (_, index) => ({ id: index + 1 })) }),
    '{"payouts":[{"id":101}]}',
  ];
  const fetchImpl: FetchLike = async (url, init) => {
    urls.push(url);
    payloads.push(
      JSON.parse(fromBase64(init.headers["X-GEMINI-PAYLOAD"])),
    );
    const body = pages[Math.min(urls.length - 1, pages.length - 1)];
    return streamingTextResponse(body);
  };
  const client = new HttpTransport({ env: "sandbox", auth: stubAuth, fetchImpl });

  const ids: number[] = [];
  for await (const item of client.paginate<{ id: number }>({
    method: "POST",
    path: "/v1/prediction-markets/maker-rebate/payouts",
    limit: 500,
    maxLimit: 100,
    itemsKey: "payouts",
    parameterLocation: "query",
  })) {
    ids.push(item.id);
  }

  assert.equal(ids.length, 101);
  assert.equal(ids.at(-1), 101);
  assert.deepEqual(urls, [
    "https://api.sandbox.gemini.com/v1/prediction-markets/maker-rebate/payouts?limit=100&offset=0",
    "https://api.sandbox.gemini.com/v1/prediction-markets/maker-rebate/payouts?limit=100&offset=100",
  ]);
  assert.deepEqual(payloads, [
    {
      request: "/v1/prediction-markets/maker-rebate/payouts?limit=100&offset=0",
      nonce: 1700000000000,
    },
    {
      request: "/v1/prediction-markets/maker-rebate/payouts?limit=100&offset=100",
      nonce: 1700000000000,
    },
  ]);
});

test("private query pagination rejects a caller-owned nonce before fetch", async () => {
  const { fetchImpl, last } = recordingFetch({ status: 200, body: "[]" });
  const client = new HttpTransport({ env: "sandbox", auth: stubAuth, fetchImpl });

  await assert.rejects(
    async () => {
      for await (const _ of client.paginate({
        method: "POST",
        path: "/v1/prediction-markets/maker-rebate/payouts",
        params: { nonce: "stale" },
        parameterLocation: "query",
      })) {
        // The nonce guard must fail before the first item or network request.
      }
    },
    /nonce.*reserved/i,
  );
  assert.throws(() => last(), /fetch was never called/);
});

test("paginate rejects non-finite, fractional, and non-positive limits before fetch", async () => {
  const invalidOptions = [
    { limit: Number.NaN },
    { limit: Number.POSITIVE_INFINITY },
    { limit: 1.5 },
    { limit: 0 },
    { maxLimit: Number.NaN },
    { maxLimit: Number.POSITIVE_INFINITY },
    { maxLimit: 1.5 },
    { maxLimit: 0 },
  ];

  for (const invalid of invalidOptions) {
    const fetchImpl: FetchLike = async () => {
      throw new Error("fetch should not be called");
    };
    const client = new HttpTransport({ env: "sandbox", auth: stubAuth, fetchImpl });
    await assert.rejects(
      async () => {
        for await (const _ of client.paginate({
          method: "POST",
          path: "/v1/list",
          ...invalid,
        })) {
          // Validation must fail before iteration starts.
        }
      },
      /limit.*positive integer/i,
    );
  }
});

test("paginate clamps limit to the documented max of 500", async () => {
  const { fetchImpl, limits } = paginatingFetch(["[]"]);
  const client = new HttpTransport({ env: "sandbox", auth: stubAuth, fetchImpl });

  // eslint-disable-next-line no-empty
  for await (const _ of client.paginate({ method: "POST", path: "/v1/list", limit: 1000 })) {
  }

  assert.equal(limits[0], 500);
});

test("response int64 paths are not applied before typed error mapping", async () => {
  const { fetchImpl } = recordingFetch({
    status: 400,
    body: '{"reason":"InvalidNonce","orderId":"not-an-int64"}',
  });
  const client = new HttpTransport({ env: "sandbox", auth: stubAuth, fetchImpl });

  await assert.rejects(
    client.request({
      method: "POST",
      path: "/v1/x",
      responseInt64Paths: [["orderId"]],
    }),
    (err: BoundaryValue) => err instanceof InvalidNonce,
  );
});

test("a non-JSON error body still maps by status instead of throwing SyntaxError", async () => {
  // A proxy / load balancer 502 returns an HTML page, not JSON.
  const { fetchImpl } = recordingFetch({
    status: 502,
    body: "<html><body>Bad Gateway</body></html>",
  });
  const client = new HttpTransport({ env: "sandbox", auth: stubAuth, fetchImpl, maxRetries: 0 });

  await assert.rejects(
    client.request({ method: "POST", path: "/v1/x" }),
    (err: BoundaryValue) => {
      if (!(err instanceof ServiceUnavailable)) return false;
      assert.equal(err.status, 502);
      assert.equal(err.message.includes("Bad Gateway"), false);
      assert.equal("body" in err, false);
      assert.equal(JSON.stringify(serializeError(err)).includes("Bad Gateway"), false);
      return true;
    },
  );
});

test("a fetch failure is wrapped in SdkError with its native cause", async () => {
  const cause = new TypeError("DNS lookup failed");
  const fetchImpl: FetchLike = async () => {
    throw cause;
  };
  const client = new HttpTransport({ env: "sandbox", auth: stubAuth, fetchImpl });

  await assert.rejects(
    client.request({ method: "POST", path: "/v1/x" }),
    (err: BoundaryValue) => {
      if (!(err instanceof SdkError)) return false;
      assert.equal(err.cause, cause);
      assert.match(err.message, /request.*failed/i);
      return true;
    },
  );
});

test("transport errors keep query values out of their message", async () => {
  const client = new HttpTransport({
    env: "sandbox",
    auth: stubAuth,
    fetchImpl: async () => { throw new Error("network unavailable"); },
  });

  await assert.rejects(client.request({ method: "POST", path: "/v1/x?account=private-account" }), (err: BoundaryValue) => {
    assert.ok(err instanceof SdkError);
    assert.equal(err.message.includes("private-account"), false);
    assert.equal(err.message.includes("/v1/x"), true);
    return true;
  });
});

test("a response body read failure is wrapped in SdkError with its native cause", async () => {
  const cause = new TypeError("response stream aborted");
  const fetchImpl: FetchLike = async () => ({
    status: 200,
    body: {
      getReader: () => ({
        read: async () => { throw cause; },
        cancel: async () => {},
      }),
    },
  });
  const client = new HttpTransport({ env: "sandbox", auth: stubAuth, fetchImpl });

  await assert.rejects(
    client.request({ method: "POST", path: "/v1/x" }),
    (err: BoundaryValue) => {
      if (!(err instanceof SdkError)) return false;
      assert.equal(err.cause, cause);
      assert.match(err.message, /request.*failed/i);
      return true;
    },
  );
});

test("an existing SdkError from the HTTP transport is rethrown unchanged", async () => {
  const expected = new SdkError("transport already classified this failure");
  const fetchImpl: FetchLike = async () => {
    throw expected;
  };
  const client = new HttpTransport({ env: "sandbox", auth: stubAuth, fetchImpl });

  await assert.rejects(
    client.request({ method: "POST", path: "/v1/x" }),
    (err: BoundaryValue) => err === expected,
  );
});

test("a non-JSON success body fails loud as an SdkError, not a raw parse error", async () => {
  const { fetchImpl } = recordingFetch({ status: 200, body: "not json at all" });
  const client = new HttpTransport({ env: "sandbox", auth: stubAuth, fetchImpl });

  await assert.rejects(
    client.request({ method: "POST", path: "/v1/x" }),
    (err: BoundaryValue) => {
      if (!(err instanceof SdkError)) return false;
      assert.ok(!(err instanceof ApiError)); // no HTTP semantics — it's a protocol violation
      assert.match(err.message, /unparseable/i);
      return true;
    },
  );
});

test("a retry mints a fresh nonce and re-signs, never reusing the last one", async () => {
  let n = 999;
  const countingAuth: AuthStrategy = {
    nextNonce: () => String(++n),
    credentialHeaders: async (b64) => ({ "X-GEMINI-SIGNATURE": `sig(${b64})` }),
  };
  const payloads: string[] = [];
  const signatures: string[] = [];
  let call = 0;
  const fetchImpl: FetchLike = async (_url, init) => {
    payloads.push(init.headers["X-GEMINI-PAYLOAD"]);
    signatures.push(init.headers["X-GEMINI-SIGNATURE"]);
    const status = call === 0 ? 429 : 200;
    call++;
    return streamingTextResponse("{}", status);
  };
  const client = new HttpTransport({
    env: "sandbox",
    auth: countingAuth,
    fetchImpl,
    backoff: { baseMs: 1 },
    random: () => 0,
    sleep: async () => {},
  });

  await client.request({ method: "GET", path: "/v1/x", retryable: true });

  assert.equal(payloads.length, 2);
  assert.notEqual(payloads[0], payloads[1]); // different signed bytes
  assert.deepEqual(signatures, payloads.map((payload) => `sig(${payload})`));
  const nonces = payloads.map((b) => JSON.parse(fromBase64(b)).nonce);
  assert.deepEqual(nonces, [1000, 1001]); // strictly advanced
});

test("a retry snapshots trading params and changes only authentication state", async () => {
  const params = { orders: [{ symbol: "BTCUSD", amount: "1" }] };
  const amounts: string[] = [];
  let call = 0;
  const fetchImpl: FetchLike = async (_url, init) => {
    const payload = JSON.parse(
      fromBase64(init.headers["X-GEMINI-PAYLOAD"]),
    );
    amounts.push(payload.orders[0].amount);
    params.orders[0].amount = "999"; // caller mutation must not alter the retry
    return streamingTextResponse("{}", call++ === 0 ? 429 : 200);
  };
  const client = new HttpTransport({
    env: "sandbox",
    auth: stubAuth,
    fetchImpl,
    backoff: { baseMs: 1 },
    random: () => 0,
    sleep: async () => {},
  });

  await client.request({ method: "GET", path: "/v1/batch", params, retryable: true });

  assert.deepEqual(amounts, ["1", "1"]);
});

test("a private retry snapshots caller headers before asynchronous authentication", async () => {
  const headers = { "X-Request-Id": "original" };
  let releaseAuth: (() => void) | undefined;
  const authReady = new Promise<void>((resolve) => {
    releaseAuth = resolve;
  });
  const auth: AuthStrategy = {
    nextNonce: () => "1700000000000",
    credentialHeaders: async () => {
      await authReady;
      return { "X-GEMINI-APIKEY": "test-key" };
    },
  };
  const sent: string[] = [];
  let call = 0;
  const client = new HttpTransport({
    env: "sandbox",
    auth,
    fetchImpl: async (_url, init) => {
      sent.push(init.headers["X-Request-Id"]);
      return streamingTextResponse("{}", call++ === 0 ? 429 : 200);
    },
    backoff: { baseMs: 1 },
    random: () => 0,
    sleep: async () => {},
  });

  const request = client.request({ method: "GET", path: "/v1/x", headers, retryable: true });
  headers["X-Request-Id"] = "mutated";
  releaseAuth?.();
  await request;

  assert.deepEqual(sent, ["original", "original"]);
});

test("a public retry snapshots caller headers", async () => {
  const headers = { "X-Request-Id": "original" };
  const sent: string[] = [];
  let call = 0;
  const client = new HttpTransport({
    env: "sandbox",
    fetchImpl: async (_url, init) => {
      sent.push(init.headers["X-Request-Id"]);
      headers["X-Request-Id"] = "mutated";
      return streamingTextResponse("{}", call++ === 0 ? 429 : 200);
    },
    backoff: { baseMs: 1 },
    random: () => 0,
    sleep: async () => {},
  });

  await client.requestPublic({ method: "GET", path: "/v1/x", headers, retryable: true });

  assert.deepEqual(sent, ["original", "original"]);
});

test("paginate over an empty first page yields nothing and stops after one fetch", async () => {
  const { fetchImpl, offsets } = paginatingFetch(["[]"]);
  const client = new HttpTransport({ env: "sandbox", auth: stubAuth, fetchImpl });

  const items: BoundaryValue[] = [];
  for await (const item of client.paginate({ method: "POST", path: "/v1/list", limit: 50 })) {
    items.push(item);
  }

  assert.deepEqual(items, []);
  assert.deepEqual(offsets, [0]); // no second fetch
});

for (const c of ERROR_CASES) {
  test(`error mapping: ${c.name}`, async () => {
    const { fetchImpl } = recordingFetch({ status: c.status, body: c.body });
    // No retries in this suite: a 429 should surface immediately for assertion.
    const client = new HttpTransport({
      env: "sandbox",
      auth: stubAuth,
      fetchImpl,
      maxRetries: 0,
    });

    await assert.rejects(
      client.request({ method: "POST", path: "/v1/x" }),
      (err: BoundaryValue) => {
        if (!(err instanceof c.is) || !(err instanceof ApiError) || !(err instanceof SdkError)) return false;
        assert.equal(err.status, c.status);
        if (c.reason) assert.equal(err.reason, c.reason);
        return true;
      },
    );
  });
}
