import { toBase64 } from "./encoding.js";

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
  classifyServerError,
  serializeError,
} from "../errors.js";
import { DEFAULT_TIMEOUT_MS, deadline, sleepWithSignal, type RequestOptions, withSignal } from "./deadline.js";
import {
  type Int64Path,
  normalizeInt64Paths,
  parseLosslessJson,
} from "../json.js";
import { emitDiagnostic, type Logger, NOOP_LOGGER } from "../logging.js";
import { createResponseMetadata, type DiagnosticListener, type OperationContext, type ResponseMetadata } from "../diagnostics.js";
import { ENVIRONMENT_URLS, type Environment } from "./environment.js";

type ApiErrorOptions = ConstructorParameters<typeof ApiError>[0];
type ApiErrorCtor = new (options: ApiErrorOptions) => ApiError;

// Reason code (normalized: lowercased, non-alphanumerics stripped) -> error type.
// Normalizing absorbs the casing/spacing drift the exchange emits ("RateLimit",
// "RATE_LIMIT", "Rate Limit" all collapse to "ratelimit").
const REASON_CLASS: Record<string, ApiErrorCtor> = {
  invalidnonce: InvalidNonce,
  missingnonce: MissingNonce,
  invalidsignature: InvalidSignature,
  missingrole: MissingRole,
  accepttermsrequired: AcceptTermsRequired,
  termsnotaccepted: AcceptTermsRequired,
  predictionmarketstermsmustbeacceptedbeforeplacingorders: AcceptTermsRequired,
  insufficientfunds: InsufficientFunds,
  ratelimit: RateLimitError,
};
const RETRYABLE_STATUS_CODES: readonly number[] = [429, 502, 503, 504];

const DEFAULT_BACKOFF_BASE_MS = 500;
const DEFAULT_BACKOFF_CAP_MS = 30_000;
const DEFAULT_BACKOFF_FACTOR = 2;
const MAX_SETTIMEOUT_MS = 2_147_483_647;
const MAX_PAGE_SIZE = 500;
const DEFAULT_PAGE_SIZE = 50;
const DEFAULT_MAX_RETRIES = 5;

// HTTP status -> error type, used when the reason code is absent or unrecognized.
function statusClass(status: number): ApiErrorCtor | undefined {
  if (status === 400) return InvalidRequest;
  if (status === 403) return MissingRole;
  if (status === 404) return NotFoundError;
  if (status === 406) return InsufficientFunds;
  if (status === 429) return RateLimitError;
  if (status >= 500) return ServiceUnavailable;
  return undefined;
}

// Map a non-2xx response to a typed error. Status is the primary key (always
// present); the body refines the specific reason. Unmapped -> generic ApiError.
function mapError(
  status: number,
  body: unknown,
  metadata?: ResponseMetadata,
  operationContext?: OperationContext,
): ApiError {
  const classification = classifyServerError(body, status);
  const rawReason = classification.reason;
  const norm = rawReason?.toLowerCase().replace(/[^a-z0-9]/g, "");
  const ctor = (norm && REASON_CLASS[norm]) || statusClass(status) || ApiError;
  return new ctor({
    status,
    reason: rawReason,
    body,
    metadata,
    operationContext,
    code: classification.code,
    category: classification.category,
    serverCode: classification.serverCode,
    authorizationContext: classification.authorizationContext,
  });
}

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
export type RestResponseMode = "json" | "file";
export type RestResponseContract = {
  successStatuses: readonly number[];
  responseContentTypes: readonly string[];
};
export type RestQueryParameter = {
  name: string;
  in: string;
  required: boolean;
  style: string;
  explode: boolean;
  shape?: "scalar" | "array" | "object";
  allowReserved?: boolean;
};
export type RestFileResponse = {
  bytes: Uint8Array;
  contentType?: string;
  contentDisposition?: string;
};

type FetchResponse = {
  status: number;
  headers?: { get(name: string): string | null };
  text(): Promise<string>;
  arrayBuffer?(): Promise<ArrayBuffer>;
};

/** The minimal slice of `fetch` this transport depends on. Native `fetch` satisfies it. */
export type FetchLike = (
  url: string,
  init: { method: HttpMethod; headers: Record<string, string>; body?: string; signal?: AbortSignal },
) => Promise<FetchResponse>;

