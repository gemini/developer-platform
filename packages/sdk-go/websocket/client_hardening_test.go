package websocket

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

type hardeningConn struct {
	closed    chan struct{}
	closeOnce sync.Once
	reads     chan []byte
	respond   atomic.Bool
	readLimit atomic.Int64
}

func newHardeningConn() *hardeningConn {
	conn := &hardeningConn{
		closed: make(chan struct{}),
		reads:  make(chan []byte, 16),
	}
	conn.respond.Store(true)
	return conn
}

func (c *hardeningConn) ReadMessage(ctx context.Context) (int, []byte, error) {
	select {
	case <-ctx.Done():
		return 0, nil, ctx.Err()
	case <-c.closed:
		return 0, nil, errors.New("hardening connection closed")
	case payload := <-c.reads:
		return TextMessage, payload, nil
	}
}

func (c *hardeningConn) WriteMessage(ctx context.Context, _ int, payload []byte) error {
	var request RequestFrame
	if err := json.Unmarshal(payload, &request); err != nil {
		return err
	}
	if !c.respond.Load() {
		return nil
	}
	ack, err := json.Marshal(map[string]any{
		"id":     request.ID,
		"status": http.StatusOK,
		"result": map[string]any{},
	})
	if err != nil {
		return err
	}
	select {
	case <-ctx.Done():
		return ctx.Err()
	case <-c.closed:
		return errors.New("hardening connection closed")
	case c.reads <- ack:
		return nil
	}
}

func (c *hardeningConn) Close() error {
	c.closeOnce.Do(func() { close(c.closed) })
	return nil
}

func (c *hardeningConn) SetReadLimit(limit int64) {
	c.readLimit.Store(limit)
}

func (c *hardeningConn) feed(payload []byte) {
	select {
	case <-c.closed:
	case c.reads <- payload:
	}
}

type hardeningDialer struct {
	conn  *hardeningConn
	calls atomic.Int32
}

type trackingResponseBody struct {
	closed atomic.Bool
}

func (*trackingResponseBody) Read([]byte) (int, error) {
	return 0, io.EOF
}

func (b *trackingResponseBody) Close() error {
	b.closed.Store(true)
	return nil
}

type failedHandshakeDialer struct {
	body *trackingResponseBody
}

func (d *failedHandshakeDialer) Dial(context.Context, string, http.Header) (Conn, *http.Response, error) {
	return nil, &http.Response{StatusCode: http.StatusUnauthorized, Body: d.body}, errors.New("handshake rejected")
}

func (d *hardeningDialer) Dial(context.Context, string, http.Header) (Conn, *http.Response, error) {
	d.calls.Add(1)
	if d.conn == nil {
		d.conn = newHardeningConn()
	}
	return d.conn, &http.Response{StatusCode: http.StatusSwitchingProtocols}, nil
}

func waitForConnectionError(t *testing.T, events <-chan ConnectionEvent, want error) {
	t.Helper()
	deadline := time.After(2 * time.Second)
	for {
		select {
		case event, ok := <-events:
			if !ok {
				t.Fatal("connection event channel closed before expected error")
			}
			if errors.Is(event.Err, want) {
				return
			}
		case <-deadline:
			t.Fatalf("timed out waiting for connection error %v", want)
		}
	}
}

func TestClient_ClosesFailedHandshakeResponseBody(t *testing.T) {
	body := &trackingResponseBody{}
	client := NewClient("wss://ws.gemini.com", WithDialer(&failedHandshakeDialer{body: body}))
	t.Cleanup(func() { _ = client.Close() })

	if err := client.Connect(context.Background()); err == nil {
		t.Fatal("Connect() error = nil, want handshake failure")
	}
	if !body.closed.Load() {
		t.Fatal("failed handshake response body was not closed")
	}
}

func TestClient_RejectsOversizedInboundFrame(t *testing.T) {
	dialer := &hardeningDialer{conn: newHardeningConn()}
	client := NewClient(
		"wss://ws.gemini.com",
		WithDialer(dialer),
		WithAutoReconnect(false),
		WithMaxMessageSize(16),
	)
	t.Cleanup(func() { _ = client.Close() })

	events, stop := client.SubscribeConnectionEvents(8)
	t.Cleanup(stop)
	if err := client.Connect(context.Background()); err != nil {
		t.Fatalf("Connect failed: %v", err)
	}
	if got := dialer.conn.readLimit.Load(); got != 16 {
		t.Fatalf("expected transport read limit 16, got %d", got)
	}

	dialer.conn.feed([]byte("0123456789abcdefx"))
	waitForConnectionError(t, events, ErrMessageTooLarge)
	if got := client.State(); got != StateDisconnected {
		t.Fatalf("expected disconnected state after oversized frame, got %s", got)
	}
}

func TestClient_MalformedFrameIsObservableAndConnectionContinues(t *testing.T) {
	dialer := &hardeningDialer{conn: newHardeningConn()}
	client := NewClient("wss://ws.gemini.com", WithDialer(dialer))
	t.Cleanup(func() { _ = client.Close() })

	events, stop := client.SubscribeConnectionEvents(8)
	t.Cleanup(stop)
	if err := client.Connect(context.Background()); err != nil {
		t.Fatalf("Connect failed: %v", err)
	}
	dialer.conn.feed([]byte("{"))
	waitForConnectionError(t, events, ErrMalformedFrame)

	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()
	if err := client.Ping(ctx); err != nil {
		t.Fatalf("connection did not continue after malformed frame: %v", err)
	}
	if got := client.State(); got != StateConnected {
		t.Fatalf("expected connected state after malformed frame, got %s", got)
	}
}

