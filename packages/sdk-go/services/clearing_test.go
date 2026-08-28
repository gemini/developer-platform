package services_test

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gemini/gemini-go/generated/clearing"
	"github.com/gemini/gemini-go/services"
	"github.com/gemini/gemini-go/transport"
)

func TestClearingService_Methods(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		switch r.URL.Path {
		case "/v1/clearing/new":
			_ = json.NewEncoder(w).Encode(map[string]any{
				"clearing_id": "clr-999",
				"status":      "AwaitingConfirm",
			})
		case "/v1/clearing/status":
			_ = json.NewEncoder(w).Encode(map[string]any{
				"clearing_id": "clr-999",
				"status":      "Confirmed",
			})
		case "/v1/clearing/cancel":
			_ = json.NewEncoder(w).Encode(map[string]any{
				"result":  "ok",
				"details": "clr-999 order canceled",
			})
		case "/v1/clearing/confirm":
			_ = json.NewEncoder(w).Encode(map[string]any{
				"result": "confirmed",
			})
		default:
			http.NotFound(w, r)
		}
	}))
	defer server.Close()

	trans := transport.NewClient(transport.WithHTTPClient(server.Client()))
	svc := services.NewClearingService(trans, server.URL)
	ctx := context.Background()

	cpID := "cp-123"
	res, err := svc.NewClearingOrder(ctx, &clearing.CreateNewClearingOrderJSONBody{
		CounterpartyId: &cpID,
		Symbol:         "btcusd",
		Amount:         "1.5",
		Price:          "50000.00",
		Side:           clearing.CreateNewClearingOrderJSONBodySideBuy,
	})
	if err != nil || res == nil || res.ClearingId == nil || *res.ClearingId != "clr-999" {
		t.Fatalf("NewClearingOrder failed: %v", err)
	}

	// GetClearingOrder
	status, err := svc.GetClearingOrder(ctx, &clearing.GetClearingOrderJSONBody{ClearingId: "clr-999"})
	if err != nil || status == nil || status.Status == nil || *status.Status != "Confirmed" {
		t.Fatalf("GetClearingOrder failed: %v", err)
	}

	// CancelClearingOrder
	cancelRes, err := svc.CancelClearingOrder(ctx, &clearing.CancelClearingOrderJSONBody{ClearingId: "clr-999"})
	if err != nil || cancelRes.Result != "ok" {
		t.Fatalf("CancelClearingOrder failed: %v", err)
	}

	// ConfirmClearingOrder
	confirmRes, err := svc.ConfirmClearingOrder(ctx, &clearing.ConfirmClearingOrderJSONBody{
		ClearingId: "clr-999",
		Symbol:     "btcusd",
		Amount:     "1.5",
		Price:      "50000.00",
		Side:       clearing.ConfirmClearingOrderJSONBodySideBuy,
	})
	if err != nil || confirmRes.Result != "confirmed" {
		t.Fatalf("ConfirmClearingOrder failed: %v", err)
	}
}
