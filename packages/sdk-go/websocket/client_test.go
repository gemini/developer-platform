package websocket_test

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/gemini/developer-platform/packages/sdk-go/auth"
	"github.com/gemini/developer-platform/packages/sdk-go/websocket"
)

func TestClient_ServerDrainAndAutoReconnect(t *testing.T) {
	dialer := &mockDrainDialer{}
	client := websocket.NewClient(
		"wss://ws.gemini.com",
		websocket.WithDialer(dialer),
		websocket.WithAutoReconnect(true),
	)
	defer client.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	// 1. Subscribe to depth
	depthChan, err := client.SubscribeDepth(ctx, "BTCUSD")
	if err != nil {
		t.Fatalf("failed subscribing to depth: %v", err)
	}

	if client.State() != websocket.StateConnected {
		t.Fatalf("expected StateConnected, got %v", client.State())
	}

	// Send an initial depth update
	conn1 := dialer.latestConn()
	conn1.readChan <- []byte(`{"e":"depthUpdate","s":"BTCUSD","u":100,"U":95,"b":[["65000.00","1.0"]],"a":[["65001.00","2.0"]]}`)

	select {
	case update := <-depthChan:
		if update.LastUpdateID != 100 {
			t.Fatalf("expected update 100, got %d", update.LastUpdateID)
		}
	case <-time.After(1 * time.Second):
		t.Fatalf("timed out waiting for initial depth update")
	}

	// 2. Simulate server deploy drain by closing the underlying connection
	_ = conn1.Close()

	// Wait for automatic reconnect to establish new connection
	deadline := time.Now().Add(3 * time.Second)
	for time.Now().Before(deadline) {
		if dialer.connCount() >= 2 && client.State() == websocket.StateConnected {
			break
		}
		time.Sleep(20 * time.Millisecond)
	}

	if dialer.connCount() < 2 {
		t.Fatalf("expected client to dial a second connection upon server drain, total dials=%d", dialer.connCount())
	}

	if client.State() != websocket.StateConnected {
		t.Fatalf("expected client state to be StateConnected after reconnect, got %v", client.State())
	}

	// Verify that active subscriptions continue receiving on the original channel!
	conn2 := dialer.latestConn()
	conn2.readChan <- []byte(`{"e":"depthUpdate","s":"BTCUSD","u":105,"U":101,"b":[["65002.00","1.5"]],"a":[["65003.00","2.5"]]}`)

	select {
	case update := <-depthChan:
		if update.LastUpdateID != 105 {
			t.Fatalf("expected post-reconnect update 105, got %d", update.LastUpdateID)
		}
	case <-time.After(1 * time.Second):
		t.Fatalf("timed out waiting for post-reconnect update on existing channel")
	}
}

func TestClient_SnapshotModeMarksInitialDepthFrame(t *testing.T) {
	dialer := &mockDrainDialer{}
	client := websocket.NewPublicClient(
		"wss://ws.gemini.com/marketdata?foo=bar",
		websocket.WithDialer(dialer),
		websocket.WithSnapshot(-1),
	)
	defer client.Close()

	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()
	depth, err := client.SubscribeDepth(ctx, "BTCUSD")
	if err != nil {
		t.Fatalf("failed subscribing to depth: %v", err)
	}
	if got := dialer.lastURL(); got != "wss://ws.gemini.com/marketdata?foo=bar&snapshot=-1" {
		t.Fatalf("unexpected snapshot URL: %s", got)
	}

	dialer.latestConn().feedServerMsg([]byte(`{"e":"depthUpdate","s":"BTCUSD","U":100,"u":100,"b":[["65000","1"]],"a":[]}`))
	select {
	case update := <-depth:
		if !update.Snapshot {
			t.Fatal("expected first depth frame to be marked as a snapshot")
		}
	case <-time.After(time.Second):
		t.Fatal("timed out waiting for depth update")
	}
}

func TestClient_WebSocketAuthSharesRequestSequencer(t *testing.T) {
	dialer := &mockDrainDialer{}
	strategy := auth.NewHMAC("key", "secret")
	client := websocket.NewPrivateClient("wss://ws.gemini.com", strategy, websocket.WithDialer(dialer))
	defer client.Close()

	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()
	release, err := strategy.AcquireRequest(ctx)
	if err != nil {
		t.Fatalf("failed acquiring request gate: %v", err)
	}
	connected := make(chan error, 1)
	go func() { connected <- client.Connect(ctx) }()

	select {
	case err := <-connected:
		t.Fatalf("WebSocket connected while request gate was held: %v", err)
	case <-time.After(50 * time.Millisecond):
		if dialer.connCount() != 0 {
			t.Fatal("WebSocket dial started while request gate was held")
		}
	}
	release()
	if err := <-connected; err != nil {
		t.Fatalf("WebSocket failed after request gate release: %v", err)
	}
}

