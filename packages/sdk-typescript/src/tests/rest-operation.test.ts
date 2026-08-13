import assert from "node:assert/strict";
import test from "node:test";

import {
  type AuthStrategy,
  type FetchLike,
  type HttpMethod,
  HttpTransport,
  type RestQueryParameter,
} from "../core/http.js";
import { SdkError } from "../errors.js";
import {
  PREDICTION_MARKET_OPERATIONS,
  type PredictionMarketOperationTypes,
} from "../generated/operations.js";
import { TRADING_OPERATIONS } from "../generated/trading/operations.js";
import { executeRestOperation } from "../core/rest-operation.js";
import type { DiagnosticEvent } from "../diagnostics.js";
import { fromBase64 } from "../core/encoding.js";

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
    { name: "tags", in: "query", required: false, style: "form", explode: true, shape: "array" },
    { name: "active", in: "query", required: false, style: "form", explode: true, shape: "scalar" },
    { name: "id", in: "query", required: false, style: "form", explode: true, shape: "scalar" },
    { name: "amount", in: "query", required: false, style: "form", explode: true, shape: "scalar" },
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
    { name: "active", in: "query", required: false, style: "form", explode: true, shape: "scalar" },
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
} = {}): { transport: HttpTransport; requests: Request[] } {
  const requests: Request[] = [];
  const fetchImpl: FetchLike = async (url, init) => {
    requests.push({ url, init });
    if (opts.failure) throw opts.failure;
    return {
      status: opts.statuses?.shift() ?? 200,
      headers: { get: (name) => name.toLowerCase() === "content-type" ? (opts.contentType ?? "application/json") : null },
      async text() { return opts.response ?? "{}"; },
    };
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

  await executeRestOperation<{ path: { item: string }; query: never; headers: never; body: { clientOrderId: string; token: string }; response: {} }>(
    http,
    { ...privateOperation, operation: "trading.placeOrder" },
    { path: { item: "order" }, body: { clientOrderId: "client-1", token: "secret-payload" } },
  );

  const end = events.find((event) => event.name === "request.end");
  assert.deepEqual(end?.operationContext, {
    operation: "trading.placeOrder",
    clientOrderId: "client-1",
  });
  assert.equal(JSON.stringify(end).includes("secret-payload"), false);
});

test("generated operation types can be passed to the executor", async () => {
  const { transport: http } = transport();

  await executeRestOperation<PredictionMarketOperationTypes["getEvent"]>(
    http,
    PREDICTION_MARKET_OPERATIONS.getEvent,
    { path: { eventTicker: "event" } },
  );
});

