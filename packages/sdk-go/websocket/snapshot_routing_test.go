package websocket_test

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/gemini/developer-platform/packages/sdk-go/websocket"
)

const symbolLessSnapshot = `{"lastUpdateId":1,"bids":[["100","1"]],"asks":[["101","1"]]}`

func waitForConnections(t *testing.T, dialer *mockDrainDialer, want int) {
	t.Helper()
	deadline := time.Now().Add(time.Second)
	for time.Now().Before(deadline) {
		if dialer.connCount() >= want {
			return
		}
		time.Sleep(time.Millisecond)
	}
	t.Fatalf("timed out waiting for %d WebSocket connections; got %d", want, dialer.connCount())
}

func waitForWrites(t *testing.T, conn *mockDrainConn, want int) {
	t.Helper()
	deadline := time.Now().Add(time.Second)
	for time.Now().Before(deadline) {
		conn.mu.Lock()
		got := len(conn.written)
		conn.mu.Unlock()
		if got >= want {
			return
		}
		time.Sleep(time.Millisecond)
	}
	t.Fatal("timed out waiting for replay subscription write")
}

func waitForConnectionError(t *testing.T, events <-chan websocket.ConnectionEvent, want error) {
	t.Helper()
	deadline := time.NewTimer(time.Second)
	defer deadline.Stop()
	for {
		select {
		case event, ok := <-events:
			if !ok {
				t.Fatal("connection event channel closed before expected error")
			}
			if errors.Is(event.Err, want) {
				return
			}
		case <-deadline.C:
			t.Fatalf("timed out waiting for connection error %v", want)
		}
	}
}

func TestSandboxSymbolLessSnapshotRoutesToDepthSubscription(t *testing.T) {
	dialer := &mockDrainDialer{}
	client := websocket.NewPublicClient(
		"wss://ws.sandbox.gemini.com",
		websocket.WithDialer(dialer),
		websocket.WithSnapshot(-1),
		websocket.WithIsolatedSnapshots(),
	)
	defer client.Close()

	depth, err := client.SubscribeDepth(context.Background(), "BTCUSD")
	if err != nil {
		t.Fatalf("SubscribeDepth failed: %v", err)
	}
	dialer.latestConn().feedServerMsg([]byte(symbolLessSnapshot))

	select {
	case update := <-depth:
		if update == nil || update.Symbol != "BTCUSD" || update.LastUpdateID != 1 || !update.Snapshot {
			t.Fatalf("unexpected symbol-less snapshot update: %+v", update)
		}
	case <-time.After(time.Second):
		t.Fatal("timed out waiting for symbol-less sandbox snapshot")
	}
}

func TestSandboxPartialSnapshotsAreIsolatedPerSymbol(t *testing.T) {
	dialer := &mockDrainDialer{}
	client := websocket.NewPublicClient(
		"wss://ws.sandbox.gemini.com",
		websocket.WithDialer(dialer),
		websocket.WithSnapshot(-1),
		websocket.WithIsolatedSnapshots(),
	)
	defer client.Close()

	ops := websocket.PartialDepthSubscriptionOptions{Levels: websocket.DepthLevel20}
	btc, err := client.SubscribePartialDepth(context.Background(), "BTCUSD", ops)
	if err != nil {
		t.Fatalf("BTC partial depth subscription failed: %v", err)
	}
	btcConn := dialer.latestConn()
	eth, err := client.SubscribePartialDepth(context.Background(), "ETHUSD", ops)
	if err != nil {
		t.Fatalf("ETH partial depth subscription failed: %v", err)
	}
	ethConn := dialer.latestConn()
	if btcConn == ethConn || dialer.connCount() != 2 {
		t.Fatalf("expected one isolated connection per symbol, got %d", dialer.connCount())
	}

	btcConn.feedServerMsg([]byte(`{"lastUpdateId":10,"bids":[["100","1"]],"asks":[]}`))
	ethConn.feedServerMsg([]byte(`{"lastUpdateId":20,"bids":[["200","2"]],"asks":[]}`))

	select {
	case snapshot := <-btc:
		if snapshot == nil || snapshot.Symbol != "BTCUSD" || snapshot.LastUpdateID != 10 {
			t.Fatalf("unexpected BTC snapshot: %+v", snapshot)
		}
	case <-time.After(time.Second):
		t.Fatal("timed out waiting for BTC snapshot")
	}
	select {
	case snapshot := <-eth:
		if snapshot == nil || snapshot.Symbol != "ETHUSD" || snapshot.LastUpdateID != 20 {
			t.Fatalf("unexpected ETH snapshot: %+v", snapshot)
		}
	case <-time.After(time.Second):
		t.Fatal("timed out waiting for ETH snapshot")
	}
}

