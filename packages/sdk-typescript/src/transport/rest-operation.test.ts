import assert from "node:assert/strict";
import test from "node:test";

import {
  type AuthStrategy,
  type FetchLike,
  type HttpMethod,
  HttpTransport,
  type RestQueryParameter,
} from "./http.js";
import { ApiError, SdkError } from "../errors.js";
import {
  PREDICTION_MARKET_OPERATIONS,
  type PredictionMarketOperationTypes,
} from "../generated/operations.js";
import { TRADING_OPERATIONS } from "../generated/trading/operations.js";
import { executeRestOperation } from "./rest-operation.js";
import type { DiagnosticEvent } from "../observability/diagnostics.js";
import type { BoundaryRecord, BoundaryValue } from "../utils/boundary-value.js";
import { fromBase64 } from "../utils/encoding.js";
import { streamingBytesResponse, streamingTextResponse } from "../tests/support/http-fixtures.js";

type Request = {
  url: string;
  init: { method: HttpMethod; headers: Record<string, string>; body?: string };
};

const publicOperation = {
  method: "get",
  path: "/v1/items/{item}",
  access: "public",
  parameters: [
    { name: "item", in: "path", required: true, style: "simple", explode: false },
    { name: "tags", in: "query", required: false, style: "form", explode: true, "shape": "array" },
    { name: "active", in: "query", required: false, style: "form", explode: true, "shape": "scalar" },
    { name: "id", in: "query", required: false, style: "form", explode: true, "shape": "scalar" },
    { name: "amount", in: "query", required: false, style: "form", explode: true, "shape": "scalar" },
  ],
  headers: [{ name: "X-Trace", required: false }],
  requestBody: false,
  requestBodyRequired: false,
  successStatuses: [200],
  responseMode: "json",
  responseContentTypes: ["application/json"],
  responseInt64Paths: [],
  retryable: true,
} as const;

const privateOperation = {
  method: "post",
  path: "/v1/items/{item}",
  access: "authenticated",
  parameters: [
    { name: "item", in: "path", required: true, style: "simple", explode: false },
    { name: "active", in: "query", required: false, style: "form", explode: true, "shape": "scalar" },
  ],
  headers: [{ name: "Idempotency-Key", required: false }],
  requestBody: true,
  requestBodyRequired: true,
  successStatuses: [200],
  responseMode: "json",
  responseContentTypes: ["application/json"],
  responseInt64Paths: [],
  retryable: false,
} as const;

const privateGetOperation = {
  ...privateOperation,
  method: "get",
  requestBody: false,
  requestBodyRequired: false,
  retryable: true,
} as const;

function transport(opts: {
  auth?: AuthStrategy;
  statuses?: number[];
  response?: string;
  failure?: SdkError;
  contentType?: string | null;
  onDiagnostic?: (event: DiagnosticEvent) => void;
} = {}) {
  const requests: Request[] = [];
  const fetchImpl: FetchLike = async (url, init) => {
    requests.push({ url, init });
    if (opts.failure) throw opts.failure;
    return streamingTextResponse(opts.response ?? "{}", opts.statuses?.shift() ?? 200, {
      get: (name) => name.toLowerCase() === "content-type" ? (opts.contentType ?? "application/json") : null,
    });
  };
  return {
    transport: new HttpTransport({
      env: "sandbox",
      auth: opts.auth,
      fetchImpl,
      maxRetries: 1,
      sleep: async () => {},
      random: () => 0,
      onDiagnostic: opts.onDiagnostic,
    }),
    requests,
  };
}

test("generated operations expose only safe order context in diagnostics", async () => {
  const events: DiagnosticEvent[] = [];
  const auth: AuthStrategy = {
    nextNonce: () => undefined,
    credentialHeaders: async () => ({ Authorization: "Bearer secret" }),
  };
  const { transport: http } = transport({ auth, onDiagnostic: (event) => events.push(event) });

  await executeRestOperation<{ input: { item: string; clientOrderId: string; token: string }; response: {} }>(
    http,
    { ...privateOperation, operation: "trading.placeOrder" },
    { item: "order", clientOrderId: "client-1", token: "secret-payload" },
  );

  const end = events.find((event) => event.name === "request.end");
  assert.deepEqual(end?.operationContext, {
    operation: "trading.placeOrder",
    clientOrderId: "client-1",
  });
  assert.equal(JSON.stringify(end).includes("secret-payload"), false);
});

