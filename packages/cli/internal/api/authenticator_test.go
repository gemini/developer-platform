package api

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestHMACAuthenticatorType(t *testing.T) {
	auth := NewHMACAuthenticator("key", "secret")
	if auth.Type() != "hmac" {
		t.Errorf("Type() = %s, want hmac", auth.Type())
	}
}

func TestBearerAuthenticatorType(t *testing.T) {
	auth := NewBearerAuthenticator("token123")
	if auth.Type() != "bearer" {
		t.Errorf("Type() = %s, want bearer", auth.Type())
	}
}

func TestHMACAuthenticateRequest(t *testing.T) {
	auth := NewHMACAuthenticator("test-key", "test-secret")

	req := httptest.NewRequest(http.MethodPost, "/v1/test", nil)
	err := auth.AuthenticateRequest(req, http.MethodPost, "/v1/test", map[string]any{"foo": "bar"})
	if err != nil {
		t.Fatalf("AuthenticateRequest() error = %v", err)
	}

	if req.Header.Get("X-GEMINI-APIKEY") != "test-key" {
		t.Errorf("X-GEMINI-APIKEY = %s, want test-key", req.Header.Get("X-GEMINI-APIKEY"))
	}
	if req.Header.Get("X-GEMINI-PAYLOAD") == "" {
		t.Error("X-GEMINI-PAYLOAD is empty")
	}
	if req.Header.Get("X-GEMINI-SIGNATURE") == "" {
		t.Error("X-GEMINI-SIGNATURE is empty")
	}
}

func TestHMACAuthenticateGETRequest(t *testing.T) {
	auth := NewHMACAuthenticator("test-key", "test-secret")

	req := httptest.NewRequest(http.MethodGet, "/v1/test", nil)
	err := auth.AuthenticateRequest(req, http.MethodGet, "/v1/test", nil)
	if err != nil {
		t.Fatalf("AuthenticateRequest() error = %v", err)
	}

	if req.Header.Get("X-GEMINI-APIKEY") != "test-key" {
		t.Errorf("X-GEMINI-APIKEY = %s, want test-key", req.Header.Get("X-GEMINI-APIKEY"))
	}
}

func TestBearerAuthenticateRequest(t *testing.T) {
	auth := NewBearerAuthenticator("my-access-token")

	req := httptest.NewRequest(http.MethodPost, "/v1/test", nil)
	err := auth.AuthenticateRequest(req, http.MethodPost, "/v1/test", nil)
	if err != nil {
		t.Fatalf("AuthenticateRequest() error = %v", err)
	}

	got := req.Header.Get("Authorization")
	want := "Bearer my-access-token"
	if got != want {
		t.Errorf("Authorization = %s, want %s", got, want)
	}

	// Bearer auth should NOT set HMAC headers
	if req.Header.Get("X-GEMINI-APIKEY") != "" {
		t.Error("Bearer auth should not set X-GEMINI-APIKEY")
	}
}

func TestHMACAuthenticateWebSocket(t *testing.T) {
	auth := NewHMACAuthenticator("ws-key", "ws-secret")

	headers, err := auth.AuthenticateWebSocket()
	if err != nil {
		t.Fatalf("AuthenticateWebSocket() error = %v", err)
	}

	if headers.Get("X-GEMINI-APIKEY") != "ws-key" {
		t.Errorf("X-GEMINI-APIKEY = %s, want ws-key", headers.Get("X-GEMINI-APIKEY"))
	}
	if headers.Get("X-GEMINI-PAYLOAD") == "" {
		t.Error("X-GEMINI-PAYLOAD is empty")
	}
	if headers.Get("X-GEMINI-SIGNATURE") == "" {
		t.Error("X-GEMINI-SIGNATURE is empty")
	}
	if headers.Get("X-GEMINI-NONCE") == "" {
		t.Error("X-GEMINI-NONCE is empty")
	}
}

func TestBearerAuthenticateWebSocket(t *testing.T) {
	auth := NewBearerAuthenticator("ws-token")

	headers, err := auth.AuthenticateWebSocket()
	if err != nil {
		t.Fatalf("AuthenticateWebSocket() error = %v", err)
	}

	got := headers.Get("Authorization")
	want := "Bearer ws-token"
	if got != want {
		t.Errorf("Authorization = %s, want %s", got, want)
	}

	if headers.Get("X-GEMINI-APIKEY") != "" {
		t.Error("Bearer WS auth should not set X-GEMINI-APIKEY")
	}
}

func TestAuthenticatorInterface(t *testing.T) {
	// Verify both types satisfy the interface
	var _ Authenticator = (*HMACAuthenticator)(nil)
	var _ Authenticator = (*BearerAuthenticator)(nil)
}
