import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  OAuthAuth,
  OAuthAuthorizationError,
  OAuthStateError,
  OAuthTokenError,
  RequestAbortedError,
  SdkError,
  serializeError,
  type FetchLike,
  type OAuthAuthorizationTransactionStore,
  type OAuthTokenStore,
  type OAuthTokens,
} from "../server/index.js";
import { HttpTransport } from "../transport/http.js";
import type { DiagnosticEvent } from "../observability/diagnostics.js";
import type { BoundaryRecord, BoundaryValue } from "../utils/boundary-value.js";
import { fromBase64, fromBase64Url } from "../utils/encoding.js";
import { streamingTextResponse } from "../tests/support/http-fixtures.js";

class MemoryTokenStore implements OAuthTokenStore {
  record?: OAuthTokens;
  private tail: Promise<void> = Promise.resolve();

  constructor(tokens?: OAuthTokens) {
    if (tokens) {
      this.record = tokens;
    }
  }

  async load() {
    return this.record;
  }

  async save(tokens: OAuthTokens) {
    this.record = tokens;
  }

  setMalformed(value: BoundaryValue): void {
    // SAFETY: This test-only hook intentionally writes malformed persisted data past the store's static token contract.
    this.record = value as OAuthTokens;
  }

  async clear() {
    this.record = undefined;
  }
  async clearIfCurrent(refreshToken: string) {
    if (this.record?.refreshToken !== refreshToken) return false;
    this.record = undefined;
    return true;
  }

  async consumeAuthorizationState(state: string): Promise<boolean> {
    if (this.authorizationStates.has(state)) return false;
    this.authorizationStates.add(state);
    return true;
  }

  async runExclusive<T>(operation: () => Promise<T>): Promise<T> {
    const previous = this.tail;
    let release: () => void = () => undefined;
    this.tail = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    try {
      return await operation();
    } finally {
      release();
    }
  }

  private readonly authorizationStates = new Set<string>();
}

class NonReentrantTokenStore extends MemoryTokenStore {
  private locked = false;

  override async runExclusive<T>(operation: () => Promise<T>): Promise<T> {
    if (this.locked) {
      throw new Error("token store lock was re-entered");
    }
    this.locked = true;
    try {
      return await operation();
    } finally {
      this.locked = false;
    }
  }
}

class MemoryAuthorizationTransactionStore implements OAuthAuthorizationTransactionStore {
  readonly records = new Map<string, { state: string; codeVerifier?: string }>();

  async save(transaction: { state: string; codeVerifier?: string }): Promise<void> {
    this.records.set(transaction.state, { ...transaction });
  }

  async consume(state: string): Promise<{ state: string; codeVerifier?: string } | undefined> {
    const transaction = this.records.get(state);
    this.records.delete(state);
    return transaction;
  }
}

const validTokens = (overrides: Partial<OAuthTokens> = {}): OAuthTokens => ({
  accessToken: "access-1",
  refreshToken: "refresh-1",
  tokenType: "bearer",
  scope: "orders:create",
  expiresAt: 1_800_000_000_000,
  ...overrides,
});

const publicOptions = (store: OAuthTokenStore | undefined, extra: BoundaryRecord = {}) => ({
  env: "sandbox" as const,
  client: {
    type: "public" as const,
    clientId: "public-client",
    redirectUri: "http://127.0.0.1:51234/callback",
  },
  tokenStore: store,
  now: () => 1_700_000_000_000,
  randomBytes: (size: number) => new Uint8Array(size).fill(7),
  ...extra,
});

function jsonResponse(status: number, body: BoundaryValue) {
  return streamingTextResponse(JSON.stringify(body), status, {
    get: (name) => name.toLowerCase() === "content-type" ? "application/json" : null,
  });
}

function invalidScopes(value: BoundaryValue): string[] {
  // SAFETY: These fixtures intentionally bypass the public scope type to test JavaScript runtime validation.
  return value as string[];
}

void test("public authorization request generates state and S256 PKCE", async () => {
  const auth = new OAuthAuth(publicOptions(new MemoryTokenStore()));
  const { url, transaction } = await auth.beginAuthorization(["orders:create", "orders:read"]);
  const parsed = new URL(url);

  assert.equal(parsed.origin + parsed.pathname, "https://exchange.sandbox.gemini.com/auth");
  assert.equal(parsed.searchParams.get("client_id"), "public-client");
  assert.equal(parsed.searchParams.get("response_type"), "code");
  assert.equal(parsed.searchParams.get("scope"), "orders:create,orders:read");
  assert.equal(parsed.searchParams.get("state"), transaction.state);
  assert.equal(parsed.searchParams.get("code_challenge_method"), "S256");
  assert.equal(transaction.codeVerifier?.length, 86);
  assert.match(transaction.codeVerifier ?? "", /^[A-Za-z0-9._~-]{43,128}$/);
  assert.match(parsed.searchParams.get("code_challenge") ?? "", /^[A-Za-z0-9_-]{43}$/);
  assert.doesNotMatch(parsed.searchParams.get("code_challenge") ?? "", /=/);
});

void test("authorization URL and code exchange can run without token persistence", async () => {
  let saved = false;
  const auth = new OAuthAuth({
    ...publicOptions(undefined),
    tokenStore: undefined,
    fetchImpl: async () => {
      saved = true;
      return jsonResponse(200, {
        access_token: "access-2",
        refresh_token: "refresh-2",
        token_type: "bearer",
        scope: "orders:read",
        expires_in: 3600,
      });
    },
  });
  const { transaction } = await auth.beginAuthorization(["orders:read"]);
  const callback = new URL("http://127.0.0.1:51234/callback");
  callback.searchParams.set("code", "authorization-code");
  callback.searchParams.set("state", transaction.state);

  const tokens = await auth.completeAuthorization(callback, transaction);

  assert(saved);
  assert.equal(tokens.accessToken, "access-2");
  await assert.rejects(
    auth.credentialHeaders("ignored"),
    /tokenStore is required for authenticated client requests/,
  );
});

void test("protocol-only authorization rejects a transaction that was never begun", async () => {
  const auth = new OAuthAuth({
    ...publicOptions(undefined),
    tokenStore: undefined,
  });
  const callback = new URL("http://127.0.0.1:51234/callback");
  callback.searchParams.set("code", "authorization-code");
  callback.searchParams.set("state", "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA");

  await assert.rejects(
    auth.completeAuthorization(callback, {
      state: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
      codeVerifier: "A".repeat(43),
    }),
    /already been used/,
  );
});

