import assert from "node:assert/strict";
import test from "node:test";

import { type AuthStrategy, type FetchLike, HttpTransport } from "../core/http.js";
import { executeRestOperation } from "../core/rest-operation.js";
import { SdkError, ValidationError } from "../errors.js";

const operation = (name: string) => ({
  method: "post",
  path: "/test",
  operation: name,
  access: "authenticated",
  parameters: [],
  requestBody: true,
  requestBodyRequired: true,
  successStatuses: [200],
  responseMode: "json" as const,
  responseContentTypes: ["application/json"],
  responseInt64Paths: [],
});

function transportWithCounters() {
  let authCalls = 0;
  let fetchCalls = 0;
  const fetchImpl: FetchLike = async () => {
    fetchCalls++;
    return { status: 200, headers: { get: () => "application/json" }, async text() { return "{}"; } };
  };
  const http = new HttpTransport({
    env: "sandbox",
    auth: {
      nextNonce: () => { authCalls++; return auth.nextNonce(); },
      credentialHeaders: async (payload) => { authCalls++; return auth.credentialHeaders(payload); },
    },
    fetchImpl,
  });
  return { http, counts: () => ({ authCalls, fetchCalls }) };
}

const auth: AuthStrategy = {
  nextNonce: () => "1",
  credentialHeaders: async () => ({ Authorization: "Bearer token" }),
};

test("invalid trading order bodies fail before auth or fetch", async () => {
  let authCalls = 0;
  let fetchCalls = 0;
  const fetchImpl: FetchLike = async () => {
    fetchCalls++;
    return {
      status: 200,
      headers: { get: () => "application/json" },
      async text() { return "{}"; },
    };
  };
  const http = new HttpTransport({
    env: "sandbox",
    auth: {
      nextNonce: () => { authCalls++; return auth.nextNonce(); },
      credentialHeaders: async (payload) => {
        authCalls++;
        return auth.credentialHeaders(payload);
      },
    },
    fetchImpl,
  });

  await assert.rejects(
    executeRestOperation<{ path: never; query: never; headers: never; body: unknown; response: unknown }>(
      http,
      {
        method: "post",
        path: "/v1/order/new",
        operation: "trading.createNewOrder",
        access: "authenticated",
        parameters: [],
        requestBody: true,
        requestBodyRequired: true,
        successStatuses: [200],
        responseMode: "json",
        responseContentTypes: ["application/json"],
        responseInt64Paths: [],
      },
      { body: null },
    ),
    (error: unknown) => {
      assert.ok(error instanceof SdkError);
      assert.equal((error as Error).name, "ValidationError");
      assert.equal((error as { operation?: string }).operation, "trading.createNewOrder");
      assert.equal((error as { field?: string }).field, "body");
      assert.equal((error as { rule?: string }).rule, "type");
      return true;
    },
  );
  assert.equal(authCalls, 0);
  assert.equal(fetchCalls, 0);
});

test("documented field rules reject invalid enums, decimals, conditionals, and bounds", async () => {
  const cases = [
    ["trading.createNewOrder", { symbol: "BTCUSD", amount: "1", price: "2", side: "hold", type: "exchange limit" }, "side", "enum"],
    ["trading.createNewOrder", { symbol: "BTCUSD", amount: "1e2", price: "2", side: "buy", type: "exchange limit" }, "amount", "format"],
    ["trading.createNewOrder", { symbol: "BTCUSD", amount: "1", price: "2", side: "buy", type: "exchange stop limit" }, "stop_price", "conditional"],
    ["trading.createNewOrder", { symbol: "BTCUSD", amount: "1", price: "2", side: "buy", type: "exchange stop limit", stop_price: "2", options: ["fill-or-kill"] }, "options", "exclusive"],
    ["trading.createNewOrder", { symbol: "BTCUSD", amount: "1", price: "2", side: "buy", type: "exchange stop limit", stop_price: "2" }, "stop_price", "relationship"],
    ["trading.createNewOrder", { symbol: "BTCUSD", amount: "1", price: "2", side: "sell", type: "exchange stop limit", stop_price: "1" }, "stop_price", "relationship"],
    ["accountServices.transferBetweenAccounts", { sourceAccount: "primary", targetAccount: "custody", amount: "1", clientTransferId: "550e8400-e29b-11d4-a716-446655440000" }, "clientTransferId", "format"],
    ["predictionMarkets.placeOrderBatch", { orders: [] }, "orders", "bounds"],
    ["predictionMarkets.placeOrderBatch", { orders: [{ symbol: "GEMI-FEDJAN26-DN25", orderType: "limit", side: "buy", quantity: "1", price: "1.1", outcome: "yes" }] }, "orders[0].price", "bounds"],
  ] as const;

  for (const [name, body, field, rule] of cases) {
    const { http, counts } = transportWithCounters();
    await assert.rejects(
      executeRestOperation(http, operation(name), { body }),
      (error: unknown) => {
        assert.ok(error instanceof ValidationError);
        assert.equal(error.operation, name);
        assert.equal(error.field, field);
        assert.equal(error.rule, rule);
        return true;
      },
    );
    assert.deepEqual(counts(), { authCalls: 0, fetchCalls: 0 });
  }
});

