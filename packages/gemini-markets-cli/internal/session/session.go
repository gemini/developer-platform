// Package session builds the official SDK client used by CLI commands.
// Commands should call services on Session.Client directly; this package does
// not duplicate REST or WebSocket protocol logic.
package session

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"strings"

	"github.com/gemini/developer-platform/packages/gemini-markets-cli/internal/credentials"
	gemini "github.com/gemini/developer-platform/packages/sdk-go"
	"github.com/gemini/developer-platform/packages/sdk-go/auth"
	geminioauth "github.com/gemini/developer-platform/packages/sdk-go/oauth"
	"github.com/gemini/developer-platform/packages/sdk-go/websocket"
	"github.com/gemini/developer-platform/packages/sdk-go/websocket/gorilla"
)

// AuthMode describes the SDK authentication option selected by New.
type AuthMode string

const (
	AuthNone   AuthMode = "none"
	AuthHMAC   AuthMode = "hmac"
	AuthBearer AuthMode = "bearer"
	AuthOAuth  AuthMode = "oauth"
)

var ErrOAuthClientIDRequired = errors.New("OAuth client ID is required when a refresh token is configured")

// OAuthSourceFactory allows applications and tests to replace construction of
// the SDK's refreshable OAuth token source while retaining the same session
// wiring. A nil factory uses gemini/oauth.NewTokenSource.
type OAuthSourceFactory func(environment gemini.Environment, value credentials.Credentials, httpClient *http.Client) (auth.TokenSource, error)

// Config controls client construction.
type Config struct {
	Environment gemini.Environment
	Credentials credentials.Credentials

	// PrivateWebSockets selects the time-based HMAC strategy required by
	// authenticated WebSocket handshakes. REST-only sessions use the strict
	// increasing nonce strategy from WithAPIKey.
	PrivateWebSockets bool

	// CredentialStore and CredentialProfile enable atomic persistence of OAuth
	// token rotations. The store should be an OS-backed keyring in production;
	// tests may inject a narrow in-memory implementation.
	CredentialStore   credentials.Keyring
	CredentialProfile string

	// TokenSource, when set, takes precedence over credential fields and is
	// passed to gemini.WithTokenSource unchanged.
	TokenSource auth.TokenSource

	// HTTPClient is used by the SDK REST transport. OAuthHTTPClient is used for
	// refresh requests; when nil, HTTPClient is reused.
	HTTPClient      *http.Client
	OAuthHTTPClient *http.Client

	// RESTURL and WSURL are optional endpoint overrides, primarily useful for
	// controlled deployments and tests. Production and sandbox defaults come
	// from the official SDK environment option.
	RESTURL string
	WSURL   string

	// EnableWebSockets opts into the SDK's Gorilla adapter. Keeping this false
	// by default avoids opening or configuring stream transport for REST-only
	// commands.
	EnableWebSockets bool
	Dialer           websocket.Dialer

	OAuthSourceFactory OAuthSourceFactory
}

// Session owns an SDK client and the metadata selected to create it.
type Session struct {
	Client      *gemini.Client
	Environment gemini.Environment
	Credentials credentials.Credentials
	AuthMode    AuthMode
}

// New creates an official SDK client for the requested environment and auth
// material. It performs configuration validation before returning so command
// failures happen before a network request is attempted.
func New(config Config) (*Session, error) {
	environment := normalizeEnvironment(config.Environment)
	options := []gemini.Option{gemini.WithEnvironment(environment)}
	if config.RESTURL != "" {
		options = append(options, gemini.WithCustomRESTURL(config.RESTURL))
	}
	if config.WSURL != "" {
		options = append(options, gemini.WithCustomWSURL(config.WSURL))
	}
	if config.HTTPClient != nil {
		options = append(options, gemini.WithHTTPClient(config.HTTPClient))
	}

	mode, authOption, err := authOptionFor(config, environment)
	if err != nil {
		return nil, err
	}
	if authOption != nil {
		options = append(options, authOption)
	}

	if config.EnableWebSockets || config.PrivateWebSockets || config.Dialer != nil {
		dialer := config.Dialer
		if dialer == nil {
			dialer = gorilla.NewDialer()
		}
		options = append(options, gemini.WithWebSocketDialer(dialer))
	}

	client, err := gemini.NewClientWithError(options...)
	if err != nil {
		return nil, fmt.Errorf("create Gemini SDK client: %w", err)
	}
	return &Session{
		Client:      client,
		Environment: environment,
		Credentials: config.Credentials,
		AuthMode:    mode,
	}, nil
}

