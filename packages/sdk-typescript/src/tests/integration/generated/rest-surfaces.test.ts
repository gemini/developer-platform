import assert from "node:assert/strict";
import test from "node:test";
import { fromBase64, hmacSha384Hex } from "../../../utils/encoding.js";
import { type FetchLike } from "../../../transport/http.js";
import { boundaryValueKind, isBoundaryObject, type BoundaryRecord, type BoundaryValue } from "../../../utils/boundary-value.js";
import { AccountRest } from "../../../generated/account/rest.js";
import { ClearingRest } from "../../../generated/clearing/rest.js";
import { InstantRest } from "../../../generated/instant/rest.js";
import { MarginRest } from "../../../generated/margin/rest.js";
import { PerpetualsRest } from "../../../generated/perpetuals/rest.js";
import { StakingRest } from "../../../generated/staking/rest.js";
import { TransfersRest } from "../../../generated/transfers/rest.js";
import { TradingRest } from "../../../generated/trading/rest.js";
import { GeminiMarkets } from "../../../client/server.js";
import { parseBoundaryRecord, streamingBytesResponse, streamingTextResponse } from "../../support/http-fixtures.js";

import {
  ACCOUNT_OPERATIONS,
  CLEARING_OPERATIONS,
  HmacAuth,
  INSTANT_OPERATIONS,
  MARGIN_OPERATIONS,
  PERPETUALS_OPERATIONS,
  STAKING_OPERATIONS,
  TRANSFERS_OPERATIONS,
  TRADING_OPERATIONS,
  type ClearingOperationTypes,
  type InstantOperationTypes,
  type MarginOperationTypes,
  type PerpetualsOperationTypes,
  type RestFileResponse,
  type StakingOperationTypes,
  type TransfersOperationTypes,
  type TradingOperationTypes,
} from "../../../server/index.js";
import type { components } from "../../../generated/market-data/models.js";

type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends
  (<T>() => T extends B ? 1 : 2) ? true : false;
type Assert<T extends true> = T;
type TransportFieldKeys = "request" | "nonce";

type _GeneratedFacadeClients = Assert<
  Equal<
    [
      GeminiMarkets["trading"],
      GeminiMarkets["margin"],
      GeminiMarkets["perpetuals"],
      GeminiMarkets["account"],
      GeminiMarkets["staking"],
      GeminiMarkets["transfers"],
      GeminiMarkets["clearing"],
      GeminiMarkets["instant"],
    ],
    [TradingRest, MarginRest, PerpetualsRest, AccountRest, StakingRest, TransfersRest, ClearingRest, InstantRest]
  >
>;
type _TradingOrderBody = Assert<
  Equal<
    TradingOperationTypes["createNewOrder"]["body"],
    Omit<components["schemas"]["NewOrderRequest"], TransportFieldKeys>
  >
>;
type _TradingWrapPath = Assert<
  Equal<TradingOperationTypes["wrapOrder"]["path"], { symbol: string }>
>;
type _TradingWrapBodyNoTransportFields = Assert<
  Equal<Extract<TransportFieldKeys, keyof TradingOperationTypes["wrapOrder"]["body"]>, never>
>;
type _MarginPreviewBodyNoTransportFields = Assert<
  Equal<Extract<TransportFieldKeys, keyof MarginOperationTypes["previewMarginOrder"]["body"]>, never>
>;
type _MarginPreviewResponse = Assert<
  Equal<MarginOperationTypes["previewMarginOrder"]["response"], components["schemas"]["MarginOrderPreview"]>
>;
type _PerpetualsRiskStatsPath = Assert<
  Equal<PerpetualsOperationTypes["getRiskStats"]["path"], { symbol: string }>
>;
type _PerpetualsReportFileResponse = Assert<
  Equal<PerpetualsOperationTypes["getFundingPaymentReportFile"]["response"], RestFileResponse>
>;
type _PerpetualsReportBodyNoTransportFields = Assert<
  Equal<
    Extract<TransportFieldKeys, keyof PerpetualsOperationTypes["getFundingPaymentReportFile"]["body"]>,
    never
  >
>;
type _StakingRatesBody = Assert<
  Equal<StakingOperationTypes["listStakingRates"]["body"], never>
>;
type _TransfersWithdrawPath = Assert<
  Equal<
    TransfersOperationTypes["withdrawCryptoFunds"]["path"],
    { network: components["parameters"]["networkParam"]; ticker: string }
  >
>;
type _ClearingOrderResponse = Assert<
  Equal<ClearingOperationTypes["createNewClearingOrder"]["response"], components["schemas"]["ClearingOrder"]>
