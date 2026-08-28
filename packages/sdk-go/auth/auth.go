package auth

import (
	"context"
	"errors"
	"net/http"
)

// ErrInvalidTokenSource indicates that OAuth bearer authentication was
// configured without a usable token source.
var ErrInvalidTokenSource = errors.New("gemini auth: invalid OAuth token source")

// ErrTokenSourceFailure identifies a runtime failure while obtaining a token
// from a configured OAuth token source. It is distinct from
// ErrInvalidTokenSource, which describes startup configuration.
var ErrTokenSourceFailure = errors.New("gemini auth: OAuth token source failed")

// ErrInvalidHMACCredentials indicates that HMAC authentication was configured
// without both an API key and API secret.
var ErrInvalidHMACCredentials = errors.New("gemini auth: invalid HMAC credentials")

const (
	authorizationHeader   = "Authorization"
	geminiAPIKeyHeader    = "X-GEMINI-APIKEY" // #nosec G101 -- protocol header name, not a credential value
	geminiNonceHeader     = "X-GEMINI-NONCE"
	geminiPayloadHeader   = "X-GEMINI-PAYLOAD"
	geminiSignatureHeader = "X-GEMINI-SIGNATURE"
)

// clearAuthenticationHeaders removes every credential-bearing header owned by
// the SDK. Requests may be reused by callers or across authentication
// strategies, so authentication must never leave a previous scheme attached.
func clearAuthenticationHeaders(header http.Header) {
	for _, key := range []string{
		authorizationHeader,
		geminiAPIKeyHeader,
		geminiNonceHeader,
		geminiPayloadHeader,
		geminiSignatureHeader,
	} {
		header.Del(key)
	}
}

// Strategy defines the interface for signing and authenticating HTTP requests to Gemini.
type Strategy interface {
	// Authenticate modifies the HTTP request in-place with required authentication headers.
	Authenticate(ctx context.Context, req *http.Request, payloadJSON []byte) error

	// Key returns the identifier/key for logging/telemetry purposes.
	Key() string
}

// RequestSequencer is implemented by authentication strategies whose protocol
// requires authenticated requests to be dispatched in order. The returned
// release function must be called when the complete request attempt sequence
// has finished.
type RequestSequencer interface {
	AcquireRequest(ctx context.Context) (release func(), err error)
}
