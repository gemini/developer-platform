import assert from "node:assert/strict";
import test, { describe } from "node:test";
import { SpanStatusCode, type Attributes, type Span, type Tracer } from "@opentelemetry/api";
import { createOpenTelemetryHooks } from "./opentelemetry.js";
import type { DiagnosticEvent } from "./diagnostics.js";

type RecordedSpan = {
  name: string;
  attributes: Attributes;
  events: Array<{ name: string; attributes?: Attributes }>;
  statuses: Array<{ code: SpanStatusCode; message?: string }>;
  exceptions: Array<{ name?: string; message?: string }>;
  ended: boolean;
};

function tracer(): { tracer: Tracer; spans: RecordedSpan[] } {
  const spans: RecordedSpan[] = [];
  const tracer = {
    startSpan(name: string, options?: { attributes?: Attributes }): Span {
      const recorded: RecordedSpan = {
        name,
        attributes: options?.attributes ?? {},
        events: [],
        statuses: [],
        exceptions: [],
        ended: false,
      };
      const span = {
        addEvent(eventName: string, attributes?: Attributes) {
          recorded.events.push({ name: eventName, attributes });
          return span;
        },
        setAttributes(attributes: Attributes) {
          Object.assign(recorded.attributes, attributes);
          return span;
        },
        setStatus(status: { code: SpanStatusCode; message?: string }) {
          recorded.statuses.push(status);
          return span;
        },
        recordException(exception: { name?: string; message?: string }) {
          recorded.exceptions.push(exception);
        },
        end() {
          recorded.ended = true;
        },
      } as unknown as Span;
      spans.push(recorded);
      return span;
    },
  } as unknown as Tracer;
  return { tracer, spans };
}

function restEvent(
  level: DiagnosticEvent["level"],
  name: string,
  correlationId: string,
  status?: number,
  error?: DiagnosticEvent["error"],
): DiagnosticEvent {
  return {
    level,
    component: "rest",
    name,
    correlationId,
    response: {
      endpoint: "/v1/orders",
      method: "POST",
      correlationId,
      retryCount: 0,
      status,
    },
    operationContext: { operation: "trading.createNewOrder" },
    metadata: { url: "https://api.test/v1/orders?api_key=must-not-leak" },
    error,
  };
}

test("maps REST lifecycle diagnostics to a client span without payloads", () => {
  const { tracer: otelTracer, spans } = tracer();
  const hooks = createOpenTelemetryHooks({ tracer: otelTracer });

  hooks.onDiagnostic(restEvent("debug", "request.start", "rest-1"));
  hooks.onDiagnostic(restEvent("info", "request.end", "rest-1", 201));

  assert.equal(spans.length, 1);
  assert.equal(spans[0]?.name, "POST trading.createNewOrder");
  assert.equal(spans[0]?.ended, true);
  assert.deepEqual(spans[0]?.statuses, []);
  assert.equal(spans[0]?.attributes["http.request.method"], "POST");
  assert.equal(spans[0]?.attributes["url.full"], "https://api.test/v1/orders");
  assert.equal(spans[0]?.attributes["server.address"], "api.test");
  assert.equal(spans[0]?.attributes["server.port"], 443);
  assert.equal("body" in spans[0]!.attributes, false);
});

