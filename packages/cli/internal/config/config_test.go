package config

import (
	"fmt"
	"os"
	"strings"
	"testing"
)

func TestConfig_GetBaseURL(t *testing.T) {
	tests := []struct {
		name     string
		env      string
		expected string
	}{
		{"production", "production", "https://api.gemini.com"},
		{"sandbox", "sandbox", "https://api.sandbox.gemini.com"},
		{"empty defaults to production", "", "https://api.gemini.com"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			cfg := &Config{Environment: tt.env}
			if got := cfg.GetBaseURL(); got != tt.expected {
				t.Errorf("GetBaseURL() = %v, want %v", got, tt.expected)
			}
		})
	}
}

func TestConfig_GetWebSocketURL(t *testing.T) {
	tests := []struct {
		name     string
		env      string
		expected string
	}{
		{"production", "production", "wss://ws.gemini.com"},
		{"sandbox", "sandbox", "wss://ws.sandbox.gemini.com"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			cfg := &Config{Environment: tt.env}
			if got := cfg.GetWebSocketURL(); got != tt.expected {
				t.Errorf("GetWebSocketURL() = %v, want %v", got, tt.expected)
			}
		})
	}
}

func TestLoad_FromEnv(t *testing.T) {
	os.Setenv("GEMINI_API_KEY", "test-key")
	os.Setenv("GEMINI_API_SECRET", "test-secret")
	os.Setenv("GEMINI_ENVIRONMENT", "sandbox")
	defer func() {
		os.Unsetenv("GEMINI_API_KEY")
		os.Unsetenv("GEMINI_API_SECRET")
		os.Unsetenv("GEMINI_ENVIRONMENT")
	}()

	cfg, err := Load()
	if err != nil {
		t.Fatalf("Load() error = %v", err)
	}

	if cfg.APIKey != "test-key" {
		t.Errorf("APIKey = %v, want %v", cfg.APIKey, "test-key")
	}

	if cfg.APISecret != "test-secret" {
		t.Errorf("APISecret = %v, want %v", cfg.APISecret, "test-secret")
	}

	if cfg.Environment != "sandbox" {
		t.Errorf("Environment = %v, want %v", cfg.Environment, "sandbox")
	}
}

func TestResolveEnvironment(t *testing.T) {
	t.Run("explicit option wins", func(t *testing.T) {
		t.Setenv("GEMINI_ENVIRONMENT", "production")
		if got := ResolveEnvironment("sandbox"); got != "sandbox" {
			t.Fatalf("ResolveEnvironment() = %q, want sandbox", got)
		}
	})

	t.Run("env var used when explicit empty", func(t *testing.T) {
		t.Setenv("GEMINI_ENVIRONMENT", "sandbox")
		if got := ResolveEnvironment(""); got != "sandbox" {
			t.Fatalf("ResolveEnvironment() = %q, want sandbox", got)
		}
	})

	t.Run("unknown values normalize to empty", func(t *testing.T) {
		t.Setenv("GEMINI_ENVIRONMENT", "paper")
		if got := ResolveEnvironment(""); got != "" {
			t.Fatalf("ResolveEnvironment() = %q, want empty", got)
		}
	})
}

func TestLoadWithOptions_FileEnvironmentPrecedence(t *testing.T) {
	tmp := t.TempDir()
	t.Setenv("HOME", tmp)
	t.Setenv("USERPROFILE", tmp)
	t.Setenv("GEMINI_NO_KEYRING", "1")
	t.Setenv("GEMINI_ENVIRONMENT", "")

	cfg := &Config{
		APIKey:      "account-test-key-123456",
		APISecret:   "test-secret-123456",
		Environment: "sandbox",
	}
	if err := Save(cfg); err != nil {
		t.Fatalf("Save() error = %v", err)
	}

	got, err := LoadWithOptions(LoadOptions{})
	if err != nil {
		t.Fatalf("LoadWithOptions() error = %v", err)
	}
	if got.Environment != "sandbox" {
		t.Fatalf("Environment = %q, want sandbox", got.Environment)
	}

	got, err = LoadWithOptions(LoadOptions{Environment: "production"})
	if err != nil {
		t.Fatalf("LoadWithOptions(explicit) error = %v", err)
	}
	if got.Environment != "production" {
		t.Fatalf("Environment = %q, want production", got.Environment)
	}
}

