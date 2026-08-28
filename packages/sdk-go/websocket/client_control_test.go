package websocket_test

import (
	"bytes"
	"context"
	"errors"
	"net/http"
	"testing"
	"time"

	"github.com/gemini/gemini-go/transport"
	"github.com/gemini/gemini-go/websocket"
)

func TestClient_CloseInterruptsBlockedDial(t *testing.T) {
	dialer := &interruptibleDialer{
		conn:    newInterruptibleConn(),
		started: make(chan struct{}),
	}
	client := websocket.NewClient("wss://ws.gemini.com", websocket.WithDialer(dialer))
	t.Cleanup(func() { _ = client.Close() })

	connected := make(chan error, 1)
	go func() { connected <- client.Connect(context.Background()) }()
	select {
	case <-dialer.started:
	case <-time.After(time.Second):
		t.Fatal("dial did not start")
	}

	if err := client.Close(); err != nil {
		t.Fatalf("Close failed: %v", err)
	}
	select {
	case err := <-connected:
		if !errors.Is(err, transport.ErrConnectionClosed) {
			t.Fatalf("expected closed connection error, got %v", err)
		}
	case <-time.After(time.Second):
		t.Fatal("Connect did not return after Close interrupted dial")
	}
}

func TestClient_ClosesConnectionReturnedWithDialError(t *testing.T) {
	conn := newSilentConn()
	dialer := &errorConnDialer{conn: conn}
	client := websocket.NewClient("wss://ws.gemini.com", websocket.WithDialer(dialer))
	t.Cleanup(func() { _ = client.Close() })

	if err := client.Connect(context.Background()); err == nil {
		t.Fatal("expected dial error")
	}
	select {
	case <-conn.closed:
	case <-time.After(time.Second):
		t.Fatal("client did not close the connection returned with a dial error")
	}
}

func TestClient_CloseInterruptsBlockedWrite(t *testing.T) {
	conn := newInterruptibleConn()
	client := websocket.NewClient("wss://ws.gemini.com", websocket.WithDialer(&singleConnDialer{conn: conn}))
	t.Cleanup(func() { _ = client.Close() })

	if err := client.Connect(context.Background()); err != nil {
		t.Fatalf("Connect failed: %v", err)
	}
	sendErr := make(chan error, 1)
	go func() { sendErr <- client.Send(context.Background(), map[string]string{"type": "ping"}) }()
	select {
	case <-conn.writeStarted:
	case <-time.After(time.Second):
		t.Fatal("write did not start")
	}

	closeErr := make(chan error, 1)
	go func() { closeErr <- client.Close() }()
	select {
	case err := <-closeErr:
		if err != nil {
			t.Fatalf("Close failed: %v", err)
		}
	case <-time.After(time.Second):
		t.Fatal("Close did not interrupt blocked write")
	}
	select {
	case <-sendErr:
	case <-time.After(time.Second):
		t.Fatal("Send did not return after Close interrupted write")
	}
}

func TestClient_PingWaitsForCorrelatedResponse(t *testing.T) {
	dialer := &mockDrainDialer{}
	client := websocket.NewClient("wss://ws.gemini.com", websocket.WithDialer(dialer))
	t.Cleanup(func() { _ = client.Close() })

	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()
	if err := client.Ping(ctx); err != nil {
		t.Fatalf("Ping failed: %v", err)
	}

	conn := dialer.latestConn()
	conn.mu.Lock()
	defer conn.mu.Unlock()
	if len(conn.written) != 1 || !bytes.Contains(conn.written[0], []byte(`"method":"ping"`)) {
		t.Fatalf("expected correlated ping request, got %s", conn.written)
	}
}

func TestClient_PingReturnsProtocolError(t *testing.T) {
	dialer := &mockDrainDialer{
		responseStatus:  http.StatusBadRequest,
		responseMessage: "invalid ping",
	}
	client := websocket.NewClient("wss://ws.gemini.com", websocket.WithDialer(dialer))
	t.Cleanup(func() { _ = client.Close() })

	err := client.Ping(context.Background())
	if !errors.Is(err, websocket.ErrRequestFailed) {
		t.Fatalf("expected ErrRequestFailed, got %v", err)
	}
	var requestErr *websocket.RequestError
	if !errors.As(err, &requestErr) || requestErr.Status != http.StatusBadRequest || requestErr.Message != "invalid ping" {
		t.Fatalf("unexpected protocol error: %v", err)
	}
}

func TestClient_PendingRequestHonorsContext(t *testing.T) {
	conn := newSilentConn()
	client := websocket.NewClient("wss://ws.gemini.com", websocket.WithDialer(&silentDialer{conn: conn}))
	t.Cleanup(func() { _ = client.Close() })

	ctx, cancel := context.WithCancel(context.Background())
	requestDone := make(chan error, 1)
	go func() {
		_, err := client.Request(ctx, "ping", nil)
		requestDone <- err
	}()
	select {
	case <-conn.writeStarted:
	case <-time.After(time.Second):
		t.Fatal("request write did not start")
	}
	cancel()

	select {
	case err := <-requestDone:
		if !errors.Is(err, context.Canceled) {
			t.Fatalf("expected context cancellation, got %v", err)
		}
	case <-time.After(time.Second):
		t.Fatal("pending request did not honor context cancellation")
	}
}

