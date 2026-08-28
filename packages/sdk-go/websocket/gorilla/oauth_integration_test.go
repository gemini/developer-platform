//go:build integration

package gorilla_test

import (
	"context"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/gemini/gemini-go"
	"github.com/gemini/gemini-go/auth"
	"github.com/gemini/gemini-go/websocket/gorilla"
)

// TestOAuthIntegration validates the bearer authentication path against a
// deployed Gemini environment without performing a mutating operation. It is
// opt-in because it requires a live OAuth access token and network access.
func TestOAuthIntegration(t *testing.T) {
	token := strings.TrimSpace(os.Getenv("GEMINI_OAUTH_ACCESS_TOKEN"))
	if token == "" {
		t.Skip("set GEMINI_OAUTH_ACCESS_TOKEN to run the OAuth integration test")
	}

	env := gemini.Sandbox
	switch strings.ToLower(strings.TrimSpace(os.Getenv("GEMINI_OAUTH_ENVIRONMENT"))) {
	case "", "sandbox":
		env = gemini.Sandbox
	case "production":
		env = gemini.Production
	default:
		t.Fatalf("GEMINI_OAUTH_ENVIRONMENT must be sandbox or production")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	client, err := gemini.NewClientWithError(
		gemini.WithEnvironment(env),
		gemini.WithTokenSource(auth.TokenFunc(func(context.Context) (string, error) {
			return token, nil
		})),
		gemini.WithWebSocketDialer(gorilla.NewDialer()),
	)
	if err != nil {
		t.Fatalf("creating OAuth client: %v", err)
	}
	defer client.Close()

	if _, err := client.Account.GetAccount(ctx, nil); err != nil {
		t.Fatalf("OAuth REST request failed: %v", err)
	}

	if err := client.PrivateWebSocket().Connect(ctx); err != nil {
		t.Fatalf("OAuth WebSocket handshake failed: %v", err)
	}
}
