package api

import (
	"testing"
	"time"
)

func TestCircuitBreaker_InitialState(t *testing.T) {
	cb := newCircuitBreaker()

	if cb.IsOpen() {
		t.Error("new circuit breaker should be closed")
	}

	if cb.RetryAfter() != 0 {
		t.Errorf("RetryAfter() = %v, want 0", cb.RetryAfter())
	}
}

func TestCircuitBreaker_Trip(t *testing.T) {
	cb := newCircuitBreaker()

	cb.Trip(100 * time.Millisecond)

	if !cb.IsOpen() {
		t.Error("circuit breaker should be open after trip")
	}

	retryAfter := cb.RetryAfter()
	if retryAfter <= 0 || retryAfter > 100*time.Millisecond {
		t.Errorf("RetryAfter() = %v, want between 0 and 100ms", retryAfter)
	}

	// Wait for circuit to close
	time.Sleep(150 * time.Millisecond)

	if cb.IsOpen() {
		t.Error("circuit breaker should be closed after timeout")
	}

	if cb.RetryAfter() != 0 {
		t.Errorf("RetryAfter() after timeout = %v, want 0", cb.RetryAfter())
	}
}

func TestCircuitBreaker_Reset(t *testing.T) {
	cb := newCircuitBreaker()

	cb.Trip(1 * time.Hour)
	if !cb.IsOpen() {
		t.Error("circuit breaker should be open after trip")
	}

	cb.Reset()
	if cb.IsOpen() {
		t.Error("circuit breaker should be closed after reset")
	}
}

func TestAPIError_Error(t *testing.T) {
	tests := []struct {
		name     string
		err      APIError
		expected string
	}{
		{
			name:     "with reason",
			err:      APIError{Code: "ERR001", Message: "Something failed", Reason: "invalid input"},
			expected: "ERR001: Something failed (invalid input)",
		},
		{
			name:     "without reason",
			err:      APIError{Code: "ERR002", Message: "Another error"},
			expected: "ERR002: Another error",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := tt.err.Error()
			if got != tt.expected {
				t.Errorf("Error() = %q, want %q", got, tt.expected)
			}
		})
	}
}

func TestRateLimitError_Error(t *testing.T) {
	err := RateLimitError{RetryAfter: 30 * time.Second}

	got := err.Error()
	expected := "rate limited, retry after 30s"
	if got != expected {
		t.Errorf("Error() = %q, want %q", got, expected)
	}
}

func TestCryptoRandFloat64(t *testing.T) {
	// Test that it returns values in [0, 1)
	for i := 0; i < 100; i++ {
		val := cryptoRandFloat64()
		if val < 0 || val >= 1 {
			t.Errorf("cryptoRandFloat64() = %v, want [0, 1)", val)
		}
	}

	// Test that values are somewhat random (not all the same)
	vals := make(map[float64]bool)
	for i := 0; i < 10; i++ {
		vals[cryptoRandFloat64()] = true
	}
	if len(vals) < 5 {
		t.Errorf("cryptoRandFloat64() produced only %d unique values in 10 calls", len(vals))
	}
}

func TestSentinelErrors(t *testing.T) {
	// Test that sentinel errors exist and are different
	errors := []error{
		ErrInsufficientFunds,
		ErrOrderNotFound,
		ErrMarketClosed,
		ErrInvalidPrice,
	}

	seen := make(map[string]bool)
	for _, err := range errors {
		msg := err.Error()
		if msg == "" {
			t.Error("sentinel error has empty message")
		}
		if seen[msg] {
			t.Errorf("duplicate error message: %q", msg)
		}
		seen[msg] = true
	}
}
