
import type { AuthStrategy, FetchLike, HttpTransport } from "../core/http.js";
import { DEFAULT_TIMEOUT_MS, deadline, type RequestOptions, withSignal } from "../core/deadline.js";
import {
  OAuthAuthorizationError,
  OAuthStateError,
  OAuthTokenError,
  SdkError,
  serializeError,
} from "../errors.js";
import { createResponseMetadata, type DiagnosticListener, type ResponseMetadata } from "../diagnostics.js";
import { emitDiagnostic, type Logger, NOOP_LOGGER } from "../logging.js";
import { ENVIRONMENT_URLS, type Environment } from "../core/environment.js";
import { toBase64Url } from "../core/encoding.js";
const REVOKE_PATH = "/v1/oauth/revokeByToken";
const DEFAULT_REFRESH_SKEW_MS = 60_000;

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
 * Caller-owned token persistence. runExclusive must serialize operations across
 * every OAuthAuth instance and process backed by this store; single-use refresh
 * token rotation depends on that shared exclusion.
 */
export interface OAuthTokenStore {
  load(): Promise<OAuthTokens | undefined>;
  save(tokens: OAuthTokens): Promise<void>;
  clear(): Promise<void>;
  runExclusive<T>(operation: () => Promise<T>): Promise<T>;
}

export interface OAuthAuthorizationTransaction {
  state: string;
  /** Present only for public clients; keep it private until the callback. */
  codeVerifier?: string;
}

export interface OAuthAuthorizationRequest {
  url: string;
  transaction: OAuthAuthorizationTransaction;
}

export interface OAuthAuthOptions {
  client: OAuthClient;
  tokenStore: OAuthTokenStore;
  /** OAuth environment. Defaults to production. */
  env?: Environment;
  fetchImpl?: FetchLike;
  now?: () => number;
  randomBytes?: (size: number) => Uint8Array;
  /** Refresh this many milliseconds before expiry. Defaults to 60 seconds. */
  refreshSkewMs?: number;
  /** End-to-end timeout for token exchange and refresh. Defaults to 30 seconds. */
  timeoutMs?: number;
  /** Receives safe OAuth lifecycle diagnostics. Defaults to silent. */
  logger?: Logger;
  onDiagnostic?: DiagnosticListener;
}

type TokenEndpointResponse = {
  access_token?: unknown;
  refresh_token?: unknown;
  token_type?: unknown;
  scope?: unknown;
  expires_in?: unknown;
  error?: unknown;
  error_description?: unknown;
};

function requiredString(value: unknown, name: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new SdkError(`${name} is required`);
  }
  return value;
}

