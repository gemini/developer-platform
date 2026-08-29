import { cancelResponseBody, isRedirectResponse, readBoundedResponseText, type AuthStrategy, type FetchLike } from "../transport/http.js";
import { DEFAULT_TIMEOUT_MS, deadline, type RequestOptions, withSignal } from "../utils/deadline.js";
import {
  OAuthAuthorizationError,
  OAuthStateError,
  OAuthTokenError,
  ApiError,
  classifyServerError,
  SdkError,
  serializeError,
} from "../errors.js";
import {
  createResponseMetadata,
  sanitizeDiagnosticUrl,
  type DiagnosticEvent,
  type DiagnosticListener,
  type ResponseMetadata,
} from "../observability/diagnostics.js";
import { emitDiagnostic, type Logger, NOOP_LOGGER } from "../observability/logging.js";
import type { Environment } from "../types/client.js";
import { toBase64, toBase64Url } from "../utils/encoding.js";
import {
  createPkceCodeChallenge,
  generatePkceCodeVerifier,
  isValidPkceCodeVerifier,
  type RandomBytes,
} from "./pkce.js";
import { validateOAuthToken } from "./token-values.js";
import {
  isBoundaryFunction,
  isBoundaryNumber,
  isBoundaryObject,
  isBoundaryString,
  type BoundaryRecord,
  type BoundaryValue,
} from "../utils/boundary-value.js";

const DEFAULT_REFRESH_SKEW_MS = 60_000;
const DEFAULT_MAX_OAUTH_RESPONSE_SIZE_BYTES = 1 * 1024 * 1024;
const MAX_OAUTH_STATE_LENGTH = 256;
const LOCAL_AUTHORIZATION_STATE_TTL_MS = 10 * 60_000;
const MAX_LOCAL_AUTHORIZATION_STATES = 1_024;
const UNSAFE_REDIRECT_PROTOCOLS = new Set([
  "about:",
  "blob:",
  "chrome-extension:",
  "chrome:",
  "data:",
  "file:",
  "ftp:",
  "ftps:",
  "intent:",
  "javascript:",
  "mailto:",
  "tel:",
  "urn:",
  "vbscript:",
  "ws:",
  "wss:",
]);
const OAUTH_STATE_PATTERN = new RegExp(`^[A-Za-z0-9_-]{43,${MAX_OAUTH_STATE_LENGTH}}$`);
const OAUTH_CALLBACK_RESPONSE_PARAMETERS = new Set([
  "code",
  "state",
  "error",
  "error_description",
  "error_uri",
  "iss",
]);

export interface OAuthEndpoints {
  api: string;
  authorization: string;
  token: string;
  /** OAuth token revocation endpoint. Omit to use the environment default. */
  revocation?: string;
}

export const DEFAULT_OAUTH_ENDPOINTS = {
  production: {
    api: "https://api.gemini.com",
    authorization: "https://exchange.gemini.com/auth",
    token: "https://exchange.gemini.com/auth/token",
    revocation: "https://exchange.gemini.com/auth/token/revoke",
  },
  sandbox: {
    api: "https://api.sandbox.gemini.com",
    authorization: "https://exchange.sandbox.gemini.com/auth",
    token: "https://exchange.sandbox.gemini.com/auth/token",
    revocation: "https://exchange.sandbox.gemini.com/auth/token/revoke",
  },
} satisfies Record<Environment, OAuthEndpoints>;

type OAuthTokenRequest = {
  client_id: string;
  code?: string;
  redirect_uri?: string;
  grant_type: "authorization_code" | "refresh_token";
  refresh_token?: string;
  client_secret?: string;
  code_verifier?: string;
};

export type OAuthClient =
  | { type: "public"; clientId: string; redirectUri: string }
  | { type: "confidential"; clientId: string; clientSecret: string; redirectUri: string };

export interface OAuthTokens {
  accessToken: string;
  refreshToken: string;
  tokenType: "bearer";
  scope: string;
  /** Absolute Unix time in milliseconds. */
  expiresAt: number;
}

/**
 * Application-owned OAuth token storage adapter.
 *
 * The SDK does not select or manage the underlying storage medium. An
 * application may back this interface with a keychain, encrypted file,
 * database, browser secure-storage abstraction, or another store. The
 * implementation is responsible for serialization and protecting the token
 * values. `runExclusive` must serialize operations for all OAuthAuth instances
 * that use the same store.
 */
