package transport

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"time"
)

// -----------------------------------------------------------------------------
// Reason / Error Code Constants (Typed error reason identifiers)
// -----------------------------------------------------------------------------
const (
	ReasonInvalidNonce       = "InvalidNonce"
	ReasonGenericNonceError  = "GenericNonceError"
	ReasonMissingNonce       = "MissingNonce"
	ReasonInvalidSignature   = "InvalidSignature"
	ReasonRateLimit          = "RateLimit"
	ReasonUsageLimit         = "UsageLimit"
	ReasonInsufficientFunds  = "InsufficientFunds"
	ReasonMarketClosed       = "MarketClosed"
	ReasonTradingClosed      = "TradingClosed"
	ReasonOrderNotFound      = "OrderNotFound"
	ReasonNoSuchOrder        = "NoSuchOrder"
	ReasonSelfCrossPrevented = "SelfCrossPrevented"
	ReasonMustAcceptTerms    = "MustAcceptTerms"
)

// -----------------------------------------------------------------------------
// Domain Sentinel Errors (Exchange Business Logic & Invariants)
// -----------------------------------------------------------------------------
var (
	ErrInvalidNonce        = errors.New("gemini domain: invalid or duplicate nonce")
	ErrMissingNonce        = errors.New("gemini domain: missing nonce in payload")
	ErrInvalidSignature    = errors.New("gemini domain: invalid signature")
	ErrMissingRole         = errors.New("gemini domain: api key lacks required role")
	ErrInsufficientFunds   = errors.New("gemini domain: insufficient funds")
	ErrAcceptTermsRequired = errors.New("gemini domain: terms of service must be accepted before trading")
	ErrMarketClosed        = errors.New("gemini domain: market is closed")
	ErrOrderNotFound       = errors.New("gemini domain: order not found")
	ErrSelfCrossPrevented  = errors.New("gemini domain: self cross prevented")
)

// -----------------------------------------------------------------------------
// API / HTTP Status Sentinel Errors (Network, Protocol, & Gateway Status)
// -----------------------------------------------------------------------------
var (
	ErrBadRequest         = errors.New("gemini api: bad request (400)")
	ErrUnauthorized       = errors.New("gemini api: unauthorized (401)")
	ErrPermissionDenied   = errors.New("gemini api: permission denied (403)")
	ErrNotFound           = errors.New("gemini api: entity not found (404)")
	ErrConflict           = errors.New("gemini api: conflict (409)")
	ErrRateLimited        = errors.New("gemini api: rate limit exceeded (429)")
	ErrInternalServer     = errors.New("gemini api: internal server error (500)")
	ErrServiceUnavailable = errors.New("gemini api: exchange service unavailable (502/503/504)")
)

// -----------------------------------------------------------------------------
// Client & Transport Sentinel Errors (SDK State & Local Stream Failures)
// -----------------------------------------------------------------------------
var (
	// ErrAuthenticationRequired indicates that an authenticated operation was
	// attempted without an authentication strategy.
	ErrAuthenticationRequired = errors.New("gemini client: authentication strategy required")

	ErrConnectionClosed = errors.New("gemini client: connection closed")
	ErrDeadlineExceeded = errors.New("gemini client: request deadline exceeded")
	ErrResyncRequired   = errors.New("gemini client: orderbook sequence gap detected; resync required")
	ErrNoResponse       = errors.New("gemini client: transport returned no response")
)

// ResyncRequiredError describes a sequence gap in live order book update stream.
type ResyncRequiredError struct {
	LastUpdateID  int64
	FirstUpdateID int64
}

func (e *ResyncRequiredError) Error() string {
	return fmt.Sprintf("gemini order book gap: had update %d, next diff started at %d; resync required", e.LastUpdateID, e.FirstUpdateID)
}

func (e *ResyncRequiredError) Unwrap() error {
	return ErrResyncRequired
}

// APIError represents a structured error response returned by the Gemini REST API.
type APIError struct {
	StatusCode int
	Result     string      `json:"result,omitempty"`
	Reason     string      `json:"reason,omitempty"`
	Message    string      `json:"message,omitempty"`
	RequestID  string      `json:"-"`
	RawBody    []byte      `json:"-"`
	Header     http.Header `json:"-"`
}

// IsDomain reports whether the APIError represents an exchange business logic/domain error.
func (e *APIError) IsDomain() bool {
	switch e.Reason {
	case "InvalidNonce", "GenericNonceError", "MissingNonce",
		"InvalidSignature",
		"RateLimit", "UsageLimit",
		"InsufficientFunds",
		"MissingRole",
		"MarketClosed", "TradingClosed",
		"OrderNotFound", "NoSuchOrder",
		"SelfCrossPrevented",
		"MustAcceptTerms":
		return true
	default:
		return false
	}
}

