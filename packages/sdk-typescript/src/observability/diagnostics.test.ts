import assert from "node:assert/strict";
import test from "node:test";

import {
  ApiError,
  classifyServerError,
  serializeError,
  WebSocketRequestError,
} from "../errors.js";
import { redactDiagnosticValue, type DiagnosticEvent } from "./diagnostics.js";
import { isBoundaryObject, type BoundaryRecord, type BoundaryValue } from "../utils/boundary-value.js";
import { ConsoleLogger, emitDiagnostic, NOOP_LOGGER, type Logger } from "./logging.js";
import { HttpTransport } from "../transport/http.js";
import { streamingTextResponse } from "../tests/support/http-fixtures.js";

test("classifies server reasons and preserves the exchange code", () => {
  const classification = classifyServerError({
    error: "InvalidInput",
    code: "COMBO_VALIDATION_ERROR",
  });

  assert.deepEqual(classification, {
    reason: "InvalidInput",
    code: "invalid_input",
    category: "validation",
    serverCode: "COMBO_VALIDATION_ERROR",
  });
});

test("classifies server error codes when the response has no reason field", () => {
  assert.equal(classifyServerError({ code: "TermsNotFound" }, 404).code, "terms_not_found");
  assert.equal(classifyServerError({ error: "OrderNotFound" }, 404).code, "order_not_found");
  assert.deepEqual(classifyServerError({ error: "ProgramUnavailable" }, 503), {
    reason: "ProgramUnavailable",
    code: "program_unavailable",
    category: "service_unavailable",
  });
});

test("authorization classification preserves only explicit role and scope context", () => {
  const classification = classifyServerError({ error: "MissingRole", requiredRole: "trader", accountScope: "primary" });
  assert.deepEqual(classification.authorizationContext, {
    requiredRole: "trader",
    scope: "primary",
  });
  assert.deepEqual(serializeError(new ApiError({ status: 403, reason: "MissingRole", authorizationContext: classification.authorizationContext })).authorizationContext, {
    requiredRole: "trader",
    scope: "primary",
  });
  assert.equal("requiredRole" in (classifyServerError({ error: "MissingRole" }).authorizationContext ?? {}), false);
});

test("safe error serialization redacts nested sensitive fields and omits the raw body", () => {
  const error = new ApiError({
    status: 403,
    reason: "MissingRole",
    body: {
      error: "MissingRole",
      bankAccount: { accountNumber: "1234" },
      address: { street: "private" },
      transactionId: "tx-1",
      token: "secret-token",
    },
  });

  const serialized = serializeError(error);
  assert.equal("body" in serialized, false);
  assert.equal(JSON.stringify(serialized).includes("1234"), false);
  assert.equal(JSON.stringify(serialized).includes("private"), false);
  assert.equal(JSON.stringify(serialized).includes("secret-token"), false);
  assert.equal(serialized.category, "authorization");
  assert.equal(serialized.code, "authorization_failed");
});

test("safe error serialization does not invoke untrusted serialization hooks", () => {
  const secret = "secret-token";
  let invoked = false;
  const cause = {
    apiSecret: secret,
    toJSON() {
      invoked = true;
      return { apiSecret: secret };
    },
  };

  const serialized = serializeError(new Error("request failed", { cause }));

  assert.equal(invoked, false);
  assert.equal(serialized.cause?.message.includes(secret), false);
  assert.equal(serialized.cause?.message, "Non-Error cause");
});

test("safe error serialization neutralizes callable values nested in arrays", () => {
  const secret = "secret-token";
  let invoked = false;
  const callable = Object.assign(() => {}, {
    toJSON() {
      invoked = true;
      return { apiSecret: secret };
    },
  });

  const serialized = serializeError(new Error("request failed", { cause: { nested: [[callable]] } }));

  assert.equal(invoked, false);
  assert.equal(serialized.cause?.message.includes(secret), false);
  assert.equal(serialized.cause?.message, "Non-Error cause");
});

test("diagnostic redaction preserves an own __proto__ key without mutating prototypes", () => {
  const redacted = redactDiagnosticValue(JSON.parse('{"__proto__":{"token":"secret"}}') as Record<string, BoundaryValue>);
  assert.ok(isBoundaryObject(redacted));
  assert.equal(Object.hasOwn(redacted, "__proto__"), true);
  assert.deepEqual(redacted.__proto__, { token: "[REDACTED]" });
  assert.equal(Object.getPrototypeOf(redacted), Object.prototype);
});