void test("authorization transactions can be stored separately from OAuth tokens", async () => {
  const transactionStore = new MemoryAuthorizationTransactionStore();
  const tokenStore = new MemoryTokenStore();
  const auth = new OAuthAuth(publicOptions(tokenStore, {
    authorizationTransactionStore: transactionStore,
    fetchImpl: async () => jsonResponse(200, {
      access_token: "access-2",
      refresh_token: "refresh-2",
      token_type: "bearer",
      scope: "orders:read",
      expires_in: 3600,
    }),
  }));
  const request = await auth.beginAuthorization(["orders:read"]);
  assert.deepEqual(transactionStore.records.get(request.transaction.state), request.transaction);

  const callback = new URL("http://127.0.0.1:51234/callback");
  callback.searchParams.set("code", "authorization-code");
  callback.searchParams.set("state", request.transaction.state);
  const tokens = await auth.completeAuthorization(callback);

  assert.equal(tokens.accessToken, "access-2");
  assert.equal(transactionStore.records.has(request.transaction.state), false);
  assert.equal(tokenStore.record?.accessToken, "access-2");
  await assert.rejects(auth.completeAuthorization(callback), OAuthStateError);
});

void test("authorization transaction storage takes precedence over the legacy token-store state hook", async () => {
  const transactionStore = new MemoryAuthorizationTransactionStore();
  const tokenStore = new MemoryTokenStore();
  const auth = new OAuthAuth(publicOptions(tokenStore, {
    authorizationTransactionStore: transactionStore,
    fetchImpl: async () => jsonResponse(200, {
      access_token: "access-2",
      refresh_token: "refresh-2",
      token_type: "bearer",
      scope: "orders:read",
      expires_in: 3600,
    }),
  }));
  const request = await auth.beginAuthorization(["orders:read"]);
  const callback = new URL("http://127.0.0.1:51234/callback");
  callback.searchParams.set("code", "authorization-code");
  callback.searchParams.set("state", request.transaction.state);

  await auth.completeAuthorization(callback, request.transaction);
  await assert.rejects(auth.completeAuthorization(callback), OAuthStateError);
  assert.equal(transactionStore.records.has(request.transaction.state), false);
});

void test("durable authorization storage is authoritative for the PKCE verifier", async () => {
  const transactionStore = new MemoryAuthorizationTransactionStore();
  let exchanges = 0;
  const auth = new OAuthAuth(publicOptions(new MemoryTokenStore(), {
    authorizationTransactionStore: transactionStore,
    fetchImpl: async () => {
      exchanges++;
      return jsonResponse(200, {});
    },
  }));
  const request = await auth.beginAuthorization(["orders:read"]);
  const callback = new URL("http://127.0.0.1:51234/callback");
  callback.searchParams.set("code", "authorization-code");
  callback.searchParams.set("state", request.transaction.state);

  await assert.rejects(
    auth.completeAuthorization(callback, {
      state: request.transaction.state,
      codeVerifier: "A".repeat(43),
    }),
    (error: BoundaryValue) => error instanceof OAuthStateError && /does not match the stored transaction/.test(error.message),
  );
  assert.equal(exchanges, 0);
  assert.equal(transactionStore.records.has(request.transaction.state), false);
});

void test("OAuth rejects non-string scopes at runtime", async () => {
  const auth = new OAuthAuth(publicOptions(new MemoryTokenStore()));
  for (const scopes of [[123], [null]]) {
    await assert.rejects(
      auth.beginAuthorization(invalidScopes(scopes)),
      (error: BoundaryValue) => error instanceof SdkError && /scopes must contain/.test(error.message),
    );
  }
});

void test("OAuth callback must match the configured redirect endpoint and transactions are one-shot", async () => {
  const store = new MemoryTokenStore();
  const auth = new OAuthAuth(publicOptions(store, {
    fetchImpl: async () => jsonResponse(200, {
      access_token: "access-2",
      refresh_token: "refresh-2",
      token_type: "bearer",
      scope: "orders:read",
      expires_in: 3600,
    }),
  }));
  const { transaction } = await auth.beginAuthorization(["orders:read"]);
  const wrongEndpoint = new URL("http://attacker.example/callback");
  wrongEndpoint.searchParams.set("code", "authorization-code");
  wrongEndpoint.searchParams.set("state", transaction.state);
  await assert.rejects(auth.completeAuthorization(wrongEndpoint, transaction), OAuthStateError);

  const callback = new URL("http://127.0.0.1:51234/callback");
  callback.searchParams.set("code", "authorization-code");
  callback.searchParams.set("state", transaction.state);
  await auth.completeAuthorization(callback, transaction);
  await assert.rejects(auth.completeAuthorization(callback, transaction), /already been used/);
  await assert.rejects(
    auth.completeAuthorization(callback, JSON.parse(JSON.stringify(transaction))),
    /already been used/,
  );
});

void test("OAuth authorization states are single-use across auth instances", async () => {
  const store = new MemoryTokenStore();
  let exchanges = 0;
  const fetchImpl: FetchLike = async () => {
    exchanges++;
    return jsonResponse(200, {
      access_token: "access-2",
      refresh_token: "refresh-2",
      token_type: "bearer",
      scope: "orders:read",
      expires_in: 3600,
    });
  };
  const first = new OAuthAuth(publicOptions(store, { fetchImpl }));
  const second = new OAuthAuth(publicOptions(store, { fetchImpl }));
  const { transaction } = await first.beginAuthorization(["orders:read"]);
  const callback = new URL("http://127.0.0.1:51234/callback");
  callback.searchParams.set("code", "authorization-code");
  callback.searchParams.set("state", transaction.state);

  await first.completeAuthorization(callback, transaction);
  await assert.rejects(second.completeAuthorization(callback, JSON.parse(JSON.stringify(transaction))), /already been used/);
  assert.equal(exchanges, 1);
});

void test("OAuth callback matches custom-scheme components and configured query parameters", async () => {
  const auth = new OAuthAuth({
    ...publicOptions(new MemoryTokenStore()),
    client: {
      type: "public",
      clientId: "public-client",
      redirectUri: "com.gemini.wallet://oauth/callback?tenant=production#complete",
    },
  });
  const { transaction } = await auth.beginAuthorization(["orders:read"]);
  const callback = new URL(
    `com.gemini.wallet://oauth/callback?tenant=production&error=access_denied&error_description=declined&error_uri=https%3A%2F%2Fexample.test%2Fdenied&state=${transaction.state}#complete`,
  );

  await assert.rejects(
    auth.completeAuthorization(callback, transaction),
    (error: BoundaryValue) => error instanceof OAuthAuthorizationError && error.error === "access_denied",
  );
});