>;
type _ClearingOrderBodyNoTransportFields = Assert<
  Equal<
    Extract<TransportFieldKeys, keyof ClearingOperationTypes["createNewClearingOrder"]["body"]>,
    never
  >
>;
type _InstantQuoteResponse = Assert<
  Equal<InstantOperationTypes["getInstantQuote"]["response"], components["schemas"]["InstantQuote"]>
>;
type _InstantQuoteBodyNoTransportFields = Assert<
  Equal<Extract<TransportFieldKeys, keyof InstantOperationTypes["getInstantQuote"]["body"]>, never>
>;

type Request = {
  url: string;
  init: Parameters<FetchLike>[1];
};

type GeneratedOperationMetadata = {
  responseMode: string;
  operation: string;
  method: string;
  path: string;
  access: string;
  parameters: readonly { name: string; in: string; required: boolean; style: string; explode: boolean }[];
  headers: readonly unknown[];
  requestBody: boolean;
  requestBodyRequired: boolean;
  successStatuses: readonly number[];
  responseContentTypes: readonly string[];
  responseInt64Paths: readonly unknown[];
  requestInt64Paths: {
    body: readonly unknown[];
    path: readonly unknown[];
    query: readonly unknown[];
  };
  retryable: boolean;
};

const metadataKeys = [
  "access",
  "headers",
  "method",
  "operation",
  "parameters",
  "path",
  "requestBody",
  "requestBodyRequired",
  "requestInt64Paths",
  "responseContentTypes",
  "responseInt64Paths",
  "responseMode",
  "retryable",
  "successStatuses",
];

test("generated trading metadata preserves unsigned order IDs", () => {
  assert.deepEqual(TRADING_OPERATIONS.cancelOrder.requestInt64Paths.body, [
    { path: ["nonce"], allowString: true },
    { path: ["order_id"], unsigned: true },
  ]);
  assert.deepEqual(TRADING_OPERATIONS.getOrderStatus.requestInt64Paths.body, [
    { path: ["nonce"], allowString: true },
    { path: ["order_id"], unsigned: true },
  ]);
});

function assertModuleMetadata(
  operations: Record<string, GeneratedOperationMetadata>,
  expectedCount: number,
): void {
  const entries = Object.entries(operations);
  assert.equal(entries.length, expectedCount);
  assert.equal(new Set(entries.map(([operationId]) => operationId)).size, expectedCount);
  for (const [, operation] of entries) {
    assert.deepEqual(Object.keys(operation).sort(), metadataKeys);
    assert.equal(operation.successStatuses.length > 0, true);
    assert.equal(operation.responseContentTypes.length > 0, true);
  }
}

function testClient() {
  const requests: Request[] = [];
  const fileBytes = new Uint8Array([1, 2, 3, 4]);
  const auth = new HmacAuth({ apiKey: "key", apiSecret: "secret", now: () => 1000 });
  const fetchImpl: FetchLike = async (url, init) => {
    const pathname = new URL(url).pathname;
    requests.push({ url, init });
    if (pathname === "/v1/margin/rates") {
      return streamingTextResponse('{"rates":[]}', 200, { get: (name: string) => name.toLowerCase() === "content-type" ? "application/json" : null });
    }
    if (pathname === "/v2/transfers") {
      return streamingTextResponse('[{"eid":"9007199254740993"}]', 200, { get: (name: string) => name.toLowerCase() === "content-type" ? "application/json" : null });
    }
    if (pathname === "/v1/transactions") {
      return streamingTextResponse('{"results":[{"eid":"9007199254740993"}]}', 200, { get: (name: string) => name.toLowerCase() === "content-type" ? "application/json" : null });
    }
    if (
      pathname === "/v1/perpetuals/fundingPayment" ||
      pathname === "/v1/perpetuals/fundingpaymentreport/records.json" ||
      pathname === "/v1/account/list" ||
      pathname === "/v1/balances" ||
      pathname === "/v1/addresses/ethereum" ||
      pathname === "/v1/orders" ||
      pathname === "/v1/orders/history" ||
      pathname === "/v1/mytrades" ||
      pathname === "/v1/staking/history" ||
      pathname === "/v1/tradevolume"
    ) {
      return streamingTextResponse("[]", 200, { get: (name: string) => name.toLowerCase() === "content-type" ? "application/json" : null });
    }
    if (pathname.endsWith(".xlsx")) {
      return streamingBytesResponse(fileBytes, 200, {
        get(name: string) {
          const normalized = name.toLowerCase();
          if (normalized === "content-disposition") return "attachment; filename=funding-payment-report.xlsx";
          if (normalized === "content-type") return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
          return null;
        },
      });
    }
    return streamingTextResponse("{}", 200, { get: (name: string) => name.toLowerCase() === "content-type" ? "application/json" : null });
  };
  const sdk = new GeminiMarkets({
    env: "sandbox",
    auth,
    fetch: fetchImpl,
  });
  return { sdk, requests, fileBytes };
}