export interface OAuthTokenStore<T = OAuthTokens> {
  load(): Promise<T | undefined>;
  save(tokens: T): Promise<void>;
  clear(): Promise<void>;
  /**
   * Legacy compatibility hook for atomically claiming an authorization state.
   * Prefer `authorizationTransactionStore` when authorization transactions are
   * stored separately from tokens.
   */
  consumeAuthorizationState?(state: string): Promise<boolean>;
  /**
   * Clear the stored record only when it still uses `refreshToken`.
   * A store shared by processes must implement this as a real compare-and-swap operation.
   */
  clearIfCurrent?(refreshToken: string): Promise<boolean>;
  runExclusive<T>(operation: () => Promise<T>): Promise<T>;
}

export interface OAuthAuthorizationTransaction {
  state: string;
  /** Present only for public clients. Keep it private until the callback. */
  codeVerifier?: string;
}

export interface OAuthAuthorizationRequest {
  url: string;
  transaction: OAuthAuthorizationTransaction;
}

/**
 * Store short-lived authorization transactions independently of OAuth tokens.
 * `consume` must atomically return a transaction only once.
 */
export interface OAuthAuthorizationTransactionStore {
  /** Store this record with a short expiration and keep its verifier confidential. */
  save(transaction: OAuthAuthorizationTransaction): Promise<void>;
  /** Atomically return and delete the record for `state`; return undefined on replay or expiry. */
  consume(state: string): Promise<OAuthAuthorizationTransaction | undefined>;
}

export interface OAuthAuthOptions {
  client: OAuthClient;
  /** Optional when the caller only needs authorization URL and code exchange. */
  tokenStore?: OAuthTokenStore;
  /** Optional short-lived store for transactions that span requests or pages. */
  authorizationTransactionStore?: OAuthAuthorizationTransactionStore;
  /** OAuth environment. Required to prevent accidental live authorization. */
  env: Environment;
  /**
   * HTTPS OAuth endpoint overrides for tests, mocks, or proxies. When
   * overriding `authorization` or `token`, also provide `revocation` so
   * credentials cannot be sent to a different OAuth authority.
   */
  endpoints?: Partial<OAuthEndpoints>;
  fetchImpl?: FetchLike;
  now?: () => number;
  /** Cryptographically secure random source. Override only for deterministic tests. */
  randomBytes?: (size: number) => Uint8Array;
  /** Refresh this many milliseconds before expiry. Default: 60 seconds. */
  refreshSkewMs?: number;
  /** End-to-end timeout for token exchange and refresh. Default: 30 seconds. */
  timeoutMs?: number;
  /** Maximum OAuth response body size. Default: 1 MiB. */
  maxResponseSizeBytes?: number;
  /** Receives safe OAuth lifecycle diagnostics. Default: silent. */
  logger?: Logger;
  onDiagnostic?: DiagnosticListener;
}

function requiredString(value: BoundaryValue, name: string): string {
  if (!isBoundaryString(value) || value.length === 0) {
    throw new SdkError(`${name} is required`);
  }
  return value;
}

function validateRedirectUri(value: string): string {
  let redirect: URL;
  try {
    redirect = new URL(value);
  } catch {
    throw new SdkError("redirectUri must be a valid URL");
  }
  if (UNSAFE_REDIRECT_PROTOCOLS.has(redirect.protocol)) {
    throw new SdkError("redirectUri must use a safe URL scheme");
  }
  if (redirect.username || redirect.password) {
    throw new SdkError("redirectUri must not contain URL credentials");
  }
  if (redirect.protocol === "http:" && !isLoopbackHost(redirect.hostname)) {
    throw new SdkError("non-loopback redirectUri must use HTTPS");
  }
  return value;
}

function isLoopbackHost(hostname: string): boolean {
  const normalized = hostname.toLowerCase();
  if (normalized === "localhost" || normalized === "[::1]" || normalized === "::1") return true;
  const octets = normalized.split(".");
  return octets.length === 4 && octets[0] === "127" &&
    octets.slice(1).every((octet) => /^\d{1,3}$/.test(octet) && Number(octet) <= 255);
}

