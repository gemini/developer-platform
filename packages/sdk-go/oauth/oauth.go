// Package oauth provides OAuth 2.0 authorization-code and PKCE helpers for
// applications using the Gemini Go SDK.
//
// The package keeps interactive authorization optional. Applications can use
// Config.AuthCodeURL and Config.Exchange in their own browser flow, or use
// Config.Login for a loopback callback on localhost. TokenSource converts the
// resulting token into auth.TokenSource for REST requests and WebSocket
// connections.
package oauth

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"html/template"
	"io"
	"log/slog"
	"net"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/gemini/developer-platform/packages/sdk-go/auth"
)

const (
	defaultEarlyExpiry    = 30 * time.Second
	defaultTokenTimeout   = 15 * time.Second
	maxTokenResponseBytes = 64 << 10
)

var (
	// ErrInvalidConfig indicates that the OAuth client configuration is not
	// safe or complete enough to use.
	ErrInvalidConfig = errors.New("gemini oauth: invalid configuration")
	// ErrInvalidRedirectURL indicates that a redirect URL is malformed or is
	// not a permitted HTTPS or loopback callback URL.
	ErrInvalidRedirectURL = errors.New("gemini oauth: invalid redirect URL")
	// ErrInvalidPKCE indicates that a PKCE verifier or state value is invalid.
	ErrInvalidPKCE = errors.New("gemini oauth: invalid PKCE parameters")
	// ErrStateMismatch indicates that the authorization callback did not match
	// the state generated for the authorization attempt.
	ErrStateMismatch = errors.New("gemini oauth: authorization state mismatch")
	// ErrBrowserOpenerRequired indicates that Login was called without a
	// browser opener.
	ErrBrowserOpenerRequired = errors.New("gemini oauth: browser opener is required")
	// ErrRedirectNotAllowed indicates that an OAuth token request attempted to
	// follow an HTTP redirect. Token requests are never redirected.
	ErrRedirectNotAllowed = errors.New("gemini oauth: token endpoint redirects are not allowed")
	// ErrInvalidToken indicates that an OAuth token response or source token is
	// missing required data.
	ErrInvalidToken = errors.New("gemini oauth: invalid token")
	// ErrRefreshTokenUnavailable indicates that an expired token has no refresh
	// token available.
	ErrRefreshTokenUnavailable = errors.New("gemini oauth: refresh token unavailable")
	// ErrTokenRefresh identifies a failed refresh operation.
	ErrTokenRefresh = errors.New("gemini oauth: token refresh failed")
	// ErrTokenUpdate identifies a failure in an application-provided token
	// update callback. The callback error is available through errors.Is, but
	// is not included in Error output because it may contain token material.
	ErrTokenUpdate = errors.New("gemini oauth: token update failed")
	// ErrTokenEndpoint indicates that an OAuth token endpoint rejected a
	// request.
	ErrTokenEndpoint = errors.New("gemini oauth: token endpoint rejected request")
)

var callbackResponseTemplate = template.Must(template.New("oauth-callback-response").Parse(`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Gemini authentication</title>
  <style>
    :root { color-scheme: dark; font-family: Inter, ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    * { box-sizing: border-box; }
    body { margin: 0; min-height: 100vh; display: grid; place-items: center; padding: 24px; color: #f7f7f8; background: radial-gradient(circle at 50% 0%, #25213d 0, #111116 38%, #09090b 75%); }
    main { width: min(100%, 440px); padding: 42px; border: 1px solid rgba(255,255,255,.11); border-radius: 20px; background: rgba(20,20,24,.86); box-shadow: 0 24px 80px rgba(0,0,0,.45); backdrop-filter: blur(18px); text-align: center; }
    .mark { width: 52px; height: 52px; margin: 0 auto 28px; display: grid; place-items: center; border-radius: 14px; color: #0b0b0d; background: linear-gradient(135deg, #d9c7ff, #8da2ff 52%, #67e8d1); box-shadow: 0 12px 32px rgba(132,147,255,.26); font-size: 28px; line-height: 1; }
    h1 { margin: 0; font-size: 25px; font-weight: 650; letter-spacing: -.025em; }
    p { margin: 14px 0 0; color: #aaaab3; font-size: 15px; line-height: 1.6; }
    .footer { margin-top: 30px; color: #71717a; font-size: 12px; }
    @media (max-width: 520px) { main { padding: 34px 24px; border-radius: 16px; } }
  </style>
</head>
<body>
  <main>
    <div class="mark" aria-hidden="true">&#10022;</div>
    <h1>Gemini authentication</h1>
    <p>{{.}}</p>
    <div class="footer">You can return to the terminal.</div>
  </main>
</body>
</html>`))

