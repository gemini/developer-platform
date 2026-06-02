package cmd

import (
	"errors"
	"strings"
	"testing"

	"github.com/gemini/developer-platform/packages/cli/internal/config"
	"github.com/gemini/developer-platform/packages/cli/internal/output"
)

func TestValidatePrivateWebSocketAuthAllowsAccountHMAC(t *testing.T) {
	err := validatePrivateWebSocketAuth(&config.Config{
		APIKey:    "account-1234567890",
		APISecret: "secret-1234567890",
		AuthType:  config.AuthTypeHMAC,
	}, "orders@account")
	if err != nil {
		t.Fatalf("validatePrivateWebSocketAuth() error = %v", err)
	}
}

func TestValidatePrivateWebSocketAuthAllowsOAuth(t *testing.T) {
	err := validatePrivateWebSocketAuth(&config.Config{
		AccessToken: "token",
		AuthType:    config.AuthTypeOAuth,
	}, "orders@account")
	if err != nil {
		t.Fatalf("validatePrivateWebSocketAuth() error = %v", err)
	}
}

func TestValidatePrivateWebSocketAuthAllowsBearerEnv(t *testing.T) {
	err := validatePrivateWebSocketAuth(&config.Config{
		AccessToken: "token",
		AuthType:    config.AuthTypeBearerEnv,
	}, "orders@account")
	if err != nil {
		t.Fatalf("validatePrivateWebSocketAuth() error = %v", err)
	}
}

func TestValidatePrivateWebSocketAuthRejectsMasterKey(t *testing.T) {
	err := validatePrivateWebSocketAuth(&config.Config{
		APIKey:    "master-1234567890",
		APISecret: "secret-1234567890",
		AuthType:  config.AuthTypeHMAC,
	}, "balances@account")
	if err == nil {
		t.Fatal("validatePrivateWebSocketAuth() error = nil, want auth error")
	}

	var cliErr *output.CLIError
	if !errors.As(err, &cliErr) {
		t.Fatalf("validatePrivateWebSocketAuth() returned %T, want *output.CLIError", err)
	}
	if !strings.Contains(cliErr.Message, "account-scoped") || !strings.Contains(cliErr.Message, "master-") {
		t.Fatalf("CLIError.Message = %q, want account-scoped/master explanation", cliErr.Message)
	}
}
