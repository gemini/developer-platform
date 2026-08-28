package gemini

import (
	"fmt"
	"log/slog"
	"net/http"
	"strings"

	"github.com/gemini/gemini-go/auth"
	"github.com/gemini/gemini-go/transport"
	"github.com/gemini/gemini-go/websocket"
)

type clientConfig struct {
	env        Environment
	restURL    string
	wsURL      string
	configErr  error
	auth       auth.Strategy
	wsDialer   websocket.Dialer
	httpClient *http.Client
	// ownsHTTPClient is true only for the transport created by NewClient. A
	// caller-provided HTTP client, and its underlying transport, remain owned by
	// the caller and must not be closed by Client.Close.
	ownsHTTPClient bool
	retry          transport.RetryPolicy
	logger         *slog.Logger
	userAgent      string
	hooks          []transport.Hook
}

// Option configures the Gemini client facade.
type Option func(*clientConfig)

// WithHooks appends observability hooks to the client transport pipeline.
func WithHooks(hooks ...transport.Hook) Option {
	return func(c *clientConfig) {
		c.hooks = append(c.hooks, hooks...)
	}
}

// WithEnvironment sets the deployment environment (Production or Sandbox).
func WithEnvironment(env Environment) Option {
	return func(c *clientConfig) {
		c.env = env
		if ep, ok := EndpointsFor(env); ok {
			c.restURL = ep.REST
			c.wsURL = ep.WebSocket
			c.configErr = nil
			return
		}
		// Keep invalid configuration fail-closed. In particular, do not leave
		// the production defaults in place after a misspelled environment.
		c.restURL = ""
		c.wsURL = ""
		c.configErr = fmt.Errorf("%w: %q", ErrInvalidEnvironment, env)
	}
}

// WithAuth sets the authentication strategy (e.g. auth.NewHMAC).
func WithAuth(strategy auth.Strategy) Option {
	return func(c *clientConfig) {
		c.auth = strategy
	}
}

// WithAPIKey is a convenience option configuring HMAC-SHA384 auth.
func WithAPIKey(key string, secret string) Option {
	return func(c *clientConfig) {
		c.auth = auth.NewHMAC(auth.APIKey(key), auth.APISecret(secret))
	}
}

// WithBearerToken is a convenience option configuring OAuth2 Bearer Token auth with a static token.
func WithBearerToken(token string) Option {
	return func(c *clientConfig) {
		c.auth = auth.NewBearer(auth.BearerToken(token))
	}
}

// WithTokenSource configures dynamic OAuth2 Bearer Token auth. The source is
// called for each HTTP attempt and WebSocket connection; it owns token caching,
// expiry checks, and refresh behavior.
func WithTokenSource(source auth.TokenSource) Option {
	return func(c *clientConfig) {
		c.auth = auth.NewBearerWithSource(source)
	}
}

// WithCustomRESTURL overrides the default REST base URL. The URL must use
// HTTPS and may include a path prefix, but must not include userinfo, a query
// string, or a fragment.
func WithCustomRESTURL(url string) Option {
	return func(c *clientConfig) {
		c.restURL = strings.TrimSpace(url)
	}
}

// WithCustomWSURL overrides the default WebSocket base URL. The URL must use
// WSS and may include a path prefix, but must not include userinfo, a query
// string, or a fragment.
func WithCustomWSURL(url string) Option {
	return func(c *clientConfig) {
		c.wsURL = strings.TrimSpace(url)
	}
}

// WithWebSocketDialer sets the WebSocket dialer adapter (e.g. gorilla.NewDialer()).
func WithWebSocketDialer(dialer websocket.Dialer) Option {
	return func(c *clientConfig) {
		c.wsDialer = dialer
	}
}

// WithHTTPClient provides a custom standard library http.Client. The caller
// retains ownership; Client.Close does not close its idle connections.
func WithHTTPClient(hc *http.Client) Option {
	return func(c *clientConfig) {
		c.httpClient = hc
		c.ownsHTTPClient = false
	}
}

// WithRetryPolicy sets a custom retry policy.
func WithRetryPolicy(p transport.RetryPolicy) Option {
	return func(c *clientConfig) {
		c.retry = p
	}
}

// WithLogger sets the structured logger for the SDK.
func WithLogger(l *slog.Logger) Option {
	return func(c *clientConfig) {
		if l == nil {
			c.logger = slog.Default()
		} else {
			c.logger = l
		}
	}
}

// WithTraceHook registers a microsecond-level HTTP connection latency tracer.
func WithTraceHook(callback transport.TraceCallback) Option {
	return func(c *clientConfig) {
		c.hooks = append(c.hooks, transport.NewTraceHook(callback))
	}
}