func TestClient_BearerAuthRefreshesOnReconnect(t *testing.T) {
	dialer := &mockDrainDialer{}
	currentToken := "oauth-token-1"
	strategy := auth.NewBearerWithSource(auth.TokenFunc(func(context.Context) (string, error) {
		return currentToken, nil
	}))
	client := websocket.NewPrivateClient("wss://ws.gemini.com", strategy,
		websocket.WithDialer(dialer),
		websocket.WithMaxReconnects(2),
	)
	defer client.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := client.Connect(ctx); err != nil {
		t.Fatalf("initial bearer WebSocket connection failed: %v", err)
	}
	if got := dialer.latestHeaders().Get("Authorization"); got != "Bearer oauth-token-1" {
		t.Fatalf("initial WebSocket Authorization = %q, want Bearer oauth-token-1", got)
	}

	currentToken = "oauth-token-2"
	if err := dialer.latestConn().Close(); err != nil {
		t.Fatalf("closing initial connection: %v", err)
	}

	deadline := time.Now().Add(3 * time.Second)
	for time.Now().Before(deadline) {
		if dialer.connCount() >= 2 && client.State() == websocket.StateConnected {
			break
		}
		time.Sleep(20 * time.Millisecond)
	}
	if dialer.connCount() < 2 {
		t.Fatalf("expected a reconnect, total dials=%d", dialer.connCount())
	}
	if got := dialer.latestHeaders().Get("Authorization"); got != "Bearer oauth-token-2" {
		t.Fatalf("reconnect WebSocket Authorization = %q, want Bearer oauth-token-2", got)
	}
}

func TestClient_BearerReconnectStopsWhenTokenRefreshFails(t *testing.T) {
	dialer := &mockDrainDialer{}
	refreshErr := errors.New("oauth token refresh failed")
	var sourceCalls atomic.Int32
	strategy := auth.NewBearerWithSource(auth.TokenFunc(func(context.Context) (string, error) {
		if sourceCalls.Add(1) > 1 {
			return "", refreshErr
		}
		return "oauth-token", nil
	}))
	client := websocket.NewPrivateClient(
		"wss://ws.gemini.com",
		strategy,
		websocket.WithDialer(dialer),
		websocket.WithMaxReconnects(1),
	)
	defer client.Close()
	events, stopEvents := client.SubscribeConnectionEvents(8)
	defer stopEvents()

	if err := client.Connect(context.Background()); err != nil {
		t.Fatalf("initial bearer WebSocket connection failed: %v", err)
	}
	if err := dialer.latestConn().Close(); err != nil {
		t.Fatalf("closing initial connection: %v", err)
	}

	deadline := time.Now().Add(3 * time.Second)
	for time.Now().Before(deadline) {
		if client.State() == websocket.StateDisconnected && sourceCalls.Load() >= 2 {
			break
		}
		time.Sleep(20 * time.Millisecond)
	}
	if got := sourceCalls.Load(); got < 2 {
		t.Fatalf("token source calls after reconnect failure = %d, want at least 2", got)
	}
	if got := dialer.connCount(); got != 1 {
		t.Fatalf("refresh failure opened %d replacement connections, want 0", got-1)
	}
	if got := client.State(); got != websocket.StateDisconnected {
		t.Fatalf("client state after failed token refresh = %v, want disconnected", got)
	}
	seenCause := false
	deadline = time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) {
		select {
		case event := <-events:
			if errors.Is(event.Err, refreshErr) {
				seenCause = true
			}
		case <-time.After(20 * time.Millisecond):
		}
		if seenCause {
			break
		}
	}
	if !seenCause {
		t.Fatal("reconnect event did not retain token refresh error")
	}
}

func TestPrivateClient_RejectsConnectionWithoutAuthentication(t *testing.T) {
	dialer := &mockDrainDialer{}
	client := websocket.NewPrivateClient("wss://ws.gemini.com", nil, websocket.WithDialer(dialer))
	defer client.Close()

	err := client.Connect(context.Background())
	if !errors.Is(err, websocket.ErrAuthenticationRequired) {
		t.Fatalf("expected ErrAuthenticationRequired, got %v", err)
	}
	if dialer.connCount() != 0 {
		t.Fatalf("expected no private connection attempt without authentication, got %d", dialer.connCount())
	}
}

func TestClient_MultiplexedFeeds(t *testing.T) {
	dialer := &mockDrainDialer{}
	client := websocket.NewClient(
		"wss://ws.gemini.com",
		websocket.WithDialer(dialer),
	)
	defer client.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	// 1. Subscribe to BTCUSD Depth and ETHUSD Trades concurrently
	depthBTC, err := client.SubscribeDepth(ctx, "BTCUSD")
	if err != nil {
		t.Fatalf("failed subscribing to BTC depth: %v", err)
	}

	tradesETH, err := client.SubscribeTrades(ctx, "ETHUSD")
	if err != nil {
		t.Fatalf("failed subscribing to ETH trades: %v", err)
	}

	tickerBTC, err := client.SubscribeBookTicker(ctx, "BTCUSD")
	if err != nil {
		t.Fatalf("failed subscribing to BTC ticker: %v", err)
	}

	conn := dialer.latestConn()

	// Feed in a BTC depth update
	conn.readChan <- []byte(`{"e":"depthUpdate","s":"BTCUSD","u":200,"U":190,"b":[["65000.00","1.0"]],"a":[["65001.00","2.0"]]}`)

	// Feed in an ETH trade
	conn.readChan <- []byte(`{"e":"trade","s":"ETHUSD","t":9999,"p":"3500.00","q":"2.5","b":123,"a":456,"T":1710000000000,"m":true}`)

	// Feed in a BTC book ticker
	conn.readChan <- []byte(`{"e":"bookTicker","s":"BTCUSD","b":"65000.50","B":"4.0","a":"65001.50","A":"5.0"}`)

	// Verify depth received on depthBTC
	select {
	case d := <-depthBTC:
		if d.Symbol != "BTCUSD" || d.LastUpdateID != 200 {
			t.Fatalf("unexpected depth data: %+v", d)
		}
	case <-time.After(1 * time.Second):
		t.Fatal("timed out waiting for BTC depth")
	}

	// Verify trade received on tradesETH
	select {
	case tr := <-tradesETH:
		if tr.Symbol != "ETHUSD" || tr.Price != "3500.00" || tr.Quantity != "2.5" {
			t.Fatalf("unexpected trade data: %+v", tr)
		}
	case <-time.After(1 * time.Second):
		t.Fatal("timed out waiting for ETH trade")
	}

	// Verify ticker received on tickerBTC
	select {
	case tk := <-tickerBTC:
		if tk.Symbol != "BTCUSD" || tk.BidPrice != "65000.50" {
			t.Fatalf("unexpected ticker data: %+v", tk)
		}
	case <-time.After(1 * time.Second):
		t.Fatal("timed out waiting for BTC ticker")
	}
}

