package services_test

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/gemini/developer-platform/packages/sdk-go/auth"
	"github.com/gemini/developer-platform/packages/sdk-go/services"
	"github.com/gemini/developer-platform/packages/sdk-go/transport"
	"github.com/gemini/developer-platform/packages/sdk-go/websocket"
)

type reconcilerStreamConn struct {
	closed    chan struct{}
	closeOnce sync.Once
	reads     chan []byte
}

func (c *reconcilerStreamConn) ReadMessage(ctx context.Context) (int, []byte, error) {
	select {
	case <-ctx.Done():
		return 0, nil, ctx.Err()
	case <-c.closed:
		return 0, nil, errors.New("test websocket closed")
	case payload := <-c.reads:
		return websocket.TextMessage, payload, nil
	}
}

func (c *reconcilerStreamConn) WriteMessage(ctx context.Context, _ int, payload []byte) error {
	var request websocket.RequestFrame
	if err := json.Unmarshal(payload, &request); err != nil {
		return err
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
		return errors.New("test websocket closed")
	case c.reads <- ack:
		return nil
	}
}

func (c *reconcilerStreamConn) Close() error {
	c.closeOnce.Do(func() { close(c.closed) })
	return nil
}

type reconcilerStreamDialer struct {
	mu   sync.Mutex
	conn *reconcilerStreamConn
}

func (d *reconcilerStreamDialer) Dial(context.Context, string, http.Header) (websocket.Conn, *http.Response, error) {
	conn := &reconcilerStreamConn{
		closed: make(chan struct{}),
		reads:  make(chan []byte, 16),
	}
	d.mu.Lock()
	d.conn = conn
	d.mu.Unlock()
	return conn, &http.Response{StatusCode: http.StatusSwitchingProtocols}, nil
}

func (d *reconcilerStreamDialer) latest() *reconcilerStreamConn {
	d.mu.Lock()
	defer d.mu.Unlock()
	return d.conn
}

func TestQuoteReconciler_StartStreamingHydratesAndAppliesEvents(t *testing.T) {
	server := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v1/orders" {
			http.NotFound(w, r)
			return
		}
		_, _ = w.Write([]byte(`[]`))
	}))
	t.Cleanup(server.Close)

	tradingSvc := services.NewTradingService(
		transport.NewClient(transport.WithHTTPClient(server.Client())),
		server.URL,
	)
	dialer := &reconcilerStreamDialer{}
	wsClient := websocket.NewPrivateClient(
		"wss://ws.gemini.com",
		auth.NewTimeBasedHMAC(auth.APIKey("key"), auth.APISecret("secret")),
		websocket.WithDialer(dialer),
	)
	t.Cleanup(func() { _ = wsClient.Close() })

	ctx, cancel := context.WithCancel(context.Background())
	reconciler := services.NewQuoteReconciler(tradingSvc, wsClient, "BTCUSD")
	errCh, err := reconciler.StartStreaming(ctx)
	if err != nil {
		t.Fatalf("StartStreaming failed: %v", err)
	}

	conn := dialer.latest()
	if conn == nil {
		t.Fatal("expected streaming dialer to establish a connection")
	}
	conn.reads <- []byte(`{"e":"order","s":"BTCUSD","S":"BUY","p":"65000","q":"0.1","X":"OPEN","i":987}`)

	deadline := time.Now().Add(time.Second)
	var observed bool
	for time.Now().Before(deadline) {
		if orders := reconciler.ActiveOrders(); len(orders) == 1 && orders[0].OrderID == "987" {
			observed = true
			break
		}
		time.Sleep(time.Millisecond)
	}
	if !observed {
		t.Fatal("streaming reconciler did not apply order event")
	}
	cancel()
	select {
	case _, ok := <-errCh:
		if ok {
			t.Fatal("expected streaming error channel to close without an error")
		}
	case <-time.After(time.Second):
		t.Fatal("streaming goroutine did not stop after cancellation")
	}
}

func TestQuoteReconciler_RehydratesAfterOrdinaryReconnect(t *testing.T) {
	var orderRequests atomic.Int32
	server := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v1/orders" {
			http.NotFound(w, r)
			return
		}
		if orderRequests.Add(1) == 1 {
			_, _ = w.Write([]byte(`[]`))
			return
		}
		_, _ = w.Write([]byte(`[{"order_id":"987","symbol":"BTCUSD","price":"65000","original_amount":"0.1","side":"buy"}]`))
	}))
	t.Cleanup(server.Close)

	tradingSvc := services.NewTradingService(
		transport.NewClient(transport.WithHTTPClient(server.Client())),
		server.URL,
	)
	dialer := &reconcilerStreamDialer{}
	wsClient := websocket.NewPrivateClient(
		"wss://ws.gemini.com",
		auth.NewTimeBasedHMAC(auth.APIKey("key"), auth.APISecret("secret")),
		websocket.WithDialer(dialer),
	)
	t.Cleanup(func() { _ = wsClient.Close() })

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	reconciler := services.NewQuoteReconciler(tradingSvc, wsClient, "BTCUSD")
	errCh, err := reconciler.StartStreaming(ctx)
	if err != nil {
		t.Fatalf("StartStreaming failed: %v", err)
	}

	firstConn := dialer.latest()
	if firstConn == nil {
		t.Fatal("expected initial streaming connection")
	}
	if err := firstConn.Close(); err != nil {
		t.Fatalf("failed to close initial connection: %v", err)
	}

	deadline := time.Now().Add(3 * time.Second)
	for time.Now().Before(deadline) {
		if orders := reconciler.ActiveOrders(); len(orders) == 1 && orders[0].OrderID == "987" {
			cancel()
			select {
			case _, ok := <-errCh:
				if ok {
					t.Fatal("expected streaming error channel to close after cancellation")
				}
			case <-time.After(time.Second):
				t.Fatal("streaming goroutine did not stop after cancellation")
			}
			return
		}
		time.Sleep(time.Millisecond)
	}
	t.Fatal("reconciler did not rehydrate after ordinary websocket reconnect")
}

