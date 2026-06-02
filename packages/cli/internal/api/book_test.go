package api

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestGetOrderBook(t *testing.T) {
	tests := []struct {
		name       string
		symbol     string
		limitBids  int
		limitAsks  int
		wantBids   int
		wantAsks   int
		serverResp OrderBook
	}{
		{
			name:      "with limits",
			symbol:    "btcusd",
			limitBids: 5,
			limitAsks: 10,
			wantBids:  5,
			wantAsks:  10,
			serverResp: OrderBook{
				Bids: []OrderBookEntry{
					{Price: "50000", Amount: "1.5"},
					{Price: "49999", Amount: "2.0"},
					{Price: "49998", Amount: "1.0"},
					{Price: "49997", Amount: "0.5"},
					{Price: "49996", Amount: "1.2"},
				},
				Asks: []OrderBookEntry{
					{Price: "50001", Amount: "1.0"},
					{Price: "50002", Amount: "2.0"},
					{Price: "50003", Amount: "1.5"},
					{Price: "50004", Amount: "0.8"},
					{Price: "50005", Amount: "1.0"},
					{Price: "50006", Amount: "0.5"},
					{Price: "50007", Amount: "2.5"},
					{Price: "50008", Amount: "1.2"},
					{Price: "50009", Amount: "0.9"},
					{Price: "50010", Amount: "1.8"},
				},
			},
		},
		{
			name:      "without limits",
			symbol:    "ethusd",
			limitBids: 0,
			limitAsks: 0,
			wantBids:  2,
			wantAsks:  2,
			serverResp: OrderBook{
				Bids: []OrderBookEntry{
					{Price: "3000", Amount: "5.0"},
					{Price: "2999", Amount: "3.0"},
				},
				Asks: []OrderBookEntry{
					{Price: "3001", Amount: "4.0"},
					{Price: "3002", Amount: "2.0"},
				},
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				if r.URL.Path != "/v1/book/"+tt.symbol {
					t.Errorf("unexpected path: %s", r.URL.Path)
				}

				if tt.limitBids > 0 {
					if got := r.URL.Query().Get("limit_bids"); got == "" {
						t.Error("missing limit_bids query param")
					}
				}
				if tt.limitAsks > 0 {
					if got := r.URL.Query().Get("limit_asks"); got == "" {
						t.Error("missing limit_asks query param")
					}
				}

				w.Header().Set("Content-Type", "application/json")
				json.NewEncoder(w).Encode(tt.serverResp)
			}))
			defer server.Close()

			client := &Client{
				baseURL:        server.URL,
				httpClient:     server.Client(),
				circuitBreaker: newCircuitBreaker(),
			}

			book, err := client.GetOrderBook(context.Background(), tt.symbol, tt.limitBids, tt.limitAsks)
			if err != nil {
				t.Fatalf("GetOrderBook() error = %v", err)
			}

			if len(book.Bids) != tt.wantBids {
				t.Errorf("len(Bids) = %d, want %d", len(book.Bids), tt.wantBids)
			}
			if len(book.Asks) != tt.wantAsks {
				t.Errorf("len(Asks) = %d, want %d", len(book.Asks), tt.wantAsks)
			}
		})
	}
}

func TestGetOrderBook_ErrorHandling(t *testing.T) {
	tests := []struct {
		name       string
		statusCode int
		wantError  bool
	}{
		{"success", http.StatusOK, false},
		{"not found", http.StatusNotFound, true},
		{"server error", http.StatusInternalServerError, true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				w.WriteHeader(tt.statusCode)
				if tt.statusCode == http.StatusOK {
					json.NewEncoder(w).Encode(OrderBook{
						Bids: []OrderBookEntry{{Price: "50000", Amount: "1.0"}},
						Asks: []OrderBookEntry{{Price: "50001", Amount: "1.0"}},
					})
				} else {
					json.NewEncoder(w).Encode(map[string]string{
						"result":  "error",
						"message": "test error",
					})
				}
			}))
			defer server.Close()

			client := &Client{
				baseURL:        server.URL,
				httpClient:     server.Client(),
				circuitBreaker: newCircuitBreaker(),
			}

			_, err := client.GetOrderBook(context.Background(), "btcusd", 10, 10)
			if (err != nil) != tt.wantError {
				t.Errorf("GetOrderBook() error = %v, wantError %v", err, tt.wantError)
			}
		})
	}
}
