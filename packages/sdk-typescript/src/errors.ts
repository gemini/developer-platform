import {
  type AuthorizationContext,
  type ErrorCategory,
  type OperationContext,
  type ResponseMetadata,
  redactDiagnosticValue,
  type SerializedError,
  type StableErrorCode,
} from "./diagnostics.js";
const rawErrorBodies = new WeakMap<Error, unknown>();

function retainRawErrorBody(error: Error, body: unknown): void {
  if (body !== undefined) rawErrorBodies.set(error, body);
}

export class SdkError extends Error {
  readonly metadata?: ResponseMetadata;
  readonly operationContext?: OperationContext;

  constructor(message: string, options?: {
    cause?: unknown;
    metadata?: ResponseMetadata;
    operationContext?: OperationContext;
  }) {
    super(message, options);
    this.name = "SdkError";
    this.metadata = options?.metadata;
    this.operationContext = options?.operationContext;
  }

  toJSON(): SerializedError {
    return serializeError(this);
  }
}

/** A caller-owned request body does not match the documented input shape. */
export class ValidationError extends SdkError {
  readonly operation: string;
  readonly field: string;
  readonly rule: string;

  constructor(options: { operation: string; field: string; rule: string; message: string }) {
    super(options.message);
    this.name = "ValidationError";
    this.operation = options.operation;
    this.field = options.field;
    this.rule = options.rule;
  }
}

/** The caller cancelled an SDK operation before it completed. */
export class RequestAbortedError extends SdkError {
  constructor(message = "request was aborted") { super(message); this.name = "RequestAbortedError"; }
}

/** An SDK operation exceeded its configured end-to-end deadline. */
export class RequestTimeoutError extends SdkError {
  constructor(message: string) { super(message); this.name = "RequestTimeoutError"; }
}

/** The OAuth callback is missing the state value or belongs to another authorization flow. */
export class OAuthStateError extends SdkError {
  constructor(message: string) {
    super(message);
    this.name = "OAuthStateError";
  }
}

/** An error returned through the browser authorization callback. */
export class OAuthAuthorizationError extends SdkError {
  readonly error: string;
  readonly errorDescription?: string;

  constructor(error: string, errorDescription?: string) {
    super("OAuth authorization failed");
    this.name = "OAuthAuthorizationError";
    this.error = error;
    this.errorDescription = errorDescription;
  }
}

/** An RFC 6749 error response from Gemini's OAuth token endpoint. */
export class OAuthTokenError extends SdkError {
  readonly status: number;
  readonly error: string;
  readonly errorDescription?: string;
  readonly category: ErrorCategory = "authentication";
  readonly code: StableErrorCode = "authentication_failed";

  constructor(options: {
    status: number;
    error: string;
    errorDescription?: string;
    body?: unknown;
    metadata?: ResponseMetadata;
  }) {
    super("OAuth token request failed", { metadata: options.metadata });
    this.name = "OAuthTokenError";
    this.status = options.status;
    this.error = options.error;
    this.errorDescription = options.errorDescription;
    retainRawErrorBody(this, options.body);
  }
}

/**
 * The WebSocket connection failed to open, or dropped mid-stream.
 * `options.cause`, when present, holds the underlying network error.
 */
export class ConnectionError extends SdkError {
  readonly opened?: boolean;
  readonly closeCode?: number;
  readonly closeReason?: string;

  constructor(message: string, options?: {
    cause?: unknown;
    opened?: boolean;
    closeCode?: number;
    closeReason?: string;
  }) {
    super(message, options);
    this.name = "ConnectionError";
    this.opened = options?.opened;
    this.closeCode = options?.closeCode;
    this.closeReason = options?.closeReason;
  }
}

/** A non-success response to a WebSocket method request. */
export class WebSocketRequestError extends SdkError {
  readonly status: number;
  readonly reason?: string;
  readonly code: StableErrorCode;
  readonly serverCode?: string | number;
  readonly category: ErrorCategory;
  readonly authorizationContext?: AuthorizationContext;

