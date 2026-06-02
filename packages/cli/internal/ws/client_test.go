package ws

import (
	"context"
	"crypto/hmac"
	"crypto/sha512"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/gorilla/websocket"
)

func TestStreamHelpers(t *testing.T) {
	tests := []struct {
		name     string
		fn       func() string
		expected string
	}{
		{"TickerStream", func() string { return TickerStream("btcusd") }, "btcusd@bookTicker"},
		{"TradesStream", func() string { return TradesStream("ethusd") }, "ethusd@trade"},
		{"DepthStream 10", func() string { return DepthStream("btcusd", 10) }, "btcusd@depth10"},
		{"DepthStream 20", func() string { return DepthStream("btcusd", 20) }, "btcusd@depth20"},
		{"OrdersStream", func() string { return OrdersStream() }, "orders@account"},
		{"OrdersSessionStream", func() string { return OrdersSessionStream() }, "orders@session"},
		{"BalancesStream", func() string { return BalancesStream() }, "balances@account"},
		{"BalancesSnapshotStream", func() string { return BalancesSnapshotStream() }, "balances@account@1s"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := tt.fn()
			if got != tt.expected {
				t.Errorf("%s() = %v, want %v", tt.name, got, tt.expected)
			}
		})
	}
}

func TestGenerateAuthHeaders(t *testing.T) {
	c := &Client{
		auth: &AuthConfig{
			APIKey:    "test-key",
			APISecret: "test-secret",
		},
	}

	headers, err := c.generateAuthHeaders(context.Background())
	if err != nil {
		t.Fatalf("generateAuthHeaders() error = %v", err)
	}

	if headers.Get("X-GEMINI-APIKEY") != "test-key" {
		t.Errorf("X-GEMINI-APIKEY = %v, want %v", headers.Get("X-GEMINI-APIKEY"), "test-key")
	}

	payload := headers.Get("X-GEMINI-PAYLOAD")
	if payload == "" {
		t.Error("X-GEMINI-PAYLOAD should not be empty")
	}

	signature := headers.Get("X-GEMINI-SIGNATURE")
	if signature == "" {
		t.Error("X-GEMINI-SIGNATURE should not be empty")
	}

	nonce := headers.Get("X-GEMINI-NONCE")
	if nonce == "" {
		t.Error("X-GEMINI-NONCE should not be empty")
	}

	// Verify payload is base64(nonce)
	decoded, err := base64.StdEncoding.DecodeString(payload)
	if err != nil {
		t.Fatalf("Payload is not valid base64: %v", err)
	}
	if string(decoded) != nonce {
		t.Errorf("Decoded payload = %v, want nonce %v", string(decoded), nonce)
	}

	// Verify signature is hex (96 chars for SHA384)
	if len(signature) != 96 {
		t.Errorf("Signature length = %d, want 96 (hex-encoded SHA384)", len(signature))
	}

	mac := hmac.New(sha512.New384, []byte("test-secret"))
	mac.Write([]byte(payload))
	expectedSignature := hex.EncodeToString(mac.Sum(nil))
	if signature != expectedSignature {
		t.Errorf("X-GEMINI-SIGNATURE = %q, want HMAC-SHA384(payload)", signature)
	}
}

func TestGenerateAuthHeadersWithBearerTokenSource(t *testing.T) {
	c := &Client{
		auth: &AuthConfig{
			BearerTokenSource: func(ctx context.Context) (string, error) {
				return "fresh-token", nil
			},
		},
	}

	headers, err := c.generateAuthHeaders(context.Background())
	if err != nil {
		t.Fatalf("generateAuthHeaders() error = %v", err)
	}
	if got := headers.Get("Authorization"); got != "Bearer fresh-token" {
		t.Fatalf("Authorization = %q, want Bearer fresh-token", got)
	}
}

func TestGenerateAuthHeadersWithBearerTokenSourceError(t *testing.T) {
	c := &Client{
		auth: &AuthConfig{
			BearerTokenSource: func(ctx context.Context) (string, error) {
				return "", errors.New("reauth required")
			},
		},
	}

	if _, err := c.generateAuthHeaders(context.Background()); err == nil {
		t.Fatal("generateAuthHeaders() error = nil, want error")
	}
}