function payload(request: Request): BoundaryRecord {
  return parseBoundaryRecord(fromBase64(request.init.headers["X-GEMINI-PAYLOAD"]!));
}

function boundaryField(value: BoundaryValue, key: string): BoundaryValue | undefined {
  return isBoundaryObject(value) ? value[key] : undefined;
}

async function assertSigned(request: Request): Promise<void> {
  const encoded = request.init.headers["X-GEMINI-PAYLOAD"]!;
  assert.equal(request.init.headers["X-GEMINI-APIKEY"], "key");
  assert.equal(
    request.init.headers["X-GEMINI-SIGNATURE"],
    await hmacSha384Hex("secret", encoded),
  );
  assert.equal(request.init.headers["Content-Length"], "0");
  assert.equal(request.init.headers["Content-Type"], "text/plain");
  assert.equal(request.init.body, undefined);
}

test("generated REST operation metadata covers the new module surfaces", () => {
  assertModuleMetadata(TRADING_OPERATIONS, 12);
  assertModuleMetadata(MARGIN_OPERATIONS, 3);
  assertModuleMetadata(PERPETUALS_OPERATIONS, 6);
  assertModuleMetadata(ACCOUNT_OPERATIONS, 16);
  assertModuleMetadata(STAKING_OPERATIONS, 6);
  assertModuleMetadata(TRANSFERS_OPERATIONS, 6);
  assertModuleMetadata(CLEARING_OPERATIONS, 8);
  assertModuleMetadata(INSTANT_OPERATIONS, 2);

  assert.equal(TRADING_OPERATIONS.wrapOrder.path, "/v1/wrap/{symbol}");
  assert.deepEqual(TRADING_OPERATIONS.wrapOrder.parameters, [
    { name: "symbol", in: "path", required: true, style: "simple", explode: false, valueType: "string" },
  ]);
  assert.equal(MARGIN_OPERATIONS.previewMarginOrder.path, "/v1/margin/order/preview");
  assert.equal(PERPETUALS_OPERATIONS.getRiskStats.access, "public");
  assert.equal(PERPETUALS_OPERATIONS.getFundingPaymentReportFile.method, "get");
  assert.equal(PERPETUALS_OPERATIONS.getFundingPaymentReportFile.requestBodyRequired, false);
  assert.equal(PERPETUALS_OPERATIONS.getFundingPaymentReportFile.responseMode, "file");
  assert.equal(STAKING_OPERATIONS.listStakingRates.access, "public");
  assert.equal(TRANSFERS_OPERATIONS.withdrawCryptoFunds.path, "/v2/withdraw/{network}/{ticker}");
  assert.equal(CLEARING_OPERATIONS.createNewClearingOrder.path, "/v1/clearing/new");
  assert.equal(INSTANT_OPERATIONS.getInstantQuote.path, "/v1/instant/quote");
  assert.deepEqual(TRANSFERS_OPERATIONS.getTransactionHistory.responseInt64Paths, [
    ["results", "*", "advanceEid"],
    ["results", "*", "correlationId"],
    ["results", "*", "eid"],
    ["results", "*", "orderId"],
    ["results", "*", "pendingEid"],
    ["results", "*", "tid"],
    ["results", "*", "withdrawalEid"],
  ]);
  assert.deepEqual(TRANSFERS_OPERATIONS.listPastTransfers.responseInt64Paths, [["*", "eid"]]);
});

test("client facade owns generated REST clients without exporting their constructors", () => {
  const { sdk } = testClient();
  assert.equal(boundaryValueKind(sdk.trading.createNewOrder), "function");
  assert.equal(boundaryValueKind(sdk.margin.previewMarginOrder), "function");
  assert.equal(boundaryValueKind(sdk.perpetuals.getRiskStats), "function");
  assert.equal(boundaryValueKind(sdk.account.getAvailableBalances), "function");
  assert.equal(boundaryValueKind(sdk.staking.listStakingRates), "function");
  assert.equal(boundaryValueKind(sdk.transfers.withdrawCryptoFunds), "function");
  assert.equal(boundaryValueKind(sdk.clearing.createNewClearingOrder), "function");
  assert.equal(boundaryValueKind(sdk.instant.getInstantQuote), "function");
  sdk.close();
});

