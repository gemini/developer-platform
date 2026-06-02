package oauth

import (
	"encoding/json"
	"fmt"
	"time"

	"github.com/gemini/developer-platform/packages/cli/internal/config"
)

var (
	saveOAuthTokensFn   = config.SaveOAuthTokens
	loadOAuthTokensFn   = config.LoadOAuthTokens
	deleteOAuthTokensFn = config.DeleteOAuthTokens
)

// StoredTokens contains OAuth tokens persisted in the OS keyring.
type StoredTokens struct {
	AccessToken  string    `json:"access_token"`
	RefreshToken string    `json:"refresh_token"`
	IDToken      string    `json:"id_token,omitempty"`
	Scope        string    `json:"scope,omitempty"`
	ExpiresAt    time.Time `json:"expires_at"`
	TokenType    string    `json:"token_type"`
	Environment  string    `json:"environment,omitempty"`
	ClientID     string    `json:"client_id,omitempty"`
	ClientType   string    `json:"client_type,omitempty"`
}

// SaveTokens persists OAuth tokens to the OS keyring.
func SaveTokens(tokens *StoredTokens) error {
	data, err := json.Marshal(tokens)
	if err != nil {
		return fmt.Errorf("marshal tokens: %w", err)
	}
	return saveOAuthTokensFn(tokens.Environment, data)
}

// LoadTokens retrieves OAuth tokens from the OS keyring.
func LoadTokens(env string) (*StoredTokens, error) {
	data, err := loadOAuthTokensFn(env)
	if err != nil {
		return nil, err
	}
	if data == nil {
		return nil, nil
	}

	var tokens StoredTokens
	if err := json.Unmarshal(data, &tokens); err != nil {
		return nil, fmt.Errorf("parse stored tokens: %w", err)
	}
	return &tokens, nil
}

// DeleteTokens removes OAuth tokens from the OS keyring.
func DeleteTokens(env string) error {
	return deleteOAuthTokensFn(env)
}
