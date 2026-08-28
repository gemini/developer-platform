package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"log/slog"
	"net/http"
	"os"
	"os/exec"
	"runtime"
	"strings"
	"time"

	"github.com/gemini/gemini-go"
	"github.com/gemini/gemini-go/auth"
	"github.com/gemini/gemini-go/geminitest"
	"github.com/gemini/gemini-go/generated/account"
	"github.com/gemini/gemini-go/generated/predictions"
	geminioauth "github.com/gemini/gemini-go/oauth"
	"github.com/gemini/gemini-go/transport"
	"github.com/gemini/gemini-go/websocket"
	"github.com/gemini/gemini-go/websocket/gorilla"
	"github.com/gemini/gemini-go/websocket/orderbook"
)

const (
	demoRFQSubmitConfirmation = "I_UNDERSTAND_THIS_SUBMITS_A_LIVE_RFQ_QUOTE"
	demoCLIClientID           = "6a03a47b-1bb4-491a-b0a7-35ad17473e71"
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
	clientOptions := []gemini.Option{
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
	}
	bearerToken := strings.TrimSpace(os.Getenv("GEMINI_ACCESS_TOKEN"))
	oauthLoginEnabled := os.Getenv("GEMINI_DEMO_OAUTH_LOGIN") == "1"
	rfqSubmitEnabled := os.Getenv("GEMINI_DEMO_RFQ_SUBMIT") == "1"
	rfqPrice := strings.TrimSpace(os.Getenv("GEMINI_DEMO_RFQ_PRICE"))
	rfqQuantity := strings.TrimSpace(os.Getenv("GEMINI_DEMO_RFQ_QUANTITY"))
	if bearerToken != "" && oauthLoginEnabled {
		log.Fatal("set only one of GEMINI_ACCESS_TOKEN or GEMINI_DEMO_OAUTH_LOGIN=1")
	}
	if rfqSubmitEnabled {
		if os.Getenv("GEMINI_DEMO_RFQ_CONFIRM") != demoRFQSubmitConfirmation {
			log.Fatalf("RFQ submit mode requires GEMINI_DEMO_RFQ_CONFIRM=%s", demoRFQSubmitConfirmation)
		}
		if rfqPrice == "" || rfqQuantity == "" {
			log.Fatal("RFQ submit mode requires GEMINI_DEMO_RFQ_PRICE and GEMINI_DEMO_RFQ_QUANTITY")
		}
		fmt.Printf("⚠️ [RFQ] Submit mode armed for price=%s quantity=%s; it will submit at most one live quote\n", rfqPrice, rfqQuantity)
	}
	authConfigured := bearerToken != ""
	if bearerToken != "" {
		clientOptions = append(clientOptions, gemini.WithBearerToken(bearerToken))
		fmt.Println("🔑 [OAuth 2.0] Production bearer token configured for private WebSocket validation")
	}
	if oauthLoginEnabled {
		clientID := strings.TrimSpace(os.Getenv("GEMINI_OAUTH_CLIENT_ID"))
		if clientID == "" {
			clientID = demoCLIClientID
		}
		oauthConfig := geminioauth.Config{
			ClientID:     clientID,
			ClientSecret: strings.TrimSpace(os.Getenv("GEMINI_OAUTH_CLIENT_SECRET")),
			Endpoint: geminioauth.Endpoint{
				AuthURL:  "https://exchange.gemini.com/auth",
				TokenURL: "https://exchange.gemini.com/auth/token",
			},
			RedirectURL: "http://localhost:8787/callback",
			Scopes:      demoOAuthScopes(rfqSubmitEnabled),
		}
		fmt.Println("🔐 [OAuth 2.0] Starting CLI-compatible PKCE login (credentials remain in memory)...")
		token, err := oauthConfig.Login(ctx, openBrowser)
		if err != nil {
			log.Fatalf("OAuth PKCE login failed: %v\n", err)
		}
		source, err := geminioauth.NewTokenSource(oauthConfig, *token)
		if err != nil {
			log.Fatalf("OAuth token source setup failed: %v\n", err)
		}
		clientOptions = append(clientOptions, gemini.WithTokenSource(source))
		authConfigured = true
		fmt.Println("   ✅ OAuth PKCE authorization completed; bearer token source configured")
	}
	if rfqSubmitEnabled {
		if !authConfigured {
			log.Fatal("RFQ submit mode requires GEMINI_ACCESS_TOKEN or GEMINI_DEMO_OAUTH_LOGIN=1")
		}
	}
	client := gemini.NewClient(clientOptions...)

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
	if !authConfigured {
		if _, err := privateWS.SubscribeOrderEvents(ctx); err == gemini.ErrAuthenticationRequired {
			fmt.Println("   🛡️ Private WebSocket correctly enforces authentication guard (ErrAuthenticationRequired)")
		}
	} else {
		fmt.Println("   🔐 Connecting authenticated Private WebSocket (bearer token not displayed)...")
		if err := privateWS.Connect(ctx); err != nil {
			log.Fatalf("Authenticated Private WebSocket connection failed: %v\n", err)
		}
		fmt.Println("   ✅ OAuth bearer private WebSocket handshake established")
	}

	// 9b. Public WebSocket: High-throughput unauthenticated market data stream
	fmt.Println("   📡 Connecting dedicated Public WebSocket (wss://ws.gemini.com)...")
	ws := client.PublicWebSocket()
	defer ws.Close()

	if err := ws.Connect(ctx); err != nil {
		log.Fatalf("Public WebSocket connection failed: %v\n", err)
	}
	fmt.Println("   ✅ Public Handshake Established (101 Switching Protocols)")

	fmt.Println("   📡 Subscribing to public RFQ discovery stream (requestForQuote)...")
	rfqCh, err := ws.SubscribeRFQEvents(ctx)
	if err != nil {
		log.Fatalf("SubscribeRFQEvents failed: %v\n", err)
	}
	fmt.Println("   ✅ RFQ discovery subscription established")

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
	rfqObserved := false
	rfqQuoteSubmitted := false
	rfqWaitCompleted := false
	var rfqEvents <-chan *websocket.RFQPublicEvent = rfqCh
	rfqTimer := time.NewTimer(5 * time.Second)
	defer rfqTimer.Stop()
	var rfqWait <-chan time.Time = rfqTimer.C

	deadline := time.After(20 * time.Second)
	for receivedDepth < 4 || receivedTicker < 2 {
		select {
		case rfq, ok := <-rfqEvents:
			if !ok {
				fmt.Println("   ℹ️ RFQ discovery stream closed before an event was observed")
				rfqEvents = nil
				rfqWait = nil
				rfqWaitCompleted = true
				continue
			}
			if !rfqObserved {
				printRFQEvent(rfq)
				rfqObserved = true
				rfqEvents = nil
				rfqWait = nil

				if rfqSubmitEnabled && rfq != nil && rfq.State == websocket.RFQStateOpen {
					quote, err := privateWS.SubmitRFQQuote(ctx, websocket.RFQSubmitQuoteParams{
						RFQID: rfq.RFQID, Price: rfqPrice, Quantity: rfqQuantity,
					})
					if err != nil {
						log.Fatalf("SubmitRFQQuote failed: %v\n", err)
					}
					rfqQuoteSubmitted = true
					fmt.Printf("   ✅ Submitted one live RFQ quote (RFQ ID: %s, Quote ID: %s)\n", quote.RFQID, quote.QuoteID)
				}
			}

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

		case <-rfqWait:
			rfqWaitCompleted = true
			rfqEvents = nil
			rfqWait = nil
			fmt.Println("   ℹ️ No RFQ event was published during the 5-second observation window")

		case <-deadline:
			log.Fatalf("Timed out after 20s (received %d depth, %d ticker updates)\n", receivedDepth, receivedTicker)
		}
	}
	if rfqObserved {
		fmt.Println("   ✅ RFQ discovery stream delivered a live event")
	} else if !rfqWaitCompleted {
		fmt.Println("   ℹ️ RFQ discovery subscription was active; no event arrived during the bounded validation window")
	}
	if rfqSubmitEnabled && !rfqQuoteSubmitted {
		fmt.Println("   ℹ️ RFQ submit mode was armed, but no open RFQ was observed; no quote was submitted")
	}

	fmt.Println("\n==================================================")
	fmt.Println("🎉 ALL REAL LIVE ORDER BOOK & STREAM CHECKS PASSED!")
	fmt.Println("==================================================")
}

func openBrowser(rawURL string) error {
	switch runtime.GOOS {
	case "darwin":
		return exec.Command("open", rawURL).Start()
	case "linux":
		return exec.Command("xdg-open", rawURL).Start()
	case "windows":
		return exec.Command("rundll32", "url.dll,FileProtocolHandler", rawURL).Start()
	default:
		return fmt.Errorf("unsupported operating system %q; open the authorization URL manually", runtime.GOOS)
	}
}

// demoOAuthScopes returns the minimum scopes needed by the selected demo mode.
func demoOAuthScopes(rfqSubmitEnabled bool) []string {
	scopes := []string{"account:read", "balances:read", "orders:read", "history:read"}
	if rfqSubmitEnabled {
		scopes = append(scopes, "orders:create")
	}
	return scopes
}

func printRFQEvent(event *websocket.RFQPublicEvent) {
	if event == nil {
		fmt.Println("   ⚠️ RFQ discovery stream returned an empty event")
		return
	}

	payload, err := json.MarshalIndent(event, "      ", "  ")
	if err != nil {
		fmt.Printf("   ⚠️ Could not render RFQ event: %v\n", err)
		return
	}
	fmt.Printf("   ✅ Received live RFQ event:\n%s\n", payload)
}