test("Trading wrappers shape signed requests without using the network", async () => {
  const { sdk, requests } = testClient();

  await sdk.trading.cancelAllActiveOrders({ account: "primary" });
  await sdk.trading.cancelAllSessionOrders({ account: "primary" });
  await sdk.trading.cancelOrder({ order_id: 123, account: "primary" });
  await sdk.trading.createNewOrder({
    symbol: "btcusd",
    amount: "1",
    price: "100",
    side: "buy",
    type: "exchange limit",
    client_order_id: "codex-no-network",
    account: "primary",
  });
  await sdk.trading.getNotionalTradingVolume({ account: "primary" });
  await sdk.trading.getOrderStatus({
    order_id: 123,
    include_trades: true,
    account: "primary",
  });
  await sdk.trading.getTradingVolume({ account: "primary" });
  await sdk.trading.listActiveOrders({ account: "primary" });
  await sdk.trading.listPastOrders({
    symbol: "btcusd",
    limit_orders: 10,
    timestamp: "1700000000000",
    account: "primary",
  });
  await sdk.trading.listPastTrades({
    symbol: "btcusd",
    limit_trades: 10,
    timestamp: "1700000000000",
    account: "primary",
  });
  await sdk.trading.sendHeartbeat({});
  await sdk.trading.wrapOrder({
    symbol: "GUSDUSD",
    amount: "1",
    side: "buy",
    client_order_id: "codex-wrap-no-network",
    account: "primary",
  });

  assert.deepEqual(requests.map(({ init }) => init.method), Array(12).fill("POST"));
  assert.deepEqual(requests.map(({ url }) => new URL(url).pathname), [
    "/v1/order/cancel/all",
    "/v1/order/cancel/session",
    "/v1/order/cancel",
    "/v1/order/new",
    "/v1/notionalvolume",
    "/v1/order/status",
    "/v1/tradevolume",
    "/v1/orders",
    "/v1/orders/history",
    "/v1/mytrades",
    "/v1/heartbeat",
    "/v1/wrap/GUSDUSD",
  ]);
  assert.deepEqual(requests.map(({ url }) => new URL(url).search), Array(12).fill(""));
  [
    { request: "/v1/order/cancel/all", nonce: 1000, account: "primary" },
    { request: "/v1/order/cancel/session", nonce: 1001, account: "primary" },
    { request: "/v1/order/cancel", nonce: 1002, order_id: 123, account: "primary" },
    {
      request: "/v1/order/new",
      nonce: 1003,
      symbol: "btcusd",
      amount: "1",
      price: "100",
      side: "buy",
      type: "exchange limit",
      client_order_id: "codex-no-network",
      account: "primary",
    },
    { request: "/v1/notionalvolume", nonce: 1004, account: "primary" },
    {
      request: "/v1/order/status",
      nonce: 1005,
      order_id: 123,
      include_trades: true,
      account: "primary",
    },
    { request: "/v1/tradevolume", nonce: 1006, account: "primary" },
    { request: "/v1/orders", nonce: 1007, account: "primary" },
    {
      request: "/v1/orders/history",
      nonce: 1008,
      symbol: "btcusd",
      limit_orders: 10,
      timestamp: "1700000000000",
      account: "primary",
    },
    {
      request: "/v1/mytrades",
      nonce: 1009,
      symbol: "btcusd",
      limit_trades: 10,
      timestamp: "1700000000000",
      account: "primary",
    },
    { request: "/v1/heartbeat", nonce: 1010 },
    {
      request: "/v1/wrap/GUSDUSD",
      nonce: 1011,
      amount: "1",
      side: "buy",
      client_order_id: "codex-wrap-no-network",
      account: "primary",
    },
  ].forEach((expected, index) => assert.deepEqual(payload(requests[index]!), expected));
  for (const request of requests) await assertSigned(request);
  sdk.close();
});

test("Margin wrappers shape signed requests without using the network", async () => {
  const { sdk, requests } = testClient();

  await sdk.margin.getMarginAccount({ account: "primary" });
  await sdk.margin.getMarginRates({ account: "primary" });
  await sdk.margin.previewMarginOrder({
    symbol: "btcusd",
    side: "buy",
    type: "limit",
    amount: "0.5",
    price: "100",
  });

  assert.deepEqual(requests.map(({ init }) => init.method), ["POST", "POST", "POST"]);
  assert.deepEqual(requests.map(({ url }) => new URL(url).pathname), [
    "/v1/margin/account",
    "/v1/margin/rates",
    "/v1/margin/order/preview",
  ]);
  assert.deepEqual(payload(requests[0]!), {
    request: "/v1/margin/account",
    nonce: 1000,
    account: "primary",
  });
  assert.deepEqual(payload(requests[1]!), {
    request: "/v1/margin/rates",
    nonce: 1001,
    account: "primary",
  });
  assert.deepEqual(payload(requests[2]!), {
    request: "/v1/margin/order/preview",
    nonce: 1002,
    symbol: "btcusd",
    side: "buy",
    type: "limit",
    amount: "0.5",
    price: "100",
  });
  for (const request of requests) await assertSigned(request);
  sdk.close();
});

