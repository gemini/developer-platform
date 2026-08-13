import assert from "node:assert/strict";
import { test } from "node:test";

import { AcceptTermsRequired, GeminiMarkets, HmacAuth, type FetchLike } from "../server/index.js";

type Request = { url: string; init: { method: string; headers: Record<string, string> } };
const jsonHeaders = { get: (name: string) => name.toLowerCase() === "content-type" ? "application/json" : null };

function client(responses: string[], requests: Request[] = []) {
  return new GeminiMarkets({
    env: "sandbox",
    auth: new HmacAuth({ apiKey: "key", apiSecret: "secret", now: () => 1000 }),
    fetchImpl: (async (url, init) => {
      requests.push({ url, init });
      return { status: url.endsWith("/order") ? 201 : 200, headers: jsonHeaders, async text() { return responses.shift() ?? "{}"; } };
    }) as FetchLike,
  } as ConstructorParameters<typeof GeminiMarkets>[0]);
}

test("facade exposes public prediction discovery without authentication", async () => {
  const sdk = new GeminiMarkets({ env: "sandbox", fetchImpl: async () => ({ status: 200, headers: jsonHeaders, async text() { return '{"events":[]}'; } }) } as ConstructorParameters<typeof GeminiMarkets>[0]);
  assert.deepEqual(await sdk.predictions.listEvents(), { events: [] });
  sdk.close();
});

test("placeOrder checks terms and submits the unchanged order when accepted", async () => {
  const requests: Request[] = [];
  const sdk = client(['{"hasAcceptedLatest":true}', '{"orderId":9007199254740993}'], requests);
  const order = { symbol: "GEMI-X", orderType: "limit" as const, side: "buy" as const, quantity: "1", price: "0.5", outcome: "yes" as const, makerOrCancel: false };
  const original = structuredClone(order);
  const result = await sdk.predictions.placeOrder(order);
  assert.deepEqual(order, original);
  assert.equal(result.orderId, 9007199254740993n);
  assert.deepEqual(requests.map(({ url }) => new URL(url).pathname), ["/v1/prediction-markets/terms/status", "/v1/prediction-markets/order"]);
  sdk.close();
});

test("placeOrder rejects unaccepted terms without submitting an order", async () => {
  const requests: Request[] = [];
  const sdk = client(['{"hasAcceptedLatest":false,"acceptedVersion":2,"latestVersion":3}'], requests);
  await assert.rejects(() => sdk.predictions.placeOrder({ symbol: "GEMI-X", orderType: "limit", side: "buy", quantity: "1", price: "0.5", outcome: "yes", makerOrCancel: false }), AcceptTermsRequired);
  assert.equal(requests.length, 1);
  sdk.close();
});

test("batch placement checks terms once and acceptTerms delegates explicitly", async () => {
  const requests: Request[] = [];
  const sdk = client(['{"hasAcceptedLatest":true}', '{"results":[]}', '{"success":true}'], requests);
  await sdk.predictions.placeOrderBatch({ orders: [{ symbol: "GEMI-X", orderType: "limit", side: "buy", quantity: "1", price: "0.5", outcome: "yes", makerOrCancel: false }] });
  assert.deepEqual(await sdk.predictions.acceptTerms(), { success: true });
  assert.deepEqual(requests.map(({ url }) => new URL(url).pathname), ["/v1/prediction-markets/terms/status", "/v1/prediction-markets/order/batch", "/v1/prediction-markets/terms/accept"]);
  sdk.close();
});