  constructor(options: { status: number; body: unknown; message?: string; operationContext?: OperationContext }) {
    const classification = classifyServerError(options.body, options.status);
    super(options.message ?? `WebSocket request failed with status ${options.status}`, {
      operationContext: options.operationContext,
    });
    this.name = "WebSocketRequestError";
    this.status = options.status;
    this.reason = classification.reason;
    this.code = classification.code;
    this.serverCode = classification.serverCode;
    this.category = classification.category;
    this.authorizationContext = classification.authorizationContext;
    retainRawErrorBody(this, options.body);
  }
}

/**
 * A private REST payload's `request` field did not match the endpoint being
 * called — a build-time invariant violation (e.g. a params key clobbering
 * `request`). Thrown before the request is sent, never silently corrected.
 */
export class EndpointMismatch extends SdkError {
  constructor(expected: string, actual: unknown) {
    super(`payload.request must be "${expected}", got ${typeof actual}`);
    this.name = "EndpointMismatch";
  }
}

/**
 * A non-2xx REST response. The base class for every API-reported failure; catch
 * it to handle any HTTP error at once, or catch a specific subclass below.
 *   - status: the HTTP status code
 *   - reason: the error code from the body (`reason` or `error` field), verbatim
 * Raw response bodies are available only through `serializeError(error, { includeRawBody: true })`.
 */
export class ApiError extends SdkError {
  readonly status: number;
  readonly reason?: string;
  readonly code: StableErrorCode;
  readonly serverCode?: string | number;
  readonly category: ErrorCategory;
  readonly authorizationContext?: AuthorizationContext;

  constructor(options: {
    status: number;
    reason?: string;
    message?: string;
    body?: unknown;
    metadata?: ResponseMetadata;
    operationContext?: OperationContext;
    code?: StableErrorCode;
    serverCode?: string | number;
    category?: ErrorCategory;
    authorizationContext?: AuthorizationContext;
  }) {
    const classification = classifyServerError({ error: options.reason, code: options.serverCode }, options.status);
    super(options.message ?? `HTTP ${options.status}`, {
      metadata: options.metadata,
      operationContext: options.operationContext,
    });
    this.name = "ApiError";
    this.status = options.status;
    this.reason = options.reason;
    retainRawErrorBody(this, options.body);
    this.code = options.code ?? classification.code;
    this.serverCode = options.serverCode ?? classification.serverCode;
    this.category = options.category ?? classification.category;
    this.authorizationContext = options.authorizationContext ?? classification.authorizationContext;
  }
}

export type ServerErrorClassification = {
  reason?: string;
  code: StableErrorCode;
  category: ErrorCategory;
  serverCode?: string | number;
  authorizationContext?: AuthorizationContext;
};

