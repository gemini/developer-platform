package services_test

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gemini/gemini-go/services"
	"github.com/gemini/gemini-go/transport"
)

func TestMarketDataService_Methods(t *testing.T) {
	var capturedPath string
	var capturedQuery string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		capturedPath = r.URL.Path
		capturedQuery = r.URL.RawQuery
		w.Header().Set("Content-Type", "application/json")
		switch r.URL.Path {
		case "/v1/symbols":
			_ = json.NewEncoder(w).Encode([]string{"btcusd", "ethusd"})
		case "/v1/symbols/details/btcusd":
			_ = json.NewEncoder(w).Encode(map[string]any{
				"symbol":          "BTCUSD",
				"base_currency":   "BTC",
				"quote_currency":  "USD",
				"tick_size":       1e-8,
				"quote_increment": 0.01,
				"min_order_size":  "0.00001",
				"status":          "open",
				"wrap_enabled":    false,
			})
		case "/v1/pubticker/btcusd":
			_ = json.NewEncoder(w).Encode(map[string]any{
				"bid":  "50000.00",
				"ask":  "50001.00",
				"last": "50000.50",
			})
		case "/v2/ticker/btcusd":
			_ = json.NewEncoder(w).Encode(map[string]any{
				"symbol": "BTCUSD",
				"open":   "49000.00",
				"high":   "51000.00",
				"low":    "48500.00",
				"close":  "50000.50",
			})
		case "/v1/book/btcusd":
			_ = json.NewEncoder(w).Encode(map[string]any{
				"bids": []map[string]any{{"price": "50000.00", "amount": "1.0", "timestamp": "1600000000"}},
				"asks": []map[string]any{{"price": "50001.00", "amount": "2.0", "timestamp": "1600000000"}},
			})
		case "/v1/trades/btcusd":
			_ = json.NewEncoder(w).Encode([]map[string]any{
				{"timestamp": 1600000000, "tid": 12345, "price": "50000.00", "amount": "0.5", "exchange": "gemini", "type": "buy"},
			})
		case "/v2/candles/btcusd/1hr":
			_ = json.NewEncoder(w).Encode([][]float64{
				{1600000000000, 50000, 50100, 49900, 50050, 100},
			})
		default:
			http.NotFound(w, r)
		}
	}))
	defer server.Close()

	trans := transport.NewClient(transport.WithHTTPClient(server.Client()))
	svc := services.NewMarketDataService(trans, server.URL)
	ctx := context.Background()

	// 1. GetSymbols
	symbols, err := svc.GetSymbols(ctx)
	if err != nil || len(symbols) != 2 || capturedPath != "/v1/symbols" {
		t.Fatalf("GetSymbols failed: %v", err)
	}

	// 2. GetSymbolDetails
	details, err := svc.GetSymbolDetails(ctx, "btcusd")
	if err != nil || details.Symbol == nil || *details.Symbol != "BTCUSD" || capturedPath != "/v1/symbols/details/btcusd" {
		t.Fatalf("GetSymbolDetails failed: %v", err)
	}

	// 3. GetTicker
	ticker, err := svc.GetTicker(ctx, "btcusd")
	if err != nil || ticker.Bid == nil || *ticker.Bid != "50000.00" || capturedPath != "/v1/pubticker/btcusd" {
		t.Fatalf("GetTicker failed: %v", err)
	}

	// 4. GetTickerV2
	tickerV2, err := svc.GetTickerV2(ctx, "btcusd")
	if err != nil || tickerV2.Symbol == nil || *tickerV2.Symbol != "BTCUSD" || capturedPath != "/v2/ticker/btcusd" {
		t.Fatalf("GetTickerV2 failed: %v", err)
	}

	// 5. GetOrderBook
	book, err := svc.GetOrderBook(ctx, "btcusd", 10, 10)
	if err != nil || book.Bids == nil || len(*book.Bids) != 1 || capturedPath != "/v1/book/btcusd" || capturedQuery != "limit_asks=10&limit_bids=10" {
		t.Fatalf("GetOrderBook failed: %v", err)
	}

	// 6. GetTrades
	trades, err := svc.GetTrades(ctx, "btcusd", 5)
	if err != nil || len(trades) != 1 || capturedPath != "/v1/trades/btcusd" || capturedQuery != "limit_trades=5" {
		t.Fatalf("GetTrades failed: %v", err)
	}

	// 7. GetCandles
	candles, err := svc.GetCandles(ctx, "btcusd", "1hr")
	if err != nil || len(candles) != 1 || capturedPath != "/v2/candles/btcusd/1hr" {
		t.Fatalf("GetCandles failed: %v", err)
	}
}