void test("OAuth callback rejects custom-scheme component and query mismatches", async () => {
  const auth = new OAuthAuth({
    ...publicOptions(new MemoryTokenStore()),
    client: {
      type: "public",
      clientId: "public-client",
      redirectUri: "com.gemini.wallet://oauth/callback?tenant=production#complete",
    },
  });
  const { transaction } = await auth.beginAuthorization(["orders:read"]);
  const callbacks = [
    `other.gemini.wallet://oauth/callback?tenant=production&code=code&state=${transaction.state}#complete`,
    `com.gemini.wallet://attacker/oauth/callback?tenant=production&code=code&state=${transaction.state}#complete`,
    `com.gemini.wallet://oauth/wrong?tenant=production&code=code&state=${transaction.state}#complete`,
    `com.gemini.wallet://oauth/callback?tenant=production&code=code&state=${transaction.state}#wrong`,
    `com.gemini.wallet://oauth/callback?tenant=sandbox&code=code&state=${transaction.state}#complete`,
    `com.gemini.wallet://oauth/callback?tenant=production&extra=unexpected&code=code&state=${transaction.state}#complete`,
  ];

  for (const callback of callbacks) {
    await assert.rejects(
      auth.completeAuthorization(callback, transaction),
      (error: BoundaryValue) => error instanceof OAuthStateError && /does not match/.test(error.message),
    );
  }
});

void test("OAuth callback rejects duplicate response parameters", async () => {
  let exchanges = 0;
  const auth = new OAuthAuth(publicOptions(new MemoryTokenStore(), {
    fetchImpl: async () => {
      exchanges++;
      return jsonResponse(200, {});
    },
  }));
  const { transaction } = await auth.beginAuthorization(["orders:read"]);
  const callback = new URL("http://127.0.0.1:51234/callback");
  callback.searchParams.set("code", "authorization-code");
  callback.searchParams.set("state", transaction.state);
  callback.searchParams.append("state", transaction.state);

  await assert.rejects(auth.completeAuthorization(callback, transaction), OAuthStateError);
  assert.equal(exchanges, 0);
});

void test("OAuth callback rejects a response containing both code and error", async () => {
  const auth = new OAuthAuth(publicOptions(new MemoryTokenStore()));
  const { transaction } = await auth.beginAuthorization(["orders:read"]);
  const callback = new URL("http://127.0.0.1:51234/callback");
  callback.searchParams.set("code", "authorization-code");
  callback.searchParams.set("error", "access_denied");
  callback.searchParams.set("state", transaction.state);

  await assert.rejects(
    auth.completeAuthorization(callback, transaction),
    (error: BoundaryValue) => error instanceof OAuthAuthorizationError && error.error === "invalid_response",
  );
});

void test("sandbox OAuth uses sandbox authorization, exchange, and refresh endpoints", async () => {
  const store = new MemoryTokenStore();
  let tokenUrl: string | undefined;
  const auth = new OAuthAuth({
    ...publicOptions(store),
    env: "sandbox",
    fetchImpl: async (url) => {
      tokenUrl = url;
      return jsonResponse(200, {
        access_token: "access-2",
        refresh_token: "refresh-2",
        token_type: "bearer",
        scope: "orders:read",
        expires_in: 3600,
      });
    },
  });
  const { url, transaction } = await auth.beginAuthorization(["orders:read"]);
  const callback = new URL("http://127.0.0.1:51234/callback");
  callback.searchParams.set("code", "authorization-code");
  callback.searchParams.set("state", transaction.state);

  assert.equal(new URL(url).origin, "https://exchange.sandbox.gemini.com");
  await auth.completeAuthorization(callback, transaction);
  assert.equal(tokenUrl, "https://exchange.sandbox.gemini.com/auth/token");

  const refreshAuth = new OAuthAuth({
    ...publicOptions(store),
    env: "sandbox",
    refreshSkewMs: Number.MAX_SAFE_INTEGER,
    fetchImpl: async (refreshUrl) => {
      tokenUrl = refreshUrl;
      return jsonResponse(200, {
        access_token: "access-3",
        refresh_token: "refresh-3",
        token_type: "bearer",
        scope: "orders:read",
        expires_in: 3600,
      });
    },
  });
  await refreshAuth.credentialHeaders("");
  assert.equal(tokenUrl, "https://exchange.sandbox.gemini.com/auth/token");
});

describe("OAuth diagnostic regressions", () => {
  void test("OAuth diagnostics expose safe lifecycle metadata without token values", async () => {
    const events: DiagnosticEvent[] = [];
    const auth = new OAuthAuth(publicOptions(new MemoryTokenStore(), {
      onDiagnostic: (event: DiagnosticEvent) => events.push(event),
      fetchImpl: async () => streamingTextResponse(
        JSON.stringify({ access_token: "access-secret", refresh_token: "refresh-secret", token_type: "bearer", expires_in: 3600 }),
        200,
        { get: (name: string) => name.toLowerCase() === "x-gemini-request-id" ? "exchange-1" : "application/json" },
      ),
    }));
    const request = await auth.beginAuthorization(["orders:create"]);
    const callback = new URL("http://127.0.0.1:51234/callback");
    callback.searchParams.set("code", "auth-code");
    callback.searchParams.set("state", request.transaction.state);
    await auth.completeAuthorization(callback, request.transaction);
    assert.ok(events.some((event) => event.name === "token.exchange" && event.level === "info"));
    assert.equal(JSON.stringify(events).includes("access-secret"), false);
    assert.equal(JSON.stringify(events).includes("refresh-secret"), false);
    assert.equal(JSON.stringify(events).includes("auth-code"), false);
    assert.equal(events.find((event) => event.name === "token.exchange")?.response?.exchangeRequestId, "exchange-1");
  });

  void test("OAuth diagnostics report malformed token fields from a successful response", async () => {
    const events: DiagnosticEvent[] = [];
    const auth = new OAuthAuth(publicOptions(new MemoryTokenStore(), {
      onDiagnostic: (event: DiagnosticEvent) => events.push(event),
      fetchImpl: async () => jsonResponse(200, {
        access_token: "access-2",
        token_type: "bearer",
        expires_in: 3600,
      }),
    }));
    const request = await auth.beginAuthorization(["orders:create"]);
    const callback = new URL("http://127.0.0.1:51234/callback");
    callback.searchParams.set("code", "auth-code");
    callback.searchParams.set("state", request.transaction.state);

    await assert.rejects(auth.completeAuthorization(callback, request.transaction), /refresh_token is required/);
    const failure = events.find((event) => event.name === "token.response.failure");
    assert.equal(failure?.level, "error");
    assert.equal(failure?.response?.status, 200);
  });

  void test("OAuth revocation diagnostics expose safe lifecycle metadata", async () => {
    const events: DiagnosticEvent[] = [];
    const auth = new OAuthAuth(publicOptions(new MemoryTokenStore(validTokens()), {
      onDiagnostic: (event: DiagnosticEvent) => events.push(event),
      fetchImpl: async () => jsonResponse(200, {}),
    }));

    await auth.revoke();

    assert.equal(events.filter((event) => event.name === "revoke.request.start").length, 2);
    assert.equal(events.filter((event) => event.name === "revoke" && event.level === "info").length, 2);
    assert.equal(JSON.stringify(events).includes("access-1"), false);
    assert.equal(JSON.stringify(events).includes("refresh-1"), false);
    assert.equal(events.find((event) => event.name === "revoke")?.response?.endpoint,
      "https://exchange.sandbox.gemini.com/auth/token/revoke");
  });
});

