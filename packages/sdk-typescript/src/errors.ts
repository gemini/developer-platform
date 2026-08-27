import {
  type AuthorizationContext,
  type ErrorCategory,
  type OperationContext,
  type ResponseMetadata,
  redactDiagnosticValue,
  type SerializedError,
  type StableErrorCode,
} from "./observability/diagnostics.js";
import {
  boundaryValueKind,
  formatBoundaryValue,
  isBoundaryNumber,
  isBoundaryObject,
  isBoundaryString,
  type BoundaryValue,
} from "./utils/boundary-value.js";
const rawErrorBodies = new WeakMap<Error, BoundaryValue>();

function retainRawErrorBody(error: Error, body: BoundaryValue): void {
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

/** The caller request body does not match the documented input shape. */
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

/** The caller cancelled the SDK operation before it completed. */
export class RequestAbortedError extends SdkError {
  constructor(message = "request was aborted") { super(message); this.name = "RequestAbortedError"; }
}

/** The SDK operation exceeded its end-to-end deadline. */
export class RequestTimeoutError extends SdkError {
  constructor(message: string) { super(message); this.name = "RequestTimeoutError"; }
}

/** The OAuth callback has no state value or belongs to another authorization flow. */
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

/** An RFC 6749 error response from the Gemini OAuth token endpoint. */
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
    body?: BoundaryValue;
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

  constructor(options: { status: number; body: BoundaryValue; message?: string; operationContext?: OperationContext }) {
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
 * The `request` field in a private REST payload did not match the endpoint.
 * The SDK throws this error before it sends the request.
 */
export class EndpointMismatch extends SdkError {
  constructor(expected: string, actual: BoundaryValue) {
    super(`payload.request must be "${expected}", got ${boundaryValueKind(actual)}`);
    this.name = "EndpointMismatch";
  }
}

/**
 * A non-2xx REST response.
 * Catch this class to handle all HTTP errors, or catch a specific subclass.
 * `status` is the HTTP status code.
 * `reason` is the error code from the body.
 * Read raw response bodies only with `serializeError(error, { includeRawBody: true })`.
 */
export class ApiError extends SdkError {
  readonly status: number;
  readonly reason?: string;
  readonly code: StableErrorCode;
  readonly serverCode?: string | number;
  readonly category: ErrorCategory;
  readonly authorizationContext?: AuthorizationContext;

  static fromResponse(options: {
    status: number;
    body: BoundaryValue;
    metadata?: ResponseMetadata;
    operationContext?: OperationContext;
  }): ApiError {
    const classification = classifyServerError(options.body, options.status);
    const normalizedReason = normalized(classification.reason);
    const reasonClasses = {
      invalidnonce: InvalidNonce,
      missingnonce: MissingNonce,
      invalidsignature: InvalidSignature,
      missingrole: MissingRole,
      accepttermsrequired: AcceptTermsRequired,
      termsnotaccepted: AcceptTermsRequired,
      predictionmarketstermsmustbeacceptedbeforeplacingorders: AcceptTermsRequired,
      insufficientfunds: InsufficientFunds,
      ratelimit: RateLimitError,
      ratelimited: RateLimitError,
    };
    const statusClasses = {
      400: InvalidRequest,
      403: MissingRole,
      404: NotFoundError,
      406: InsufficientFunds,
      429: RateLimitError,
    };
    const reasonClass = normalizedReason === undefined
      ? undefined
      : Object.entries(reasonClasses).find(([reason]) => reason === normalizedReason)?.[1];
    const statusClass = Object.entries(statusClasses).find(([status]) => Number(status) === options.status)?.[1];
    const ErrorClass = reasonClass || statusClass ||
      (options.status >= 500 ? ServiceUnavailable : ApiError);
    return new ErrorClass({
      status: options.status,
      reason: classification.reason,
      body: options.body,
      metadata: options.metadata,
      operationContext: options.operationContext,
      code: classification.code,
      category: classification.category,
      serverCode: classification.serverCode,
      authorizationContext: classification.authorizationContext,
    });
  }

  static create(options: {
    status: number;
    body: BoundaryValue;
    metadata?: ResponseMetadata;
    operationContext?: OperationContext;
  }): ApiError {
    return ApiError.fromResponse(options);
  }

  constructor(options: {
    status: number;
    reason?: string;
    message?: string;
    body?: BoundaryValue;
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

export function createApiError(options: {
  status: number;
  body: BoundaryValue;
  metadata?: ResponseMetadata;
  operationContext?: OperationContext;
}): ApiError {
  return ApiError.fromResponse(options);
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
export function classifyServerError(body: BoundaryValue, status?: number): ServerErrorClassification {
  const record = isBoundaryObject(body) ? body : {};
  const nestedError = isBoundaryObject(record.error) ? record.error : undefined;
  const reason = isBoundaryString(record.reason)
    ? record.reason
    : isBoundaryString(record.error)
      ? record.error
      : isBoundaryString(nestedError?.msg)
        ? nestedError.msg
        : isBoundaryString(nestedError?.reason)
          ? nestedError.reason
          : isBoundaryString(record.code)
            ? record.code
            : undefined;
  const serverCode = isBoundaryString(record.code) || isBoundaryNumber(record.code)
    ? record.code
    : isBoundaryString(nestedError?.code) || isBoundaryNumber(nestedError?.code)
      ? nestedError.code
      : undefined;
  const requiredRole = isBoundaryString(record.requiredRole)
    ? record.requiredRole
    : isBoundaryString(record.required_role)
      ? record.required_role
      : undefined;
  const scope = isBoundaryString(record.accountScope)
    ? record.accountScope
    : isBoundaryString(record.account_scope)
      ? record.account_scope
      : isBoundaryString(record.scope)
        ? record.scope
        : undefined;
  let authorizationContext: AuthorizationContext | undefined;
  if (requiredRole !== undefined || scope !== undefined) {
    authorizationContext = {};
    if (requiredRole !== undefined) authorizationContext.requiredRole = requiredRole;
    if (scope !== undefined) authorizationContext.scope = scope;
  }
  const classification: ServerErrorClassification = {
    reason,
    ...(reasonClassification(reason) ?? statusClassification(status ?? 0)),
  };
  if (serverCode) classification.serverCode = serverCode;
  if (authorizationContext) classification.authorizationContext = authorizationContext;
  return classification;
}

export type SerializeErrorOptions = { includeRawBody?: boolean };

/** Serialize an SDK error for logs or telemetry without raw secrets. */
export function serializeError(cause: unknown, options?: SerializeErrorOptions): SerializedError {
  if (!(cause instanceof Error)) {
    return { name: "Error", message: "Unknown error" };
  }

// SAFETY: The instanceof check establishes the Error base; the SDK's error classes attach these optional diagnostic fields.
  const candidate = cause as Error & {
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
    isBoundaryNumber(candidate.serverCode) || reasonClassification(String(candidate.serverCode)) !== undefined
  ) ? candidate.serverCode : undefined;
  const serialized: SerializedError = {
    name: cause.name,
    message: redactDiagnosticValue(cause.message),
  };
  if (candidate.cause instanceof Error) {
    serialized.cause = serializeError(candidate.cause);
  } else if (candidate.cause !== undefined) {
    serialized.cause = { name: "Cause", message: "Non-Error cause" };
  }
  if (candidate.status !== undefined) serialized.status = candidate.status;
  if (safeReason !== undefined) serialized.reason = safeReason;
  if (candidate.code !== undefined) serialized.code = candidate.code;
  if (safeServerCode !== undefined) serialized.serverCode = safeServerCode;
  if (candidate.category !== undefined) serialized.category = candidate.category;
  if (candidate.opened !== undefined) serialized.opened = candidate.opened;
  if (candidate.closeCode !== undefined) serialized.closeCode = candidate.closeCode;
  if (candidate.closeReason !== undefined) serialized.closeReason = redactDiagnosticValue(candidate.closeReason);
  if (candidate.metadata) serialized.metadata = candidate.metadata;
  if (candidate.operationContext) serialized.operationContext = candidate.operationContext;
  if (candidate.authorizationContext) serialized.authorizationContext = candidate.authorizationContext;
  const body = rawErrorBodies.get(cause);
  if (options?.includeRawBody && body !== undefined) serialized.body = body;
  return serialized;
}

type ApiErrorOptions = ConstructorParameters<typeof ApiError>[0];

/** 400: the request was malformed or rejected. */
export class InvalidRequest extends ApiError {
  constructor(options: ApiErrorOptions) {
    super(options);
    this.name = "InvalidRequest";
  }
}
/** The nonce was reused or did not increase. */
export class InvalidNonce extends ApiError {
  constructor(options: ApiErrorOptions) {
    super(options);
    this.name = "InvalidNonce";
  }
}
/** The payload did not contain the required nonce. */
export class MissingNonce extends ApiError {
  constructor(options: ApiErrorOptions) {
    super(options);
    this.name = "MissingNonce";
  }
}
/** The request signature did not match the payload. */
export class InvalidSignature extends ApiError {
  constructor(options: ApiErrorOptions) {
    super(options);
    this.name = "InvalidSignature";
  }
}
/** The API key does not have a role required by this endpoint. */
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
/** 406: the account does not have enough funds or quantity for the request. */
export class InsufficientFunds extends ApiError {
  constructor(options: ApiErrorOptions) {
    super(options);
    this.name = "InsufficientFunds";
  }
}
/** 429: the rate limit was exceeded after client-side retries. */
export class RateLimitError extends ApiError {
  constructor(options: ApiErrorOptions) {
    super(options);
    this.name = "RateLimitError";
  }
}
/** 5xx: the exchange is unavailable or has an internal error. */
export class ServiceUnavailable extends ApiError {
  constructor(options: ApiErrorOptions) {
    super(options);
    this.name = "ServiceUnavailable";
  }
}

/**
 * The local order book has a gap in the update sequence.
 * Discard it and rebuild it from a new snapshot.
 *
 * `lastUpdateId` is the last update applied to the book.
 * `firstUpdateId` is the first ID in the diff that skipped ahead.
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
