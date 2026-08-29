package gorilla_test

import (
	"bytes"
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	gemini_ws "github.com/gemini/developer-platform/packages/sdk-go/websocket"
	"github.com/gemini/developer-platform/packages/sdk-go/websocket/gorilla"
	gorilla_ws "github.com/gorilla/websocket"
)

var upgrader = gorilla_ws.Upgrader{
	CheckOrigin: func(r *http.Request) bool { return true },
}

func TestGorillaDialer_ConnectAndEcho(t *testing.T) {
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		conn, err := upgrader.Upgrade(w, r, nil)
		if err != nil {
			return
		}
		defer conn.Close()
		for {
			mt, message, err := conn.ReadMessage()
			if err != nil {
				break
			}
			if err := conn.WriteMessage(mt, message); err != nil {
				break
			}
		}
	}))
	defer ts.Close()

	wsURL := "ws" + strings.TrimPrefix(ts.URL, "http")

	dialer := gorilla.NewDialer()
	ctx := context.Background()
	conn, resp, err := dialer.Dial(ctx, wsURL, nil)
	if err != nil {
		t.Fatalf("failed dialing mock ws server: %v", err)
	}
	defer conn.Close()
	if resp.StatusCode != http.StatusSwitchingProtocols {
		t.Fatalf("expected status 101, got %d", resp.StatusCode)
	}

	testPayload := []byte(`{"op":"ping"}`)
	if err := conn.WriteMessage(ctx, 1, testPayload); err != nil {
		t.Fatalf("failed writing message: %v", err)
	}

	msgType, reply, err := conn.ReadMessage(ctx)
	if err != nil {
		t.Fatalf("failed reading echo response: %v", err)
	}
	if msgType != 1 || string(reply) != string(testPayload) {
		t.Fatalf("unexpected echo response: %s", string(reply))
	}
}

func TestGorillaDialer_RejectsNilDialer(t *testing.T) {
	_, _, err := (&gorilla.DialerAdapter{}).Dial(context.Background(), "ws://127.0.0.1:1", nil)
	if err == nil {
		t.Fatal("expected nil gorilla dialer to be rejected")
	}
}

func TestGorillaDialer_HonorsCanceledDialContext(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	cancel()

	_, _, err := gorilla.NewDialer().Dial(ctx, "ws://127.0.0.1:1", nil)
	if !errors.Is(err, context.Canceled) {
		t.Fatalf("expected context.Canceled, got %v", err)
	}
}

func TestGorillaConn_ReadHonorsContextCancellation(t *testing.T) {
	stop := make(chan struct{})
	ready := make(chan struct{})
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		conn, err := upgrader.Upgrade(w, r, nil)
		if err != nil {
			return
		}
		defer conn.Close()
		close(ready)
		<-stop
	}))
	defer func() {
		close(stop)
		ts.Close()
	}()

	wsURL := "ws" + strings.TrimPrefix(ts.URL, "http")
	conn, _, err := gorilla.NewDialer().Dial(context.Background(), wsURL, nil)
	if err != nil {
		t.Fatalf("failed dialing mock ws server: %v", err)
	}
	defer conn.Close()
	select {
	case <-ready:
	case <-time.After(time.Second):
		t.Fatal("server did not finish WebSocket upgrade")
	}

	ctx, cancel := context.WithCancel(context.Background())
	readDone := make(chan error, 1)
	go func() {
		_, _, readErr := conn.ReadMessage(ctx)
		readDone <- readErr
	}()
	cancel()

	select {
	case err := <-readDone:
		if !errors.Is(err, context.Canceled) {
			t.Fatalf("expected context.Canceled from interrupted read, got %v", err)
		}
	case <-time.After(time.Second):
		t.Fatal("read did not return after context cancellation")
	}
}

func TestGorillaConn_EnforcesInboundReadLimit(t *testing.T) {
	ready := make(chan struct{})
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		conn, err := upgrader.Upgrade(w, r, nil)
		if err != nil {
			return
		}
		defer conn.Close()
		close(ready)
		_ = conn.WriteMessage(gorilla_ws.TextMessage, bytes.Repeat([]byte("x"), 64))
	}))
	defer ts.Close()

	wsURL := "ws" + strings.TrimPrefix(ts.URL, "http")
	conn, _, err := gorilla.NewDialer().Dial(context.Background(), wsURL, nil)
	if err != nil {
		t.Fatalf("failed dialing mock ws server: %v", err)
	}
	defer conn.Close()
	select {
	case <-ready:
	case <-time.After(time.Second):
		t.Fatal("server did not finish WebSocket upgrade")
	}

	setter, ok := conn.(gemini_ws.ReadLimitSetter)
	if !ok {
		t.Fatal("Gorilla connection does not expose ReadLimitSetter")
	}
	setter.SetReadLimit(16)
	_, _, err = conn.ReadMessage(context.Background())
	if !errors.Is(err, gemini_ws.ErrMessageTooLarge) {
		t.Fatalf("expected ErrMessageTooLarge, got %v", err)
	}
}