void test("PKCE S256 derivation matches the RFC 7636 example vector", async () => {
  const verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
  const auth = new OAuthAuth({
    ...publicOptions(new MemoryTokenStore()),
    randomBytes: (size) => size === 32
      ? new Uint8Array(32).fill(1)
      : fromBase64Url(verifier),
  });

  const { url, transaction } = await auth.beginAuthorization(["orders:read"]);

  assert.equal(transaction.codeVerifier, verifier);
  assert.equal(
    new URL(url).searchParams.get("code_challenge"),
    "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM",
  );
});

void test("confidential authorization request uses state without exposing its secret", async () => {
  const auth = new OAuthAuth({
    env: "sandbox",
    client: {
      type: "confidential",
      clientId: "server-client",
      clientSecret: "server-secret",
      redirectUri: "https://client.example/callback",
    },
    tokenStore: new MemoryTokenStore(),
    randomBytes: (size) => new Uint8Array(size).fill(9),
  });
  const { url, transaction } = await auth.beginAuthorization(["orders:read"]);
  const parsed = new URL(url);

  assert.equal(transaction.codeVerifier, undefined);
  assert.equal(parsed.searchParams.has("code_challenge"), false);
  assert.equal(url.includes("server-secret"), false);
  assert.deepEqual(Object.keys(auth), []);
});

void test("callback rejects missing or mismatched state before token exchange", async () => {
  let calls = 0;
  const auth = new OAuthAuth(publicOptions(new MemoryTokenStore(), {
    fetchImpl: async () => {
      calls++;
      return jsonResponse(200, {});
    },
  }));
  const { transaction } = await auth.beginAuthorization(["orders:read"]);

  await assert.rejects(
    auth.completeAuthorization("http://127.0.0.1:51234/callback?code=abc", transaction),
    (error: BoundaryValue) => error instanceof OAuthStateError,
  );
  await assert.rejects(
    auth.completeAuthorization(
      "http://127.0.0.1:51234/callback?code=abc&state=wrong",
      transaction,
    ),
    (error: BoundaryValue) => error instanceof OAuthStateError,
  );
  assert.equal(calls, 0);
});

void test("callback maps authorization errors after validating state", async () => {
  const auth = new OAuthAuth(publicOptions(new MemoryTokenStore()));
  const { transaction } = await auth.beginAuthorization(["orders:read"]);
  const callback = new URL("http://127.0.0.1:51234/callback");
  callback.searchParams.set("state", transaction.state);
  callback.searchParams.set("error", "access_denied");
  callback.searchParams.set("error_description", "User denied access");

  await assert.rejects(
    auth.completeAuthorization(callback, transaction),
    (error: BoundaryValue) =>
      error instanceof OAuthAuthorizationError && error.error === "access_denied",
  );
});

void test("public code exchange sends the verifier, stores tokens, and omits a client secret", async () => {
  const store = new MemoryTokenStore();
  let request: Parameters<FetchLike> | undefined;
  const auth = new OAuthAuth(publicOptions(store, {
    fetchImpl: async (...args: Parameters<FetchLike>) => {
      request = args;
      return jsonResponse(200, {
        access_token: "access-2",
        refresh_token: "refresh-2",
        token_type: "bearer",
        scope: "orders:read",
        expires_in: 3600,
      });
    },
  }));
  const { transaction } = await auth.beginAuthorization(["orders:read"]);
  const callback = new URL("http://127.0.0.1:51234/callback");
  callback.searchParams.set("code", "authorization-code");
  callback.searchParams.set("state", transaction.state);

  const tokens = await auth.completeAuthorization(callback, transaction);
  const body = JSON.parse(request?.[1].body ?? "{}");

  assert.equal(request?.[0], "https://exchange.sandbox.gemini.com/auth/token");
  assert.equal(request?.[1].redirect, "manual");
  assert.equal(body.code_verifier, transaction.codeVerifier);
  assert.equal("client_secret" in body, false);
  assert.equal(tokens.expiresAt, 1_700_003_600_000);
  assert.deepEqual(store.record, tokens);
});

void test("OAuth code exchange forwards caller cancellation to the token fetch", async () => {
  const store = new MemoryTokenStore();
  const controller = new AbortController();
  let received: AbortSignal | undefined;
  const auth = new OAuthAuth(publicOptions(store, {
    fetchImpl: async (_url: string, init: Parameters<FetchLike>[1]) => {
      received = init.signal;
      return new Promise<never>(() => {});
    },
  }));
  const { transaction } = await auth.beginAuthorization(["orders:read"]);
  const callback = new URL("http://127.0.0.1:51234/callback");
  callback.searchParams.set("code", "authorization-code");
  callback.searchParams.set("state", transaction.state);

  const pending = auth.completeAuthorization(callback, transaction, { signal: controller.signal });
  await Promise.resolve();
  controller.abort();

  await assert.rejects(pending, RequestAbortedError);
  assert.equal(received?.aborted, true);
});

