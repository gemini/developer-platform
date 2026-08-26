import assert from "node:assert/strict";
import test from "node:test";
import { marketDataSymbols, placeWithCleanup, predictionMarketSymbols, smokeEnvironment, smokeMarketType } from "./smoke-sandbox.mjs";

test("smoke environment defaults to sandbox and permits the internal QA production profile", () => {
  assert.equal(smokeEnvironment(), "sandbox");
  assert.equal(smokeEnvironment("production"), "production");
  assert.throws(() => smokeEnvironment("qa"), /production or sandbox/);
});

test("requires the order-book market type from the caller", () => {
  assert.equal(smokeMarketType(["--market-type=market-data"]), "market-data");
  assert.equal(smokeMarketType(["--market-type=prediction-markets"]), "prediction-markets");
  assert.throws(() => smokeMarketType([]), /pass --market-type/);
});

test("discovers prediction-market symbols from active markets", () => {
  assert.deepEqual(
    predictionMarketSymbols({ data: [{ symbol: "EVENT-SYMBOL", markets: [{ symbol: "GEMI-TEST" }] }] }),
    ["GEMI-TEST"],
  );
});

test("discovers market-data symbols from the symbols response", () => {
  assert.deepEqual(
    marketDataSymbols({ data: ["btcusd", { pair: "ethusd" }, { pair: "btcgusdperp" }] }),
    ["btcusd", "btcgusdperp"],
  );
});

test("successful placement always attempts cancellation after a later failure", async () => {
  const calls = [];
  const predictions = { async placeOrder() { calls.push("place"); return { orderId: 7n }; }, async cancelOrder({ orderId }) { calls.push(`cancel:${orderId}`); } };
  await assert.rejects(placeWithCleanup(predictions, {}, async () => { throw new Error("later failure"); }), /later failure/);
  assert.deepEqual(calls, ["place", "cancel:7"]);
});