/** Produces credentials for a private request. */
export interface AuthStrategy {
  /** A strictly increasing nonce per credential, or undefined when the scheme does not use one. */
  nextNonce(): string | undefined;
  /** Credential headers for a request whose private payload is `payloadBase64`. */
  credentialHeaders(payloadBase64: string, options?: RequestOptions): Promise<Record<string, string>>;
}

const rawJSON = (JSON as typeof JSON & { rawJSON(source: string): unknown }).rawJSON;

function mediaType(value: string | null | undefined): string | undefined {
  return value?.split(";", 1)[0]?.trim().toLowerCase() || undefined;
}

function validateResponseContract(
  status: number,
  headers: { get(name: string): string | null } | undefined,
  contract: RestResponseContract,
  path: string,
  metadata?: ResponseMetadata,
): void {
  if (!contract.successStatuses.includes(status)) {
    throw new SdkError(`unexpected success status ${status} for ${path}`, { metadata });
  }
  const actual = mediaType(headers?.get("content-type"));
  const expected = contract.responseContentTypes.map((value) => mediaType(value));
  if (!actual || !expected.includes(actual)) {
    throw new SdkError(`unexpected success content type ${actual ?? "missing"} for ${path}`, { metadata });
  }
}

const RESERVED_QUERY_ESCAPE = /%(?:21|23|24|26|27|28|29|2A|2B|2C|2F|3A|3B|3D|3F|40|5B|5D)/gi;
const COMPONENT_ESCAPE = /[!'()*]/g;

function encodeQueryValue(value: unknown, allowReserved: boolean): string {
  const encoded = encodeURIComponent(String(value)).replace(COMPONENT_ESCAPE, (character) =>
    `%${character.charCodeAt(0).toString(16).toUpperCase()}`);
  return allowReserved ? encoded.replace(RESERVED_QUERY_ESCAPE, decodeURIComponent) : encoded;
}

function appendQueryPair(
  parts: string[],
  name: string,
  value: unknown,
  allowReserved = false,
): void {
  parts.push(`${encodeQueryValue(name, false)}=${encodeQueryValue(value, allowReserved)}`);
}

function appendEncodedQueryPair(parts: string[], name: string, encodedValue: string): void {
  parts.push(`${encodeQueryValue(name, false)}=${encodedValue}`);
}

function encodedQueryValues(values: readonly unknown[], delimiter: string, allowReserved: boolean): string {
  return values
    .filter((value) => value !== undefined)
    .map((value) => encodeQueryValue(value, allowReserved))
    .join(delimiter);
}

function withDeclaredQuery(
  path: string,
  query: Record<string, unknown>,
  parameters: readonly RestQueryParameter[],
): string {
  const parts: string[] = [];
  for (const parameter of parameters) {
    const value = query[parameter.name];
    if (value === undefined) continue;
    const allowReserved = Boolean(parameter.allowReserved);
    if (parameter.style === "form") {
      if (Array.isArray(value)) {
        if (parameter.explode) {
          for (const item of value) {
            if (item !== undefined) appendQueryPair(parts, parameter.name, item, allowReserved);
          }
        } else {
          appendEncodedQueryPair(parts, parameter.name, encodedQueryValues(value, ",", allowReserved));
        }
      } else if (value !== null && typeof value === "object") {
        const entries = Object.entries(value).filter(([, item]) => item !== undefined);
        if (parameter.explode) {
          for (const [name, item] of entries) appendQueryPair(parts, name, item, allowReserved);
        } else {
          const flattened = entries.flatMap(([name, item]) => [name, item]);
          appendEncodedQueryPair(parts, parameter.name, encodedQueryValues(flattened, ",", allowReserved));
        }
      } else {
        appendQueryPair(parts, parameter.name, value, allowReserved);
      }
    } else if (parameter.style === "spaceDelimited" || parameter.style === "pipeDelimited") {
      const delimiter = parameter.style === "spaceDelimited" ? "%20" : "%7C";
      if (!Array.isArray(value)) throw new SdkError(`${parameter.name} must be an array for ${parameter.style} serialization`);
      appendEncodedQueryPair(parts, parameter.name, encodedQueryValues(value as unknown[], delimiter, allowReserved));
    } else if (parameter.style === "deepObject" && value !== null && typeof value === "object") {
      for (const [name, item] of Object.entries(value)) {
        if (item !== undefined) appendQueryPair(parts, `${parameter.name}[${name}]`, item, allowReserved);
      }
    } else {
      throw new SdkError(`unsupported query parameter serialization for ${parameter.name}`);
    }
  }
  return parts.length > 0 ? `${path}?${parts.join("&")}` : path;
}

function withQuery(
  path: string,
  query?: Record<string, unknown>,
  parameters?: readonly RestQueryParameter[],
): string {
  if (!query) return path;
  if (parameters) return withDeclaredQuery(path, query, parameters);
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (Array.isArray(value)) {
      for (const item of value) {
        if (item !== undefined) qs.append(key, String(item));
      }
    } else if (value !== undefined) {
      qs.append(key, String(value));
    }
  }
  const encoded = qs.toString();
  return encoded ? `${path}?${encoded}` : path;
}