void test("confidential code exchange sends its secret and no PKCE verifier", async () => {
  const store = new MemoryTokenStore();
  let body: BoundaryRecord = {};
  const auth = new OAuthAuth({
    env: "sandbox",
    client: {
      type: "confidential",
      clientId: "server-client",
      clientSecret: "server-secret",
      redirectUri: "https://client.example/callback",
    },
    tokenStore: store,
    now: () => 1_700_000_000_000,
    randomBytes: (size) => new Uint8Array(size).fill(8),
    fetchImpl: async (_url: string, init: Parameters<FetchLike>[1]) => {
      body = JSON.parse(init.body ?? "{}");
      return jsonResponse(200, {
        access_token: "access-2",
        refresh_token: "refresh-2",
        token_type: "bearer",
        scope: "orders:read",
        expires_in: 60,
      });
    },
  });
  const { transaction } = await auth.beginAuthorization(["orders:read"]);
  const callback = new URL("https://client.example/callback");
  callback.searchParams.set("code", "authorization-code");
  callback.searchParams.set("state", transaction.state);

  await auth.completeAuthorization(callback, transaction);

  assert.equal(body.client_secret, "server-secret");
  assert.equal("code_verifier" in body, false);
});

void test("OAuth token endpoint errors have a distinct typed envelope", async () => {
  const auth = new OAuthAuth(publicOptions(new MemoryTokenStore(), {
    fetchImpl: async () => jsonResponse(400, {
      error: "invalid_grant",
      error_description: "Code is invalid or already used",
    }),
  }));
  const { transaction } = await auth.beginAuthorization(["orders:read"]);
  const callback = new URL("http://127.0.0.1:51234/callback");
  callback.searchParams.set("code", "bad-code");
  callback.searchParams.set("state", transaction.state);

  await assert.rejects(
    auth.completeAuthorization(callback, transaction),
    (error: BoundaryValue) => {
      if (!(error instanceof OAuthTokenError)) return false;
      const safe = serializeError(error);
      const debug = serializeError(error, { includeRawBody: true });
      return error.status === 400 &&
        error.error === "invalid_grant" &&
        error.errorDescription === "Code is invalid or already used" &&
        safe.message === "OAuth token request failed" &&
        !("body" in safe) &&
        JSON.stringify(safe).includes("Code is invalid or already used") === false &&
        JSON.stringify(debug.body).includes("Code is invalid or already used");
    },
  );
});

void test("OAuth token exchange rejects every redirect status before reading the response body", async () => {
  for (const response of [
    ...[300, 301, 302, 303, 304, 305, 306, 307, 308].map((status) => ({ status, type: undefined })),
    { status: 0, type: "opaqueredirect" },
  ]) {
    let bodyCancelled = false;
    let request: Parameters<FetchLike> | undefined;
    const auth = new OAuthAuth(publicOptions(new MemoryTokenStore(), {
      fetchImpl: async (...args: Parameters<FetchLike>) => {
        request = args;
        return {
          status: response.status,
          type: response.type,
          body: {
            getReader: () => ({
              read: async () => ({ done: true }),
              cancel: async () => { bodyCancelled = true; },
            }),
          },
        };
      },
    }));
    const { transaction } = await auth.beginAuthorization(["orders:read"]);
    const callback = new URL("http://127.0.0.1:51234/callback");
    callback.searchParams.set("code", "authorization-code");
    callback.searchParams.set("state", transaction.state);

    await assert.rejects(
      auth.completeAuthorization(callback, transaction),
      (error: BoundaryValue) => error instanceof OAuthTokenError && error.status === response.status,
    );
    assert.equal(request?.[1].redirect, "manual");
    assert.equal(bodyCancelled, true);
  }
});

void test("OAuth refresh rejects opaque redirects before reading the body and preserves tokens", async () => {
  const store = new MemoryTokenStore(validTokens({ expiresAt: 1_700_000_000_000 }));
  let bodyCancelled = false;
  let request: Parameters<FetchLike> | undefined;
  const auth = new OAuthAuth(publicOptions(store, {
    fetchImpl: async (...args: Parameters<FetchLike>) => {
      request = args;
      return {
        status: 0,
        type: "opaqueredirect",
        body: {
          getReader: () => ({
            read: async () => ({ done: true }),
            cancel: async () => { bodyCancelled = true; },
          }),
        },
      };
    },
  }));

  await assert.rejects(
    auth.credentialHeaders("ignored"),
    (error: BoundaryValue) => error instanceof OAuthTokenError && error.status === 0,
  );
  assert.equal(request?.[1].redirect, "manual");
  assert.equal(bodyCancelled, true);
  assert.equal(store.record?.refreshToken, "refresh-1");
});

void test("OAuth token responses obey the configured body-size limit", async () => {
  const auth = new OAuthAuth(publicOptions(new MemoryTokenStore(), {
    maxResponseSizeBytes: 4,
    fetchImpl: async () => streamingTextResponse(
      "12345",
      200,
      { get: (name: string) => name === "content-length" ? "5" : null },
    ),
  }));
  const { transaction } = await auth.beginAuthorization(["orders:read"]);
  const callback = new URL("http://127.0.0.1:51234/callback");
  callback.searchParams.set("code", "authorization-code");
  callback.searchParams.set("state", transaction.state);

  await assert.rejects(auth.completeAuthorization(callback, transaction), /response exceeded/);
});

void test("OAuth rejects invalid response-size configuration", () => {
  for (const maxResponseSizeBytes of [Number.NaN, Number.POSITIVE_INFINITY, 0, -1, 1.5]) {
    assert.throws(
      () => new OAuthAuth(publicOptions(new MemoryTokenStore(), { maxResponseSizeBytes })),
      (error: BoundaryValue) => error instanceof SdkError && /maxResponseSizeBytes.*safe integer/i.test(error.message),
    );
  }
});

void test("OAuth rejects malformed injected callbacks at construction", () => {
  for (const [name, value] of [["fetchImpl", {}], ["now", {}], ["randomBytes", {}]] as const) {
    assert.throws(
      () => new OAuthAuth(publicOptions(new MemoryTokenStore(), { [name]: value })),
      (error: BoundaryValue) => error instanceof SdkError && error.message === `${name} must be a function`,
    );
  }
});

void test("OAuth rejects malformed redirect URIs and authorization transactions", async () => {
  assert.throws(
    () => new OAuthAuth(publicOptions(new MemoryTokenStore(), {
      client: { type: "public", clientId: "client", redirectUri: "not a URL" },
    })),
    (error: BoundaryValue) => error instanceof SdkError && /redirectUri must be a valid URL/.test(error.message),
  );

  const auth = new OAuthAuth(publicOptions(new MemoryTokenStore()));
  const callback = new URL("http://127.0.0.1:51234/callback?code=code&state=state");
  await assert.rejects(
    auth.completeAuthorization(callback, undefined),
    (error: BoundaryValue) => error instanceof OAuthStateError && /transaction is invalid/.test(error.message),
  );
});