// Endpoint contains the OAuth authorization and token endpoint URLs.
// Both endpoints must use HTTPS.
type Endpoint struct {
	AuthURL  string
	TokenURL string
}

// Config configures an OAuth authorization-code flow.
//
// ClientSecret is optional for public PKCE clients. HTTP requests to the
// token endpoint never follow redirects and use a bounded response body.
// HTTPClient is used only for token requests; when nil, the package uses a
// client with a finite timeout.
type Config struct {
	ClientID     string
	ClientSecret string
	Endpoint     Endpoint
	RedirectURL  string
	Scopes       []string
	HTTPClient   *http.Client
}

// String returns a diagnostic representation without exposing ClientSecret.
// Config values are commonly printed while diagnosing OAuth startup failures,
// so the safe representation is the default for ordinary fmt formatting.
func (c Config) String() string {
	return fmt.Sprintf(
		"oauth.Config{ClientID:%q, ClientSecret:%s, Endpoint:{AuthURL:%q, TokenURL:%q}, RedirectURL:%q, Scopes:%q, HTTPClientConfigured:%t}",
		c.ClientID, secretPresence(c.ClientSecret), c.Endpoint.AuthURL, c.Endpoint.TokenURL,
		c.RedirectURL, strings.Join(c.Scopes, ","), c.HTTPClient != nil,
	)
}

// GoString returns a safe representation for %#v formatting.
func (c Config) GoString() string {
	return c.String()
}

// LogValue prevents structured loggers from reflecting ClientSecret or a
// caller-provided HTTP client's internal fields.
func (c Config) LogValue() slog.Value {
	return slog.GroupValue(
		slog.String("client_id", c.ClientID),
		slog.Bool("client_secret_present", strings.TrimSpace(c.ClientSecret) != ""),
		slog.String("authorization_endpoint", c.Endpoint.AuthURL),
		slog.String("token_endpoint", c.Endpoint.TokenURL),
		slog.String("redirect_url", c.RedirectURL),
		slog.Any("scopes", append([]string(nil), c.Scopes...)),
		slog.Bool("http_client_configured", c.HTTPClient != nil),
	)
}

// Token is an OAuth access token and its optional refresh metadata.
type Token struct {
	AccessToken  string
	RefreshToken string
	TokenType    string
	ExpiresAt    time.Time
	Scope        string
}

// String returns a diagnostic representation without exposing access or
// refresh token material. OAuth tokens are routinely included in startup and
// refresh logs, so the safe representation is the default even with fmt's
// ordinary formatting verbs.
func (t Token) String() string {
	return fmt.Sprintf(
		"oauth.Token{AccessToken:%s, RefreshToken:%s, TokenType:%q, ExpiresAt:%s, Scope:%q}",
		secretPresence(t.AccessToken), secretPresence(t.RefreshToken), t.TokenType,
		t.ExpiresAt.UTC().Format(time.RFC3339), t.Scope,
	)
}

// GoString returns a safe representation for %#v formatting.
func (t Token) GoString() string {
	return t.String()
}

// LogValue prevents structured loggers from reflecting the exported token
// fields and accidentally recording credentials.
func (t Token) LogValue() slog.Value {
	return slog.GroupValue(
		slog.Bool("access_token_present", strings.TrimSpace(t.AccessToken) != ""),
		slog.Bool("refresh_token_present", strings.TrimSpace(t.RefreshToken) != ""),
		slog.String("token_type", t.TokenType),
		slog.Time("expires_at", t.ExpiresAt),
		slog.String("scope", t.Scope),
	)
}

func secretPresence(value string) string {
	if strings.TrimSpace(value) == "" {
		return "<unset>"
	}
	return "<redacted>"
}

// Valid reports whether the access token is present and remains valid after
// applying earlyExpiry. A zero ExpiresAt means the authorization server did
// not provide an expiry and the token is treated as valid until rejected.
func (t Token) Valid(now time.Time, earlyExpiry time.Duration) bool {
	if strings.TrimSpace(t.AccessToken) == "" {
		return false
	}
	return t.ExpiresAt.IsZero() || now.Add(earlyExpiry).Before(t.ExpiresAt)
}