test("Perpetuals wrappers shape public, authenticated JSON, and file requests", async () => {
  const { sdk, requests, fileBytes } = testClient();

  await sdk.perpetuals.getRiskStats({ symbol: "BTCGUSDPERP" });
  await sdk.perpetuals.getAccountMargin({
    account: "primary",
    symbol: "BTCGUSDPERP",
  });
  await sdk.perpetuals.getOpenPositions({ account: "primary" });
  await sdk.perpetuals.listFundingPayments({
    since: 1700000000000n,
    to: 1700003600000n,
    account: "primary",
  });
  await sdk.perpetuals.getFundingPaymentReportJson({
    fromDate: "2026-01-01",
    toDate: "2026-01-31",
    numRows: 10,
    account: "primary",
  });
  const file = await sdk.perpetuals.getFundingPaymentReportFile({
    fromDate: "2026-01-01",
    toDate: "2026-01-31",
    numRows: 10,
    account: "primary",
  });

  assert.deepEqual(requests.map(({ init }) => init.method), [
    "GET",
    "POST",
    "POST",
    "POST",
    "POST",
    "GET",
  ]);
  assert.equal(requests[0]?.url, "https://api.sandbox.gemini.com/v1/riskstats/BTCGUSDPERP");
  assert.deepEqual(requests[0]?.init.headers, { Accept: "application/json" });
  assert.equal(
    requests[1]?.url,
    "https://api.sandbox.gemini.com/v1/margin",
  );
  assert.equal(
    requests[2]?.url,
    "https://api.sandbox.gemini.com/v1/positions",
  );
  assert.equal(
    requests[3]?.url,
    "https://api.sandbox.gemini.com/v1/perpetuals/fundingPayment?since=1700000000000&to=1700003600000",
  );
  assert.equal(
    requests[4]?.url,
    "https://api.sandbox.gemini.com/v1/perpetuals/fundingpaymentreport/records.json?fromDate=2026-01-01&toDate=2026-01-31&numRows=10",
  );
  assert.equal(
    requests[5]?.url,
    "https://api.sandbox.gemini.com/v1/perpetuals/fundingpaymentreport/records.xlsx?fromDate=2026-01-01&toDate=2026-01-31&numRows=10",
  );
  assert.deepEqual(payload(requests[1]!), {
    request: "/v1/margin",
    account: "primary",
    symbol: "BTCGUSDPERP",
    nonce: 1000,
  });
  assert.deepEqual(payload(requests[2]!), {
    request: "/v1/positions",
    account: "primary",
    nonce: 1001,
  });
  assert.deepEqual(payload(requests[3]!), {
    request: "/v1/perpetuals/fundingPayment",
    account: "primary",
    nonce: 1002,
  });
  assert.deepEqual(payload(requests[4]!), {
    request: "/v1/perpetuals/fundingpaymentreport/records.json",
    account: "primary",
    nonce: 1003,
  });
  assert.deepEqual(payload(requests[5]!), {
    request: "/v1/perpetuals/fundingpaymentreport/records.xlsx",
    account: "primary",
    nonce: 1004,
  });
  assert.deepEqual(file.bytes, fileBytes);
  assert.equal(
    file.contentType,
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  );
  assert.equal(file.contentDisposition, "attachment; filename=funding-payment-report.xlsx");
  for (const request of requests.slice(1)) await assertSigned(request);
  sdk.close();
});

