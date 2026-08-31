package cli

import (
	"context"
	"encoding/json"
	"errors"
	"strings"
	"testing"
	"time"

	"github.com/gemini/developer-platform/packages/gemini-markets-cli/internal/credentials"
	geminioauth "github.com/gemini/developer-platform/packages/sdk-go/oauth"
	"github.com/spf13/cobra"
)

type memoryCredentialsKeyring struct {
	values  map[string]credentials.Credentials
	gets    int
	sets    int
	deletes int
}

func (k *memoryCredentialsKeyring) Get(_ context.Context, profile string) (credentials.Credentials, error) {
	k.gets++
	value, ok := k.values[profile]
	if !ok {
		return credentials.Credentials{}, credentials.ErrNotFound
	}
	return value, nil
}

func (k *memoryCredentialsKeyring) Set(_ context.Context, profile string, value credentials.Credentials) error {
	if k.values == nil {
		k.values = make(map[string]credentials.Credentials)
	}
	k.values[profile] = value
	k.sets++
	return nil
}

func (k *memoryCredentialsKeyring) Delete(_ context.Context, profile string) error {
	if _, ok := k.values[profile]; !ok {
		return credentials.ErrNotFound
	}
	delete(k.values, profile)
	k.deletes++
	return nil
}

func authTestCommand(dependencies AuthCommandDependencies) *cobra.Command {
	command := NewAuthCommand(dependencies)
	command.PersistentFlags().StringP("environment", "e", "production", "environment")
	command.PersistentFlags().StringP("profile", "p", "default", "profile")
	command.PersistentFlags().String("output", "table", "output")
	return command
}

func TestAuthLoginUsesSDKOAuthAndStoresOnlyAfterSuccess(t *testing.T) {
	keyring := &memoryCredentialsKeyring{}
	var gotConfig geminioauth.Config
	var gotBrowser bool
	command := authTestCommand(AuthCommandDependencies{
		Keyring: keyring,
		OAuthConfigFactory: func(options GlobalOptions) (geminioauth.Config, error) {
			if options.Environment != "sandbox" || options.Profile != "work" {
				t.Fatalf("OAuthConfigFactory options = %#v", options)
			}
			return geminioauth.Config{ClientID: "client-id", ClientSecret: "client-secret"}, nil
		},
		Browser: func(string) error {
			gotBrowser = true
			return nil
		},
		OAuthLogin: func(_ context.Context, config geminioauth.Config, browser geminioauth.BrowserOpener) (*geminioauth.Token, error) {
			gotConfig = config
			if browser == nil {
				t.Fatal("OAuthLogin received nil browser opener")
			}
			return &geminioauth.Token{
				AccessToken: "access-secret", RefreshToken: "refresh-secret",
				ExpiresAt: time.Date(2026, time.August, 29, 12, 0, 0, 0, time.UTC),
			}, nil
		},
	})
	var output strings.Builder
	command.SetOut(&output)
	command.SetArgs([]string{"--environment", "sandbox", "--profile", "work", "login"})
	if err := command.Execute(); err != nil {
		t.Fatalf("Execute() error = %v", err)
	}
	if gotBrowser {
		t.Fatal("injected OAuthLogin should own browser invocation in this test")
	}
	if gotConfig.ClientID != "client-id" || gotConfig.ClientSecret != "client-secret" {
		t.Fatalf("OAuthLogin config = %#v", gotConfig)
	}
	if keyring.sets != 1 {
		t.Fatalf("keyring.Set calls = %d, want 1", keyring.sets)
	}
	got := keyring.values["work"]
	if got.AccessToken != "access-secret" || got.RefreshToken != "refresh-secret" || got.OAuthClientID != "client-id" || got.OAuthClientSecret != "client-secret" || got.ExpiresAt.IsZero() {
		t.Fatalf("stored credentials = %#v", got)
	}
	if strings.Contains(output.String(), "access-secret") || strings.Contains(output.String(), "refresh-secret") || strings.Contains(output.String(), "client-secret") {
		t.Fatalf("login output exposed secret: %q", output.String())
	}
}

func TestAuthLoginDoesNotPersistFailedOAuth(t *testing.T) {
	keyring := &memoryCredentialsKeyring{}
	loginErr := errors.New("authorization denied")
	command := authTestCommand(AuthCommandDependencies{
		Keyring: keyring,
		OAuthLogin: func(context.Context, geminioauth.Config, geminioauth.BrowserOpener) (*geminioauth.Token, error) {
			return nil, loginErr
		},
	})
	command.SetArgs([]string{"login"})
	if err := command.Execute(); !errors.Is(err, loginErr) {
		t.Fatalf("Execute() error = %v, want %v", err, loginErr)
	}
	if keyring.sets != 0 {
		t.Fatalf("keyring.Set calls = %d, want 0", keyring.sets)
	}
}

