import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { packSdk } from "./pack-consumer-harness.mjs";

const temp = mkdtempSync(join(tmpdir(), "gemini-sdk-consumer-"));
try {
  const packed = packSdk(temp);
  const paths = new Set(packed.files.map(({ path }) => path));
  const generatedModules = ["trading", "margin", "perpetuals", "account", "staking", "transfers", "clearing", "instant"];
  for (const path of [
    "package.json",
    "README.md",
    "dist/browser/index.js",
    "dist/browser/index.d.ts",
    "dist/server/index.js",
    "dist/server/index.d.ts",
    "dist/observability/opentelemetry.js",
    "dist/observability/opentelemetry.d.ts",
    "dist/server/ws-factory.js",
    "dist/server/ws-factory.d.ts",
    "dist/websocket/session.js",
    "dist/websocket/session.d.ts",
    "dist/websocket/stream.js",
    "dist/websocket/stream.d.ts",
    "dist/websocket/public.js",
    "dist/websocket/public.d.ts",
    "dist/websocket/server.js",
    "dist/websocket/server.d.ts",
    "dist/websocket/auth.js",
    "dist/websocket/auth.d.ts",
    "dist/websocket/validation.js",
    "dist/websocket/validation.d.ts",
    "dist/websocket/types.d.ts",
    "dist/generated/websocket/index.d.ts",
    "dist/services/predictions.js",
    "dist/generated/rest.d.ts",
    "dist/generated/market-data/models.d.ts",
    "dist/generated/market-data/rest.js",
    "dist/generated/market-data/rest.d.ts",
    "dist/generated/market-data/operations.js",
    "dist/generated/market-data/operations.d.ts",
  ]) assert(paths.has(path), `package missing ${path}`);
  for (const path of [
    "dist/core/",
    "dist/browser-client.js",
    "dist/client-core.js",
    "dist/gemini-markets.js",
    "dist/prediction-markets.js",
  ]) assert([...paths].every((entry) => !entry.startsWith(path)), `package contains stale legacy path ${path}`);
  for (const moduleName of generatedModules) {
    for (const filename of ["rest.js", "rest.d.ts", "operations.js", "operations.d.ts"]) {
      assert(paths.has(`dist/generated/${moduleName}/${filename}`), `package missing generated ${moduleName}/${filename}`);
    }
  }
  assert([...paths].every((path) => !path.startsWith("src/") && !path.includes("test")), "package contains source or tests");

  writeFileSync(join(temp, "package.json"), `{"type":"module","dependencies":{"@gemini-markets/sdk":"file:./${packed.filename}","@opentelemetry/api":"^1.9.0"}}`);
  execFileSync("npm", ["install", "--ignore-scripts", "--no-package-lock", "--cache", join(temp, ".npm")], { cwd: temp, stdio: "inherit" });
  writeFileSync(join(temp, "consumer.mjs"), `
import { createClient, MARKET_DATA_OPERATIONS, MARGIN_OPERATIONS, TRADING_OPERATIONS, PERPETUALS_OPERATIONS, ACCOUNT_OPERATIONS, STAKING_OPERATIONS, TRANSFERS_OPERATIONS, CLEARING_OPERATIONS, INSTANT_OPERATIONS } from "@gemini-markets/sdk/browser";
import * as browserExports from "@gemini-markets/sdk/browser";
import { HmacAuth, createClient as createServerClient } from "@gemini-markets/sdk/server";
import { trace } from "@opentelemetry/api";
import { createOpenTelemetryHooks } from "@gemini-markets/sdk/opentelemetry";

let bareImportRejected = false;
try {
  await import("@gemini-markets/sdk");
} catch (error) {
  bareImportRejected = error?.code === "ERR_PACKAGE_PATH_NOT_EXPORTED";
}
if (!bareImportRejected) throw new Error("bare package import must require an explicit runtime entry point");

const client = await createClient({ env: "sandbox" });
if (!client.marketData || !client.trading || !client.margin || !client.perpetuals || !client.account || !client.staking || !client.transfers || !client.clearing || !client.instant || !client.predictions || !client.websocket) {
  throw new Error("missing client domain surfaces");
}
if (typeof client.marketData.getTicker !== "function" || typeof client.websocket.public.trades !== "function" || "private" in client.websocket) throw new Error("missing or unsafe client methods");
if (MARKET_DATA_OPERATIONS.getFundingAmountReportFile.responseMode !== "file" || TRADING_OPERATIONS.createNewOrder.path !== "/v1/order/new" || MARGIN_OPERATIONS.previewMarginOrder.path !== "/v1/margin/order/preview" || PERPETUALS_OPERATIONS.getFundingPaymentReportFile.responseMode !== "file" || ACCOUNT_OPERATIONS.getAvailableBalances.path !== "/v1/balances" || STAKING_OPERATIONS.listStakingRates.access !== "public" || TRANSFERS_OPERATIONS.withdrawCryptoFunds.path !== "/v2/withdraw/{network}/{ticker}" || CLEARING_OPERATIONS.createNewClearingOrder.path !== "/v1/clearing/new" || INSTANT_OPERATIONS.getInstantQuote.path !== "/v1/instant/quote") throw new Error("missing generated operation metadata");
for (const name of ["GeminiMarkets", "GeminiWebSocket", "WebSocketSession", "HttpTransport", "MarketDataRest", "TradingRest"]) {
  if (name in browserExports) throw new Error("browser entry exports internal implementation " + name);
}
const serverClient = await createServerClient({ env: "sandbox", skipWsInit: true, auth: new HmacAuth({ apiKey: "key", apiSecret: "secret" }) });
const telemetry = createOpenTelemetryHooks({ tracer: trace.getTracer("package-verifier") });
if (typeof telemetry.onDiagnostic !== "function" || typeof telemetry.shutdown !== "function") throw new Error("missing OpenTelemetry adapter");
telemetry.shutdown();
client.close();
serverClient.close();
`);
  execFileSync("node", ["consumer.mjs"], { cwd: temp, stdio: "inherit" });

  writeFileSync(join(temp, "consumer.ts"), `
import { createClient, type FetchLike, type LiveOrderBook, type SocketFactory, type SocketFactoryOptions, type SocketLike, type Trade, type WebSocketStream, type MarketDataOperationTypes, type TradingOperationTypes, type PerpetualsOperationTypes, type AccountOperationTypes, type StakingOperationTypes, type TransfersOperationTypes, type ClearingOperationTypes, type InstantOperationTypes } from "@gemini-markets/sdk/browser";
import { HmacAuth, createClient as createServerClient } from "@gemini-markets/sdk/server";
import { createOpenTelemetryHooks, type OpenTelemetryHooks } from "@gemini-markets/sdk/opentelemetry";

const client = await createClient({ env: "sandbox" });
const book: LiveOrderBook = client.orderBook("btcusd");
await client.marketData.getTicker({ symbol: "btcusd" });
await client.marketData.getTicker({ symbol: "btcusd" }, { timeoutMs: 1_000 });
await client.marketData.getCurrentOrderBook({ symbol: "btcusd", limit_bids: 1 });
await client.marketData.getAssetsForNetwork({ network: "ethereum" });
await client.marketData.getFundingAmountReportFile({ symbol: "BTCGUSDPERP" });
await client.trading.createNewOrder({ symbol: "btcusd", amount: "1", price: "100", side: "buy", type: "exchange limit" });
await client.trading.wrapOrder({ symbol: "btcusd", amount: "1", side: "buy" });
await client.margin.previewMarginOrder({ symbol: "btcusd", side: "buy", type: "limit", amount: "1", price: "100" });
await client.perpetuals.getRiskStats({ symbol: "BTCGUSDPERP" });
await client.account.getAccountDetail({});
await client.staking.listStakingRates();
await client.transfers.withdrawCryptoFunds({ network: "ethereum", ticker: "eth", address: "0xabc", amount: "1" });
await client.clearing.createNewClearingOrder({ symbol: "btcusd", amount: "1", price: "100", side: "buy", counterparty_id: "CP1", expires_in_hrs: 24 });
await client.instant.getInstantQuote({ side: "buy", symbol: "btcusd", totalSpend: "100" });
const trades: WebSocketStream<Trade> = client.websocket.public.trades("btcusd");
const fetchImpl: FetchLike = async () => {
  const bytes = new TextEncoder().encode("{}");
  let consumed = false;
  return {
    status: 200,
    body: {
      getReader: () => ({
        read: async () => {
          if (consumed) return { done: true };
          consumed = true;
          return { done: false, value: bytes };
        },
      }),
    },
  };
};
const socketFactory: SocketFactory = (_url: string, _options: SocketFactoryOptions): SocketLike => ({ addEventListener() {}, send() {}, close() {} });
for await (const trade of trades) { void trade; break; }
const serverClient = await createServerClient({ env: "sandbox", skipWsInit: true, auth: new HmacAuth({ apiKey: "key", apiSecret: "secret" }) });
const telemetry: OpenTelemetryHooks = createOpenTelemetryHooks();
telemetry.shutdown();
const tickerPath: MarketDataOperationTypes["getTicker"]["path"] = { symbol: "btcusd" };
const wrapPath: TradingOperationTypes["wrapOrder"]["path"] = { symbol: "btcusd" };
const riskPath: PerpetualsOperationTypes["getRiskStats"]["path"] = { symbol: "BTCGUSDPERP" };
const accountBody: AccountOperationTypes["getAvailableBalances"]["body"] = { account: "primary" };
const stakingBody: StakingOperationTypes["listStakingRates"]["body"] = undefined as never;
const withdrawPath: TransfersOperationTypes["withdrawCryptoFunds"]["path"] = { network: "ethereum", ticker: "eth" };
const clearingOrderBody: ClearingOperationTypes["createNewClearingOrder"]["body"] = { symbol: "btcusd", amount: "1", price: "100", side: "buy", counterparty_id: "CP1", expires_in_hrs: 24 };
const instantQuoteBody: InstantOperationTypes["getInstantQuote"]["body"] = { side: "buy", symbol: "btcusd", totalSpend: "100" };
void [book, fetchImpl, socketFactory, tickerPath, wrapPath, riskPath, accountBody, stakingBody, withdrawPath, clearingOrderBody, instantQuoteBody, serverClient, telemetry];
client.close();
serverClient.close();
`);
  writeFileSync(join(temp, "tsconfig.json"), '{"compilerOptions":{"module":"NodeNext","moduleResolution":"NodeNext","strict":true,"noEmit":true},"include":["consumer.ts"]}');
  execFileSync(join(process.cwd(), "node_modules", ".bin", "tsc"), ["-p", join(temp, "tsconfig.json")], { cwd: temp, stdio: "inherit" });

  writeFileSync(join(temp, "negative-server-imports.ts"), `
import { HmacAuth, OAuthAuth, serverSocketFactory, initServerWebSocket, type ServerClientOptions } from "@gemini-markets/sdk/browser";
import { createClient } from "@gemini-markets/sdk/browser";
const options: ServerClientOptions | undefined = undefined;
const client = await createClient({ env: "sandbox" });
void [HmacAuth, OAuthAuth, serverSocketFactory, initServerWebSocket, options, client];
`);
  writeFileSync(join(temp, "negative-private-namespace.ts"), `
import { createClient } from "@gemini-markets/sdk/browser";
const client = await createClient({ env: "sandbox" });
void client.websocket.private;
`);
  writeFileSync(join(temp, "tsconfig.negative.json"), '{"compilerOptions":{"module":"NodeNext","moduleResolution":"NodeNext","strict":true,"noEmit":true},"include":["negative-server-imports.ts"]}');
  let serverImportsPassed = false;
  try {
    execFileSync(join(process.cwd(), "node_modules", ".bin", "tsc"), ["-p", join(temp, "tsconfig.negative.json")], { cwd: temp, stdio: "pipe" });
    serverImportsPassed = true;
  } catch {
    // Expected: server-only capabilities must not be importable from browser.
  }
  assert(!serverImportsPassed, "server-only capabilities must not be importable from browser entry");
  writeFileSync(join(temp, "tsconfig.negative-private.json"), '{"compilerOptions":{"module":"NodeNext","moduleResolution":"NodeNext","strict":true,"noEmit":true},"include":["negative-private-namespace.ts"]}');
  let privateNamespacePassed = false;
  try {
    execFileSync(join(process.cwd(), "node_modules", ".bin", "tsc"), ["-p", join(temp, "tsconfig.negative-private.json")], { cwd: temp, stdio: "pipe" });
    privateNamespacePassed = true;
  } catch {
    // Expected: browser clients expose only the public WebSocket namespace.
  }
  assert(!privateNamespacePassed, "browser WebSocket types must not expose a private namespace");
  JSON.parse(readFileSync(join(temp, "node_modules", "@gemini-markets", "sdk", "package.json"), "utf8"));
  console.log(`verified ${packed.entryCount} packed entries in an isolated consumer`);
} finally {
  rmSync(temp, { recursive: true, force: true });
}
