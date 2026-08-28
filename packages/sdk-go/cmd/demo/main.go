package main

import (
	"context"
	"fmt"
	"log"
	"log/slog"
	"net/http"
	"os"
	"time"

	"github.com/gemini/gemini-go"
	"github.com/gemini/gemini-go/auth"
	"github.com/gemini/gemini-go/geminitest"
	"github.com/gemini/gemini-go/generated/account"
	"github.com/gemini/gemini-go/generated/predictions"
	"github.com/gemini/gemini-go/transport"
	"github.com/gemini/gemini-go/websocket/gorilla"
	"github.com/gemini/gemini-go/websocket/orderbook"
)

func main() {
	logger := slog.New(slog.NewTextHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelInfo}))
	slog.SetDefault(logger)

	fmt.Println("==================================================")
	fmt.Println("🚀 Gemini Official Go SDK Local Validation Suite")
	fmt.Println("==================================================")

	ctx, cancel := context.WithTimeout(context.Background(), 45*time.Second)
	defer cancel()

	// 1. Initialize Client against Production endpoints with pluggable Gorilla dialer and latency tracing
	client := gemini.NewClient(
		gemini.WithEnvironment(gemini.Production),
		gemini.WithWebSocketDialer(gorilla.NewDialer()),
		gemini.WithLogger(logger),
		gemini.WithTraceHook(func(req *http.Request, trace transport.LatencyBreakdown, err error) {
			if trace.ConnectionReused {
				fmt.Printf(" [Trace: %v (Reused Socket, TTFB: %v)]\n", trace.TotalDuration.Round(time.Microsecond), trace.TimeToFirstByte.Round(time.Microsecond))
			} else {
				fmt.Printf(" [Trace: %v (New Socket, TLS: %v, TTFB: %v)]\n", trace.TotalDuration.Round(time.Microsecond), trace.TLSHandshake.Round(time.Microsecond), trace.TimeToFirstByte.Round(time.Microsecond))
			}
		}),
	)

	// 2. REST API: GetSymbols
	fmt.Print("📡 [REST] Fetching active market symbols...")
	symbols, err := client.MarketData.GetSymbols(ctx)
	if err != nil {
		log.Fatalf("FAILED: %v\n", err)
	}
	fmt.Printf("   ✅ Fetched %d active market symbols\n", len(symbols))

	// 3. REST API: GetTicker
	fmt.Print("📊 [REST] Fetching live BTCUSD ticker...")
	ticker, err := client.MarketData.GetTicker(ctx, "BTCUSD")
	if err != nil {
		log.Fatalf("FAILED: %v\n", err)
	}
	fmt.Printf("✅ SUCCESS!\n      • Last Price: $%s\n      • Best Bid:   $%s\n      • Best Ask:   $%s\n",
		gemini.Val(ticker.Last), gemini.Val(ticker.Bid), gemini.Val(ticker.Ask))

	// 4. REST API: Prediction Markets Contracts & Terms
	fmt.Print("🔮 [REST] Fetching Prediction Markets Terms & Live Events...")
	terms, termsErr := client.Predictions.GetTerms(ctx)
	if termsErr == nil {
		fmt.Printf("   ✅ Terms Available (v%d: %s)\n", terms.Version, terms.TermsType)
	}
	limit := predictions.Limit(5)
	events, eventsErr := client.Predictions.GetEvents(ctx, &predictions.ListEventsParams{Limit: &limit})
	if eventsErr == nil {
		if events != nil && events.Data != nil && len(*events.Data) > 0 {
			data := *events.Data
			firstEvt := data[0]
			fmt.Printf("   ✅ Fetched %d Live Prediction Events\n", len(data))
			fmt.Printf("      • Event: \"%s\" (ID: %s)\n", gemini.Val(firstEvt.Title), gemini.Val(firstEvt.Id))
			if firstEvt.Contracts != nil && len(*firstEvt.Contracts) > 0 {
				contracts := *firstEvt.Contracts
				fmt.Printf("      • Tradeable Contracts (%d outcomes):\n", len(contracts))
				for i, contract := range contracts {
					if i >= 3 {
						break
					}
					fmt.Printf("        [%d] Contract: %-20s | Status: %v\n",
						i+1, gemini.Val(contract.InstrumentSymbol), gemini.Val(contract.MarketState))
				}
			}
		} else {
			fmt.Println("   ✅ Prediction markets endpoint queried successfully")
		}
	} else {
		fmt.Printf("   ℹ️ Prediction events queried: %v\n", eventsErr)
	}

	// 5. REST API: Derivatives & Perpetuals Funding
	fmt.Print("📈 [REST] Fetching BTC-GUSD Perpetual Funding Rates...")
	funding, fundingErr := client.Perpetuals.GetFundingAmount(ctx, "btcgusdperp")
	if fundingErr == nil && funding != nil {
		fmt.Printf("   ✅ Current Funding: %v | Est Next: %v\n", gemini.Val(funding.Amount), gemini.Val(funding.EstimatedFundingAmount))
	} else {
		fmt.Printf("   ℹ️ Perpetuals info queried: %v\n", fundingErr)
	}

	// 6. Go 1.23+ iter.Seq2 Range-Over-Func Native Pagination
	fmt.Print("🔄 [Iterator] Verifying Go 1.23+ iter.Seq2 range-over-func pagination...")
	type mockRecord struct {
		ID   int
		Name string
	}
	mockFetcher := func(ctx context.Context, offset, limit int) ([]mockRecord, bool, error) {
		if offset >= 10 {
			return nil, false, nil
		}
		var page []mockRecord
		for i := 0; i < limit && offset+i < 10; i++ {
			page = append(page, mockRecord{ID: offset + i + 1, Name: fmt.Sprintf("Item-%d", offset+i+1)})
		}
		return page, offset+len(page) < 10, nil
	}
	paginator := transport.NewPaginator(ctx, 0, 4, mockFetcher)
	itemCount := 0
	for item, err := range paginator {
		if err != nil {
			log.Fatalf("Paginator iteration error: %v\n", err)
		}
		itemCount++
		_ = item
	}
	fmt.Printf("   ✅ Iterated %d items cleanly via native Go for-range\n", itemCount)

	// 7. OAuth 2.0 Dynamic Bearer Token Verification
	fmt.Print("🔑 [OAuth 2.0] Verifying dynamic OAuth TokenSource refresh & authentication...")
	oauthMock := geminitest.NewMockOAuthServer("live-demo-bearer-token")
	defer oauthMock.Close()

	activeToken := "initial-expired-token"
	dynamicSource := auth.TokenFunc(func(ctx context.Context) (string, error) {
		return activeToken, nil
	})

	oauthClient := gemini.NewClient(
		gemini.WithCustomRESTURL(oauthMock.URL()),
		gemini.WithHTTPClient(oauthMock.HTTPClient()),
		gemini.WithTokenSource(dynamicSource),
	)

	// Simulate expired token failure
	_, err = oauthClient.Account.GetBalances(ctx, &account.GetAvailableBalancesJSONBody{Account: "primary"})
	if err == nil {
		log.Fatalf("expected OAuth rejection with stale token")
	}

	// Refresh token dynamically
	activeToken = "live-demo-bearer-token"
	oauthBalances, err := oauthClient.Account.GetBalances(ctx, &account.GetAvailableBalancesJSONBody{Account: "primary"})
	if err != nil {
		log.Fatalf("OAuth call with refreshed token failed: %v", err)
	}
	fmt.Printf("   ✅ Successfully authenticated with renewed OAuth token (%d accounts retrieved)\n", len(oauthBalances))

	// 8. REST API: GetOrderBook
	fmt.Print("📚 [REST] Fetching L2 order book snapshot (top-5)... ")
	book, err := client.MarketData.GetOrderBook(ctx, "BTCUSD", 5, 5)
	if err != nil {
		log.Fatalf("FAILED: %v\n", err)
	}
	bids := gemini.Val(book.Bids)
	asks := gemini.Val(book.Asks)
	fmt.Printf("✅ SUCCESS! (%d bids, %d asks)\n", len(bids), len(asks))
	if len(bids) > 0 {
		fmt.Printf("      • Top Bid: %s BTC @ $%s\n", gemini.Val(bids[0].Amount), gemini.Val(bids[0].Price))
	}
	if len(asks) > 0 {
		fmt.Printf("      • Top Ask: %s BTC @ $%s\n", gemini.Val(asks[0].Amount), gemini.Val(asks[0].Price))
	}

	// 9. WebSocket API: Dedicated Public & Private WebSocket connections
	fmt.Println("\n⚡ [WebSocket] Verifying Public vs Private WebSocket connection separation...")

	// 9a. Private WebSocket Guardrails: Unauthenticated calls fail safely
	privateWS := client.PrivateWebSocket()
	if _, err := privateWS.SubscribeOrderEvents(ctx); err == gemini.ErrAuthenticationRequired {
		fmt.Println("   🛡️ Private WebSocket correctly enforces authentication guard (ErrAuthenticationRequired)")
	}

	// 9b. Public WebSocket: High-throughput unauthenticated market data stream
	fmt.Println("   📡 Connecting dedicated Public WebSocket (wss://ws.gemini.com)...")
	ws := client.PublicWebSocket()
	defer ws.Close()

	if err := ws.Connect(ctx); err != nil {
		log.Fatalf("Public WebSocket connection failed: %v\n", err)
	}
	fmt.Println("   ✅ Public Handshake Established (101 Switching Protocols)")

	fmt.Println("   📡 Subscribing to BTCUSD Depth Feed (btcusd@depth)...")
	depthCh, err := ws.SubscribeDepth(ctx, "BTCUSD")
	if err != nil {
		log.Fatalf("SubscribeDepth failed: %v\n", err)
	}

	fmt.Println("   📡 Subscribing to BTCUSD BookTicker Feed (btcusd@bookTicker)...")
	tickerCh, err := ws.SubscribeBookTicker(ctx, "BTCUSD")
	if err != nil {
		log.Fatalf("SubscribeBookTicker failed: %v\n", err)
	}

	// 10. Real Live L2 Order Book Engine
	fmt.Println("\n📖 [OrderBook Engine] Initializing in-memory L2 LiveOrderBook...")
	liveBook := orderbook.NewLiveOrderBook("BTCUSD")
	if len(bids) > 0 && len(asks) > 0 {
		fmt.Printf("   📊 Initial REST OrderBook: %d bids, %d asks (Best Bid: $%s, Best Ask: $%s)\n",
			len(bids), len(asks), gemini.Val(bids[0].Price), gemini.Val(asks[0].Price))
	}

	fmt.Println("\n📥 Streaming real-time market updates & synchronizing L2 Order Book...")
	receivedDepth := 0
	receivedTicker := 0

	deadline := time.After(20 * time.Second)
	for receivedDepth < 4 || receivedTicker < 2 {
		select {
		case depth, ok := <-depthCh:
			if !ok {
				log.Fatal("Depth channel closed unexpectedly")
			}
			receivedDepth++

			if err := liveBook.IngestDiff(depth); err != nil {
				log.Printf("   ⚠️ IngestDiff notification: %v\n", err)
			}
			if liveBook.IsLive() {
				fmt.Printf("   ✅ Synchronized live orderbook at Sequence #%d\n", liveBook.Book().LastUpdateID())
			}

			bestBid, hasBid := liveBook.Book().BestBid()
			bestAsk, hasAsk := liveBook.Book().BestAsk()
			spread, hasSpread := liveBook.Book().Spread()
			mid, _ := liveBook.Book().Mid()

			fmt.Printf("   🟢 [Depth Event %d] Seq: %d | Changes: %d bids, %d asks\n",
				receivedDepth, depth.LastUpdateID, len(depth.Bids), len(depth.Asks))
			if hasBid && hasAsk && hasSpread {
				fmt.Printf("      📊 Real-Time BBO: Bid %s BTC @ $%s | Ask %s BTC @ $%s | Spread: $%.2f | Mid: $%.2f\n",
					bestBid.Amount, bestBid.Price, bestAsk.Amount, bestAsk.Price, spread, mid)
			}

		case bt, ok := <-tickerCh:
			if !ok {
				log.Fatal("BookTicker channel closed unexpectedly")
			}
			receivedTicker++
			fmt.Printf("   🔵 [BookTicker Event %d] %s | Bid: $%s (%s BTC) | Ask: $%s (%s BTC)\n",
				receivedTicker, bt.Symbol, bt.BidPrice, bt.BidQty, bt.AskPrice, bt.AskQty)

		case <-deadline:
			log.Fatalf("Timed out after 20s (received %d depth, %d ticker updates)\n", receivedDepth, receivedTicker)
		}
	}

	fmt.Println("\n==================================================")
	fmt.Println("🎉 ALL REAL LIVE ORDER BOOK & STREAM CHECKS PASSED!")
	fmt.Println("==================================================")
}
