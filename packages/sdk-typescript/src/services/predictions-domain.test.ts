import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { AcceptTermsRequired, HmacAuth, serializeError } from "../server/index.js";
import { GeminiMarkets } from "../client/server.js";
import type { BoundaryValue } from "../utils/boundary-value.js";
import { streamingTextResponse } from "../tests/support/http-fixtures.js";

type Request = { url: string; init: { method: string; headers: Record<string, string> } };
const jsonHeaders = { get: (name: string) => name.toLowerCase() === "content-type" ? "application/json" : null };

function jsonResponse(status: number, body: string) {
  return streamingTextResponse(body, status, jsonHeaders);
}

function client(responses: string[], requests: Request[] = []) {
  return new GeminiMarkets({
    env: "sandbox",
    auth: new HmacAuth({ apiKey: "key", apiSecret: "secret", now: () => 1000 }),
    fetch: (async (url, init) => {
      requests.push({ url, init });
      return jsonResponse(url.endsWith("/order") ? 201 : 200, responses.shift() ?? "{}");
    }),
  });
}

test("facade exposes public prediction discovery without authentication", async () => {
  const sdk = new GeminiMarkets({ env: "sandbox", fetch: async () => jsonResponse(200, '{"events":[]}') });
  assert.deepEqual(await sdk.predictions.listEvents(), { events: [] });
  sdk.close();
});

test("placeOrder relies on the endpoint terms error and does not preflight", async () => {
  const requests: Request[] = [];
  const sdk = new GeminiMarkets({
    env: "sandbox",
    auth: new HmacAuth({ apiKey: "key", apiSecret: "secret", now: () => 1000 }),
    fetch: (async (url, init) => {
      requests.push({ url, init });
      return jsonResponse(403, JSON.stringify({
            reason: "AcceptTermsRequired",
            message: "accept the latest prediction markets terms",
            latestVersion: 3,
          }));
    }),
  });

  await assert.rejects(
    () => sdk.predictions.placeOrder({
      symbol: "GEMI-X",
      orderType: "limit",
      side: "buy",
      quantity: "1",
      price: "0.5",
      outcome: "yes",
      makerOrCancel: false,
    }),
    (error: BoundaryValue) =>
      error instanceof AcceptTermsRequired &&
      error.status === 403 &&
      error.reason === "AcceptTermsRequired" &&
      serializeError(error, { includeRawBody: true }).body !== undefined,
  );
  assert.deepEqual(requests.map(({ url }) => new URL(url).pathname), ["/v1/prediction-markets/order"]);
  sdk.close();
});

test("placeOrderBatch relies on the endpoint terms error and does not preflight", async () => {
  const requests: Request[] = [];
  const sdk = new GeminiMarkets({
    env: "sandbox",
    auth: new HmacAuth({ apiKey: "key", apiSecret: "secret", now: () => 1000 }),
    fetch: (async (url, init) => {
      requests.push({ url, init });
      return jsonResponse(403, '{"reason":"AcceptTermsRequired","message":"accept the latest prediction markets terms"}');
    }),
  });

  await assert.rejects(
    () => sdk.predictions.placeOrderBatch({
      orders: [{
        symbol: "GEMI-X",
        orderType: "limit",
        side: "buy",
        quantity: "1",
        price: "0.5",
        outcome: "yes",
        makerOrCancel: false,
      }],
    }),
    AcceptTermsRequired,
  );
  assert.deepEqual(requests.map(({ url }) => new URL(url).pathname), ["/v1/prediction-markets/order/batch"]);
  sdk.close();
});

describe("prediction terms compatibility", () => {
  test("batch placement leaves terms checking and acceptance explicit", async () => {
    const requests: Request[] = [];
    const sdk = client(['{"results":[]}', '{"success":true}'], requests);
    await sdk.predictions.placeOrderBatch({ orders: [{ symbol: "GEMI-X", orderType: "limit", side: "buy", quantity: "1", price: "0.5", outcome: "yes", makerOrCancel: false }] });
    assert.deepEqual(await sdk.predictions.acceptTerms(), { success: true });
    assert.deepEqual(requests.map(({ url }) => new URL(url).pathname), ["/v1/prediction-markets/order/batch", "/v1/prediction-markets/terms/accept"]);
    sdk.close();
  });

  test("prediction terms acceptance retains the compatibility alias", async () => {
    const requests: Request[] = [];
    const sdk = client(["{\"success\":true}"], requests);

    assert.deepEqual(await sdk.predictions.acceptPredictionMarketsTerms(), { success: true });
    assert.deepEqual(requests.map(({ url }) => new URL(url).pathname), ["/v1/prediction-markets/terms/accept"]);
    sdk.close();
  });
});
