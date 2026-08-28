// Package gemini provides the official, zero-dependency Go SDK for the Gemini Exchange APIs.
//
// # Overview
//
// The SDK supports both REST and WebSocket APIs for high-frequency trading, market data,
// account management, margin, derivatives/perpetuals, clearing, and prediction markets.
//
// Built natively for Go 1.23+, the core SDK depends exclusively on the Go standard library,
// providing sub-microsecond in-memory order books, declarative quote reconciliation,
// automatic clock skew calibration, monotonic nonces, and resilient connection pooling.
//
// # Quick Start
//
//	import "github.com/gemini/gemini-go"
//
//	client := gemini.NewClient(
//	    gemini.WithEnvironment(gemini.Production),
//	    gemini.WithAPIKey("your-api-key", "your-api-secret"),
//	)
//
//	ticker, err := client.MarketData.GetTicker(ctx, "BTCUSD")
//
// # Fluent Order Placement
//
//	amount := gemini.MustDecimal("0.05")
//	price := gemini.MustDecimal("64950.00")
//
//	// Post-only Maker-or-Cancel limit order with tracking ID
//	order, err := client.Trading.PostOnlyBid(ctx, "BTCUSD", amount, price,
//	    gemini.WithClientOrderID("my-order-1234"),
//	)
//
// # Smart Quote Reconciler (WebSocket-First Market Making)
//
//	reconciler := client.NewQuoteReconciler("BTCUSD",
//	    gemini.WithToleranceBps(0.5),
//	    gemini.WithQuantization(gemini.MustDecimal("0.01"), gemini.MustDecimal("0.0001")),
//	)
//
//	errChan, err := reconciler.StartStreaming(ctx)
//
//	result, err := reconciler.Sync(ctx, []gemini.DesiredQuote{
//	    {Side: "buy",  Price: mid.SubBps(8.0), Amount: size},
//	    {Side: "sell", Price: mid.AddBps(8.0), Amount: size},
//	})
//	if err == nil {
//	    err = result.Err() // Partial cancellation/placement failures
//	}
//
// # Real-Time WebSockets & In-Memory Order Book
//
// To enable real-time WebSocket feeds, configure a dialer adapter (e.g. Gorilla WebSocket):
//
//	import "github.com/gemini/gemini-go/websocket/gorilla"
//
//	client := gemini.NewClient(
//	    gemini.WithWebSocketDialer(gorilla.NewDialer()),
//	)
//
// Public and private feeds use separate clients and connections:
//
//	publicWS := client.PublicWebSocket()
//	depth, err := publicWS.SubscribeDepth(ctx, "BTCUSD")
//	privateWS := client.PrivateWebSocket()
//	orders, err := privateWS.SubscribeOrderEvents(ctx)
//
// Configure an authentication option before using PrivateWebSocket.
//
//	liveBook := orderbook.NewLiveOrderBook("BTCUSD")
//	liveBook.OnBBOChanged(func(bbo orderbook.BBO) {
//	    fmt.Printf("Top of Book: Bid %s | Ask %s\n", bbo.BestBid, bbo.BestAsk)
//	})
//
// # Go 1.23+ Range Iteration (Paginator)
//
// Native iter.Seq2 range-over-function support for paginated endpoints:
//
//	for trade, err := range gemini.NewPaginator(ctx, 0, 50, fetcher) {
//	    if err != nil {
//	        break
//	    }
//	    fmt.Println(trade)
//	}
//
// # Error Handling & Classification
//
// Sentinel errors and typed boolean predicates allow clean error handling:
//
//	if gemini.IsRateLimit(err) {
//	    // Handle rate limit
//	}
//	if gemini.IsInsufficientFunds(err) {
//	    // Handle balance error
//	}
package gemini
