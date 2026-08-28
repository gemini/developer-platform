package gemini_test

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"time"

	"github.com/gemini/gemini-go"
	"github.com/gemini/gemini-go/generated/trading"
	"github.com/gemini/gemini-go/transport"
	"github.com/gemini/gemini-go/websocket"
	"github.com/gemini/gemini-go/websocket/orderbook"
)

func newExampleRESTClient(server *httptest.Server, authenticated bool) *gemini.Client {
	opts := []gemini.Option{
		gemini.WithCustomRESTURL(server.URL),
		gemini.WithHTTPClient(server.Client()),
		gemini.WithRetryPolicy(transport.RetryPolicy{MaxRetries: 0}),
	}
	if authenticated {
		opts = append(opts, gemini.WithAPIKey("example-key", "example-secret"))
	}
	return gemini.NewClient(opts...)
}

// Example_basic demonstrates initializing the Gemini client and fetching public ticker data.
func Example_basic() {
	server := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v1/symbols" {
			http.NotFound(w, r)
			return
		}
		_ = json.NewEncoder(w).Encode([]string{"BTCUSD", "ETHUSD"})
	}))
	defer server.Close()
	client := newExampleRESTClient(server, false)
	defer client.Close()

	ctx := context.Background()
	symbols, err := client.MarketData.GetSymbols(ctx)
	if err != nil {
		log.Fatalf("failed fetching symbols: %v", err)
	}

	fmt.Printf("Supported symbol count: %d\n", len(symbols))

	// Output:
	// Supported symbol count: 2
}

// Example_trading demonstrates authenticating with API keys and placing a limit buy order.
func Example_trading() {
	server := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v1/order/new" {
			http.NotFound(w, r)
			return
		}
		_ = json.NewEncoder(w).Encode(map[string]any{"order_id": "order-123", "is_live": true})
	}))
	defer server.Close()
	client := newExampleRESTClient(server, true)
	defer client.Close()

	ctx := context.Background()

	order, err := client.Trading.NewOrder(ctx, &trading.NewOrderRequest{
		Symbol: "BTCUSD",
		Amount: "0.10",
		Price:  "65000.00",
		Side:   trading.NewOrderRequestSideBuy,
		Type:   trading.NewOrderRequestTypeExchangeLimit,
	})
	if err != nil {
		log.Fatalf("failed placing order: %v", err)
	}

	fmt.Printf("Order placed: %s\n", *order.OrderId)

	// Output:
	// Order placed: order-123
}

// Example_liveOrderBook demonstrates synchronizing an in-memory L2 order book.
func Example_liveOrderBook() {
	liveBook := orderbook.NewLiveOrderBook("BTCUSD")

	// Apply initial snapshot
	liveBook.ApplySnapshot(&websocket.OrderBookSnapshot{
		LastUpdateID: 100,
		Bids:         [][]string{{"65000.00", "1.5"}},
		Asks:         [][]string{{"65001.00", "2.0"}},
	})

	// Best bid & ask are available with sub-microsecond latency
	if bestBid, ok := liveBook.Book().BestBid(); ok {
		fmt.Printf("Best Bid: %s @ %s\n", bestBid.Price, bestBid.Amount)
	}

	// Output:
	// Best Bid: 65000.00 @ 1.5
}

// Example_managedHeartbeat demonstrates starting an autonomous session heartbeat worker.
func Example_managedHeartbeat() {
	received := make(chan struct{}, 1)
	server := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v1/heartbeat" {
			http.NotFound(w, r)
			return
		}
		received <- struct{}{}
		_ = json.NewEncoder(w).Encode(map[string]string{"result": "ok"})
	}))
	defer server.Close()
	client := newExampleRESTClient(server, true)
	defer client.Close()

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	// Keep trading session alive every 5 seconds
	session := client.Heartbeat.Start(ctx, 5*time.Second)
	defer session.Stop()
	select {
	case <-received:
		fmt.Println("Heartbeat sent")
	case <-time.After(time.Second):
		log.Fatal("heartbeat was not sent")
	}

	// Monitor errors in background
	go func() {
		for err := range session.Errors() {
			log.Printf("Heartbeat delivery issue: %v", err)
		}
	}()

	// Output:
	// Heartbeat sent
}

// CustomMetricsHook satisfies transport.Hook for telemetry integrations.
type CustomMetricsHook struct{}

var _ transport.Hook = (*CustomMetricsHook)(nil)

func (h *CustomMetricsHook) OnRequestStart(ctx context.Context, req *http.Request) context.Context {
	return ctx
}