function normalized(value: string | undefined): string | undefined {
  return value?.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function reasonClassification(reason: string | undefined): Pick<ServerErrorClassification, "code" | "category"> | undefined {
  switch (normalized(reason)) {
    case "invalidinput":
    case "badrequest":
    case "invalidrequest":
      return { code: "invalid_input", category: "validation" };
    case "invalidnonce":
    case "missingnonce":
    case "invalidsignature":
      return { code: "authentication_failed", category: "authentication" };
    case "missingrole":
    case "forbidden":
      return { code: "authorization_failed", category: "authorization" };
    case "accepttermsrequired":
    case "termsnotaccepted":
    case "predictionmarketstermsmustbeacceptedbeforeplacingorders":
      return { code: "terms_required", category: "authorization" };
    case "termsnotfound":
      return { code: "terms_not_found", category: "not_found" };
    case "ordernotfound":
      return { code: "order_not_found", category: "not_found" };
    case "notfound":
      return { code: "not_found", category: "not_found" };
    case "insufficientfunds":
      return { code: "insufficient_funds", category: "funds" };
    case "ratelimit":
    case "ratelimited":
      return { code: "rate_limited", category: "rate_limit" };
    case "programunavailable":
      return { code: "program_unavailable", category: "service_unavailable" };
    case "serviceunavailable":
    case "internalerror":
      return { code: "service_unavailable", category: "service_unavailable" };
    default:
      return undefined;
  }
}

function statusClassification(status: number): Pick<ServerErrorClassification, "code" | "category"> {
  if (status === 400) return { code: "invalid_request", category: "validation" };
  if (status === 401) return { code: "authentication_failed", category: "authentication" };
  if (status === 403) return { code: "authorization_failed", category: "authorization" };
  if (status === 404) return { code: "not_found", category: "not_found" };
  if (status === 406) return { code: "insufficient_funds", category: "funds" };
  if (status === 429) return { code: "rate_limited", category: "rate_limit" };
  if (status >= 500) return { code: "service_unavailable", category: "service_unavailable" };
  return { code: "unknown", category: "unknown" };
}

/** Classify an exchange error without retaining or returning its raw body. */
export function classifyServerError(body: unknown, status?: number): ServerErrorClassification {
  const record = body !== null && typeof body === "object" && !Array.isArray(body)
    ? body as Record<string, unknown>
    : {};
  const nestedError = record.error !== null && typeof record.error === "object" && !Array.isArray(record.error)
    ? record.error as Record<string, unknown>
    : undefined;
  const reason = typeof record.reason === "string"
    ? record.reason
    : typeof record.error === "string"
      ? record.error
      : typeof nestedError?.msg === "string"
        ? nestedError.msg
        : typeof nestedError?.reason === "string"
          ? nestedError.reason
          : typeof record.code === "string"
            ? record.code
            : undefined;
  const serverCode = typeof record.code === "string" || typeof record.code === "number"
    ? record.code
    : typeof nestedError?.code === "string" || typeof nestedError?.code === "number"
      ? nestedError.code
      : undefined;
  const requiredRole = typeof record.requiredRole === "string"
    ? record.requiredRole
    : typeof record.required_role === "string"
      ? record.required_role
      : undefined;
  const scope = typeof record.accountScope === "string"
    ? record.accountScope
    : typeof record.account_scope === "string"
      ? record.account_scope
      : typeof record.scope === "string"
        ? record.scope
        : undefined;
  const authorizationContext = requiredRole !== undefined || scope !== undefined
    ? {
      ...(requiredRole !== undefined ? { requiredRole } : {}),
      ...(scope !== undefined ? { scope } : {}),
    }
    : undefined;
  return {
    reason,
    ...(reasonClassification(reason) ?? statusClassification(status ?? 0)),
    ...(serverCode ? { serverCode } : {}),
    ...(authorizationContext ? { authorizationContext } : {}),
  };
}

export type SerializeErrorOptions = { includeRawBody?: boolean };

/** Serialize an SDK error for logs, telemetry, or evidence without raw secrets. */
export function serializeError(error: unknown, options?: SerializeErrorOptions): SerializedError {
  if (!(error instanceof Error)) {
    return { name: "Error", message: "Unknown error" };
  }

  const candidate = error as Error & {
    status?: number;
    reason?: string;
    code?: StableErrorCode;
    serverCode?: string | number;
    category?: ErrorCategory;
    opened?: boolean;
    closeCode?: number;
    closeReason?: string;
    cause?: unknown;
    metadata?: ResponseMetadata;
    operationContext?: OperationContext;
    authorizationContext?: AuthorizationContext;
  };
  const safeReason = candidate.reason !== undefined && reasonClassification(candidate.reason) !== undefined
    ? candidate.reason
    : undefined;
  const safeServerCode = candidate.serverCode !== undefined && (
    typeof candidate.serverCode === "number" || reasonClassification(String(candidate.serverCode)) !== undefined
  ) ? candidate.serverCode : undefined;
  const serialized: SerializedError = {
    name: error.name,
    message: redactDiagnosticValue(error.message) as string,
    ...(candidate.cause instanceof Error
      ? { cause: serializeError(candidate.cause) }
      : candidate.cause !== undefined
        ? { cause: { name: "Cause", message: redactDiagnosticValue(String(candidate.cause)) as string } }
        : {}),
    ...(candidate.status !== undefined ? { status: candidate.status } : {}),
    ...(safeReason !== undefined ? { reason: safeReason } : {}),
    ...(candidate.code !== undefined ? { code: candidate.code } : {}),
    ...(safeServerCode !== undefined ? { serverCode: safeServerCode } : {}),
    ...(candidate.category !== undefined ? { category: candidate.category } : {}),
    ...(candidate.opened !== undefined ? { opened: candidate.opened } : {}),
    ...(candidate.closeCode !== undefined ? { closeCode: candidate.closeCode } : {}),
    ...(candidate.closeReason !== undefined ? { closeReason: redactDiagnosticValue(candidate.closeReason) as string } : {}),
    ...(candidate.metadata ? { metadata: candidate.metadata } : {}),
    ...(candidate.operationContext ? { operationContext: candidate.operationContext } : {}),
    ...(candidate.authorizationContext ? { authorizationContext: candidate.authorizationContext } : {}),
  };
  const body = rawErrorBodies.get(error);
  if (options?.includeRawBody && body !== undefined) serialized.body = body;
  return serialized;
}

type ApiErrorOptions = ConstructorParameters<typeof ApiError>[0];

/** 400: the request was malformed or rejected (generic 4xx default). */
export class InvalidRequest extends ApiError {
  constructor(options: ApiErrorOptions) {
    super(options);
    this.name = "InvalidRequest";
  }
}
/** The nonce was reused or did not strictly increase. */
export class InvalidNonce extends ApiError {
  constructor(options: ApiErrorOptions) {
    super(options);
    this.name = "InvalidNonce";
  }
}
/** The payload omitted the required nonce. */
export class MissingNonce extends ApiError {
  constructor(options: ApiErrorOptions) {
    super(options);
    this.name = "MissingNonce";
  }
}
/** The request signature did not verify against the payload. */
export class InvalidSignature extends ApiError {
  constructor(options: ApiErrorOptions) {
    super(options);
    this.name = "InvalidSignature";
  }
}
/** The API key lacks a role required for this endpoint (403 default). */
export class MissingRole extends ApiError {
  constructor(options: ApiErrorOptions) {
    super(options);
    this.name = "MissingRole";
  }
}
/** The caller must accept the current terms before using this endpoint. */
export class AcceptTermsRequired extends ApiError {
  constructor(options: ApiErrorOptions) {
    super(options);
    this.name = "AcceptTermsRequired";
  }
}
/** 404: the referenced resource does not exist. */
export class NotFoundError extends ApiError {
  constructor(options: ApiErrorOptions) {
    super(options);
    this.name = "NotFoundError";
  }
}
/** 406: the account lacks the funds/quantity to satisfy the request. */
export class InsufficientFunds extends ApiError {
  constructor(options: ApiErrorOptions) {
    super(options);
    this.name = "InsufficientFunds";
  }
}
/** 429: rate limit exceeded. Thrown after client-side retries are exhausted. */
export class RateLimitError extends ApiError {
  constructor(options: ApiErrorOptions) {
    super(options);
    this.name = "RateLimitError";
  }
}
/** 5xx: the exchange is unavailable or errored internally. */
export class ServiceUnavailable extends ApiError {
  constructor(options: ApiErrorOptions) {
    super(options);
    this.name = "ServiceUnavailable";
  }
}

/**
 * The local order book hit a gap in the update sequence, so it can no longer be
 * trusted and must be discarded and rebuilt from a fresh snapshot.
 *
 * The two ids describe the gap (for logging/debugging):
 *   - lastUpdateId:  the last update the book had applied
 *   - firstUpdateId: the first id of the diff that skipped ahead
 */
export class ResyncRequiredError extends SdkError {
  readonly lastUpdateId: bigint;
  readonly firstUpdateId: bigint;

  constructor(lastUpdateId: bigint, firstUpdateId: bigint) {
    super(
      `Order book gap: had update ${lastUpdateId}, next diff started at ${firstUpdateId}`,
    );
    this.name = "ResyncRequiredError";
    this.lastUpdateId = lastUpdateId;
    this.firstUpdateId = firstUpdateId;
  }
}
