package ws

import (
	"errors"
	"testing"
	"time"
)

func TestCircuitBreakerStates(t *testing.T) {
	cfg := ManagerConfig{
		APIKey:    "test-key",
		APISecret: "test-secret",
		URL:       "wss://test.example.com",
	}
	mgr := NewConnectionManager(cfg)

	if mgr.circuitState != circuitClosed {
		t.Errorf("initial state = %v, want %v", mgr.circuitState, circuitClosed)
	}

	retryableErr := errors.New("connection failed")
	for i := 0; i < circuitBreakerThreshold; i++ {
		mgr.recordFailure(retryableErr)
	}

	if mgr.circuitState != circuitOpen {
		t.Errorf("state after %d failures = %v, want %v", circuitBreakerThreshold, mgr.circuitState, circuitOpen)
	}

	err := mgr.checkCircuit()
	if !errors.Is(err, ErrCircuitOpen) {
		t.Errorf("checkCircuit() = %v, want %v", err, ErrCircuitOpen)
	}
}

func TestCircuitBreakerCooldown(t *testing.T) {
	cfg := ManagerConfig{
		APIKey:    "test-key",
		APISecret: "test-secret",
		URL:       "wss://test.example.com",
	}
	mgr := NewConnectionManager(cfg)

	retryableErr := errors.New("connection failed")
	for i := 0; i < circuitBreakerThreshold; i++ {
		mgr.recordFailure(retryableErr)
	}

	if mgr.circuitState != circuitOpen {
		t.Fatal("circuit should be open")
	}

	mgr.lastFailureTime = time.Now().Add(-circuitBreakerCooldown - time.Second)

	err := mgr.checkCircuit()
	if err != nil {
		t.Errorf("checkCircuit() after cooldown = %v, want nil", err)
	}

	if mgr.circuitState != circuitHalfOpen {
		t.Errorf("state after cooldown = %v, want %v", mgr.circuitState, circuitHalfOpen)
	}
}

func TestRecordSuccess(t *testing.T) {
	cfg := ManagerConfig{
		APIKey:    "test-key",
		APISecret: "test-secret",
		URL:       "wss://test.example.com",
	}
	mgr := NewConnectionManager(cfg)

	retryableErr := errors.New("connection failed")
	mgr.recordFailure(retryableErr)
	mgr.recordFailure(retryableErr)

	if mgr.consecutiveFailures != 2 {
		t.Errorf("consecutiveFailures = %d, want 2", mgr.consecutiveFailures)
	}

	mgr.recordSuccess()

	if mgr.consecutiveFailures != 0 {
		t.Errorf("consecutiveFailures after success = %d, want 0", mgr.consecutiveFailures)
	}
}

func TestRecordSuccess_HalfOpen(t *testing.T) {
	cfg := ManagerConfig{
		APIKey:    "test-key",
		APISecret: "test-secret",
		URL:       "wss://test.example.com",
	}
	mgr := NewConnectionManager(cfg)

	mgr.circuitState = circuitHalfOpen

	mgr.recordSuccess()

	if mgr.circuitState != circuitClosed {
		t.Errorf("state after success = %v, want %v", mgr.circuitState, circuitClosed)
	}
}

func TestManagerIsRetryableError(t *testing.T) {
	tests := []struct {
		name string
		err  error
		want bool
	}{
		{
			name: "nil error",
			err:  nil,
			want: false,
		},
		{
			name: "auth error 401",
			err:  &Error{Code: 401, Msg: "unauthorized"},
			want: false,
		},
		{
			name: "auth error 403",
			err:  &Error{Code: 403, Msg: "forbidden"},
			want: false,
		},
		{
			name: "bad request 400",
			err:  &Error{Code: 400, Msg: "bad request"},
			want: false,
		},
		{
			name: "generic error",
			err:  errors.New("connection lost"),
			want: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := isRetryableError(tt.err)
			if got != tt.want {
				t.Errorf("isRetryableError(%v) = %v, want %v", tt.err, got, tt.want)
			}
		})
	}
}

func TestManagerShouldFallback(t *testing.T) {
	tests := []struct {
		name string
		err  error
		want bool
	}{
		{
			name: "nil error",
			err:  nil,
			want: false,
		},
		{
			name: "circuit open",
			err:  ErrCircuitOpen,
			want: true,
		},
		{
			name: "auth error",
			err:  &Error{Code: 401, Msg: "unauthorized"},
			want: false,
		},
		{
			name: "bad request",
			err:  &Error{Code: 400, Msg: "bad request"},
			want: false,
		},
		{
			name: "generic error",
			err:  errors.New("connection lost"),
			want: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := shouldFallback(tt.err)
			if got != tt.want {
				t.Errorf("shouldFallback(%v) = %v, want %v", tt.err, got, tt.want)
			}
		})
	}
}