func TestPartialSnapshotsAreIsolatedWithoutDifferentialSnapshotMode(t *testing.T) {
	dialer := &mockDrainDialer{}
	client := websocket.NewPublicClient(
		"wss://ws.gemini.com",
		websocket.WithDialer(dialer),
		websocket.WithIsolatedSnapshots(),
	)
	defer client.Close()

	options := websocket.PartialDepthSubscriptionOptions{Levels: websocket.DepthLevel10}
	btc, err := client.SubscribePartialDepth(context.Background(), "BTCUSD", options)
	if err != nil {
		t.Fatalf("BTC partial depth subscription failed: %v", err)
	}
	btcConn := dialer.latestConn()
	eth, err := client.SubscribePartialDepth(context.Background(), "ETHUSD", options)
	if err != nil {
		t.Fatalf("ETH partial depth subscription failed: %v", err)
	}
	ethConn := dialer.latestConn()
	if btcConn == ethConn || dialer.connCount() != 2 {
		t.Fatalf("expected isolated connections without snapshot query, got %d", dialer.connCount())
	}

	btcConn.feedServerMsg([]byte(`{"lastUpdateId":10,"bids":[],"asks":[]}`))
	ethConn.feedServerMsg([]byte(`{"lastUpdateId":20,"bids":[],"asks":[]}`))
	select {
	case snapshot := <-btc:
		if snapshot.Symbol != "BTCUSD" || snapshot.LastUpdateID != 10 {
			t.Fatalf("unexpected BTC snapshot: %+v", snapshot)
		}
	case <-time.After(time.Second):
		t.Fatal("timed out waiting for BTC snapshot")
	}
	select {
	case snapshot := <-eth:
		if snapshot.Symbol != "ETHUSD" || snapshot.LastUpdateID != 20 {
			t.Fatalf("unexpected ETH snapshot: %+v", snapshot)
		}
	case <-time.After(time.Second):
		t.Fatal("timed out waiting for ETH snapshot")
	}
}

func TestDifferentialDepthRemainsMultiplexedWithPartialIsolation(t *testing.T) {
	dialer := &mockDrainDialer{}
	client := websocket.NewPublicClient(
		"wss://ws.gemini.com",
		websocket.WithDialer(dialer),
		websocket.WithSnapshot(-1),
		websocket.WithIsolatedPartialSnapshots(),
	)
	defer client.Close()

	ctx := context.Background()
	btc, err := client.SubscribeDepth(ctx, "BTCUSD")
	if err != nil {
		t.Fatalf("BTC depth subscription failed: %v", err)
	}
	eth, err := client.SubscribeDepth(ctx, "ETHUSD")
	if err != nil {
		t.Fatalf("ETH depth subscription failed: %v", err)
	}
	if got := dialer.connCount(); got != 1 {
		t.Fatalf("expected differential depth to remain multiplexed, got %d connections", got)
	}

	conn := dialer.latestConn()
	conn.feedServerMsg([]byte(`{"e":"depthUpdate","s":"BTCUSD","U":1,"u":1,"b":[],"a":[]}`))
	conn.feedServerMsg([]byte(`{"e":"depthUpdate","s":"ETHUSD","U":1,"u":1,"b":[],"a":[]}`))
	select {
	case update := <-btc:
		if update.Symbol != "BTCUSD" || !update.Snapshot {
			t.Fatalf("unexpected BTC update: %+v", update)
		}
	case <-time.After(time.Second):
		t.Fatal("timed out waiting for BTC update")
	}
	select {
	case update := <-eth:
		if update.Symbol != "ETHUSD" || !update.Snapshot {
			t.Fatalf("unexpected ETH update: %+v", update)
		}
	case <-time.After(time.Second):
		t.Fatal("timed out waiting for ETH update")
	}
}