func TestClient_PendingRequestFailsOnClose(t *testing.T) {
	conn := newSilentConn()
	client := websocket.NewClient("wss://ws.gemini.com", websocket.WithDialer(&silentDialer{conn: conn}))
	t.Cleanup(func() { _ = client.Close() })

	requestDone := make(chan error, 1)
	go func() {
		_, err := client.Request(context.Background(), "ping", nil)
		requestDone <- err
	}()
	select {
	case <-conn.writeStarted:
	case <-time.After(time.Second):
		t.Fatal("request write did not start")
	}

	if err := client.Close(); err != nil {
		t.Fatalf("Close failed: %v", err)
	}
	select {
	case err := <-requestDone:
		if !errors.Is(err, transport.ErrConnectionClosed) {
			t.Fatalf("expected pending request to fail with connection closed, got %v", err)
		}
	case <-time.After(time.Second):
		t.Fatal("pending request did not resolve after Close")
	}
}

func TestClient_PendingRequestFailsOnConnectionDrop(t *testing.T) {
	conn := newSilentConn()
	client := websocket.NewClient(
		"wss://ws.gemini.com",
		websocket.WithDialer(&silentDialer{conn: conn}),
		websocket.WithAutoReconnect(false),
	)
	t.Cleanup(func() { _ = client.Close() })

	requestDone := make(chan error, 1)
	go func() {
		_, err := client.Request(context.Background(), "ping", nil)
		requestDone <- err
	}()
	select {
	case <-conn.writeStarted:
	case <-time.After(time.Second):
		t.Fatal("request write did not start")
	}
	if err := conn.Close(); err != nil {
		t.Fatalf("simulated connection drop failed: %v", err)
	}

	select {
	case err := <-requestDone:
		if err == nil || errors.Is(err, context.Canceled) {
			t.Fatalf("expected connection-drop error, got %v", err)
		}
	case <-time.After(time.Second):
		t.Fatal("pending request did not resolve after connection drop")
	}
}

func TestClient_UnsubscribePrivateFeedClosesChannelAndSendsRequest(t *testing.T) {
	dialer := &mockDrainDialer{}
	client := websocket.NewPrivateClient(
		"wss://ws.gemini.com",
		&mockAuthStrategy{key: "key", secret: "secret"},
		websocket.WithDialer(dialer),
	)
	t.Cleanup(func() { _ = client.Close() })

	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()
	orderCh, err := client.SubscribeOrderEvents(ctx)
	if err != nil {
		t.Fatalf("SubscribeOrderEvents failed: %v", err)
	}
	if err := client.UnsubscribeOrderEvents(ctx); err != nil {
		t.Fatalf("UnsubscribeOrderEvents failed: %v", err)
	}
	select {
	case _, ok := <-orderCh:
		if ok {
			t.Fatal("expected order event channel to be closed")
		}
	case <-time.After(time.Second):
		t.Fatal("order event channel was not closed")
	}

	conn := dialer.latestConn()
	conn.mu.Lock()
	written := append([][]byte(nil), conn.written...)
	conn.mu.Unlock()
	if len(written) != 2 || !bytes.Contains(written[0], []byte(`"method":"SUBSCRIBE"`)) || !bytes.Contains(written[1], []byte(`"method":"UNSUBSCRIBE"`)) {
		t.Fatalf("expected subscribe and unsubscribe requests, got %s", written)
	}
	if err := client.UnsubscribeOrderEvents(ctx); err != nil {
		t.Fatalf("idempotent UnsubscribeOrderEvents failed: %v", err)
	}
}

func TestClient_UnsubscribeOrderEventsChannelPreservesOtherSubscribers(t *testing.T) {
	dialer := &mockDrainDialer{}
	client := websocket.NewPrivateClient(
		"wss://ws.gemini.com",
		&mockAuthStrategy{key: "key", secret: "secret"},
		websocket.WithDialer(dialer),
	)
	t.Cleanup(func() { _ = client.Close() })

	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()
	first, err := client.SubscribeOrderEvents(ctx)
	if err != nil {
		t.Fatalf("first SubscribeOrderEvents failed: %v", err)
	}
	second, err := client.SubscribeOrderEvents(ctx)
	if err != nil {
		t.Fatalf("second SubscribeOrderEvents failed: %v", err)
	}
	if err := client.UnsubscribeOrderEventsChannel(ctx, first); err != nil {
		t.Fatalf("UnsubscribeOrderEventsChannel failed: %v", err)
	}
	select {
	case _, ok := <-first:
		if ok {
			t.Fatal("expected the scoped order event channel to be closed")
		}
	case <-time.After(time.Second):
		t.Fatal("scoped order event channel was not closed")
	}

	select {
	case _, ok := <-second:
		if !ok {
			t.Fatal("scoped unsubscribe closed another order event subscriber")
		}
	default:
	}

	dialer.latestConn().readChan <- []byte(`{"e":"order","s":"BTCUSD","S":"BUY","p":"65000","q":"0.1","X":"OPEN","i":987}`)
	select {
	case event := <-second:
		if event == nil || event.OrderID != 987 {
			t.Fatalf("unexpected event delivered to remaining subscriber: %+v", event)
		}
	case <-time.After(time.Second):
		t.Fatal("remaining order event subscriber did not receive an event")
	}
}