func (h *CustomMetricsHook) OnRequestEnd(ctx context.Context, req *http.Request, resp *http.Response, duration time.Duration, err error) {
	// Emit Prometheus / OpenTelemetry histogram latency metrics
}

func (h *CustomMetricsHook) OnRetry(ctx context.Context, req *http.Request, attempt int, backoff time.Duration, err error) {
	// Increment retry counter
}

func (h *CustomMetricsHook) OnRateLimit(ctx context.Context, req *http.Request, retryAfter time.Duration) {
	// Increment rate limit counter
}

// Example_observabilityHooks demonstrates attaching zero-dependency telemetry hooks.
func Example_observabilityHooks() {
	client := gemini.NewClient(
		gemini.WithHooks(&CustomMetricsHook{}),
	)
	defer client.Close()

	fmt.Println("Observability hooks configured")

	// Output:
	// Observability hooks configured
}

// Example_fluentTrading demonstrates one-line maker post-only and IOC order placement.
func Example_fluentTrading() {
	server := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v1/order/new" {
			http.NotFound(w, r)
			return
		}
		_ = json.NewEncoder(w).Encode(map[string]any{"order_id": "maker-bid-1001", "is_live": true})
	}))
	defer server.Close()
	client := newExampleRESTClient(server, true)
	defer client.Close()

	ctx := context.Background()
	amount := gemini.MustDecimal("0.05")
	bidPrice := gemini.MustDecimal("64950.00")

	// Post-only maker order with client tracking ID
	order, err := client.Trading.PostOnlyBid(ctx, "BTCUSD", amount, bidPrice,
		gemini.WithClientOrderID("maker-bid-1001"),
	)
	if err != nil {
		log.Fatalf("failed placing maker quote: %v", err)
	}

	fmt.Printf("Maker bid placed: %s\n", *order.OrderId)

	// Output:
	// Maker bid placed: maker-bid-1001
}

// Example_quoteReconciler demonstrates declarative market making ladder synchronization.
func Example_quoteReconciler() {
	var nextOrderID atomic.Int64
	server := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/v1/orders":
			_ = json.NewEncoder(w).Encode([]any{})
		case "/v1/order/new":
			id := nextOrderID.Add(1)
			_ = json.NewEncoder(w).Encode(map[string]any{
				"order_id": fmt.Sprintf("quote-%d", id),
				"is_live":  true,
			})
		default:
			http.NotFound(w, r)
		}
	}))
	defer server.Close()
	client := newExampleRESTClient(server, true)
	defer client.Close()

	ctx := context.Background()

	// Initialize reconciler with 0.5 bps tolerance band and exchange tick size
	reconciler := client.NewQuoteReconciler("BTCUSD",
		gemini.WithToleranceBps(0.5),
		gemini.WithQuantization(gemini.MustDecimal("0.01"), gemini.MustDecimal("0.0001")),
	)
	if err := reconciler.Hydrate(ctx); err != nil {
		log.Fatalf("failed hydrating active quotes: %v", err)
	}

	// Target 2-sided quoting ladder
	mid := gemini.MustDecimal("65000.00")
	size := gemini.MustDecimal("0.05")

	targetLadder := []gemini.DesiredQuote{
		{Side: "buy", Price: mid.SubBps(10.0), Amount: size},
		{Side: "sell", Price: mid.AddBps(10.0), Amount: size},
	}

	result, err := reconciler.Sync(ctx, targetLadder)
	if err != nil {
		log.Fatalf("reconciliation failed: %v", err)
	}
	if err := result.Err(); err != nil {
		log.Fatalf("reconciliation completed with partial failures: %v", err)
	}

	fmt.Printf("Quotes synced: Kept=%d, Cancelled=%d, Placed=%d\n",
		result.Kept, result.Cancelled, result.Placed)

	// Output:
	// Quotes synced: Kept=0, Cancelled=0, Placed=2
}

// Example_pagination demonstrates native Go 1.23+ iter.Seq2 range-over-function pagination.
func Example_pagination() {
	ctx := context.Background()

	// Create an iterator fetching pages of trade records
	tradesIter := gemini.NewPaginator(ctx, 0, 50, func(ctx context.Context, offset, limit int) ([]string, bool, error) {
		// Fetch items at offset
		items := []string{"trade-1", "trade-2"}
		hasMore := false
		return items, hasMore, nil
	})

	// Iterate with native Go 1.23 for-range loop
	for item, err := range tradesIter {
		if err != nil {
			log.Fatalf("pagination error: %v", err)
		}
		fmt.Printf("Processing item: %s\n", item)
	}

	// Output:
	// Processing item: trade-1
	// Processing item: trade-2
}