void test("OAuth maps malformed callback URLs to OAuthStateError", async () => {
  const auth = new OAuthAuth(publicOptions(new MemoryTokenStore()));

  await assert.rejects(
    auth.completeAuthorization("not a URL"),
    (error: BoundaryValue) => error instanceof OAuthStateError && /valid URL/.test(error.message),
  );
});

void test("OAuth rejects unsafe redirect and endpoint URLs", () => {
  for (const redirectUri of [
    "javascript:alert(1)",
    "https://user:password@example.com/callback",
    "http://app.example/callback",
  ]) {
    assert.throws(
      () => new OAuthAuth(publicOptions(new MemoryTokenStore(), {
        client: { type: "public", clientId: "client", redirectUri },
      })),
      SdkError,
    );
  }
  assert.throws(
    () => new OAuthAuth(publicOptions(new MemoryTokenStore(), { env: "invalid" })),
    (error: BoundaryValue) => error instanceof SdkError && /sandbox|production/.test(error.message),
  );
  for (const name of ["api", "authorization", "token"] as const) {
    assert.throws(
      () => new OAuthAuth(publicOptions(new MemoryTokenStore(), {
        endpoints: { [name]: "http://localhost/oauth" },
      })),
      (error: BoundaryValue) => error instanceof SdkError && /HTTPS/.test(error.message),
    );
  }
});

void test("OAuthAuth supplies Bearer auth through HttpTransport without HMAC or nonce", async () => {
  let captured: Parameters<FetchLike>[1] | undefined;
  const auth = new OAuthAuth(publicOptions(new MemoryTokenStore(validTokens())));
  const client = new HttpTransport({
    env: "sandbox",
    auth,
    fetchImpl: async (_url: string, init: Parameters<FetchLike>[1]) => {
      captured = init;
      return jsonResponse(200, {});
    },
  });

  await client.request({ method: "POST", path: "/v1/x", params: { symbol: "GEMI-TEST" } });

  assert.equal(captured?.headers.Authorization, "Bearer access-1");
  assert.equal("X-GEMINI-APIKEY" in (captured?.headers ?? {}), false);
  assert.equal("X-GEMINI-SIGNATURE" in (captured?.headers ?? {}), false);
  const payload = JSON.parse(
    fromBase64(captured?.headers["X-GEMINI-PAYLOAD"] ?? ""),
  );
  assert.deepEqual(payload, { request: "/v1/x", symbol: "GEMI-TEST" });
});

void test("expired access tokens refresh once for concurrent callers and rotate atomically", async () => {
  const store = new MemoryTokenStore(validTokens({ expiresAt: 1_700_000_000_000 }));
  let refreshCalls = 0;
  const auth = new OAuthAuth(publicOptions(store, {
    fetchImpl: async (_url: string, init: Parameters<FetchLike>[1]) => {
      refreshCalls++;
      const body = JSON.parse(init.body ?? "{}");
      assert.equal(body.grant_type, "refresh_token");
      assert.equal(body.refresh_token, "refresh-1");
      assert.equal("client_secret" in body, false);
      assert.equal("code_verifier" in body, false);
      await Promise.resolve();
      return jsonResponse(200, {
        access_token: "access-2",
        refresh_token: "refresh-2",
        token_type: "bearer",
        scope: "orders:create",
        expires_in: 3600,
      });
    },
  }));

  const headers = await Promise.all([
    auth.credentialHeaders("ignored"),
    auth.credentialHeaders("ignored"),
    auth.credentialHeaders("ignored"),
  ]);

  assert.equal(refreshCalls, 1);
  assert.deepEqual(headers, Array.from({ length: 3 }, () => ({ Authorization: "Bearer access-2" })));
  assert.equal(store.record?.refreshToken, "refresh-2");
});

void test("two OAuthAuth instances consume a single-use refresh token only once", async () => {
  const store = new MemoryTokenStore(validTokens({ expiresAt: 1_700_000_000_000 }));
  let refreshCalls = 0;
  const fetchImpl: FetchLike = async () => {
    refreshCalls++;
    await Promise.resolve();
    return jsonResponse(200, {
      access_token: "shared-access",
      refresh_token: "shared-refresh",
      token_type: "bearer",
      scope: "orders:read",
      expires_in: 3600,
    });
  };
  const first = new OAuthAuth(publicOptions(store, { fetchImpl }));
  const second = new OAuthAuth(publicOptions(store, { fetchImpl }));

  const headers = await Promise.all([
    first.credentialHeaders("ignored"),
    second.credentialHeaders("ignored"),
  ]);

  assert.equal(refreshCalls, 1);
  assert.deepEqual(headers, [
    { Authorization: "Bearer shared-access" },
    { Authorization: "Bearer shared-access" },
  ]);
});

void test("invalid_grant retires the rejected refresh token", async () => {
  const store = new MemoryTokenStore(validTokens({ expiresAt: 1_700_000_000_000 }));
  const auth = new OAuthAuth(publicOptions(store, {
    fetchImpl: async () => jsonResponse(400, {
      error: "invalid_grant",
      error_description: "refresh token is invalid",
    }),
  }));

  await assert.rejects(
    auth.credentialHeaders("ignored"),
    (error: BoundaryValue) => error instanceof OAuthTokenError && error.error === "invalid_grant",
  );
  assert.equal(store.record, undefined);
});

void test("invalid_grant can retire a local store without CAS", async () => {
  let record: OAuthTokens | undefined = validTokens({ expiresAt: 1_700_000_000_000 });
  const store: OAuthTokenStore = {
    load: async () => record,
    save: async (tokens) => { record = tokens; },
    clear: async () => { record = undefined; },
    consumeAuthorizationState: async () => true,
    runExclusive: async <T>(operation: () => Promise<T>) => operation(),
  };
  const auth = new OAuthAuth(publicOptions(store, {
    fetchImpl: async () => jsonResponse(400, { error: "invalid_grant" }),
  }));

  await assert.rejects(auth.credentialHeaders("ignored"), (error: BoundaryValue) =>
    error instanceof OAuthTokenError && error.error === "invalid_grant");
  assert.equal(record, undefined);
});

void test("malformed conditional token-store deletion falls back to clear", async () => {
  const store = new MemoryTokenStore(validTokens({ expiresAt: 1_700_000_000_000 }));
  let clearCalls = 0;
  // SAFETY: This fixture intentionally corrupts the optional method to test runtime fallback behavior.
  store.clearIfCurrent = 1 as never;
  const clear = store.clear.bind(store);
  store.clear = async () => {
    clearCalls++;
    await clear();
  };
  const auth = new OAuthAuth(publicOptions(store, {
    fetchImpl: async () => jsonResponse(400, { error: "invalid_grant" }),
  }));

  await assert.rejects(auth.credentialHeaders("ignored"), OAuthTokenError);
  assert.equal(clearCalls, 1);
  assert.equal(store.record, undefined);
});