func TestAuthStatusIsSecretFree(t *testing.T) {
	keyring := &memoryCredentialsKeyring{values: map[string]credentials.Credentials{
		"default": {AccessToken: "access-secret", RefreshToken: "refresh-secret", OAuthClientID: "client-id"},
	}}
	command := authTestCommand(AuthCommandDependencies{Keyring: keyring})
	var output strings.Builder
	command.SetOut(&output)
	command.SetArgs([]string{"--output", "json", "status"})
	if err := command.Execute(); err != nil {
		t.Fatalf("Execute() error = %v", err)
	}
	if strings.Contains(output.String(), "access-secret") || strings.Contains(output.String(), "refresh-secret") || strings.Contains(output.String(), "client-id") {
		t.Fatalf("status output exposed secret: %q", output.String())
	}
	var got AuthStatus
	if err := json.Unmarshal([]byte(output.String()), &got); err != nil {
		t.Fatalf("status JSON error = %v", err)
	}
	if !got.Configured || got.Authentication != "oauth" || !got.AccessTokenPresent || !got.RefreshTokenPresent {
		t.Fatalf("status = %#v, want configured OAuth presence", got)
	}
}

func TestAuthStatusReportsHMACPresenceWithoutValues(t *testing.T) {
	keyring := &memoryCredentialsKeyring{values: map[string]credentials.Credentials{
		"default": {APIKey: "api-key-secret", APISecret: "api-secret"},
	}}
	command := authTestCommand(AuthCommandDependencies{Keyring: keyring})
	var output strings.Builder
	command.SetOut(&output)
	command.SetArgs([]string{"status"})
	if err := command.Execute(); err != nil {
		t.Fatalf("Execute() error = %v", err)
	}
	if !strings.Contains(output.String(), "hmac") || strings.Contains(output.String(), "api-key-secret") || strings.Contains(output.String(), "api-secret") {
		t.Fatalf("status output = %q", output.String())
	}
}

func TestAuthStatusDoesNotTreatOAuthClientMetadataAsLogin(t *testing.T) {
	status := newAuthStatus(GlobalOptions{Profile: "default", Environment: "production"}, credentials.Credentials{OAuthClientID: "client-id"})
	if status.Configured || status.Authentication != "none" {
		t.Fatalf("status = %#v, want no authentication", status)
	}
}

func TestAuthLogoutRemovesSelectedProfile(t *testing.T) {
	keyring := &memoryCredentialsKeyring{values: map[string]credentials.Credentials{
		"work": {AccessToken: "access-secret"},
	}}
	command := authTestCommand(AuthCommandDependencies{Keyring: keyring})
	var output strings.Builder
	command.SetOut(&output)
	command.SetArgs([]string{"--profile", "work", "logout"})
	if err := command.Execute(); err != nil {
		t.Fatalf("Execute() error = %v", err)
	}
	if keyring.deletes != 1 {
		t.Fatalf("keyring.Delete calls = %d, want 1", keyring.deletes)
	}
	if _, ok := keyring.values["work"]; ok {
		t.Fatal("logout left selected profile credentials")
	}
	if strings.Contains(output.String(), "access-secret") {
		t.Fatalf("logout output exposed secret: %q", output.String())
	}
}

func TestAuthLogoutIsIdempotentForMissingProfile(t *testing.T) {
	command := authTestCommand(AuthCommandDependencies{Keyring: &memoryCredentialsKeyring{values: map[string]credentials.Credentials{}}})
	command.SetArgs([]string{"logout"})
	if err := command.Execute(); err != nil {
		t.Fatalf("Execute() error = %v, want idempotent success", err)
	}
}

func TestDefaultOAuthConfigUsesEnvironmentEndpoints(t *testing.T) {
	t.Setenv("GEMINI_OAUTH_CLIENT_ID", "custom-client")
	t.Setenv("GEMINI_OAUTH_CLIENT_SECRET", "custom-secret")
	config, err := defaultOAuthConfig(GlobalOptions{Environment: "sandbox"})
	if err != nil {
		t.Fatalf("defaultOAuthConfig() error = %v", err)
	}
	if config.ClientID != "custom-client" || config.ClientSecret != "custom-secret" {
		t.Fatalf("config client credentials = %#v", config)
	}
	if !strings.Contains(config.Endpoint.AuthURL, "sandbox") || !strings.Contains(config.Endpoint.TokenURL, "sandbox") {
		t.Fatalf("config endpoints = %#v", config.Endpoint)
	}
	if !containsString(config.Scopes, "orders:create") {
		t.Fatalf("OAuth scopes = %#v, want orders:create", config.Scopes)
	}
}

func containsString(values []string, want string) bool {
	for _, value := range values {
		if value == want {
			return true
		}
	}
	return false
}
