import assert from "node:assert/strict";
import test from "node:test";

import {
  ApiError,
  classifyServerError,
  serializeError,
  WebSocketRequestError,
} from "../errors.js";
import type { DiagnosticEvent } from "../diagnostics.js";
import { ConsoleLogger, emitDiagnostic, NoopLogger, type Logger } from "../logging.js";
import { HttpTransport } from "../core/http.js";

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
  assert.equal((serializeError(error, { includeRawBody: true }).body as { detail?: string }).detail, "debug-only");
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
  let output: unknown;
  console.log = (...args: unknown[]) => {
    output = args;
  };
  try {
    new ConsoleLogger({ minLevel: "debug" }).info(event.name, event);
    new NoopLogger().info(event.name, event);
  } finally {
    console.log = original;
  }
  assert.equal(Array.isArray(output), true);
  assert.equal(String((output as unknown[])[0]).endsWith("[INFO] request.end"), true);
  assert.deepEqual((output as unknown[])[1], event);
});

test("ConsoleLogger emits message-only calls", () => {
  const originalLog = console.log;
  const originalError = console.error;
  const output: unknown[][] = [];
  console.log = (...args: unknown[]) => output.push(args);
  console.error = (...args: unknown[]) => output.push(args);
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
  let metadata: Record<string, unknown> | undefined;
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
    fetchImpl: async () => ({
      status: 200,
      headers: {
        get(name: string) {
          return {
            "content-type": "application/json; charset=utf-8",
            "x-gemini-request-id": "exchange-1",
            "x-ratelimit-limit": "10",
            "x-ratelimit-remaining": "9",
            "x-ratelimit-reset": "123",
          }[name.toLowerCase()] ?? null;
        },
      },
      text: async () => '{"ok":true}',
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
        ? {
          status: 503,
          headers: { get: (name: string) => name.toLowerCase() === "retry-after" ? "2" : null },
          text: async () => '{"error":"SERVICE_UNAVAILABLE"}',
        }
        : { status: 200, headers: { get: () => "application/json" }, text: async () => "{}" };
    },
  });

  await client.requestPublic({ method: "GET", path: "/v1/time", retryable: true });
  const retry = events.find((event) => event.name === "request.retry");
  const end = events.find((event) => event.name === "request.end");
  assert.equal(retry?.level, "warn");
  assert.equal(retry?.response?.rateLimit?.retryAfter, "2");
  assert.equal(delays[0], 2000);
  assert.equal(retry?.response?.correlationId, end?.response?.correlationId);
  assert.equal(end?.response?.retryCount, 1);
});

test("REST diagnostics carry safe operation context without request data", async () => {
  const events: DiagnosticEvent[] = [];
  const client = new HttpTransport({
    env: "sandbox",
    onDiagnostic: (event) => events.push(event),
    fetchImpl: async () => ({ status: 200, headers: { get: () => "application/json" }, text: async () => "{}" }),
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
    fetchImpl: async () => ({
      status: 403,
      headers: { get: (name: string) => name.toLowerCase() === "x-gemini-request-id" ? "exchange-403" : "application/json" },
      text: async () => JSON.stringify({ error: "MissingRole", bankAccount: "bank-secret", address: "private-address" }),
    }),
  });

  await assert.rejects(
    client.requestPublic({
      method: "GET",
      path: "/v1/account",
      operationContext: { operation: "account.list" },
    }),
    (error: unknown) => {
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
