// Package credentials loads CLI credentials from explicit values, the
// environment, and the operating-system keyring.
package credentials

import (
	"context"
	"errors"
	"fmt"
	"os"
	"strings"
	"time"
)

// ErrNotFound is returned by a Keyring when a profile has no saved values.
var ErrNotFound = errors.New("credentials not found")

// Credentials contains all supported Gemini authentication material. Values
// are deliberately plain strings here; the SDK auth package owns signing and
// token validation once a session is created.
type Credentials struct {
	APIKey            string    `json:"api_key,omitempty"`
	APISecret         string    `json:"api_secret,omitempty"`
	AccessToken       string    `json:"access_token,omitempty"`
	RefreshToken      string    `json:"refresh_token,omitempty"`
	OAuthClientID     string    `json:"oauth_client_id,omitempty"`
	OAuthClientSecret string    `json:"oauth_client_secret,omitempty"`
	ExpiresAt         time.Time `json:"expires_at,omitempty"`
}

// Empty reports whether no credential material is configured.
func (c Credentials) Empty() bool {
	return c.APIKey == "" && c.APISecret == "" && c.AccessToken == "" &&
		c.RefreshToken == "" && c.OAuthClientID == "" && c.OAuthClientSecret == ""
}

// normalized makes precedence deterministic when values came from different
// sources and avoids carrying accidental whitespace into SDK auth options.
func (c Credentials) normalized() Credentials {
	c.APIKey = strings.TrimSpace(c.APIKey)
	c.APISecret = strings.TrimSpace(c.APISecret)
	c.AccessToken = strings.TrimSpace(c.AccessToken)
	c.RefreshToken = strings.TrimSpace(c.RefreshToken)
	c.OAuthClientID = strings.TrimSpace(c.OAuthClientID)
	c.OAuthClientSecret = strings.TrimSpace(c.OAuthClientSecret)
	return c
}

// Keyring is the persistence seam used by the CLI. Implementations may wrap
// an operating-system keychain, a test double, or FileKeyring below. The
// default implementation never falls back to FileKeyring.
type Keyring interface {
	Get(ctx context.Context, profile string) (Credentials, error)
	Set(ctx context.Context, profile string, value Credentials) error
	Delete(ctx context.Context, profile string) error
}

// Env is the small environment lookup seam used by Loader and tests.
type Env interface {
	LookupEnv(key string) (string, bool)
}

type osEnv struct{}

func (osEnv) LookupEnv(key string) (string, bool) { return os.LookupEnv(key) }

// LoadOptions controls credential source precedence. A complete credential
// family is selected from the highest-priority source that provides one:
// Explicit, environment, then keyring. Fields are never merged between
// sources because doing so can pair an API key or OAuth token with a secret
// from a different owner.
type LoadOptions struct {
	Profile  string
	Env      Env
	Keyring  Keyring
	Explicit Credentials
}

// Origin identifies the credential source selected by LoadWithOrigin.
type Origin string

const (
	OriginNone        Origin = "none"
	OriginExplicit    Origin = "explicit"
	OriginEnvironment Origin = "environment"
	OriginKeyring     Origin = "keyring"
)

// Load resolves credentials without requiring authentication. This permits
// public market-data commands to use the same session factory as private
// commands. A missing keyring profile is ignored. If the default OS keyring
// is unavailable, environment and explicit credentials remain usable; other
// errors from an explicitly supplied keyring are returned to the caller.
func Load(ctx context.Context, opts LoadOptions) (Credentials, error) {
	value, _, err := LoadWithOrigin(ctx, opts)
	return value, err
}

// LoadWithOrigin resolves credentials using Load's precedence rules and also
// reports the selected source. Callers use the origin to avoid persisting
// refreshed environment credentials into a keyring without user intent.
func LoadWithOrigin(ctx context.Context, opts LoadOptions) (Credentials, Origin, error) {
	if ctx == nil {
		ctx = context.Background()
	}
	profile := strings.TrimSpace(opts.Profile)
	if profile == "" {
		profile = "default"
	}

	env := opts.Env
	if env == nil {
		env = osEnv{}
	}
	if resolved, ok := completeFamily(opts.Explicit); ok {
		return resolved, OriginExplicit, nil
	}
	if resolved, ok := completeFamily(credentialsFromEnv(env)); ok {
		return resolved, OriginEnvironment, nil
	}

	keyring := opts.Keyring
	internalDefaultKeyring := keyring == nil
	if internalDefaultKeyring {
		keyring = defaultKeyring()
	} else if _, ok := keyring.(*lazyOSKeyring); ok {
		internalDefaultKeyring = true
	}
	if keyring == nil {
		return Credentials{}, OriginNone, nil
	}
	value, err := keyring.Get(ctx, profile)
	if err != nil && !errors.Is(err, ErrNotFound) && !(internalDefaultKeyring && errors.Is(err, ErrUnavailable)) {
		return Credentials{}, OriginNone, fmt.Errorf("load credentials from keyring: %w", err)
	}
	if err == nil {
		if resolved, ok := completeFamily(value); ok {
			return resolved, OriginKeyring, nil
		}
	}
	return Credentials{}, OriginNone, nil
}

// completeFamily returns one source's complete authentication family. OAuth
// token material wins within a source, matching the SDK's bearer precedence;
// OAuth client metadata is retained only when it came from that same source.
func completeFamily(value Credentials) (Credentials, bool) {
	value = value.normalized()
	if value.AccessToken != "" || value.RefreshToken != "" {
		return Credentials{
			AccessToken:       value.AccessToken,
			RefreshToken:      value.RefreshToken,
			OAuthClientID:     value.OAuthClientID,
			OAuthClientSecret: value.OAuthClientSecret,
			ExpiresAt:         value.ExpiresAt,
		}, true
	}
	if value.APIKey != "" && value.APISecret != "" {
		return Credentials{APIKey: value.APIKey, APISecret: value.APISecret}, true
	}
	return Credentials{}, false
}

func credentialsFromEnv(env Env) Credentials {
	return Credentials{
		APIKey:            lookup(env, "GEMINI_API_KEY"),
		APISecret:         lookup(env, "GEMINI_API_SECRET"),
		AccessToken:       firstLookup(env, "GEMINI_ACCESS_TOKEN", "GEMINI_BEARER_TOKEN"),
		RefreshToken:      lookup(env, "GEMINI_REFRESH_TOKEN"),
		OAuthClientID:     lookup(env, "GEMINI_OAUTH_CLIENT_ID"),
		OAuthClientSecret: lookup(env, "GEMINI_OAUTH_CLIENT_SECRET"),
	}
}

// NewDefaultKeyring returns the lazy operating-system keyring used by normal
// CLI sessions. The lazy wrapper keeps public and headless commands usable
// when no desktop keychain is available, while still giving authenticated
// sessions one stable persistence seam for OAuth token rotation.
func NewDefaultKeyring() Keyring { return defaultKeyring() }

func lookup(env Env, key string) string {
	value, ok := env.LookupEnv(key)
	if !ok {
		return ""
	}
	return strings.TrimSpace(value)
}

func firstLookup(env Env, keys ...string) string {
	for _, key := range keys {
		if value := lookup(env, key); value != "" {
			return value
		}
	}
	return ""
}