test("private credential generation receives the transport deadline signal", async (t) => {
  let credentialSignal: AbortSignal | undefined;
  const auth: AuthStrategy = {
    nextNonce: () => undefined,
    credentialHeaders: async (_payload, options) => {
      credentialSignal = options?.signal;
      return new Promise<Record<string, string>>(() => {});
    },
  };
  const { transport: http } = transport({ auth });
  t.mock.timers.enable({ apis: ["setTimeout"] });

  const request = executeRestOperation(
    http,
    privateOperation,
    { item: "item", active: true },
    { timeoutMs: 10 },
  );
  await Promise.resolve();
  t.mock.timers.tick(10);

  await assert.rejects(request, /deadline/);
  assert.ok(credentialSignal, "credential generation must receive a signal");
  assert.equal(credentialSignal.aborted, true, "the effective transport deadline must abort credential generation");
});

test("generated operation types can be passed to the executor", async () => {
  const { transport: http } = transport();

  await executeRestOperation<PredictionMarketOperationTypes["getEvent"]>(
    http,
    PREDICTION_MARKET_OPERATIONS.getEvent,
    { eventTicker: "event" },
  );
});

test("REST promises expose response metadata without issuing a second request", async () => {
  const { transport: http, requests } = transport({ response: '{"ok":true}' });
  const result = executeRestOperation<{
    input: { item: string };
    response: { ok: boolean };
  }>(http, publicOperation, { item: "item" });

  assert.deepEqual(await result, { ok: true });
  const withResponse = await result.withResponse();
  assert.deepEqual(withResponse.data, { ok: true });
  assert.equal(withResponse.metadata.status, 200);
  assert.equal(withResponse.metadata.endpoint, "/v1/items/item");
  assert.equal(requests.length, 1);
});

test("REST promises preserve the same rejection through both await paths", async () => {
  const { transport: http } = transport({
    statuses: [500],
    response: '{"reason":"ServiceUnavailable"}',
  });
  const result = executeRestOperation<{
    input: { item: string };
    response: { ok: boolean };
  }>(http, publicOperation, { item: "item" });

  const ordinaryError = await result.catch((error: BoundaryValue) => error);
  const metadataError = await result.withResponse().catch((error: BoundaryValue) => error);

  if (!(ordinaryError instanceof ApiError)) throw ordinaryError;
  assert.equal(ordinaryError.status, 500);
  assert.strictEqual(metadataError, ordinaryError);
});

test("generated REST metadata cannot be overridden by runtime request options", async () => {
  const { transport: http, requests } = transport({ statuses: [503, 200], response: '{"ok":true}' });
  const response = await executeRestOperation<{ input: { item: string }; response: { ok: boolean } }>(
    http,
    publicOperation,
    { item: "item" },
    // SAFETY: This fixture intentionally bypasses the request type to test runtime metadata enforcement.
    {
      headers: { "X-Trace": "trace" },
      method: "POST",
      path: "/attacker-controlled-path",
      query: { injected: "true" },
      responseMode: "file",
      responseContract: { successStatuses: [500], responseContentTypes: ["text/plain"] },
      retryable: false,
    } as never,
  );

  assert.deepEqual(response, { ok: true });
  assert.equal(requests[0]?.init.method, "GET");
  assert.equal(requests[0]?.url, "https://api.sandbox.gemini.com/v1/items/item");
  assert.equal(requests[0]?.init.headers["X-Trace"], "trace");
  assert.equal(requests.length, 2, "generated retryable metadata must remain effective");
});

test("executor forwards response int64 paths to HttpTransport", async () => {
  const { transport: http } = transport({ response: '{"orderId":9007199254740993}' });
  const response = await executeRestOperation<{
    input?: never;
    response: { orderId: bigint };
  }>(
    http,
    {
      ...publicOperation,
      path: "/v1/order",
      parameters: [],
      responseInt64Paths: [["orderId"]],
    },
  );

  assert.equal(response.orderId, 9007199254740993n);
});