export interface HttpTransportOptions {
  env: Environment;
  auth?: AuthStrategy;
  fetchImpl?: FetchLike;
  logger?: Logger;
  onDiagnostic?: DiagnosticListener;
  /** Max client-side retries for generated safe reads. Default 5. */
  maxRetries?: number;
  /** Transient-read backoff tuning. Defaults: base 500ms, cap 30s, factor 2. */
  backoff?: { baseMs?: number; capMs?: number; factor?: number };
  /** Default end-to-end request deadline. Defaults to 30 seconds. */
  timeoutMs?: number;
  /** Clock used for Retry-After HTTP dates. */
  now?: () => number;
  // Injectable so tests make jitter and waits deterministic; production uses the defaults.
  random?: () => number;
  sleep?: (ms: number) => Promise<void>;
}

export class HttpTransport {
  private readonly baseUrl: string;
  private readonly auth?: AuthStrategy;
  private readonly fetchImpl: FetchLike;
  private readonly logger: Logger;
  private readonly onDiagnostic?: DiagnosticListener;
  private readonly maxRetries: number;
  private readonly baseMs: number;
  private readonly capMs: number;
  private readonly factor: number;
  private readonly random: () => number;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly timeoutMs: number;
  private readonly now: () => number;

  constructor(options: HttpTransportOptions) {
    this.baseUrl = ENVIRONMENT_URLS[options.env].rest;
    this.auth = options.auth;
    this.fetchImpl = options.fetchImpl ?? ((url, init) => fetch(url, init) as ReturnType<FetchLike>);
    this.logger = options.logger ?? NOOP_LOGGER;
    this.onDiagnostic = options.onDiagnostic;
    const maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
    if (!Number.isInteger(maxRetries) || maxRetries < 0) {
      throw new SdkError("maxRetries must be a finite non-negative integer");
    }
    this.maxRetries = maxRetries;
    this.baseMs = options.backoff?.baseMs ?? DEFAULT_BACKOFF_BASE_MS;
    this.capMs = options.backoff?.capMs ?? DEFAULT_BACKOFF_CAP_MS;
    this.factor = options.backoff?.factor ?? DEFAULT_BACKOFF_FACTOR;
    if (![this.baseMs, this.capMs, this.factor].every(Number.isFinite) || this.baseMs < 0 || this.capMs < 0 || this.factor < 1) throw new SdkError("backoff values must be finite (base/cap >= 0, factor >= 1)");
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    if (!Number.isFinite(this.timeoutMs) || this.timeoutMs <= 0) throw new SdkError("timeoutMs must be a finite positive number");
    this.now = options.now ?? Date.now;
    this.random = options.random ?? Math.random;
    this.sleep = options.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  }

  /** Whether this transport uses the exact auth strategy instance supplied by the caller. */
  isAuthenticatedWith(auth: AuthStrategy): boolean {
    return this.auth === auth;
  }

  // Equal-jitter backoff for retry attempt N (0-based): half fixed, half random,
  // capped — the same shape WsTransport uses, so many clients throttled at once
  // don't retry in lockstep. No Retry-After is documented, so this is client-side.
  private backoffDelay(attempt: number): number {
    const raw = Math.min(this.capMs, this.baseMs * this.factor ** attempt);
    return raw / 2 + this.random() * (raw / 2);
  }

