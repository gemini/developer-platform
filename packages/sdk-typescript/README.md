# Gemini TypeScript SDK

```ts
// Server — HMAC authenticated
import { createClient, HmacAuth } from "gemini-markets/server";

const gemini = await createClient({
  env: "sandbox",
  timeoutMs: 30_000,
  maxRetries: 3,
  auth: new HmacAuth({
    apiKey: process.env.GEMINI_API_KEY!,
    apiSecret: process.env.GEMINI_API_SECRET!,
  }),
});

const events = await gemini.predictions.listEvents({ status: ["active"] });
const controller = new AbortController();
const symbols = await gemini.marketData.listSymbols({ signal: controller.signal });
const fundingReport = await gemini.marketData.getFundingAmountReportFile({ symbol: "BTCGUSDPERP" });
const book = gemini.orderBook("GEMI-PREDICTION-SYMBOL");
```

```ts
// Browser — public data, no config needed
import { createClient } from "gemini-markets/browser";

const gemini = createClient();
const ticker = await gemini.marketData.getTicker({ symbol: "BTCUSD" });
```

`GeminiMarkets` is the primary facade. Its service namespaces are
`predictions`, `marketData`, `trading`, `margin`, `perpetuals`,
`accountServices`, `clearingInstant`, and `websocket`.

Endpoint methods and response types are generated from the API specifications
and exposed through the package's type declarations and IDE completion. Set
`OAuthAuth({ env: "sandbox", ... })` when the facade uses `env: "sandbox"`.

Order placement checks the current Prediction Markets terms first. Call
`gemini.predictions.acceptTerms()` only after showing the terms to the user and
receiving explicit consent. OAuth uses the same `auth` option via `OAuthAuth`.
Market Data file responses return raw `bytes` plus response metadata; use
`contentType` to distinguish XLSX from CSV.

Only generated GET operations retry automatically, and only for transient
network failures or 429/502/503/504 responses. Mutating operations never retry.
Offset pagination is not snapshot-consistent while records are changing; use its
`maxItems` ceiling to bound a traversal, and provide `dedupeKey` when duplicate
records must fail loudly during a drifting traversal.

REST methods and WebSocket requests/streams accept an optional final
`RequestOptions` argument with `signal` and `timeoutMs`; stream `close()` waits
for the exchange unsubscribe acknowledgement.

WebSocket streams expose `state`, `lastError`, `malformedFrameCount`, and
`resubscribed`/`subscriptionError` events. Listener registration accepts
`{ signal }` for automatic removal. Public streams share one session and invoke
listeners synchronously, so callbacks should stay short; partial-depth streams
use isolated sessions by design.

Unit tests use injected transports and do not prove live API availability. Live
sandbox checks are separate, credentialed, and manual. Authenticated WebSocket
use requires a Node/server environment or a proxy because browser WebSocket
clients cannot set custom upgrade headers.

For applications that need an explicit REST liveness call, use the stopped
heartbeat handle:

```ts
const heartbeat = gemini.createHeartbeat({ intervalMs: 15_000 });
heartbeat.start();
// ...
heartbeat.stop();
```

There is no hidden heartbeat timer. WebSocket liveness checks are separately
opt-in through `webSocketLiveness`, and inbound frames are bounded by
`webSocketMaxMessageSizeBytes`. `LiveOrderBook.spread()` and `.mid()` return
floating-point values intended for display; do not use them for exact execution
decisions without decimal handling.

## Diagnostics and safe errors

Diagnostics are silent by default. Inject `onDiagnostic` to collect structured
events across REST, WebSocket, and order-book operations, or inject
`new ConsoleLogger({ minLevel: "debug" })` through `logger` for opt-in console
output:

```ts
import { ConsoleLogger } from "gemini-markets/server";
import { createClient } from "gemini-markets/server";

const gemini = await createClient({
  onDiagnostic: (event) => supportLogger.write(event),
  logger: new ConsoleLogger({ minLevel: "warn" }),
});
```

When constructing `OAuthAuth`, pass the same `onDiagnostic` callback and
`logger` there to include token exchange and refresh events in that same sink.

Events include safe response metadata such as the endpoint, method, local
correlation ID, exchange request ID, status, retry count, content type, and
allowlisted rate-limit headers. WebSocket events also identify `control`,
`stream`, `reconnect`, or `mutation` traffic. Frame bodies, request bodies,
credentials, signatures, tokens, and private response bodies are not included.

Use `serializeError(error)` for logs, telemetry, and evidence. It omits raw
error bodies by default while retaining stable `code`/`category`, response
metadata, and safe operation context. Raw bodies are available only through the
explicit debug option `serializeError(error, { includeRawBody: true })`; treat
that result as sensitive and never send it to a default logger or telemetry sink.