test("public GET is unsigned and preserves query serialization", async () => {
  let authCalls = 0;
  const { transport: http, requests } = transport({
    auth: {
      nextNonce: () => { authCalls++; return "1700000000000"; },
      credentialHeaders: async () => { authCalls++; return {}; },
    },
  });

  await executeRestOperation<{ input: { item: string; tags: string[]; active: boolean; id: bigint; amount: string; "X-Trace": string }; response: {} }>(
    http,
    publicOperation,
    { item: "a/b:c", tags: ["one", "two"], active: true, id: 9007199254740993n, amount: "1.2300", "X-Trace": "trace" },
  );

  assert.equal(requests[0]?.url, "https://api.sandbox.gemini.com/v1/items/a%2Fb:c?tags=one&tags=two&active=true&id=9007199254740993&amount=1.2300");
  assert.deepEqual(requests[0]?.init.headers, { Accept: "application/json", "X-Trace": "trace" });
  assert.equal(authCalls, 0);
});

function queryOperation(parameters: readonly RestQueryParameter[]) {
  return {
    ...publicOperation,
    path: "/v1/items",
    parameters,
    headers: [],
  } as const;
}

async function queryUrl(parameters: readonly RestQueryParameter[], query: BoundaryRecord) {
  const { transport: http, requests } = transport();
  await executeRestOperation<{ input: BoundaryRecord; response: {} }>(
    http,
    queryOperation(parameters),
    query,
  );
  return requests[0]?.url;
}

test("query serialization follows OpenAPI style and explode metadata", async () => {
  assert.equal(
    await queryUrl([{ name: "tags", in: "query", required: false, style: "form", explode: false, "shape": "array" }], { tags: ["one", "two"] }),
    "https://api.sandbox.gemini.com/v1/items?tags=one,two",
  );
  assert.equal(
    await queryUrl([{ name: "filter", in: "query", required: false, style: "form", explode: false, "shape": "object" }], { filter: { status: "open", side: "buy" } }),
    "https://api.sandbox.gemini.com/v1/items?filter=status,open,side,buy",
  );
  assert.equal(
    await queryUrl([{ name: "filter", in: "query", required: false, style: "form", explode: true, "shape": "object" }], { filter: { status: "open", side: "buy" } }),
    "https://api.sandbox.gemini.com/v1/items?status=open&side=buy",
  );
  assert.equal(
    await queryUrl([{ name: "tags", in: "query", required: false, style: "spaceDelimited", explode: false, "shape": "array" }], { tags: ["one", "two"] }),
    "https://api.sandbox.gemini.com/v1/items?tags=one%20two",
  );
  assert.equal(
    await queryUrl([{ name: "tags", in: "query", required: false, style: "pipeDelimited", explode: false, "shape": "array" }], { tags: ["one", "two"] }),
    "https://api.sandbox.gemini.com/v1/items?tags=one%7Ctwo",
  );
  assert.equal(
    await queryUrl([{ name: "filter", in: "query", required: false, style: "deepObject", explode: true, "shape": "object" }], { filter: { status: "open" } }),
    "https://api.sandbox.gemini.com/v1/items?filter%5Bstatus%5D=open",
  );
  assert.equal(
    await queryUrl([{ name: "value", in: "query", required: false, style: "form", explode: true, "shape": "scalar", allowReserved: true }], { value: "a/b?c" }),
    "https://api.sandbox.gemini.com/v1/items?value=a/b?c",
  );
});

test("query validation rejects null and invalid style shapes before dispatch", async () => {
  const { transport: http, requests } = transport();
  const operation = queryOperation([{ name: "tags", in: "query", required: false, style: "form", explode: true, "shape": "array" }]);
  for (const query of [{ tags: null }, { tags: ["one", null] }, { tags: { nested: { value: "bad" } } }]) {
    await assert.rejects(
      executeRestOperation<{ input: BoundaryRecord; response: {} }>(http, operation, query),
      /null|scalar|array/i,
    );
  }
  assert.equal(requests.length, 0);
});