describe("terminal span lifecycle", () => {
  test("copies terminal response attributes onto the completed span", () => {
    const { tracer: otelTracer, spans } = tracer();
    const hooks = createOpenTelemetryHooks({ tracer: otelTracer });

    hooks.onDiagnostic(restEvent("debug", "request.start", "rest-terminal"));
    hooks.onDiagnostic({
      ...restEvent("info", "request.end", "rest-terminal", 201),
      response: {
        ...restEvent("info", "request.end", "rest-terminal", 201).response!,
        retryCount: 2,
        exchangeRequestId: "exchange-1",
      },
    });

    assert.equal(spans[0]?.ended, true);
    assert.equal(spans[0]?.attributes["http.response.status_code"], 201);
    assert.equal(spans[0]?.attributes["gemini.retry_count"], 2);
    assert.equal(spans[0]?.attributes["gemini.exchange_request_id"], "exchange-1");
  });

  test("records safe failure attributes and never copies an error body", () => {
    const { tracer: otelTracer, spans } = tracer();
    const hooks = createOpenTelemetryHooks({ tracer: otelTracer });

    hooks.onDiagnostic(restEvent("debug", "request.start", "rest-2"));
    hooks.onDiagnostic(restEvent("error", "api.error", "rest-2", 422, {
      name: "ApiError",
      message: "request rejected",
      status: 422,
      body: { reason: "insufficient_funds", apiSecret: "must-not-leak" },
    }));

    assert.equal(spans[0]?.ended, true);
    assert.equal(spans[0]?.statuses[0]?.code, SpanStatusCode.ERROR);
    assert.equal(spans[0]?.exceptions[0]?.message, "request rejected");
    assert.equal(JSON.stringify(spans[0]).includes("must-not-leak"), false);
    assert.equal(spans[0]?.attributes["url.full"], "https://api.test/v1/orders");
  });

  test("does not classify caller cancellation as an error", () => {
    const { tracer: otelTracer, spans } = tracer();
    const hooks = createOpenTelemetryHooks({ tracer: otelTracer });

    hooks.onDiagnostic(restEvent("debug", "request.start", "rest-cancelled"));
    hooks.onDiagnostic(restEvent("error", "request.failure", "rest-cancelled", undefined, {
      name: "RequestAbortedError",
      message: "request aborted",
    }));

    assert.deepEqual(spans[0]?.statuses, []);
    assert.deepEqual(spans[0]?.exceptions, []);
    assert.equal("error.type" in spans[0]!.attributes, false);
  });

  test("ends malformed successful token responses as failures", () => {
    const { tracer: otelTracer, spans } = tracer();
    const hooks = createOpenTelemetryHooks({ tracer: otelTracer });

    hooks.onDiagnostic({
      level: "debug",
      component: "oauth",
      name: "token.request.start",
      correlationId: "token-malformed",
      response: {
        endpoint: "https://exchange.gemini.com/auth/token",
        method: "POST",
        correlationId: "token-malformed",
        retryCount: 0,
      },
    });
    hooks.onDiagnostic({
      level: "error",
      component: "oauth",
      name: "token.response.failure",
      correlationId: "token-malformed",
      response: {
        endpoint: "https://exchange.gemini.com/auth/token",
        method: "POST",
        correlationId: "token-malformed",
        retryCount: 0,
        status: 200,
      },
      error: { name: "SdkError", message: "access_token is required" },
    });

    assert.equal(spans[0]?.ended, true);
    assert.equal(spans[0]?.statuses[0]?.code, SpanStatusCode.ERROR);
    assert.equal(spans[0]?.attributes["http.response.status_code"], 200);
    assert.equal(spans[0]?.attributes["error.type"], "SdkError");
  });
});

test("keeps subscription spans open through stream diagnostics", () => {
  const { tracer: otelTracer, spans } = tracer();
  const hooks = createOpenTelemetryHooks({ tracer: otelTracer });
  const event = (name: string, level: DiagnosticEvent["level"] = "info"): DiagnosticEvent => ({
    level,
    component: "websocket",
    name,
    correlationId: "subscription-1",
    traffic: "control",
    metadata: { stream: "btcusd@depth" },
  });

  hooks.onDiagnostic({ ...event("ws.subscription.start", "debug") });
  hooks.onDiagnostic(event("ws.subscription.ready"));
  hooks.onDiagnostic({ ...event("ws.stream.malformed_frame", "warn"), traffic: "stream" });
  assert.equal(spans[0]?.ended, false);

  hooks.onDiagnostic(event("ws.subscription.close"));
  assert.equal(spans[0]?.ended, true);
  assert.equal(spans[0]?.events.map(({ name }) => name).includes("ws.stream.malformed_frame"), true);
});

test("creates reconnect and order-book recovery spans", () => {
  const { tracer: otelTracer, spans } = tracer();
  const hooks = createOpenTelemetryHooks({ tracer: otelTracer });

  hooks.onDiagnostic({
    level: "warn",
    component: "websocket",
    name: "ws.reconnect",
    traffic: "reconnect",
    correlationId: "reconnect-1",
  });
  hooks.onDiagnostic({
    level: "info",
    component: "websocket",
    name: "ws.open",
    traffic: "control",
    correlationId: "reconnect-1",
  });
  hooks.onDiagnostic({
    level: "warn",
    component: "order_book",
    name: "orderbook.resync",
    traffic: "stream",
    correlationId: "book-1",
    metadata: { symbol: "BTCUSD" },
  });

  assert.equal(spans.length, 2);
  assert.equal(spans[0]?.ended, true);
  assert.equal(spans[1]?.ended, true);
  assert.equal(spans[1]?.name, "order_book.resync");
});

test("shutdown ends long-lived spans", () => {
  const { tracer: otelTracer, spans } = tracer();
  const hooks = createOpenTelemetryHooks({ tracer: otelTracer });

  hooks.onDiagnostic({
    level: "debug",
    component: "websocket",
    name: "ws.subscription.start",
    correlationId: "subscription-2",
  });
  hooks.shutdown();
  hooks.onDiagnostic({
    level: "debug",
    component: "websocket",
    name: "ws.subscription.start",
    correlationId: "subscription-after-shutdown",
  });

  assert.equal(spans[0]?.ended, true);
  assert.equal(spans[0]?.events.at(-1)?.name, "gemini.shutdown");
  assert.equal(spans.length, 1);
});
