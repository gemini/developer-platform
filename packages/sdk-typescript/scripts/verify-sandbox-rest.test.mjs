import assert from "node:assert/strict";
import test from "node:test";
import { boundaryValueKind } from "./runtime-value.mjs";
import {
  exitCodeFor,
  isReadOnlyOperation,
  operationArgs,
  priceSymbols,
  runVerification,
} from "./verify-sandbox-rest.mjs";

test("only get/list REST operations are eligible for the read-only verifier", () => {
  assert.equal(isReadOnlyOperation({ methodName: "getPositions" }), true);
  assert.equal(isReadOnlyOperation({ methodName: "listSymbols" }), true);
  assert.equal(isReadOnlyOperation({ methodName: "createNewOrder" }), false);
  assert.equal(isReadOnlyOperation({ methodName: "sendHeartbeat" }), false);
});

test("builds dynamic arguments for market-data and prediction-market calls", () => {
  const context = {
    env: {},
    date: "2026-08-06",
    timestamp: 1_700_000_000_000,
    eventTicker: "FED260806",
    symbol: "btcusd",
    derivativeSymbol: "BTCGUSDPERP",
  };

  assert.deepEqual(
    operationArgs({ module: "marketData", methodName: "getCurrentOrderBook", method: "get", path: "/v1/book/{symbol}" }, context),
    [{ symbol: "btcusd", limit_bids: 1, limit_asks: 1 }],
  );
  assert.deepEqual(
    operationArgs({ module: "predictionMarkets", methodName: "getVolumeMetrics", method: "post", path: "/v1/prediction-markets/metrics/volume" }, context),
    [{ eventTicker: "FED260806", startTime: context.timestamp - 86_400_000, endTime: context.timestamp }],
  );
  assert.deepEqual(
    operationArgs({ module: "account", methodName: "getAvailableBalances", method: "post", path: "/v1/balances" }, context),
    [{ account: "primary", showPendingBalances: false }],
  );
  assert.deepEqual(
    operationArgs({ module: "trading", methodName: "listPastOrders", method: "post", path: "/v1/orders/history" }, context),
    [{ symbol: "btcusd", limit_orders: 1, timestamp: "1700000000000", account: "primary" }],
  );
});

test("read-only verification never invokes skipped write operations", async () => {
  const calls = [];
  const facade = new Proxy({}, {
    get: (_target, method) => async (...args) => {
      calls.push([method, args]);
      return method === "listSymbols" ? ["btcusd"] : [];
    },
  });
  const result = await runVerification({
    operations: [
      { module: "marketData", methodName: "listSymbols", method: "get", path: "/v1/symbols" },
      { module: "trading", methodName: "createNewOrder", method: "post", path: "/v1/order/new" },
    ],
    env: {},
    loadSdk: async () => ({
      createClient: async () => ({ marketData: facade, trading: facade, close() {} }),
    }),
    log: () => {},
  });

  assert.deepEqual(calls.map(([method]) => method), ["listSymbols"]);
  assert.equal(result.operations.find((operation) => operation.methodName === "createNewOrder").status, "skipped");
});

test("routes prediction-market inventory entries to the predictions facade", async () => {
  const result = await runVerification({
    operations: [{ module: "predictionMarkets", methodName: "listEvents", method: "get", path: "/v1/prediction-markets/events" }],
    env: {},
    loadSdk: async () => ({
      createClient: async () => ({ predictions: { async listEvents() { return []; } }, close() {} }),
    }),
    log: () => {},
  });

  assert.equal(result.operations[0].status, "passed");
});

test("passes the configured nonce mode to HmacAuth", async () => {
  let authOptions;
  await runVerification({
    operations: [{ module: "marketData", methodName: "listSymbols", method: "get", path: "/v1/symbols" }],
    env: { GEMINI_API_KEY: "key", GEMINI_API_SECRET: "secret", GEMINI_NONCE_MODE: "time-based" },
    loadSdk: async () => ({
      HmacAuth: class { constructor(options) { authOptions = options; } },
      createClient: async () => ({ marketData: { async listSymbols() { return ["btcusd"]; } }, close() {} }),
    }),
    log: () => {},
  });

  assert.equal(authOptions.nonceMode, "time-based");
});

test("uses a bigint for timestamp_nanos fixtures", () => {
  const args = operationArgs(
    { module: "transfers", methodName: "getTransactionHistory", method: "post", path: "/v1/transactions" },
    { env: {}, date: "2026-08-06", timestamp: 1_700_000_000_000 },
  );

  assert.equal(boundaryValueKind(args[0].timestamp_nanos), "bigint");
});

test("discovers price-feed pairs as market-data symbols", () => {
  assert.deepEqual(priceSymbols([{ pair: "btcusd" }, { pair: "ethusd" }]), ["btcusd", "ethusd"]);
});

test("logs the server reason when an API request fails", async () => {
  const logs = [];
  const result = await runVerification({
    operations: [{ module: "account", methodName: "getRoles", method: "post", path: "/v1/roles" }],
    env: {},
    loadSdk: async () => ({
      createClient: async () => ({ account: { async getRoles() { throw Object.assign(new Error("HTTP 400"), { reason: "MissingRole" }); } }, close() {} }),
    }),
    log: (message) => logs.push(message),
  });

  assert.equal(result.operations[0].status, "failed");
  assert(logs.some((message) => message.includes("MissingRole")));
});

test("failed or blocked read-only operations fail the verifier, skipped writes do not", () => {
  assert.equal(exitCodeFor([{ status: "passed" }, { status: "skipped" }]), 0);
  assert.equal(exitCodeFor([{ status: "blocked" }, { status: "skipped" }]), 1);
  assert.equal(exitCodeFor([{ status: "failed" }]), 1);
});
