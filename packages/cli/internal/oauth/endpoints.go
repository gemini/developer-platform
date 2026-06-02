package oauth

import (
	"fmt"
	"os"
	"strconv"
	"time"
)

// Default OAuth configuration for the Gemini Markets CLI.
const (
	DefaultClientID      = "6a03a47b-1bb4-491a-b0a7-35ad17473e71"
	DefaultCallbackPort  = 8787
	CallbackPath         = "/callback"
	LoginTimeout         = 120 * time.Second
	EnvOAuthClientID     = "GEMINI_OAUTH_CLIENT_ID"
	EnvOAuthClientSecret = "GEMINI_OAUTH_CLIENT_SECRET" // #nosec G101 -- environment variable name, not a secret value.
	EnvOAuthCallbackPort = "GEMINI_OAUTH_CALLBACK_PORT"
)

const (
	ClientTypePublic       = "public"
	ClientTypeConfidential = "confidential"
)

// Endpoints holds OAuth endpoint URLs for a given environment.
type Endpoints struct {
	AuthorizationURL string
	TokenURL         string
	RevocationURL    string
}

// ProductionEndpoints returns OAuth endpoints for the production environment.
func ProductionEndpoints(baseURL string) Endpoints {
	return Endpoints{
		AuthorizationURL: baseURL + "/auth",
		TokenURL:         baseURL + "/auth/token",
		RevocationURL:    baseURL + "/auth/revoke",
	}
}

// EndpointsForEnvironment returns the appropriate OAuth endpoints.
func EndpointsForEnvironment(env string) Endpoints {
	if env == "sandbox" {
		return ProductionEndpoints("https://exchange.sandbox.gemini.com")
	}
	return ProductionEndpoints("https://exchange.gemini.com")
}

// Scopes defines the OAuth scopes requested by the CLI.
var Scopes = []string{
	"account:read",
	"balances:read",
	"orders:create",
	"orders:read",
	"history:read",
}

// ClientID returns the OAuth application client ID for authorization requests.
func ClientID() string {
	if clientID := os.Getenv(EnvOAuthClientID); clientID != "" {
		return clientID
	}
	return DefaultClientID
}

// ClientSecret returns the optional OAuth application secret for token requests.
func ClientSecret() string {
	return os.Getenv(EnvOAuthClientSecret)
}

// ClientType returns the OAuth client type implied by the configured secret.
func ClientType(clientSecret string) string {
	if clientSecret != "" {
		return ClientTypeConfidential
	}
	return ClientTypePublic
}

// CallbackPort returns the fixed local OAuth callback port.
func CallbackPort() (int, error) {
	portValue := os.Getenv(EnvOAuthCallbackPort)
	if portValue == "" {
		return DefaultCallbackPort, nil
	}

	port, err := strconv.Atoi(portValue)
	if err != nil || port <= 0 || port > 65535 {
		return 0, fmt.Errorf("invalid %s: must be a TCP port from 1 to 65535", EnvOAuthCallbackPort)
	}
	return port, nil
}
