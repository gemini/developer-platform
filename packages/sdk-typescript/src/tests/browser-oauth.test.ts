import assert from "node:assert/strict";
import { test } from "node:test";

import {
  BrowserOAuthAuth,
  type BrowserOAuthAuthOptions,
  type BrowserOAuthClient,
  type OAuthTokenStore,
  type OAuthTokens,
} from "../browser/index.js";

// --- Helpers (mirrors oauth-auth.test.ts patterns) ---

class MemoryTokenStore implements OAuthTokenStore {
  record?: OAuthTokens;
  #tail: Promise<void> = Promise.resolve();

  constructor(tokens?: OAuthTokens) {
    if (tokens) this.record = tokens;
  }
  async load() { return this.record; }
  async save(tokens: OAuthTokens) { this.record = tokens; }
  async clear() { this.record = undefined; }
  async runExclusive<T>(operation: () => Promise<T>): Promise<T> {
    const previous = this.#tail;
    let release: () => void = () => undefined;
    this.#tail = new Promise<void>((resolve) => { release = resolve; });
    await previous;
    try { return await operation(); }
    finally { release(); }
  }
}

const validTokens = (overrides: Partial<OAuthTokens> = {}): OAuthTokens => ({
  accessToken: "browser-access-1",
  refreshToken: "browser-refresh-1",
  tokenType: "bearer",
  scope: "orders:create",
  expiresAt: 1_800_000_000_000,
  ...overrides,
});

function jsonResponse(status: number, body: unknown) {
  return { status, text: async () => JSON.stringify(body) };
}

const publicClient: BrowserOAuthClient = {
  type: "public",
  clientId: "browser-test-client",
  redirectUri: "http://127.0.0.1:51234/callback",
};

function browserOptions(
  store: OAuthTokenStore,
  extra: Record<string, unknown> = {},
): BrowserOAuthAuthOptions {
  return {
    client: publicClient,
    tokenStore: store,
    now: () => 1_700_000_000_000,
    randomBytes: (size: number) => new Uint8Array(size).fill(7),
    ...extra,
  };
}

// --- Tests ---

// BrowserOAuthAuth restricts to public clients at the TYPE level.
// Runtime enforcement is not added — the type system is the guard.
// The negative type test in verify-package.mjs verifies this statically.
// See also: item 7 decision — "doesn't exist" is sufficient for JS bypass.

test("BrowserOAuthAuth constructs with a public client", () => {
  const store = new MemoryTokenStore();
  const auth = new BrowserOAuthAuth(browserOptions(store));
  assert(auth instanceof BrowserOAuthAuth);
});

test("BrowserOAuthAuth generates PKCE S256 authorization URL", async () => {
  const store = new MemoryTokenStore();
  const auth = new BrowserOAuthAuth(browserOptions(store));
  const { url, transaction } = await auth.beginAuthorization(["orders:create", "orders:read"]);
  const parsed = new URL(url);

  assert.equal(parsed.searchParams.get("response_type"), "code");
  assert.equal(parsed.searchParams.get("scope"), "orders:create,orders:read");
  assert.equal(parsed.searchParams.get("code_challenge_method"), "S256");
  assert(parsed.searchParams.has("code_challenge"), "missing code_challenge");
  assert(transaction.codeVerifier, "missing PKCE verifier");
  assert(transaction.state, "missing state");
});

