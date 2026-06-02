package api

import (
	"bytes"
	"context"
	"crypto/rand"
	"encoding/binary"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"math"
	"net/http"
	"net/url"
	"strconv"
	"sync"
	"time"

	"github.com/gemini/developer-platform/packages/cli/internal/config"
	"github.com/gemini/developer-platform/packages/cli/internal/debug"
	"github.com/gemini/developer-platform/packages/cli/internal/security"
)

// Compile-time interface checks.
var (
	_ error = (*APIError)(nil)
	_ error = (*RateLimitError)(nil)
)

// Sentinel errors for common API conditions.
var (
	ErrInsufficientFunds = errors.New("insufficient funds")
	ErrOrderNotFound     = errors.New("order not found")
	ErrMarketClosed      = errors.New("market is closed")
	ErrInvalidPrice      = errors.New("price outside valid range")
)

const (
	// DefaultMaxRetries is the default number of retry attempts for failed requests.
	DefaultMaxRetries = 3
	// DefaultBaseDelay is the initial delay before the first retry.
	DefaultBaseDelay = 500 * time.Millisecond
	// DefaultMaxDelay is the maximum delay between retries.
	DefaultMaxDelay = 30 * time.Second
)

// Client is the HTTP client for Gemini API requests.
type Client struct {
	baseURL        string
	httpClient     *http.Client
	auth           Authenticator
	maxRetries     int
	baseDelay      time.Duration
	maxDelay       time.Duration
	circuitBreaker *circuitBreaker
}

type circuitBreaker struct {
	openUntil time.Time
	mu        sync.RWMutex
}

func newCircuitBreaker() *circuitBreaker {
	return &circuitBreaker{}
}

func (cb *circuitBreaker) IsOpen() bool {
	cb.mu.RLock()
	defer cb.mu.RUnlock()
	return time.Now().Before(cb.openUntil)
}

func (cb *circuitBreaker) RetryAfter() time.Duration {
	cb.mu.RLock()
	defer cb.mu.RUnlock()
	if time.Now().Before(cb.openUntil) {
		return time.Until(cb.openUntil)
	}
	return 0
}

func (cb *circuitBreaker) Trip(duration time.Duration) {
	cb.mu.Lock()
	defer cb.mu.Unlock()
	cb.openUntil = time.Now().Add(duration)
	debug.Log("circuit breaker tripped for %v", duration)
}

func (cb *circuitBreaker) Reset() {
	cb.mu.Lock()
	defer cb.mu.Unlock()
	cb.openUntil = time.Time{}
}

// ClientOption is a functional option for configuring the Client.
type ClientOption func(*Client)

// WithTimeout sets the HTTP client timeout.
func WithTimeout(d time.Duration) ClientOption {
	return func(c *Client) {
		c.httpClient.Timeout = d
	}
}

// WithMaxRetries sets the maximum number of retry attempts.
func WithMaxRetries(n int) ClientOption {
	return func(c *Client) {
		c.maxRetries = n
	}
}

// WithAuthenticator overrides the default authenticator used by the client.
func WithAuthenticator(auth Authenticator) ClientOption {
	return func(c *Client) {
		c.auth = auth
	}
}

// NewClient creates a new API client with the given configuration.
func NewClient(cfg *config.Config, opts ...ClientOption) *Client {
	auth := NewAuthenticatorFromConfig(cfg)

	c := &Client{
		baseURL:        cfg.GetBaseURL(),
		httpClient:     security.NewSecureClient(30 * time.Second),
		auth:           auth,
		maxRetries:     DefaultMaxRetries,
		baseDelay:      DefaultBaseDelay,
		maxDelay:       DefaultMaxDelay,
		circuitBreaker: newCircuitBreaker(),
	}
	for _, opt := range opts {
		opt(c)
	}
	return c
}

// APIError represents an error response from the API.
type APIError struct { //nolint:revive // APIError is clearer than api.Error
	Code    string `json:"code"`
	Message string `json:"message"`
	Reason  string `json:"reason,omitempty"`
}

func (e *APIError) Error() string {
	if e.Reason != "" {
		return fmt.Sprintf("%s: %s (%s)", e.Code, e.Message, e.Reason)
	}
	return fmt.Sprintf("%s: %s", e.Code, e.Message)
}

// RateLimitError represents a rate limit error with retry timing.
type RateLimitError struct {
	RetryAfter time.Duration
}

func (e *RateLimitError) Error() string {
	return fmt.Sprintf("rate limited, retry after %v", e.RetryAfter)
}

func (c *Client) shouldRetry(statusCode int) bool {
	if statusCode == http.StatusTooManyRequests {
		return true
	}
	if statusCode >= 500 && statusCode < 600 {
		return true
	}
	return false
}

func (c *Client) backoffDuration(attempt int, retryAfter time.Duration) time.Duration {
	if retryAfter > 0 {
		return retryAfter
	}
	// Add jitter (0-30%) to prevent thundering herd
	jitter := 1.0 + cryptoRandFloat64()*0.3
	delay := time.Duration(float64(c.baseDelay) * math.Pow(2, float64(attempt)) * jitter)
	if delay > c.maxDelay {
		delay = c.maxDelay
	}
	return delay
}

func cryptoRandFloat64() float64 {
	var b [8]byte
	if _, err := rand.Read(b[:]); err != nil {
		return 0
	}
	return float64(binary.BigEndian.Uint64(b[:])>>11) / (1 << 53)
}

func parseRetryAfter(header string) time.Duration {
	if header == "" {
		return 0
	}
	if seconds, err := strconv.Atoi(header); err == nil {
		return time.Duration(seconds) * time.Second
	}
	return 0
}