test("generated scalar query parameters reject object values before dispatch", async () => {
  const { transport: http, requests } = transport();
  await assert.rejects(
    executeRestOperation<PredictionMarketOperationTypes["getMakerRebateRates"]>(
      http,
      PREDICTION_MARKET_OPERATIONS.getMakerRebateRates,
      { category: { ignored: "500" } },
    ),
    /string|scalar/i,
  );
  assert.equal(requests.length, 0);
});

test("generated primitive parameter types reject malformed path and query values before dispatch", async () => {
  const { transport: http, requests } = transport();
  const operation = {
    ...publicOperation,
    parameters: [
      { name: "item", in: "path", required: true, style: "simple", explode: false, valueType: "string" },
      { name: "limit", in: "query", required: false, style: "form", explode: true, valueType: "integer", "shape": "scalar", allowReserved: false },
    ],
  } as const;
  for (const input of [{ item: null }, { item: 123 }, { item: "BTCUSD", limit: "20" }, { item: "BTCUSD", limit: 1.5 }]) {
    await assert.rejects(
      executeRestOperation<{ input: BoundaryRecord; response: {} }>(http, operation, input),
      /parameter .* must be a (string|integer)/i,
    );
  }
  assert.equal(requests.length, 0);
});

test("composed primitive parameter metadata accepts only its documented primitive alternatives", async () => {
  const { transport: http, requests } = transport();
  const operation = queryOperation([
      { name: "timestamp", in: "query", required: false, style: "form", explode: true, valueTypes: ["string", "integer"], "shape": "scalar", allowReserved: false },
      { name: "flags", in: "query", required: false, style: "form", explode: true, itemTypes: ["boolean", "integer"], "shape": "array", allowReserved: false },
  ]);
  await executeRestOperation<{ input: BoundaryRecord; response: {} }>(http, operation, { timestamp: 1, flags: [true, 2] });
  await assert.rejects(
    executeRestOperation<{ input: BoundaryRecord; response: {} }>(http, operation, { timestamp: true }),
    /string or integer/,
  );
  await assert.rejects(
    executeRestOperation<{ input: BoundaryRecord; response: {} }>(http, operation, { flags: ["true"] }),
    /boolean or integer/,
  );
  assert.equal(requests.length, 1);
});

test("required query and caller-owned headers are checked case-insensitively", async () => {
  const { transport: http, requests } = transport();
  const operation = {
    ...queryOperation([{ name: "symbol", in: "query", required: true, style: "form", explode: true, "shape": "scalar" }]),
    headers: [{ name: "X-Request-Id", required: true }],
  } as const;
  for (const input of [{}, { symbol: null }, { symbol: "BTCUSD" }, { symbol: "BTCUSD", "X-Request-Id": null }]) {
    await assert.rejects(
      executeRestOperation<{ input: BoundaryRecord; response: {} }>(http, operation, input),
      /missing|required|null/i,
    );
  }
  await executeRestOperation<{ input: BoundaryRecord; response: {} }>(
    http,
    operation,
    { symbol: "BTCUSD", "x-request-id": "request-1" },
  );
  assert.equal(requests[0]?.url, "https://api.sandbox.gemini.com/v1/items?symbol=BTCUSD");
  assert.equal(requests[0]?.init.headers["X-Request-Id"], "request-1");
});

