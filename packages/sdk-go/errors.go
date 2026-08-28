package gemini

import (
	"context"
	"errors"

	"github.com/gemini/gemini-go/auth"
	"github.com/gemini/gemini-go/transport"
)

// -----------------------------------------------------------------------------
// Error Types
// -----------------------------------------------------------------------------

type (
	// APIError represents a structured error response returned by the Gemini REST API.
	APIError = transport.APIError

	// RateLimitError represents an HTTP 429 response with retry delay metadata.
	RateLimitError = transport.RateLimitError

	// ResyncRequiredError describes a sequence gap in the live order book update stream.
	ResyncRequiredError = transport.ResyncRequiredError
)

// -----------------------------------------------------------------------------
// Reason / Error Code Constants (Typed error reason identifiers)
// -----------------------------------------------------------------------------

const (
	ReasonInvalidNonce       = transport.ReasonInvalidNonce
	ReasonGenericNonceError  = transport.ReasonGenericNonceError
	ReasonMissingNonce       = transport.ReasonMissingNonce
	ReasonInvalidSignature   = transport.ReasonInvalidSignature
	ReasonRateLimit          = transport.ReasonRateLimit
	ReasonUsageLimit         = transport.ReasonUsageLimit
	ReasonInsufficientFunds  = transport.ReasonInsufficientFunds
	ReasonMarketClosed       = transport.ReasonMarketClosed
	ReasonTradingClosed      = transport.ReasonTradingClosed
	ReasonOrderNotFound      = transport.ReasonOrderNotFound
	ReasonNoSuchOrder        = transport.ReasonNoSuchOrder
	ReasonSelfCrossPrevented = transport.ReasonSelfCrossPrevented
	ReasonMustAcceptTerms    = transport.ReasonMustAcceptTerms
)

// -----------------------------------------------------------------------------
// Domain Sentinel Errors (Exchange Business Rules & Trading Invariants)
// -----------------------------------------------------------------------------

var (
	// ErrAuthenticationRequired indicates that an authenticated operation was
	// attempted without an authentication strategy.
	ErrAuthenticationRequired = transport.ErrAuthenticationRequired

	// ErrInvalidEnvironment indicates that a client was configured with an
	// environment that is not one of the SDK's known deployment targets.
	ErrInvalidEnvironment = errors.New("gemini: invalid environment")

	// ErrInvalidEndpointURL indicates that a custom REST or WebSocket endpoint
	// is not an absolute URL with the required transport scheme.
	ErrInvalidEndpointURL = errors.New("gemini: invalid endpoint URL")

	// ErrInvalidTokenSource indicates that OAuth bearer authentication was
	// configured without a usable token source.
	ErrInvalidTokenSource = auth.ErrInvalidTokenSource

	// ErrTokenSourceFailure indicates that a configured OAuth token source could
	// not provide a token at runtime.
	ErrTokenSourceFailure = auth.ErrTokenSourceFailure

	// ErrInvalidHMACCredentials indicates that HMAC authentication was
	// configured without a usable API key and secret.
	ErrInvalidHMACCredentials = auth.ErrInvalidHMACCredentials

	// ErrInsufficientFunds indicates the account does not have enough available balance.
	ErrInsufficientFunds = transport.ErrInsufficientFunds

	// ErrMarketClosed indicates the trading pair is halted or market is closed.
	ErrMarketClosed = transport.ErrMarketClosed

	// ErrOrderNotFound indicates the requested order ID or client order ID does not exist.
	ErrOrderNotFound = transport.ErrOrderNotFound

	// ErrSelfCrossPrevented indicates the order was rejected to prevent crossing against own resting order.
	ErrSelfCrossPrevented = transport.ErrSelfCrossPrevented

	// ErrAcceptTermsRequired indicates prediction market terms of service must be accepted before trading.
	ErrAcceptTermsRequired = transport.ErrAcceptTermsRequired

	// ErrInvalidNonce indicates a duplicate or out-of-order HMAC nonce.
	ErrInvalidNonce = transport.ErrInvalidNonce

	// ErrMissingNonce indicates the payload did not include the required nonce field.
	ErrMissingNonce = transport.ErrMissingNonce

	// ErrInvalidSignature indicates the HMAC signature could not be verified with the secret key.
	ErrInvalidSignature = transport.ErrInvalidSignature

	// ErrMissingRole indicates the API key lacks the required permission scope.
	ErrMissingRole = transport.ErrMissingRole
)

// -----------------------------------------------------------------------------
// API / HTTP Status Sentinel Errors (Transport & Gateway Taxonomy)
// -----------------------------------------------------------------------------

var (
	// ErrBadRequest indicates an HTTP 400 Bad Request response.
	ErrBadRequest = transport.ErrBadRequest

	// ErrUnauthorized indicates an HTTP 401 Unauthorized response.
	ErrUnauthorized = transport.ErrUnauthorized

	// ErrPermissionDenied indicates an HTTP 403 Forbidden response.
	ErrPermissionDenied = transport.ErrPermissionDenied

	// ErrNotFound indicates an HTTP 404 Not Found response.
	ErrNotFound = transport.ErrNotFound

	// ErrConflict indicates an HTTP 409 Conflict response.
	ErrConflict = transport.ErrConflict

	// ErrRateLimited indicates an HTTP 429 Too Many Requests response.
	ErrRateLimited = transport.ErrRateLimited

	// ErrInternalServer indicates an HTTP 500 Internal Server Error response.
	ErrInternalServer = transport.ErrInternalServer

	// ErrServiceUnavailable indicates an HTTP 502/503/504 Service Unavailable response.
	ErrServiceUnavailable = transport.ErrServiceUnavailable

	// RequestIDFromError extracts the Gemini Request ID from an error if present.
	RequestIDFromError = transport.RequestIDFromError
)