func TestQuoteReconciler_SerializesInitialAndReconnectHydration(t *testing.T) {
	var requestCount atomic.Int32
	var activeRequests atomic.Int32
	var maxActiveRequests atomic.Int32
	firstRequestStarted := make(chan struct{})
	secondRequestStarted := make(chan struct{})
	releaseFirstRequest := make(chan struct{})
	var releaseOnce sync.Once

	server := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v1/orders" {
			http.NotFound(w, r)
			return
		}
		current := activeRequests.Add(1)
		defer activeRequests.Add(-1)
		for {
			previous := maxActiveRequests.Load()
			if current <= previous || maxActiveRequests.CompareAndSwap(previous, current) {
				break
			}
		}

		switch requestCount.Add(1) {
		case 1:
			close(firstRequestStarted)
			<-releaseFirstRequest
		case 2:
			close(secondRequestStarted)
		}
		_, _ = w.Write([]byte(`[]`))
	}))
	t.Cleanup(server.Close)
	t.Cleanup(func() { releaseOnce.Do(func() { close(releaseFirstRequest) }) })

	tradingSvc := services.NewTradingService(
		transport.NewClient(transport.WithHTTPClient(server.Client())),
		server.URL,
	)
	dialer := &reconcilerStreamDialer{}
	wsClient := websocket.NewPrivateClient(
		"wss://ws.gemini.com",
		auth.NewTimeBasedHMAC(auth.APIKey("key"), auth.APISecret("secret")),
		websocket.WithDialer(dialer),
	)
	t.Cleanup(func() { _ = wsClient.Close() })

	ctx, cancel := context.WithCancel(context.Background())
	t.Cleanup(cancel)
	reconciler := services.NewQuoteReconciler(tradingSvc, wsClient, "BTCUSD")
	started := make(chan struct {
		errCh <-chan error
		err   error
	}, 1)
	go func() {
		errCh, err := reconciler.StartStreaming(ctx)
		started <- struct {
			errCh <-chan error
			err   error
		}{errCh: errCh, err: err}
	}()

	select {
	case <-firstRequestStarted:
	case <-time.After(time.Second):
		t.Fatal("initial hydration did not start")
	}
	firstConn := dialer.latest()
	if firstConn == nil {
		t.Fatal("expected initial streaming connection")
	}
	if err := firstConn.Close(); err != nil {
		t.Fatalf("closing initial test connection failed: %v", err)
	}

	deadline := time.Now().Add(time.Second)
	for time.Now().Before(deadline) && dialer.latest() == firstConn {
		time.Sleep(time.Millisecond)
	}
	if dialer.latest() == firstConn {
		t.Fatal("reconnect did not establish a replacement connection")
	}

	select {
	case <-secondRequestStarted:
		t.Fatal("reconnect hydration overlapped initial hydration")
	case <-time.After(100 * time.Millisecond):
	}
	releaseOnce.Do(func() { close(releaseFirstRequest) })

	result := <-started
	if result.err != nil {
		t.Fatalf("StartStreaming failed: %v", result.err)
	}
	select {
	case <-secondRequestStarted:
	case <-time.After(time.Second):
		t.Fatal("reconnect hydration did not run after initial hydration completed")
	}
	if got := maxActiveRequests.Load(); got > 1 {
		t.Fatalf("hydration requests overlapped: max active requests %d", got)
	}
	cancel()
	select {
	case _, ok := <-result.errCh:
		if ok {
			t.Fatal("expected streaming error channel to close without an error")
		}
	case <-time.After(time.Second):
		t.Fatal("streaming goroutine did not stop after cancellation")
	}
}