// GeneratePKCE returns a fresh RFC 7636 verifier and its S256 challenge.
func GeneratePKCE() (verifier string, challenge string, err error) {
	raw := make([]byte, 32)
	if _, err := rand.Read(raw); err != nil {
		return "", "", fmt.Errorf("generate PKCE verifier: %w", err)
	}
	verifier = base64.RawURLEncoding.EncodeToString(raw)
	challenge = pkceChallenge(verifier)
	return verifier, challenge, nil
}

// GenerateState returns a fresh state value suitable for CSRF protection.
func GenerateState() (string, error) {
	raw := make([]byte, 32)
	if _, err := rand.Read(raw); err != nil {
		return "", fmt.Errorf("generate OAuth state: %w", err)
	}
	return base64.RawURLEncoding.EncodeToString(raw), nil
}

// AuthCodeURL builds a PKCE authorization URL. The verifier is never placed
// in the URL; only its S256 challenge is sent to the authorization server.
func (c Config) AuthCodeURL(state, verifier string) (string, error) {
	if err := c.validate(); err != nil {
		return "", err
	}
	if err := validateState(state); err != nil {
		return "", err
	}
	if err := validateVerifier(verifier); err != nil {
		return "", err
	}

	authURL, err := url.Parse(c.Endpoint.AuthURL)
	if err != nil {
		return "", fmt.Errorf("parse authorization endpoint: %w", err)
	}
	params := authURL.Query()
	params.Set("client_id", c.ClientID)
	params.Set("response_type", "code")
	params.Set("redirect_uri", c.RedirectURL)
	params.Set("state", state)
	params.Set("code_challenge", pkceChallenge(verifier))
	params.Set("code_challenge_method", "S256")
	if scope := normalizedScopes(c.Scopes); scope != "" {
		params.Set("scope", scope)
	}
	authURL.RawQuery = params.Encode()
	return authURL.String(), nil
}

// Exchange exchanges a one-time authorization code for an access token.
func (c Config) Exchange(ctx context.Context, code, verifier string) (*Token, error) {
	if err := c.validate(); err != nil {
		return nil, err
	}
	if strings.TrimSpace(code) == "" {
		return nil, fmt.Errorf("%w: authorization code is required", ErrInvalidPKCE)
	}
	if err := validateVerifier(verifier); err != nil {
		return nil, err
	}
	form := url.Values{
		"grant_type":    {"authorization_code"},
		"client_id":     {c.ClientID},
		"code":          {code},
		"redirect_uri":  {c.RedirectURL},
		"code_verifier": {verifier},
	}
	if c.ClientSecret != "" {
		form.Set("client_secret", c.ClientSecret)
	}
	return c.tokenRequest(ctx, form)
}

// Refresh exchanges a refresh token for a new access token.
func (c Config) Refresh(ctx context.Context, refreshToken string) (*Token, error) {
	if err := c.validateTokenRequest(); err != nil {
		return nil, err
	}
	if strings.TrimSpace(refreshToken) == "" {
		return nil, ErrRefreshTokenUnavailable
	}
	form := url.Values{
		"grant_type":    {"refresh_token"},
		"client_id":     {c.ClientID},
		"refresh_token": {refreshToken},
	}
	if c.ClientSecret != "" {
		form.Set("client_secret", c.ClientSecret)
	}
	return c.tokenRequest(ctx, form)
}

// BrowserOpener opens an authorization URL in a user agent.
type BrowserOpener func(string) error

// Authorize runs an authorization-code flow using a caller-supplied consent
// handler. The handler must return the code and the state received from the
// provider callback. This is useful for web applications and custom CLI UIs.
func (c Config) Authorize(ctx context.Context, handler func(context.Context, string) (code, state string, err error)) (*Token, error) {
	if handler == nil {
		return nil, ErrBrowserOpenerRequired
	}
	if err := c.validate(); err != nil {
		return nil, err
	}
	if ctx == nil {
		ctx = context.Background()
	}
	verifier, _, err := GeneratePKCE()
	if err != nil {
		return nil, err
	}
	state, err := GenerateState()
	if err != nil {
		return nil, err
	}
	authURL, err := c.AuthCodeURL(state, verifier)
	if err != nil {
		return nil, err
	}
	code, returnedState, err := handler(ctx, authURL)
	if err != nil {
		return nil, err
	}
	if !secureStringEqual(state, returnedState) {
		return nil, ErrStateMismatch
	}
	return c.Exchange(ctx, code, verifier)
}

