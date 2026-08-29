package gemini

import (
	"fmt"
	"log/slog"
	"net/url"
	"strings"

	"github.com/gemini/developer-platform/packages/sdk-go/services"
	"github.com/gemini/developer-platform/packages/sdk-go/transport"
	"github.com/gemini/developer-platform/packages/sdk-go/websocket"
)

// Client is the primary entrypoint to the Gemini Go SDK.
type Client struct {
	config *clientConfig

	MarketData  *services.MarketDataService
	Trading     *services.TradingService
	Margin      *services.MarginService
	Perpetuals  *services.PerpetualsService
	Account     *services.AccountService
	Staking     *services.StakingService
	Transfers   *services.TransfersService
	Clearing    *services.ClearingService
	Predictions *services.PredictionsService
	Heartbeat   *services.HeartbeatService

	publicWS  *websocket.Client
	privateWS *websocket.Client
}

// NewClient initializes a new Gemini SDK Client with functional options.
func NewClient(opts ...Option) *Client {
	cfg := newClientConfig(opts...)
	return newClientFromConfig(cfg)
}

// NewClientWithError initializes a new Gemini SDK Client and returns an error
// when its options are invalid. Use this constructor when configuration errors
// must be detected before any request or WebSocket connection is attempted.
func NewClientWithError(opts ...Option) (*Client, error) {
	cfg := newClientConfig(opts...)
	if cfg.configErr != nil {
		return nil, cfg.configErr
	}
	return newClientFromConfig(cfg), nil
}

func newClientConfig(opts ...Option) *clientConfig {
	cfg := &clientConfig{
		env:            Production,
		restURL:        endpoints[Production].REST,
		wsURL:          endpoints[Production].WebSocket,
		retry:          transport.DefaultRetryPolicy(),
		logger:         slog.Default(),
		userAgent:      "gemini-go/0.1.0",
		ownsHTTPClient: true,
	}

	for _, opt := range opts {
		if opt != nil {
			opt(cfg)
		}
	}
	validateClientConfig(cfg)
	return cfg
}

func validateClientConfig(cfg *clientConfig) {
	if cfg.configErr != nil {
		return
	}
	if validator, ok := cfg.auth.(interface{ Validate() error }); ok {
		if err := validator.Validate(); err != nil {
			cfg.configErr = err
			return
		}
	}
	if err := validateEndpointURL(cfg.restURL, "REST", "https"); err != nil {
		cfg.configErr = err
		return
	}
	if err := validateEndpointURL(cfg.wsURL, "WebSocket", "wss"); err != nil {
		cfg.configErr = err
	}
}

func validateEndpointURL(raw, name string, schemes ...string) error {
	parsed, err := url.Parse(strings.TrimSpace(raw))
	if err != nil {
		return fmt.Errorf("%w: %s endpoint: %v", ErrInvalidEndpointURL, name, err)
	}
	if parsed.Host == "" {
		return fmt.Errorf("%w: %s endpoint must include a host", ErrInvalidEndpointURL, name)
	}
	if parsed.User != nil {
		return fmt.Errorf("%w: %s endpoint must not include userinfo", ErrInvalidEndpointURL, name)
	}
	if parsed.RawQuery != "" || parsed.ForceQuery || parsed.Fragment != "" {
		return fmt.Errorf("%w: %s endpoint must not include a query or fragment", ErrInvalidEndpointURL, name)
	}
	for _, scheme := range schemes {
		if strings.EqualFold(parsed.Scheme, scheme) {
			return nil
		}
	}
	return fmt.Errorf("%w: %s endpoint must use %s", ErrInvalidEndpointURL, name, strings.Join(schemes, " or "))
}

// PublicWebSocket returns the dedicated unauthenticated WebSocket client for public market data streams.
func (c *Client) PublicWebSocket() *websocket.Client {
	return c.publicWS
}

// PrivateWebSocket returns the dedicated authenticated WebSocket client for account/order feeds.
func (c *Client) PrivateWebSocket() *websocket.Client {
	return c.privateWS
}

// NewQuoteReconciler creates a declarative order book quoting reconciler for a symbol.
// It uses the authenticated PrivateWebSocket connection to receive low-latency order updates.
func (c *Client) NewQuoteReconciler(symbol string, opts ...services.ReconcilerOption) *services.QuoteReconciler {
	return services.NewQuoteReconciler(c.Trading, c.privateWS, symbol, opts...)
}

