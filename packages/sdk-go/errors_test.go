package gemini_test

import (
	"errors"
	"net/http"
	"testing"
	"time"

	"github.com/gemini/developer-platform/packages/sdk-go"
	"github.com/gemini/developer-platform/packages/sdk-go/transport"
)

func TestErrors_DomainVsAPIClassification(t *testing.T) {
	// 1. Domain Errors originating from API responses with specific reasons
	domainReasons := []struct {
		reason   string
		expected error
		checkFn  func(error) bool
	}{
		{"InsufficientFunds", gemini.ErrInsufficientFunds, gemini.IsInsufficientFunds},
		{"MarketClosed", gemini.ErrMarketClosed, gemini.IsMarketClosed},
		{"TradingClosed", gemini.ErrMarketClosed, gemini.IsMarketClosed},
		{"OrderNotFound", gemini.ErrOrderNotFound, gemini.IsOrderNotFound},
		{"NoSuchOrder", gemini.ErrOrderNotFound, gemini.IsOrderNotFound},
		{"SelfCrossPrevented", gemini.ErrSelfCrossPrevented, gemini.IsSelfCrossPrevented},
		{"MustAcceptTerms", gemini.ErrAcceptTermsRequired, gemini.IsTermsRequired},
		{"MissingRole", gemini.ErrMissingRole, gemini.IsPermissionDenied},
		{"InvalidNonce", gemini.ErrInvalidNonce, gemini.IsAuthError},
		{"MissingNonce", gemini.ErrInvalidNonce, gemini.IsAuthError},
		{"InvalidSignature", gemini.ErrInvalidSignature, gemini.IsAuthError},
	}

	for _, tt := range domainReasons {
		t.Run("Reason_"+tt.reason, func(t *testing.T) {
			apiErr := &gemini.APIError{
				StatusCode: http.StatusBadRequest,
				Result:     "error",
				Reason:     tt.reason,
				Message:    "Domain error occurred: " + tt.reason,
				RequestID:  "req-12345",
			}

			// Must be classified as both an APIError and a DomainError
			if !gemini.IsAPIError(apiErr) {
				t.Fatalf("expected IsAPIError to be true for reason %s", tt.reason)
			}
			if !gemini.IsDomainError(apiErr) {
				t.Fatalf("expected IsDomainError to be true for reason %s", tt.reason)
			}
			if !apiErr.IsDomain() {
				t.Fatalf("expected APIError.IsDomain to be true for reason %s", tt.reason)
			}
			if !errors.Is(apiErr, tt.expected) {
				t.Fatalf("expected errors.Is(apiErr, %v) to be true for reason %s", tt.expected, tt.reason)
			}
			if !tt.checkFn(apiErr) {
				t.Fatalf("expected predicate check to return true for reason %s", tt.reason)
			}
			if reqID := gemini.RequestIDFromError(apiErr); reqID != "req-12345" {
				t.Fatalf("expected request ID 'req-12345', got '%s'", reqID)
			}
		})
	}

	// 2. Pure API / HTTP Status Errors without domain reasons
	httpStatuses := []struct {
		status   int
		expected error
		checkFn  func(error) bool
	}{
		{http.StatusBadRequest, gemini.ErrBadRequest, gemini.IsBadRequest},
		{http.StatusUnauthorized, gemini.ErrUnauthorized, gemini.IsAuthError},
		{http.StatusForbidden, gemini.ErrPermissionDenied, gemini.IsPermissionDenied},
		{http.StatusNotFound, gemini.ErrNotFound, gemini.IsNotFound},
		{http.StatusConflict, gemini.ErrConflict, gemini.IsConflict},
		{http.StatusInternalServerError, gemini.ErrInternalServer, gemini.IsInternalServerError},
		{http.StatusServiceUnavailable, gemini.ErrServiceUnavailable, gemini.IsServiceUnavailable},
		{http.StatusBadGateway, gemini.ErrServiceUnavailable, gemini.IsServiceUnavailable},
		{http.StatusGatewayTimeout, gemini.ErrServiceUnavailable, gemini.IsServiceUnavailable},
	}

	for _, tt := range httpStatuses {
		t.Run("Status_"+http.StatusText(tt.status), func(t *testing.T) {
			apiErr := &gemini.APIError{
				StatusCode: tt.status,
				RequestID:  "req-status",
			}

			if !gemini.IsAPIError(apiErr) {
				t.Fatalf("expected IsAPIError to be true for status %d", tt.status)
			}
			if gemini.IsDomainError(apiErr) {
				t.Fatalf("expected IsDomainError to be false for generic HTTP status %d", tt.status)
			}
			if !errors.Is(apiErr, tt.expected) {
				t.Fatalf("expected errors.Is(apiErr, %v) to be true for status %d", tt.expected, tt.status)
			}
			if !tt.checkFn(apiErr) {
				t.Fatalf("expected predicate check to return true for status %d", tt.status)
			}
		})
	}

	// 3. RateLimitError with retry metadata
	rateLimitErr := &gemini.RateLimitError{
		APIError: gemini.APIError{
			StatusCode: http.StatusTooManyRequests,
			RequestID:  "req-429",
		},
		RetryAfter: 2 * time.Second,
	}

	if !gemini.IsAPIError(rateLimitErr) {
		t.Fatal("expected IsAPIError to be true for RateLimitError")
	}
	if !gemini.IsRateLimit(rateLimitErr) {
		t.Fatal("expected IsRateLimit to be true for RateLimitError")
	}
	if !errors.Is(rateLimitErr, gemini.ErrRateLimited) {
		t.Fatal("expected errors.Is(rateLimitErr, ErrRateLimited) to be true")
	}
	if reqID := gemini.RequestIDFromError(rateLimitErr); reqID != "req-429" {
		t.Fatalf("expected request ID 'req-429', got '%s'", reqID)
	}

	// 4. Client / Local Errors (Not API errors)
	clientErrors := []struct {
		err     error
		checkFn func(error) bool
	}{
		{gemini.ErrResyncRequired, gemini.IsResyncRequired},
		{gemini.ErrDeadlineExceeded, gemini.IsTimeout},
		{&transport.ResyncRequiredError{LastUpdateID: 100, FirstUpdateID: 105}, gemini.IsResyncRequired},
	}

	for _, tt := range clientErrors {
		if gemini.IsAPIError(tt.err) {
			t.Fatalf("expected IsAPIError to be false for local error: %v", tt.err)
		}
		if !tt.checkFn(tt.err) {
			t.Fatalf("expected predicate to be true for local error: %v", tt.err)
		}
	}
}

func TestErrors_ErrorsAsAndReasonConstants(t *testing.T) {
	rawErr := &gemini.APIError{
		StatusCode: http.StatusBadRequest,
		Result:     "error",
		Reason:     gemini.ReasonInsufficientFunds,
		Message:    "Failed to place order: insufficient balance",
		RequestID:  "req-order-123",
	}

	var geminiErr *gemini.APIError
	if !errors.As(rawErr, &geminiErr) {
		t.Fatalf("expected errors.As(err, &geminiErr) to succeed")
	}

	switch geminiErr.Reason {
	case gemini.ReasonInsufficientFunds:
		// expected
	default:
		t.Fatalf("unexpected reason: %s", geminiErr.Reason)
	}

	if geminiErr.StatusCode != 400 {
		t.Fatalf("expected status code 400, got %d", geminiErr.StatusCode)
	}
	if geminiErr.RequestID != "req-order-123" {
		t.Fatalf("expected request ID 'req-order-123', got '%s'", geminiErr.RequestID)
	}
}