test("executor forwards response int64 paths to HttpTransport", async () => {
  const { transport: http } = transport({ response: '{"orderId":9007199254740993}' });
  const response = await executeRestOperation<{
    path: never;
    query: never;
    body: never;
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

  await executeRestOperation<{ path: { item: string }; query: Record<string, unknown>; headers: Record<string, string>; body: never; response: {} }>(
    http,
    publicOperation,
    { path: { item: "a/b:c" }, query: { tags: ["one", "two"], active: true, id: 9007199254740993n, amount: "1.2300" }, headers: { "X-Trace": "trace" } },
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

async function queryUrl(parameters: readonly RestQueryParameter[], query: Record<string, unknown>) {
  const { transport: http, requests } = transport();
  await executeRestOperation<{ path: never; query: Record<string, unknown>; headers: never; body: never; response: {} }>(
    http,
    queryOperation(parameters),
    { query },
  );
  return requests[0]?.url;
}

test("query serialization follows OpenAPI style and explode metadata", async () => {
  assert.equal(
    await queryUrl([{ name: "tags", in: "query", required: false, style: "form", explode: false, shape: "array" }], { tags: ["one", "two"] }),
    "https://api.sandbox.gemini.com/v1/items?tags=one,two",
  );
  assert.equal(
    await queryUrl([{ name: "filter", in: "query", required: false, style: "form", explode: false, shape: "object" }], { filter: { status: "open", side: "buy" } }),
    "https://api.sandbox.gemini.com/v1/items?filter=status,open,side,buy",
  );
  assert.equal(
    await queryUrl([{ name: "filter", in: "query", required: false, style: "form", explode: true, shape: "object" }], { filter: { status: "open", side: "buy" } }),
    "https://api.sandbox.gemini.com/v1/items?status=open&side=buy",
  );
  assert.equal(
    await queryUrl([{ name: "tags", in: "query", required: false, style: "spaceDelimited", explode: false, shape: "array" }], { tags: ["one", "two"] }),
    "https://api.sandbox.gemini.com/v1/items?tags=one%20two",
  );
  assert.equal(
    await queryUrl([{ name: "tags", in: "query", required: false, style: "pipeDelimited", explode: false, shape: "array" }], { tags: ["one", "two"] }),
    "https://api.sandbox.gemini.com/v1/items?tags=one%7Ctwo",
  );
  assert.equal(
    await queryUrl([{ name: "filter", in: "query", required: false, style: "deepObject", explode: true, shape: "object" }], { filter: { status: "open" } }),
    "https://api.sandbox.gemini.com/v1/items?filter%5Bstatus%5D=open",
  );
  assert.equal(
    await queryUrl([{ name: "value", in: "query", required: false, style: "form", explode: true, shape: "scalar", allowReserved: true }], { value: "a/b?c" }),
    "https://api.sandbox.gemini.com/v1/items?value=a/b?c",
  );
});

test("query validation rejects null, unknown fields, and invalid style shapes before dispatch", async () => {
  const { transport: http, requests } = transport();
  const operation = queryOperation([{ name: "tags", in: "query", required: false, style: "form", explode: true, shape: "array" }]);
  for (const query of [{ tags: null }, { tags: ["one", null] }, { unknown: "value" }, { tags: { nested: { value: "bad" } } }]) {
    await assert.rejects(
      executeRestOperation<{ path: never; query: Record<string, unknown>; headers: never; body: never; response: {} }>(http, operation, { query }),
      /null|unexpected query parameter|scalar|array/i,
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
      { query: { category: { ignored: "500" } } } as never,
    ),
    /scalar/i,
  );
  assert.equal(requests.length, 0);
});

test("required query and caller-owned headers are checked case-insensitively", async () => {
  const { transport: http, requests } = transport();
  const operation = {
    ...queryOperation([{ name: "symbol", in: "query", required: true, style: "form", explode: true, shape: "scalar" }]),
    headers: [{ name: "X-Request-Id", required: true }],
  } as const;
  for (const input of [{ query: {} }, { query: { symbol: null } }, { query: { symbol: "BTCUSD" }, headers: {} }, { query: { symbol: "BTCUSD" }, headers: { "X-Request-Id": null } }]) {
    await assert.rejects(
      executeRestOperation<{ path: never; query: Record<string, unknown>; headers: Record<string, string>; body: never; response: {} }>(http, operation, input as never),
      /missing|required|null/i,
    );
  }
  await executeRestOperation<{ path: never; query: Record<string, unknown>; headers: Record<string, string>; body: never; response: {} }>(
    http,
    operation,
    { query: { symbol: "BTCUSD" }, headers: { "x-request-id": "request-1" } },
  );
  assert.equal(requests[0]?.url, "https://api.sandbox.gemini.com/v1/items?symbol=BTCUSD");
  assert.equal(requests[0]?.init.headers["x-request-id"], "request-1");
});

test("file operations use the shared executor path for public downloads", async () => {
  const bytes = new Uint8Array([1, 2, 3]);
  const requests: Request[] = [];
  const fetchImpl: FetchLike = async (url, init) => {
    requests.push({ url, init });
    return {
      status: 200,
      headers: {
        get: (name) => ({
          "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "content-disposition": "attachment; filename=FundingAmount_BTCGUSDPERP.xlsx",
        })[name.toLowerCase()] ?? null,
      },
      async arrayBuffer() { return bytes.buffer; },
      async text() { throw new Error("file success should not read text"); },
    };
  };
  const http = new HttpTransport({ env: "sandbox", fetchImpl });

  const response = await executeRestOperation<{
    path: never;
    query: { symbol: string };
    headers: never;
    body: never;
    response: { bytes: Uint8Array; contentType?: string; contentDisposition?: string };
  }>(
    http,
    {
      ...publicOperation,
      path: "/v1/fundingamountreport/records.xlsx",
      parameters: [{ name: "symbol", in: "query", required: true, style: "form", explode: true, shape: "scalar" }],
      responseMode: "file",
      responseContentTypes: [
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "text/csv",
      ],
      responseInt64Paths: [],
    },
    { query: { symbol: "BTCGUSDPERP" } },
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
  const fetchImpl: FetchLike = async () => ({
    status: 200,
    headers: {
      get: (name) => ({
        "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "content-disposition": "attachment; filename=FundingPayment_Report.xlsx",
      })[name.toLowerCase()] ?? null,
    },
    async arrayBuffer() { return new Uint8Array([4, 5]).buffer; },
    async text() { throw new Error("file success should not read text"); },
  });
  const http = new HttpTransport({ env: "sandbox", auth, fetchImpl });

  const response = await executeRestOperation<{
    path: never;
    query: { fromDate?: string };
    headers: never;
    body: { account?: string };
    response: { bytes: Uint8Array; contentDisposition?: string };
  }>(
    http,
    {
      ...privateOperation,
      path: "/v1/perpetuals/fundingpaymentreport/records.xlsx",
      parameters: [{ name: "fromDate", in: "query", required: false, style: "form", explode: true, shape: "scalar" }],
      responseMode: "file",
      responseContentTypes: ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
      responseInt64Paths: [],
    },
    { query: { fromDate: "2024-04-10" }, body: { account: "primary" } },
  );

  assert.deepEqual(response.bytes, new Uint8Array([4, 5]));
  assert.equal(response.contentDisposition, "attachment; filename=FundingPayment_Report.xlsx");
});

test("executor enforces declared statuses and normalized success media types", async () => {
  const json = transport({ contentType: "Application/JSON; charset=utf-8" });
  await executeRestOperation<{ path: never; query: never; headers: never; body: never; response: {} }>(
    json.transport,
    { ...publicOperation, path: "/v1/items", parameters: [] },
  );
  const expected = transport({ statuses: [201] });
  await executeRestOperation<{ path: never; query: never; headers: never; body: never; response: {} }>(
    expected.transport,
    { ...publicOperation, path: "/v1/items", parameters: [], successStatuses: [201] },
  );

  const unexpected = transport({ statuses: [200] });
  await assert.rejects(
    executeRestOperation<{ path: never; query: never; headers: never; body: never; response: {} }>(
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
      executeRestOperation<{ path: never; query: never; headers: never; body: never; response: { bytes: Uint8Array } }>(http, operation),
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

    await executeRestOperation<{ path: { item: string }; query: never; headers: { "Idempotency-Key": string }; body: typeof body; response: {} }>(
      http,
      privateOperation,
      { path: { item: "item" }, body, headers: { "Idempotency-Key": "request-1" } },
    );

    assert.equal(authCalls, 2);
    assert.equal(requests[0]?.init.headers.Accept, "application/json");
    const payload = fromBase64(requests[0]?.init.headers["X-GEMINI-PAYLOAD"] ?? "");
    assert.equal(payload, '{"request":"/v1/items/item","price":"1.2300","quantity":9007199254740993}');
    assert.equal(requests[0]?.init.headers["Idempotency-Key"], "request-1");
    await executeRestOperation<{ path: { item: string }; query: { active: boolean }; headers: never; body: never; response: {} }>(
      http,
      privateGetOperation,
      { path: { item: "item" }, query: { active: true } },
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
    await executeRestOperation<{ path: never; query: never; headers: never; body: never; response: {} }>(
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
      return {
        status: 200,
        headers: { get: () => "application/json" },
        async text() { return "{}"; },
      };
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

  await executeRestOperation<{ path: never; query: never; headers: never; body: { order_id: bigint | number }; response: {} }>(
    http,
    operation,
    { body: { order_id: Number.MAX_SAFE_INTEGER } },
  );
  const payload = fromBase64(requests[0]!.init.headers["X-GEMINI-PAYLOAD"]);
  assert.match(payload, /"order_id":9007199254740991/);

  await executeRestOperation<{ path: never; query: never; headers: never; body: { order_id: bigint | number }; response: {} }>(
    http,
    operation,
    { body: { order_id: 18446744073709551615n } },
  );
  const widePayload = fromBase64(requests[1]!.init.headers["X-GEMINI-PAYLOAD"]);
  assert.match(widePayload, /"order_id":18446744073709551615/);

  await assert.rejects(
    executeRestOperation<{ path: never; query: never; headers: never; body: { order_id: bigint | number }; response: {} }>(
      http,
      operation,
      { body: { order_id: Number.MAX_SAFE_INTEGER + 1 } },
    ),
    (error: unknown) =>
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
  await executeRestOperation<{ path: { item: string }; query: { active: boolean }; headers: never; body: never; response: {} }>(
    retry.transport,
    privateGetOperation,
    { path: { item: "item" }, query: { active: true } },
  );
  assert.equal(retry.requests.length, 2);

  const failure = new SdkError("transport failure");
  const failing = transport({ auth, failure });
  await assert.rejects(
    executeRestOperation<{ path: { item: string }; query: { active: boolean }; headers: never; body: never; response: {} }>(
      failing.transport,
      privateGetOperation,
      { path: { item: "item" }, query: { active: true } },
    ),
    (error: unknown) => error === failure,
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
      executeRestOperation<{ path: never; query: never; headers: never; body: unknown; response: unknown }>(
        failing.transport,
        operation,
        { body },
      ),
      (error: unknown) => error === failure,
    );
    assert.equal(failing.requests.length, 1);
  }
});

test("executor rejects invalid descriptor inputs before request dispatch", async () => {
  const { transport: unsigned, requests } = transport();
  await assert.rejects(
    executeRestOperation<{ path: { item: string }; query: never; headers: never; body: { value: string }; response: {} }>(
      unsigned,
      privateOperation,
      { path: { item: "item" }, body: { value: "exact" } },
    ),
    /private request requires an injected AuthStrategy/i,
  );
  await assert.rejects(
    executeRestOperation<{ path: {}; query: never; headers: never; body: never; response: {} }>(
      unsigned,
      publicOperation,
    ),
    /missing path parameter item/i,
  );
  await assert.rejects(
    executeRestOperation<{ path: { item: string }; query: never; headers: never; body: never; response: {} }>(
      unsigned,
      { ...publicOperation, responseMode: "xml" as "json" },
      { path: { item: "item" } },
    ),
    (error: unknown) => error instanceof SdkError && /response mode/i.test(error.message),
  );
  await assert.rejects(
    executeRestOperation<{ path: { item: string }; query: never; headers: never; body: { value: string }; response: {} }>(
      unsigned,
      { ...publicOperation, requestBody: true, requestBodyRequired: true },
      { path: { item: "item" }, body: { value: "exact" } },
    ),
    /public.*body/i,
  );
  const signed = transport({
    auth: { nextNonce: () => undefined, credentialHeaders: async () => ({}) },
  });
  for (const name of [
    "Authorization",
    "X-GEMINI-CUSTOM",
    "Content-Length",
    "Content-Type",
    "Cache-Control",
  ]) {
  await assert.rejects(
    executeRestOperation<{ path: { item: string }; query: never; headers: Record<string, string>; body: { value: string }; response: {} }>(
        signed.transport,
        privateOperation,
        { path: { item: "item" }, body: { value: "exact" }, headers: { [name]: "caller" } },
      ),
      /reserved/i,
    );
  }
  await assert.rejects(
    executeRestOperation<{ path: { item: string }; query: never; headers: never; body: never; response: {} }>(
      signed.transport,
      privateGetOperation,
      { path: { item: "item" }, headers: { Accept: "text/html" } } as never,
    ),
    /accept.*reserved/i,
  );
  await assert.rejects(
    executeRestOperation<{ path: { item: string }; query: { required: string }; headers: never; body: never; response: {} }>(
      unsigned,
      { ...publicOperation, path: "/v1/items", parameters: [{ name: "required", in: "query", required: true, style: "form", explode: true, shape: "scalar" }] },
      { path: { item: "item" } } as never,
    ),
    /missing query parameter required/i,
  );
  await assert.rejects(
    executeRestOperation<{ path: { item: string }; query: { tags: unknown[] }; headers: never; body: never; response: {} }>(
      unsigned,
      { ...publicOperation, path: "/v1/items", parameters: [{ name: "tags", in: "query", required: false, style: "form", explode: true, shape: "array" }] },
      { path: { item: "item" }, query: { tags: [{}] } },
    ),
      /generated array shape/i,
  );
  assert.equal(requests.length, 0);
  assert.equal(signed.requests.length, 0);
});