func TestClient_Unsubscribe(t *testing.T) {
	dialer := &mockDrainDialer{}
	client := websocket.NewClient(
		"wss://ws.gemini.com",
		websocket.WithDialer(dialer),
	)
	defer client.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	depthBTC, err := client.SubscribeDepth(ctx, "BTCUSD")
	if err != nil {
		t.Fatalf("failed subscribing to depth: %v", err)
	}

	tradesETH, err := client.SubscribeTrades(ctx, "ETHUSD")
	if err != nil {
		t.Fatalf("failed subscribing to trades: %v", err)
	}

	tickerBTC, err := client.SubscribeBookTicker(ctx, "BTCUSD")
	if err != nil {
		t.Fatalf("failed subscribing to ticker: %v", err)
	}

	// 1. Unsubscribe depth
	if err := client.UnsubscribeDepth(ctx, "BTCUSD"); err != nil {
		t.Fatalf("failed unsubscribing depth: %v", err)
	}

	select {
	case _, ok := <-depthBTC:
		if ok {
			t.Fatal("expected depth channel to be closed after UnsubscribeDepth")
		}
	case <-time.After(1 * time.Second):
		t.Fatal("timed out waiting for depth channel close")
	}

	// 2. Unsubscribe trades
	if err := client.UnsubscribeTrades(ctx, "ETHUSD"); err != nil {
		t.Fatalf("failed unsubscribing trades: %v", err)
	}

	select {
	case _, ok := <-tradesETH:
		if ok {
			t.Fatal("expected trades channel to be closed after UnsubscribeTrades")
		}
	case <-time.After(1 * time.Second):
		t.Fatal("timed out waiting for trades channel close")
	}

	// 3. Unsubscribe ticker
	if err := client.UnsubscribeBookTicker(ctx, "BTCUSD"); err != nil {
		t.Fatalf("failed unsubscribing ticker: %v", err)
	}

	select {
	case _, ok := <-tickerBTC:
		if ok {
			t.Fatal("expected ticker channel to be closed after UnsubscribeBookTicker")
		}
	case <-time.After(1 * time.Second):
		t.Fatal("timed out waiting for ticker channel close")
	}

	// 4. Idempotent unsubscribe on already unsubscribed / non-existent stream
	if err := client.UnsubscribeDepth(ctx, "SOLUSD"); err != nil {
		t.Fatalf("expected nil error on unregistering non-existent stream, got: %v", err)
	}
}

func TestClient_UnsubscribeDepthRejectsVariantMismatch(t *testing.T) {
	dialer := &mockDrainDialer{}
	client := websocket.NewClient("wss://ws.gemini.com", websocket.WithDialer(dialer))
	defer client.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	depth, err := client.SubscribeDepthWithOptions(ctx, "BTCUSD", websocket.DepthSubscriptionOptions{Interval: 100 * time.Millisecond})
	if err != nil {
		t.Fatalf("failed subscribing to accelerated depth: %v", err)
	}
	if err := client.UnsubscribeDepth(ctx, "BTCUSD"); !errors.Is(err, websocket.ErrSubscriptionVariantMismatch) {
		t.Fatalf("expected variant mismatch, got %v", err)
	}
	select {
	case _, ok := <-depth:
		if !ok {
			t.Fatal("variant-mismatched unsubscribe closed the active channel")
		}
	default:
	}
	if err := client.UnsubscribeDepthWithOptions(ctx, "BTCUSD", websocket.DepthSubscriptionOptions{Interval: 100 * time.Millisecond}); err != nil {
		t.Fatalf("failed unsubscribing accelerated depth: %v", err)
	}
}

func TestClient_UnsubscribePartialDepthRejectsVariantMismatch(t *testing.T) {
	dialer := &mockDrainDialer{}
	client := websocket.NewClient("wss://ws.gemini.com", websocket.WithDialer(dialer))
	defer client.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	partial, err := client.SubscribePartialDepth(ctx, "BTCUSD", websocket.PartialDepthSubscriptionOptions{Levels: websocket.DepthLevel20, Interval: 100 * time.Millisecond})
	if err != nil {
		t.Fatalf("failed subscribing to accelerated partial depth: %v", err)
	}
	if err := client.UnsubscribePartialDepth(ctx, "BTCUSD", websocket.PartialDepthSubscriptionOptions{}); !errors.Is(err, websocket.ErrSubscriptionVariantMismatch) {
		t.Fatalf("expected partial-depth variant mismatch, got %v", err)
	}
	select {
	case _, ok := <-partial:
		if !ok {
			t.Fatal("variant-mismatched partial unsubscribe closed the active channel")
		}
	default:
	}
	if err := client.UnsubscribePartialDepth(ctx, "BTCUSD", websocket.PartialDepthSubscriptionOptions{Levels: websocket.DepthLevel20, Interval: 100 * time.Millisecond}); err != nil {
		t.Fatalf("failed unsubscribing accelerated partial depth: %v", err)
	}
}