func TestLoad_OAuthTokensScopedByEnvironment(t *testing.T) {
	tmp := t.TempDir()
	t.Setenv("HOME", tmp)
	t.Setenv("USERPROFILE", tmp)
	t.Setenv("GEMINI_ACCESS_TOKEN", "")
	t.Setenv("GEMINI_API_KEY", "")
	t.Setenv("GEMINI_API_SECRET", "")

	origLoadOAuth := loadOAuthTokensFn
	origLoadKeyring := loadFromKeyringFn
	t.Cleanup(func() {
		loadOAuthTokensFn = origLoadOAuth
		loadFromKeyringFn = origLoadKeyring
		os.Unsetenv("GEMINI_ENVIRONMENT")
	})

	loadFromKeyringFn = func() (*StoredCredentials, error) {
		return nil, nil
	}

	t.Run("loads sandbox oauth session when sandbox is active", func(t *testing.T) {
		os.Setenv("GEMINI_ENVIRONMENT", "sandbox")
		loadOAuthTokensFn = func(env string) ([]byte, error) {
			if env != "sandbox" {
				t.Fatalf("LoadOAuthTokens called with env %q, want sandbox", env)
			}
			return []byte(`{"access_token":"sandbox-token","environment":"sandbox"}`), nil
		}

		cfg, err := Load()
		if err != nil {
			t.Fatalf("Load() error = %v", err)
		}
		if cfg.AccessToken != "sandbox-token" {
			t.Fatalf("AccessToken = %q, want sandbox-token", cfg.AccessToken)
		}
		if cfg.AuthType != AuthTypeOAuth {
			t.Fatalf("AuthType = %q, want %q", cfg.AuthType, AuthTypeOAuth)
		}
		if cfg.Environment != "sandbox" {
			t.Fatalf("Environment = %q, want sandbox", cfg.Environment)
		}
	})

	t.Run("ignores tokens for other environments", func(t *testing.T) {
		os.Setenv("GEMINI_ENVIRONMENT", "sandbox")
		loadOAuthTokensFn = func(env string) ([]byte, error) {
			if env != "sandbox" {
				t.Fatalf("LoadOAuthTokens called with env %q, want sandbox", env)
			}
			return nil, nil
		}

		_, err := Load()
		if err == nil {
			t.Fatal("Load() error = nil, want missing config error")
		}
	})
}

func TestGetCredentialSource_OAuthIncludesEnvironment(t *testing.T) {
	origLoadOAuth := loadOAuthTokensFn
	origLoadKeyring := loadFromKeyringFn
	t.Cleanup(func() {
		loadOAuthTokensFn = origLoadOAuth
		loadFromKeyringFn = origLoadKeyring
		os.Unsetenv("GEMINI_ENVIRONMENT")
		os.Unsetenv("GEMINI_ACCESS_TOKEN")
		os.Unsetenv("GEMINI_API_KEY")
		os.Unsetenv("GEMINI_API_SECRET")
		os.Unsetenv("GEMINI_NO_KEYRING")
	})

	os.Setenv("GEMINI_ENVIRONMENT", "sandbox")
	loadOAuthTokensFn = func(env string) ([]byte, error) {
		if env != "sandbox" {
			return nil, fmt.Errorf("unexpected env %s", env)
		}
		return []byte(`{"access_token":"sandbox-token","environment":"sandbox"}`), nil
	}
	loadFromKeyringFn = func() (*StoredCredentials, error) {
		return nil, nil
	}

	got := GetCredentialSource()
	if got == "" {
		t.Fatal("GetCredentialSource() returned empty string")
	}
	if !strings.HasPrefix(got, "OAuth login (sandbox") {
		t.Fatalf("GetCredentialSource() = %q, want sandbox OAuth source", got)
	}
}

func TestValidateAPIKey(t *testing.T) {
	tests := []struct {
		name    string
		key     string
		wantErr bool
	}{
		{"valid key", "account-aBcDeFgHiJkLmNoP", false},
		{"empty key", "", true},
		{"too short", "abc", true},
		{"valid master key", "master-aBcDeFgHiJkLmNoP", false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := ValidateAPIKey(tt.key)
			if (err != nil) != tt.wantErr {
				t.Errorf("ValidateAPIKey() error = %v, wantErr %v", err, tt.wantErr)
			}
		})
	}
}