// Close releases SDK-owned transports and stream connections.
func (s *Session) Close() error {
	if s == nil || s.Client == nil {
		return nil
	}
	return s.Client.Close()
}

func authOptionFor(config Config, environment gemini.Environment) (AuthMode, gemini.Option, error) {
	mode, strategy, err := authStrategyFor(config, environment)
	if err != nil {
		return AuthNone, nil, err
	}
	if mode == AuthHMAC {
		if config.PrivateWebSockets {
			return mode, gemini.WithTimeBasedAPIKey(config.Credentials.APIKey, config.Credentials.APISecret), nil
		}
		return mode, gemini.WithAPIKey(config.Credentials.APIKey, config.Credentials.APISecret), nil
	}
	if strategy == nil {
		return mode, nil, nil
	}
	return mode, gemini.WithAuth(strategy), nil
}

func authStrategyFor(config Config, environment gemini.Environment) (AuthMode, auth.Strategy, error) {
	if config.TokenSource != nil {
		return AuthOAuth, auth.NewBearerWithSource(config.TokenSource), nil
	}

	value := config.Credentials
	if value.AccessToken != "" || value.RefreshToken != "" {
		if value.RefreshToken != "" {
			if strings.TrimSpace(value.OAuthClientID) == "" {
				return AuthNone, nil, ErrOAuthClientIDRequired
			}
			source, err := newOAuthSource(config, environment)
			if err != nil {
				return AuthNone, nil, fmt.Errorf("create OAuth token source: %w", err)
			}
			return AuthOAuth, auth.NewBearerWithSource(source), nil
		}
		return AuthBearer, auth.NewBearer(auth.BearerToken(value.AccessToken)), nil
	}
	if value.APIKey != "" || value.APISecret != "" {
		if config.PrivateWebSockets {
			return AuthHMAC, auth.NewTimeBasedHMAC(auth.APIKey(value.APIKey), auth.APISecret(value.APISecret)), nil
		}
		return AuthHMAC, auth.NewHMAC(auth.APIKey(value.APIKey), auth.APISecret(value.APISecret)), nil
	}
	return AuthNone, nil, nil
}

func newOAuthSource(config Config, environment gemini.Environment) (auth.TokenSource, error) {
	if config.OAuthSourceFactory != nil {
		return config.OAuthSourceFactory(environment, config.Credentials, oauthHTTPClient(config))
	}
	endpoints, ok := gemini.EndpointsFor(environment)
	if !ok {
		return nil, fmt.Errorf("unknown Gemini environment %q", environment)
	}
	initial := geminioauth.Token{
		AccessToken:  config.Credentials.AccessToken,
		RefreshToken: config.Credentials.RefreshToken,
		TokenType:    "Bearer",
		ExpiresAt:    config.Credentials.ExpiresAt,
	}
	oauthConfig := geminioauth.Config{
		ClientID:     config.Credentials.OAuthClientID,
		ClientSecret: config.Credentials.OAuthClientSecret,
		Endpoint: geminioauth.Endpoint{
			AuthURL:  endpoints.OAuthAuthorization,
			TokenURL: endpoints.OAuthToken,
		},
		HTTPClient: oauthHTTPClient(config),
	}
	var sourceOptions []geminioauth.SourceOption
	profile := strings.TrimSpace(config.CredentialProfile)
	if config.CredentialStore != nil && profile != "" {
		stored := config.Credentials
		sourceOptions = append(sourceOptions, geminioauth.WithTokenUpdate(func(ctx context.Context, token geminioauth.Token) error {
			updated := stored
			updated.AccessToken = token.AccessToken
			updated.RefreshToken = token.RefreshToken
			updated.ExpiresAt = token.ExpiresAt
			if err := config.CredentialStore.Set(ctx, profile, updated); err != nil {
				return fmt.Errorf("persist refreshed OAuth credentials: %w", err)
			}
			stored = updated
			return nil
		}))
	}
	return geminioauth.NewTokenSource(oauthConfig, initial, sourceOptions...)
}

func oauthHTTPClient(config Config) *http.Client {
	if config.OAuthHTTPClient != nil {
		return config.OAuthHTTPClient
	}
	return config.HTTPClient
}

func normalizeEnvironment(environment gemini.Environment) gemini.Environment {
	if strings.TrimSpace(string(environment)) == "" {
		return gemini.Production
	}
	return gemini.Environment(strings.ToLower(strings.TrimSpace(string(environment))))
}
