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
import { createResponseMetadata, type DiagnosticEvent, type DiagnosticListener, type ResponseMetadata } from "../observability/diagnostics.js";
import { emitDiagnostic, type Logger, NOOP_LOGGER } from "../observability/logging.js";
import type { Environment } from "../types/client.js";
import { toBase64, toBase64Url } from "../utils/encoding.js";
import {
  isBoundaryFunction,
  isBoundaryNumber,
  isBoundaryObject,
  isBoundaryString,
  type BoundaryRecord,
  type BoundaryValue,
} from "../utils/boundary-value.js";

const REVOKE_PATH = "/v1/oauth/revokeByToken";
const DEFAULT_REFRESH_SKEW_MS = 60_000;
const DEFAULT_MAX_OAUTH_RESPONSE_SIZE_BYTES = 1 * 1024 * 1024;
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
}

export const DEFAULT_OAUTH_ENDPOINTS = {
  production: {
    api: "https://api.gemini.com",
    authorization: "https://exchange.gemini.com/auth",
    token: "https://exchange.gemini.com/auth/token",
  },
  sandbox: {
    api: "https://api.sandbox.gemini.com",
    authorization: "https://exchange.sandbox.gemini.com/auth",
    token: "https://exchange.sandbox.gemini.com/auth/token",
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
 * Store OAuth tokens.
 * `runExclusive` must serialize operations for all OAuthAuth instances that use the store.
 */
export interface OAuthTokenStore<T = OAuthTokens> {
  load(): Promise<T | undefined>;
  save(tokens: T): Promise<void>;
  clear(): Promise<void>;
  /**
   * Atomically claim an authorization state. Return `true` only for the first
   * claim and retain the claim for the transaction's short lifetime.
   * Implement this durably when authorization transactions can cross process
   * or page boundaries.
   */
  consumeAuthorizationState(state: string): Promise<boolean>;
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

export interface OAuthAuthOptions {
  client: OAuthClient;
  tokenStore: OAuthTokenStore;
  /** OAuth environment. Required to prevent accidental live authorization. */
  env: Environment;
  /** OAuth endpoint overrides for tests, mocks, or proxies. */
  endpoints?: Partial<OAuthEndpoints>;
  fetchImpl?: FetchLike;
  now?: () => number;
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

function callbackMatchesRedirect(url: URL, redirect: URL): boolean {
  if (
    url.protocol !== redirect.protocol ||
    url.username !== redirect.username ||
    url.password !== redirect.password ||
    url.host !== redirect.host ||
    url.pathname !== redirect.pathname ||
    url.hash !== redirect.hash
  ) return false;

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
    (value.codeVerifier === undefined || isBoundaryString(value.codeVerifier));
}

function validateStoredTokens(tokens: BoundaryValue): OAuthTokens | undefined {
  if (tokens === undefined) {
    return undefined;
  }
  if (!isBoundaryObject(tokens)) {
    throw new SdkError("stored OAuth tokens must be an object");
  }
  const record = tokens;
  const accessToken = requiredString(record.accessToken, "stored OAuth accessToken");
  const refreshToken = requiredString(record.refreshToken, "stored OAuth refreshToken");
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
  readonly #tokenStore: OAuthTokenStore;
  readonly #endpoints: OAuthEndpoints;
  readonly #fetchImpl: FetchLike;
  readonly #now: () => number;
  readonly #randomBytes: (size: number) => Uint8Array;
  readonly #refreshSkewMs: number;
  readonly #timeoutMs: number;
  readonly #maxResponseSizeBytes: number;
  readonly #logger: Logger;
  readonly #onDiagnostic?: DiagnosticListener;
  readonly #runExclusive: <T>(operation: () => Promise<T>) => Promise<T>;
  readonly #consumeAuthorizationState: (state: string) => Promise<boolean>;

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
    try {
      new URL(options.client.redirectUri);
    } catch {
      throw new SdkError("redirectUri must be a valid URL");
    }
    if (options.client.type === "confidential") {
      requiredString(options.client.clientSecret, "clientSecret");
    }
    const tokenStore = options.tokenStore;
    const tokenStoreRecord: BoundaryRecord = isBoundaryObject(tokenStore) ? tokenStore : {};
    const { load, save, clear, consumeAuthorizationState, runExclusive } = tokenStoreRecord;
    if (!isBoundaryFunction(load) || !isBoundaryFunction(save) ||
      !isBoundaryFunction(clear) || !isBoundaryFunction(consumeAuthorizationState) ||
      !isBoundaryFunction(runExclusive)) {
      throw new SdkError("tokenStore must implement load, save, clear, consumeAuthorizationState, and runExclusive");
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
    this.#tokenStore = options.tokenStore;
    this.#runExclusive = tokenStore.runExclusive.bind(tokenStore);
    this.#consumeAuthorizationState = tokenStore.consumeAuthorizationState.bind(tokenStore);
    if (!options.env) throw new SdkError("env is required; choose \"sandbox\" or \"production\"");
    const defaults = DEFAULT_OAUTH_ENDPOINTS[options.env];
    this.#endpoints = {
      api: options.endpoints?.api ?? defaults.api,
      authorization: options.endpoints?.authorization ?? defaults.authorization,
      token: options.endpoints?.token ?? defaults.token,
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
    const state = toBase64Url(this.#randomBytes(32));
    const params = new URLSearchParams({
      client_id: this.#client.clientId,
      response_type: "code",
      redirect_uri: this.#client.redirectUri,
      state,
      scope: scopes.join(","),
    });
    const transaction: OAuthAuthorizationTransaction = { state };

    if (this.#client.type === "public") {
      const codeVerifier = toBase64Url(this.#randomBytes(64));
      if (!/^[A-Za-z0-9._~-]{43,128}$/.test(codeVerifier)) {
        throw new SdkError("generated PKCE verifier must be 43-128 unreserved characters");
      }
      const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(codeVerifier));
      const challenge = toBase64Url(new Uint8Array(hash));
      transaction.codeVerifier = codeVerifier;
      params.set("code_challenge", challenge);
      params.set("code_challenge_method", "S256");
    }

    return { url: `${this.#endpoints.authorization}?${params}`, transaction };
  }

  async completeAuthorization(
    callback: string | URL,
    transaction: OAuthAuthorizationTransaction | undefined,
    options: RequestOptions = {},
  ): Promise<OAuthTokens> {
    const url = callback instanceof URL ? callback : new URL(callback);
    if (!isAuthorizationTransaction(transaction)) {
      throw new OAuthStateError("OAuth authorization transaction is invalid");
    }
    const redirect = new URL(this.#client.redirectUri);
    if (!callbackMatchesRedirect(url, redirect)) {
      throw new OAuthStateError("OAuth callback does not match the configured redirect URI");
    }
    const returnedState = url.searchParams.get("state");
    if (!returnedState) {
      throw new OAuthStateError("OAuth callback is missing state");
    }
    if (!transaction?.state || returnedState !== transaction.state) {
      throw new OAuthStateError("OAuth callback state does not match the authorization request");
    }
    const callbackError = url.searchParams.get("error");
    if (callbackError) {
      throw new OAuthAuthorizationError(
        callbackError,
        url.searchParams.get("error_description") ?? undefined,
      );
    }
    const code = url.searchParams.get("code");
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
      if (!transaction.codeVerifier ||
        !/^[A-Za-z0-9._~-]{43,128}$/.test(transaction.codeVerifier)) {
        throw new SdkError("public OAuth transaction is missing a valid PKCE verifier");
      }
      body.code_verifier = transaction.codeVerifier;
    } else {
      body.client_secret = this.#client.clientSecret;
    }

    return this.#runExclusive(async () => {
      if (!await this.#consumeAuthorizationState(transaction.state)) {
        throw new OAuthStateError("OAuth authorization transaction has already been used");
      }
      // Claim before the token exchange so concurrent auth instances cannot
      // submit the same authorization code twice. A failed exchange requires
      // starting a fresh authorization flow.
      const tokens = await this.#tokenRequest(body, options);
      await this.#tokenStore.save(tokens);
      return tokens;
    });
  }

  nextNonce(): undefined {
    return undefined;
  }

  async credentialHeaders(_payloadBase64: string, options: RequestOptions = {}): Promise<Record<string, string>> {
    const accessToken = (await this.#validTokens(options)).accessToken;
    return { Authorization: `Bearer ${accessToken}` };
  }

  async revoke(options: RequestOptions = {}): Promise<void> {
    await this.#runExclusive(async () => {
      const current = validateStoredTokens(await this.#tokenStore.load());
      if (!current) return;
      try {
        await this.#revokeRequest(current.accessToken, options);
      } finally {
        await this.#clearStoredTokens(current.refreshToken);
      }
    });
  }

  async #revokeRequest(accessToken: string, options: RequestOptions): Promise<void> {
    const execution = deadline(options, this.#timeoutMs);
    const payload = toBase64(JSON.stringify({ request: REVOKE_PATH }));
    let response: Awaited<ReturnType<FetchLike>>;
    let text: string;
    try {
      response = await withSignal(this.#fetchImpl(`${this.#endpoints.api}${REVOKE_PATH}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/json",
          "Content-Length": "0",
          "Content-Type": "text/plain",
          "Cache-Control": "no-cache",
          "X-GEMINI-PAYLOAD": payload,
        },
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
      text = await readBoundedResponseText(response, this.#maxResponseSizeBytes, execution.signal);
    } catch (cause) {
      throw cause instanceof SdkError ? cause : new SdkError("OAuth token revocation failed", { cause });
    } finally {
      execution.cleanup();
    }
    if (response.status >= 200 && response.status < 300) return;
    let body: BoundaryValue;
    try {
      body = JSON.parse(text);
    } catch {
      body = undefined;
    }
    const classification = classifyServerError(body, response.status);
    throw new ApiError({
      status: response.status,
      reason: classification.reason,
      body,
      message: "OAuth token revocation failed",
    });
  }

  async #validTokens(options: RequestOptions = {}): Promise<OAuthTokens> {
    const tokens = validateStoredTokens(await this.#tokenStore.load());
    if (!tokens) {
      throw new SdkError("OAuth tokens are unavailable; complete authorization first");
    }
    if (this.#isValid(tokens)) {
      return tokens;
    }

    return this.#runExclusive(async () => {
      const current = validateStoredTokens(await this.#tokenStore.load());
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
      await this.#tokenStore.save(tokens);
      return tokens;
    } catch (error) {
      if (error instanceof OAuthTokenError && error.error === "invalid_grant") {
        await this.#clearStoredTokens(current.refreshToken);
      }
      throw error;
    }
  }

  async #clearStoredTokens(refreshToken: string): Promise<void> {
    const clearIfCurrent = this.#tokenStore.clearIfCurrent;
    if (isBoundaryFunction(clearIfCurrent)) {
      await clearIfCurrent.call(this.#tokenStore, refreshToken);
      return;
    }
    await this.#tokenStore.clear();
  }

  async #tokenRequest(body: Record<string, string>, options: RequestOptions = {}): Promise<OAuthTokens> {
    const execution = deadline(options, this.#timeoutMs);
    const correlationId = crypto.randomUUID();
    const metadata = (status?: number, response?: { headers?: { get(name: string): string | null } }): ResponseMetadata =>
      createResponseMetadata({ endpoint: this.#endpoints.token, method: "POST", correlationId, status, retryCount: 0, headers: response?.headers });
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
      const accessToken = requiredString(parsed.access_token, "access_token");
      const refreshToken = requiredString(parsed.refresh_token, "refresh_token");
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