test("Account, staking, and transfer wrappers shape public, signed read, and mutation requests", async () => {
  const { sdk, requests } = testClient();

  await sdk.account.addBank({
    accountnumber: "123456789",
    routing: "021000021",
    type: "checking",
    name: "Codex Test",
    account: "primary",
  });
  await sdk.account.addBankCAD({
    swiftcode: "BOFMCAM2",
    accountNumber: "1234567",
    type: "checking",
    name: "Codex CAD Test",
    account: "primary",
  });
  await sdk.account.createNewAccount({
    name: "Codex Test Account",
    type: "exchange",
  });
  await sdk.account.createNewApprovedAddress({
    network: "ethereum",
    address: "0xabc",
    label: "codex",
    account: "primary",
  });
  await sdk.account.createNewDepositAddress({
    network: "ethereum",
    label: "codex",
    account: "primary",
  });
  await sdk.account.getAccountDetail({ account: "primary" });
  await sdk.account.getAvailableBalances({
    account: "primary",
    showPendingBalances: false,
  });
  await sdk.transfers.getGasFeeEstimation({
    network: "ethereum",
    ticker: "eth",
    address: "0xabc",
    amount: "1",
    account: "primary",
  });
  await sdk.account.getNotionalBalances({
    currency: "usd",
    account: "primary",
  });
  await sdk.account.getRoles({});
  const transactionHistory = await sdk.transfers.getTransactionHistory({ limit: 10 });
  await sdk.account.listAccountsInGroup({ limit_accounts: 10 });
  await sdk.account.listApprovedAddresses({
    network: "ethereum",
    account: "primary",
  });
  await sdk.transfers.listCustodyFeeTransfers({
    limit_transfers: 10,
    account: "primary",
  });
  await sdk.account.listDepositAddresses({
    network: "ethereum",
    timestamp: "1700000000000",
    account: "primary",
  });
  const pastTransfers = await sdk.transfers.listPastTransfers({
    currency: "eth",
    network: "ethereum",
    limit_transfers: 10,
    account: "primary",
  });
  const firstTransaction = transactionHistory.results?.[0];
  assert.equal(boundaryField(firstTransaction as BoundaryValue, "eid"), 9007199254740993n);
  const firstPastTransfer = pastTransfers[0];
  assert.equal(boundaryField(firstPastTransfer as BoundaryValue, "eid"), 9007199254740993n);
  await sdk.account.listPaymentMethods({ account: "primary" });
  await sdk.staking.listStakingBalances({ account: "primary" });
  await sdk.staking.listStakingEventHistory({
    account: "primary",
    since: "2026-01-01T00:00:00.000Z",
    limit: 10,
  });
  await sdk.staking.listStakingRates();
  await sdk.staking.listStakingRewards({
    account: "primary",
    since: "2026-01-01T00:00:00.000Z",
  });
  await sdk.account.removeApprovedAddress({
    network: "ethereum",
    address: "0xabc",
    account: "primary",
  });
  await sdk.account.renameAccount({
    account: "primary",
    newName: "Codex Test Renamed",
    newAccount: "codex-test-renamed",
  });
  await sdk.account.revokeOAuthToken({});
  await sdk.staking.stakeCryptoFunds({
    account: "primary",
    providerId: "provider-1",
    currency: "eth",
    amount: "0.1",
  });
  await sdk.transfers.transferBetweenAccounts({
    currency: "usd",
    sourceAccount: "primary",
    targetAccount: "secondary",
    amount: "1.00",
    clientTransferId: "aa97b177-9383-4934-8543-0f91a7a02838",
  });
  await sdk.staking.unstakeCryptoFunds({
    account: "primary",
    providerId: "provider-1",
    currency: "eth",
    amount: "0.1",
  });
  await sdk.transfers.withdrawCryptoFunds({
    network: "ethereum",
    ticker: "eth",
    address: "0xabc",
    amount: "1.25",
    clientTransferId: "aa97b177-9383-4934-8543-0f91a7a02839",
  });

  assert.deepEqual(requests.map(({ init }) => init.method), [
    ...Array(19).fill("POST"),
    "GET",
    ...Array(8).fill("POST"),
  ]);
  assert.deepEqual(requests.map(({ url }) => new URL(url).pathname), [
    "/v1/payments/addbank",
    "/v1/payments/addbank/cad",
    "/v1/account/create",
    "/v1/approvedAddresses/ethereum/request",
    "/v1/deposit/ethereum/newAddress",
    "/v1/account",
    "/v1/balances",
    "/v2/withdraw/ethereum/eth/feeEstimate",
    "/v1/notionalbalances/usd",
    "/v1/roles",
    "/v1/transactions",
    "/v1/account/list",
    "/v1/approvedAddresses/account/ethereum",
    "/v1/custodyaccountfees",
    "/v1/addresses/ethereum",
    "/v2/transfers",
    "/v1/payments/methods",
    "/v1/balances/staking",
    "/v1/staking/history",
    "/v1/staking/rates",
    "/v1/staking/rewards",
    "/v1/approvedAddresses/ethereum/remove",
    "/v1/account/rename",
    "/v1/oauth/revokeByToken",
    "/v1/staking/stake",
    "/v1/account/transfer/usd",
    "/v1/staking/unstake",
    "/v2/withdraw/ethereum/eth",
  ]);
  assert.deepEqual(requests.map(({ url }) => new URL(url).search), Array(28).fill(""));

  const expectedPayloads: (BoundaryRecord | undefined)[] = [
    {
      request: "/v1/payments/addbank",
      nonce: 1000,
      accountnumber: "123456789",
      routing: "021000021",
      type: "checking",
      name: "Codex Test",
      account: "primary",
    },
    {
      request: "/v1/payments/addbank/cad",
      nonce: 1001,
      swiftcode: "BOFMCAM2",
      accountNumber: "1234567",
      type: "checking",
      name: "Codex CAD Test",
      account: "primary",
    },
    {
      request: "/v1/account/create",
      nonce: 1002,
      name: "Codex Test Account",
      type: "exchange",
    },
    {
      request: "/v1/approvedAddresses/ethereum/request",
      nonce: 1003,
      address: "0xabc",
      label: "codex",
      account: "primary",
    },
    {
      request: "/v1/deposit/ethereum/newAddress",
      nonce: 1004,
      label: "codex",
      account: "primary",
    },
    { request: "/v1/account", nonce: 1005, account: "primary" },
    {
      request: "/v1/balances",
      nonce: 1006,
      account: "primary",
      showPendingBalances: false,
    },
    {
      request: "/v2/withdraw/ethereum/eth/feeEstimate",
      nonce: 1007,
      address: "0xabc",
      amount: "1",
      account: "primary",
    },
    { request: "/v1/notionalbalances/usd", nonce: 1008, account: "primary" },
    { request: "/v1/roles", nonce: 1009 },
    { request: "/v1/transactions", nonce: 1010, limit: 10 },
    { request: "/v1/account/list", nonce: 1011, limit_accounts: 10 },
    { request: "/v1/approvedAddresses/account/ethereum", nonce: 1012, account: "primary" },
    {
      request: "/v1/custodyaccountfees",
      nonce: 1013,
      limit_transfers: 10,
      account: "primary",
    },
    {
      request: "/v1/addresses/ethereum",
      nonce: 1014,
      timestamp: "1700000000000",
      account: "primary",
    },
    {
      request: "/v2/transfers",
      nonce: 1015,
      currency: "eth",
      network: "ethereum",
      limit_transfers: 10,
      account: "primary",
    },
    { request: "/v1/payments/methods", nonce: 1016, account: "primary" },
    { request: "/v1/balances/staking", nonce: 1017, account: "primary" },
    {
      request: "/v1/staking/history",
      nonce: 1018,
      account: "primary",
      since: "2026-01-01T00:00:00.000Z",
      limit: 10,
    },
    undefined,
    {
      request: "/v1/staking/rewards",
      nonce: 1019,
      account: "primary",
      since: "2026-01-01T00:00:00.000Z",
    },
    {
      request: "/v1/approvedAddresses/ethereum/remove",
      nonce: 1020,
      address: "0xabc",
      account: "primary",
    },
    {
      request: "/v1/account/rename",
      nonce: 1021,
      account: "primary",
      newName: "Codex Test Renamed",
      newAccount: "codex-test-renamed",
    },
    { request: "/v1/oauth/revokeByToken", nonce: 1022 },
    {
      request: "/v1/staking/stake",
      nonce: 1023,
      account: "primary",
      providerId: "provider-1",
      currency: "eth",
      amount: "0.1",
    },
    {
      request: "/v1/account/transfer/usd",
      nonce: 1024,
      sourceAccount: "primary",
      targetAccount: "secondary",
      amount: "1.00",
      clientTransferId: "aa97b177-9383-4934-8543-0f91a7a02838",
    },
    {
      request: "/v1/staking/unstake",
      nonce: 1025,
      account: "primary",
      providerId: "provider-1",
      currency: "eth",
      amount: "0.1",
    },
    {
      request: "/v2/withdraw/ethereum/eth",
      nonce: 1026,
      address: "0xabc",
      amount: "1.25",
      clientTransferId: "aa97b177-9383-4934-8543-0f91a7a02839",
    },
  ];
  for (const [index, expected] of expectedPayloads.entries()) {
    if (expected === undefined) {
      assert.equal(requests[index]?.url, "https://api.sandbox.gemini.com/v1/staking/rates");
      assert.deepEqual(requests[index]?.init.headers, { Accept: "application/json" });
      continue;
    }
    assert.deepEqual(payload(requests[index]!), expected);
    await assertSigned(requests[index]!);
  }
  sdk.close();
});