function validateHttpsEndpoint(value: BoundaryValue, name: string): string {
  const endpoint = requiredString(value, name);
  let parsed: URL;
  try {
    parsed = new URL(endpoint);
  } catch {
    throw new SdkError(`${name} must be a valid URL`);
  }
  if (parsed.protocol !== "https:") {
    throw new SdkError(`${name} must use HTTPS`);
  }
  if (parsed.username || parsed.password || parsed.hash) {
    throw new SdkError(`${name} must not contain URL credentials or a fragment`);
  }
  return endpoint;
}

function createAuthorizationState(randomBytes: (size: number) => Uint8Array): string {
  const bytes = randomBytes(32);
  if (!(bytes instanceof Uint8Array) || bytes.length < 32) {
    throw new SdkError("randomBytes must return at least 32 bytes for OAuth state");
  }
  const state = toBase64Url(bytes);
  if (!OAUTH_STATE_PATTERN.test(state)) {
    throw new SdkError("generated OAuth state is invalid");
  }
  return state;
}

function parseCallback(callback: string | URL): URL {
  try {
    return callback instanceof URL ? callback : new URL(callback);
  } catch {
    throw new OAuthStateError("OAuth callback is not a valid URL");
  }
}

function callbackMatchesRedirect(url: URL, redirect: URL): boolean {
  if (
    url.protocol !== redirect.protocol ||
    url.username !== redirect.username ||
    url.password !== redirect.password ||
    url.host !== redirect.host ||
    url.pathname !== redirect.pathname ||
    url.hash !== redirect.hash
  ) return false;

  for (const name of OAUTH_CALLBACK_RESPONSE_PARAMETERS) {
    if (url.searchParams.getAll(name).length > 1) return false;
  }

  const configured = new Map<string, Map<string, number>>();
  for (const [name, value] of redirect.searchParams) {
    const values = configured.get(name) ?? new Map<string, number>();
    values.set(value, (values.get(value) ?? 0) + 1);
    configured.set(name, values);
  }

  for (const [name, value] of url.searchParams) {
    const values = configured.get(name);
    if (!values) {
      if (!OAUTH_CALLBACK_RESPONSE_PARAMETERS.has(name)) return false;
      continue;
    }
    const count = values.get(value) ?? 0;
    if (count === 0) return false;
    if (count === 1) values.delete(value);
    else values.set(value, count - 1);
  }

  for (const values of configured.values()) {
    if (values.size > 0) return false;
  }
  return true;
}

function isAuthorizationTransaction(value: BoundaryValue): value is OAuthAuthorizationTransaction {
  return isBoundaryObject(value) &&
    isBoundaryString(value.state) &&
    OAUTH_STATE_PATTERN.test(value.state) &&
    (value.codeVerifier === undefined ||
      (isBoundaryString(value.codeVerifier) && isValidPkceCodeVerifier(value.codeVerifier)));
}

function validateStoredTokens(tokens: BoundaryValue): OAuthTokens | undefined {
  if (tokens === undefined) {
    return undefined;
  }
  if (!isBoundaryObject(tokens)) {
    throw new SdkError("stored OAuth tokens must be an object");
  }
  const record = tokens;
  const accessToken = validateOAuthToken(record.accessToken, "stored OAuth accessToken");
  const refreshToken = validateOAuthToken(record.refreshToken, "stored OAuth refreshToken");
  if (record.tokenType !== "bearer") {
    throw new SdkError("stored OAuth tokenType must be bearer");
  }
  if (!isBoundaryString(record.scope)) {
    throw new SdkError("stored OAuth scope must be a string");
  }
  const expiresAt = record.expiresAt;
  if (!isBoundaryNumber(expiresAt) || !Number.isSafeInteger(expiresAt) || expiresAt < 0) {
    throw new SdkError("stored OAuth expiresAt must be a non-negative safe integer");
  }
  return {
    accessToken,
    refreshToken,
    tokenType: "bearer",
    scope: record.scope,
    expiresAt,
  };
}