func TestClientOptions(t *testing.T) {
	c := &Client{
		maxReconnects: DefaultMaxReconnects,
	}

	// Test WithReconnect
	WithReconnect(10)(c)
	if !c.reconnectEnabled {
		t.Error("WithReconnect should enable reconnection")
	}
	if c.maxReconnects != 10 {
		t.Errorf("maxReconnects = %d, want 10", c.maxReconnects)
	}

	// Test WithAuth
	WithAuth("api-key", "api-secret")(c)
	if c.auth == nil {
		t.Fatal("WithAuth should set auth config")
	}
	if c.auth.APIKey != "api-key" {
		t.Errorf("auth.APIKey = %v, want api-key", c.auth.APIKey)
	}
	if c.auth.APISecret != "api-secret" {
		t.Errorf("auth.APISecret = %v, want api-secret", c.auth.APISecret)
	}

	WithBearerTokenSource(func(ctx context.Context) (string, error) {
		return "token", nil
	})(c)
	if c.auth.BearerTokenSource == nil {
		t.Fatal("WithBearerTokenSource should set token source")
	}

	// Test WithOnReconnect
	called := false
	WithOnReconnect(func() { called = true })(c)
	if c.onReconnect == nil {
		t.Error("WithOnReconnect should set callback")
	}
	c.onReconnect()
	if !called {
		t.Error("onReconnect callback should be invoked")
	}
}

func TestIsHealthy(t *testing.T) {
	c := &Client{
		pingInterval: DefaultPingInterval,
		pongTimeout:  DefaultPongTimeout,
	}

	t.Run("healthy when recent pong", func(t *testing.T) {
		c.lastPongTime = time.Now()
		if !c.IsHealthy() {
			t.Error("should be healthy with recent pong")
		}
	})

	t.Run("unhealthy when stale", func(t *testing.T) {
		c.lastPongTime = time.Now().Add(-c.pingInterval - c.pongTimeout - time.Second)
		if c.IsHealthy() {
			t.Error("should be unhealthy when pong is stale")
		}
	})
}

func TestError(t *testing.T) {
	err := &Error{Code: 401, Msg: "unauthorized"}
	expected := "401: unauthorized"
	if err.Error() != expected {
		t.Errorf("Error() = %v, want %v", err.Error(), expected)
	}
}

// newTestWSServer starts a test WebSocket server and returns its URL and a
// teardown function. The handler receives each connection; when it returns the
// connection is closed.
func newTestWSServer(t *testing.T, handler func(*websocket.Conn)) string {
	t.Helper()
	upgrader := websocket.Upgrader{CheckOrigin: func(r *http.Request) bool { return true }}
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		conn, err := upgrader.Upgrade(w, r, nil)
		if err != nil {
			return
		}
		defer conn.Close()
		handler(conn)
	}))
	t.Cleanup(srv.Close)
	return "ws" + strings.TrimPrefix(srv.URL, "http")
}

// TestReadLoop_NormalServerClose verifies that when the server sends a normal
// WebSocket close frame the client exits cleanly without attempting to reconnect.
func TestReadLoop_NormalServerClose(t *testing.T) {
	subscribeResponseSent := make(chan struct{})

	url := newTestWSServer(t, func(conn *websocket.Conn) {
		// Read the subscribe request.
		_, _, _ = conn.ReadMessage()

		// Respond with status:200 then close normally — mimics the server
		// closing an orders stream when there are no open orders.
		resp, _ := json.Marshal(map[string]any{"id": 1, "status": 200})
		_ = conn.WriteMessage(websocket.TextMessage, resp)
		close(subscribeResponseSent)
		_ = conn.WriteMessage(websocket.CloseMessage,
			websocket.FormatCloseMessage(websocket.CloseNormalClosure, ""))
	})

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	client, err := Connect(ctx, url, WithReconnect(5))
	if err != nil {
		t.Fatalf("Connect() error = %v", err)
	}
	defer client.Close()

	if err := client.Subscribe(ctx, "orders@account"); err != nil {
		t.Fatalf("Subscribe() error = %v", err)
	}

	// Stream() should close when the server closes — no reconnect loops.
	streamDone := make(chan struct{})
	go func() {
		for range client.Stream(ctx) {
		}
		close(streamDone)
	}()

	select {
	case <-streamDone:
		// Good — stream exited cleanly.
	case <-time.After(4 * time.Second):
		t.Fatal("stream did not exit within 4s after normal server close (reconnect loop?)")
	}
}
