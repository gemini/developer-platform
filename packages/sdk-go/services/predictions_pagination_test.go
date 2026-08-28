package services_test

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gemini/gemini-go/generated/predictions"
	"github.com/gemini/gemini-go/services"
	"github.com/gemini/gemini-go/transport"
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
