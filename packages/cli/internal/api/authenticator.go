package api

import (
	"context"
	"net/http"

	"github.com/gemini/developer-platform/packages/cli/internal/config"
)

// Authenticator provides authentication for API requests.
type Authenticator interface {
	AuthenticateRequest(req *http.Request, method, endpoint string, params map[string]any) error
	AuthenticateWebSocket() (http.Header, error)
	Type() string
}

// HMACAuthenticator authenticates requests using HMAC-SHA512 payload signing.
type HMACAuthenticator struct {
	signer *PayloadSigner
}

func NewHMACAuthenticator(apiKey, apiSecret string) *HMACAuthenticator {
	return &HMACAuthenticator{
		signer: NewPayloadSigner(apiKey, apiSecret),
	}
}

func (a *HMACAuthenticator) AuthenticateRequest(req *http.Request, method, endpoint string, params map[string]any) error {
	var apiKey, payload, signature string
	var err error

	if method == http.MethodGet {
		apiKey, payload, signature, err = a.signer.SignGET(endpoint)
	} else {
		apiKey, payload, signature, err = a.signer.Sign(endpoint, params)
	}
	if err != nil {
		return err
	}

	req.Header.Set("X-GEMINI-APIKEY", apiKey)
	req.Header.Set("X-GEMINI-PAYLOAD", payload)
	req.Header.Set("X-GEMINI-SIGNATURE", signature)
	return nil
}

func (a *HMACAuthenticator) AuthenticateWebSocket() (http.Header, error) {
	ws := a.signer.SignWebSocket()
	headers := http.Header{}
	headers.Set("X-GEMINI-APIKEY", ws.APIKey)
	headers.Set("X-GEMINI-PAYLOAD", ws.Payload)
	headers.Set("X-GEMINI-SIGNATURE", ws.Signature)
	headers.Set("X-GEMINI-NONCE", ws.Nonce)
	return headers, nil
}

func (a *HMACAuthenticator) Type() string {
	return "hmac"
}

// NewAuthenticator creates the appropriate Authenticator based on config.
func NewAuthenticator(cfg *config.Config, tokenSource TokenSource) Authenticator {
	if cfg.AccessToken != "" {
		if tokenSource != nil && cfg.AuthType == config.AuthTypeOAuth {
			return NewBearerAuthenticatorWithSource(tokenSource)
		}
		return NewBearerAuthenticator(cfg.AccessToken)
	}
	return NewHMACAuthenticator(cfg.APIKey, cfg.APISecret)
}

// NewAuthenticatorFromConfig creates the appropriate Authenticator based on config.
func NewAuthenticatorFromConfig(cfg *config.Config) Authenticator {
	return NewAuthenticator(cfg, nil)
}

// TokenSource provides access tokens on demand, refreshing if needed.
type TokenSource func(ctx context.Context) (string, error)

// BearerAuthenticator authenticates requests using OAuth Bearer tokens.
// Supports both static tokens and dynamic token sources that auto-refresh.
type BearerAuthenticator struct {
	staticToken string
	tokenSource TokenSource
}

// NewBearerAuthenticator creates an authenticator using a static Bearer token.
func NewBearerAuthenticator(token string) *BearerAuthenticator {
	return &BearerAuthenticator{staticToken: token}
}

// NewBearerAuthenticatorWithSource creates an authenticator that fetches fresh tokens via a TokenSource.
func NewBearerAuthenticatorWithSource(source TokenSource) *BearerAuthenticator {
	return &BearerAuthenticator{tokenSource: source}
}

func (a *BearerAuthenticator) getToken(ctx context.Context) (string, error) {
	if a.tokenSource != nil {
		return a.tokenSource(ctx)
	}
	return a.staticToken, nil
}

func (a *BearerAuthenticator) AuthenticateRequest(req *http.Request, method, endpoint string, params map[string]any) error {
	token, err := a.getToken(req.Context())
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+token)
	return nil
}

func (a *BearerAuthenticator) AuthenticateWebSocket() (http.Header, error) {
	token, err := a.getToken(context.Background())
	if err != nil {
		return nil, err
	}
	headers := http.Header{}
	headers.Set("Authorization", "Bearer "+token)
	return headers, nil
}

func (a *BearerAuthenticator) Type() string {
	return "bearer"
}