func TestClient_IsolatedUnsubscribeDepthRejectsVariantMismatch(t *testing.T) {
	dialer := &mockDrainDialer{}
	client := websocket.NewClient(
		"wss://ws.gemini.com",
		websocket.WithDialer(dialer),
		websocket.WithSnapshot(-1),
		websocket.WithIsolatedSnapshots(),
	)
	defer client.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	depth, err := client.SubscribeDepthWithOptions(ctx, "BTCUSD", websocket.DepthSubscriptionOptions{Interval: 100 * time.Millisecond})
	if err != nil {
		t.Fatalf("failed subscribing to isolated accelerated depth: %v", err)
	}
	if err := client.UnsubscribeDepth(ctx, "BTCUSD"); !errors.Is(err, websocket.ErrSubscriptionVariantMismatch) {
		t.Fatalf("expected isolated variant mismatch, got %v", err)
	}
	select {
	case _, ok := <-depth:
		if !ok {
			t.Fatal("isolated variant-mismatched unsubscribe closed the active channel")
		}
	default:
	}
	if err := client.UnsubscribeDepthWithOptions(ctx, "BTCUSD", websocket.DepthSubscriptionOptions{Interval: 100 * time.Millisecond}); err != nil {
		t.Fatalf("failed unsubscribing isolated accelerated depth: %v", err)
	}
}

func TestClient_SlowConsumerReceivesEveryUpdate(t *testing.T) {
	dialer := &mockDrainDialer{}
	client := websocket.NewClient(
		"wss://ws.gemini.com",
		websocket.WithDialer(dialer),
	)
	defer client.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	// Subscribe to depth (internal buffer size is 256)
	depthCh, err := client.SubscribeDepth(ctx, "BTCUSD")
	if err != nil {
		t.Fatalf("failed subscribing to depth: %v", err)
	}

	conn := dialer.latestConn()

	// Push 300 updates without reading from depthCh (slow consumer simulation)
	done := make(chan struct{})
	go func() {
		for i := 1; i <= 300; i++ {
			msg := fmt.Sprintf(`{"e":"depthUpdate","s":"BTCUSD","u":%d,"U":%d,"b":[["65000.00","1.0"]]}`, i, i)
			conn.feedServerMsg([]byte(msg))
		}
		close(done)
	}()

	// The reader may apply backpressure, but it must not silently discard data.
	select {
	case <-done:
		// The mock connection has enough input buffering for this burst.
	case <-time.After(2 * time.Second):
		t.Fatal("input feed did not complete")
	}

	for i := 1; i <= 300; i++ {
		select {
		case update := <-depthCh:
			if update == nil || update.LastUpdateID != int64(i) {
				t.Fatalf("expected update %d, got %+v", i, update)
			}
		case <-time.After(2 * time.Second):
			t.Fatalf("timed out waiting for update %d", i)
		}
	}
}

func TestClient_EventsCloseAfterClientClose(t *testing.T) {
	dialer := &mockDrainDialer{}
	client := websocket.NewClient("wss://ws.gemini.com", websocket.WithDialer(dialer))
	if err := client.Connect(context.Background()); err != nil {
		t.Fatalf("Connect failed: %v", err)
	}
	if err := client.Close(); err != nil {
		t.Fatalf("Close failed: %v", err)
	}
	done := make(chan struct{})
	go func() {
		for range client.Events() {
		}
		close(done)
	}()
	select {
	case <-done:
	case <-time.After(time.Second):
		t.Fatal("timed out waiting for Events channel to close")
	}
}

func TestClient_RejectsReservedCustomAuthHeaders(t *testing.T) {
	dialer := &mockDrainDialer{}
	client := websocket.NewClient(
		"wss://ws.gemini.com",
		websocket.WithDialer(dialer),
		websocket.WithAuth(&mockAuthStrategy{key: "real-key", secret: "real-secret"}),
		websocket.WithHeaders(http.Header{"X-GEMINI-APIKEY": {"spoofed-key"}}),
	)
	defer client.Close()

	if err := client.Connect(context.Background()); err == nil {
		t.Fatal("expected reserved authentication header to be rejected")
	}
}