// Login runs an interactive PKCE flow using a loopback callback. The
// configured RedirectURL must be an exact localhost/loopback URL with a fixed
// port, such as http://localhost:8787/callback. HTTP is permitted only for
// this loopback callback; authorization and token endpoints must be HTTPS.
func (c Config) Login(ctx context.Context, openBrowser BrowserOpener) (*Token, error) {
	if openBrowser == nil {
		return nil, ErrBrowserOpenerRequired
	}
	if err := validateLoopbackRedirect(c.RedirectURL); err != nil {
		return nil, err
	}

	return c.Authorize(ctx, func(ctx context.Context, authURL string) (string, string, error) {
		return c.loopbackCallback(ctx, authURL, openBrowser)
	})
}

// Source is a concurrent-safe auth.TokenSource backed by an access token and
// its refresh token. Concurrent callers share one refresh operation, while a
// caller waiting for another refresh can still cancel its own wait.
type Source struct {
	config      Config
	earlyExpiry time.Duration
	now         func() time.Time
	tokenUpdate TokenUpdateFunc

	mu         sync.Mutex
	token      Token
	refreshing *refreshState
}

type refreshState struct {
	done  chan struct{}
	token string
	err   error
}

var _ auth.TokenSource = (*Source)(nil)

// SourceOption configures a refreshable token source.
type SourceOption func(*Source) error

// TokenUpdateFunc receives the complete token snapshot after a successful
// refresh and before the token becomes visible to callers. Returning an error
// fails the refresh and leaves the previous token in place.
type TokenUpdateFunc func(context.Context, Token) error

// WithTokenUpdate registers a callback for persisting refreshed tokens. The
// callback is serialized with refreshes and is called at most once per shared
// refresh operation.
func WithTokenUpdate(update TokenUpdateFunc) SourceOption {
	return func(source *Source) error {
		source.tokenUpdate = update
		return nil
	}
}

// WithEarlyExpiry refreshes before the token's expiry by d. The default is
// thirty seconds. A negative value is rejected.
func WithEarlyExpiry(d time.Duration) SourceOption {
	return func(source *Source) error {
		if d < 0 {
			return fmt.Errorf("%w: early expiry cannot be negative", ErrInvalidConfig)
		}
		source.earlyExpiry = d
		return nil
	}
}

// WithClock replaces the clock used for expiry checks. It is intended for
// deterministic tests and should not normally be used by applications.
func WithClock(now func() time.Time) SourceOption {
	return func(source *Source) error {
		if now == nil {
			return fmt.Errorf("%w: clock cannot be nil", ErrInvalidConfig)
		}
		source.now = now
		return nil
	}
}

// NewTokenSource creates a refreshable auth.TokenSource from an OAuth token.
// The initial token may already be expired if it has a refresh token; the
// first call then refreshes it. The SDK never persists credentials itself;
// callers can opt into persistence with WithTokenUpdate.
func NewTokenSource(config Config, initial Token, opts ...SourceOption) (*Source, error) {
	if err := config.validateTokenRequest(); err != nil {
		return nil, err
	}
	if strings.TrimSpace(initial.AccessToken) == "" && strings.TrimSpace(initial.RefreshToken) == "" {
		return nil, ErrInvalidToken
	}
	if strings.TrimSpace(initial.AccessToken) != "" && !validAccessToken(initial.AccessToken) {
		return nil, fmt.Errorf("%w: access token contains invalid characters", ErrInvalidToken)
	}
	if initial.TokenType == "" {
		initial.TokenType = "Bearer"
	}
	if !strings.EqualFold(initial.TokenType, "Bearer") {
		return nil, fmt.Errorf("%w: unsupported token type %q", ErrInvalidToken, initial.TokenType)
	}
	source := &Source{
		config:      config,
		earlyExpiry: defaultEarlyExpiry,
		now:         time.Now,
		token:       initial,
	}
	for _, opt := range opts {
		if opt == nil {
			continue
		}
		if err := opt(source); err != nil {
			return nil, err
		}
	}
	return source, nil
}

