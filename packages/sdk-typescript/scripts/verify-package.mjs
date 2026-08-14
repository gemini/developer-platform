import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const moduleRequire = createRequire(import.meta.url);
const tscPath = moduleRequire.resolve("typescript/bin/tsc");
const temp = mkdtempSync(join(tmpdir(), "gemini-sdk-consumer-"));
try {
  const packed = JSON.parse(execFileSync("npm", ["pack", "--json", "--pack-destination", temp, "--cache", join(temp, ".npm")], { encoding: "utf8" }))[0];
  const paths = new Set(packed.files.map(({ path }) => path));
  const generatedModules = [
    "trading",
    "margin",
    "perpetuals",
    "account-services",
    "clearing-instant",
  ];
  for (const path of [
    "package.json",
    "README.md",
    "dist/browser/index.js",
    "dist/browser/index.d.ts",
    "dist/server/index.js",
    "dist/server/index.d.ts",
    "dist/server/ws-factory.js",
    "dist/server/ws-factory.d.ts",
    "dist/websocket.js",
    "dist/websocket.d.ts",
    "dist/ws-session.js",
    "dist/ws-session.d.ts",
    "dist/websocket-types.d.ts",
    "dist/generated/websocket/index.d.ts",
    "dist/prediction-markets.js",
    "dist/generated/rest.d.ts",
    "dist/generated/market-data/models.d.ts",
    "dist/generated/market-data/rest.js",
    "dist/generated/market-data/rest.d.ts",
    "dist/generated/market-data/operations.js",
    "dist/generated/market-data/operations.d.ts",
  ]) assert(paths.has(path), `package missing ${path}`);
  for (const moduleName of generatedModules) {
    for (const filename of ["rest.js", "rest.d.ts", "operations.js", "operations.d.ts"]) {
      const path = `dist/generated/${moduleName}/${filename}`;
      assert(paths.has(path), `package missing ${path}`);
    }
  }
  assert([...paths].every((path) => !path.startsWith("src/") && !path.includes("test")), "package contains source or tests");

  writeFileSync(join(temp, "package.json"), '{"type":"module","dependencies":{"@gemini-markets/sdk":"file:./' + packed.filename + '"}}');
  execFileSync("npm", ["install", "--ignore-scripts", "--no-package-lock", "--cache", join(temp, ".npm")], { cwd: temp, stdio: "inherit" });
  writeFileSync(join(temp, "consumer.mjs"), `
import {
  GeminiMarkets,
  GeminiWebSocket,
  WsSession,
  MarketDataClient,
  MarketDataRest,
  TradingClient,
  TradingRest,
  MarginClient,
  MarginRest,
  PerpetualsClient,
  PerpetualsRest,
  AccountServicesClient,
  AccountServicesRest,
  ClearingInstantClient,
  ClearingInstantRest,
  MARKET_DATA_OPERATIONS,
  MARGIN_OPERATIONS,
  TRADING_OPERATIONS,
  PERPETUALS_OPERATIONS,
  ACCOUNT_SERVICES_OPERATIONS,
  CLEARING_INSTANT_OPERATIONS,
} from "@gemini-markets/sdk/browser";

import {
  HmacAuth,
  createClient,
} from "@gemini-markets/sdk/server";

const sdk = new GeminiMarkets({ env: "sandbox" });
const websocket = new GeminiWebSocket({ url: "wss://example.test" });
const session = new WsSession({ url: "wss://example.test" });
if (
  !sdk.predictions ||
  !sdk.marketData ||
  !sdk.trading ||
  !sdk.margin ||
  !sdk.perpetuals ||
  !sdk.accountServices ||
  !sdk.clearingInstant ||
  !sdk.websocket ||
  typeof sdk.orderBook !== "function" ||
  typeof sdk.websocket.trades !== "function" ||
  typeof sdk.websocket.ping !== "function" ||
  MarketDataClient !== MarketDataRest ||
  TradingClient !== TradingRest ||
  MarginClient !== MarginRest ||
  PerpetualsClient !== PerpetualsRest ||
  AccountServicesClient !== AccountServicesRest ||
  ClearingInstantClient !== ClearingInstantRest ||
  MARKET_DATA_OPERATIONS.getFundingAmountReportFile.responseMode !== "file" ||
  TRADING_OPERATIONS.createNewOrder.path !== "/v1/order/new" ||
  MARGIN_OPERATIONS.previewMarginOrder.path !== "/v1/margin/order/preview" ||
  PERPETUALS_OPERATIONS.getFundingPaymentReportFile.responseMode !== "file" ||
  ACCOUNT_SERVICES_OPERATIONS.listStakingRates.access !== "public" ||
  CLEARING_INSTANT_OPERATIONS.createNewClearingOrder.path !== "/v1/clearing/new" ||
  CLEARING_INSTANT_OPERATIONS.getInstantQuote.path !== "/v1/instant/quote"
) throw new Error("missing package exports");
if (typeof HmacAuth !== "function" || typeof createClient !== "function") throw new Error("missing server exports");
const serverClient = await createClient({ env: "sandbox" });
serverClient.close();
sdk.close();
websocket.close();
session.close();
`);
  execFileSync("node", ["consumer.mjs"], { cwd: temp, stdio: "inherit" });
  writeFileSync(join(temp, "consumer.ts"), `
import {
  ACCOUNT_SERVICES_OPERATIONS,
  CLEARING_INSTANT_OPERATIONS,
  GeminiWebSocket,
  GeminiMarkets,
  MARKET_DATA_OPERATIONS,
  MARGIN_OPERATIONS,
  PERPETUALS_OPERATIONS,
  TRADING_OPERATIONS,
  WsSession,
  type BalanceUpdate,
  type BookTicker,
  type ContractStatus,
  type DepthUpdate,
  type GeminiWebSocketOptions,
  type LiveOrderBook,
  type OrderActionResponse,
  type OrderBookSnapshot,
  type OrderUpdate,
  type PositionReport,
  type RfqPrivateDelivery,
  type RfqPublicEvent,
  type RfqSubmitQuoteParams,
  type RfqSubmitQuoteResponse,
  type SuccessResponse,
  type Trade,
  type AccountServicesOperationTypes,
  type ClearingInstantOperationTypes,
  type MarketDataOperationTypes,
  type MarginOperationTypes,
  type PerpetualsOperationTypes,
  type TradingOperationTypes,
  type WebSocketStream,
  type WsSessionOptions,
  type WsSubscription,
} from "@gemini-markets/sdk/browser";

import {
  HmacAuth,
  createClient,
} from "@gemini-markets/sdk/server";

const sdk = new GeminiMarkets({
  env: "sandbox",
  auth: new HmacAuth({ apiKey: "key", apiSecret: "secret" }),
});
const book: LiveOrderBook = sdk.orderBook("btcusd");
sdk.predictions.listEvents();
sdk.predictions.getPositions();
sdk.marketData.getTicker({ symbol: "btcusd" });
sdk.marketData.getCurrentOrderBook({ symbol: "btcusd" }, { limit_bids: 1 });
sdk.marketData.getAssetsForNetwork({ network: "ethereum" });
sdk.marketData.getFundingAmountReportFile({ symbol: "BTCGUSDPERP" }).then((file) => {
  const contentType: string | undefined = file.contentType;
  const firstByte: number | undefined = file.bytes[0];
  void contentType;
  void firstByte;
});
sdk.trading.createNewOrder({
  symbol: "btcusd",
  amount: "1",
  price: "100",
  side: "buy",
  type: "exchange limit",
});
sdk.trading.wrapOrder({
  path: { symbol: "btcusd" },
  body: { amount: "1" },
});
sdk.margin.previewMarginOrder({
  symbol: "btcusd",
  side: "buy",
  type: "limit",
  amount: "1",
  price: "100",
});
sdk.perpetuals.getRiskStats({ symbol: "BTCGUSDPERP" });
sdk.perpetuals.getFundingPaymentReportFile({
  query: { fromDate: "2026-01-01", numRows: 1 },
  body: { account: "primary" },
});
sdk.accountServices.listStakingRates();
sdk.accountServices.withdrawCryptoFunds({
  path: { network: "ethereum", ticker: "eth" },
  body: { address: "0xabc", amount: "1" },
});
sdk.clearingInstant.createNewClearingOrder({
  symbol: "btcusd",
  amount: "1",
  price: "100",
  side: "buy",
});
sdk.clearingInstant.getInstantQuote({
  side: "buy",
  symbol: "btcusd",
  totalSpend: "100",
});
const trades: WebSocketStream<Trade> = sdk.websocket.trades("btcusd");
const ticker: WebSocketStream<BookTicker> = sdk.websocket.bookTicker("btcusd");
const depthUpdates: WebSocketStream<DepthUpdate> = sdk.websocket.depthUpdates("btcusd");
const depth: WebSocketStream<OrderBookSnapshot> = sdk.websocket.depth("btcusd", { levels: 20 });
const contractStatus: WebSocketStream<ContractStatus> = sdk.websocket.contractStatus();
const rfqs: WebSocketStream<RfqPublicEvent> = sdk.websocket.rfqs();
const orders: WebSocketStream<OrderUpdate> = sdk.websocket.orders({ scope: "session" });
const balances: WebSocketStream<BalanceUpdate> = sdk.websocket.balances();
const positions: WebSocketStream<PositionReport> = sdk.websocket.positions();
const deliveries: WebSocketStream<RfqPrivateDelivery> = sdk.websocket.rfqDeliveries({ scope: "account" });

const ping: Promise<SuccessResponse> = sdk.websocket.ping();
const time: Promise<SuccessResponse> = sdk.websocket.time();
const conninfo: Promise<SuccessResponse> = sdk.websocket.conninfo();
const placed: Promise<OrderActionResponse> = sdk.websocket.placeOrder({
  symbol: "btcusd",
  side: "BUY",
  type: "LIMIT",
  timeInForce: "GTC",
  quantity: "1",
  price: "100",
});
const quoteParams: RfqSubmitQuoteParams = { rfqId: "rfq-1", price: "100", quantity: "1" };
const quote: Promise<RfqSubmitQuoteResponse> = sdk.websocket.rfq.submitQuote(quoteParams);

const websocketOptions: GeminiWebSocketOptions = { url: "wss://example.test" };
const directWebSocket = new GeminiWebSocket(websocketOptions);
const sessionOptions: WsSessionOptions = { url: "wss://example.test" };
const directSession = new WsSession(sessionOptions);
const subscription: WsSubscription = directSession.subscribe(["btcusd@trade"]);
void [book, trades, ticker, depthUpdates, depth, contractStatus, rfqs, orders, balances, positions, deliveries, ping, time, conninfo, placed, quote, directWebSocket, directSession, subscription];
const serverClient: Promise<GeminiMarkets> = createClient({ env: "sandbox" });
void serverClient;

const tickerPath: MarketDataOperationTypes["getTicker"]["path"] = { symbol: "btcusd" };
const reportQuery: MarketDataOperationTypes["getFundingAmountReportFile"]["query"] = { symbol: "BTCGUSDPERP", numRows: 1 };
const wrapPath: TradingOperationTypes["wrapOrder"]["path"] = { symbol: "btcusd" };
const riskPath: PerpetualsOperationTypes["getRiskStats"]["path"] = { symbol: "BTCGUSDPERP" };
const withdrawPath: AccountServicesOperationTypes["withdrawCryptoFunds"]["path"] = { network: "ethereum", ticker: "eth" };
const instantQuoteBody: ClearingInstantOperationTypes["getInstantQuote"]["body"] = {
  side: "buy",
  symbol: "btcusd",
  totalSpend: "100",
};
type TransportFieldKeys = "request" | "nonce";
type AssertNoTransportFields<T> = Extract<TransportFieldKeys, keyof T> extends never ? true : never;
const callerBodyTypesStripTransportFields: [
  AssertNoTransportFields<TradingOperationTypes["createNewOrder"]["body"]>,
  AssertNoTransportFields<MarginOperationTypes["previewMarginOrder"]["body"]>,
  AssertNoTransportFields<PerpetualsOperationTypes["getFundingPaymentReportFile"]["body"]>,
  AssertNoTransportFields<ClearingInstantOperationTypes["createNewClearingOrder"]["body"]>,
  AssertNoTransportFields<ClearingInstantOperationTypes["getInstantQuote"]["body"]>,
] = [true, true, true, true, true];
void callerBodyTypesStripTransportFields;
if (
  MARKET_DATA_OPERATIONS.getTicker.path !== "/v1/pubticker/{symbol}" ||
  MARKET_DATA_OPERATIONS.getFundingAmountReportFile.responseMode !== "file" ||
  TRADING_OPERATIONS.createNewOrder.method !== "post" ||
  MARGIN_OPERATIONS.previewMarginOrder.method !== "post" ||
  PERPETUALS_OPERATIONS.getRiskStats.access !== "public" ||
  ACCOUNT_SERVICES_OPERATIONS.listStakingRates.access !== "public" ||
  CLEARING_INSTANT_OPERATIONS.createNewClearingOrder.path !== "/v1/clearing/new" ||
  CLEARING_INSTANT_OPERATIONS.getInstantQuote.path !== "/v1/instant/quote" ||
  tickerPath.symbol !== "btcusd" ||
  reportQuery.symbol !== "BTCGUSDPERP" ||
  wrapPath.symbol !== "btcusd" ||
  riskPath.symbol !== "BTCGUSDPERP" ||
  withdrawPath.ticker !== "eth" ||
  instantQuoteBody.totalSpend !== "100" ||
  !ticker.ready
) throw new Error("missing generated REST contracts");
`);
  writeFileSync(join(temp, "tsconfig.json"), '{"compilerOptions":{"module":"NodeNext","moduleResolution":"NodeNext","strict":true,"noEmit":true},"include":["consumer.ts"]}');
  execFileSync(process.execPath, [tscPath, "-p", join(temp, "tsconfig.json")], { cwd: temp, stdio: "inherit" });

  // Negative type test: HmacAuth must NOT be importable from the browser entry point.
  writeFileSync(join(temp, "negative.ts"), `import { HmacAuth } from "@gemini-markets/sdk/browser";\nvoid HmacAuth;\n`);
  writeFileSync(join(temp, "tsconfig.negative.json"), '{"compilerOptions":{"module":"NodeNext","moduleResolution":"NodeNext","strict":true,"noEmit":true},"include":["negative.ts"]}');
  let negativePassed = false;
  try {
    execFileSync(process.execPath, [tscPath, "-p", join(temp, "tsconfig.negative.json")], { cwd: temp, stdio: "pipe" });
    negativePassed = true;
  } catch {
    // Expected: tsc should fail because HmacAuth is not exported from browser
  }
  assert(!negativePassed, "HmacAuth must not be importable from @gemini-markets/sdk/browser");

  JSON.parse(readFileSync(join(temp, "node_modules", "@gemini-markets", "sdk", "package.json"), "utf8"));
  console.log(`verified ${packed.entryCount} packed entries in an isolated consumer`);
} finally {
  rmSync(temp, { recursive: true, force: true });
}
