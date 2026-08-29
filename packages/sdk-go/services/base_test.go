package services

import (
	"context"
	"errors"
	"testing"

	"github.com/gemini/developer-platform/packages/sdk-go/transport"
)

func TestBaseServiceRejectsNilTransport(t *testing.T) {
	service := NewMarketDataService(nil, "https://api.gemini.com")
	_, err := service.GetSymbols(context.Background())
	if !errors.Is(err, ErrInvalidServiceConfiguration) {
		t.Fatalf("expected invalid service configuration, got %v", err)
	}
}

func TestBaseServiceRejectsEmptyBaseURL(t *testing.T) {
	service := NewMarketDataService(transport.NewClient(), "")
	_, err := service.GetSymbols(context.Background())
	if !errors.Is(err, ErrInvalidServiceConfiguration) {
		t.Fatalf("expected invalid service configuration, got %v", err)
	}
}