test("Clearing and Instant wrappers shape signed requests without using the network", async () => {
  const { sdk, requests } = testClient();

  await sdk.clearing.cancelClearingOrder({
    clearing_id: "CLEARING-123",
    account: "primary",
  });
  await sdk.clearing.confirmClearingOrder({
    clearing_id: "CLEARING-123",
    symbol: "btcusd",
    amount: "1",
    price: "100",
    side: "sell",
    account: "primary",
  });
  await sdk.clearing.createNewBrokerOrder({
    source_counterparty_id: "SOURCE-CP",
    target_counterparty_id: "TARGET-CP",
    symbol: "ethusd",
    amount: "1",
    expires_in_hrs: 1,
    price: "200",
    side: "sell",
    account: "primary",
  });
  await sdk.clearing.createNewClearingOrder({
    symbol: "btcusd",
    amount: "1",
    price: "100",
    side: "buy",
    counterparty_id: "COUNTERPARTY-1",
    expires_in_hrs: 24,
    account: "primary",
  });
  await sdk.instant.executeInstantOrder({
    symbol: "btcusd",
    side: "buy",
    quantity: "0.01505181",
    price: "6445.07",
    fee: "2.9900309233",
    quoteId: 1328,
    account: "primary",
  });
  await sdk.clearing.getClearingOrder({
    clearing_id: "CLEARING-123",
    account: "primary",
  });
  await sdk.instant.getInstantQuote({
    side: "buy",
    symbol: "btcusd",
    totalSpend: "100",
    account: "primary",
  });
  await sdk.clearing.listClearingBrokers({
    symbol: "btcusd",
    limit_orders: 10,
    account: "primary",
  });
  await sdk.clearing.listClearingOrders({
    symbol: "btcusd",
    counterparty: "COUNTERPARTY-1",
    limit_orders: 10,
    account: "primary",
  });
  await sdk.clearing.listClearingTrades({
    symbol: "btcusd",
    limit_per_account: 10,
    account: "primary",
  });

  assert.deepEqual(requests.map(({ init }) => init.method), Array(10).fill("POST"));
  assert.deepEqual(requests.map(({ url }) => new URL(url).pathname), [
    "/v1/clearing/cancel",
    "/v1/clearing/confirm",
    "/v1/clearing/broker/new",
    "/v1/clearing/new",
    "/v1/instant/execute",
    "/v1/clearing/status",
    "/v1/instant/quote",
    "/v1/clearing/broker/list",
    "/v1/clearing/list",
    "/v1/clearing/trades",
  ]);
  assert.deepEqual(requests.map(({ url }) => new URL(url).search), Array(10).fill(""));
  [
    {
      request: "/v1/clearing/cancel",
      nonce: 1000,
      clearing_id: "CLEARING-123",
      account: "primary",
    },
    {
      request: "/v1/clearing/confirm",
      nonce: 1001,
      clearing_id: "CLEARING-123",
      symbol: "btcusd",
      amount: "1",
      price: "100",
      side: "sell",
      account: "primary",
    },
    {
      request: "/v1/clearing/broker/new",
      nonce: 1002,
      source_counterparty_id: "SOURCE-CP",
      target_counterparty_id: "TARGET-CP",
      symbol: "ethusd",
      amount: "1",
      expires_in_hrs: 1,
      price: "200",
      side: "sell",
      account: "primary",
    },
    {
      request: "/v1/clearing/new",
      nonce: 1003,
      symbol: "btcusd",
      amount: "1",
      price: "100",
      side: "buy",
      counterparty_id: "COUNTERPARTY-1",
      expires_in_hrs: 24,
      account: "primary",
    },
    {
      request: "/v1/instant/execute",
      nonce: 1004,
      symbol: "btcusd",
      side: "buy",
      quantity: "0.01505181",
      price: "6445.07",
      fee: "2.9900309233",
      quoteId: 1328,
      account: "primary",
    },
    {
      request: "/v1/clearing/status",
      nonce: 1005,
      clearing_id: "CLEARING-123",
      account: "primary",
    },
    {
      request: "/v1/instant/quote",
      nonce: 1006,
      side: "buy",
      symbol: "btcusd",
      totalSpend: "100",
      account: "primary",
    },
    {
      request: "/v1/clearing/broker/list",
      nonce: 1007,
      symbol: "btcusd",
      limit_orders: 10,
      account: "primary",
    },
    {
      request: "/v1/clearing/list",
      nonce: 1008,
      symbol: "btcusd",
      counterparty: "COUNTERPARTY-1",
      limit_orders: 10,
      account: "primary",
    },
    {
      request: "/v1/clearing/trades",
      nonce: 1009,
      symbol: "btcusd",
      limit_per_account: 10,
      account: "primary",
    },
  ].forEach((expected, index) => assert.deepEqual(payload(requests[index]!), expected));
  for (const request of requests) await assertSigned(request);
  sdk.close();
});