func TestClient_ConcurrentConnectAndEvents(t *testing.T) {
	dialer := &mockDrainDialer{}
	client := websocket.NewClient(
		"wss://ws.gemini.com",
		websocket.WithDialer(dialer),
		websocket.WithAutoReconnect(true),
	)
	defer client.Close()

	// 1. Consume Events channel concurrently (simulating an application listener)
	var eventsMu sync.Mutex
	var receivedEvents []websocket.ConnectionEvent
	eventCtx, eventCancel := context.WithCancel(context.Background())
	defer eventCancel()

	go func() {
		for {
			select {
			case <-eventCtx.Done():
				return
			case evt, ok := <-client.Events():
				if !ok {
					return
				}
				eventsMu.Lock()
				receivedEvents = append(receivedEvents, evt)
				eventsMu.Unlock()
			}
		}
	}()

	// 2. Launch 20 concurrent goroutines calling Connect(ctx)
	const numWaiters = 20
	var wg sync.WaitGroup
	errs := make([]error, numWaiters)

	for i := 0; i < numWaiters; i++ {
		wg.Add(1)
		go func(idx int) {
			defer wg.Done()
			ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
			defer cancel()
			errs[idx] = client.Connect(ctx)
		}(i)
	}

	wg.Wait()

	for i, err := range errs {
		if err != nil {
			t.Fatalf("waiter %d failed to connect: %v", i, err)
		}
	}

	if client.State() != websocket.StateConnected {
		t.Fatalf("expected StateConnected, got %v", client.State())
	}

	// 3. Trigger disconnect while concurrent goroutines attempt to subscribe or connect
	conn1 := dialer.latestConn()
	_ = conn1.Close()

	// Wait for client to notice the disconnect and enter reconnecting
	deadline := time.Now().Add(1 * time.Second)
	for time.Now().Before(deadline) {
		if client.State() == websocket.StateReconnecting {
			break
		}
		time.Sleep(5 * time.Millisecond)
	}

	// Launch concurrent subscribers while reconnection is occurring
	subErrs := make([]error, numWaiters)
	for i := 0; i < numWaiters; i++ {
		wg.Add(1)
		go func(idx int) {
			defer wg.Done()
			ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
			defer cancel()
			_, subErrs[idx] = client.SubscribeDepth(ctx, fmt.Sprintf("BTCUSD_%d", idx))
		}(i)
	}

	wg.Wait()

	for i, err := range subErrs {
		if err != nil {
			t.Fatalf("subscriber %d failed during reconnect: %v", i, err)
		}
	}

	// Verify events were delivered to the public event listener without being stolen
	eventsMu.Lock()
	defer eventsMu.Unlock()
	if len(receivedEvents) == 0 {
		t.Fatal("expected application listener to receive connection lifecycle events")
	}
}

func TestClient_PublicAndPrivateSeparation(t *testing.T) {
	dialer := &mockDrainDialer{}
	apiKey := "pub-priv-test-key"
	apiSecret := "pub-priv-test-secret"
	authStrategy := &mockAuthStrategy{key: apiKey, secret: apiSecret}

	publicClient := websocket.NewPublicClient("wss://ws.gemini.com", websocket.WithDialer(dialer))
	defer publicClient.Close()

	privateClient := websocket.NewPrivateClient("wss://ws.gemini.com", authStrategy, websocket.WithDialer(dialer))
	defer privateClient.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	// 1. Calling private feeds on Public (unauthenticated) client returns ErrAuthenticationRequired
	if _, err := publicClient.SubscribeOrderEvents(ctx); !errors.Is(err, websocket.ErrAuthenticationRequired) {
		t.Fatalf("expected ErrAuthenticationRequired on SubscribeOrderEvents, got %v", err)
	}
	if _, err := publicClient.SubscribeBalances(ctx); !errors.Is(err, websocket.ErrAuthenticationRequired) {
		t.Fatalf("expected ErrAuthenticationRequired on SubscribeBalances, got %v", err)
	}
	if _, err := publicClient.SubscribePositions(ctx); !errors.Is(err, websocket.ErrAuthenticationRequired) {
		t.Fatalf("expected ErrAuthenticationRequired on SubscribePositions, got %v", err)
	}
	if _, err := publicClient.SubscribeSettlements(ctx); !errors.Is(err, websocket.ErrAuthenticationRequired) {
		t.Fatalf("expected ErrAuthenticationRequired on SubscribeSettlements, got %v", err)
	}

	// 2. Public Client can subscribe to public feeds
	depthCh, err := publicClient.SubscribeDepth(ctx, "BTCUSD")
	if err != nil {
		t.Fatalf("failed subscribing to depth on public client: %v", err)
	}

	contractCh, err := publicClient.SubscribeContractStatus(ctx, "TRUMP-2028-YES")
	if err != nil {
		t.Fatalf("failed subscribing to contract status on public client: %v", err)
	}

	// 3. Private Client can subscribe to private feeds
	orderCh, err := privateClient.SubscribeOrderEvents(ctx)
	if err != nil {
		t.Fatalf("failed subscribing to order events on private client: %v", err)
	}

	balanceCh, err := privateClient.SubscribeBalances(ctx)
	if err != nil {
		t.Fatalf("failed subscribing to balance events on private client: %v", err)
	}

	posCh, err := privateClient.SubscribePositions(ctx)
	if err != nil {
		t.Fatalf("failed subscribing to position events on private client: %v", err)
	}

	settleCh, err := privateClient.SubscribeSettlements(ctx)
	if err != nil {
		t.Fatalf("failed subscribing to settlement events on private client: %v", err)
	}

	// 4. Verify independent dispatching
	pubConn := dialer.connections[0]
	privConn := dialer.connections[1]

	// Send contract status to public socket
	pubConn.readChan <- []byte(`{"e":"contractStatus","E":1776871540195,"s":"TRUMP-2028-YES","k":"TRUMP-2028","c":"YES","i":1001,"p":"0.50","o":"Awaiting Approval","n":"Active"}`)
	// Send balance update to private socket
	privConn.readChan <- []byte(`{"e":"balanceUpdate","E":1710000000000,"u":101,"B":[{"a":"USD","f":"45000.00","c":"50000.00"}]}`)

	select {
	case evt := <-contractCh:
		if evt.Symbol != "TRUMP-2028-YES" || evt.NewStatus != "Active" || evt.PreviousStatus != "Awaiting Approval" || evt.StrikePrice != "0.50" {
			t.Fatalf("unexpected contract event: %+v", evt)
		}
	case <-time.After(1 * time.Second):
		t.Fatal("timed out waiting for contract event on public client")
	}

	select {
	case bal := <-balanceCh:
		if len(bal.Balances) != 1 || bal.Balances[0].Asset != "USD" {
			t.Fatalf("unexpected balance event: %+v", bal)
		}
	case <-time.After(1 * time.Second):
		t.Fatal("timed out waiting for balance event on private client")
	}

	// An order update may also contain a top-level trade ID. It must remain an
	// order event rather than being claimed by the public trade heuristic.
	privConn.feedServerMsg([]byte(`{"e":"orderUpdate","E":1710000000000,"s":"BTCUSD","t":777,"i":12345,"S":"BUY","X":"NEW","p":"65000.00","q":"0.1","z":"0.1"}`))
	select {
	case order := <-orderCh:
		if order.EventType != "orderUpdate" || order.TradeID != 777 || order.OrderID != 12345 {
			t.Fatalf("unexpected order event: %+v", order)
		}
	case <-time.After(1 * time.Second):
		t.Fatal("timed out waiting for order event on private client")
	}

	// Send position report to private socket
	privConn.readChan <- []byte(`{"e":"positionReport","E":1710000000000,"u":102,"A":12345,"P":[{"t":"ec","s":"BTC-GUSD-PERP","a":[{"t":"position","v":"2.5"}]}]}`)
	// Send settlements update to private socket
	privConn.readChan <- []byte(`{"type":"settlements","settlements":[{"symbol":"TRUMP-2028-YES","position":"100","payout":"1000.00","outcome":"won"}]}`)
	select {
	case pos := <-posCh:
		if len(pos.Positions) != 1 || pos.Positions[0].Symbol != "BTC-GUSD-PERP" {
			t.Fatalf("unexpected position event: %+v", pos)
		}
	case <-time.After(1 * time.Second):
		t.Fatal("timed out waiting for position event on private client")
	}

	select {
	case set := <-settleCh:
		if len(set.Settlements) != 1 || set.Settlements[0].Symbol != "TRUMP-2028-YES" {
			t.Fatalf("unexpected settlement event: %+v", set)
		}
	case <-time.After(1 * time.Second):
		t.Fatal("timed out waiting for settlement event on private client")
	}

	// 5. Verify unsubscriptions
	if err := publicClient.UnsubscribeContractStatus(ctx, "TRUMP-2028-YES"); err != nil {
		t.Fatalf("failed unsubscribing contract status: %v", err)
	}
	if err := privateClient.UnsubscribeBalances(ctx); err != nil {
		t.Fatalf("failed unsubscribing balances: %v", err)
	}
	if err := privateClient.UnsubscribePositions(ctx); err != nil {
		t.Fatalf("failed unsubscribing positions: %v", err)
	}
	if err := privateClient.UnsubscribeSettlements(ctx); err != nil {
		t.Fatalf("failed unsubscribing settlements: %v", err)
	}

	_ = depthCh
	_ = orderCh
}