void test("invalid_grant cannot clear a token rotated by another writer", async () => {
  const store = new MemoryTokenStore(validTokens({ expiresAt: 1_700_000_000_000 }));
  let releaseRequest: () => void = () => undefined;
  const requestStarted = new Promise<void>((resolve) => {
    releaseRequest = resolve;
  });
  const auth = new OAuthAuth(publicOptions(store, {
    fetchImpl: async () => {
      releaseRequest();
      await new Promise<void>((resolve) => setImmediate(resolve));
      return jsonResponse(400, { error: "invalid_grant" });
    },
  }));

  const pending = auth.credentialHeaders("ignored");
  await requestStarted;
  store.record = validTokens({ accessToken: "replacement-access", refreshToken: "replacement-refresh" });

  await assert.rejects(pending, (error: BoundaryValue) =>
    error instanceof OAuthTokenError && error.error === "invalid_grant");
  assert.equal(store.record?.refreshToken, "replacement-refresh");
});

void test("transient refresh failure preserves the token record for retry", async () => {
  const store = new MemoryTokenStore(validTokens({ expiresAt: 1_700_000_000_000 }));
  const before = store.record;
  const auth = new OAuthAuth(publicOptions(store, {
    fetchImpl: async () => {
      throw new Error("temporary network failure");
    },
  }));

  await assert.rejects(auth.credentialHeaders("ignored"), /OAuth token request failed/);
  assert.equal(store.record, before);
});

void test("confidential refresh authenticates with its client secret", async () => {
  const store = new MemoryTokenStore(validTokens({ expiresAt: 1_700_000_000_000 }));
  let body: BoundaryRecord = {};
  const auth = new OAuthAuth({
    env: "sandbox",
    client: {
      type: "confidential",
      clientId: "server-client",
      clientSecret: "server-secret",
      redirectUri: "https://client.example/callback",
    },
    tokenStore: store,
    now: () => 1_700_000_000_000,
    fetchImpl: async (_url, init) => {
      body = JSON.parse(init.body ?? "{}");
      return jsonResponse(200, {
        access_token: "access-2",
        refresh_token: "refresh-2",
        token_type: "bearer",
        scope: "orders:read",
        expires_in: 3600,
      });
    },
  });

  await auth.credentialHeaders("ignored");

  assert.equal(body.client_secret, "server-secret");
  assert.equal("code_verifier" in body, false);
});

void test("revocation revokes the refresh and access tokens before clearing local tokens", async () => {
  const store = new MemoryTokenStore(validTokens());
  const requests: Parameters<FetchLike>[] = [];
  const auth = new OAuthAuth(publicOptions(store, {
    env: "sandbox",
    fetchImpl: async (...args: Parameters<FetchLike>) => {
      requests.push(args);
      return jsonResponse(200, { result: "ok" });
    },
  }));

  await auth.revoke();

  assert.equal(requests.length, 2);
  assert.equal(requests[0]?.[0], "https://exchange.sandbox.gemini.com/auth/token/revoke");
  assert.deepEqual(JSON.parse(requests[0]?.[1].body ?? "{}"), {
    client_id: "public-client",
    token: "refresh-1",
  });
  assert.deepEqual(JSON.parse(requests[1]?.[1].body ?? "{}"), {
    client_id: "public-client",
    token: "access-1",
  });
  for (const request of requests) {
    assert.equal(request[1].headers.Authorization, undefined);
    assert.equal(request[1].redirect, "manual");
  }
  assert.equal(store.record, undefined);
});

void test("confidential revocation authenticates with the client secret", async () => {
  const store = new MemoryTokenStore(validTokens());
  const bodies: BoundaryRecord[] = [];
  const auth = new OAuthAuth({
    env: "sandbox",
    client: {
      type: "confidential",
      clientId: "server-client",
      clientSecret: "server-secret",
      redirectUri: "https://client.example/callback",
    },
    tokenStore: store,
    fetchImpl: async (_url, init) => {
      bodies.push(JSON.parse(init.body ?? "{}"));
      return jsonResponse(200, {});
    },
  });

  await auth.revoke();

  assert.deepEqual(bodies, [
    { client_id: "server-client", client_secret: "server-secret", token: "refresh-1" },
    { client_id: "server-client", client_secret: "server-secret", token: "access-1" },
  ]);
  assert.equal(store.record, undefined);
});

void test("OAuth revocation rejects redirects before reading the response body", async () => {
  for (const response of [
    ...[300, 301, 302, 303, 304, 305, 306, 307, 308].map((status) => ({ status })),
    { status: 0, type: "opaqueredirect" },
  ]) {
    const store = new MemoryTokenStore(validTokens());
    let bodyCancelled = false;
    let request: Parameters<FetchLike> | undefined;
    const auth = new OAuthAuth(publicOptions(store, {
      fetchImpl: async (...args: Parameters<FetchLike>) => {
        request = args;
        return {
          ...response,
          body: {
            getReader: () => ({
              read: async () => ({ done: true }),
              cancel: async () => { bodyCancelled = true; },
            }),
          },
        };
      },
    }));

    await assert.rejects(auth.revoke(), (error: BoundaryValue) =>
      error instanceof SdkError && "status" in error && error.status === response.status);
    assert.equal(request?.[1].redirect, "manual");
    assert.equal(bodyCancelled, true);
  }
});

void test("failed revocation preserves the local token record for retry", async () => {
  const store = new MemoryTokenStore(validTokens());
  const auth = new OAuthAuth(publicOptions(store, {
    fetchImpl: async () => {
      throw new SdkError("revoke failed");
    },
  }));

  await assert.rejects(auth.revoke(), /revoke failed/);
  assert.deepEqual(store.record, validTokens());
});

void test("revocation uses the stored token without refreshing it", async () => {
  const store = new MemoryTokenStore(validTokens({ accessToken: "short-access", expiresAt: 1_700_000_000_000 }));
  const bodies: BoundaryRecord[] = [];
  const auth = new OAuthAuth(publicOptions(store, {
    fetchImpl: async (_url: string, init: Parameters<FetchLike>[1]) => {
      bodies.push(JSON.parse(init.body ?? "{}"));
      return jsonResponse(200, {});
    },
  }));

  await auth.revoke();

  assert.deepEqual(bodies, [
    { client_id: "public-client", token: "refresh-1" },
    { client_id: "public-client", token: "short-access" },
  ]);
  assert.equal(store.record, undefined);
});

