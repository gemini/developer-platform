package ws

import (
	"context"
	"errors"
	"testing"
	"time"
)

func TestCircuitBreaker(t *testing.T) {
	cfg := ManagerConfig{
		APIKey:    "test-key",
		APISecret: "test-secret",
		URL:       "wss://test.example.com",
	}
	mgr := NewConnectionManager(cfg)

	t.Run("initially closed", func(t *testing.T) {
		err := mgr.checkCircuit()
		if err != nil {
			t.Errorf("circuit should be closed initially, got error: %v", err)
		}
	})

	t.Run("opens after threshold failures", func(t *testing.T) {
		for i := 0; i < circuitBreakerThreshold; i++ {
			mgr.recordFailure(errors.New("connection error"))
		}

		err := mgr.checkCircuit()
		if !errors.Is(err, ErrCircuitOpen) {
			t.Errorf("circuit should be open after %d failures, got: %v", circuitBreakerThreshold, err)
		}
	})

	t.Run("half-opens after cooldown", func(t *testing.T) {
		mgr.circuitMu.Lock()
		mgr.lastFailureTime = time.Now().Add(-circuitBreakerCooldown - time.Second)
		mgr.circuitMu.Unlock()

		err := mgr.checkCircuit()
		if err != nil {
			t.Errorf("circuit should be half-open after cooldown, got error: %v", err)
		}

		mgr.circuitMu.RLock()
		state := mgr.circuitState
		mgr.circuitMu.RUnlock()

		if state != circuitHalfOpen {
			t.Errorf("circuit state should be half-open, got: %v", state)
		}
	})

	t.Run("closes on success", func(t *testing.T) {
		mgr.circuitMu.Lock()
		mgr.circuitState = circuitHalfOpen
		mgr.circuitMu.Unlock()

		mgr.recordSuccess()

		mgr.circuitMu.RLock()
		state := mgr.circuitState
		failures := mgr.consecutiveFailures
		mgr.circuitMu.RUnlock()

		if state != circuitClosed {
			t.Errorf("circuit should be closed after success, got: %v", state)
		}
		if failures != 0 {
			t.Errorf("consecutive failures should be reset, got: %d", failures)
		}
	})

	t.Run("reopens on half-open failure", func(t *testing.T) {
		mgr.circuitMu.Lock()
		mgr.circuitState = circuitHalfOpen
		mgr.circuitMu.Unlock()

		mgr.recordFailure(errors.New("still failing"))

		mgr.circuitMu.RLock()
		state := mgr.circuitState
		mgr.circuitMu.RUnlock()

		if state != circuitOpen {
			t.Errorf("circuit should reopen on half-open failure, got: %v", state)
		}
	})
}

func TestIsRetryableError(t *testing.T) {
	tests := []struct {
		name      string
		err       error
		retryable bool
	}{
		{"nil error", nil, false},
		{"generic error", errors.New("connection failed"), true},
		{"context deadline", context.DeadlineExceeded, true},
		{"context canceled", context.Canceled, true},
		{"auth error 401", &Error{Code: 401, Msg: "unauthorized"}, false},
		{"auth error 403", &Error{Code: 403, Msg: "forbidden"}, false},
		{"bad request 400", &Error{Code: 400, Msg: "invalid params"}, false},
		{"server error 500", &Error{Code: 500, Msg: "internal error"}, true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := isRetryableError(tt.err)
			if got != tt.retryable {
				t.Errorf("isRetryableError(%v) = %v, want %v", tt.err, got, tt.retryable)
			}
		})
	}
}

func TestShouldFallback(t *testing.T) {
	tests := []struct {
		name     string
		err      error
		fallback bool
	}{
		{"nil error", nil, false},
		{"circuit open", ErrCircuitOpen, true},
		{"generic error", errors.New("connection failed"), true},
		{"auth error 401", &Error{Code: 401, Msg: "unauthorized"}, false},
		{"bad request 400", &Error{Code: 400, Msg: "invalid params"}, false},
		{"server error 500", &Error{Code: 500, Msg: "internal error"}, true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := shouldFallback(tt.err)
			if got != tt.fallback {
				t.Errorf("shouldFallback(%v) = %v, want %v", tt.err, got, tt.fallback)
			}
		})
	}
}

func TestManagerSingleton(t *testing.T) {
	ResetDefaultManager()

	cfg := ManagerConfig{
		APIKey:    "test-key",
		APISecret: "test-secret",
	}

	mgr1 := GetDefaultManager(cfg)
	mgr2 := GetDefaultManager(cfg)

	if mgr1 != mgr2 {
		t.Error("GetDefaultManager should return the same instance")
	}

	ResetDefaultManager()
}

func TestManagerConfig(t *testing.T) {
	t.Run("default URL", func(t *testing.T) {
		mgr := NewConnectionManager(ManagerConfig{})
		if mgr.config.URL != DefaultWSURL {
			t.Errorf("default URL = %v, want %v", mgr.config.URL, DefaultWSURL)
		}
	})

	t.Run("custom URL", func(t *testing.T) {
		customURL := "wss://custom.example.com"
		mgr := NewConnectionManager(ManagerConfig{URL: customURL})
		if mgr.config.URL != customURL {
			t.Errorf("custom URL = %v, want %v", mgr.config.URL, customURL)
		}
	})
}