test("file operations use the shared executor path for public downloads", async () => {
  const bytes = new Uint8Array([1, 2, 3]);
  const requests: Request[] = [];
  const fetchImpl: FetchLike = async (url, init) => {
    requests.push({ url, init });
    return streamingBytesResponse(bytes, 200, {
      get: (name) => ({
        "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "content-disposition": "attachment; filename=FundingAmount_BTCGUSDPERP.xlsx",
      })[name.toLowerCase()] ?? null,
    });
  };
  const http = new HttpTransport({ env: "sandbox", fetchImpl });

  const response = await executeRestOperation<{
    input: { symbol: string };
    response: { bytes: Uint8Array; contentType?: string; contentDisposition?: string };
  }>(
    http,
    {
      ...publicOperation,
      path: "/v1/fundingamountreport/records.xlsx",
      parameters: [{ name: "symbol", in: "query", required: true, style: "form", explode: true, "shape": "scalar" }],
      responseMode: "file",
      responseContentTypes: [
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "text/csv",
      ],
      responseInt64Paths: [],
    },
    { symbol: "BTCGUSDPERP" },
  );

  assert.deepEqual(response.bytes, bytes);
  assert.equal(response.contentType, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  assert.equal(response.contentDisposition, "attachment; filename=FundingAmount_BTCGUSDPERP.xlsx");
  assert.equal(requests[0]?.url, "https://api.sandbox.gemini.com/v1/fundingamountreport/records.xlsx?symbol=BTCGUSDPERP");
});

test("file operations use the shared executor path for authenticated downloads", async () => {
  const auth: AuthStrategy = {
    nextNonce: () => undefined,
    credentialHeaders: async () => ({ Authorization: "Bearer token" }),
  };
  const fetchImpl: FetchLike = async () => streamingBytesResponse(new Uint8Array([4, 5]), 200, {
    get: (name) => ({
      "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition": "attachment; filename=FundingPayment_Report.xlsx",
    })[name.toLowerCase()] ?? null,
  });
  const http = new HttpTransport({ env: "sandbox", auth, fetchImpl });

  const response = await executeRestOperation<{
    input: { fromDate?: string; account?: string };
    response: { bytes: Uint8Array; contentDisposition?: string };
  }>(
    http,
    {
      ...privateOperation,
      path: "/v1/perpetuals/fundingpaymentreport/records.xlsx",
      parameters: [{ name: "fromDate", in: "query", required: false, style: "form", explode: true, "shape": "scalar" }],
      responseMode: "file",
      responseContentTypes: ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
      responseInt64Paths: [],
    },
    { fromDate: "2024-04-10", account: "primary" },
  );

  assert.deepEqual(response.bytes, new Uint8Array([4, 5]));
  assert.equal(response.contentDisposition, "attachment; filename=FundingPayment_Report.xlsx");
});

test("executor enforces declared statuses and normalized success media types", async () => {
  const json = transport({ contentType: "Application/JSON; charset=utf-8" });
  await executeRestOperation<{ input?: never; response: {} }>(
    json.transport,
    { ...publicOperation, path: "/v1/items", parameters: [] },
  );
  const expected = transport({ statuses: [201] });
  await executeRestOperation<{ input?: never; response: {} }>(
    expected.transport,
    { ...publicOperation, path: "/v1/items", parameters: [], successStatuses: [201] },
  );

  const unexpected = transport({ statuses: [200] });
  await assert.rejects(
    executeRestOperation<{ input?: never; response: {} }>(
      unexpected.transport,
      { ...publicOperation, path: "/v1/items", parameters: [], successStatuses: [201] },
    ),
    /unexpected success status 200/i,
  );
});

test("file operations reject missing and undeclared success media types", async () => {
  const operation = {
    ...publicOperation,
    path: "/v1/items.xlsx",
    parameters: [],
    responseMode: "file" as const,
    responseContentTypes: ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
  };
  for (const contentType of [null, "text/html", "application/json"]) {
    const { transport: http } = transport({ contentType });
    await assert.rejects(
      executeRestOperation<{ input?: never; response: { bytes: Uint8Array } }>(http, operation),
      /success content type/i,
    );
  }
});

test("authenticated operations use the injected AuthStrategy boundary", async () => {
  for (const credentialHeaders of [
    async () => ({ "X-GEMINI-APIKEY": "key", "X-GEMINI-SIGNATURE": "signature" }),
    async () => ({ Authorization: "Bearer token" }),
  ]) {
    let authCalls = 0;
    const { transport: http, requests } = transport({
      auth: {
        nextNonce: () => { authCalls++; return undefined; },
        credentialHeaders: async () => { authCalls++; return credentialHeaders(); },
      },
    });
    const body = { price: "1.2300", quantity: 9007199254740993n };

    await executeRestOperation<{ input: { item: string; "Idempotency-Key": string; price: string; quantity: bigint }; response: {} }>(
      http,
      privateOperation,
      { item: "item", ...body, "Idempotency-Key": "request-1" },
    );

    assert.equal(authCalls, 2);
    assert.equal(requests[0]?.init.headers.Accept, "application/json");
    const payload = fromBase64(requests[0]?.init.headers["X-GEMINI-PAYLOAD"] ?? "");
    assert.equal(payload, '{"request":"/v1/items/item","price":"1.2300","quantity":9007199254740993}');
    assert.equal(requests[0]?.init.headers["Idempotency-Key"], "request-1");
    await executeRestOperation<{ input: { item: string; active: boolean }; response: {} }>(
      http,
      privateGetOperation,
      { item: "item", active: true },
    );
    assert.equal(requests[1]?.init.method, "GET");
    assert.equal(requests[1]?.url, "https://api.sandbox.gemini.com/v1/items/item?active=true");
    assert.equal(authCalls, 4);
  }
});

test("executor supports every discovered HTTP method", async () => {
  const { transport: http, requests } = transport({
    auth: { nextNonce: () => undefined, credentialHeaders: async () => ({}) },
  });

  for (const method of ["get", "post", "put", "patch", "delete"] as const) {
    await executeRestOperation<{ input?: never; response: {} }>(
      http,
      {
        ...publicOperation,
        method,
        path: `/v1/${method}`,
        parameters: [],
      },
    );
    assert.equal(requests.at(-1)?.init.method, method.toUpperCase());
  }
});

test("executor accepts safe request int64 numbers and rejects unsafe ones before auth", async () => {
  let authCalls = 0;
  const requests: Request[] = [];
  const http = new HttpTransport({
    env: "sandbox",
    auth: {
      nextNonce: () => { authCalls++; return undefined; },
      credentialHeaders: async () => { authCalls++; return {}; },
    },
    fetchImpl: async (url, init) => {
      requests.push({ url, init });
      return streamingTextResponse("{}", 200, { get: () => "application/json" });
    },
  });
  const operation = {
    ...privateOperation,
    operation: "trading.getOrderStatus",
    path: "/v1/order/status",
    parameters: [],
    requestInt64Paths: {
      body: [{ path: ["order_id"], unsigned: true }],
      path: [],
      query: [],
    },
  };

  await executeRestOperation<{ input: { order_id: bigint | number }; response: {} }>(
    http,
    operation,
    { order_id: Number.MAX_SAFE_INTEGER },
  );
  const payload = fromBase64(requests[0]!.init.headers["X-GEMINI-PAYLOAD"]);
  assert.match(payload, /"order_id":9007199254740991/);

  await executeRestOperation<{ input: { order_id: bigint | number }; response: {} }>(
    http,
    operation,
    { order_id: 18446744073709551615n },
  );
  const widePayload = fromBase64(requests[1]!.init.headers["X-GEMINI-PAYLOAD"]);
  assert.match(widePayload, /"order_id":18446744073709551615/);

  await assert.rejects(
    executeRestOperation<{ input: { order_id: bigint | number }; response: {} }>(
      http,
      operation,
      { order_id: Number.MAX_SAFE_INTEGER + 1 },
    ),
    (error: BoundaryValue) =>
      error instanceof SdkError &&
      error.name === "ValidationError" &&
      "operation" in error &&
      error.operation === "trading.getOrderStatus" &&
      "field" in error &&
      error.field === "order_id" &&
      "rule" in error &&
      error.rule === "format",
  );
  assert.equal(authCalls, 4);
  assert.equal(requests.length, 2);
});

test("authenticated operations retain transport failures and retry behavior", async () => {
  const auth: AuthStrategy = { nextNonce: () => undefined, credentialHeaders: async () => ({}) };
  const retry = transport({ auth, statuses: [429, 200] });
  await executeRestOperation<{ input: { item: string; active: boolean }; response: {} }>(
    retry.transport,
    privateGetOperation,
    { item: "item", active: true },
  );
  assert.equal(retry.requests.length, 2);

  const failure = new SdkError("transport failure");
  const failing = transport({ auth, failure });
  await assert.rejects(
    executeRestOperation<{ input: { item: string; active: boolean }; response: {} }>(
      failing.transport,
      privateGetOperation,
      { item: "item", active: true },
    ),
    (error: BoundaryValue) => error === failure,
  );
});

test("Trading order placement and cancellation mutations are sent at most once", async () => {
  const auth: AuthStrategy = { nextNonce: () => undefined, credentialHeaders: async () => ({}) };
  const mutations = [
    [TRADING_OPERATIONS.createNewOrder, { symbol: "BTCUSD", amount: "1", price: "100", side: "buy", type: "exchange limit" }],
    [TRADING_OPERATIONS.cancelAllActiveOrders, {}],
    [TRADING_OPERATIONS.cancelAllSessionOrders, {}],
    [TRADING_OPERATIONS.cancelOrder, { order_id: 1 }],
  ] as const;

  for (const [operation, body] of mutations) {
    assert.equal(operation.retryable, false);
    const failure = new SdkError("transport failure");
    const failing = transport({ auth, failure });
    await assert.rejects(
      executeRestOperation<{ input: BoundaryValue; response: BoundaryValue }>(
        failing.transport,
        operation,
        body,
      ),
      (error: BoundaryValue) => error === failure,
    );
    assert.equal(failing.requests.length, 1);
  }
});

test("executor rejects invalid descriptor inputs before request dispatch", async () => {
  const { transport: unsigned, requests } = transport();
  await assert.rejects(
    executeRestOperation<{ input: { item: string; value: string }; response: {} }>(
      unsigned,
      privateOperation,
      { item: "item", value: "exact" },
    ),
    /private request requires an injected AuthStrategy/i,
  );
  await assert.rejects(
    executeRestOperation<{ input: {}; response: {} }>(
      unsigned,
      publicOperation,
      {},
    ),
    /missing path parameter item/i,
  );
  await assert.rejects(
    executeRestOperation<{ input: { item: string }; response: {} }>(
      unsigned,
      { ...publicOperation, responseMode: "xml" },
      { item: "item" },
    ),
    (error: BoundaryValue) => error instanceof SdkError && /response mode/i.test(error.message),
  );
  await assert.rejects(
    executeRestOperation<{ input: { item: string; value: string }; response: {} }>(
      unsigned,
      { ...publicOperation, requestBody: true, requestBodyRequired: true },
      { item: "item", value: "exact" },
    ),
    /public.*body/i,
  );
  const signed = transport({
    auth: { nextNonce: () => undefined, credentialHeaders: async () => ({}) },
  });
  await assert.rejects(
    executeRestOperation<{ input: { item: string; value: string }; response: {} }>(
      signed.transport,
      privateOperation,
      { item: "item", value: "exact" },
      { headers: { Accept: "text/html" } },
    ),
    /accept.*reserved/i,
  );
  for (const name of [
    "Authorization",
    "X-GEMINI-CUSTOM",
    "Content-Length",
    "Content-Type",
    "Cache-Control",
  ]) {
    await assert.rejects(
      executeRestOperation<{ input: { item: string; value: string }; response: {} }>(
        signed.transport,
        privateOperation,
        { item: "item", value: "exact" },
        { headers: { [name]: "caller" } },
      ),
      /reserved/i,
    );
  }
  await assert.rejects(
    executeRestOperation<{ input: { item: string }; response: {} }>(
      unsigned,
      { ...publicOperation, path: "/v1/items", parameters: [{ name: "required", in: "query", required: true, style: "form", explode: true, "shape": "scalar" }] },
      { item: "item" },
    ),
    /missing query parameter required/i,
  );
  await assert.rejects(
    executeRestOperation<{ input: { item: string; tags: BoundaryValue[] }; response: {} }>(
      unsigned,
      { ...publicOperation, path: "/v1/items", parameters: [{ name: "tags", in: "query", required: false, style: "form", explode: true, "shape": "array" }] },
      { item: "item", tags: [{}] },
    ),
    /generated array shape/i,
  );
  assert.equal(requests.length, 0);
  assert.equal(signed.requests.length, 0);
});
