# Gemini TypeScript SDK

The Gemini TypeScript SDK provides access to Gemini trading platforms. It supports **Spot Trading**, **Prediction Markets**, **Derivatives and Perpetuals**, **Margin**, **Staking**, and **Real-Time Market Data**.

[![npm version](https://img.shields.io/npm/v/@gemini-markets/sdk.svg)](https://www.npmjs.com/package/@gemini-markets/sdk)
[![License: Apache 2.0](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)
[![TypeScript: Strict](https://img.shields.io/badge/TypeScript-Strict-blue.svg)](https://www.typescriptlang.org/)
[![No Required Runtime Dependencies](https://img.shields.io/badge/Runtime%20Dependencies-None-green.svg)](https://www.npmjs.com/package/@gemini-markets/sdk)

---

## Supported Product Domains

| Domain | Namespace | Supported operations |
| :--- | :--- | :--- |
| **Prediction Markets** | `gemini.predictions` | List events and contracts. Place outcome orders. Stream combo RFQs. Iterate through positions. |
| **Spot and Order Entry** | `gemini.trading` | Create limit and market orders. Cancel session orders. List past trades. Manage heartbeat sessions. |
| **Market Data and L2 Books** | `gemini.marketData`, `gemini.websocket` | Stream trades, candles, and ticker data. Maintain local L2 order books. |
| **Derivatives and Perpetuals** | `gemini.perpetuals` | Trade perpetual contracts. Monitor funding rates. Download funding reports in XLSX or CSV format. |
| **Margin Trading** | `gemini.margin` | Read margin accounts, collateral, order previews, and interest rates. |
| **Account** | `gemini.account` | Read balances and account details. Manage roles, subaccounts, banking, deposit and approved addresses, and OAuth revocation. |
| **Transfers** | `gemini.transfers` | Withdraw funds, transfer between subaccounts, estimate gas fees, and review transfer, transaction, and custody-fee history. |
| **Staking** | `gemini.staking` | Read staking balances, yield rates, rewards, and event history. Stake and unstake assets. |
| **OTC Clearing** | `gemini.clearing` | Manage clearing orders, counterparties, brokers, and clearing trade history. |
| **Instant Execution** | `gemini.instant` | Request execution quotes and execute instant orders. |

---

## Installation

```bash
npm install @gemini-markets/sdk
```

Install `ws` when a Node.js application needs authenticated WebSockets with custom upgrade headers:
```bash
npm install ws
```

## Choose the Runtime Entry Point

Select the entry point for the environment that runs the code and stores the credentials:

| Use case | Import | Authentication | WebSockets |
| :--- | :--- | :--- | :--- |
| Backend, bot, or trusted service | `@gemini-markets/sdk/server` | HMAC API keys and OAuth. Confidential OAuth clients are supported. | Public and authenticated streams and request methods. |
| Browser or edge application | `@gemini-markets/sdk/browser` | Public-client OAuth PKCE for REST. | Public market-data streams only. |

The runtime entry point is intentionally explicit. Do not import from the bare `@gemini-markets/sdk` package; it is not exported. Always use `@gemini-markets/sdk/server` for trusted backend code or `@gemini-markets/sdk/browser` for browser and edge code. This prevents a runtime-ambiguous import from pulling server credential handling into a browser bundle.

Native browser WebSockets cannot send custom `Authorization` or HMAC headers during the upgrade. `BrowserOAuthAuth` can authenticate REST requests only. It cannot authenticate private WebSocket streams or WebSocket request methods. These operations fail before the SDK opens a socket. Use the server entry point or a server-side relay for private WebSocket access. The SDK does not provide an application cookie flow.

Always select `env: "sandbox"` or `env: "production"` explicitly. The SDK does not choose an environment for you, because omitting this choice for an order, transfer, or account operation would be unsafe. Keep HMAC secrets and OAuth confidential-client secrets on a server. Browser OAuth token stores must use application-controlled secure storage; do not put refresh tokens in `localStorage`.

If you provide a custom `fetch` adapter, the response body must provide a `getReader()` method. The SDK rejects responses that provide only `text()` or `arrayBuffer()`. This requirement keeps the response-size limits effective.

---

## Domain Examples

### 1. Initialize a Client

```ts
import { createClient, HmacAuth } from "@gemini-markets/sdk/server";

const gemini = await createClient({
  env: "sandbox", // "sandbox" for testnet, "production" for live trading
  auth: new HmacAuth({
    apiKey: process.env.GEMINI_API_KEY!,
    apiSecret: process.env.GEMINI_API_SECRET!,
  }),
});
```

For browser applications and Cloudflare Workers, import from `@gemini-markets/sdk/browser`. This entry point supports public data and OAuth PKCE REST requests.

The package is ESM-only. Node.js applications should use `import` or dynamic `import()`; this package does not provide a CommonJS `require()` entry point.

---

### 2. 🎯 Prediction Markets

List contracts, confirm terms, place outcome orders, and read positions:

```ts
// 1. List active prediction events
const events = await gemini.predictions.listEvents({ status: ["active"] });
console.log(`Active Events: ${events.data?.length ?? 0}`);

// 2. Confirm that the latest market terms are accepted
const terms = await gemini.predictions.getPredictionMarketsTermsStatus();
if (!terms.hasAcceptedLatest) {
  await gemini.predictions.acceptTerms();
}

// 3. Place a limit order for an event contract
const order = await gemini.predictions.placeOrder({
  symbol: "PRED-FED-RATE-CUT-2026",
  orderType: "limit",
  side: "buy",
  outcome: "yes",
  price: "0.65",
  quantity: "100",
  makerOrCancel: false,
});
console.log(`Placed prediction order ID: ${order.orderId ?? "(pending)"}`);

// 4. Iterate through all pages of open positions
for await (const pos of gemini.predictions.iteratePositions({ limit: 50 })) {
  console.log(`Position: ${pos.instrumentId} [${pos.outcome}] — Size: ${pos.totalQuantity}`);
}
```

---

### 3. Spot and Margin Order Management

Create spot and margin orders. Use session heartbeats. Cancel active orders.

```ts
// 1. Place a new spot limit order
const newOrder = await gemini.trading.createNewOrder({
  symbol: "BTCUSD",
  amount: "0.15",
  price: "64500.00",
  side: "buy",
  type: "exchange limit",
  client_order_id: `bot-${Date.now()}`,
});
console.log(`Order created: ${newOrder.order_id}`);

// 2. Preview margin leverage and collateral before you place an order
const marginPreview = await gemini.margin.previewMarginOrder({
  symbol: "ETHUSD",
  amount: "5.0",
  price: "2500.00",
  side: "buy",
  type: "limit",
});
console.log(
  `Collateral before/after: ${marginPreview.preorder.availableCollateral.value} → ` +
  `${marginPreview.postorder.availableCollateral.value}; leverage: ${marginPreview.postorder.leverage}`,
);

// 3. Start a session heartbeat
// The exchange cancels open session orders if the client disconnects
const heartbeat = gemini.createHeartbeat({ intervalMs: 10_000 });
heartbeat.start();

// 4. Cancel all active orders
await gemini.trading.cancelAllActiveOrders({});
```

---

### 4. Real-Time Market Data and L2 Order Book

Use WebSockets to receive market data. Use the order-book API to maintain a local L2 order book.

```ts
// 1. Receive public trades over WebSocket
const tradeStream = gemini.websocket.public.trades("BTCUSD");
tradeStream.on("message", (trade) => {
  console.log(`[Trade] ${trade.s} @ ${trade.p} (Qty: ${trade.q}, Maker: ${trade.m})`);
});

// 2. Maintain a local L2 order book
const book = gemini.orderBook("BTCUSD");

book.on("update", (lob, delta) => {
  console.log("Best Bid:", lob.bestBid());
  console.log("Best Ask:", lob.bestAsk());
  console.log("Exact Spread:", lob.spreadDecimal());
  console.log("Top 5 Bids:", lob.topN("bids", 5));
});

book.on("resync", () => {
  console.warn("The order book is requesting a new snapshot...");
});
```

---

### 5. Derivatives and Perpetual Swaps

Read derivative candles and download funding reports:

```ts
// 1. Get derivative price candles (1-minute timeframe)
const candles = await gemini.marketData.listDerivativeCandles({
  symbol: "BTCGUSDPERP",
  time_frame: "1m",
});
const [, , , , latestClose] = candles[0] ?? [];
console.log(`Latest Perp Candle Close: ${latestClose}`);

// 2. Download a funding report (XLSX or CSV)
const report = await gemini.marketData.getFundingAmountReportFile({
  symbol: "BTCGUSDPERP",
});

// report.bytes contains the report data as a Uint8Array
console.log(`Report received (${report.contentType}): ${report.bytes.length} bytes`);
```

---

### 6. Balances, Transfers, and Staking

Read balances. Transfer funds. Read staking rates and rewards.

```ts
// 1. Read available and notional balances
const balances = await gemini.account.getAvailableBalances({ account: "primary" });
for (const bal of balances) {
  console.log(`${bal.currency}: Available=${bal.amount}, AvailableForWithdrawal=${bal.available}`);
}

// 2. Read staking rates and rewards
const stakingRates = await gemini.staking.listStakingRates();
console.log(stakingRates);

// 3. Transfer funds between accounts
await gemini.transfers.transferBetweenAccounts({
  sourceAccount: "master",
  targetAccount: "trading-sub-01",
  currency: "USD",
  amount: "5000.00",
});
```

---

## Developer and Infrastructure Utilities

### Exact Decimal Math (`decimal`)
Use the `decimal` functions for exact decimal calculations. The functions do not require a third-party package:
```ts
import { decimal } from "@gemini-markets/sdk/server";

const cost = decimal.multiply("1.25", "64500.25");    // "80625.3125"
const spread = decimal.subtract("100.50", "100.25");  // "0.25"
const fee = decimal.multiply("5000", "0.0015");       // "7.5"
const isBelow = decimal.compare("64000", "64500");    // -1 (< 0)
```

### Resource Teardown (`using` / `await using`)
Use TC39 Explicit Resource Management to release sockets, intervals, and listeners:
```ts
{
  await using client = await createClient({ env: "sandbox", auth });
  const symbols = await client.marketData.listSymbols();
} // Automatically closed on scope exit
```

### Observability and Telemetry Hooks
Use the request and response callbacks to add logs, traces, and metrics:
```ts
const gemini = await createClient({
  env: "sandbox",
  auth,
  onRequest: (req) => logger.info(`[API] ${req.method} ${req.endpoint} (attempt ${req.attempt})`),
  onResponse: (res) => metrics.timing("gemini.api.latency", res.durationMs, { endpoint: res.endpoint }),
});
```

Treat `fetch`, `webSocketFactory`, `onRequest`, `onResponse`, loggers, and custom
OAuth endpoint configuration as trusted application code. These extension
points can observe request URLs, headers, bodies, tokens, or signed credentials;
do not install implementations from untrusted packages or send their data to
third-party telemetry without explicit redaction and approval.

---

## Runtime Compatibility

| Environment | Supported Entry | WebSocket Support | Notes |
| :--- | :---: | :---: | :--- |
| **Node.js 22.4+** | `@gemini-markets/sdk/server` | Native WebSocket and `ws` | Use for trading bots, backend servers, and HMAC authentication. |
| **Cloudflare Workers** | `@gemini-markets/sdk/browser` | Native WebSocket | Does not require Node.js built-ins. Runs on edge compute. |
| **Bun** | `@gemini-markets/sdk/server` | Native WebSocket and `ws` | Uses the Web Crypto API. |
| **Deno** | `@gemini-markets/sdk/server` | Native WebSocket and `ws` | Supports TypeScript and modern Web APIs. |
| **Browsers** | `@gemini-markets/sdk/browser` | Native WebSocket | Public WebSocket data and OAuth PKCE REST only; private WebSockets require a server or relay. |

---

## Safety and Security Guarantees

- **Request retries**: The SDK retries only idempotent `GET` requests after transient failures. The SDK does not retry order, transfer, or cancellation requests.
- **Integer safety**: The SDK parses 64-bit trade IDs, order IDs, and timestamps without floating-point conversion.
- **Log redaction**: Diagnostic logs and error messages do not include secrets, signatures, or private payloads.
- **Input limits**: The SDK limits REST response bodies, WebSocket messages, and pending order-book frames before it stores untrusted data.
- **Wire validation**: Order-book prices and quantities must use the strict decimal wire format. The SDK rejects malformed bids and asks before it stores or applies them.
- **Redirect protection**: REST and OAuth requests use manual redirect handling. The SDK rejects HTTP and opaque browser redirects before it reads the response body. OAuth callback validation checks the configured redirect components and state.
- **WebSocket authentication**: Server WebSocket connections use the configured authentication method. The SDK can refresh credentials after a reconnect. Browser entry points do not add browser OAuth credentials to native WebSocket upgrades.

Some REST methods return a `RestPromise`. Use `.withResponse()` to read the status and selected response metadata. This method does not send a second request:

```ts
const response = await gemini.predictions.acceptTerms().withResponse();
console.log(response.data, response.metadata.exchangeRequestId);
```

---

## Documentation and Specs

- 📖 **[Developer Documentation Portal](https://developer.gemini.com)**
- 🚀 **[SDK Quickstart & Deep Dives](https://developer.gemini.com/tools/typescript-sdk/quickstart)**
- 💡 **[SDK Patterns & Recipes](https://developer.gemini.com/tools/typescript-sdk/patterns)**
- 📋 **[OpenAPI & AsyncAPI Specifications](https://developer.gemini.com/api-specifications)**
- 🤖 **[LLM Machine Context (`/llms.txt`)](https://developer.gemini.com/llms.txt)**

---

## License

Apache-2.0 © Gemini Space Station, Inc.
