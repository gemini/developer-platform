package session

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/gemini/developer-platform/packages/gemini-markets-cli/internal/credentials"
	gemini "github.com/gemini/developer-platform/packages/sdk-go"
	"github.com/gemini/developer-platform/packages/sdk-go/auth"
)

func TestNewSelectsAuthModes(t *testing.T) {
	tests := []struct {
		name        string
		credentials credentials.Credentials
		want        AuthMode
	}{
		{name: "none", want: AuthNone},
		{name: "hmac", credentials: credentials.Credentials{APIKey: "key", APISecret: "secret"}, want: AuthHMAC},
		{name: "bearer", credentials: credentials.Credentials{AccessToken: "token"}, want: AuthBearer},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			s, err := New(Config{Environment: gemini.Sandbox, Credentials: test.credentials})
			if err != nil {
				t.Fatalf("New() error = %v", err)
			}
			defer s.Close()
			if s.AuthMode != test.want {
				t.Fatalf("AuthMode = %q, want %q", s.AuthMode, test.want)
			}
			if s.Environment != gemini.Sandbox {
				t.Fatalf("Environment = %q, want sandbox", s.Environment)
			}
		})
	}
}

func TestNewBuildsDynamicOAuthSource(t *testing.T) {
	called := false
	s, err := New(Config{
		Environment: gemini.Production,
		Credentials: credentials.Credentials{AccessToken: "access", RefreshToken: "refresh", OAuthClientID: "client"},
		OAuthSourceFactory: func(environment gemini.Environment, value credentials.Credentials, client *http.Client) (auth.TokenSource, error) {
			called = true
			if environment != gemini.Production || value.RefreshToken != "refresh" || client != nil {
				t.Fatalf("factory arguments = %q, %#v, %v", environment, value, client)
			}
			return auth.TokenFunc(func(context.Context) (string, error) { return "token", nil }), nil
		},
	})
	if err != nil {
		t.Fatalf("New() error = %v", err)
	}
	defer s.Close()
	if !called || s.AuthMode != AuthOAuth {
		t.Fatalf("factory called = %t, AuthMode = %q", called, s.AuthMode)
	}
}

func TestNewRejectsRefreshTokenWithoutClientID(t *testing.T) {
	_, err := New(Config{Credentials: credentials.Credentials{RefreshToken: "refresh"}})
	if !errors.Is(err, ErrOAuthClientIDRequired) {
		t.Fatalf("New() error = %v, want ErrOAuthClientIDRequired", err)
	}
}

func TestNewRejectsInvalidEnvironment(t *testing.T) {
	_, err := New(Config{Environment: gemini.Environment("staging")})
	if !errors.Is(err, gemini.ErrInvalidEnvironment) {
		t.Fatalf("New() error = %v, want ErrInvalidEnvironment", err)
	}
}