  private retryAfterDelay(value: string | null | undefined, attempt: number): number {
    const trimmed = value?.trim();
    if (trimmed && /^\d+$/.test(trimmed)) {
      const seconds = Number(trimmed);
      if (Number.isSafeInteger(seconds)) return Math.min(seconds * 1000, MAX_SETTIMEOUT_MS);
    }
    if (trimmed) {
      const date = Date.parse(trimmed);
      if (Number.isFinite(date)) return Math.min(Math.max(0, date - this.now()), MAX_SETTIMEOUT_MS);
    }
    return this.backoffDelay(attempt);
  }

  private isTransient(cause: unknown): boolean {
    if (cause instanceof TypeError) return true;
    if (!cause || typeof cause !== "object") return false;
    const error = cause as { code?: unknown; name?: unknown };
    return ["ECONNRESET", "ECONNREFUSED", "ECONNABORTED", "ETIMEDOUT", "EPIPE"].includes(String(error.code)) ||
      ["AbortError", "NetworkError"].includes(String(error.name));
  }

  /** Signed private request. Shapes the payload envelope and merges auth headers. */
  async request(options: {
    method: HttpMethod;
    path: string;
    params?: Record<string, unknown>;
    query?: Record<string, unknown>;
    queryParameters?: readonly RestQueryParameter[];
    headers?: Record<string, string>;
    responseInt64Paths?: readonly Int64Path[];
    responseMode?: RestResponseMode;
    responseContract?: RestResponseContract;
    retryable?: boolean;
    operationContext?: OperationContext;
  } & RequestOptions): Promise<unknown> {
    const { method, path, params } = options;
    if (!this.auth) {
      throw new SdkError("private request requires an injected AuthStrategy");
    }
    if (
      (params && Object.hasOwn(params, "nonce")) ||
      (options.query && Object.hasOwn(options.query, "nonce"))
    ) {
      throw new SdkError("nonce is reserved for the AuthStrategy");
    }
    const reservedCallerHeader = Object.keys(options.headers ?? {}).find((name) => {
      const normalized = name.toLowerCase();
      return normalized.startsWith("x-gemini-") || ["authorization", "content-length", "content-type", "cache-control", ...(options.responseContract ? ["accept"] : [])].includes(normalized);
    });
    if (reservedCallerHeader) {
      throw new SdkError(`private request header ${reservedCallerHeader} is reserved for transport or authentication`);
    }
    const auth = this.auth;
    const stableHeaders = { ...options.headers };
    // A retry refreshes authentication only; caller mutation must never change
    // the trading instruction between attempts.
    const stableParams = structuredClone(params);

    // Build the signed request afresh each attempt: a retry gets a new nonce and
    // signature, so the exchange never sees a reused nonce (-> InvalidNonce).
    const build = async () => {
      const payload: Record<string, unknown> = { request: path, ...stableParams };
      // A params key must never override the endpoint the payload is signed for.
      if (payload.request !== path) {
        throw new EndpointMismatch(path, payload.request);
      }
      const nonce = auth.nextNonce();
      if (nonce !== undefined) {
        if (!/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(nonce)) {
          throw new SdkError("AuthStrategy returned an invalid nonce");
        }
        payload.nonce = rawJSON(nonce);
      }
      const json = JSON.stringify(payload, (_key, value) =>
        typeof value === "bigint"
          ? rawJSON(value.toString())
          : value,
      );
      const b64 = toBase64(json);
      const credentials = await auth.credentialHeaders(b64, { signal: options.signal });
      const reservedHeader = Object.keys(credentials).find((name) =>
        ["content-length", "content-type", "cache-control", "x-gemini-payload"].includes(
          name.toLowerCase(),
        ),
      );
      if (reservedHeader) {
        throw new SdkError(`AuthStrategy returned reserved header ${reservedHeader}`);
      }
      // Auth headers spread FIRST so the fixed envelope headers always win — a
      // buggy strategy can never clobber X-GEMINI-PAYLOAD or the content headers.
      // (Content-Length is belt-and-suspenders: undici recomputes it for the
      // empty body, but the Gemini private-REST convention documents it.)
      const headers: Record<string, string> = {
        ...stableHeaders,
        ...credentials,
        ...(options.responseContract
          ? { Accept: options.responseContract.responseContentTypes.join(", ") }
          : {}),
        "Content-Length": "0",
        "Content-Type": "text/plain",
        "Cache-Control": "no-cache",
        "X-GEMINI-PAYLOAD": b64,
      };
      return headers;
    };

    return this.send(
      method,
      withQuery(path, options.query, options.queryParameters),
      build,
      options.responseInt64Paths,
      options.responseMode,
      options.responseContract,
      options.retryable,
      options,
      options.operationContext,
    );
  }