func (e *APIError) Error() string {
	msg := ""
	if e.Reason != "" && e.Message != "" {
		msg = fmt.Sprintf("gemini api error (status %d): %s - %s", e.StatusCode, e.Reason, e.Message)
	} else if e.Message != "" {
		msg = fmt.Sprintf("gemini api error (status %d): %s", e.StatusCode, e.Message)
	} else if e.Reason != "" {
		msg = fmt.Sprintf("gemini api error (status %d): %s", e.StatusCode, e.Reason)
	} else {
		msg = fmt.Sprintf("gemini api error (status %d): unstructured response body", e.StatusCode)
	}

	if e.RequestID != "" {
		msg += fmt.Sprintf(" [request_id: %s]", e.RequestID)
	}
	return msg
}

func (e *APIError) Unwrap() error {
	switch e.Reason {
	case "MissingNonce":
		return ErrMissingNonce
	case "MissingRole":
		return ErrMissingRole
	case "InvalidNonce", "GenericNonceError":
		return ErrInvalidNonce
	case "InvalidSignature":
		return ErrInvalidSignature
	case "RateLimit", "UsageLimit":
		return ErrRateLimited
	case "InsufficientFunds":
		return ErrInsufficientFunds
	case "MarketClosed", "TradingClosed":
		return ErrMarketClosed
	case "OrderNotFound", "NoSuchOrder":
		return ErrOrderNotFound
	case "SelfCrossPrevented":
		return ErrSelfCrossPrevented
	case "MustAcceptTerms":
		return ErrAcceptTermsRequired
	default:
		switch e.StatusCode {
		case http.StatusBadRequest:
			return ErrBadRequest
		case http.StatusUnauthorized:
			return ErrUnauthorized
		case http.StatusForbidden:
			return ErrPermissionDenied
		case http.StatusNotFound:
			return ErrNotFound
		case http.StatusConflict:
			return ErrConflict
		case http.StatusTooManyRequests:
			return ErrRateLimited
		case http.StatusInternalServerError:
			return ErrInternalServer
		case http.StatusServiceUnavailable, http.StatusBadGateway, http.StatusGatewayTimeout:
			return ErrServiceUnavailable
		default:
			return nil
		}
	}
}

// Is implements error matching for APIError.
func (e *APIError) Is(target error) bool {
	if target == ErrRateLimited && (e.StatusCode == http.StatusTooManyRequests || e.Reason == "RateLimit" || e.Reason == "UsageLimit") {
		return true
	}
	if target == ErrInvalidNonce && (e.Reason == "InvalidNonce" || e.Reason == "GenericNonceError" || e.Reason == "MissingNonce") {
		return true
	}
	return false
}

// RateLimitError represents a 429 response with retry delay metadata.
type RateLimitError struct {
	APIError
	RetryAfter time.Duration
}

func (e *RateLimitError) Error() string {
	if e.RetryAfter > 0 {
		return fmt.Sprintf("%s (retry after %v)", e.APIError.Error(), e.RetryAfter)
	}
	return e.APIError.Error()
}

func (e *RateLimitError) Unwrap() error {
	return &e.APIError
}

// Is reports whether this error matches target (including sentinel ErrRateLimited).
func (e *RateLimitError) Is(target error) bool {
	return target == ErrRateLimited || target == &e.APIError
}

// RequestIDFromError extracts the Gemini Request ID from an error if present.
func RequestIDFromError(err error) string {
	if err == nil {
		return ""
	}
	var apiErr *APIError
	if errors.As(err, &apiErr) {
		return apiErr.RequestID
	}
	var rateLimitErr *RateLimitError
	if errors.As(err, &rateLimitErr) {
		return rateLimitErr.RequestID
	}
	return ""
}

func extractRequestID(h http.Header) string {
	if h == nil {
		return ""
	}
	if id := h.Get("X-GEMINI-REQUEST-ID"); id != "" {
		return id
	}
	if id := h.Get("X-Request-Id"); id != "" {
		return id
	}
	if id := h.Get("X-Request-ID"); id != "" {
		return id
	}
	return ""
}

// ClassifyResponse inspects a response status code and body to build a rich typed error.
func ClassifyResponse(resp *http.Response, body []byte) error {
	if resp == nil {
		return ErrNoResponse
	}
	if resp.StatusCode >= 200 && resp.StatusCode < 300 {
		return nil
	}

	apiErr := &APIError{
		StatusCode: resp.StatusCode,
		RequestID:  extractRequestID(resp.Header),
		RawBody:    body,
		Header:     resp.Header,
	}

	if len(body) > 0 {
		_ = json.Unmarshal(body, apiErr)
	}

	if resp.StatusCode == http.StatusTooManyRequests {
		retryAfter := parseRetryAfter(resp.Header.Get("Retry-After"))
		return &RateLimitError{
			APIError:   *apiErr,
			RetryAfter: retryAfter,
		}
	}

	return apiErr
}
