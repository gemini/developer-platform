import {
  SpanKind,
  SpanStatusCode,
  trace,
  type Attributes,
  type Span,
  type Tracer,
} from "@opentelemetry/api";
import { sanitizeDiagnosticUrl, type DiagnosticEvent, type DiagnosticListener } from "./diagnostics.js";

const DEFAULT_SPAN_NAME_PREFIX = "";

const START_EVENTS = new Set([
  "request.start",
  "token.request.start",
  "revoke.request.start",
  "ws.request.start",
  "ws.subscription.start",
  "ws.reconnect",
]);

const SUCCESS_EVENTS = new Set([
  "request.end",
  "token.exchange",
  "token.refresh",
  "revoke",
  "ws.request.end",
  "ws.open",
]);

const INSTANT_EVENTS = new Set([
  "orderbook.resync",
]);

/** Options for the optional OpenTelemetry adapter. */
export interface OpenTelemetryOptions {
  /** Tracer acquired from the application's configured OpenTelemetry provider. */
  tracer?: Tracer;
  /** Optional namespace prefix used for emitted span names. */
  spanNamePrefix?: string;
}

/** Hooks to pass to `createClient`; the adapter never exports or configures an exporter. */
export interface OpenTelemetryHooks {
  /** Safe SDK diagnostics mapped to OpenTelemetry spans and span events. */
  readonly onDiagnostic: DiagnosticListener;
  /** End active long-lived subscription spans during application shutdown. */
  shutdown(): void;
}

type ActiveSpan = {
  span: Span;
  kind: "request" | "subscription";
};

function metadataString(event: DiagnosticEvent, key: string): string | undefined {
  const value = event.metadata?.[key];
  return typeof value === "string" ? value : undefined;
}

function isIntentionalCancellation(event: DiagnosticEvent): boolean {
  return event.error?.name === "RequestAbortedError" || event.error?.name === "AbortError";
}

function addUrlAttributes(event: DiagnosticEvent, attributes: Attributes): void {
  const response = event.response;
  const metadataUrl = metadataString(event, "url");
  const endpointUrl = response?.endpoint.startsWith("http://") || response?.endpoint.startsWith("https://")
    ? sanitizeDiagnosticUrl(response.endpoint)
    : undefined;
  const url = metadataUrl === undefined ? endpointUrl : sanitizeDiagnosticUrl(metadataUrl);

  if (url !== undefined) {
    try {
      const parsed = new URL(url);
      attributes["url.full"] = url;
      attributes["url.path"] = parsed.pathname;
      attributes["url.scheme"] = parsed.protocol.slice(0, -1);
      attributes["server.address"] = parsed.hostname;
      attributes["server.port"] = parsed.port === ""
        ? parsed.protocol === "https:" || parsed.protocol === "wss:" ? 443 : 80
        : Number(parsed.port);
    } catch {
      // A custom transport URL may still be unparseable after sanitization.
    }
  } else if (response) {
    attributes["url.path"] = response.endpoint;
  }

  if (event.component === "websocket") attributes["network.protocol.name"] = "websocket";
}

function diagnosticAttributes(event: DiagnosticEvent): Attributes {
  const attributes: Attributes = {
    "gemini.component": event.component,
    "gemini.event.name": event.name,
  };
  if (event.traffic !== undefined) attributes["gemini.traffic"] = event.traffic;
  if (event.correlationId !== undefined) attributes["gemini.correlation_id"] = event.correlationId;
  if (event.operationContext?.operation !== undefined) {
    attributes["gemini.operation"] = event.operationContext.operation;
  }
  addUrlAttributes(event, attributes);

  const response = event.response;
  if (response) {
    attributes["http.request.method"] = response.method;
    attributes["gemini.retry_count"] = response.retryCount;
    if (response.retryCount > 0) attributes["http.request.resend_count"] = response.retryCount;
    if (response.status !== undefined) attributes["http.response.status_code"] = response.status;
    if (response.exchangeRequestId !== undefined) attributes["gemini.exchange_request_id"] = response.exchangeRequestId;
  }

  const stream = metadataString(event, "stream");
  if (stream !== undefined) attributes["gemini.websocket.stream"] = stream;
  const symbol = metadataString(event, "symbol");
  if (symbol !== undefined) attributes["gemini.symbol"] = symbol;

  if (event.error && !isIntentionalCancellation(event)) {
    attributes["error.type"] = event.error.name;
    if (event.error.category !== undefined) attributes["gemini.error.category"] = event.error.category;
    if (event.error.code !== undefined) attributes["gemini.error.code"] = event.error.code;
    if (event.error.status !== undefined) attributes["gemini.error.status"] = event.error.status;
  }
  return attributes;
}