  /**
   * Unsigned public request (market data). No auth, no payload envelope — query
   * params go in the URL. Shares the same parse, error mapping and 429 backoff.
   */
  async requestPublic(options: {
    method: HttpMethod;
    path: string;
    query?: Record<string, unknown>;
    queryParameters?: readonly RestQueryParameter[];
    headers?: Record<string, string>;
    responseInt64Paths?: readonly Int64Path[];
    responseMode?: RestResponseMode;
    responseContract?: RestResponseContract;
    retryable?: boolean;
    operationContext?: OperationContext;
  } & RequestOptions): Promise<unknown> {
    if (options.responseContract && Object.keys(options.headers ?? {}).some((name) => name.toLowerCase() === "accept")) {
      throw new SdkError("Accept is reserved by the REST operation contract");
    }
    const stableHeaders = {
      ...options.headers,
      ...(options.responseContract ? { Accept: options.responseContract.responseContentTypes.join(", ") } : {}),
    };
    return this.send(
      options.method,
      withQuery(options.path, options.query, options.queryParameters),
      async () => stableHeaders,
      options.responseInt64Paths,
      options.responseMode,
      options.responseContract,
      options.retryable,
      options,
      options.operationContext,
    );
  }

  /**
   * Walk an offset-paginated endpoint, yielding each item across pages. The API
   * has no cursors: pages advance by incrementing `offset` by `limit` until a
   * short page (fewer than `limit` items) signals the end. Use `itemsKey` for
   * documented object envelopes such as `{ orders, pagination }`. `limit`
   * defaults to 50 and is clamped to the documented max of 500. Public pages
   * use query parameters; private pages default to the signed payload but can
   * select query parameters for endpoints that document them there. Offset
   * pagination is not snapshot-consistent; provide `dedupeKey` when drift
   * must fail loudly instead of yielding the same logical record twice.
   */
  async *paginate(options: {
    method: HttpMethod;
    path: string;
    params?: Record<string, unknown>;
    limit?: number;
    /** Endpoint-specific limit ceiling. Defaults to the API-wide maximum of 500. */
    maxLimit?: number;
    /** Top-level array field for endpoints that return an object envelope. */
    itemsKey?: string;
    visibility?: "private" | "public";
    parameterLocation?: "payload" | "query";
    responseInt64Paths?: readonly Int64Path[];
    maxItems?: number;
    dedupeKey?: (item: unknown) => string;
    retryable?: boolean;
  } & RequestOptions): AsyncGenerator<unknown> {
    for (const [name, value] of [["limit", options.limit], ["maxLimit", options.maxLimit]] as const) {
      if (value !== undefined && (!Number.isInteger(value) || value <= 0)) {
        throw new SdkError(`${name} must be a finite positive integer`);
      }
    }
    const maxLimit = Math.min(Math.max(options.maxLimit ?? MAX_PAGE_SIZE, 1), MAX_PAGE_SIZE);
    const limit = Math.min(Math.max(options.limit ?? DEFAULT_PAGE_SIZE, 1), maxLimit);
    if (options.maxItems !== undefined && (!Number.isInteger(options.maxItems) || options.maxItems <= 0)) throw new SdkError("maxItems must be a finite positive integer");
    const execution = deadline(options, this.timeoutMs);
    let yielded = 0;
    let offset = 0;
    const seen = options.dedupeKey ? new Set<string>() : undefined;
    try { for (;;) {
      const pageLimit = options.maxItems === undefined ? limit : Math.min(limit, options.maxItems - yielded);
      if (pageLimit <= 0) return;
      const params = { ...options.params, limit: pageLimit, offset };
      const page = options.visibility === "public"
        ? await this.requestPublic({
          method: options.method,
          path: options.path,
          query: params,
          responseInt64Paths: options.responseInt64Paths,
          retryable: options.retryable, signal: execution.signal, timeoutMs: this.timeoutMs,
        })
        : options.parameterLocation === "query"
          ? await this.request({
            method: options.method,
            path: options.path,
            query: params,
            responseInt64Paths: options.responseInt64Paths,
            retryable: options.retryable, signal: execution.signal, timeoutMs: this.timeoutMs,
          })
          : await this.request({
            method: options.method,
            path: options.path,
            params,
            responseInt64Paths: options.responseInt64Paths,
            retryable: options.retryable, signal: execution.signal, timeoutMs: this.timeoutMs,
          });
      const items = Array.isArray(page)
        ? page
        : options.itemsKey && page !== null && typeof page === "object"
          ? (page as Record<string, unknown>)[options.itemsKey]
          : undefined;
      if (!Array.isArray(items)) {
        const endpoint = options.path.split("?", 1)[0] ?? options.path;
        throw new SdkError(`paginate expected an array page from ${endpoint}`);
      }
      for (const item of items) {
        if (seen) {
          const key = options.dedupeKey?.(item);
          if (typeof key !== "string") throw new SdkError("dedupeKey must return a string");
          if (seen.has(key)) throw new SdkError(`paginate detected duplicate item key ${key}`);
          seen.add(key);
        }
        yield item;
        yielded++;
        if (yielded === options.maxItems) return;
      }
      if (items.length < pageLimit) return; // a short page is the last page
      offset += pageLimit;
    } } finally { execution.cleanup(); }
  }

