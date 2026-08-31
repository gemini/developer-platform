package cli

import (
	"context"
	"strings"
	"testing"
)

func TestPrivateSessionConfigRejectsEnvironmentRefreshToken(t *testing.T) {
	clearCredentialEnvironment(t)
	t.Setenv("GEMINI_REFRESH_TOKEN", "refresh-token")
	t.Setenv("GEMINI_OAUTH_CLIENT_ID", "client-id")

	_, err := privateSessionConfig(context.Background(), GlobalOptions{Environment: "sandbox", Profile: "default"})
	if err == nil || !strings.Contains(err.Error(), "environment refresh tokens cannot be rotated safely") {
		t.Fatalf("privateSessionConfig() error = %v, want unsafe rotation error", err)
	}
}

func TestPrivateSessionConfigAcceptsEnvironmentAccessTokenWithoutPersistence(t *testing.T) {
	clearCredentialEnvironment(t)
	t.Setenv("GEMINI_ACCESS_TOKEN", "access-token")

	config, err := privateSessionConfig(context.Background(), GlobalOptions{Environment: "sandbox", Profile: "default"})
	if err != nil {
		t.Fatalf("privateSessionConfig() error = %v", err)
	}
	if config.Credentials.AccessToken != "access-token" || config.CredentialStore != nil || config.CredentialProfile != "" {
		t.Fatal("privateSessionConfig() did not return a non-persistent environment bearer token")
	}
}

func clearCredentialEnvironment(t *testing.T) {
	t.Helper()
	for _, key := range []string{
		"GEMINI_API_KEY",
		"GEMINI_API_SECRET",
		"GEMINI_ACCESS_TOKEN",
		"GEMINI_BEARER_TOKEN",
		"GEMINI_REFRESH_TOKEN",
		"GEMINI_OAUTH_CLIENT_ID",
		"GEMINI_OAUTH_CLIENT_SECRET",
	} {
		t.Setenv(key, "")
	}
}
