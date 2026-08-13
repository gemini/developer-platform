import assert from "node:assert/strict";
import { test } from "node:test";

import {
  HttpTransport,
  OAuthAuth,
  OAuthAuthorizationError,
  OAuthStateError,
  OAuthTokenError,
  RequestAbortedError,
  SdkError,
  serializeError,
  type FetchLike,
  type OAuthTokenStore,
  type OAuthTokens,
} from "../server/index.js";
import type { DiagnosticEvent } from "../diagnostics.js";
import { fromBase64, fromBase64Url } from "../core/encoding.js";

class MemoryTokenStore implements OAuthTokenStore {
  record?: OAuthTokens;
  #tail: Promise<void> = Promise.resolve();

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

  async clear() {
    this.record = undefined;
  }

  async runExclusive<T>(operation: () => Promise<T>): Promise<T> {
    const previous = this.#tail;
    let release: () => void = () => undefined;
    this.#tail = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    try {
      return await operation();
    } finally {
      release();
    }
  }
}

class NonReentrantTokenStore extends MemoryTokenStore {
  #locked = false;

  override async runExclusive<T>(operation: () => Promise<T>): Promise<T> {
    if (this.#locked) {
      throw new Error("token store lock was re-entered");
    }
    this.#locked = true;
    try {
      return await operation();
    } finally {
      this.#locked = false;
    }
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

const publicOptions = (store: OAuthTokenStore, extra: Record<string, unknown> = {}) => ({
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

function jsonResponse(status: number, body: unknown) {
  return { status, text: async () => JSON.stringify(body) };
}

void test("public authorization request generates state and S256 PKCE", async () => {
  const auth = new OAuthAuth(publicOptions(new MemoryTokenStore()));
  const { url, transaction } = await auth.beginAuthorization(["orders:create", "orders:read"]);
  const parsed = new URL(url);

  assert.equal(parsed.origin + parsed.pathname, "https://exchange.gemini.com/auth");
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

void test("OAuth diagnostics expose safe lifecycle metadata without token values", async () => {
  const events: DiagnosticEvent[] = [];
  const auth = new OAuthAuth(publicOptions(new MemoryTokenStore(), {
    onDiagnostic: (event: DiagnosticEvent) => events.push(event),
    fetchImpl: async () => ({
      status: 200,
      headers: { get: (name: string) => name.toLowerCase() === "x-gemini-request-id" ? "exchange-1" : "application/json" },
      text: async () => JSON.stringify({ access_token: "access-secret", refresh_token: "refresh-secret", token_type: "bearer", expires_in: 3600 }),
    }),
  }));
  const request = await auth.beginAuthorization(["orders:create"]);
  const callback = new URL("https://exchange.gemini.com/callback");
  callback.searchParams.set("code", "auth-code");
  callback.searchParams.set("state", request.transaction.state);
  await auth.completeAuthorization(callback, request.transaction);
  assert.ok(events.some((event) => event.name === "token.exchange" && event.level === "info"));
  assert.equal(JSON.stringify(events).includes("access-secret"), false);
  assert.equal(JSON.stringify(events).includes("refresh-secret"), false);
  assert.equal(JSON.stringify(events).includes("auth-code"), false);
  assert.equal(events.find((event) => event.name === "token.exchange")?.response?.exchangeRequestId, "exchange-1");
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
    (error: unknown) => error instanceof OAuthStateError,
  );
  await assert.rejects(
    auth.completeAuthorization(
      "http://127.0.0.1:51234/callback?code=abc&state=wrong",
      transaction,
    ),
    (error: unknown) => error instanceof OAuthStateError,
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
    (error: unknown) =>
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

  assert.equal(request?.[0], "https://exchange.gemini.com/auth/token");
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
  let body: Record<string, unknown> = {};
  const auth = new OAuthAuth({
    client: {
      type: "confidential",
      clientId: "server-client",
      clientSecret: "server-secret",
      redirectUri: "https://client.example/callback",
    },
    tokenStore: store,
    now: () => 1_700_000_000_000,
    randomBytes: (size) => new Uint8Array(size).fill(8),
    fetchImpl: async (_url, init) => {
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
    (error: unknown) => {
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

void test("OAuthAuth supplies Bearer auth through HttpTransport without HMAC or nonce", async () => {
  let captured: Parameters<FetchLike>[1] | undefined;
  const auth = new OAuthAuth(publicOptions(new MemoryTokenStore(validTokens())));
  const client = new HttpTransport({
    env: "sandbox",
    auth,
    fetchImpl: async (_url, init) => {
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
  assert.deepEqual(headers, Array(3).fill({ Authorization: "Bearer access-2" }));
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
    (error: unknown) => error instanceof OAuthTokenError && error.error === "invalid_grant",
  );
  assert.equal(store.record, undefined);
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
  let body: Record<string, unknown> = {};
  const auth = new OAuthAuth({
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

void test("revocation uses the matching OAuth transport and clears tokens only after success", async () => {
  const store = new MemoryTokenStore(validTokens());
  const auth = new OAuthAuth(publicOptions(store));
  let request: Parameters<FetchLike> | undefined;
  const transport = new HttpTransport({
    env: "sandbox",
    auth,
    fetchImpl: async (...args) => {
      request = args;
      return jsonResponse(200, { result: "ok" });
    },
  });

  await auth.revoke(transport);

  assert.equal(request?.[0], "https://api.sandbox.gemini.com/v1/oauth/revokeByToken");
  assert.equal(request?.[1].headers.Authorization, "Bearer access-1");
  assert.equal(store.record, undefined);
});

void test("failed revocation leaves local tokens available", async () => {
  const store = new MemoryTokenStore(validTokens());
  const auth = new OAuthAuth(publicOptions(store));
  const transport = new HttpTransport({
    env: "sandbox",
    auth,
    fetchImpl: async () => {
      throw new SdkError("revoke failed");
    },
  });

  await assert.rejects(auth.revoke(transport), /revoke failed/);
  assert.notEqual(store.record, undefined);
});

void test("revocation uses a freshly rotated token even when its lifetime is within the skew", async () => {
  const store = new MemoryTokenStore(validTokens({ expiresAt: 1_700_000_000_000 }));
  let refreshCalls = 0;
  let revokeCalls = 0;
  const auth = new OAuthAuth(publicOptions(store, {
    fetchImpl: async () => {
      refreshCalls++;
      if (refreshCalls > 1) {
        throw new Error("revocation refreshed more than once");
      }
      return jsonResponse(200, {
        access_token: "short-access",
        refresh_token: "short-refresh",
        token_type: "bearer",
        scope: "orders:read",
        expires_in: 30,
      });
    },
  }));
  const transport = new HttpTransport({
    env: "sandbox",
    auth,
    fetchImpl: async (_url, init) => {
      revokeCalls++;
      assert.equal(init.headers.Authorization, "Bearer short-access");
      return jsonResponse(200, {});
    },
  });

  await auth.revoke(transport);

  assert.equal(refreshCalls, 1);
  assert.equal(revokeCalls, 1);
  assert.equal(store.record, undefined);
});

void test("revocation does not re-enter the token-store lock when the clock crosses expiry", async () => {
  const store = new NonReentrantTokenStore(validTokens({ expiresAt: 1_700_000_000_001 }));
  const times = [1_700_000_000_000, 1_700_000_000_000, 1_700_000_000_002];
  const auth = new OAuthAuth(publicOptions(store, {
    now: () => times.shift() ?? 1_700_000_000_002,
    refreshSkewMs: 0,
  }));
  const transport = new HttpTransport({
    env: "sandbox",
    auth,
    fetchImpl: async (_url, init) => {
      assert.equal(init.headers.Authorization, "Bearer access-1");
      return jsonResponse(200, {});
    },
  });

  await auth.revoke(transport);

  assert.equal(store.record, undefined);
});

void test("revocation cannot clear tokens saved by concurrent authorization", async () => {
  const store = new MemoryTokenStore(validTokens());
  let releaseRevoke: () => void = () => undefined;
  let announceRevoke: () => void = () => undefined;
  const revokeStarted = new Promise<void>((resolve) => {
    announceRevoke = resolve;
  });
  const auth = new OAuthAuth(publicOptions(store, {
    fetchImpl: async () => jsonResponse(200, {
      access_token: "replacement-access",
      refresh_token: "replacement-refresh",
      token_type: "bearer",
      scope: "orders:read",
      expires_in: 3600,
    }),
  }));
  const transport = new HttpTransport({
    env: "sandbox",
    auth,
    fetchImpl: async () => {
      announceRevoke();
      await new Promise<void>((resolve) => {
        releaseRevoke = resolve;
      });
      return jsonResponse(200, {});
    },
  });
  const { transaction } = await auth.beginAuthorization(["orders:read"]);
  const callback = new URL("http://127.0.0.1:51234/callback");
  callback.searchParams.set("code", "replacement-code");
  callback.searchParams.set("state", transaction.state);

  const revocation = auth.revoke(transport);
  await revokeStarted;
  const replacement = auth.completeAuthorization(callback, transaction);
  releaseRevoke();
  await Promise.all([revocation, replacement]);

  assert.equal(store.record?.accessToken, "replacement-access");
});

void test("revocation rejects a transport bound to another OAuthAuth", async () => {
  const firstStore = new MemoryTokenStore(validTokens());
  const secondStore = new MemoryTokenStore(validTokens({ accessToken: "other-access" }));
  const first = new OAuthAuth(publicOptions(firstStore));
  const second = new OAuthAuth(publicOptions(secondStore));
  let fetchCalls = 0;
  const secondTransport = new HttpTransport({
    env: "sandbox",
    auth: second,
    fetchImpl: async () => {
      fetchCalls++;
      return jsonResponse(200, {});
    },
  });

  await assert.rejects(first.revoke(secondTransport), /same OAuthAuth/i);
  assert.equal(fetchCalls, 0);
  assert.notEqual(firstStore.record, undefined);
  assert.notEqual(secondStore.record, undefined);
});

void test("malformed persisted tokens fail as SdkError before any network request", async () => {
  for (const malformed of [null, 7, [], validTokens({ accessToken: "" })]) {
    const store = new MemoryTokenStore();
    store.record = malformed as OAuthTokens;
    let fetchCalls = 0;
    const auth = new OAuthAuth(publicOptions(store, {
      fetchImpl: async () => {
        fetchCalls++;
        return jsonResponse(200, {});
      },
    }));

    await assert.rejects(
      auth.credentialHeaders("ignored"),
      (error: unknown) => error instanceof SdkError,
    );
    assert.equal(fetchCalls, 0);
  }
});

void test("missing persisted tokens require authorization before credentials or revocation", async () => {
  const store = new MemoryTokenStore();
  const auth = new OAuthAuth(publicOptions(store));
  const transport = new HttpTransport({ env: "sandbox", auth });

  await assert.rejects(
    auth.credentialHeaders("ignored"),
    /OAuth tokens are unavailable; complete authorization first/,
  );
  await assert.rejects(
    auth.revoke(transport),
    /OAuth tokens are unavailable; complete authorization first/,
  );
});