// Token returns a current access token, refreshing it when it is expired or
// within the configured early-expiry window.
func (s *Source) Token(ctx context.Context) (string, error) {
	if s == nil {
		return "", ErrInvalidToken
	}
	if ctx == nil {
		ctx = context.Background()
	}
	if err := ctx.Err(); err != nil {
		return "", err
	}

	s.mu.Lock()
	if s.token.Valid(s.now(), s.earlyExpiry) {
		token := s.token.AccessToken
		s.mu.Unlock()
		return token, nil
	}
	if strings.TrimSpace(s.token.RefreshToken) == "" {
		s.mu.Unlock()
		return "", ErrRefreshTokenUnavailable
	}
	if current := s.refreshing; current != nil {
		s.mu.Unlock()
		select {
		case <-current.done:
			if current.err != nil {
				return "", fmt.Errorf("%w: %w", ErrTokenRefresh, current.err)
			}
			return current.token, nil
		case <-ctx.Done():
			return "", ctx.Err()
		}
	}

	current := &refreshState{done: make(chan struct{})}
	s.refreshing = current
	refreshToken := s.token.RefreshToken
	s.mu.Unlock()

	// A refresh is shared by all callers, but each caller still owns its wait.
	// Detach the refresh operation from the leader's cancellation so a short
	// request deadline cannot make otherwise healthy concurrent callers fail.
	refreshCtx, refreshCancel := context.WithTimeout(context.WithoutCancel(ctx), defaultTokenTimeout)
	go func() {
		defer refreshCancel()
		refreshed, err := s.config.Refresh(refreshCtx, refreshToken)
		if err == nil {
			if refreshed.RefreshToken == "" {
				refreshed.RefreshToken = refreshToken
			}
			if refreshed.TokenType == "" {
				refreshed.TokenType = "Bearer"
			}
			if s.tokenUpdate != nil {
				if updateErr := s.tokenUpdate(refreshCtx, *refreshed); updateErr != nil {
					err = &tokenUpdateError{cause: updateErr}
				}
			}
		}

		s.mu.Lock()
		if err == nil {
			s.token = *refreshed
			current.token = refreshed.AccessToken
		} else {
			current.err = err
		}
		s.refreshing = nil
		close(current.done)
		s.mu.Unlock()
	}()

	select {
	case <-current.done:
		if current.err != nil {
			return "", fmt.Errorf("%w: %w", ErrTokenRefresh, current.err)
		}
		return current.token, nil
	case <-ctx.Done():
		return "", ctx.Err()
	}
}

type tokenUpdateError struct {
	cause error
}

func (e *tokenUpdateError) Error() string {
	return ErrTokenUpdate.Error()
}

func (e *tokenUpdateError) Unwrap() error {
	if e == nil {
		return ErrTokenUpdate
	}
	return errors.Join(ErrTokenUpdate, e.cause)
}

func (c Config) validate() error {
	if err := c.validateTokenRequest(); err != nil {
		return err
	}
	if err := validateHTTPSURL(c.Endpoint.AuthURL, "authorization endpoint"); err != nil {
		return err
	}
	if err := validateRedirectURL(c.RedirectURL); err != nil {
		return err
	}
	if _, err := normalizedScopesChecked(c.Scopes); err != nil {
		return err
	}
	return nil
}

func (c Config) validateTokenRequest() error {
	if strings.TrimSpace(c.ClientID) == "" {
		return fmt.Errorf("%w: client ID is required", ErrInvalidConfig)
	}
	if err := validateHTTPSURL(c.Endpoint.TokenURL, "token endpoint"); err != nil {
		return err
	}
	return nil
}

func validateHTTPSURL(raw, name string) error {
	parsed, err := url.Parse(strings.TrimSpace(raw))
	if err != nil || parsed.Host == "" || !strings.EqualFold(parsed.Scheme, "https") || parsed.User != nil || parsed.RawQuery != "" || parsed.Fragment != "" {
		return fmt.Errorf("%w: %s must be an HTTPS URL without userinfo, query, or fragment", ErrInvalidConfig, name)
	}
	return nil
}