func TestSandboxSymbolLessSnapshotResynchronizesAfterReconnect(t *testing.T) {
	dialer := &mockDrainDialer{}
	client := websocket.NewPublicClient(
		"wss://ws.sandbox.gemini.com",
		websocket.WithDialer(dialer),
		websocket.WithSnapshot(-1),
		websocket.WithIsolatedSnapshots(),
	)
	defer client.Close()

	depth, err := client.SubscribeDepth(context.Background(), "BTCUSD")
	if err != nil {
		t.Fatalf("SubscribeDepth failed: %v", err)
	}
	first := dialer.latestConn()
	first.feedServerMsg([]byte(symbolLessSnapshot))
	select {
	case <-depth:
	case <-time.After(time.Second):
		t.Fatal("timed out waiting for initial snapshot")
	}

	if err := first.Close(); err != nil {
		t.Fatalf("closing test connection failed: %v", err)
	}
	waitForConnections(t, dialer, 2)
	second := dialer.latestConn()
	waitForWrites(t, second, 1)
	second.feedServerMsg([]byte(`{"lastUpdateId":42,"bids":[["420","2"]],"asks":[]}`))

	select {
	case update := <-depth:
		if update == nil || update.Symbol != "BTCUSD" || update.LastUpdateID != 42 || !update.Snapshot {
			t.Fatalf("unexpected resnapshot update: %+v", update)
		}
	case <-time.After(time.Second):
		t.Fatal("timed out waiting for reconnect snapshot")
	}
}

func TestAcceleratedDepthSnapshotResynchronizesAfterReconnect(t *testing.T) {
	dialer := &mockDrainDialer{}
	client := websocket.NewPublicClient(
		"wss://ws.gemini.com",
		websocket.WithDialer(dialer),
		websocket.WithSnapshot(-1),
	)
	defer client.Close()

	depth, err := client.SubscribeDepthWithOptions(context.Background(), "BTCUSD", websocket.DepthSubscriptionOptions{
		Interval: 100 * time.Millisecond,
	})
	if err != nil {
		t.Fatalf("SubscribeDepthWithOptions failed: %v", err)
	}
	first := dialer.latestConn()
	first.feedServerMsg([]byte(`{"e":"depthUpdate","s":"BTCUSD","U":1,"u":1,"b":[],"a":[]}`))
	select {
	case update := <-depth:
		if update == nil || !update.Snapshot {
			t.Fatalf("expected initial accelerated depth frame to be a snapshot: %+v", update)
		}
	case <-time.After(time.Second):
		t.Fatal("timed out waiting for initial accelerated depth snapshot")
	}

	if err := first.Close(); err != nil {
		t.Fatalf("closing test connection failed: %v", err)
	}
	waitForConnections(t, dialer, 2)
	second := dialer.latestConn()
	waitForWrites(t, second, 1)

	second.feedServerMsg([]byte(`{"e":"depthUpdate","s":"BTCUSD","U":10,"u":10,"b":[],"a":[]}`))
	select {
	case update := <-depth:
		if update == nil || !update.Snapshot || update.LastUpdateID != 10 {
			t.Fatalf("expected accelerated reconnect frame to be a snapshot: %+v", update)
		}
	case <-time.After(time.Second):
		t.Fatal("timed out waiting for accelerated reconnect snapshot")
	}
}