test("raw error bodies require explicit opt-in", () => {
  const error = new ApiError({
    status: 500,
    body: { detail: "debug-only" },
  });

  assert.equal("body" in serializeError(error), false);
  assert.equal("details" in serializeError(error), false);
  assert.equal("body" in error, false);
  assert.deepEqual(serializeError(error, { includeRawBody: true }).body, {
    detail: "debug-only",
  });
});

test("safe error serialization preserves normalized WebSocket server fields", () => {
  const error = new WebSocketRequestError({
    status: 400,
    body: { reason: "InvalidNonce", code: "INVALID_NONCE", detail: "debug-only" },
  });

  assert.equal(serializeError(error).reason, "InvalidNonce");
  assert.equal(serializeError(error).serverCode, "INVALID_NONCE");
  const rawBody = serializeError(error, { includeRawBody: true }).body;
  if (!isBoundaryObject(rawBody)) throw new Error("serialized raw body must be an object");
  assert.equal(rawBody.detail, "debug-only");
});

test("safe error serialization omits unrecognized exchange reasons and codes", () => {
  const error = new ApiError({
    status: 403,
    reason: "customer-private-reason",
    serverCode: "customer-private-code",
  });

  const serialized = JSON.stringify(serializeError(error));
  assert.equal(serialized.includes("customer-private"), false);
  assert.equal(error.message, "HTTP 403");
});

test("JSON.stringify uses the safe error representation", () => {
  const error = new ApiError({
    status: 500,
    body: { token: "secret-token" },
  });

  const json = JSON.stringify(error);
  assert.equal(json.includes("secret-token"), false);
  assert.equal(json.includes('"body"'), false);
});

test("logger implementations consume typed diagnostic events", () => {
  const event: DiagnosticEvent = {
    level: "info",
    component: "rest",
    name: "request.end",
    metadata: { endpoint: "/v1/time" },
  };
  const original = console.log;
  let output: BoundaryValue[] = [];
  console.log = (...args: BoundaryValue[]) => {
    output = args;
  };
  try {
    new ConsoleLogger({ minLevel: "debug" }).info(event.name, event);
    NOOP_LOGGER.info(event.name, event);
  } finally {
    console.log = original;
  }
  assert.equal(Array.isArray(output), true);
  assert.equal(String(output[0]).endsWith("[INFO] request.end"), true);
  assert.deepEqual(output[1], event);
});

test("ConsoleLogger emits message-only calls", () => {
  const originalLog = console.log;
  const originalError = console.error;
  const output: BoundaryValue[][] = [];
  console.log = (...args: BoundaryValue[]) => output.push(args);
  console.error = (...args: BoundaryValue[]) => output.push(args);
  try {
    const logger = new ConsoleLogger({ minLevel: "debug" });
    logger.debug("debug message");
    logger.info("info message");
    logger.warn("warn message");
    logger.error("error message");
  } finally {
    console.log = originalLog;
    console.error = originalError;
  }

  assert.equal(output.length, 4);
  assert.equal(output.every((args) => args.length === 1), true);
  assert.equal(output.some((args) => String(args[0]).endsWith("[INFO] info message")), true);
});

test("diagnostics preserve the public logger message and metadata contract", () => {
  let message: string | undefined;
  let metadata: BoundaryRecord | undefined;
  const logger: Logger = {
    debug: () => {},
    info: (value, meta) => { message = value; metadata = meta; },
    warn: () => {},
    error: () => {},
  };

  emitDiagnostic({ level: "info", component: "rest", name: "request.end" }, logger);

  assert.equal(message, "request.end");
  assert.equal(metadata?.name, "request.end");
});

test("REST diagnostics preserve safe response metadata without changing the result", async () => {
  const events: DiagnosticEvent[] = [];
  const client = new HttpTransport({
    env: "sandbox",
    onDiagnostic: (event) => events.push(event),
    fetchImpl: async () => streamingTextResponse('{"ok":true}', 200, {
      get(name: string) {
        return {
          "content-type": "application/json; charset=utf-8",
          "x-gemini-request-id": "exchange-1",
          "x-ratelimit-limit": "10",
          "x-ratelimit-remaining": "9",
          "x-ratelimit-reset": "123",
        }[name.toLowerCase()] ?? null;
      },
    }),
  });

  const result = await client.requestPublic({ method: "GET", path: "/v1/time" });
  assert.deepEqual(result, { ok: true });
  const end = events.find((event) => event.name === "request.end");
  assert.equal(end?.level, "info");
  assert.equal(end?.response?.endpoint, "/v1/time");
  assert.equal(end?.response?.method, "GET");
  assert.equal(end?.response?.exchangeRequestId, "exchange-1");
  assert.equal(end?.response?.contentType, "application/json");
  assert.deepEqual(end?.response?.rateLimit, {
    limit: "10",
    remaining: "9",
    reset: "123",
  });
  assert.equal(end?.response?.retryCount, 0);
});

