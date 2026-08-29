package auth

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"net/http"
	"reflect"
	"strings"
)

// TokenSource provides OAuth 2.0 access tokens dynamically (e.g. for automatic token refresh).
//
// Token is called for each authenticated HTTP attempt, including retries, and
// for each WebSocket connection or reconnect. Implementations should return a
// currently valid token, honor context cancellation, and be safe for concurrent
// calls. The low-level auth package does not persist tokens or perform an
// interactive OAuth authorization-code exchange; the optional oauth package
// provides those protocol helpers.
type TokenSource interface {
	// Token returns an active, non-expired access token or an error if renewal fails.
	Token(ctx context.Context) (string, error)
}

// TokenFunc allows using a plain function as a TokenSource.
type TokenFunc func(ctx context.Context) (string, error)

func (f TokenFunc) Token(ctx context.Context) (string, error) {
	return f(ctx)
}

var _ TokenSource = (TokenFunc)(nil)

type staticTokenSource struct {
	token BearerToken
}

var _ TokenSource = (*staticTokenSource)(nil)

func (s staticTokenSource) Token(ctx context.Context) (string, error) {
	return string(s.token), nil
}

// Bearer implements OAuth 2.0 Bearer Token authentication with static or dynamic token sources.
type Bearer struct {
	tokenSource TokenSource
}

var _ Strategy = (*Bearer)(nil)

// NewBearer creates a new Bearer token authentication strategy using a static token.
func NewBearer(token BearerToken) *Bearer {
	return &Bearer{
		tokenSource: staticTokenSource{token: token},
	}
}

// NewBearerWithSource creates a new Bearer token authentication strategy using a dynamic TokenSource.
func NewBearerWithSource(source TokenSource) *Bearer {
	return &Bearer{
		tokenSource: source,
	}
}

// Key returns the identifier for logging.
func (b *Bearer) Key() string {
	return "[BEARER_AUTH]"
}

// Validate reports configuration errors without calling a dynamic token
// source. It is consumed by the high-level client when available, while the
// authentication methods retain their own runtime checks for direct users.
func (b *Bearer) Validate() error {
	if b == nil || isNilTokenSource(b.tokenSource) {
		return ErrInvalidTokenSource
	}
	if source, ok := b.tokenSource.(staticTokenSource); ok && !validBearerToken(string(source.token)) {
		return fmt.Errorf("%w: static token is empty or contains invalid characters", ErrInvalidTokenSource)
	}
	return nil
}

func isNilTokenSource(source TokenSource) bool {
	if source == nil {
		return true
	}
	value := reflect.ValueOf(source)
	switch value.Kind() {
	case reflect.Chan, reflect.Func, reflect.Interface, reflect.Map, reflect.Pointer, reflect.Slice:
		return value.IsNil()
	default:
		return false
	}
}

// Authenticate attaches the Authorization Bearer header and encodes the
// request payload in Gemini's X-GEMINI-PAYLOAD header. OAuth REST requests
// carry no request body; the payload header contains the request path and
// endpoint parameters without a nonce.
func (b *Bearer) Authenticate(ctx context.Context, req *http.Request, payloadJSON []byte) error {
	if ctx == nil {
		ctx = context.Background()
	}
	if req == nil {
		return fmt.Errorf("gemini auth: nil request")
	}
	if err := b.Validate(); err != nil {
		return err
	}
	if req.URL == nil {
		return fmt.Errorf("gemini auth: request URL is nil")
	}
	if req.Header == nil {
		req.Header = make(http.Header)
	}
	clearAuthenticationHeaders(req.Header)
	rawToken, err := b.token(ctx)
	if err != nil {
		return err
	}

	req.Header.Set(authorizationHeader, fmt.Sprintf("Bearer %s", rawToken))

	if len(payloadJSON) == 0 {
		// Private OAuth endpoints still require X-GEMINI-PAYLOAD even when
		// there are no endpoint parameters. Encode an empty JSON object so
		// the payload always contains the request path.
		payloadJSON = []byte(`{}`)
	}
	payload, err := buildOAuthPayload(req.URL.Path, payloadJSON)
	if err != nil {
		return err
	}
	req.Header.Set(geminiPayloadHeader, base64.StdEncoding.EncodeToString(payload))
	req.Header.Set("Content-Type", "text/plain")
	req.Header.Set("Content-Length", "0")
	req.Body = http.NoBody
	req.ContentLength = 0

	return nil
}

// AuthenticateWebSocket attaches the Authorization Bearer header to the WebSocket handshake request.
func (b *Bearer) AuthenticateWebSocket(ctx context.Context, req *http.Request) error {
	if ctx == nil {
		ctx = context.Background()
	}
	if req == nil {
		return fmt.Errorf("gemini auth: nil request")
	}
	if err := b.Validate(); err != nil {
		return err
	}
	if req.Header == nil {
		req.Header = make(http.Header)
	}
	clearAuthenticationHeaders(req.Header)
	rawToken, err := b.token(ctx)
	if err != nil {
		return err
	}
	req.Header.Set(authorizationHeader, fmt.Sprintf("Bearer %s", rawToken))
	return nil
}

func (b *Bearer) token(ctx context.Context) (string, error) {
	if err := b.Validate(); err != nil {
		return "", err
	}
	rawToken, err := b.tokenSource.Token(ctx)
	if err != nil {
		return "", fmt.Errorf("%w: %w", ErrTokenSourceFailure, err)
	}
	if strings.TrimSpace(rawToken) == "" {
		return "", fmt.Errorf("%w: token source returned an empty token", ErrTokenSourceFailure)
	}
	if !validBearerToken(rawToken) {
		return "", fmt.Errorf("%w: token source returned invalid token characters", ErrTokenSourceFailure)
	}
	return rawToken, nil
}

// validBearerToken accepts the RFC 6750 b64token character set. Rejecting
// everything else prevents malformed or header-injection values from reaching
// HTTP or WebSocket transports.
func validBearerToken(value string) bool {
	if strings.TrimSpace(value) == "" {
		return false
	}
	for i := 0; i < len(value); i++ {
		char := value[i]
		if (char >= 'a' && char <= 'z') || (char >= 'A' && char <= 'Z') ||
			(char >= '0' && char <= '9') || strings.ContainsRune("-._~+/=", rune(char)) {
			continue
		}
		return false
	}
	return true
}

func buildOAuthPayload(requestPath string, payloadJSON []byte) ([]byte, error) {
	payloadMap := make(map[string]json.RawMessage)
	if err := json.Unmarshal(payloadJSON, &payloadMap); err != nil {
		return nil, fmt.Errorf("gemini auth: invalid json payload parameters: %w", err)
	}
	if payloadMap == nil {
		payloadMap = make(map[string]json.RawMessage)
	}
	requestJSON, err := json.Marshal(requestPath)
	if err != nil {
		return nil, fmt.Errorf("gemini auth: encoding request path: %w", err)
	}
	payloadMap["request"] = requestJSON
	delete(payloadMap, "nonce")
	return json.Marshal(payloadMap)
}
