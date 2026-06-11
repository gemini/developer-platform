package config

import (
	"encoding/json"
	"fmt"
	"os"
	"strings"
)

var (
	loadOAuthTokensFn = LoadOAuthTokens
	loadFromKeyringFn = LoadFromKeyring
)

type LoadOptions struct {
	Environment string
}

// NormalizeEnvironment coerces environment names to the supported CLI values.
func NormalizeEnvironment(env string) string {
	switch strings.ToLower(strings.TrimSpace(env)) {
	case "sandbox":
		return "sandbox"
	case "production":
		return "production"
	default:
		return ""
	}
}

// ResolveEnvironment returns the explicit environment if provided, then the
// GEMINI_ENVIRONMENT override, and finally an empty string if neither is set.
func ResolveEnvironment(explicit string) string {
	if env := NormalizeEnvironment(explicit); env != "" {
		return env
	}
	return NormalizeEnvironment(os.Getenv("GEMINI_ENVIRONMENT"))
}

// Load loads configuration from environment, keyring, or file.
//
// Priority order:
//  1. GEMINI_ACCESS_TOKEN env var (Bearer token for agents/CI)
//  2. GEMINI_API_KEY + GEMINI_API_SECRET env vars (HMAC signing)
//  3. OAuth tokens in keyring (from 'gemini-markets auth login')
//  4. API key/secret in keyring (from 'gemini-markets auth setup')
//  5. Legacy config file
func Load() (*Config, error) {
	return LoadWithOptions(LoadOptions{})
}

func LoadWithOptions(opts LoadOptions) (*Config, error) {
	env := ResolveEnvironment(opts.Environment)
	if env == "" {
		env = "production"
	}

	if token := os.Getenv("GEMINI_ACCESS_TOKEN"); token != "" {
		return &Config{
			AccessToken: token,
			AuthType:    AuthTypeBearerEnv,
			Environment: env,
		}, nil
	}

	if key := os.Getenv("GEMINI_API_KEY"); key != "" {
		return &Config{
			APIKey:      key,
			APISecret:   os.Getenv("GEMINI_API_SECRET"),
			AuthType:    AuthTypeHMAC,
			Environment: env,
		}, nil
	}

	if os.Getenv("GEMINI_NO_KEYRING") == "" {
		oauthData, err := loadOAuthTokensFn(env)
		if err != nil {
			return nil, fmt.Errorf("stored OAuth credentials could not be read (keyring error: %w); "+
				"run 'gemini-markets auth logout' to clear them or 'gemini-markets auth login' to re-authenticate", err)
		}
		if oauthData != nil {
			var stored struct {
				AccessToken string `json:"access_token"`
			}
			if json.Unmarshal(oauthData, &stored) == nil && stored.AccessToken != "" {
				return &Config{
					AccessToken: stored.AccessToken,
					AuthType:    AuthTypeOAuth,
					Environment: env,
				}, nil
			}
		}

		creds, err := loadFromKeyringFn()
		if err != nil {
			return nil, fmt.Errorf("stored API credentials could not be read (keyring error: %w); "+
				"run 'gemini-markets auth logout' to clear them or 'gemini-markets auth setup' to re-configure", err)
		}
		if creds != nil && creds.APIKey != "" {
			return &Config{
				APIKey:      creds.APIKey,
				APISecret:   creds.APISecret,
				AuthType:    AuthTypeHMAC,
				Environment: env,
			}, nil
		}
	}

	path, err := configPath()
	if err != nil {
		return nil, err
	}

	data, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("no config found. Run 'gemini-markets auth login' for browser login, 'gemini-markets auth setup' for API key setup, or set GEMINI_ACCESS_TOKEN / GEMINI_API_KEY environment variables")
	}

	var cfg Config
	if err := json.Unmarshal(data, &cfg); err != nil {
		return nil, fmt.Errorf("invalid config file: %w", err)
	}

	cfg.AuthType = AuthTypeHMAC
	switch resolvedEnv := ResolveEnvironment(opts.Environment); {
	case resolvedEnv != "":
		cfg.Environment = resolvedEnv
	case NormalizeEnvironment(cfg.Environment) != "":
		cfg.Environment = NormalizeEnvironment(cfg.Environment)
	default:
		cfg.Environment = "production"
	}

	return &cfg, nil
}

// ValidateConfig validates the configuration.
func ValidateConfig(cfg *Config) error {
	if cfg.AccessToken != "" {
		return nil
	}

	if cfg.APIKey == "" {
		return fmt.Errorf("not authenticated. Run 'gemini-markets auth login' for browser login, or 'gemini-markets auth setup' for API key setup")
	}
	if cfg.APISecret == "" {
		return fmt.Errorf("API secret not configured. Set GEMINI_API_SECRET or run 'gemini-markets auth setup'")
	}
	if len(cfg.APIKey) < 10 {
		return fmt.Errorf("API key appears invalid (too short)")
	}
	if len(cfg.APISecret) < 10 {
		return fmt.Errorf("API secret appears invalid (too short)")
	}
	return nil
}

// IsAuthenticated checks if credentials are configured.
func (c *Config) IsAuthenticated() bool {
	if c.AccessToken != "" {
		return true
	}
	return c.APIKey != "" && c.APISecret != ""
}

// GetCredentialSource returns a human-readable description of where credentials were loaded from.
func GetCredentialSource() string {
	env := ResolveEnvironment("")
	if env == "" {
		env = "production"
	}
	return GetCredentialSourceForEnvironment(env)
}

// GetCredentialSourceForEnvironment returns a human-readable description of where credentials
// were loaded from for the requested environment.
func GetCredentialSourceForEnvironment(environment string) string {
	if os.Getenv("GEMINI_ACCESS_TOKEN") != "" {
		return "environment variable (GEMINI_ACCESS_TOKEN)"
	}

	if os.Getenv("GEMINI_API_KEY") != "" {
		return "environment variables (GEMINI_API_KEY)"
	}

	if os.Getenv("GEMINI_NO_KEYRING") == "" {
		oauthData, err := loadOAuthTokensFn(environment)
		if err == nil && oauthData != nil {
			return "OAuth login (" + environment + ", " + KeyringBackendName() + ")"
		}

		creds, err := loadFromKeyringFn()
		if err == nil && creds != nil && creds.APIKey != "" {
			return KeyringBackendName()
		}
	}

	path, err := configPath()
	if err == nil {
		if _, err := os.Stat(path); err == nil {
			return "config file (" + path + ")"
		}
	}

	return "not configured"
}