void test("revocation does not re-enter the token-store lock when the clock crosses expiry", async () => {
  const store = new NonReentrantTokenStore(validTokens({ expiresAt: 1_700_000_000_001 }));
  const bodies: BoundaryRecord[] = [];
  const auth = new OAuthAuth(publicOptions(store, {
    fetchImpl: async (_url: string, init: Parameters<FetchLike>[1]) => {
      bodies.push(JSON.parse(init.body ?? "{}"));
      return jsonResponse(200, {});
    },
  }));

  await auth.revoke();

  assert.deepEqual(bodies, [
    { client_id: "public-client", token: "refresh-1" },
    { client_id: "public-client", token: "access-1" },
  ]);
  assert.equal(store.record, undefined);
});

void test("revocation cannot clear tokens saved by concurrent authorization", async () => {
  const store = new MemoryTokenStore(validTokens());
  let releaseRevoke: () => void = () => undefined;
  let announceRevoke: () => void = () => undefined;
  let fetchCalls = 0;
  const revokeStarted = new Promise<void>((resolve) => {
    announceRevoke = resolve;
  });
  const auth = new OAuthAuth(publicOptions(store, {
    fetchImpl: async (_url: string, init: Parameters<FetchLike>[1]) => {
      fetchCalls++;
      const body = JSON.parse(init.body ?? "{}");
      if (body.grant_type === "authorization_code") {
        return jsonResponse(200, {
          access_token: "replacement-access",
          refresh_token: "replacement-refresh",
          token_type: "bearer",
          scope: "orders:read",
          expires_in: 3600,
        });
      }
      if (fetchCalls === 1) {
        announceRevoke();
        await new Promise<void>((resolve) => {
          releaseRevoke = resolve;
        });
      }
      return jsonResponse(200, {});
    },
  }));
  const { transaction } = await auth.beginAuthorization(["orders:read"]);
  const callback = new URL("http://127.0.0.1:51234/callback");
  callback.searchParams.set("code", "replacement-code");
  callback.searchParams.set("state", transaction.state);

  const revocation = auth.revoke();
  await revokeStarted;
  const replacement = auth.completeAuthorization(callback, transaction);
  releaseRevoke();
  await Promise.all([revocation, replacement]);

  assert.equal(store.record?.accessToken, "replacement-access");
});

void test("revocation does not clear a replacement token written by another writer", async () => {
  const store = new MemoryTokenStore(validTokens());
  let fetchCalls = 0;
  let releaseRevoke: () => void = () => undefined;
  let announceRevoke: () => void = () => undefined;
  const revokeStarted = new Promise<void>((resolve) => {
    announceRevoke = resolve;
  });
  const auth = new OAuthAuth(publicOptions(store, {
    fetchImpl: async () => {
      fetchCalls++;
      if (fetchCalls === 1) {
        announceRevoke();
        await new Promise<void>((resolve) => {
          releaseRevoke = resolve;
        });
      }
      return jsonResponse(200, {});
    },
  }));

  const revocation = auth.revoke();
  await revokeStarted;
  store.record = validTokens({ accessToken: "replacement-access", refreshToken: "replacement-refresh" });
  releaseRevoke();
  await revocation;

  assert.equal(store.record?.refreshToken, "replacement-refresh");
});

void test("malformed persisted tokens fail as SdkError before any network request", async () => {
  for (const malformed of [
    null,
    7,
    [],
    validTokens({ accessToken: "" }),
    validTokens({ refreshToken: "" }),
    validTokens({ accessToken: "access-token\r\nX-Evil: injected" }),
    validTokens({ refreshToken: "refresh-token\n" }),
    { ...validTokens(), tokenType: "basic" },
    { ...validTokens(), scope: 7 },
    validTokens({ expiresAt: -1 }),
    validTokens({ expiresAt: Number.NaN }),
  ]) {
    const store = new MemoryTokenStore();
    store.setMalformed(malformed);
    let fetchCalls = 0;
    const auth = new OAuthAuth(publicOptions(store, {
      fetchImpl: async () => {
        fetchCalls++;
        return jsonResponse(200, {});
      },
    }));

    await assert.rejects(
      auth.credentialHeaders("ignored"),
      (error: BoundaryValue) => error instanceof SdkError,
    );
    assert.equal(fetchCalls, 0);
  }
});

void test("revocation falls back to clearing stores without conditional delete support", async () => {
  const store = new MemoryTokenStore(validTokens());
  const storeWithoutCas: OAuthTokenStore = {
    load: () => store.load(),
    save: (tokens) => store.save(tokens),
    clear: () => store.clear(),
    consumeAuthorizationState: (state) => store.consumeAuthorizationState(state),
    runExclusive: (operation) => store.runExclusive(operation),
  };
  const auth = new OAuthAuth(publicOptions(storeWithoutCas, {
    fetchImpl: async () => jsonResponse(200, {}),
  }));

  await auth.revoke();
  assert.equal(store.record, undefined);
});

void test("missing persisted tokens require authorization before credentials and make revocation a no-op", async () => {
  const store = new MemoryTokenStore();
  const auth = new OAuthAuth(publicOptions(store));

  await assert.rejects(
    auth.credentialHeaders("ignored"),
    /OAuth tokens are unavailable; complete authorization first/,
  );
  await auth.revoke();
});

void test("custom endpoints override default environment URLs", async () => {
  const store = new MemoryTokenStore();
  let requestedUrl: string | undefined;
  const auth = new OAuthAuth(publicOptions(store, {
    endpoints: {
      authorization: "https://custom-auth.example.com/oauth/authorize",
      token: "https://custom-auth.example.com/oauth/token",
      api: "https://custom-api.example.com",
    },
    fetchImpl: async (url: string | URL | Request) => {
      requestedUrl = String(url);
      return jsonResponse(200, {
        access_token: "custom-access",
        refresh_token: "custom-refresh",
        token_type: "Bearer",
        expires_in: 3600,
        scope: "orders:create",
      });
    },
  }));

  const { url, transaction } = await auth.beginAuthorization(["orders:create"]);
  assert.ok(url.startsWith("https://custom-auth.example.com/oauth/authorize?"));

  const tokens = await auth.completeAuthorization("http://127.0.0.1:51234/callback?code=abc&state=" + transaction.state, transaction);
  assert.equal(tokens.accessToken, "custom-access");
  assert.equal(requestedUrl, "https://custom-auth.example.com/oauth/token");
});
