package services_test

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gemini/developer-platform/packages/sdk-go/generated/predictions"
	"github.com/gemini/developer-platform/packages/sdk-go/services"
	"github.com/gemini/developer-platform/packages/sdk-go/transport"
)

func TestIterateOrderHistoryRejectsTimeBoundedOffsetPagination(t *testing.T) {
	var requests int
	server := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		requests++
		_, _ = w.Write([]byte(`{"orders":[]}`))
	}))
	defer server.Close()

	service := services.NewPredictionsService(
		transport.NewClient(transport.WithHTTPClient(server.Client())),
		server.URL,
	)
	from := int64(1775001600000)
	seen := 0
	for _, err := range service.IterateOrderHistory(context.Background(), &predictions.GetOrderHistoryJSONRequestBody{From: &from}) {
		seen++
		if err != services.ErrTimeBoundedOrderHistoryPagination {
			t.Fatalf("expected bounded-pagination error, got %v", err)
		}
	}
	if seen != 1 {
		t.Fatalf("expected one iterator error, got %d values", seen)
	}
	if requests != 0 {
		t.Fatalf("expected no repeated HTTP requests, got %d", requests)
	}
}

func TestPredictionIteratorsRejectInvalidPagination(t *testing.T) {
	service := services.NewPredictionsService(transport.NewClient(), "https://api.gemini.com")
	invalidOffset := -1
	seen := 0
	for _, err := range service.IteratePositions(context.Background(), &predictions.GetPositionsParams{Offset: &invalidOffset}) {
		seen++
		if !errors.Is(err, services.ErrInvalidPagination) {
			t.Fatalf("expected invalid-pagination error, got %v", err)
		}
	}
	if seen != 1 {
		t.Fatalf("expected one iterator error, got %d values", seen)
	}
}

func TestIterateActiveOrdersCapsEndpointPageSize(t *testing.T) {
	type requestPage struct {
		offset int
		limit  int
	}
	var requests []requestPage
	server := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var body struct {
			Offset int `json:"offset"`
			Limit  int `json:"limit"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		requests = append(requests, requestPage{offset: body.Offset, limit: body.Limit})

		// Model the endpoint's 100-item cap even when a caller requests a
		// larger page. The iterator must advance rather than treating the
		// capped response as the final page.
		count := 100
		if body.Offset >= 100 {
			count = 50
		}
		orders := make([]map[string]any, count)
		for i := range orders {
			orders[i] = map[string]any{"orderId": body.Offset + i + 1}
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{"orders": orders})
	}))
	defer server.Close()

	service := services.NewPredictionsService(
		transport.NewClient(transport.WithHTTPClient(server.Client())),
		server.URL,
	)
	requestedLimit := 200
	seen := 0
	for _, err := range service.IterateActiveOrders(context.Background(), &predictions.GetActiveOrdersJSONRequestBody{Limit: &requestedLimit}) {
		if err != nil {
			t.Fatalf("iterator failed: %v", err)
		}
		seen++
	}

	if seen != 150 {
		t.Fatalf("expected all 150 orders across capped pages, got %d", seen)
	}
	if len(requests) != 2 {
		t.Fatalf("expected two page requests, got %+v", requests)
	}
	if requests[0] != (requestPage{offset: 0, limit: 100}) || requests[1] != (requestPage{offset: 100, limit: 100}) {
		t.Fatalf("expected capped sequential pages, got %+v", requests)
	}
}