// -----------------------------------------------------------------------------
// Client & Stream Sentinel Errors (SDK State & Local Stream Failures)
// -----------------------------------------------------------------------------

var (
	// ErrConnectionClosed indicates the underlying network connection was closed.
	ErrConnectionClosed = transport.ErrConnectionClosed

	// ErrDeadlineExceeded indicates the request exceeded the client-specified context deadline.
	ErrDeadlineExceeded = transport.ErrDeadlineExceeded

	// ErrResyncRequired indicates an order book sequence gap occurred and a full snapshot resync is required.
	ErrResyncRequired = transport.ErrResyncRequired
)

// -----------------------------------------------------------------------------
// Helper Predicates (Distinguishing API vs Domain vs Client Errors)
// -----------------------------------------------------------------------------

// AsAPIError attempts to extract an *APIError from err.
func AsAPIError(err error) (*APIError, bool) {
	if err == nil {
		return nil, false
	}
	var apiErr *APIError
	if errors.As(err, &apiErr) {
		return apiErr, true
	}
	var rateLimitErr *RateLimitError
	if errors.As(err, &rateLimitErr) {
		return &rateLimitErr.APIError, true
	}
	return nil, false
}

// IsAPIError reports whether err was returned by the Gemini REST API.
func IsAPIError(err error) bool {
	_, ok := AsAPIError(err)
	return ok
}

// IsDomainError reports whether err is an exchange business logic/domain error.
func IsDomainError(err error) bool {
	if apiErr, ok := AsAPIError(err); ok && apiErr.IsDomain() {
		return true
	}
	return errors.Is(err, ErrInsufficientFunds) ||
		errors.Is(err, ErrMarketClosed) ||
		errors.Is(err, ErrOrderNotFound) ||
		errors.Is(err, ErrSelfCrossPrevented) ||
		errors.Is(err, ErrAcceptTermsRequired) ||
		errors.Is(err, ErrInvalidNonce) ||
		errors.Is(err, ErrMissingNonce) ||
		errors.Is(err, ErrInvalidSignature) ||
		errors.Is(err, ErrMissingRole)
}

// IsRateLimit reports whether err indicates a 429 Rate Limit response.
func IsRateLimit(err error) bool {
	return errors.Is(err, ErrRateLimited)
}

// IsInsufficientFunds reports whether err indicates insufficient balance for an order.
func IsInsufficientFunds(err error) bool {
	return errors.Is(err, ErrInsufficientFunds)
}

// IsMarketClosed reports whether err indicates the market or trading pair is closed.
func IsMarketClosed(err error) bool {
	return errors.Is(err, ErrMarketClosed)
}

// IsOrderNotFound reports whether err indicates the order was not found.
func IsOrderNotFound(err error) bool {
	return errors.Is(err, ErrOrderNotFound)
}

// IsSelfCrossPrevented reports whether err indicates self-trade prevention triggered.
func IsSelfCrossPrevented(err error) bool {
	return errors.Is(err, ErrSelfCrossPrevented)
}

// IsTermsRequired reports whether err indicates prediction market terms must be accepted.
func IsTermsRequired(err error) bool {
	return errors.Is(err, ErrAcceptTermsRequired)
}

// IsAuthError reports whether err was caused by invalid signature, missing nonce, or bad API keys.
func IsAuthError(err error) bool {
	return errors.Is(err, ErrInvalidSignature) ||
		errors.Is(err, ErrInvalidNonce) ||
		errors.Is(err, ErrMissingNonce) ||
		errors.Is(err, ErrMissingRole) ||
		errors.Is(err, ErrUnauthorized)
}

// IsNotFound reports whether err indicates an entity or order was not found (404 or OrderNotFound).
func IsNotFound(err error) bool {
	return errors.Is(err, ErrOrderNotFound) || errors.Is(err, ErrNotFound)
}

// IsBadRequest reports whether err indicates a 400 Bad Request error.
func IsBadRequest(err error) bool {
	if errors.Is(err, ErrBadRequest) {
		return true
	}
	if apiErr, ok := AsAPIError(err); ok && apiErr.StatusCode == 400 {
		return true
	}
	return false
}

// IsPermissionDenied reports whether err indicates a 403 Forbidden error or missing API key role.
func IsPermissionDenied(err error) bool {
	return errors.Is(err, ErrPermissionDenied) || errors.Is(err, ErrMissingRole)
}

// IsConflict reports whether err indicates a 409 Conflict error.
func IsConflict(err error) bool {
	return errors.Is(err, ErrConflict)
}

// IsInternalServerError reports whether err indicates a 500 Internal Server error.
func IsInternalServerError(err error) bool {
	return errors.Is(err, ErrInternalServer)
}

// IsServiceUnavailable reports whether err indicates 502/503/504 exchange maintenance or outage.
func IsServiceUnavailable(err error) bool {
	return errors.Is(err, ErrServiceUnavailable)
}

// IsResyncRequired reports whether err indicates an order book sequence gap requiring snapshot resync.
func IsResyncRequired(err error) bool {
	return errors.Is(err, ErrResyncRequired)
}

// IsTimeout reports whether err indicates a network or context deadline timeout.
func IsTimeout(err error) bool {
	return errors.Is(err, ErrDeadlineExceeded) || errors.Is(err, context.DeadlineExceeded)
}