// WithOptions creates a copy of the client with modified configuration options.
// SDK-owned HTTP transports are not shared between the two clients; caller-
// supplied HTTP clients remain shared and caller-owned.
func (c *Client) WithOptions(opts ...Option) *Client {
	newCfg := *c.config
	newCfg.configErr = nil
	if c.config.ownsHTTPClient {
		// A default client owns its transport. Let newClientFromConfig create a
		// fresh client so closing either facade cannot close idle connections
		// belonging to the other facade.
		newCfg.httpClient = nil
		newCfg.ownsHTTPClient = true
	}
	// Shallow copy slices to prevent mutating original client's hooks
	if len(c.config.hooks) > 0 {
		newCfg.hooks = make([]transport.Hook, len(c.config.hooks))
		copy(newCfg.hooks, c.config.hooks)
	}

	for _, opt := range opts {
		if opt != nil {
			opt(&newCfg)
		}
	}
	validateClientConfig(&newCfg)

	return newClientFromConfig(&newCfg)
}

func newClientFromConfig(cfg *clientConfig) *Client {
	if cfg.httpClient == nil {
		cfg.httpClient = transport.DefaultHTTPClient()
		cfg.ownsHTTPClient = true
	}

	privateConfigErr := cfg.configErr
	if privateConfigErr == nil && cfg.auth == nil {
		privateConfigErr = transport.ErrAuthenticationRequired
	}
	transportClient := transport.NewClient(
		transport.WithHTTPClient(cfg.httpClient),
		transport.WithAuth(cfg.auth),
		transport.WithConfigurationError(privateConfigErr),
		transport.WithRetryPolicy(cfg.retry),
		transport.WithLogger(cfg.logger),
		transport.WithUserAgent(cfg.userAgent),
		transport.WithHooks(cfg.hooks...),
	)
	publicTransport := transport.NewClient(
		transport.WithHTTPClient(cfg.httpClient),
		transport.WithConfigurationError(cfg.configErr),
		transport.WithRetryPolicy(cfg.retry),
		transport.WithLogger(cfg.logger),
		transport.WithUserAgent(cfg.userAgent),
		transport.WithHooks(cfg.hooks...),
	)

	publicWSOptions := []websocket.ClientOption{
		websocket.WithDialer(cfg.wsDialer),
		websocket.WithClientLogger(cfg.logger),
		websocket.WithConfigurationError(cfg.configErr),
		websocket.WithSnapshot(-1),
		websocket.WithIsolatedPartialSnapshots(),
	}
	publicWS := websocket.NewPublicClient(cfg.wsURL, publicWSOptions...)

	privateWS := websocket.NewPrivateClient(
		cfg.wsURL,
		cfg.auth,
		websocket.WithDialer(cfg.wsDialer),
		websocket.WithClientLogger(cfg.logger),
		websocket.WithConfigurationError(privateConfigErr),
	)

	return &Client{
		config:      cfg,
		MarketData:  services.NewMarketDataService(publicTransport, cfg.restURL),
		Trading:     services.NewTradingService(transportClient, cfg.restURL),
		Margin:      services.NewMarginService(transportClient, cfg.restURL),
		Perpetuals:  services.NewPerpetualsServiceWithPublicClient(transportClient, publicTransport, cfg.restURL),
		Account:     services.NewAccountService(transportClient, cfg.restURL),
		Staking:     services.NewStakingServiceWithPublicClient(transportClient, publicTransport, cfg.restURL),
		Transfers:   services.NewTransfersService(transportClient, cfg.restURL),
		Clearing:    services.NewClearingService(transportClient, cfg.restURL),
		Predictions: services.NewPredictionsServiceWithPublicClient(transportClient, publicTransport, cfg.restURL),
		Heartbeat:   services.NewHeartbeatService(transportClient, cfg.restURL),
		publicWS:    publicWS,
		privateWS:   privateWS,
	}
}

// Close gracefully closes active WebSocket connections and releases idle HTTP
// connections only for the HTTP client created by the SDK. A client supplied
// with WithHTTPClient remains owned by the caller.
func (c *Client) Close() error {
	var wsErr error
	if c.publicWS != nil {
		if err := c.publicWS.Close(); err != nil && wsErr == nil {
			wsErr = err
		}
	}
	if c.privateWS != nil && c.privateWS != c.publicWS {
		if err := c.privateWS.Close(); err != nil && wsErr == nil {
			wsErr = err
		}
	}
	if c.config != nil && c.config.ownsHTTPClient && c.config.httpClient != nil {
		c.config.httpClient.CloseIdleConnections()
	}
	return wsErr
}
