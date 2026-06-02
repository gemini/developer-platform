package oauth

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/gemini/developer-platform/packages/cli/internal/security"
)

var tokenHTTPClient = security.NewSecureClient(10 * time.Second)

// TokenResponse represents the OAuth token endpoint response.
type TokenResponse struct {
	TokenType    string `json:"token_type"`
	ExpiresIn    int    `json:"expires_in"`
	AccessToken  string `json:"access_token"`
	RefreshToken string `json:"refresh_token,omitempty"`
	IDToken      string `json:"id_token,omitempty"`
	Scope        string `json:"scope,omitempty"`
	Error        string `json:"error,omitempty"`
	ErrorDesc    string `json:"error_description,omitempty"`
}

// ExchangeCode exchanges an authorization code for tokens.
func ExchangeCode(ctx context.Context, endpoints Endpoints, clientID, clientSecret, code string, pkce *PKCEParams, port int) (*TokenResponse, error) {
	redirectURI := fmt.Sprintf("http://localhost:%d%s", port, CallbackPath)
	data := url.Values{
		"grant_type":    {"authorization_code"},
		"client_id":     {clientID},
		"code":          {code},
		"redirect_uri":  {redirectURI},
		"code_verifier": {pkce.CodeVerifier},
	}
	if clientSecret != "" {
		data.Set("client_secret", clientSecret)
	}
	return doTokenRequest(ctx, endpoints.TokenURL, data)
}

// RefreshTokens exchanges a refresh token for new tokens.
func RefreshTokens(ctx context.Context, endpoints Endpoints, clientID, clientSecret, refreshToken string) (*TokenResponse, error) {
	data := url.Values{
		"grant_type":    {"refresh_token"},
		"client_id":     {clientID},
		"refresh_token": {refreshToken},
	}
	if clientSecret != "" {
		data.Set("client_secret", clientSecret)
	}
	return doTokenRequest(ctx, endpoints.TokenURL, data)
}

// RevokeToken revokes an access or refresh token.
func RevokeToken(ctx context.Context, endpoints Endpoints, token string) error {
	data := url.Values{"token": {token}}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoints.RevocationURL, strings.NewReader(data.Encode()))
	if err != nil {
		return fmt.Errorf("create revocation request: %w", err)
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")

	resp, err := tokenHTTPClient.Do(req)
	if err != nil {
		return fmt.Errorf("revoke token: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("revocation failed (status %d): %s", resp.StatusCode, string(body))
	}

	return nil
}

func doTokenRequest(ctx context.Context, tokenURL string, data url.Values) (*TokenResponse, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, tokenURL, strings.NewReader(data.Encode()))
	if err != nil {
		return nil, fmt.Errorf("create token request: %w", err)
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	req.Header.Set("Accept", "application/json")

	resp, err := tokenHTTPClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("token request: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("read token response: %w", err)
	}

	if resp.StatusCode != http.StatusOK {
		var tokenResp TokenResponse
		if json.Unmarshal(body, &tokenResp) == nil && tokenResp.Error != "" {
			return nil, fmt.Errorf("token error: %s (%s)", tokenResp.Error, tokenResp.ErrorDesc)
		}
		return nil, fmt.Errorf("token request failed (status %d): %s", resp.StatusCode, string(body))
	}

	var tokenResp TokenResponse
	if err := json.Unmarshal(body, &tokenResp); err != nil {
		return nil, fmt.Errorf("parse token response: %w", err)
	}
	if tokenResp.Error != "" {
		return nil, fmt.Errorf("token error: %s (%s)", tokenResp.Error, tokenResp.ErrorDesc)
	}

	return &tokenResp, nil
}
