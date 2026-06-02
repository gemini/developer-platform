package api

import (
	"errors"
	"net/http"
	"testing"
	"time"
)

func TestShouldRetry(t *testing.T) {
	tests := []struct {
		name       string
		statusCode int
		err        error
		want       bool
	}{
		{
			name:       "429 rate limit",
			statusCode: http.StatusTooManyRequests,
			want:       true,
		},
		{
			name:       "500 server error",
			statusCode: http.StatusInternalServerError,
			want:       true,
		},
		{
			name:       "502 bad gateway",
			statusCode: http.StatusBadGateway,
			want:       true,
		},
		{
			name:       "503 service unavailable",
			statusCode: http.StatusServiceUnavailable,
			want:       true,
		},
		{
			name:       "504 gateway timeout",
			statusCode: http.StatusGatewayTimeout,
			want:       true,
		},
		{
			name:       "400 bad request",
			statusCode: http.StatusBadRequest,
			want:       false,
		},
		{
			name:       "401 unauthorized",
			statusCode: http.StatusUnauthorized,
			want:       false,
		},
		{
			name:       "404 not found",
			statusCode: http.StatusNotFound,
			want:       false,
		},
		{
			name:       "200 success",
			statusCode: http.StatusOK,
			want:       false,
		},
		{
			name:       "network error",
			statusCode: 0,
			err:        errors.New("connection refused"),
			want:       false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			c := &Client{}
			got := c.shouldRetry(tt.statusCode)
			if got != tt.want {
				t.Errorf("shouldRetry(%d) = %v, want %v", tt.statusCode, got, tt.want)
			}
		})
	}
}

func TestBackoffDuration(t *testing.T) {
	c := &Client{
		baseDelay: 500 * time.Millisecond,
		maxDelay:  30 * time.Second,
	}

	tests := []struct {
		name       string
		attempt    int
		retryAfter time.Duration
		wantMin    time.Duration
		wantMax    time.Duration
	}{
		{
			name:       "first attempt",
			attempt:    0,
			retryAfter: 0,
			wantMin:    250 * time.Millisecond,
			wantMax:    750 * time.Millisecond,
		},
		{
			name:       "second attempt",
			attempt:    1,
			retryAfter: 0,
			wantMin:    500 * time.Millisecond,
			wantMax:    1500 * time.Millisecond,
		},
		{
			name:       "with retry-after header",
			attempt:    0,
			retryAfter: 5 * time.Second,
			wantMin:    5 * time.Second,
			wantMax:    5 * time.Second,
		},
		{
			name:       "capped at max delay",
			attempt:    10,
			retryAfter: 0,
			wantMin:    0,
			wantMax:    30 * time.Second,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := c.backoffDuration(tt.attempt, tt.retryAfter)

			if tt.retryAfter > 0 {
				if got != tt.retryAfter {
					t.Errorf("backoffDuration() = %v, want %v (retry-after)", got, tt.retryAfter)
				}
				return
			}

			if got < tt.wantMin {
				t.Errorf("backoffDuration() = %v, want >= %v", got, tt.wantMin)
			}
			if got > tt.wantMax {
				t.Errorf("backoffDuration() = %v, want <= %v", got, tt.wantMax)
			}
		})
	}
}

func TestBackoffDuration_Jitter(t *testing.T) {
	c := &Client{
		baseDelay: 1 * time.Second,
		maxDelay:  30 * time.Second,
	}

	durations := make(map[time.Duration]bool)
	for i := 0; i < 10; i++ {
		d := c.backoffDuration(1, 0)
		durations[d] = true
	}

	if len(durations) < 3 {
		t.Errorf("backoffDuration() produced only %d unique values in 10 calls, want at least 3 (jitter not working)", len(durations))
	}
}