test("BrowserOAuthAuth exchanges code with PKCE verifier (no client secret)", async () => {
  const store = new MemoryTokenStore();
  let capturedBody: Record<string, string> | undefined;
  const auth = new BrowserOAuthAuth(browserOptions(store, {
    fetchImpl: async (_url: string, init: { body?: string }) => {
      capturedBody = JSON.parse(init.body ?? "{}");
      return jsonResponse(200, {
        access_token: "browser-access-2",
        refresh_token: "browser-refresh-2",
        token_type: "bearer",
        scope: "orders:create,orders:read",
        expires_in: 3600,
      });
    },
  }));

  const { transaction } = await auth.beginAuthorization(["orders:create", "orders:read"]);
  const callback = new URL(publicClient.redirectUri);
  callback.searchParams.set("code", "auth-code-123");
  callback.searchParams.set("state", transaction.state);
  const tokens = await auth.completeAuthorization(callback, transaction);

  assert(capturedBody, "fetch was not called");
  assert.equal(capturedBody.grant_type, "authorization_code");
  assert.equal(capturedBody.code, "auth-code-123");
  assert.equal(capturedBody.code_verifier, transaction.codeVerifier);
  assert.equal("client_secret" in capturedBody, false, "must not send client_secret");
  assert.equal(tokens.accessToken, "browser-access-2");
  assert.equal(tokens.scope, "orders:create,orders:read");
});

test("BrowserOAuthAuth supplies Bearer header for REST requests", async () => {
  const store = new MemoryTokenStore(validTokens());
  const auth = new BrowserOAuthAuth(browserOptions(store));
  const headers = await auth.credentialHeaders("");

  assert.equal(headers.Authorization, "Bearer browser-access-1");
  assert.equal(headers["X-GEMINI-APIKEY"], undefined, "must not include HMAC key");
  assert.equal(headers["X-GEMINI-SIGNATURE"], undefined, "must not include HMAC signature");
});

test("BrowserOAuthAuth nextNonce returns undefined (no HMAC nonce)", () => {
  const store = new MemoryTokenStore(validTokens());
  const auth = new BrowserOAuthAuth(browserOptions(store));
  assert.equal(auth.nextNonce(), undefined);
});

test("BrowserOAuthAuth refreshes expired token transparently", async () => {
  const store = new MemoryTokenStore(validTokens({ expiresAt: 1_700_000_000_000 }));
  let refreshed = false;
  const auth = new BrowserOAuthAuth(browserOptions(store, {
    fetchImpl: async (_url: string, init: { body?: string }) => {
      const body = JSON.parse(init.body ?? "{}");
      assert.equal(body.grant_type, "refresh_token");
      assert.equal(body.refresh_token, "browser-refresh-1");
      assert.equal("client_secret" in body, false);
      refreshed = true;
      return jsonResponse(200, {
        access_token: "browser-access-refreshed",
        refresh_token: "browser-refresh-refreshed",
        token_type: "bearer",
        scope: "orders:create",
        expires_in: 3600,
      });
    },
  }));

  const headers = await auth.credentialHeaders("");
  assert(refreshed, "refresh was not triggered");
  assert.equal(headers.Authorization, "Bearer browser-access-refreshed");
  assert.equal(store.record?.refreshToken, "browser-refresh-refreshed");
});

test("OAuth scope is correctly encoded in authorization URL", async () => {
  const store = new MemoryTokenStore();
  const auth = new BrowserOAuthAuth(browserOptions(store));

  // Single scope
  const single = await auth.beginAuthorization(["auditor"]);
  assert.equal(new URL(single.url).searchParams.get("scope"), "auditor");

  // Multiple scopes
  const multi = await auth.beginAuthorization(["orders:create", "orders:read", "auditor"]);
  assert.equal(new URL(multi.url).searchParams.get("scope"), "orders:create,orders:read,auditor");
});

test("OAuth scope from token exchange is stored in the token record", async () => {
  const store = new MemoryTokenStore();
  const auth = new BrowserOAuthAuth(browserOptions(store, {
    fetchImpl: async () => jsonResponse(200, {
      access_token: "a",
      refresh_token: "r",
      token_type: "bearer",
      scope: "orders:create,auditor",
      expires_in: 3600,
    }),
  }));

  const { transaction } = await auth.beginAuthorization(["orders:create", "auditor"]);
  const callback = new URL(publicClient.redirectUri);
  callback.searchParams.set("code", "c");
  callback.searchParams.set("state", transaction.state);
  const tokens = await auth.completeAuthorization(callback, transaction);

  assert.equal(tokens.scope, "orders:create,auditor");
  assert.equal(store.record?.scope, "orders:create,auditor");
});