func validAccessToken(value string) bool {
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

func validateRedirectURL(raw string) error {
	parsed, err := url.Parse(strings.TrimSpace(raw))
	if err != nil || parsed.Host == "" || parsed.User != nil || parsed.RawQuery != "" || parsed.Fragment != "" || parsed.Path == "" {
		return fmt.Errorf("%w: redirect URL must be absolute and cannot contain userinfo, query, or fragment", ErrInvalidRedirectURL)
	}
	if !strings.EqualFold(parsed.Scheme, "https") && !strings.EqualFold(parsed.Scheme, "http") {
		return fmt.Errorf("%w: redirect URL must use HTTPS or loopback HTTP", ErrInvalidRedirectURL)
	}
	if strings.EqualFold(parsed.Scheme, "http") && !isLoopbackHost(parsed.Hostname()) {
		return fmt.Errorf("%w: HTTP redirects are allowed only on loopback hosts", ErrInvalidRedirectURL)
	}
	return nil
}

func validateLoopbackRedirect(raw string) error {
	if err := validateRedirectURL(raw); err != nil {
		return err
	}
	parsed, _ := url.Parse(strings.TrimSpace(raw))
	if !strings.EqualFold(parsed.Scheme, "http") || !isLoopbackHost(parsed.Hostname()) || parsed.Port() == "" || parsed.Port() == "0" {
		return fmt.Errorf("%w: Login requires a fixed HTTP loopback redirect port", ErrInvalidRedirectURL)
	}
	return nil
}

func isLoopbackHost(host string) bool {
	if strings.EqualFold(host, "localhost") {
		return true
	}
	ip := net.ParseIP(host)
	return ip != nil && ip.IsLoopback()
}

func normalizedScopes(scopes []string) string {
	normalized, _ := normalizedScopesChecked(scopes)
	// Gemini's OAuth authorization endpoint uses a comma-delimited scope
	// parameter, matching the existing Markets CLI contract.
	return strings.Join(normalized, ",")
}

func normalizedScopesChecked(scopes []string) ([]string, error) {
	normalized := make([]string, 0, len(scopes))
	for _, raw := range scopes {
		scope := strings.TrimSpace(raw)
		if scope == "" || strings.ContainsAny(scope, " \t\r\n") {
			return nil, fmt.Errorf("%w: scopes must be non-empty single values", ErrInvalidConfig)
		}
		normalized = append(normalized, scope)
	}
	return normalized, nil
}

func validateState(state string) error {
	if strings.TrimSpace(state) == "" || strings.ContainsAny(state, "\r\n") {
		return fmt.Errorf("%w: state is required", ErrInvalidPKCE)
	}
	return nil
}

func validateVerifier(verifier string) error {
	if len(verifier) < 43 || len(verifier) > 128 || strings.ContainsAny(verifier, " \t\r\n") {
		return fmt.Errorf("%w: verifier must be 43 to 128 characters", ErrInvalidPKCE)
	}
	for _, char := range verifier {
		if !(char >= 'A' && char <= 'Z') && !(char >= 'a' && char <= 'z') && !(char >= '0' && char <= '9') && !strings.ContainsRune("-._~", char) {
			return fmt.Errorf("%w: verifier contains an invalid character", ErrInvalidPKCE)
		}
	}
	return nil
}

func pkceChallenge(verifier string) string {
	digest := sha256.Sum256([]byte(verifier))
	return base64.RawURLEncoding.EncodeToString(digest[:])
}

func secureStringEqual(left, right string) bool {
	if len(left) != len(right) {
		return false
	}
	return subtle.ConstantTimeCompare([]byte(left), []byte(right)) == 1
}

type tokenResponse struct {
	AccessToken  string `json:"access_token"`
	RefreshToken string `json:"refresh_token"`
	TokenType    string `json:"token_type"`
	ExpiresIn    *int64 `json:"expires_in"`
	Scope        string `json:"scope"`
	Error        string `json:"error"`
	Description  string `json:"error_description"`
}

// TokenEndpointError describes a non-success OAuth token response without
// retaining or exposing the response body, which may contain sensitive data.
type TokenEndpointError struct {
	StatusCode  int
	Code        string
	Description string
}

func (e *TokenEndpointError) Error() string {
	if e == nil {
		return "gemini oauth: token endpoint error"
	}
	message := fmt.Sprintf("gemini oauth: token endpoint returned HTTP %d", e.StatusCode)
	if e.Code != "" {
		message += ": " + e.Code
	}
	return message
}

func (e *TokenEndpointError) Unwrap() error { return ErrTokenEndpoint }

func (c Config) tokenRequest(ctx context.Context, form url.Values) (*Token, error) {
	if ctx == nil {
		ctx = context.Background()
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.Endpoint.TokenURL, strings.NewReader(form.Encode()))
	if err != nil {
		return nil, fmt.Errorf("create token request: %w", err)
	}
	req.Header.Set("Accept", "application/json")
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")

	client := c.tokenHTTPClient()
	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("token request: %w", err)
	}
	defer resp.Body.Close()
	body, err := io.ReadAll(io.LimitReader(resp.Body, maxTokenResponseBytes+1))
	if err != nil {
		return nil, fmt.Errorf("read token response: %w", err)
	}
	if len(body) > maxTokenResponseBytes {
		return nil, fmt.Errorf("%w: token response exceeds %d bytes", ErrInvalidToken, maxTokenResponseBytes)
	}

	var response tokenResponse
	decodeErr := json.Unmarshal(body, &response)
	if resp.StatusCode < http.StatusOK || resp.StatusCode >= http.StatusMultipleChoices || response.Error != "" {
		return nil, &TokenEndpointError{StatusCode: resp.StatusCode, Code: response.Error, Description: response.Description}
	}
	if decodeErr != nil {
		return nil, fmt.Errorf("%w: decode token response: %v", ErrInvalidToken, decodeErr)
	}
	if !validAccessToken(response.AccessToken) {
		return nil, fmt.Errorf("%w: token response has no usable access token", ErrInvalidToken)
	}
	if response.ExpiresIn != nil && *response.ExpiresIn < 0 {
		return nil, fmt.Errorf("%w: token expiry is negative", ErrInvalidToken)
	}
	tokenType := response.TokenType
	if tokenType == "" {
		tokenType = "Bearer"
	}
	if !strings.EqualFold(tokenType, "Bearer") {
		return nil, fmt.Errorf("%w: unsupported token type %q", ErrInvalidToken, tokenType)
	}
	token := &Token{
		AccessToken:  response.AccessToken,
		RefreshToken: response.RefreshToken,
		TokenType:    "Bearer",
		Scope:        response.Scope,
	}
	if response.ExpiresIn != nil {
		if *response.ExpiresIn > int64((time.Duration(1<<63-1))/time.Second) {
			return nil, fmt.Errorf("%w: token expiry is too large", ErrInvalidToken)
		}
		token.ExpiresAt = time.Now().Add(time.Duration(*response.ExpiresIn) * time.Second)
	}
	return token, nil
}