  // Send with bounded safe-read retry. `buildHeaders` runs per attempt so each
  // retry is freshly signed. Mutations and non-transient errors return once.
  private async send(
    method: HttpMethod,
    path: string,
    buildHeaders: () => Promise<Record<string, string>>,
    responseInt64Paths: readonly Int64Path[] = [],
    responseMode: RestResponseMode = "json",
    responseContract?: RestResponseContract,
    retryable = false,
    requestOptions: RequestOptions = {},
    operationContext?: OperationContext,
  ): Promise<unknown> {
    const endpoint = path.split("?", 1)[0] ?? path;
    if (responseMode !== "json" && responseMode !== "file") {
      throw new SdkError(`unsupported response mode ${responseMode} for ${endpoint}`);
    }
    const canRetry = retryable && method === "GET";
    const correlationId = crypto.randomUUID();
    const responseMetadata = (
      status: number | undefined,
      retryCount: number,
      response?: { headers?: { get(name: string): string | null } },
    ): ResponseMetadata => createResponseMetadata({
        endpoint,
        method,
        correlationId,
        status,
        retryCount,
        headers: response?.headers,
      });
    const emit = (
      level: "debug" | "info" | "warn" | "error",
      name: string,
      response?: ResponseMetadata,
      metadata?: Record<string, unknown>,
      error?: unknown,
    ): void => emitDiagnostic({
      level,
      component: "rest",
      name,
      response,
      operationContext,
      metadata,
      ...(error ? { error: serializeError(error) } : {}),
    }, this.logger, this.onDiagnostic);
    emit("debug", "request.start", responseMetadata(undefined, 0), {
      operation: operationContext?.operation,
    });
    const execution = deadline(requestOptions, this.timeoutMs);
    try { for (let attempt = 0; ; attempt++) {
      let headers: Record<string, string>;
      try {
        headers = await withSignal(buildHeaders(), execution.signal);
      } catch (cause) {
        emit("error", "request.failure", responseMetadata(undefined, attempt), undefined, cause);
        throw cause;
      }
      let response: Awaited<ReturnType<FetchLike>>;
      try {
        response = await withSignal(
          this.fetchImpl(`${this.baseUrl}${path}`, { method, headers, signal: execution.signal }),
          execution.signal,
        );
      } catch (cause) {
        if (cause instanceof SdkError) {
          emit("error", "transport.failure", responseMetadata(undefined, attempt), undefined, cause);
          throw cause;
        }
        if (canRetry && attempt < this.maxRetries && this.isTransient(cause)) {
          const delay = this.backoffDelay(attempt);
          emit("warn", "request.retry", responseMetadata(undefined, attempt), { attempt, delayMs: delay });
          await sleepWithSignal(delay, execution.signal);
          continue;
        }
        const error = new SdkError(`HTTP request failed for ${endpoint}`, {
          cause,
          metadata: responseMetadata(undefined, attempt),
          operationContext,
        });
        emit("error", "transport.failure", error.metadata, undefined, error);
        throw error;
      }

      const isSuccess = response.status >= 200 && response.status < 300;
      if (isSuccess && responseContract) {
        try {
          validateResponseContract(
            response.status,
            response.headers,
            responseContract,
            endpoint,
            responseMetadata(response.status, attempt, response),
          );
        } catch (cause) {
          emit("error", "response.failure", responseMetadata(response.status, attempt, response), undefined, cause);
          throw cause;
        }
      }

      if (isSuccess && responseMode === "file") {
        if (!response.arrayBuffer) {
          const error = new SdkError(`file response from ${endpoint} cannot be read as bytes`, {
            metadata: responseMetadata(response.status, attempt, response),
            operationContext,
          });
          emit("error", "response.failure", error.metadata, undefined, error);
          throw error;
        }
        try {
          const fileResponse = {
            bytes: new Uint8Array(await withSignal(response.arrayBuffer(), execution.signal)),
            contentType: response.headers?.get("content-type") ?? undefined,
            contentDisposition: response.headers?.get("content-disposition") ?? undefined,
          } satisfies RestFileResponse;
          emit("info", "request.end", responseMetadata(response.status, attempt, response));
          return fileResponse;
        } catch (cause) {
          if (cause instanceof SdkError) throw cause;
          if (canRetry && attempt < this.maxRetries && this.isTransient(cause)) { await sleepWithSignal(this.backoffDelay(attempt), execution.signal); continue; }
          const error = new SdkError(`HTTP request failed for ${endpoint}`, {
            cause,
            metadata: responseMetadata(response.status, attempt, response),
            operationContext,
          });
          emit("error", "transport.failure", error.metadata, undefined, error);
          throw error;
        }
      }

      let text: string;
      try {
        text = await withSignal(response.text(), execution.signal);
      } catch (cause) {
        if (cause instanceof SdkError) throw cause;
        if (canRetry && RETRYABLE_STATUS_CODES.includes(response.status) && attempt < this.maxRetries && this.isTransient(cause)) {
          const delay = this.retryAfterDelay(response.headers?.get("retry-after"), attempt);
          emit("warn", "request.retry", responseMetadata(response.status, attempt, response), { attempt, delayMs: delay });
          await sleepWithSignal(delay, execution.signal);
          continue;
        }
        if (canRetry && attempt < this.maxRetries && this.isTransient(cause)) { await sleepWithSignal(this.backoffDelay(attempt), execution.signal); continue; }
        const error = new SdkError(`HTTP request failed for ${endpoint}`, {
          cause,
          metadata: responseMetadata(response.status, attempt, response),
          operationContext,
        });
        emit("error", "transport.failure", error.metadata, undefined, error);
        throw error;
      }

      if (canRetry && RETRYABLE_STATUS_CODES.includes(response.status) && attempt < this.maxRetries) {
        const delay = this.retryAfterDelay(response.headers?.get("retry-after"), attempt);
        emit("warn", "request.retry", responseMetadata(response.status, attempt, response), { attempt, delayMs: delay });
        await withSignal(this.sleep(delay), execution.signal);
        continue;
      }

      // Parse the body, but never let a non-JSON body (a proxy/LB HTML error
      // page, an empty 429) escape as a raw SyntaxError — that would strip the
      // HTTP status and defeat error mapping. Empty -> undefined; unparseable on
      // an error status -> map by status, keeping the raw text as the message.
      let body: unknown;
      try {
        body = text ? parseLosslessJson(text) : undefined;
      } catch (cause) {
        if (isSuccess) {
          // A 2xx that isn't JSON is a protocol violation — fail loud, typed.
          const error = new SdkError(`unparseable success response from ${endpoint}`, {
            cause,
            metadata: responseMetadata(response.status, attempt, response),
            operationContext,
          });
          emit("error", "response.failure", error.metadata, undefined, error);
          throw error;
        }
        body = text;
      }

      if (isSuccess) {
        let normalizedResponse: unknown;
        try {
          normalizedResponse = normalizeInt64Paths(body, responseInt64Paths);
        } catch (cause) {
          emit("error", "response.failure", responseMetadata(response.status, attempt, response), undefined, cause);
          throw cause;
        }
        emit("info", "request.end", responseMetadata(response.status, attempt, response));
        return normalizedResponse;
      }

      const apiError = mapError(
        response.status,
        body,
        responseMetadata(response.status, attempt, response),
        operationContext,
      );
      emit("error", "api.error", apiError.metadata, undefined, apiError);
      throw apiError;
    } } finally { execution.cleanup(); }
  }
}
