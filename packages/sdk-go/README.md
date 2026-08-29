# Gemini Go SDK

Official Go library for the Gemini Exchange REST and WebSocket APIs.

[![Go Version](https://img.shields.io/badge/go-1.23%2B-blue.svg)](https://golang.org)
[![Dependencies](https://img.shields.io/badge/core%20dependencies-zero-brightgreen.svg)](#installation)
[![License](https://img.shields.io/badge/license-Apache%202.0-blue.svg)](https://www.apache.org/licenses/LICENSE-2.0)

---

## Features

- **Zero Core Dependencies**: The REST, authentication, decimal, and order-book packages use only the Go standard library. The optional Gorilla adapter is a separate module.
- **Predictable Concurrency**: Authenticated requests are nonce-serialized, WebSocket feeds apply backpressure, and order-book updates are atomic.
- **Accurate Financial Math**: Fixed-precision decimal arithmetic without floating-point errors.
- **Safe Retries**: Automatic backoff for idempotent requests with `Retry-After` header support.
- **Self-Healing WebSockets**: Automatic reconnection with exponential backoff and feed resumption.
- **Smart Quote Reconciler**: Preserves queue priority and minimizes exchange round-trips.
- **Secret Redaction**: Credentials never leak in `fmt.Printf`, `%#v`, `slog`, or JSON output.

---

## Performance Benchmarks

Benchmark numbers depend on the Go version, compiler, CPU, operating system,
and workload. Run the suite on the target environment instead of relying on
fixed measurements in documentation:

```bash
go test -bench=. -benchmem ./...
```

The repository includes benchmarks for authentication, transport, decimal
arithmetic, WebSocket dispatch, and order-book operations.

---

## Installation

Install the core library:

```bash
go get github.com/gemini/developer-platform/packages/sdk-go
```

Optional: Install the Gorilla WebSocket adapter:

```bash
go get github.com/gemini/developer-platform/packages/sdk-go/websocket/gorilla
```

This repository is a monorepo, but `packages/sdk-go` is the published Go module
root. The `release-smoke` target stages the package as a standalone module and
compiles the documented import paths, generated packages, service facade, demo,
and optional Gorilla module.

## Releases

Go modules are published from Git tags; there is no package upload step. The
canonical module roots are:

- `packages/sdk-go` → `github.com/gemini/developer-platform/packages/sdk-go`
- `packages/sdk-go/websocket/gorilla` → `github.com/gemini/developer-platform/packages/sdk-go/websocket/gorilla`

The `scripts` and `cmd/demo` directories are repository-only modules and are
not released independently. Because these modules live below the repository
root, their Git tags must include the directory prefix required by Go's module
versioning rules. Consumers still use ordinary semantic versions:

```bash
go get github.com/gemini/developer-platform/packages/sdk-go@v0.1.0
go get github.com/gemini/developer-platform/packages/sdk-go/websocket/gorilla@v0.1.0
```

After the release commit has been merged to `main`, a maintainer should create
signed, annotated tags on that commit and push only the module(s) being
released. The core module must be released before the Gorilla module when both
are being released, because the Gorilla module depends on the core module:

```bash
git fetch origin main
release_commit="$(git rev-parse origin/main)"

git tag -s packages/sdk-go/v0.1.0 \
  -m "sdk-go v0.1.0" "$release_commit"
git verify-tag packages/sdk-go/v0.1.0
git push origin packages/sdk-go/v0.1.0
```

After the core module's release workflow succeeds, release the optional
Gorilla module if it changed:

```bash
git tag -s packages/sdk-go/websocket/gorilla/v0.1.0 \
  -m "sdk-go/websocket/gorilla v0.1.0" "$release_commit"
git verify-tag packages/sdk-go/websocket/gorilla/v0.1.0
git push origin packages/sdk-go/websocket/gorilla/v0.1.0
```

The [Go SDK release workflow](../../.github/workflows/release-go-sdk.yml)
accepts only new, signed annotated, v0/v1, and on-`main` tags. It runs the
complete test, race, vet, generation, standalone-consumer, and security
suites, and then verifies that the tagged module is available through
`proxy.golang.org`. Release tag rules in GitHub should also prevent tag
deletion or updates. Never move or reuse a published version tag; publish a
new semantic version for every release. A GitHub Release is optional and is
only for human-readable notes—the Git tag is the canonical Go release
artifact.

Before the first release, repository administrators must protect both
`packages/sdk-go/v*` and `packages/sdk-go/websocket/gorilla/v*` tag patterns:
restrict tag creation to release maintainers and disallow updates and
deletion. The workflow has read-only GitHub permissions and never creates or
moves release tags.

If a future major version requires `v2` or later, the module path must first
gain the corresponding `/v2` suffix and the release workflow and tag path must
be updated together, as required by Go's major-version module rules.

To verify a release from the same public path used by consumers:

```bash
GOPROXY=https://proxy.golang.org \
  go list -m github.com/gemini/developer-platform/packages/sdk-go@v0.1.0
GOPROXY=https://proxy.golang.org \
  go list -m github.com/gemini/developer-platform/packages/sdk-go/websocket/gorilla@v0.1.0
```

See Go's [module source management](https://go.dev/doc/modules/managing-source)
and [module publishing guide](https://go.dev/doc/modules/publishing) for the
underlying tag and proxy behavior.

Use `Production` or `Sandbox` explicitly when selecting an environment. For
applications that must reject invalid configuration during startup, use the
error-returning constructor:

```go
client, err := gemini.NewClientWithError(
    gemini.WithEnvironment(gemini.Sandbox),
)
if err != nil {
    log.Fatal(err)
}
defer client.Close()
```

Custom REST endpoints must use `https`; custom WebSocket endpoints must use the
`wss` scheme. Endpoints may include a path prefix but cannot include userinfo,
a query string, or a fragment. `NewClientWithError` validates both before
returning a client. The low-level HTTP transport also rejects every non-HTTPS
request, including public requests; use a TLS test server or in-memory
`RoundTripper` for isolated tests.

---

## Authentication

The library supports two authentication modes.

### 1. API Keys (HMAC-SHA384)

```go
client := gemini.NewClient(
    gemini.WithAPIKey("your-api-key", "your-api-secret"),
)
```

For startup validation, `NewClientWithError` rejects blank API keys or secrets
with `gemini.ErrInvalidHMACCredentials`.

### 2. OAuth 2.0 Bearer Tokens

Static token:

```go
client := gemini.NewClient(
    gemini.WithBearerToken("oauth-access-token"),
)
```

Dynamic token refresh with a `TokenSource`:

```go
tokenSource := auth.TokenFunc(func(ctx context.Context) (string, error) {
    return tokenManager.GetValidToken(ctx)
})

client := gemini.NewClient(
    gemini.WithTokenSource(tokenSource),
)
```

The token source is application-owned. It must be safe for concurrent calls,
honor the request context, and return a current non-expired access token. The
SDK calls it for each authenticated HTTP attempt and each WebSocket connection
or reconnect; it does not force-refresh after a `401` response. The optional
`github.com/gemini/developer-platform/packages/sdk-go/oauth` package provides PKCE authorization-code
and refresh-token helpers without making interactive login part of the core
client.

The OAuth package keeps token persistence application-owned. Its
`Config.Login` convenience uses a fixed loopback callback such as
`http://localhost:8787/callback`; that is the only HTTP URL permitted by the
package. Authorization and token endpoints must use HTTPS. Applications that
already have their own browser flow can use `Config.AuthCodeURL` and
`Config.Exchange` directly, then pass the result to `oauth.NewTokenSource`:

```go
oauthConfig := oauth.Config{
    ClientID: os.Getenv("GEMINI_OAUTH_CLIENT_ID"),
    Endpoint: oauth.Endpoint{
        AuthURL:  "https://exchange.gemini.com/auth",
        TokenURL: "https://exchange.gemini.com/auth/token",
    },
    RedirectURL: "http://localhost:8787/callback",
    Scopes:     []string{"account:read", "orders:create"},
}

token, err := oauthConfig.Login(ctx, openBrowser)
if err != nil {
    log.Fatal(err)
}
source, err := oauth.NewTokenSource(oauthConfig, *token)
if err != nil {
    log.Fatal(err)
}
client := gemini.NewClient(gemini.WithTokenSource(source))
```

`oauth.Source` refreshes once for concurrent callers, honors cancellation
while waiting for another refresh, and preserves a refresh token when the
provider omits it from a rotation response. It does not write credentials to
disk or a keychain; callers may load and persist tokens through their own
secure storage.
If a token source fails during an automatic WebSocket reconnect, the SDK stops
that reconnect loop, reports the underlying error through connection events,
and leaves the client disconnected so the source can be repaired before a
caller explicitly reconnects.

For applications that need startup validation, `NewClientWithError` rejects a
nil or empty bearer configuration with `gemini.ErrInvalidTokenSource`.

For private REST calls, the SDK encodes the request path and endpoint
parameters in Gemini's `X-GEMINI-PAYLOAD` header and sends no request body, as
required by Gemini OAuth. Callers only provide the generated request model.
Private REST methods fail locally with `gemini.ErrAuthenticationRequired` when
the client has no authentication strategy; no unauthenticated private request
is sent to the network.

To revoke the active OAuth token, configure bearer authentication and call
`client.Account.RevokeOAuthToken(ctx)`. The endpoint revokes the token used by
that request; it is not available through API-key authentication.

OAuth tokens can also authenticate private WebSocket streams and RFQ quote
methods. Gemini enforces the token's account capabilities server-side, so the
token must be authorized for the requested feed or operation.

### OAuth Sandbox Integration Test

An opt-in integration test validates one bearer REST request and one private
WebSocket handshake against the selected Gemini environment. It is skipped
when no token is supplied and never runs as part of the default test target:

```bash
cd websocket/gorilla && \
GEMINI_OAUTH_ACCESS_TOKEN="..." \
GEMINI_OAUTH_ENVIRONMENT=sandbox \
go test -tags=integration ./...
```

### Local OAuth and RFQ Demo

The live demo uses the Markets CLI's public OAuth client ID by default, opens
the production consent page, and keeps the resulting tokens in memory only:

```bash
cd cmd/demo
GEMINI_DEMO_OAUTH_LOGIN=1 go run .
```

To arm one live RFQ quote submission, also provide an explicit confirmation and
the quote parameters. The demo submits at most one quote, and only for an open
RFQ observed during its bounded window:

```bash
GEMINI_DEMO_OAUTH_LOGIN=1 \
GEMINI_DEMO_RFQ_SUBMIT=1 \
GEMINI_DEMO_RFQ_CONFIRM=I_UNDERSTAND_THIS_SUBMITS_A_LIVE_RFQ_QUOTE \
GEMINI_DEMO_RFQ_PRICE="0.55" \
GEMINI_DEMO_RFQ_QUANTITY="100" \
go run .
```

Use `GEMINI_OAUTH_CLIENT_ID` to override the default client ID and
`GEMINI_OAUTH_CLIENT_SECRET` only when the OAuth application requires one.
The loopback callback is HTTP on localhost by OAuth convention; all Gemini
authorization and token endpoints remain HTTPS.

### 3. Webhook Signature Verification

Verify incoming Gemini HMAC-SHA384 webhook signatures in constant time:

```go
isValid := gemini.VerifySignature(secret, b64Payload, signatureHeader)
if !isValid {
    http.Error(w, "invalid signature", http.StatusUnauthorized)
    return
}
```

---

## Quick Start

### Fetch Market Ticker

```go
package main

import (
	"context"
	"fmt"
	"log"

	"github.com/gemini/developer-platform/packages/sdk-go"
)

func main() {
	client := gemini.NewClient()
	ctx := context.Background()

	ticker, err := client.MarketData.GetTicker(ctx, "BTCUSD")
	if err != nil {
		log.Fatalf("failed to fetch ticker: %v", err)
	}

	fmt.Printf("BTC/USD Bid: %s, Ask: %s, Last: %s\n", gemini.Val(ticker.Bid), gemini.Val(ticker.Ask), gemini.Val(ticker.Last))
}
```

---

### Place Orders

Place maker post-only or limit orders with exact decimals:

```go
amount := gemini.MustDecimal("0.05")
price := gemini.MustDecimal("65000.00")

// Guaranteed Maker (Post-Only)
order, err := client.Trading.PostOnlyBid(ctx, "BTCUSD", amount, price)

// Standard Limit Buy
order, err := client.Trading.LimitBuy(ctx, "BTCUSD", amount, price)

// Immediate-or-Cancel Sell
order, err := client.Trading.ImmediateOrCancelSell(ctx, "BTCUSD", amount, price)
```

---

### Account Management, Staking, and Transfers

```go
// Import the generated request models used by typed service methods:
// "github.com/gemini/developer-platform/packages/sdk-go/generated/account"

// 1. Account balances and subaccounts
balances, err := client.Account.GetBalances(ctx, &account.GetAvailableBalancesJSONBody{Account: "primary"})
accounts, err := client.Account.ListAccounts(ctx, nil)

// 2. Staking lifecycle (provider ID is required by the API)
stkBalances, err := client.Staking.GetStakingBalances(ctx, nil)
stakeTx, err := client.Staking.Stake(ctx, &account.StakeCryptoFundsJSONBody{ProviderId: "provider-id", Currency: "ETH", Amount: "1.5"})
unstakeRes, err := client.Staking.Unstake(ctx, &account.UnstakeCryptoFundsJSONBody{ProviderId: "provider-id", Currency: "ETH", Amount: "0.5"})

// 3. Multichain transfers and fee estimates
feeEst, err := client.Transfers.GetWithdrawalFeeEstimateV2(ctx, "solana", "sol", "address", "10.0")
withdrawRes, err := client.Transfers.WithdrawCryptoV2(ctx, "solana", "sol", "address", "10.0")
// Pass a generated *account.ListPastTransfersJSONBody for typed filters;
// nil requests the endpoint defaults.
pastTransfers, err := client.Transfers.GetTransfers(ctx, nil)
```

---

### Declarative Quote Reconciler

Synchronize a market-making ladder. The reconciler diffs your desired orders against open orders, keeps matching orders in the exchange queue, and sends only required cancels and new orders:

```go
// Create reconciler with a 0.5 bps tolerance band
reconciler := client.NewQuoteReconciler("BTCUSD",
    gemini.WithToleranceBps(0.5),
    gemini.WithQuantization(gemini.MustDecimal("0.01"), gemini.MustDecimal("0.0001")),
)

// StartStreaming subscribes before the initial REST hydration and replays
// order events received during that handoff.
errChan, err := reconciler.StartStreaming(ctx)
if err != nil {
    log.Fatalf("stream error: %v", err)
}

// Define target quotes and sync
mid := gemini.MustDecimal("65000")
size := gemini.MustDecimal("0.05")
desired := []gemini.DesiredQuote{
    {Side: "buy",  Price: mid.SubBps(5.0), Amount: size},
    {Side: "sell", Price: mid.AddBps(5.0), Amount: size},
}

result, err := reconciler.Sync(ctx, desired)
if err != nil {
    log.Fatalf("reconciliation could not start: %v", err)
}
if err := result.Err(); err != nil {
    log.Printf("reconciliation completed with partial failures: %v", err)
}
log.Printf("Sync: Kept=%d, Cancelled=%d, Placed=%d",
    result.Kept, result.Cancelled, result.Placed)
```

Each reconciler supports one active stream; cancel its context before starting
another stream. Reconciler cleanup removes only its own WebSocket order-event
subscription, so other subscribers on the same private WebSocket remain active.

---

### REST service surface

The `generated` packages are regenerated from Gemini's deployed REST contracts
and contain request and response models for every documented REST operation.
The hand-written `services` facade intentionally exposes a smaller, curated
set of core trading, market-data, account, transfer, staking, margin,
perpetuals, clearing, and prediction-market operations. The supported subset
is tracked by an operation-to-method coverage test in `scripts/`; a spec change
cannot silently add an unclassified endpoint.

For operations not yet surfaced by a high-level service, use the generated
models with `transport.Client.Request` or wait for a typed service method. The
prediction-market facade includes typed batch order/cancel, order history,
positions, settled positions, combos, volume metrics, maker-rebate, and
liquidity-rewards operations. Native Go iterators are available for the
paginated event, order, position, combo, and liquidity-rewards collections.
Some less common REST and clearing/reporting operations remain available through
the generated models and transport client.

Prediction-market event responses preserve the complete sports metadata model:
`Event.SportsMarket` includes sport, market type, subject, scope, and metric,
and `PredictionsService.GetEvents` accepts all corresponding repeated filters.
For higher-level sports discovery, `services.ClusterSportsEvents` groups raw
events by contest root and `services.ResolveSportsContest` resolves a contest
from an already-fetched event set without adding network behavior to the REST
client.

---

### Public and Private WebSocket Connections

The SDK keeps public and private WebSocket traffic on separate client
instances and separate connections:

- `client.PublicWebSocket()` is unauthenticated and is for public market data
  such as depth, trades, book ticker, and contract status.
- `client.PrivateWebSocket()` is the authenticated connection for order,
  balance, position, and settlement feeds. Configure `WithAPIKey`,
  `WithBearerToken`, or another auth option first.

```go
client := gemini.NewClient(
    gemini.WithEnvironment(gemini.Sandbox),
    gemini.WithAPIKey("your-api-key", "your-api-secret"),
)
defer client.Close()

publicWS := client.PublicWebSocket()
depth, err := publicWS.SubscribeDepth(ctx, "BTCUSD")
if err != nil {
    log.Fatal(err)
}

privateWS := client.PrivateWebSocket()
orders, err := privateWS.SubscribeOrderEvents(ctx)
if err != nil {
    log.Fatal(err)
}

// UnsubscribeOrderEvents removes every order-event subscriber. To remove only
// this subscriber, use UnsubscribeOrderEventsChannel(ctx, orders).

go func() {
    for update := range depth {
        log.Printf("public depth update: %d", update.LastUpdateID)
    }
}()
go func() {
    for update := range orders {
        log.Printf("private order %d: %s", update.OrderID, update.OrderStatus)
    }
}()
```

Typed stream options mirror the supported AsyncAPI variants. Use
`SubscribeDepthWithOptions` for the 100ms differential stream,
`SubscribePartialDepth` with `DepthLevel5`, `DepthLevel10`, or `DepthLevel20`
for top-of-book snapshots, `SubscribeOrderEventsWithScope` for account versus
session orders, and `SubscribeBalancesWithOptions` or
`SubscribePositionsWithOptions` with `Interval: time.Second` for throttled
snapshots. Settlements currently have only the documented account stream;
the SDK does not invent a session variant that is absent from the spec.

The WebSocket control plane and authenticated order methods are typed as well:
use `ConnInfo`, `Time`, `ListSubscriptions`, `SubscribeStreams`, and
`UnsubscribeStreams` for protocol control requests, and `PlaceOrder`,
`CancelOrder`, `CancelAllOrders`, and `CancelSessionOrders` for trading
requests. Raw `SubscribeStreams` calls are direct protocol operations and are
not replayed automatically after reconnect; private stream names fail closed
on a public client. Use `RequestAuthenticated` for dynamically named private
methods, and use the typed feed subscription methods when feed resumption is
required. `PlaceOrder` accepts `LIMIT` and `MARKET`. A stop-limit order uses
`Type: "LIMIT"` with both `Price` and `StopPrice`; Gemini reports the resulting
order as `STOP_LIMIT` on the order-event stream. `stopPrice` is not valid with
`MARKET`. The WebSocket contract allows `stopPrice == Price`; the legacy REST
`TradingService.NewOrder` contract requires a strict inequality (`stopPrice <
Price` for buys and `stopPrice > Price` for sells). Account-wide cancellation requires
`CancelAllOptions{Confirm: true}` over WebSocket or
`CancelAllOrdersOptions{Confirm: true}` through `TradingService` so a
destructive request cannot be issued by omitting a parameter accidentally.

Partial-depth subscriptions use one underlying connection per symbol because
their snapshot envelope may not include a symbol. Differential depth
subscriptions remain multiplexed because their snapshots include the market
symbol. The root SDK configures this behavior automatically. Low-level clients
that need the same behavior can use
`websocket.WithIsolatedPartialSnapshots()`; the older
`websocket.WithIsolatedSnapshots()` remains available when both feed types
must be isolated.

An unauthenticated client still exposes `PrivateWebSocket()` so applications
can construct clients uniformly, but private subscriptions fail immediately
with `gemini.ErrAuthenticationRequired`; no unauthenticated connection is
silently upgraded or reused. The low-level `websocket.NewPublicClient` and
`websocket.NewPrivateClient` constructors provide the same separation when the
root `gemini.Client` facade is not used.

The Go SDK exposes the public `requestForQuote` discovery stream, authenticated
`requestForQuote@account`/`@session` delivery streams, and typed
`SubmitRFQQuote`, `WithdrawRFQQuote`, and `ConfirmRFQQuote` methods. RFQ
deliveries are at-least-once; deduplicate them by `DeliveryID` before applying
lifecycle transitions. Quote methods require an authenticated WebSocket
client and preserve the API's explicit `Confirm` boolean—no action is taken on
the caller's behalf. Each `RFQLeg` includes its contract ID and outcome, plus
the optional leg-specific `InstrumentSymbol`; this is distinct from the
combo-level `RFQPublicEvent.Symbol`.

```go
rfqs, err := client.PublicWebSocket().SubscribeRFQEvents(ctx)
if err != nil {
    return err
}
for rfq := range rfqs {
    if rfq.State != websocket.RFQStateOpen {
        continue
    }
    // Insert application-specific pricing here. The SDK does not choose a
    // price or submit a quote automatically.
    quote, err := client.PrivateWebSocket().SubmitRFQQuote(ctx, websocket.RFQSubmitQuoteParams{
        RFQID: rfq.RFQID, Price: "0.55", Quantity: "100",
    })
    if err != nil {
        return err
    }
    _ = quote.QuoteID
}
```

The public and private WebSocket clients are intentionally separate. Use the
private client for RFQ quote methods and authenticated delivery streams; it
must be created with the same account credentials used for the relevant
capabilities.

Inbound WebSocket messages are limited to 1 MiB by default. Configure a
different limit with `websocket.WithMaxMessageSize`, or pass a non-positive
value only when the transport is trusted and an unbounded payload is required.
Malformed JSON frames are reported through `ConnectionEvent.Err` as
`websocket.ErrMalformedFrame`; the connection remains alive so callers can
continue receiving valid frames. For unattended processes, opt into
application-level liveness checks with
`websocket.WithLiveness(interval, timeout)`. A failed check is reported as
`websocket.ErrLivenessFailed` and follows the normal reconnect policy.

### Real-Time Order Book and BBO Callbacks

This example uses the optional `github.com/gemini/developer-platform/packages/sdk-go/websocket/orderbook`
package. Always drain subscription channels; the client applies backpressure
to preserve every update. Feed channels are bounded. If a consumer falls
behind far enough to fill the client's inbound dispatch queue, the client
reports `websocket.ErrSlowConsumer` through its lifecycle event channel and
reconnects when automatic reconnect is enabled. Treat that event as a data
recovery boundary: rebuild order-book state from a snapshot and reconcile
private order state with REST before continuing.

```go
liveBook := orderbook.NewLiveOrderBook("BTCUSD")

// Book returns a read-only view. Apply snapshots and diffs through liveBook
// so sequence and recovery state remains synchronized.
bookView := liveBook.Book()
_ = bookView.LastUpdateID()

// Callback triggers only when the Top-of-Book changes
liveBook.OnBBOChanged(func(bbo orderbook.BBO) {
    fmt.Printf("Bid: %s | Ask: %s | Mid: %.2f | Spread: %.2f bps\n",
        bbo.BestBid, bbo.BestAsk, bbo.Mid, bbo.SpreadBps)
})

depthStream, err := client.PublicWebSocket().SubscribeDepth(ctx, "BTCUSD")
if err != nil {
    log.Fatalf("subscribe error: %v", err)
}

for diff := range depthStream {
    if err := liveBook.IngestDiff(diff); err != nil {
        log.Printf("Sequence gap detected, resyncing: %v", err)
        break
    }
}
```

The top-level SDK requests a full order-book snapshot when it connects the
public WebSocket. The first snapshot frame is marked internally and can be
passed directly to `IngestDiff`; subsequent frames are differential updates.
The live book intentionally does not infer snapshot state from `U == u`, since
that is also valid for a normal differential update. If you construct a
low-level WebSocket client directly, opt into the same behavior with
`websocket.WithSnapshot(-1)`.

### Prediction Market Terms

Prediction-market orders are sent to Gemini immediately. If the backend
returns `gemini.ErrAcceptTermsRequired`, explicitly call
`client.Predictions.AcceptTerms(ctx)` and retry the order. The SDK never checks
terms in advance or accepts them on the caller's behalf.

---

### Concurrency and Recovery Guarantees

- Private REST requests using HMAC authentication are serialized per client so
  retries cannot send a lower nonce after a later request.
- Call `client.Close()` when the SDK client is no longer needed to stop WebSocket
  pumps and release idle connections from the SDK-owned HTTP transport. A
  caller-provided `WithHTTPClient` remains caller-owned.
- WebSocket `Request` and `Ping` calls wait for their correlated server response;
  subscription methods return protocol errors instead of treating a write as
  success. Use `errors.Is(err, websocket.ErrRequestFailed)` to classify a
  rejected request.
- WebSocket lifecycle events are buffered and coalesced if the consumer falls
  behind; use `State()` as the authoritative current state.
- WebSocket subscription channels are flow-controlled. If a consumer fills the
  bounded inbound queue, the client closes feed channels and emits
  `websocket.ErrSlowConsumer`; applications must resync state before
  subscribing again.
- Order-book snapshots and diffs reject malformed or negative levels without
  partially mutating the book. Sequence gaps return `gemini.ErrResyncRequired`.
- `LiveOrderBook.Reset` clears both sequence state and price levels. Call it
  before applying a fresh snapshot after a disconnect or sequence gap.

---

### Validation

From this directory, the package checks are:

```bash
gofmt -l .
go test ./...
go test -race ./...
go vet ./...
```

The `scripts` module fetches the allowlisted deployed OpenAPI/AsyncAPI contracts,
verifies their SHA-256 hashes, and contains contract-drift tests:

```bash
(cd scripts && go test ./...)
```

---

### Managed Heartbeat (Dead-Man's Switch)

Keep an active trading session alive in the background:

```go
session := client.Heartbeat.Start(ctx, 5*time.Second)
defer session.Stop()

go func() {
    for err := range session.Errors() {
        log.Printf("Heartbeat error: %v", err)
    }
}()
```

---

### Fixed-Precision Decimals and Basis Points Math

`types.Decimal` preserves the quoted-string representation used by string
decimal fields. Generated models for OpenAPI numeric decimal fields use
`types.DecimalNumber`, which accepts either quoted or numeric input but emits
an exact JSON number without converting through `float64`.

```go
price := gemini.MustDecimal("65000.00")

// Add and subtract basis points
ask := price.AddBps(10.0) // 65065.00
bid := price.SubBps(10.0) // 64935.00

// Measure difference in basis points
diffBps := ask.BpsDiff(bid) // 20.0 bps

// Quantize to market tick and lot rules
tickSize := gemini.MustDecimal("0.50")
lotSize := gemini.MustDecimal("0.001")

quantizedPrice := gemini.MustDecimal("65000.37").QuantizePrice(tickSize) // 65000.00
quantizedQty := gemini.MustDecimal("0.1237").QuantizeAmount(lotSize)     // 0.123
```

---

### Error Handling

All errors returned by the SDK seamlessly unwrap to typed sentinels. You can inspect errors using standard `errors.Is()` or the top-level helper functions in a single flat `switch`:

#### 1. Flat Top-Level Error Inspection (Recommended)

```go
order, err := client.Trading.PostOnlyBid(ctx, "BTCUSD", amount, price)
if err != nil {
    // Optional: Extract request ID for Gemini Support logs
    if reqID := gemini.RequestIDFromError(err); reqID != "" {
        log.Printf("Gemini Request ID: %s", reqID)
    }

    switch {
    case gemini.IsInsufficientFunds(err):
        log.Println("Domain: Insufficient balance to place order")

    case gemini.IsMarketClosed(err):
        log.Println("Domain: Market or trading pair is halted")

    case gemini.IsRateLimit(err):
        log.Println("API: Rate limit exceeded (automatic backoff engaged)")

    case gemini.IsSelfCrossPrevented(err):
        log.Println("Domain: Self-trade prevention triggered")

    case gemini.IsAuthError(err):
        log.Fatalf("Auth: Invalid keys, signature, or nonce")

    case gemini.IsNotFound(err):
        log.Println("API: Order or symbol not found")

    case gemini.IsResyncRequired(err):
        log.Println("Stream: Sequence gap detected; resyncing book...")

    default:
        log.Printf("Unhandled error: %v", err)
    }
}
```

#### 2. Broad Category Inspection (For Middleware, Routing, & Alerting)

```go
switch {
case gemini.IsDomainError(err):
    // Exchange matching engine business rejections (do not retry)
    log.Printf("Business logic rejection: %v", err)

case gemini.IsAPIError(err):
    // Gateway / HTTP 4xx / 5xx responses
    if apiErr, ok := gemini.AsAPIError(err); ok {
        log.Printf("HTTP %d (%s): %s", apiErr.StatusCode, apiErr.Reason, apiErr.Message)
    }

case gemini.IsTimeout(err):
    // Client-side deadline exceeded
    log.Println("Request timed out")
}
```

---

### Testing with `geminitest`

Use the local mock server for testing without network requests:

```go
server := geminitest.NewMockServer("test-key", "test-secret")
defer server.Close()

client := gemini.NewClient(
    gemini.WithCustomRESTURL(server.URL()),
    gemini.WithAPIKey("test-key", "test-secret"),
)
```

---

## License

Apache 2.0. See the [Apache 2.0 license](https://www.apache.org/licenses/LICENSE-2.0)
for details.