func TestClient_GenericPrivateMethodsRequireAuthentication(t *testing.T) {
	dialer := &mockDrainDialer{}
	client := websocket.NewPublicClient("wss://ws.gemini.com", websocket.WithDialer(dialer))
	defer client.Close()

	tests := []struct {
		method string
		params any
	}{
		{method: "order.place"},
		{method: "order.cancel"},
		{method: "order.cancel_all"},
		{method: "rfq.submit_quote"},
		{method: "rfq.confirm_quote"},
		{method: "SUBSCRIBE", params: []string{"orders@account"}},
		{method: "UNSUBSCRIBE", params: []string{"balances@account@1s"}},
	}
	for _, test := range tests {
		t.Run(test.method, func(t *testing.T) {
			if _, err := client.Request(context.Background(), test.method, test.params); !errors.Is(err, websocket.ErrAuthenticationRequired) {
				t.Fatalf("Request(%q) error = %v, want ErrAuthenticationRequired", test.method, err)
			}
		})
	}
	if got := dialer.connCount(); got != 0 {
		t.Fatalf("unauthenticated private methods opened %d WebSocket connections", got)
	}
}

func TestClient_IndependentPublicPrivateLifecycles(t *testing.T) {
	dialer := &mockDrainDialer{}
	apiKey := "lifecycle-key"
	apiSecret := "lifecycle-secret"
	authStrategy := &mockAuthStrategy{key: apiKey, secret: apiSecret}

	publicClient := websocket.NewPublicClient("wss://ws.gemini.com", websocket.WithDialer(dialer))
	privateClient := websocket.NewPrivateClient("wss://ws.gemini.com", authStrategy, websocket.WithDialer(dialer))

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if err := publicClient.Connect(ctx); err != nil {
		t.Fatalf("failed connecting public client: %v", err)
	}
	if err := privateClient.Connect(ctx); err != nil {
		t.Fatalf("failed connecting private client: %v", err)
	}

	if publicClient.State() != websocket.StateConnected || privateClient.State() != websocket.StateConnected {
		t.Fatal("expected both clients to be connected")
	}

	// Closing public client must NOT affect private client
	if err := publicClient.Close(); err != nil {
		t.Fatalf("failed closing public client: %v", err)
	}

	if publicClient.State() != websocket.StateClosed {
		t.Fatalf("expected public client to be closed, got %v", publicClient.State())
	}
	if privateClient.State() != websocket.StateConnected {
		t.Fatalf("expected private client to remain connected, got %v", privateClient.State())
	}

	// Closing private client finishes cleanly
	if err := privateClient.Close(); err != nil {
		t.Fatalf("failed closing private client: %v", err)
	}
	if privateClient.State() != websocket.StateClosed {
		t.Fatalf("expected private client to be closed, got %v", privateClient.State())
	}
}