func TestQuoteReconciler_StartStreamingBuffersEventsDuringHydration(t *testing.T) {
	hydrationStarted := make(chan struct{})
	releaseHydration := make(chan struct{})
	server := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v1/orders" {
			http.NotFound(w, r)
			return
		}
		close(hydrationStarted)
		<-releaseHydration
		_, _ = w.Write([]byte(`[]`))
	}))
	t.Cleanup(server.Close)

	tradingSvc := services.NewTradingService(
		transport.NewClient(transport.WithHTTPClient(server.Client())),
		server.URL,
	)
	dialer := &reconcilerStreamDialer{}
	wsClient := websocket.NewPrivateClient(
		"wss://ws.gemini.com",
		auth.NewTimeBasedHMAC(auth.APIKey("key"), auth.APISecret("secret")),
		websocket.WithDialer(dialer),
	)
	t.Cleanup(func() { _ = wsClient.Close() })

	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	reconciler := services.NewQuoteReconciler(tradingSvc, wsClient, "BTCUSD")
	resultCh := make(chan struct {
		errors <-chan error
		err    error
	}, 1)
	go func() {
		errors, err := reconciler.StartStreaming(ctx)
		resultCh <- struct {
			errors <-chan error
			err    error
		}{errors: errors, err: err}
	}()

	select {
	case <-hydrationStarted:
	case <-ctx.Done():
		t.Fatalf("hydration did not start: %v", ctx.Err())
	}

	conn := dialer.latest()
	if conn == nil {
		t.Fatal("expected streaming dialer to establish a connection before hydration")
	}
	conn.reads <- []byte(`{"e":"order","s":"BTCUSD","S":"BUY","p":"65000","q":"0.1","z":"0.1","X":"OPEN","i":987}`)
	close(releaseHydration)

	var result struct {
		errors <-chan error
		err    error
	}
	select {
	case result = <-resultCh:
	case <-ctx.Done():
		t.Fatalf("StartStreaming did not finish: %v", ctx.Err())
	}
	if result.err != nil {
		t.Fatalf("StartStreaming failed: %v", result.err)
	}

	deadline := time.Now().Add(time.Second)
	for time.Now().Before(deadline) {
		if orders := reconciler.ActiveOrders(); len(orders) == 1 && orders[0].OrderID == "987" {
			return
		}
		time.Sleep(time.Millisecond)
	}
	t.Fatal("streaming reconciler dropped the order event received during hydration")
}

func TestQuoteReconciler_StartStreamingDoesNotUnsubscribeOtherOrderSubscribers(t *testing.T) {
	server := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v1/orders" {
			http.NotFound(w, r)
			return
		}
		_, _ = w.Write([]byte(`[]`))
	}))
	t.Cleanup(server.Close)

	tradingSvc := services.NewTradingService(
		transport.NewClient(transport.WithHTTPClient(server.Client())),
		server.URL,
	)
	dialer := &reconcilerStreamDialer{}
	wsClient := websocket.NewPrivateClient(
		"wss://ws.gemini.com",
		auth.NewTimeBasedHMAC(auth.APIKey("key"), auth.APISecret("secret")),
		websocket.WithDialer(dialer),
	)
	t.Cleanup(func() { _ = wsClient.Close() })

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	otherSubscriber, err := wsClient.SubscribeOrderEvents(ctx)
	if err != nil {
		t.Fatalf("SubscribeOrderEvents failed: %v", err)
	}

	reconciler := services.NewQuoteReconciler(tradingSvc, wsClient, "BTCUSD")
	errCh, err := reconciler.StartStreaming(ctx)
	if err != nil {
		t.Fatalf("StartStreaming failed: %v", err)
	}
	cancel()
	select {
	case _, ok := <-errCh:
		if ok {
			t.Fatal("expected streaming error channel to close")
		}
	case <-time.After(time.Second):
		t.Fatal("streaming goroutine did not stop after cancellation")
	}

	select {
	case _, ok := <-otherSubscriber:
		if !ok {
			t.Fatal("reconciler cleanup closed an unrelated order event subscriber")
		}
	default:
	}
}

func TestQuoteReconciler_StartStreamingRejectsDuplicateStream(t *testing.T) {
	server := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v1/orders" {
			http.NotFound(w, r)
			return
		}
		_, _ = w.Write([]byte(`[]`))
	}))
	t.Cleanup(server.Close)

	tradingSvc := services.NewTradingService(
		transport.NewClient(transport.WithHTTPClient(server.Client())),
		server.URL,
	)
	dialer := &reconcilerStreamDialer{}
	wsClient := websocket.NewPrivateClient(
		"wss://ws.gemini.com",
		auth.NewTimeBasedHMAC(auth.APIKey("key"), auth.APISecret("secret")),
		websocket.WithDialer(dialer),
	)
	t.Cleanup(func() { _ = wsClient.Close() })

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	reconciler := services.NewQuoteReconciler(tradingSvc, wsClient, "BTCUSD")
	errCh, err := reconciler.StartStreaming(ctx)
	if err != nil {
		t.Fatalf("first StartStreaming failed: %v", err)
	}
	if _, err := reconciler.StartStreaming(ctx); !errors.Is(err, services.ErrStreamingAlreadyStarted) {
		t.Fatalf("expected ErrStreamingAlreadyStarted, got %v", err)
	}
	cancel()
	select {
	case _, ok := <-errCh:
		if ok {
			t.Fatal("expected streaming error channel to close")
		}
	case <-time.After(time.Second):
		t.Fatal("streaming goroutine did not stop after cancellation")
	}
}