export class OAuthAuth implements AuthStrategy {
  /** Runtime marker for server OAuth. BrowserOAuthAuth narrows this value. */
  readonly authCapability!: "server" | "browser";
  readonly #client: OAuthClient;
  readonly #tokenStore?: OAuthTokenStore;
  readonly #authorizationTransactionStore?: OAuthAuthorizationTransactionStore;
  readonly #endpoints: Required<OAuthEndpoints>;
  readonly #fetchImpl: FetchLike;
  readonly #now: () => number;
  readonly #randomBytes: (size: number) => Uint8Array;
  readonly #refreshSkewMs: number;
  readonly #timeoutMs: number;
  readonly #maxResponseSizeBytes: number;
  readonly #logger: Logger;
  readonly #onDiagnostic?: DiagnosticListener;
  readonly #runExclusive: <T>(operation: () => Promise<T>) => Promise<T>;
  readonly #legacyConsumeAuthorizationState?: (state: string) => Promise<boolean>;
  readonly #pendingAuthorizationStates = new Map<string, number>();

  constructor(options: OAuthAuthOptions) {
    Object.defineProperty(this, "authCapability", {
      value: "server",
      enumerable: false,
      configurable: true,
      writable: false,
    });
    if (!isBoundaryObject(options)) {
      throw new SdkError("options are required");
    }
    if (!options.client || !["public", "confidential"].includes(options.client.type)) {
      throw new SdkError("client must be public or confidential");
    }
    requiredString(options.client.clientId, "clientId");
    requiredString(options.client.redirectUri, "redirectUri");
    validateRedirectUri(options.client.redirectUri);
    if (options.client.type === "confidential") {
      requiredString(options.client.clientSecret, "clientSecret");
    }
    const tokenStore = options.tokenStore;
    const tokenStoreRecord: BoundaryRecord = isBoundaryObject(tokenStore) ? tokenStore : {};
    const { load, save, clear, consumeAuthorizationState, runExclusive } = tokenStoreRecord;
    if (tokenStore !== undefined && (!isBoundaryFunction(load) || !isBoundaryFunction(save) ||
      !isBoundaryFunction(clear) || !isBoundaryFunction(runExclusive))) {
      throw new SdkError("tokenStore must implement load, save, clear, and runExclusive");
    }
    const transactionStore = options.authorizationTransactionStore;
    const transactionStoreRecord: BoundaryRecord = isBoundaryObject(transactionStore) ? transactionStore : {};
    const { save: saveTransaction, consume: consumeTransaction } = transactionStoreRecord;
    if (transactionStore !== undefined &&
      (!isBoundaryFunction(saveTransaction) || !isBoundaryFunction(consumeTransaction))) {
      throw new SdkError("authorizationTransactionStore must implement save and consume");
    }
    const skew = options.refreshSkewMs ?? DEFAULT_REFRESH_SKEW_MS;
    if (!Number.isFinite(skew) || skew < 0) {
      throw new SdkError("refreshSkewMs must be a finite non-negative number");
    }
    if (options.fetchImpl !== undefined && !isBoundaryFunction(options.fetchImpl)) {
      throw new SdkError("fetchImpl must be a function");
    }
    if (options.now !== undefined && !isBoundaryFunction(options.now)) {
      throw new SdkError("now must be a function");
    }
    if (options.randomBytes !== undefined && !isBoundaryFunction(options.randomBytes)) {
      throw new SdkError("randomBytes must be a function");
    }
    this.#client = { ...options.client };
    this.#tokenStore = tokenStore;
    this.#authorizationTransactionStore = transactionStore;
    this.#runExclusive = tokenStore === undefined
      ? async <T>(operation: () => Promise<T>) => operation()
      : tokenStore.runExclusive.bind(tokenStore);
    this.#legacyConsumeAuthorizationState = isBoundaryFunction(consumeAuthorizationState)
      ? (consumeAuthorizationState as (state: string) => Promise<boolean>).bind(tokenStore)
      : undefined;
    if (options.env !== "sandbox" && options.env !== "production") {
      throw new SdkError("env is required; choose \"sandbox\" or \"production\"");
    }
    if ((options.endpoints?.authorization !== undefined || options.endpoints?.token !== undefined) &&
      options.endpoints?.revocation === undefined) {
      throw new SdkError("endpoints.revocation is required when overriding endpoints.authorization or endpoints.token");
    }
    const defaults = DEFAULT_OAUTH_ENDPOINTS[options.env];
    this.#endpoints = {
      api: validateHttpsEndpoint(options.endpoints?.api ?? defaults.api, "endpoints.api"),
      authorization: validateHttpsEndpoint(options.endpoints?.authorization ?? defaults.authorization, "endpoints.authorization"),
      token: validateHttpsEndpoint(options.endpoints?.token ?? defaults.token, "endpoints.token"),
      revocation: validateHttpsEndpoint(options.endpoints?.revocation ?? defaults.revocation, "endpoints.revocation"),
    };
    // SAFETY: The platform fetch response is adapted to the SDK's deliberately smaller FetchLike contract.
    this.#fetchImpl = options.fetchImpl ??
      ((url, init) => fetch(url, init) as ReturnType<FetchLike>);
    this.#now = options.now ?? Date.now;
    this.#randomBytes = options.randomBytes ?? ((size: number) => crypto.getRandomValues(new Uint8Array(size)));
    this.#refreshSkewMs = skew;
    this.#timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.#logger = options.logger ?? NOOP_LOGGER;
    this.#onDiagnostic = options.onDiagnostic;
    if (!Number.isFinite(this.#timeoutMs) || this.#timeoutMs <= 0) {
      throw new SdkError("timeoutMs must be a finite positive number");
    }
    this.#maxResponseSizeBytes = options.maxResponseSizeBytes ?? DEFAULT_MAX_OAUTH_RESPONSE_SIZE_BYTES;
    if (!Number.isSafeInteger(this.#maxResponseSizeBytes) || this.#maxResponseSizeBytes <= 0) {
      throw new SdkError("maxResponseSizeBytes must be a positive safe integer");
    }
  }

  #emit(
    level: "debug" | "info" | "warn" | "error",
    name: string,
    response: ResponseMetadata,
    cause?: unknown,
  ): void {
    const event: DiagnosticEvent = {
      level,
      component: "oauth",
      name,
      correlationId: response.correlationId,
      response,
    };
    if (cause) event.error = serializeError(cause);
    emitDiagnostic(event, this.#logger, this.#onDiagnostic);
  }

  async beginAuthorization(scopes: string[]): Promise<OAuthAuthorizationRequest> {
    if (!Array.isArray(scopes) || scopes.length === 0 ||
      scopes.some((scope) => !isBoundaryString(scope) || scope.length === 0)) {
      throw new SdkError("scopes must contain at least one non-empty scope");
    }
    const state = createAuthorizationState(this.#randomBytes);
    const params = new URLSearchParams({
      client_id: this.#client.clientId,
      response_type: "code",
      redirect_uri: this.#client.redirectUri,
      state,
      scope: scopes.join(","),
    });
    const transaction: OAuthAuthorizationTransaction = { state };

    if (this.#client.type === "public") {
      const codeVerifier = generatePkceCodeVerifier(this.#randomBytes as RandomBytes);
      const challenge = await createPkceCodeChallenge(codeVerifier);
      transaction.codeVerifier = codeVerifier;
      params.set("code_challenge", challenge);
      params.set("code_challenge_method", "S256");
    }

    await this.#authorizationTransactionStore?.save(transaction);
    this.#trackLocalAuthorizationState(transaction.state);

    const authorizationUrl = new URL(this.#endpoints.authorization);
    for (const [name, value] of params) authorizationUrl.searchParams.set(name, value);
    return { url: authorizationUrl.toString(), transaction };
  }

  async completeAuthorization(
    callback: string | URL,
    transaction?: OAuthAuthorizationTransaction,
    options: RequestOptions = {},
  ): Promise<OAuthTokens> {
    const url = parseCallback(callback);
    const redirect = new URL(this.#client.redirectUri);
    if (!callbackMatchesRedirect(url, redirect)) {
      throw new OAuthStateError("OAuth callback does not match the configured redirect URI");
    }
    const returnedState = url.searchParams.get("state");
    if (!returnedState) {
      throw new OAuthStateError("OAuth callback is missing state");
    }
    let resolvedTransaction = transaction;
    let stateAlreadyConsumed = false;
    if (this.#authorizationTransactionStore !== undefined) {
      const storedTransaction = await this.#authorizationTransactionStore.consume(returnedState);
      stateAlreadyConsumed = true;
      if (storedTransaction === undefined) {
        throw new OAuthStateError("OAuth authorization transaction has already been used");
      }
      if (!isAuthorizationTransaction(storedTransaction)) {
        throw new OAuthStateError("OAuth authorization transaction is invalid");
      }
      if (resolvedTransaction !== undefined &&
        (!isAuthorizationTransaction(resolvedTransaction) ||
          resolvedTransaction.state !== storedTransaction.state ||
          resolvedTransaction.codeVerifier !== storedTransaction.codeVerifier)) {
        throw new OAuthStateError("OAuth authorization transaction does not match the stored transaction");
      }
      resolvedTransaction = storedTransaction;
    }
    if (!isAuthorizationTransaction(resolvedTransaction)) {
      throw new OAuthStateError("OAuth authorization transaction is invalid");
    }
    if (returnedState !== resolvedTransaction.state) {
      throw new OAuthStateError("OAuth callback state does not match the authorization request");
    }

    return this.#runExclusive(async () => {
      if (!stateAlreadyConsumed && !await this.#claimAuthorizationState(resolvedTransaction!.state)) {
        throw new OAuthStateError("OAuth authorization transaction has already been used");
      }
      const callbackError = url.searchParams.get("error");
      const code = url.searchParams.get("code");
      if (callbackError && code) {
        throw new OAuthAuthorizationError("invalid_response", "OAuth callback contains both code and error");
      }
      if (callbackError) {
        throw new OAuthAuthorizationError(
          callbackError,
          url.searchParams.get("error_description") ?? undefined,
        );
      }
      if (!code) {
        throw new OAuthAuthorizationError("invalid_response", "OAuth callback is missing code");
      }

      const body: OAuthTokenRequest = {
        client_id: this.#client.clientId,
        code,
        redirect_uri: this.#client.redirectUri,
        grant_type: "authorization_code",
      };
      if (this.#client.type === "public") {
        if (!resolvedTransaction!.codeVerifier) {
          throw new SdkError("public OAuth transaction is missing a valid PKCE verifier");
        }
        body.code_verifier = resolvedTransaction!.codeVerifier;
      } else {
        body.client_secret = this.#client.clientSecret;
      }

      // Claim before the token exchange so concurrent auth instances cannot
      // submit the same authorization code twice. A failed exchange requires
      // starting a fresh authorization flow.
      const tokens = await this.#tokenRequest(body, options);
      await this.#tokenStore?.save(tokens);
      return tokens;
    });
  }

  async #claimAuthorizationState(state: string): Promise<boolean> {
    if (this.#authorizationTransactionStore !== undefined) {
      return (await this.#authorizationTransactionStore.consume(state)) !== undefined;
    }
    if (this.#legacyConsumeAuthorizationState !== undefined) {
      return this.#legacyConsumeAuthorizationState(state);
    }
    const expiresAt = this.#pendingAuthorizationStates.get(state);
    this.#pendingAuthorizationStates.delete(state);
    return expiresAt !== undefined && expiresAt > this.#now();
  }

  #trackLocalAuthorizationState(state: string): void {
    if (this.#authorizationTransactionStore !== undefined ||
      this.#legacyConsumeAuthorizationState !== undefined) return;
    const now = this.#now();
    if (!Number.isFinite(now)) return;
    for (const [pendingState, expiresAt] of this.#pendingAuthorizationStates) {
      if (expiresAt <= now) this.#pendingAuthorizationStates.delete(pendingState);
    }
    this.#pendingAuthorizationStates.set(state, now + LOCAL_AUTHORIZATION_STATE_TTL_MS);
    while (this.#pendingAuthorizationStates.size > MAX_LOCAL_AUTHORIZATION_STATES) {
      const oldest = this.#pendingAuthorizationStates.keys().next().value;
      if (oldest === undefined) break;
      this.#pendingAuthorizationStates.delete(oldest);
    }
  }

  nextNonce(): undefined {
    return undefined;
  }

  async credentialHeaders(_payloadBase64: string, options: RequestOptions = {}): Promise<Record<string, string>> {
    const accessToken = (await this.#validTokens(options)).accessToken;
    return { Authorization: `Bearer ${accessToken}` };
  }

  async revoke(options: RequestOptions = {}): Promise<void> {
    const tokenStore = this.#requireTokenStore();
    await this.#runExclusive(async () => {
      const current = validateStoredTokens(await tokenStore.load());
      if (!current) return;
      const tokens = current.accessToken === current.refreshToken
        ? [current.refreshToken]
        : [current.refreshToken, current.accessToken];
      let firstError: unknown;
      let failed = false;
      for (const token of tokens) {
        try {
          await this.#revokeRequest(token, options);
        } catch (error) {
          failed = true;
          firstError ??= error;
        }
      }
      if (failed) throw firstError;
      await this.#clearStoredTokens(current.refreshToken);
    });
  }

  async #revokeRequest(token: string, options: RequestOptions): Promise<void> {
    const execution = deadline(options, this.#timeoutMs);
    const correlationId = crypto.randomUUID();
    const metadata = (status?: number, response?: { headers?: { get(name: string): string | null } }): ResponseMetadata =>
      createResponseMetadata({ endpoint: sanitizeDiagnosticUrl(this.#endpoints.revocation), method: "POST", correlationId, status, retryCount: 0, headers: response?.headers });
    const requestBody: Record<string, string> = {
      client_id: this.#client.clientId,
      token,
    };
    if (this.#client.type === "confidential") requestBody.client_secret = this.#client.clientSecret;
    this.#emit("debug", "revoke.request.start", metadata());
    let response: Awaited<ReturnType<FetchLike>> | undefined;
    let text = "";
    let successful = false;
    try {
      response = await withSignal(this.#fetchImpl(this.#endpoints.revocation, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
        signal: execution.signal,
        redirect: "manual",
      }), execution.signal);
      if (isRedirectResponse(response)) {
        const error = new ApiError({
          status: response.status,
          reason: "redirect_not_followed",
          message: "OAuth token revocation failed",
        });
        cancelResponseBody(response, error);
        throw error;
      }
      if (response.status >= 200 && response.status < 300) {
        successful = true;
        cancelResponseBody(response, "OAuth token revocation succeeded");
      } else {
        text = await readBoundedResponseText(response, this.#maxResponseSizeBytes, execution.signal);
      }
    } catch (cause) {
      const error = cause instanceof SdkError
        ? cause
        : new SdkError("OAuth token revocation failed", { cause, metadata: metadata(response?.status, response) });
      this.#emit("error", "revoke.request.failure", metadata(response?.status, response), error);
      throw error;
    } finally {
      execution.cleanup();
    }
    if (response === undefined) {
      throw new SdkError("OAuth token revocation failed");
    }
    if (successful) {
      this.#emit("info", "revoke", metadata(response.status, response));
      return;
    }
    let body: BoundaryValue;
    try {
      body = JSON.parse(text);
    } catch {
      body = undefined;
    }
    const classification = classifyServerError(body, response.status);
    const error = new ApiError({
      status: response.status,
      reason: classification.reason,
      body,
      message: "OAuth token revocation failed",
    });
    this.#emit("error", "revoke.request.failure", metadata(response.status, response), error);
    throw error;
  }

  async #validTokens(options: RequestOptions = {}): Promise<OAuthTokens> {
    const tokenStore = this.#requireTokenStore();
    const tokens = validateStoredTokens(await tokenStore.load());
    if (!tokens) {
      throw new SdkError("OAuth tokens are unavailable; complete authorization first");
    }
    if (this.#isValid(tokens)) {
      return tokens;
    }

    return this.#runExclusive(async () => {
      const current = validateStoredTokens(await tokenStore.load());
      if (!current) {
        throw new SdkError("OAuth tokens are unavailable; complete authorization first");
      }
      return this.#isValid(current) ? current : this.#refresh(current, options);
    });
  }

  #isValid(tokens: OAuthTokens): boolean {
    return tokens.expiresAt > this.#now() + this.#refreshSkewMs;
  }

  async #refresh(current: OAuthTokens, options: RequestOptions = {}): Promise<OAuthTokens> {
    const tokenStore = this.#requireTokenStore();
    const body: OAuthTokenRequest = {
      client_id: this.#client.clientId,
      refresh_token: current.refreshToken,
      grant_type: "refresh_token",
    };
    if (this.#client.type === "confidential") {
      body.client_secret = this.#client.clientSecret;
    }

    try {
      const tokens = await this.#tokenRequest(body, options);
      await tokenStore.save(tokens);
      return tokens;
    } catch (error) {
      if (error instanceof OAuthTokenError && error.error === "invalid_grant") {
        await this.#clearStoredTokens(current.refreshToken);
      }
      throw error;
    }
  }

