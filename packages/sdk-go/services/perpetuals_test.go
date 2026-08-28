package services_test

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gemini/gemini-go/auth"
	"github.com/gemini/gemini-go/services"
	"github.com/gemini/gemini-go/transport"
)

func TestPerpetualsService_FundingEndpoints(t *testing.T) {
	mux := http.NewServeMux()

	// 1. Funding Amount
	mux.HandleFunc("/v1/fundingamount/btcgusdperp", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			w.WriteHeader(http.StatusMethodNotAllowed)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{
			"symbol":                    "btcgusdperp",
			"amount":                    0.000125,
			"estimatedFundingAmount":    0.000150,
			"fundingDateTime":           "2026-08-20T14:00:00.000Z",
			"fundingTimestampMilliSecs": 1750000000000,
			"nextFundingTimestamp":      1750003600000,
		})
	})

	// 2. Next Funding Timestamp
	mux.HandleFunc("/v1/nextfundingtimestamp/btcgusdperp", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			w.WriteHeader(http.StatusMethodNotAllowed)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(int64(1750000000000))
	})

	// 3. Historical Funding Rates
	mux.HandleFunc("/v1/perpetuals/fundingPayment", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			w.WriteHeader(http.StatusMethodNotAllowed)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode([]map[string]any{
			{"eventType": "Hourly Funding Transfer", "hourlyFundingTransfer": map[string]any{
				"eventType": "Hourly Funding Transfer", "timestamp": 1750000000000,
				"assetCode": "GUSD", "action": "Debit",
				"quantity": map[string]any{"currency": "GUSD", "value": "0.000120"},
			}},
			{"eventType": "Hourly Funding Transfer", "hourlyFundingTransfer": map[string]any{
				"eventType": "Hourly Funding Transfer", "timestamp": 1750003600000,
				"assetCode": "GUSD", "action": "Debit",
				"quantity": map[string]any{"currency": "GUSD", "value": "0.000125"},
			}},
		})
	})

	server := httptest.NewServer(mux)
	defer server.Close()

	tr := transport.NewClient(
		transport.WithHTTPClient(server.Client()),
		transport.WithAuth(auth.NewHMAC("key", "secret")),
	)
	svc := services.NewPerpetualsService(tr, server.URL)

	ctx := context.Background()

	// 1. Test GetFundingAmount
	fundingAmt, err := svc.GetFundingAmount(ctx, "btcgusdperp")
	if err != nil {
		t.Fatalf("GetFundingAmount failed: %v", err)
	}
	if fundingAmt == nil || *fundingAmt.Symbol != "btcgusdperp" || fundingAmt.Amount == nil || fundingAmt.Amount.String() != "0.000125" {
		t.Fatalf("unexpected fundingAmount response: %+v", fundingAmt)
	}

	// 2. Test GetNextFundingTimestamp
	nextTs, err := svc.GetNextFundingTimestamp(ctx, "btcgusdperp")
	if err != nil {
		t.Fatalf("GetNextFundingTimestamp failed: %v", err)
	}
	if nextTs != int64(1750000000000) {
		t.Fatalf("unexpected nextFundingTimestamp response: %d", nextTs)
	}

	// 3. Test GetFundingPayments
	rates, err := svc.GetFundingPayments(ctx, nil, nil, nil)
	if err != nil {
		t.Fatalf("GetFundingPayments failed: %v", err)
	}
	if len(rates) != 2 {
		t.Fatalf("expected 2 funding rate records, got %d", len(rates))
	}
}