func (c *Client) doPublicRequest(ctx context.Context, path string, query url.Values, result any) error {
	if c.circuitBreaker.IsOpen() {
		return &RateLimitError{RetryAfter: c.circuitBreaker.RetryAfter()}
	}

	reqURL := c.baseURL + path
	if len(query) > 0 {
		reqURL += "?" + query.Encode()
	}

	var lastErr error
	for attempt := 0; attempt <= c.maxRetries; attempt++ {
		if attempt > 0 {
			delay := c.backoffDuration(attempt-1, 0)
			debug.Log("retry attempt %d after %v", attempt, delay)
			select {
			case <-ctx.Done():
				return ctx.Err()
			case <-time.After(delay):
			}
		}

		debug.Log("GET %s", reqURL)

		req, err := http.NewRequestWithContext(ctx, http.MethodGet, reqURL, http.NoBody)
		if err != nil {
			return fmt.Errorf("failed to create request: %w", err)
		}

		req.Header.Set("Accept", "application/json")

		resp, err := c.httpClient.Do(req)
		if err != nil {
			lastErr = fmt.Errorf("request failed: %w", err)
			continue
		}

		body, err := io.ReadAll(resp.Body)
		resp.Body.Close()
		if err != nil {
			lastErr = fmt.Errorf("failed to read response: %w", err)
			continue
		}

		debug.Log("response %d (%d bytes)", resp.StatusCode, len(body))

		if resp.StatusCode == http.StatusTooManyRequests {
			retryAfter := parseRetryAfter(resp.Header.Get("Retry-After"))
			if retryAfter == 0 {
				retryAfter = c.backoffDuration(attempt, 0)
			}
			c.circuitBreaker.Trip(retryAfter)
			lastErr = &RateLimitError{RetryAfter: retryAfter}
			if attempt < c.maxRetries {
				debug.Log("rate limited, waiting %v before retry", retryAfter)
				select {
				case <-ctx.Done():
					return ctx.Err()
				case <-time.After(retryAfter):
				}
			}
			continue
		}

		if c.shouldRetry(resp.StatusCode) && attempt < c.maxRetries {
			lastErr = fmt.Errorf("server error %d", resp.StatusCode)
			continue
		}

		if resp.StatusCode >= 400 {
			var apiErr APIError
			if err := json.Unmarshal(body, &apiErr); err == nil && apiErr.Message != "" {
				return &apiErr
			}
			return fmt.Errorf("request failed with status %d: %s", resp.StatusCode, string(body))
		}

		if result != nil {
			if err := json.Unmarshal(body, result); err != nil {
				return fmt.Errorf("failed to parse response: %w", err)
			}
		}

		return nil
	}

	return lastErr
}

func (c *Client) doPrivateRequest(ctx context.Context, path string, params map[string]any, result any) error {
	if c.circuitBreaker.IsOpen() {
		return &RateLimitError{RetryAfter: c.circuitBreaker.RetryAfter()}
	}

	reqURL := c.baseURL + path

	var lastErr error
	for attempt := 0; attempt <= c.maxRetries; attempt++ {
		if attempt > 0 {
			delay := c.backoffDuration(attempt-1, 0)
			debug.Log("retry attempt %d after %v", attempt, delay)
			select {
			case <-ctx.Done():
				return ctx.Err()
			case <-time.After(delay):
			}
		}

		debug.Log("POST %s (authenticated)", reqURL)

		var bodyReader io.Reader
		if params != nil {
			jsonBody, err := json.Marshal(params)
			if err != nil {
				return fmt.Errorf("failed to marshal body: %w", err)
			}
			bodyReader = bytes.NewReader(jsonBody)
		}

		req, err := http.NewRequestWithContext(ctx, http.MethodPost, reqURL, bodyReader)
		if err != nil {
			return fmt.Errorf("failed to create request: %w", err)
		}

		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("Accept", "application/json")
		if err := c.auth.AuthenticateRequest(req, http.MethodPost, path, params); err != nil {
			return fmt.Errorf("failed to authenticate request: %w", err)
		}

		resp, err := c.httpClient.Do(req)
		if err != nil {
			lastErr = fmt.Errorf("request failed: %w", err)
			continue
		}

		body, err := io.ReadAll(resp.Body)
		resp.Body.Close()
		if err != nil {
			lastErr = fmt.Errorf("failed to read response: %w", err)
			continue
		}

		debug.Log("response %d (%d bytes)", resp.StatusCode, len(body))

		if resp.StatusCode == http.StatusTooManyRequests {
			retryAfter := parseRetryAfter(resp.Header.Get("Retry-After"))
			if retryAfter == 0 {
				retryAfter = c.backoffDuration(attempt, 0)
			}
			c.circuitBreaker.Trip(retryAfter)
			lastErr = &RateLimitError{RetryAfter: retryAfter}
			if attempt < c.maxRetries {
				debug.Log("rate limited, waiting %v before retry", retryAfter)
				select {
				case <-ctx.Done():
					return ctx.Err()
				case <-time.After(retryAfter):
				}
			}
			continue
		}

		if c.shouldRetry(resp.StatusCode) && attempt < c.maxRetries {
			lastErr = fmt.Errorf("server error %d", resp.StatusCode)
			continue
		}

		if resp.StatusCode >= 400 {
			var apiErr APIError
			if err := json.Unmarshal(body, &apiErr); err == nil && apiErr.Message != "" {
				return &apiErr
			}
			return fmt.Errorf("request failed with status %d: %s", resp.StatusCode, string(body))
		}

		if result != nil {
			if err := json.Unmarshal(body, result); err != nil {
				return fmt.Errorf("failed to parse response: %w", err)
			}
		}

		return nil
	}

	return lastErr
}
