package api

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestGetBalances(t *testing.T) {
	expectedBalances := []Balance{
		{
			Currency:               "USD",
			Amount:                 "10000.50",
			Available:              "9500.00",
			AvailableForWithdrawal: "9500.00",
		},
		{
			Currency:               "BTC",
			Amount:                 "0.5",
			Available:              "0.5",
			AvailableForWithdrawal: "0.5",
		},
	}

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v1/balances" {
			t.Errorf("unexpected path: %s", r.URL.Path)
		}
		if r.Method != http.MethodPost {
			t.Errorf("unexpected method: %s", r.Method)
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(expectedBalances)
	}))
	defer server.Close()

	client := &Client{
		baseURL:        server.URL,
		httpClient:     server.Client(),
		auth:           NewHMACAuthenticator("test-key", "test-secret"),
		circuitBreaker: newCircuitBreaker(),
	}

	balances, err := client.GetBalances(context.Background())
	if err != nil {
		t.Fatalf("GetBalances() error = %v", err)
	}

	if len(balances) != len(expectedBalances) {
		t.Errorf("len(balances) = %d, want %d", len(balances), len(expectedBalances))
	}

	for i, bal := range balances {
		if bal.Currency != expectedBalances[i].Currency {
			t.Errorf("balances[%d].Currency = %s, want %s", i, bal.Currency, expectedBalances[i].Currency)
		}
		if bal.Amount != expectedBalances[i].Amount {
			t.Errorf("balances[%d].Amount = %s, want %s", i, bal.Amount, expectedBalances[i].Amount)
		}
	}
}

func TestGetNotionalVolumeAcceptsNumericVolumes(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v1/notionalvolume" {
			t.Errorf("unexpected path: %s", r.URL.Path)
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{
			"date":"2026-05-14",
			"last_updated_ms":1778760000000,
			"api_maker_fee_bps":20,
			"api_taker_fee_bps":40,
			"notional_30d_volume":123.45,
			"notional_1y_volume":"678.90"
		}`))
	}))
	defer server.Close()

	client := &Client{
		baseURL:        server.URL,
		httpClient:     server.Client(),
		auth:           NewHMACAuthenticator("test-key", "test-secret"),
		circuitBreaker: newCircuitBreaker(),
	}

	got, err := client.GetNotionalVolume(context.Background())
	if err != nil {
		t.Fatalf("GetNotionalVolume() error = %v", err)
	}
	if got.NotionalThirtyDayVolume != "123.45" {
		t.Fatalf("NotionalThirtyDayVolume = %q, want 123.45", got.NotionalThirtyDayVolume)
	}
	if got.NotionalOneYearVolume != "678.90" {
		t.Fatalf("NotionalOneYearVolume = %q, want 678.90", got.NotionalOneYearVolume)
	}
}