function spanName(event: DiagnosticEvent, prefix: string): string {
  if (event.component === "rest" && event.response) {
    const target = event.operationContext?.operation;
    return qualifyName(prefix, `${event.response.method}${target ? ` ${target}` : ""}`);
  }
  if (event.component === "oauth") {
    return qualifyName(prefix, event.name.startsWith("revoke.") || event.name === "revoke"
      ? "POST oauth.revoke"
      : "POST oauth.token");
  }
  if (event.name.startsWith("ws.request.")) {
    return qualifyName(prefix, `websocket.request ${metadataString(event, "method") ?? "unknown"}`);
  }
  if (event.name.startsWith("ws.subscription.")) return qualifyName(prefix, "websocket.subscription");
  if (event.name.startsWith("ws.")) return qualifyName(prefix, `websocket.${event.name.slice(3).replaceAll(".", "_")}`);
  if (event.name.startsWith("orderbook.")) return qualifyName(prefix, `order_book.${event.name.slice("orderbook.".length).replaceAll(".", "_")}`);
  return qualifyName(prefix, `${event.component}.${event.name.replaceAll(".", "_")}`);
}

function qualifyName(prefix: string, name: string): string {
  return prefix === "" ? name : `${prefix}.${name}`;
}

function isTerminalFailure(event: DiagnosticEvent, active: ActiveSpan): boolean {
  if (event.name === "ws.subscription.replay.failure") return event.metadata?.terminal === true;
  if (active.kind === "subscription") {
    return event.name === "ws.subscription.failure" ||
      event.name === "ws.subscription.unsubscribe.failure" ||
      event.name === "orderbook.subscribe.failure" ||
      event.name === "orderbook.unsubscribe.failure";
  }
  return event.name.endsWith(".failure") || event.name === "api.error" || event.name === "transport.failure" || event.name === "response.failure";
}

function isTerminalSuccess(event: DiagnosticEvent, active: ActiveSpan): boolean {
  if (active.kind === "subscription") return event.name === "ws.subscription.close";
  return SUCCESS_EVENTS.has(event.name);
}

function finishSpan(span: Span, event: DiagnosticEvent, success: boolean): void {
  span.setAttributes(diagnosticAttributes(event));
  if (!success && !isIntentionalCancellation(event)) {
    if (event.error) span.recordException({ name: event.error.name, message: event.error.message });
    span.setStatus({
      code: SpanStatusCode.ERROR,
      ...(event.response?.status === undefined && event.error?.message ? { message: event.error.message } : {}),
    });
  }
  span.end();
}

/**
 * Create an opt-in OpenTelemetry bridge for the SDK's safe diagnostics.
 *
 * The core SDK does not depend on an exporter or tracer provider. Install
 * `@opentelemetry/api`, configure it in the application, and pass the returned
 * listener to `createClient({ onDiagnostic })`.
 */
export function createOpenTelemetryHooks(options: OpenTelemetryOptions = {}): OpenTelemetryHooks {
  const tracer = options.tracer ?? trace.getTracer("@gemini-markets/sdk");
  const prefix = options.spanNamePrefix ?? DEFAULT_SPAN_NAME_PREFIX;
  const active = new Map<string, ActiveSpan>();
  let shutDown = false;

  const onDiagnostic: DiagnosticListener = (event) => {
    if (shutDown) return;
    try {
      const attributes = diagnosticAttributes(event);
      const correlationId = event.correlationId;
      const activeSpan = correlationId === undefined ? undefined : active.get(correlationId);

      if (correlationId !== undefined && START_EVENTS.has(event.name)) {
        if (activeSpan) {
          activeSpan.span.addEvent(event.name, attributes);
          return;
        }
        const span = tracer.startSpan(spanName(event, prefix), {
          kind: SpanKind.CLIENT,
          attributes,
        });
        active.set(correlationId, {
          span,
          kind: event.name === "ws.subscription.start" ? "subscription" : "request",
        });
        return;
      }

      if (activeSpan) {
        activeSpan.span.addEvent(event.name, attributes);
        if (isTerminalFailure(event, activeSpan)) {
          finishSpan(activeSpan.span, event, false);
          active.delete(correlationId!);
        } else if (isTerminalSuccess(event, activeSpan)) {
          finishSpan(activeSpan.span, event, true);
          active.delete(correlationId!);
        }
        return;
      }

      // Do not create one span per market-data frame. Important lifecycle and
      // recovery diagnostics without an operation span are represented as
      // short event spans instead.
      if (INSTANT_EVENTS.has(event.name) || event.level === "error") {
        const span = tracer.startSpan(spanName(event, prefix), {
          kind: SpanKind.CLIENT,
          attributes,
        });
        span.addEvent(event.name, attributes);
        finishSpan(span, event, event.level !== "error");
      }
    } catch {
      // Telemetry must never change SDK behavior.
    }
  };

  return {
    onDiagnostic,
    shutdown: () => {
      if (shutDown) return;
      shutDown = true;
      for (const { span } of active.values()) {
        try {
          span.addEvent("gemini.shutdown");
          span.end();
        } catch {
          // Telemetry cleanup is best effort.
        }
      }
      active.clear();
    },
  };
}