function validateStoredTokens(tokens: unknown): OAuthTokens | undefined {
  if (tokens === undefined) {
    return undefined;
  }
  if (tokens === null || typeof tokens !== "object" || Array.isArray(tokens)) {
    throw new SdkError("stored OAuth tokens must be an object");
  }
  const record = tokens as Record<string, unknown>;
  const accessToken = requiredString(record.accessToken, "stored OAuth accessToken");
  const refreshToken = requiredString(record.refreshToken, "stored OAuth refreshToken");
  if (record.tokenType !== "bearer") {
    throw new SdkError("stored OAuth tokenType must be bearer");
  }
  if (typeof record.scope !== "string") {
    throw new SdkError("stored OAuth scope must be a string");
  }
  const expiresAt = record.expiresAt;
  if (typeof expiresAt !== "number" || !Number.isSafeInteger(expiresAt) || expiresAt < 0) {
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
  readonly #client: OAuthClient;
  readonly #tokenStore: OAuthTokenStore;
  readonly #fetchImpl: FetchLike;
  readonly #now: () => number;
  readonly #randomBytes: (size: number) => Uint8Array;
  readonly #refreshSkewMs: number;
  readonly #timeoutMs: number;
  readonly #logger: Logger;
  readonly #onDiagnostic?: DiagnosticListener;
  readonly #authorizationUrl: string;
  readonly #tokenUrl: string;
  #revocationAccessToken?: string;

  constructor(options: OAuthAuthOptions) {
    if (!options || typeof options !== "object") {
      throw new SdkError("options are required");
    }
    if (!options.client || !["public", "confidential"].includes(options.client.type)) {
      throw new SdkError("client must be public or confidential");
    }
    requiredString(options.client.clientId, "clientId");
    requiredString(options.client.redirectUri, "redirectUri");
    if (options.client.type === "confidential") {
      requiredString(options.client.clientSecret, "clientSecret");
    }
    if (!options.tokenStore || typeof options.tokenStore.load !== "function" ||
      typeof options.tokenStore.save !== "function" ||
      typeof options.tokenStore.clear !== "function" ||
      typeof options.tokenStore.runExclusive !== "function") {
      throw new SdkError("tokenStore must implement load, save, clear, and runExclusive");
    }
    const skew = options.refreshSkewMs ?? DEFAULT_REFRESH_SKEW_MS;
    if (!Number.isFinite(skew) || skew < 0) {
      throw new SdkError("refreshSkewMs must be a finite non-negative number");
    }
    this.#client = { ...options.client };
    this.#tokenStore = options.tokenStore;
    const environment = ENVIRONMENT_URLS[options.env ?? "production"];
    this.#authorizationUrl = environment.oauthAuthorization;
    this.#tokenUrl = environment.oauthToken;
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
  }

  #emit(
    level: "debug" | "info" | "warn" | "error",
    name: string,
    response: ResponseMetadata,
    error?: unknown,
  ): void {
    emitDiagnostic({
      level,
      component: "oauth",
      name,
      response,
      ...(error ? { error: serializeError(error) } : {}),
    }, this.#logger, this.#onDiagnostic);
  }

  async beginAuthorization(scopes: string[]): Promise<OAuthAuthorizationRequest> {
    if (!Array.isArray(scopes) || scopes.length === 0 ||
      scopes.some((scope) => typeof scope !== "string" || scope.length === 0)) {
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

    return { url: `${this.#authorizationUrl}?${params}`, transaction };
  }

  async completeAuthorization(
    callback: string | URL,
    transaction: OAuthAuthorizationTransaction,
    options: RequestOptions = {},
  ): Promise<OAuthTokens> {
    const url = callback instanceof URL ? callback : new URL(callback);
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

    const body: Record<string, string> = {
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

    return this.#tokenStore.runExclusive(async () => {
      const tokens = await this.#tokenRequest(body, options);
      await this.#tokenStore.save(tokens);
      return tokens;
    });
  }

  nextNonce(): undefined {
    return undefined;
  }

  async credentialHeaders(_payloadBase64: string, options: RequestOptions = {}): Promise<Record<string, string>> {
    const accessToken = this.#revocationAccessToken ?? (await this.#validTokens(options)).accessToken;
    return { Authorization: `Bearer ${accessToken}` };
  }

  async revoke(transport: HttpTransport, options: RequestOptions = {}): Promise<void> {
    if (!transport.isAuthenticatedWith(this)) {
      throw new SdkError("revoke transport must use the same OAuthAuth instance");
    }
    await this.#validTokens(options);
    await this.#tokenStore.runExclusive(async () => {
      const current = validateStoredTokens(await this.#tokenStore.load());
      if (!current) {
        throw new SdkError("OAuth tokens are unavailable; complete authorization first");
      }
      this.#revocationAccessToken = current.accessToken;
      try {
        await transport.request({ method: "POST", path: REVOKE_PATH, ...options });
        await this.#tokenStore.clear();
      } finally {
        this.#revocationAccessToken = undefined;
      }
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

    return this.#tokenStore.runExclusive(async () => {
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
    const body: Record<string, string> = {
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
        await this.#tokenStore.clear();
      }
      throw error;
    }
  }

  async #tokenRequest(body: Record<string, string>, options: RequestOptions = {}): Promise<OAuthTokens> {
    const execution = deadline(options, this.#timeoutMs);
    const correlationId = crypto.randomUUID();
    const metadata = (status?: number, response?: { headers?: { get(name: string): string | null } }): ResponseMetadata =>
      createResponseMetadata({ endpoint: this.#tokenUrl, method: "POST", correlationId, status, retryCount: 0, headers: response?.headers });
    const eventName = body.grant_type === "refresh_token" ? "token.refresh" : "token.exchange";
    this.#emit("debug", "token.request.start", metadata());
    let response: Awaited<ReturnType<FetchLike>>;
    let text: string;
    try {
      response = await withSignal(this.#fetchImpl(this.#tokenUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(body),
        signal: execution.signal,
      }), execution.signal);
      text = await withSignal(response.text(), execution.signal);
    } catch (cause) {
      const error = cause instanceof SdkError
        ? cause
        : new SdkError("OAuth token request failed", { cause, metadata: metadata() });
      this.#emit("error", "token.request.failure", metadata(), error);
      throw error;
    } finally {
      execution.cleanup();
    }

    let parsed: TokenEndpointResponse;
    try {
      parsed = JSON.parse(text) as TokenEndpointResponse;
    } catch (cause) {
      const error = new SdkError("OAuth token endpoint returned unparseable JSON", { cause, metadata: metadata(response.status, response) });
      this.#emit("error", "token.response.failure", metadata(response.status, response), error);
      throw error;
    }
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
      const error = new SdkError("OAuth token endpoint returned an invalid response object", { metadata: metadata(response.status, response) });
      this.#emit("error", "token.response.failure", metadata(response.status, response), error);
      throw error;
    }
    if (typeof parsed.error === "string" || response.status < 200 || response.status >= 300) {
      const error = new OAuthTokenError({
        status: response.status,
        error: typeof parsed.error === "string" ? parsed.error : "token_endpoint_error",
        errorDescription: typeof parsed.error_description === "string"
          ? parsed.error_description
          : undefined,
        body: parsed,
        metadata: metadata(response.status, response),
      });
      this.#emit("error", "token.request.failure", metadata(response.status, response), error);
      throw error;
    }

    const accessToken = requiredString(parsed.access_token, "access_token");
    const refreshToken = requiredString(parsed.refresh_token, "refresh_token");
    const tokenType = requiredString(parsed.token_type, "token_type").toLowerCase();
    if (tokenType !== "bearer") {
      throw new SdkError(`unsupported OAuth token_type ${tokenType}`);
    }
    if (typeof parsed.expires_in !== "number" || !Number.isInteger(parsed.expires_in) ||
      parsed.expires_in <= 0) {
      throw new SdkError("expires_in must be a positive integer");
    }
    const expiresAt = this.#now() + parsed.expires_in * 1000;
    if (!Number.isSafeInteger(expiresAt)) {
      throw new SdkError("OAuth expiration is out of range");
    }

    const tokens: OAuthTokens = {
      accessToken,
      refreshToken,
      tokenType: "bearer",
      scope: typeof parsed.scope === "string" ? parsed.scope : "",
      expiresAt,
    };
    this.#emit("info", eventName, metadata(response.status, response));
    return tokens;
  }
}