func TestAuthStrategySelectsNonceContractForSessionSurface(t *testing.T) {
	credentials := credentials.Credentials{APIKey: "key", APISecret: "secret"}
	_, restStrategy, err := authStrategyFor(Config{Credentials: credentials}, gemini.Production)
	if err != nil {
		t.Fatalf("REST authStrategyFor() error = %v", err)
	}
	restRequest, err := http.NewRequest(http.MethodPost, "https://api.gemini.com/v1/account", nil)
	if err != nil {
		t.Fatalf("NewRequest() error = %v", err)
	}
	if err := restStrategy.Authenticate(context.Background(), restRequest, nil); err != nil {
		t.Fatalf("REST Authenticate() error = %v", err)
	}
	decoded, err := base64.StdEncoding.DecodeString(restRequest.Header.Get("X-GEMINI-PAYLOAD"))
	if err != nil {
		t.Fatalf("decode REST payload: %v", err)
	}
	var payload map[string]string
	if err := json.Unmarshal(decoded, &payload); err != nil {
		t.Fatalf("decode REST payload JSON: %v", err)
	}
	if len(payload["nonce"]) < len(strconv.FormatInt(time.Now().Unix(), 10))+3 {
		t.Fatalf("REST nonce = %q, want strict-increasing millisecond nonce", payload["nonce"])
	}
	wsAuth, ok := restStrategy.(interface {
		AuthenticateWebSocket(context.Context, *http.Request) error
	})
	if !ok {
		t.Fatal("REST strategy does not expose WebSocket auth capability")
	}
	wsRequest, _ := http.NewRequest(http.MethodGet, "wss://ws.gemini.com/v1/orders", nil)
	if err := wsAuth.AuthenticateWebSocket(context.Background(), wsRequest); !errors.Is(err, auth.ErrTimeBasedNonceRequired) {
		t.Fatalf("REST strategy WebSocket auth error = %v, want ErrTimeBasedNonceRequired", err)
	}

	_, privateStrategy, err := authStrategyFor(Config{Credentials: credentials, PrivateWebSockets: true}, gemini.Production)
	if err != nil {
		t.Fatalf("private authStrategyFor() error = %v", err)
	}
	privateWSAuth, ok := privateStrategy.(interface {
		AuthenticateWebSocket(context.Context, *http.Request) error
	})
	if !ok {
		t.Fatal("private strategy does not expose WebSocket auth capability")
	}
	privateRequest, _ := http.NewRequest(http.MethodGet, "wss://ws.gemini.com/v1/orders", nil)
	if err := privateWSAuth.AuthenticateWebSocket(context.Background(), privateRequest); err != nil {
		t.Fatalf("private strategy WebSocket auth error = %v", err)
	}
	nonce, err := strconv.ParseInt(privateRequest.Header.Get("X-GEMINI-NONCE"), 10, 64)
	if err != nil || nonce <= 0 || nonce > time.Now().Add(time.Second).Unix() {
		t.Fatalf("private WebSocket nonce = %q, want current epoch seconds", privateRequest.Header.Get("X-GEMINI-NONCE"))
	}
}

type sessionMemoryKeyring struct {
	value credentials.Credentials
	sets  int
}

func (k *sessionMemoryKeyring) Get(context.Context, string) (credentials.Credentials, error) {
	return k.value, nil
}

func (k *sessionMemoryKeyring) Set(_ context.Context, _ string, value credentials.Credentials) error {
	k.value = value
	k.sets++
	return nil
}

func (k *sessionMemoryKeyring) Delete(context.Context, string) error { return nil }

type sessionRoundTripper struct{}

func (sessionRoundTripper) RoundTrip(*http.Request) (*http.Response, error) {
	return &http.Response{
		StatusCode: http.StatusOK,
		Header:     make(http.Header),
		Body:       io.NopCloser(strings.NewReader(`{"access_token":"rotated-access","refresh_token":"rotated-refresh","token_type":"Bearer","expires_in":3600}`)),
	}, nil
}

func TestOAuthRefreshPersistsCompleteCredentialSnapshot(t *testing.T) {
	store := &sessionMemoryKeyring{}
	source, err := newOAuthSource(Config{
		Environment: gemini.Production,
		Credentials: credentials.Credentials{
			AccessToken: "expired-access", RefreshToken: "initial-refresh",
			OAuthClientID: "client-id", OAuthClientSecret: "client-secret",
			ExpiresAt: time.Now().Add(-time.Hour),
		},
		OAuthHTTPClient:   &http.Client{Transport: sessionRoundTripper{}},
		CredentialStore:   store,
		CredentialProfile: "work",
	}, gemini.Production)
	if err != nil {
		t.Fatalf("newOAuthSource() expired error = %v", err)
	}
	got, err := source.Token(context.Background())
	if err != nil || got != "rotated-access" {
		t.Fatalf("Token() = %q, %v; want rotated-access, nil", got, err)
	}
	if store.sets != 1 || store.value.AccessToken != "rotated-access" || store.value.RefreshToken != "rotated-refresh" || store.value.OAuthClientID != "client-id" || store.value.OAuthClientSecret != "client-secret" {
		t.Fatalf("persisted credentials = %#v (sets=%d), want complete rotated snapshot", store.value, store.sets)
	}
}