test("order status requires exactly one order identifier before auth or fetch", async () => {
  const cases = [
    [{ order_id: 1, client_order_id: "client-1" }, "exclusive"],
    [{ include_trades: true }, "required"],
    [{ order_id: "not-numeric" }, "format"],
    [{ order_id: -1 }, "format"],
  ] as const;

  for (const [body, rule] of cases) {
    const { http, counts } = transportWithCounters();
    await assert.rejects(
      executeRestOperation(http, operation("trading.getOrderStatus"), { body }),
      (error: unknown) => {
        assert.ok(error instanceof ValidationError);
        assert.equal(error.operation, "trading.getOrderStatus");
        assert.equal(error.field, "order_id");
        assert.equal(error.rule, rule);
        return true;
      },
    );
    assert.deepEqual(counts(), { authCalls: 0, fetchCalls: 0 });
  }

  const { http, counts } = transportWithCounters();
  await executeRestOperation(http, operation("trading.getOrderStatus"), { body: { client_order_id: "client-1" } });
  assert.deepEqual(counts(), { authCalls: 2, fetchCalls: 1 });
});

test("stop-limit prices must follow the documented side relationship", async () => {
  const { http, counts } = transportWithCounters();
  for (const body of [
    { symbol: "BTCUSD", amount: "1", price: "100.00", side: "buy", type: "exchange stop limit", stop_price: "99.99" },
    { symbol: "BTCUSD", amount: "1", price: "100.00", side: "sell", type: "exchange stop limit", stop_price: "100.01" },
    { symbol: "BTCUSD", amount: "1", price: "100000000000000000.000000000000000001", side: "buy", type: "exchange stop limit", stop_price: "100000000000000000.000000000000000000" },
  ]) {
    await executeRestOperation(http, operation("trading.createNewOrder"), { body });
  }
  assert.deepEqual(counts(), { authCalls: 6, fetchCalls: 3 });
});

test("valid prediction order bodies remain unchanged for transport", async () => {
  const { http, counts } = transportWithCounters();
  const body = { symbol: "GEMI-FEDJAN26-DN25", orderType: "limit", side: "buy", quantity: "100", price: "0.65", outcome: "yes" };
  await executeRestOperation(http, operation("predictionMarkets.placeOrder"), { body });
  assert.deepEqual(counts(), { authCalls: 2, fetchCalls: 1 });
});

test("documented prediction time-in-force values pass validation", async () => {
  for (const timeInForce of ["good-til-cancel", "immediate-or-cancel", "fill-or-kill"] as const) {
    const { http, counts } = transportWithCounters();
    await executeRestOperation(http, operation("predictionMarkets.placeOrder"), {
      body: { symbol: "GEMI-FEDJAN26-DN25", orderType: "limit", side: "buy", quantity: "100", price: "0.65", outcome: "yes", timeInForce },
    });
    assert.deepEqual(counts(), { authCalls: 2, fetchCalls: 1 });
  }
});

test("withdrawals accept any canonical UUID version", async () => {
  const { http, counts } = transportWithCounters();
  await executeRestOperation(http, operation("accountServices.withdrawCryptoFunds"), {
    body: { address: "0x123", amount: "1", clientTransferId: "550e8400-e29b-11d4-a716-446655440000" },
  });
  assert.deepEqual(counts(), { authCalls: 2, fetchCalls: 1 });
});