func TestSymbolSubscriptionsRejectEmptyAndNormalizeWhitespace(t *testing.T) {
	dialer := &mockDrainDialer{}
	client := websocket.NewPublicClient("wss://ws.gemini.com", websocket.WithDialer(dialer))
	defer client.Close()

	if _, err := client.SubscribeTrades(context.Background(), "  "); err == nil {
		t.Fatal("expected empty symbol subscription to fail before connecting")
	}
	trades, err := client.SubscribeTrades(context.Background(), " btcusd ")
	if err != nil {
		t.Fatalf("whitespace-padded symbol subscription failed: %v", err)
	}
	if err := client.UnsubscribeTrades(context.Background(), " BTCUSD "); err != nil {
		t.Fatalf("whitespace-padded unsubscribe failed: %v", err)
	}
	select {
	case _, ok := <-trades:
		if ok {
			t.Fatal("expected unsubscribed trade channel to be closed")
		}
	case <-time.After(time.Second):
		t.Fatal("trade channel did not close after unsubscribe")
	}
	if got := dialer.lastURL(); got == "" {
		t.Fatal("expected normalized symbol subscription to connect")
	}
}

func TestSharedClientRejectsAmbiguousAndMalformedSnapshots(t *testing.T) {
	t.Run("ambiguous", func(t *testing.T) {
		dialer := &mockDrainDialer{}
		client := websocket.NewPublicClient(
			"wss://ws.sandbox.gemini.com",
			websocket.WithDialer(dialer),
			websocket.WithSnapshot(-1),
		)
		defer client.Close()

		btc, err := client.SubscribeDepth(context.Background(), "BTCUSD")
		if err != nil {
			t.Fatalf("BTC subscription failed: %v", err)
		}
		eth, err := client.SubscribeDepth(context.Background(), "ETHUSD")
		if err != nil {
			t.Fatalf("ETH subscription failed: %v", err)
		}
		events, stop := client.SubscribeConnectionEvents(4)
		defer stop()
		dialer.latestConn().feedServerMsg([]byte(symbolLessSnapshot))
		waitForConnectionError(t, events, websocket.ErrAmbiguousSnapshot)

		select {
		case update := <-btc:
			t.Fatalf("ambiguous snapshot reached BTC: %+v", update)
		default:
		}
		select {
		case update := <-eth:
			t.Fatalf("ambiguous snapshot reached ETH: %+v", update)
		default:
		}
	})

	t.Run("malformed", func(t *testing.T) {
		dialer := &mockDrainDialer{}
		client := websocket.NewPublicClient(
			"wss://ws.sandbox.gemini.com",
			websocket.WithDialer(dialer),
			websocket.WithSnapshot(-1),
		)
		defer client.Close()

		depth, err := client.SubscribeDepth(context.Background(), "BTCUSD")
		if err != nil {
			t.Fatalf("subscription failed: %v", err)
		}
		events, stop := client.SubscribeConnectionEvents(4)
		defer stop()
		dialer.latestConn().feedServerMsg([]byte(`{"lastUpdateId":"bad","bids":[],"asks":[]}`))
		waitForConnectionError(t, events, websocket.ErrMalformedSnapshot)

		select {
		case update := <-depth:
			t.Fatalf("malformed snapshot reached depth feed: %+v", update)
		default:
		}
		dialer.latestConn().feedServerMsg([]byte(symbolLessSnapshot))
		select {
		case update := <-depth:
			if update == nil || update.Symbol != "BTCUSD" {
				t.Fatalf("unexpected recovery snapshot: %+v", update)
			}
		case <-time.After(time.Second):
			t.Fatal("pending snapshot was consumed by malformed frame")
		}
	})
}