func TestClient_SubscribeFailedSendRollback(t *testing.T) {
	dialer := &mockDrainDialer{}
	client := websocket.NewClient("wss://ws.gemini.com", websocket.WithDialer(dialer))
	if err := client.Connect(context.Background()); err != nil {
		t.Fatalf("Connect failed: %v", err)
	}
	defer client.Close()

	conn := dialer.latestConn()
	// Simulate wire write failure
	conn.writeErr = errors.New("network write failure")

	ch, err := client.SubscribeDepth(context.Background(), "BTCUSD")
	if err == nil {
		t.Fatal("expected SubscribeDepth to fail due to wire write error")
	}
	if ch != nil {
		t.Fatal("expected nil channel returned on error")
	}

	// Now fix write error and test reconnect - failed feed must NOT resurrect!
	conn.writeErr = nil
	_ = conn.Close() // trigger reconnect by closing readChan
	time.Sleep(100 * time.Millisecond)

	newConn := dialer.latestConn()
	if newConn != nil && newConn != conn {
		newConn.mu.Lock()
		written := len(newConn.written)
		newConn.mu.Unlock()
		if written > 0 {
			t.Fatalf("expected 0 resubscribed feeds on reconnect after failed subscribe, got %d", written)
		}
	}
}

func TestClient_ReconnectResubscribeFailureClosesSubscriptions(t *testing.T) {
	dialer := &mockDrainDialer{responseStatuses: []int{http.StatusOK, http.StatusBadRequest}}
	client := websocket.NewClient(
		"wss://ws.gemini.com",
		websocket.WithDialer(dialer),
		websocket.WithAutoReconnect(true),
		websocket.WithMaxReconnects(1),
	)
	defer client.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	depth, err := client.SubscribeDepth(ctx, "BTCUSD")
	if err != nil {
		t.Fatalf("SubscribeDepth failed: %v", err)
	}

	conn := dialer.latestConn()
	if conn == nil {
		t.Fatal("expected initial connection")
	}
	_ = conn.Close()

	var sawResubscribeError bool
	var channelClosed bool
	for !sawResubscribeError || !channelClosed {
		select {
		case _, ok := <-depth:
			if !ok {
				channelClosed = true
			}
		case event, ok := <-client.Events():
			if !ok {
				t.Fatal("client closed events before reporting resubscribe failure")
			}
			if errors.Is(event.Err, websocket.ErrResubscribeFailed) {
				sawResubscribeError = true
			}
		case <-ctx.Done():
			t.Fatalf("timed out waiting for explicit resubscribe failure: %v", ctx.Err())
		}
	}
}

func TestClient_GlobalContractStatusSharedWire(t *testing.T) {
	dialer := &mockDrainDialer{}
	client := websocket.NewClient("wss://ws.gemini.com", websocket.WithDialer(dialer))
	if err := client.Connect(context.Background()); err != nil {
		t.Fatalf("Connect failed: %v", err)
	}
	defer client.Close()

	conn := dialer.latestConn()

	// 1. Subscribe to symbol A
	chA, err := client.SubscribeContractStatus(context.Background(), "TRUMP-2028-YES")
	if err != nil {
		t.Fatalf("SubscribeContractStatus(A) failed: %v", err)
	}

	// Wire subscribe count should be 1
	conn.mu.Lock()
	if len(conn.written) != 1 {
		t.Fatalf("expected 1 wire message sent, got %d", len(conn.written))
	}
	conn.mu.Unlock()

	// 2. Subscribe to symbol B
	chB, err := client.SubscribeContractStatus(context.Background(), "HARRIS-2028-YES")
	if err != nil {
		t.Fatalf("SubscribeContractStatus(B) failed: %v", err)
	}

	// Wire subscribe count should STILL be 1 (shared single wire feed)
	conn.mu.Lock()
	if len(conn.written) != 1 {
		t.Fatalf("expected wire subscription not duplicated, got %d written messages", len(conn.written))
	}
	conn.mu.Unlock()

	// 3. Unsubscribe symbol A
	if err := client.UnsubscribeContractStatus(context.Background(), "TRUMP-2028-YES"); err != nil {
		t.Fatalf("UnsubscribeContractStatus(A) failed: %v", err)
	}

	// Wire stream should NOT be unsubscribed because symbol B is still active!
	conn.mu.Lock()
	if len(conn.written) != 1 {
		t.Fatalf("expected wire stream not unsubscribed while symbol B active, got %d written messages", len(conn.written))
	}
	conn.mu.Unlock()

	// Verify symbol A channel was closed
	_, ok := <-chA
	if ok {
		t.Fatal("expected channel A to be closed on unsubscribe")
	}

	// 4. Send contract status for symbol B - chB receives it!
	conn.readChan <- []byte(`{"e":"contractStatus","E":1776871540195,"s":"HARRIS-2028-YES","k":"HARRIS-2028","c":"YES","i":1002,"p":"0.45","o":"Awaiting Approval","n":"Active"}`)
	select {
	case evt := <-chB:
		if evt.Symbol != "HARRIS-2028-YES" || evt.NewStatus != "Active" {
			t.Fatalf("unexpected event on chB: %+v", evt)
		}
	case <-time.After(1 * time.Second):
		t.Fatal("timed out waiting for event on chB")
	}

	// 5. Unsubscribe symbol B (last remaining)
	if err := client.UnsubscribeContractStatus(context.Background(), "HARRIS-2028-YES"); err != nil {
		t.Fatalf("UnsubscribeContractStatus(B) failed: %v", err)
	}

	// Now wire unsubscribe SHOULD be sent!
	conn.mu.Lock()
	if len(conn.written) != 2 {
		t.Fatalf("expected 2 wire messages (subscribe + unsubscribe), got %d", len(conn.written))
	}
	conn.mu.Unlock()
}

