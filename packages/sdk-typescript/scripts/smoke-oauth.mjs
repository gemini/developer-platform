import assert from "node:assert/strict";
import { createServer } from "node:http";

class MemoryStore {
  record;
  authorizationStates = new Set();
  load() { return Promise.resolve(this.record); }
  save(tokens) { this.record = tokens; return Promise.resolve(); }
  clear() { this.record = undefined; return Promise.resolve(); }
  consumeAuthorizationState(state) {
    if (this.authorizationStates.has(state)) return Promise.resolve(false);
    this.authorizationStates.add(state);
    return Promise.resolve(true);
  }
  runExclusive(operation) { return operation(); }
}

async function callbackAt(redirectUri) {
  const target = new URL(redirectUri);
  let resolveCallback;
  const callback = new Promise((resolve) => { resolveCallback = resolve; });
  const server = createServer((request, response) => {
    const url = new URL(request.url, redirectUri);
    response.end("Authorization received. Return to the terminal.");
    resolveCallback(url);
  });
  await new Promise((resolve, reject) => server.listen(Number(target.port), target.hostname, resolve).once("error", reject));
  return { server, callback: Promise.race([callback, new Promise((_, reject) => setTimeout(() => reject(new Error("OAuth callback timeout")), 120_000))]) };
}

const { createClient, OAuthAuth } = await import("../dist/server/index.js");
const clientId = process.env.GEMINI_OAUTH_CLIENT_ID;
const redirectUri = process.env.GEMINI_OAUTH_REDIRECT_URI;
if (!clientId || !redirectUri) throw new Error("GEMINI_OAUTH_CLIENT_ID and GEMINI_OAUTH_REDIRECT_URI are required");
const environment = process.env.GEMINI_OAUTH_ENV ?? "sandbox";
if (environment !== "production" && environment !== "sandbox") throw new Error("GEMINI_OAUTH_ENV must be production or sandbox");
const client = process.env.GEMINI_OAUTH_CLIENT_SECRET
  ? { type: "confidential", clientId, clientSecret: process.env.GEMINI_OAUTH_CLIENT_SECRET, redirectUri }
  : { type: "public", clientId, redirectUri };
const store = new MemoryStore();
const auth = new OAuthAuth({ client, env: environment, tokenStore: store });
const listener = await callbackAt(redirectUri);
let facade;
try {
  const authorization = await auth.beginAuthorization((process.env.GEMINI_OAUTH_SCOPES ?? "orders").split(","));
  console.log("Open this authorization URL:", authorization.url);
  await auth.completeAuthorization(await listener.callback, authorization.transaction);
  facade = await createClient({ env: environment, auth, skipWsInit: true });
  await facade.predictions.listEvents({ status: ["active"], limit: 1 });
  await facade.predictions.getPredictionMarketsTermsStatus();
  await facade.predictions.getPositions({ limit: 1 });
  await facade.predictions.getLiquidityRewardsLifetimeSummary();

  let inspected = false;
  const inspectingClient = await createClient({ env: environment, auth, skipWsInit: true, fetch: async (url, init) => {
    assert(init.headers.Authorization?.startsWith("Bearer "));
    assert.equal(init.headers["X-GEMINI-APIKEY"], undefined);
    assert.equal(init.headers["X-GEMINI-SIGNATURE"], undefined);
    const payload = JSON.parse(Buffer.from(init.headers["X-GEMINI-PAYLOAD"], "base64").toString("utf8"));
    assert.equal("nonce" in payload, false);
    inspected = true;
    return fetch(url, init);
  } });
  await inspectingClient.predictions.getPositions({ limit: 1 });
  assert(inspected);
  inspectingClient.close();

  const previousRefresh = store.record.refreshToken;
  const refreshAuth = new OAuthAuth({ client, env: environment, tokenStore: store, refreshSkewMs: Number.MAX_SAFE_INTEGER });
  const refreshClient = await createClient({ env: environment, auth: refreshAuth, skipWsInit: true });
  await refreshClient.predictions.getPositions({ limit: 1 });
  assert.notEqual(store.record.refreshToken, previousRefresh, "refresh token did not rotate");
  await refreshAuth.revoke();
  assert.equal(await store.load(), undefined);
  await assert.rejects(refreshClient.predictions.getPositions({ limit: 1 }), /complete authorization first/i);
  refreshClient.close();
  console.log(`${environment} OAuth smoke passed: authorization, Bearer request, rotation, revocation`);
} finally {
  facade?.close();
  await new Promise((resolve) => listener.server.close(resolve));
}
