package services_test

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gemini/gemini-go"
	"github.com/gemini/gemini-go/generated/margin"
	"github.com/gemini/gemini-go/services"
	"github.com/gemini/gemini-go/transport"
)

func TestMarginService_Methods(t *testing.T) {
	server := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		switch r.URL.Path {
		case "/v1/margin/account":
			_ = json.NewEncoder(w).Encode(map[string]any{
				"account": "primary",
			})
		case "/v1/margin/rates":
			_ = json.NewEncoder(w).Encode(map[string]any{
				"rates": []map[string]any{
					{"currency": "USD", "rate": 0.05},
				},
			})
		case "/v1/margin/order/preview":
			_ = json.NewEncoder(w).Encode(map[string]any{
				"result": "ok",
			})
		default:
			http.NotFound(w, r)
		}
	}))
	defer server.Close()

	trans := transport.NewClient(transport.WithHTTPClient(server.Client()))
	svc := services.NewMarginService(trans, server.URL)
	ctx := context.Background()

	summary, err := svc.GetAccountSummary(ctx, nil)
	if err != nil || summary == nil {
		t.Fatalf("GetAccountSummary failed: %v", err)
	}

	rates, err := svc.GetInterestRates(ctx, nil)
	if err != nil || rates == nil {
		t.Fatalf("GetInterestRates failed: %v", err)
	}

	preview, err := svc.PreviewOrder(ctx, &margin.PreviewMarginOrderJSONBody{
		Symbol: "btcusd",
		Amount: gemini.Ptr("1.0"),
		Price:  gemini.Ptr("50000.00"),
		Side:   margin.Buy,
		Type:   margin.Limit,
	})
	if err != nil || preview == nil {
		t.Fatalf("PreviewOrder failed: %v", err)
	}
}
