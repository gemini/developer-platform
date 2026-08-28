package transport

import (
	"crypto/rand"
	"errors"
	"io"
	"math"
	"math/big"
	"net"
	"net/http"
	"strconv"
	"strings"
	"syscall"
	"time"
)

// RetryPolicy defines parameters for automatic HTTP retry behavior.
type RetryPolicy struct {
	MaxRetries int
	BaseDelay  time.Duration
	MaxDelay   time.Duration
	Multiplier float64
	Jitter     bool
}

// DefaultRetryPolicy returns safe defaults matching Gemini TypeScript SDK.
func DefaultRetryPolicy() RetryPolicy {
	return RetryPolicy{
		MaxRetries: 5,
		BaseDelay:  250 * time.Millisecond,
		MaxDelay:   30 * time.Second,
		Multiplier: 2.0,
		Jitter:     true,
	}
}

// IsSafeMethod returns true only for idempotent/safe HTTP methods (GET, HEAD).
func IsSafeMethod(method string) bool {
	// net/http treats an empty Request.Method as GET on the wire.
	if method == "" {
		return true
	}
	upper := strings.ToUpper(method)
	return upper == http.MethodGet || upper == http.MethodHead
}

// IsRetryable checks if a request method, status code, or error is safe to retry.
func IsRetryable(method string, statusCode int, err error) bool {
	// CRITICAL SAFETY RULE: Never automatically retry mutating operations (POST, PUT, DELETE)
	if !IsSafeMethod(method) {
		return false
	}

	if err != nil {
		if errors.Is(err, io.EOF) || errors.Is(err, io.ErrUnexpectedEOF) {
			return true
		}
		if errors.Is(err, syscall.ECONNRESET) || errors.Is(err, syscall.ECONNREFUSED) || errors.Is(err, syscall.ETIMEDOUT) {
			return true
		}
		var netErr net.Error
		if errors.As(err, &netErr) && netErr.Timeout() {
			return true
		}
		return false
	}

	switch statusCode {
	case http.StatusTooManyRequests, // 429
		http.StatusBadGateway,         // 502
		http.StatusServiceUnavailable, // 503
		http.StatusGatewayTimeout:     // 504
		return true
	default:
		return false
	}
}

// parseRetryAfter parses the Retry-After header as delta seconds or HTTP Date.
func parseRetryAfter(header string) time.Duration {
	if header == "" {
		return 0
	}

	// 1. Try parsing integer delta seconds
	if secs, err := strconv.Atoi(strings.TrimSpace(header)); err == nil && secs >= 0 {
		const maxDuration = time.Duration(1<<63 - 1)
		if time.Duration(secs) > maxDuration/time.Second {
			return maxDuration
		}
		return time.Duration(secs) * time.Second
	}

	// 2. Try parsing HTTP-date
	if targetTime, err := http.ParseTime(header); err == nil {
		diff := time.Until(targetTime)
		if diff > 0 {
			return diff
		}
	}

	return 0
}

// CalculateBackoff determines the sleep duration before the next retry attempt.
func (p RetryPolicy) CalculateBackoff(attempt int, retryAfterHeader string) time.Duration {
	defaults := DefaultRetryPolicy()
	baseDelay := p.BaseDelay
	if baseDelay <= 0 {
		baseDelay = defaults.BaseDelay
	}
	maxDelay := p.MaxDelay
	if maxDelay <= 0 {
		maxDelay = defaults.MaxDelay
	}
	if maxDelay < baseDelay {
		maxDelay = baseDelay
	}
	multiplier := p.Multiplier
	if math.IsNaN(multiplier) || math.IsInf(multiplier, 0) || multiplier < 1 {
		multiplier = defaults.Multiplier
	}

	// Respect server-specified Retry-After if present
	if explicitDelay := parseRetryAfter(retryAfterHeader); explicitDelay > 0 {
		if explicitDelay > maxDelay {
			return maxDelay
		}
		return explicitDelay
	}

	// Exponential backoff: base * (multiplier ^ attempt)
	backoffFactor := math.Pow(multiplier, float64(attempt))
	delay := float64(baseDelay) * backoffFactor

	if math.IsInf(delay, 0) || math.IsNaN(delay) || delay > float64(maxDelay) {
		delay = float64(maxDelay)
	}

	// Full jitter randomizes uniformly between zero and the calculated delay.
	if p.Jitter {
		jitterFactor := 1.0
		if randomValue, err := rand.Int(rand.Reader, big.NewInt(1_000_000)); err == nil {
			jitterFactor = float64(randomValue.Int64()) / 1_000_000
		}
		delay *= jitterFactor
	}

	return time.Duration(delay)
}
