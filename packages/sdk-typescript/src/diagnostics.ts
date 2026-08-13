import type { HttpMethod } from "./core/http.js";

export type LogLevel = "debug" | "info" | "warn" | "error";

export type ErrorCategory =
  | "validation"
  | "authentication"
  | "authorization"
  | "not_found"
  | "funds"
  | "rate_limit"
  | "service_unavailable"
  | "unknown";

export type StableErrorCode =
  | "invalid_request"
  | "invalid_input"
  | "authentication_failed"
  | "authorization_failed"
  | "terms_required"
  | "terms_not_found"
  | "order_not_found"
  | "not_found"
  | "insufficient_funds"
  | "rate_limited"
  | "program_unavailable"
  | "service_unavailable"
  | "unknown";

export type ResponseMetadata = {
  endpoint: string;
  method: HttpMethod;
  correlationId: string;
  exchangeRequestId?: string;
  status?: number;
  retryCount: number;
  contentType?: string;
  rateLimit?: {
    limit?: string;
    remaining?: string;
    reset?: string;
    retryAfter?: string;
  };
};

type ResponseHeaders = { get(name: string): string | null };

export function createResponseMetadata(options: {
  endpoint: string;
  method: HttpMethod;
  correlationId: string;
  status?: number;
  retryCount: number;
  headers?: ResponseHeaders;
}): ResponseMetadata {
  const header = (...names: string[]): string | undefined => {
    for (const name of names) {
      const value = options.headers?.get(name);
      if (value) return value;
    }
    return undefined;
  };
  const rateLimit = Object.fromEntries(Object.entries({
    limit: header("x-ratelimit-limit", "x-rate-limit-limit"),
    remaining: header("x-ratelimit-remaining", "x-rate-limit-remaining"),
    reset: header("x-ratelimit-reset", "x-rate-limit-reset"),
    retryAfter: header("retry-after", "x-ratelimit-retry-after", "x-rate-limit-retry-after"),
  }).filter(([, value]) => value !== undefined)) as ResponseMetadata["rateLimit"];
  return {
    endpoint: options.endpoint,
    method: options.method,
    correlationId: options.correlationId,
    ...(options.status === undefined ? {} : { status: options.status }),
    retryCount: options.retryCount,
    exchangeRequestId: header("x-gemini-request-id", "x-request-id", "request-id"),
    contentType: header("content-type")?.split(";", 1)[0]?.trim().toLowerCase(),
    ...(Object.keys(rateLimit ?? {}).length > 0 ? { rateLimit } : {}),
  };
}

export type OperationContext = {
  operation: string;
  clientOrderId?: string;
  clientOrderIds?: readonly string[];
};

export type AuthorizationContext = {
  requiredRole?: string;
  scope?: string;
};

export type SerializedError = {
  name: string;
  message: string;
  cause?: SerializedError;
  status?: number;
  reason?: string;
  code?: StableErrorCode;
  serverCode?: string | number;
  category?: ErrorCategory;
  opened?: boolean;
  closeCode?: number;
  closeReason?: string;
  metadata?: ResponseMetadata;
  operationContext?: OperationContext;
  authorizationContext?: AuthorizationContext;
  body?: unknown;
};

export type DiagnosticEvent = {
  level: LogLevel;
  component: "rest" | "oauth" | "websocket" | "order_book";
  name: string;
  traffic?: "control" | "stream" | "reconnect" | "mutation";
  response?: ResponseMetadata;
  operationContext?: OperationContext;
  metadata?: Readonly<Record<string, unknown>>;
  error?: SerializedError;
};

export type DiagnosticListener = (event: DiagnosticEvent) => void;

/** Remove credentials, query parameters, and fragments from a diagnostic URL. */
export function sanitizeDiagnosticUrl(value: string): string {
  try {
    const url = new URL(value);
    return `${url.protocol}//${url.host}${url.pathname}`;
  } catch {
    return "[REDACTED]";
  }
}

const SENSITIVE_KEY = /authorization|auth|api[-_]?key|api[-_]?secret|signature|payload|token|secret|password|private[-_]?key|bank|payment|account|routing|swift|iban|address|street|city|state|postal|zip|transfer|transaction|body/i;
const SENSITIVE_STRING = /\b(authorization|auth|x-gemini-(?:api[-_]?key|apikey|payload|signature)|api[-_]?key|api[-_]?secret|signature|payload|access[-_]?token|refresh[-_]?token)(\s*[:=]\s*)(?:[a-z]+\s+)?[^\s,&|]+/gi;

function redactString(value: string, secrets: readonly string[]): string {
  let redacted = value;
  for (const secret of secrets) {
    if (secret) redacted = redacted.replaceAll(secret, "[REDACTED]");
  }
  return redacted.replace(SENSITIVE_STRING, "$1$2[REDACTED]");
}

/** Clone and redact diagnostic data without mutating the caller's value. */
export function redactDiagnosticValue(
  value: unknown,
  secrets: readonly string[] = [],
  seen = new WeakSet<object>(),
  depth = 0,
): unknown {
  if (typeof value === "string") return redactString(value, secrets);
  if (typeof value === "bigint") return value.toString();
  if (value === null || typeof value !== "object") return value;
  if (depth > 12) return "[REDACTED]";
  if (seen.has(value)) return "[CIRCULAR]";
  seen.add(value);

  if (Array.isArray(value)) {
    return value.map((item) => redactDiagnosticValue(item, secrets, seen, depth + 1));
  }

  return Object.fromEntries(Object.entries(value).map(([key, item]) =>
    key === "authorizationContext"
      ? [key, redactDiagnosticValue(item, secrets, seen, depth + 1)]
      : SENSITIVE_KEY.test(key)
        ? [key, "[REDACTED]"]
        : [key, redactDiagnosticValue(item, secrets, seen, depth + 1)]));
}