  async #clearStoredTokens(refreshToken: string): Promise<void> {
    const tokenStore = this.#requireTokenStore();
    const clearIfCurrent = tokenStore.clearIfCurrent;
    if (isBoundaryFunction(clearIfCurrent)) {
      await clearIfCurrent.call(tokenStore, refreshToken);
      return;
    }
    await tokenStore.clear();
  }

  #requireTokenStore(): OAuthTokenStore {
    if (this.#tokenStore === undefined) {
      throw new SdkError("OAuth tokenStore is required for authenticated client requests");
    }
    return this.#tokenStore;
  }

  async #tokenRequest(body: Record<string, string>, options: RequestOptions = {}): Promise<OAuthTokens> {
    const execution = deadline(options, this.#timeoutMs);
    const correlationId = crypto.randomUUID();
    const metadata = (status?: number, response?: { headers?: { get(name: string): string | null } }): ResponseMetadata =>
      createResponseMetadata({ endpoint: sanitizeDiagnosticUrl(this.#endpoints.token), method: "POST", correlationId, status, retryCount: 0, headers: response?.headers });
    const eventName = body.grant_type === "refresh_token" ? "token.refresh" : "token.exchange";
    this.#emit("debug", "token.request.start", metadata());
    let response: Awaited<ReturnType<FetchLike>>;
    let text: string;
    try {
      response = await withSignal(this.#fetchImpl(this.#endpoints.token, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(body),
        signal: execution.signal,
        redirect: "manual",
      }), execution.signal);
      if (isRedirectResponse(response)) {
        const error = new OAuthTokenError({
          status: response.status,
          error: "token_endpoint_redirect",
          metadata: metadata(response.status, response),
        });
        cancelResponseBody(response, error);
        throw error;
      }
      text = await readBoundedResponseText(response, this.#maxResponseSizeBytes, execution.signal);
    } catch (cause) {
      const error = cause instanceof SdkError
        ? cause
        : new SdkError("OAuth token request failed", { cause, metadata: metadata() });
      this.#emit("error", "token.request.failure", metadata(), error);
      throw error;
    } finally {
      execution.cleanup();
    }

    let parsed: BoundaryValue;
    try {
      parsed = JSON.parse(text);
    } catch (cause) {
      const error = new SdkError("OAuth token endpoint returned unparseable JSON", { cause, metadata: metadata(response.status, response) });
      this.#emit("error", "token.response.failure", metadata(response.status, response), error);
      throw error;
    }
    if (!isBoundaryObject(parsed)) {
      const error = new SdkError("OAuth token endpoint returned an invalid response object", { metadata: metadata(response.status, response) });
      this.#emit("error", "token.response.failure", metadata(response.status, response), error);
      throw error;
    }
    if (isBoundaryString(parsed.error) || response.status < 200 || response.status >= 300) {
      const error = new OAuthTokenError({
        status: response.status,
        error: isBoundaryString(parsed.error) ? parsed.error : "token_endpoint_error",
        errorDescription: isBoundaryString(parsed.error_description)
          ? parsed.error_description
          : undefined,
        body: parsed,
        metadata: metadata(response.status, response),
      });
      this.#emit("error", "token.request.failure", metadata(response.status, response), error);
      throw error;
    }

    let tokens: OAuthTokens;
    try {
      const accessToken = validateOAuthToken(parsed.access_token, "access_token");
      const refreshToken = validateOAuthToken(parsed.refresh_token, "refresh_token");
      const tokenType = requiredString(parsed.token_type, "token_type").toLowerCase();
      if (tokenType !== "bearer") {
        throw new SdkError(`unsupported OAuth token_type ${tokenType}`);
      }
      if (!isBoundaryNumber(parsed.expires_in) || !Number.isInteger(parsed.expires_in) ||
        parsed.expires_in <= 0) {
        throw new SdkError("expires_in must be a positive integer");
      }
      const expiresAt = this.#now() + parsed.expires_in * 1000;
      if (!Number.isSafeInteger(expiresAt)) {
        throw new SdkError("OAuth expiration is out of range");
      }

      tokens = {
        accessToken,
        refreshToken,
        tokenType: "bearer",
        scope: isBoundaryString(parsed.scope) ? parsed.scope : "",
        expiresAt,
      };
    } catch (cause) {
      const error = cause instanceof SdkError
        ? cause
        : new SdkError("OAuth token response validation failed", { cause, metadata: metadata(response.status, response) });
      this.#emit("error", "token.response.failure", metadata(response.status, response), error);
      throw error;
    }
    this.#emit("info", eventName, metadata(response.status, response));
    return tokens;
  }
}
