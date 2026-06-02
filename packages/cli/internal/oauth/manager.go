package oauth

import (
	"context"
	"errors"
	"fmt"
	"sync"
	"time"

	"github.com/gemini/developer-platform/packages/cli/internal/debug"
)

// ErrReauthRequired indicates the user must re-authenticate.
var ErrReauthRequired = errors.New("session expired, run 'gemini-markets auth login' to re-authenticate")

const expiryBuffer = 30 * time.Second

var refreshTokensFn = RefreshTokens

// IsExpired returns true if the access token is expired or about to expire.
func (t *StoredTokens) IsExpired() bool {
	return time.Now().After(t.ExpiresAt.Add(-expiryBuffer))
}

// TokenManager handles automatic token refresh.
type TokenManager struct {
	mu           sync.Mutex
	endpoints    Endpoints
	clientID     string
	clientSecret string
	environment  string
}

// NewTokenManager creates a token manager for the given environment.
func NewTokenManager(env string) *TokenManager {
	return &TokenManager{
		endpoints:    EndpointsForEnvironment(env),
		clientID:     ClientID(),
		clientSecret: ClientSecret(),
		environment:  env,
	}
}

// GetValidAccessToken returns a valid access token, refreshing if needed.
func (m *TokenManager) GetValidAccessToken(ctx context.Context) (string, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	tokens, err := LoadTokens(m.environment)
	if err != nil {
		return "", fmt.Errorf("load tokens: %w", err)
	}
	if tokens == nil {
		return "", ErrReauthRequired
	}
	if !tokens.IsExpired() {
		return tokens.AccessToken, nil
	}

	debug.Log("access token expired, refreshing...")

	if tokens.RefreshToken == "" {
		_ = DeleteTokens(m.environment)
		return "", ErrReauthRequired
	}

	clientID := tokens.ClientID
	if clientID == "" {
		clientID = m.clientID
	}
	clientType := tokens.ClientType
	if clientType == "" {
		clientType = ClientType(m.clientSecret)
	}
	clientSecret := m.clientSecret
	if clientType == ClientTypePublic {
		clientSecret = ""
	}

	newTokens, err := refreshTokensFn(ctx, m.endpoints, clientID, clientSecret, tokens.RefreshToken)
	if err != nil {
		debug.Log("token refresh failed: %v", err)
		_ = DeleteTokens(m.environment)
		return "", ErrReauthRequired
	}

	stored := &StoredTokens{
		AccessToken:  newTokens.AccessToken,
		RefreshToken: newTokens.RefreshToken,
		IDToken:      newTokens.IDToken,
		Scope:        newTokens.Scope,
		ExpiresAt:    time.Now().Add(time.Duration(newTokens.ExpiresIn) * time.Second),
		TokenType:    newTokens.TokenType,
		Environment:  m.environment,
		ClientID:     clientID,
		ClientType:   clientType,
	}
	if stored.RefreshToken == "" {
		stored.RefreshToken = tokens.RefreshToken
	}
	if stored.Scope == "" {
		stored.Scope = tokens.Scope
	}
	if err := SaveTokens(stored); err != nil {
		debug.Log("failed to save refreshed tokens: %v", err)
	}

	debug.Log("token refreshed, expires in %ds", newTokens.ExpiresIn)
	return stored.AccessToken, nil
}

// TokenResponseToStored converts a token endpoint response to storable tokens.
func TokenResponseToStored(resp *TokenResponse, env, clientID, clientSecret string) *StoredTokens {
	return &StoredTokens{
		AccessToken:  resp.AccessToken,
		RefreshToken: resp.RefreshToken,
		IDToken:      resp.IDToken,
		Scope:        resp.Scope,
		ExpiresAt:    time.Now().Add(time.Duration(resp.ExpiresIn) * time.Second),
		TokenType:    resp.TokenType,
		Environment:  env,
		ClientID:     clientID,
		ClientType:   ClientType(clientSecret),
	}
}