func TestClient_DeduplicatesPublicWireSubscriptions(t *testing.T) {
	dialer := &mockDrainDialer{}
	client := websocket.NewClient("wss://ws.gemini.com", websocket.WithDialer(dialer))
	defer client.Close()

	ctx := context.Background()
	first, err := client.SubscribeDepth(ctx, "BTCUSD")
	if err != nil {
		t.Fatalf("first depth subscription failed: %v", err)
	}
	second, err := client.SubscribeDepth(ctx, "BTCUSD")
	if err != nil {
		t.Fatalf("second depth subscription failed: %v", err)
	}

	conn := dialer.latestConn()
	conn.mu.Lock()
	writes := len(conn.written)
	conn.mu.Unlock()
	if writes != 1 {
		t.Fatalf("expected one wire SUBSCRIBE for two local subscribers, got %d", writes)
	}

	conn.feedServerMsg([]byte(`{"e":"depthUpdate","s":"BTCUSD","U":10,"u":10,"b":[],"a":[]}`))
	for name, ch := range map[string]<-chan *websocket.DepthUpdate{"first": first, "second": second} {
		select {
		case <-ch:
		case <-time.After(time.Second):
			t.Fatalf("timed out delivering depth update to %s subscriber", name)
		}
	}
}

func TestClient_ConcurrentUnsubscribeAndDispatch(t *testing.T) {
	dialer := &mockDrainDialer{}
	client := websocket.NewClient("wss://ws.gemini.com", websocket.WithDialer(dialer))

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := client.Connect(ctx); err != nil {
		t.Fatalf("Connect failed: %v", err)
	}
	conn := dialer.latestConn()

	stopFeed := make(chan struct{})
	feedStarted := make(chan struct{})
	var feedWg sync.WaitGroup
	feedWg.Add(1)
	go func() {
		defer feedWg.Done()
		close(feedStarted)
		for i := 0; i < 1000; i++ {
			select {
			case <-stopFeed:
				return
			default:
				conn.feedServerMsg([]byte(`{"e":"depthUpdate","s":"BTCUSD","U":10,"u":10,"b":[],"a":[]}`))
			}
		}
	}()
	<-feedStarted
	defer func() {
		close(stopFeed)
		feedWg.Wait()
		_ = client.Close()
	}()

	for i := 0; i < 100; i++ {
		if _, err := client.SubscribeDepth(ctx, "BTCUSD"); err != nil {
			t.Fatalf("subscribe %d failed: %v", i, err)
		}
		if err := client.UnsubscribeDepth(ctx, "BTCUSD"); err != nil {
			t.Fatalf("unsubscribe %d failed: %v", i, err)
		}
	}
}

func TestClient_ConcurrentSendSafety(t *testing.T) {
	dialer := &mockDrainDialer{}
	client := websocket.NewClient("wss://ws.gemini.com", websocket.WithDialer(dialer))
	if err := client.Connect(context.Background()); err != nil {
		t.Fatalf("Connect failed: %v", err)
	}
	defer client.Close()

	const goroutines = 20
	var wg sync.WaitGroup
	wg.Add(goroutines)

	for i := 0; i < goroutines; i++ {
		go func(id int) {
			defer wg.Done()
			_ = client.Send(context.Background(), map[string]any{"id": id, "type": "ping"})
		}(i)
	}

	wg.Wait()
}

type mockAuthStrategy struct {
	key    string
	secret string
}

func (m *mockAuthStrategy) Authenticate(ctx context.Context, req *http.Request, payloadJSON []byte) error {
	req.Header.Set("X-GEMINI-APIKEY", m.key)
	return nil
}

func (m *mockAuthStrategy) Key() string {
	return m.key
}

func BenchmarkClient_DispatchDepth(b *testing.B) {
	dialer := &mockDrainDialer{}
	client := websocket.NewClient("wss://ws.gemini.com", websocket.WithDialer(dialer))
	_ = client.Connect(context.Background())
	defer client.Close()

	ch, _ := client.SubscribeDepth(context.Background(), "BTCUSD")

	// Drain goroutine
	go func() {
		for range ch {
		}
	}()

	conn := dialer.latestConn()
	payload := []byte(`{"e":"depthUpdate","s":"BTCUSD","u":200,"U":190,"b":[["65000.00","1.0"]],"a":[["65001.00","2.0"]]}`)

	b.ResetTimer()
	b.ReportAllocs()

	for i := 0; i < b.N; i++ {
		conn.readChan <- payload
	}
}

func BenchmarkClient_DispatchBookTicker(b *testing.B) {
	dialer := &mockDrainDialer{}
	client := websocket.NewClient("wss://ws.gemini.com", websocket.WithDialer(dialer))
	_ = client.Connect(context.Background())
	defer client.Close()

	ch, _ := client.SubscribeBookTicker(context.Background(), "BTCUSD")

	// Drain goroutine
	go func() {
		for range ch {
		}
	}()

	conn := dialer.latestConn()
	payload := []byte(`{"u":1786980683898700239,"s":"BTCUSD","b":"63956.75","B":"0.05","a":"63956.76","A":"0.25","c":"63956.76","C":"0.1"}`)

	b.ResetTimer()
	b.ReportAllocs()

	for i := 0; i < b.N; i++ {
		conn.readChan <- payload
	}
}