func (c Config) tokenHTTPClient() *http.Client {
	client := c.HTTPClient
	if client == nil {
		client = &http.Client{}
	}
	clone := *client
	clone.CheckRedirect = func(*http.Request, []*http.Request) error {
		return ErrRedirectNotAllowed
	}
	clone.Jar = nil
	if clone.Timeout == 0 {
		clone.Timeout = defaultTokenTimeout
	}
	return &clone
}

func (c Config) loopbackCallback(ctx context.Context, authURL string, openBrowser BrowserOpener) (string, string, error) {
	parsed, err := url.Parse(c.RedirectURL)
	if err != nil {
		return "", "", err
	}
	authorizationURL, err := url.Parse(authURL)
	if err != nil {
		return "", "", fmt.Errorf("parse OAuth authorization URL: %w", err)
	}
	expectedState := authorizationURL.Query().Get("state")
	if err := validateState(expectedState); err != nil {
		return "", "", err
	}
	listenHost := parsed.Hostname()
	listeners, err := listenLoopback(listenHost, parsed.Port())
	if err != nil {
		return "", "", fmt.Errorf("listen for OAuth callback: %w", err)
	}

	resultCh := make(chan callbackResult, 1)
	var delivered atomic.Bool
	mux := http.NewServeMux()
	mux.HandleFunc(parsed.EscapedPath(), func(writer http.ResponseWriter, request *http.Request) {
		if len(request.RequestURI) > 8<<10 {
			http.Error(writer, "request URI too long", http.StatusRequestURITooLong)
			return
		}
		if request.Method != http.MethodGet {
			writer.Header().Set("Allow", http.MethodGet)
			http.Error(writer, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		query := request.URL.Query()
		returnedState := query.Get("state")
		if !secureStringEqual(expectedState, returnedState) {
			writeCallbackResponse(writer, http.StatusBadRequest, "Invalid authorization state.")
			return
		}
		if query.Get("error") != "" {
			if delivered.CompareAndSwap(false, true) {
				resultCh <- callbackResult{state: returnedState, err: &AuthorizationError{Code: query.Get("error"), Description: query.Get("error_description")}}
			}
			writeCallbackResponse(writer, http.StatusOK, "Authorization was denied. You may close this window.")
			return
		}
		code := query.Get("code")
		if code == "" {
			writeCallbackResponse(writer, http.StatusBadRequest, "Authorization code is missing.")
			return
		}
		if delivered.CompareAndSwap(false, true) {
			resultCh <- callbackResult{code: code, state: returnedState}
		}
		writeCallbackResponse(writer, http.StatusOK, "Authorization complete. You may close this window.")
	})

	server := &http.Server{Handler: mux, ReadHeaderTimeout: 5 * time.Second}
	serveErr := make(chan error, len(listeners))
	for _, listener := range listeners {
		go func(listener net.Listener) {
			if err := server.Serve(listener); err != nil && !errors.Is(err, http.ErrServerClosed) {
				serveErr <- err
			}
		}(listener)
	}
	defer func() {
		// The callback handler publishes its result before Login exchanges the
		// authorization code. Shut down gracefully so the browser's success
		// response is allowed to finish before the one-shot server exits.
		shutdownCtx, cancel := context.WithTimeout(context.Background(), time.Second)
		defer cancel()
		_ = server.Shutdown(shutdownCtx)
	}()

	if len(listeners) == 0 {
		return "", "", errors.New("no loopback callback listeners available")
	}

	if err := openBrowser(authURL); err != nil {
		return "", "", fmt.Errorf("open OAuth authorization URL: %w", err)
	}

	select {
	case result := <-resultCh:
		return result.code, result.state, result.err
	case err := <-serveErr:
		return "", "", fmt.Errorf("serve OAuth callback: %w", err)
	case <-ctx.Done():
		return "", "", ctx.Err()
	}
}

func listenLoopback(host, port string) ([]net.Listener, error) {
	type listenTarget struct {
		network string
		address string
	}

	var targets []listenTarget
	switch {
	case strings.EqualFold(host, "localhost"):
		// Browsers may resolve localhost to either loopback family. Bind both
		// exact loopback addresses when the platform permits it; neither target
		// exposes the callback server on a non-loopback interface.
		targets = []listenTarget{
			{network: "tcp4", address: net.JoinHostPort("127.0.0.1", port)},
			{network: "tcp6", address: net.JoinHostPort("::1", port)},
		}
	default:
		ip := net.ParseIP(host)
		if ip == nil || !ip.IsLoopback() {
			return nil, fmt.Errorf("callback host %q is not loopback", host)
		}
		network := "tcp6"
		if ip.To4() != nil {
			network = "tcp4"
		}
		targets = []listenTarget{{network: network, address: net.JoinHostPort(host, port)}}
	}

	listeners := make([]net.Listener, 0, len(targets))
	var errs []error
	for _, target := range targets {
		listener, err := net.Listen(target.network, target.address)
		if err != nil {
			errs = append(errs, fmt.Errorf("%s %s: %w", target.network, target.address, err))
			continue
		}
		listeners = append(listeners, listener)
	}
	if len(listeners) == 0 {
		return nil, errors.Join(errs...)
	}
	return listeners, nil
}

type callbackResult struct {
	code  string
	state string
	err   error
}

// AuthorizationError reports an authorization-server denial without exposing
// callback URLs or authorization codes.
type AuthorizationError struct {
	Code        string
	Description string
}

func (e *AuthorizationError) Error() string {
	if e == nil {
		return "gemini oauth: authorization failed"
	}
	if e.Description == "" {
		return fmt.Sprintf("gemini oauth: authorization failed: %s", e.Code)
	}
	return fmt.Sprintf("gemini oauth: authorization failed: %s: %s", e.Code, e.Description)
}

func writeCallbackResponse(writer http.ResponseWriter, status int, message string) {
	writer.Header().Set("Cache-Control", "no-store")
	writer.Header().Set("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'")
	writer.Header().Set("Content-Type", "text/html; charset=utf-8")
	writer.Header().Set("Referrer-Policy", "no-referrer")
	writer.Header().Set("X-Content-Type-Options", "nosniff")
	writer.WriteHeader(status)
	_ = callbackResponseTemplate.Execute(writer, message)
}