test("REST retry diagnostics reuse correlation and capture retry guidance", async () => {
  const events: DiagnosticEvent[] = [];
  let calls = 0;
  const delays: number[] = [];
  const client = new HttpTransport({
    env: "sandbox",
    maxRetries: 1,
    sleep: async (delay) => { delays.push(delay); },
    onDiagnostic: (event) => events.push(event),
    fetchImpl: async () => {
      calls++;
      return calls === 1
        ? streamingTextResponse('{"error":"SERVICE_UNAVAILABLE"}', 503, { get: (name: string) => name.toLowerCase() === "retry-after" ? "2" : null })
        : streamingTextResponse("{}", 200, { get: () => "application/json" });
    },
  });

  await client.requestPublic({ method: "GET", path: "/v1/time", retryable: true });
  const retry = events.find((event) => event.name === "request.retry");
  const end = events.find((event) => event.name === "request.end");
  assert.equal(retry?.level, "warn");
  assert.equal(retry?.response?.rateLimit?.retryAfter, "2");
  assert.equal(delays[0], 2000);
  assert.equal(retry?.response?.correlationId, end?.response?.correlationId);
  assert.equal(retry?.correlationId, retry?.response?.correlationId);
  assert.equal(end?.correlationId, end?.response?.correlationId);
  assert.equal(end?.response?.retryCount, 1);
});

test("REST diagnostics preserve the legacy retry-after header alias", async () => {
  const events: DiagnosticEvent[] = [];
  const client = new HttpTransport({
    env: "sandbox",
    onDiagnostic: (event) => events.push(event),
    fetchImpl: async () => streamingTextResponse("{}", 200, {
      get: (name: string) => name.toLowerCase() === "x-rate-limit-retry-after" ? "3" : null,
    }),
  });

  await client.requestPublic({ method: "GET", path: "/v1/time" });
  assert.equal(events.find((event) => event.name === "request.end")?.response?.rateLimit?.retryAfter, "3");
});

test("REST diagnostics carry safe operation context without request data", async () => {
  const events: DiagnosticEvent[] = [];
  const client = new HttpTransport({
    env: "sandbox",
    onDiagnostic: (event) => events.push(event),
    fetchImpl: async () => streamingTextResponse("{}", 200, { get: () => "application/json" }),
  });

  await client.requestPublic({
    method: "POST",
    path: "/v1/prediction-markets/order",
    operationContext: {
      operation: "predictionMarkets.placeOrder",
      clientOrderId: "client-1",
    },
  });

  const end = events.find((event) => event.name === "request.end");
  assert.deepEqual(end?.operationContext, {
    operation: "predictionMarkets.placeOrder",
    clientOrderId: "client-1",
  });
  assert.equal(JSON.stringify(end).includes("signed-payload"), false);
});

test("API errors retain correlation metadata while diagnostics omit the raw private body", async () => {
  const events: DiagnosticEvent[] = [];
  const client = new HttpTransport({
    env: "sandbox",
    onDiagnostic: (event) => events.push(event),
    fetchImpl: async () => streamingTextResponse(
      JSON.stringify({ error: "MissingRole", bankAccount: "bank-secret", address: "private-address" }),
      403,
      { get: (name: string) => name.toLowerCase() === "x-gemini-request-id" ? "exchange-403" : "application/json" },
    ),
  });

  await assert.rejects(
    client.requestPublic({
      method: "GET",
      path: "/v1/account",
      operationContext: { operation: "account.list" },
    }),
    (error: BoundaryValue) => {
      assert.ok(error instanceof ApiError);
      assert.equal(error.category, "authorization");
      assert.equal(error.code, "authorization_failed");
      assert.equal(error.metadata?.exchangeRequestId, "exchange-403");
      assert.equal(error.operationContext?.operation, "account.list");
      return true;
    },
  );
  const apiError = events.find((event) => event.name === "api.error");
  assert.equal(JSON.stringify(apiError).includes("bank-secret"), false);
  assert.equal(JSON.stringify(apiError).includes("private-address"), false);
  assert.equal("body" in (apiError?.error ?? {}), false);
});