func TestClient_LivenessFailurePreservesErrorIdentity(t *testing.T) {
	dialer := &hardeningDialer{conn: newHardeningConn()}
	client := NewClient(
		"wss://ws.gemini.com",
		WithDialer(dialer),
		WithAutoReconnect(false),
		WithLiveness(10*time.Millisecond, 20*time.Millisecond),
	)
	t.Cleanup(func() { _ = client.Close() })

	events, stop := client.SubscribeConnectionEvents(16)
	t.Cleanup(stop)
	if err := client.Connect(context.Background()); err != nil {
		t.Fatalf("Connect failed: %v", err)
	}
	dialer.conn.respond.Store(false)

	deadline := time.After(2 * time.Second)
	for {
		select {
		case event := <-events:
			if errors.Is(event.Err, ErrLivenessFailed) {
				if !errors.Is(event.Err, context.DeadlineExceeded) {
					t.Fatalf("liveness error lost deadline identity: %v", event.Err)
				}
				return
			}
		case <-deadline:
			t.Fatal("timed out waiting for liveness failure")
		}
	}
}

func TestClient_CloseInterruptsReconnectBackoff(t *testing.T) {
	dialer := &backoffDialer{first: newHardeningConn()}
	client := NewClient(
		"wss://ws.gemini.com",
		WithDialer(dialer),
		WithAutoReconnect(true),
		WithMaxReconnects(3),
	)
	t.Cleanup(func() { _ = client.Close() })
	if err := client.Connect(context.Background()); err != nil {
		t.Fatalf("Connect failed: %v", err)
	}
	events, stop := client.SubscribeConnectionEvents(8)
	t.Cleanup(stop)
	if err := dialer.first.Close(); err != nil {
		t.Fatalf("failed closing first connection: %v", err)
	}
	waitForState(t, events, StateReconnecting)

	closed := make(chan error, 1)
	go func() { closed <- client.Close() }()
	select {
	case err := <-closed:
		if err != nil {
			t.Fatalf("Close failed: %v", err)
		}
	case <-time.After(500 * time.Millisecond):
		t.Fatal("Close did not interrupt reconnect backoff")
	}
}

func waitForState(t *testing.T, events <-chan ConnectionEvent, state ConnectionState) {
	t.Helper()
	deadline := time.After(2 * time.Second)
	for {
		select {
		case event := <-events:
			if event.State == state {
				return
			}
		case <-deadline:
			t.Fatalf("timed out waiting for state %s", state)
		}
	}
}

type backoffDialer struct {
	first *hardeningConn
	calls atomic.Int32
}

func (d *backoffDialer) Dial(context.Context, string, http.Header) (Conn, *http.Response, error) {
	if d.calls.Add(1) == 1 {
		return d.first, &http.Response{StatusCode: http.StatusSwitchingProtocols}, nil
	}
	return nil, nil, errors.New("dial unavailable during backoff test")
}

type lateFrameConn struct {
	closed      chan struct{}
	readStarted chan struct{}
	releaseRead chan struct{}
	closeOnce   sync.Once
}

func newLateFrameConn() *lateFrameConn {
	return &lateFrameConn{
		closed:      make(chan struct{}),
		readStarted: make(chan struct{}),
		releaseRead: make(chan struct{}),
	}
}

func (c *lateFrameConn) ReadMessage(context.Context) (int, []byte, error) {
	select {
	case <-c.readStarted:
	default:
		close(c.readStarted)
	}
	<-c.releaseRead
	return TextMessage, []byte(`{"e":"depthUpdate","s":"BTCUSD","U":1,"u":1}`), nil
}

func (c *lateFrameConn) WriteMessage(context.Context, int, []byte) error { return nil }

func (c *lateFrameConn) Close() error {
	c.closeOnce.Do(func() { close(c.closed) })
	return nil
}

func TestClient_DropsLateFrameFromSupersededLifecycle(t *testing.T) {
	conn := newLateFrameConn()
	client := NewClient("wss://ws.gemini.com")
	t.Cleanup(func() { _ = client.Close() })

	sub := newSubscription[DepthUpdate](1)
	tables := client.subTables.Load().clone()
	tables.depthSubs["BTCUSD"] = []*subscription[DepthUpdate]{sub}
	client.subTables.Store(tables)
	client.mu.Lock()
	client.conn = conn
	client.state.Store(int32(StateConnected))
	client.lifecycle.Store(1)
	client.mu.Unlock()

	client.pumpWg.Add(1)
	go client.readPump(1)
	select {
	case <-conn.readStarted:
	case <-time.After(time.Second):
		t.Fatal("read pump did not start")
	}
	client.lifecycle.Store(2)
	close(conn.releaseRead)

	select {
	case event := <-sub.ch:
		t.Fatalf("late frame from superseded lifecycle was delivered: %+v", event)
	case <-time.After(100 * time.Millisecond):
	}
}

func TestClient_RPCResponseBypassesBlockedStreamingConsumer(t *testing.T) {
	dialer := &hardeningDialer{conn: newHardeningConn()}
	client := NewClient("wss://ws.gemini.com", WithDialer(dialer))
	t.Cleanup(func() { _ = client.Close() })
	if err := client.Connect(context.Background()); err != nil {
		t.Fatalf("Connect failed: %v", err)
	}

	sub := newSubscription[DepthUpdate](1)
	sub.ch <- &DepthUpdate{}
	tables := client.subTables.Load().clone()
	tables.depthSubs["BTCUSD"] = []*subscription[DepthUpdate]{sub}
	client.subTables.Store(tables)
	dialer.conn.feed([]byte(`{"e":"depthUpdate","s":"BTCUSD","U":1,"u":1}`))

	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()
	if err := client.Ping(ctx); err != nil {
		t.Fatalf("RPC response was blocked by streaming consumer: %v", err)
	}
}
