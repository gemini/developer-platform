package websocket

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"sync"
	"testing"
	"time"
)

func TestPublishEventCoalescesLatestStateInOrder(t *testing.T) {
	client := NewClient("wss://ws.gemini.com")

	for i := 0; i < cap(client.eventChan); i++ {
		client.publishEvent(ConnectionEvent{State: StateDisconnected})
	}
	client.eventMu.Lock()
	client.eventPumpRunning = true
	client.pendingEvent = &ConnectionEvent{State: StateConnecting}
	client.eventWg.Add(1)
	client.eventMu.Unlock()
	client.publishEvent(ConnectionEvent{State: StateConnected})
	go client.drainEvents()

	for i := 0; i < cap(client.eventChan); i++ {
		<-client.eventChan
	}
	select {
	case event := <-client.eventChan:
		if event.State != StateConnected {
			t.Fatalf("expected latest coalesced state Connected, got %v", event.State)
		}
	case <-time.After(time.Second):
		t.Fatal("timed out waiting for coalesced lifecycle event")
	}

	client.Close()
}

func TestFailedIsolatedPartialSubscriptionReleasesTrimmedSymbol(t *testing.T) {
	client := NewPublicClient("wss://ws.gemini.com")

	_, err := client.subscribeIsolatedPartialDepth(
		context.Background(),
		" BTCUSD ",
		PartialDepthSubscriptionOptions{Levels: PartialDepthLevel(25)},
	)
	if err == nil {
		t.Fatal("expected invalid partial-depth options to fail")
	}

	client.snapshotMu.Lock()
	_, clientRetained := client.partialSnapshotClients["BTCUSD"]
	_, refsRetained := client.partialSnapshotRefs["BTCUSD"]
	client.snapshotMu.Unlock()
	if clientRetained || refsRetained {
		t.Fatal("failed isolated subscription retained the normalized snapshot client")
	}
}

func TestNewClientWithErrorRejectsInvalidEndpoint(t *testing.T) {
	for _, endpoint := range []string{
		"https://ws.gemini.com",
		"ws://ws.gemini.com",
		"wss://user:password@ws.gemini.com",
		"wss://ws.gemini.com#fragment",
	} {
		if _, err := NewClientWithError(endpoint); !errors.Is(err, ErrInvalidURL) {
			t.Errorf("endpoint %q error = %v, want ErrInvalidURL", endpoint, err)
		}
	}

	client := NewClient("https://ws.gemini.com")
	defer client.Close()
	if err := client.Connect(context.Background()); !errors.Is(err, ErrInvalidURL) {
		t.Fatalf("expected Connect to preserve invalid URL error, got %v", err)
	}
}

func TestNewClientWithErrorRejectsInvalidSnapshot(t *testing.T) {
	_, err := NewClientWithError("wss://ws.gemini.com", WithSnapshot(-2))
	if !errors.Is(err, ErrInvalidSnapshot) {
		t.Fatalf("NewClientWithError() error = %v, want ErrInvalidSnapshot", err)
	}
}

type slowConsumerConn struct {
	closeOnce sync.Once
	closed    chan struct{}
	reads     chan []byte
}

func (c *slowConsumerConn) ReadMessage(ctx context.Context) (int, []byte, error) {
	select {
	case <-ctx.Done():
		return 0, nil, ctx.Err()
	case <-c.closed:
		return 0, nil, errors.New("slow consumer test connection closed")
	case payload := <-c.reads:
		return TextMessage, payload, nil
	}
}

func (c *slowConsumerConn) WriteMessage(ctx context.Context, _ int, payload []byte) error {
	var request RequestFrame
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
		return errors.New("slow consumer test connection closed")
	case c.reads <- ack:
		return nil
	}
}

func (c *slowConsumerConn) Close() error {
	c.closeOnce.Do(func() { close(c.closed) })
	return nil
}

type slowConsumerDialer struct {
	conn *slowConsumerConn
}

func (d *slowConsumerDialer) Dial(context.Context, string, http.Header) (Conn, *http.Response, error) {
	d.conn = &slowConsumerConn{
		closed: make(chan struct{}),
		reads:  make(chan []byte, 2048),
	}
	return d.conn, &http.Response{StatusCode: http.StatusSwitchingProtocols}, nil
}

func TestClient_SlowConsumerReportsExplicitError(t *testing.T) {
	dialer := &slowConsumerDialer{}
	client := NewClient(
		"wss://ws.gemini.com",
		WithDialer(dialer),
		WithAutoReconnect(false),
	)
	defer client.Close()

	depth, err := client.SubscribeDepth(context.Background(), "BTCUSD")
	if err != nil {
		t.Fatalf("SubscribeDepth failed: %v", err)
	}
	tables := client.subTables.Load()
	if tables == nil || len(tables.depthSubs["BTCUSD"]) != 1 {
		t.Fatal("expected one internal depth subscription")
	}
	depthIn := tables.depthSubs["BTCUSD"][0].ch
	for i := 0; i < cap(depthIn); i++ {
		depthIn <- &DepthUpdate{}
	}

	frame := []byte(`{"e":"depthUpdate","s":"BTCUSD","U":1,"u":1,"b":[],"a":[]}`)
	for i := 0; i < 1100; i++ {
		dialer.conn.reads <- frame
	}

	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	for {
		select {
		case event := <-client.Events():
			if errors.Is(event.Err, ErrSlowConsumer) {
				for i := 0; i < cap(depth); i++ {
					select {
					case _, ok := <-depth:
						if !ok {
							t.Fatalf("feed channel closed before draining its buffered values at index %d", i)
						}
					case <-ctx.Done():
						t.Fatalf("timed out draining feed channel: %v", ctx.Err())
					}
				}
				select {
				case _, ok := <-depth:
					if ok {
						t.Fatal("expected slow-consumer policy to close feed channels")
					}
				case <-ctx.Done():
					t.Fatalf("feed channel was not closed: %v", ctx.Err())
				}
				return
			}
		case <-ctx.Done():
			t.Fatalf("timed out waiting for ErrSlowConsumer: %v", ctx.Err())
		}
	}
}

type blockingSubscriptionConn struct {
	closed       chan struct{}
	closeOnce    sync.Once
	writeStarted chan struct{}
	releaseWrite chan struct{}
}

func (c *blockingSubscriptionConn) ReadMessage(ctx context.Context) (int, []byte, error) {
	select {
	case <-ctx.Done():
		return 0, nil, ctx.Err()
	case <-c.closed:
		return 0, nil, errors.New("blocking subscription connection closed")
	}
}

func (c *blockingSubscriptionConn) WriteMessage(ctx context.Context, _ int, _ []byte) error {
	select {
	case <-c.writeStarted:
	default:
		close(c.writeStarted)
	}
	select {
	case <-ctx.Done():
		return ctx.Err()
	case <-c.closed:
		return errors.New("blocking subscription connection closed")
	case <-c.releaseWrite:
		return nil
	}
}

func (c *blockingSubscriptionConn) Close() error {
	c.closeOnce.Do(func() { close(c.closed) })
	return nil
}

func TestSubscriptionCleanupDoesNotWaitForBlockedWireRequest(t *testing.T) {
	client := NewClient("wss://ws.gemini.com")
	conn := &blockingSubscriptionConn{
		closed:       make(chan struct{}),
		writeStarted: make(chan struct{}),
		releaseWrite: make(chan struct{}),
	}
	client.mu.Lock()
	client.conn = conn
	client.state.Store(int32(StateConnected))
	client.lifecycle.Store(1)
	client.mu.Unlock()

	subscribeDone := make(chan error, 1)
	go func() {
		_, err := client.SubscribeDepth(context.Background(), "BTCUSD")
		subscribeDone <- err
	}()
	select {
	case <-conn.writeStarted:
	case <-time.After(time.Second):
		t.Fatal("subscription request did not reach the blocked write")
	}

	client.mu.Lock()
	client.state.Store(int32(StateDisconnected))
	client.lifecycle.Store(2)
	client.mu.Unlock()
	cleanupDone := make(chan struct{})
	go func() {
		client.failSubscriptionsIfCurrent(2, errors.New("test connection failure"))
		close(cleanupDone)
	}()
	select {
	case <-cleanupDone:
	case <-time.After(time.Second):
		t.Fatal("subscription cleanup blocked behind a wire request")
	}

	close(conn.releaseWrite)
	if err := client.Close(); err != nil {
		t.Fatalf("client Close failed: %v", err)
	}
	select {
	case <-subscribeDone:
	case <-time.After(time.Second):
		t.Fatal("blocked subscription request did not finish after release")
	}
}

func TestScopedUnsubscribeDetachesFullSubscriber(t *testing.T) {
	client := NewClient("wss://ws.gemini.com")
	defer client.Close()

	sub := newSubscription[OrderEvent](1)
	sub.ch <- &OrderEvent{}
	client.subsMu.Lock()
	tables := client.subTables.Load().clone()
	tables.orderSubs = map[string][]*subscription[OrderEvent]{"orders@account": {sub}}
	client.subTables.Store(tables)
	client.subsMu.Unlock()

	dispatchDone := make(chan struct{})
	go func() {
		client.dispatchFrame(make(chan struct{}), []byte(`{"e":"orderUpdate","s":"BTCUSD","i":123,"X":"OPEN"}`), 0)
		close(dispatchDone)
	}()

	unsubscribeDone := make(chan error, 1)
	go func() {
		unsubscribeDone <- client.UnsubscribeOrderEventsChannel(context.Background(), sub.ch)
	}()
	select {
	case err := <-unsubscribeDone:
		if err != nil {
			t.Fatalf("scoped unsubscribe failed: %v", err)
		}
	case <-time.After(time.Second):
		t.Fatal("scoped unsubscribe blocked on a full subscriber")
	}
	select {
	case <-dispatchDone:
	case <-time.After(time.Second):
		t.Fatal("dispatch did not stop after the subscriber was detached")
	}
	select {
	case _, ok := <-sub.ch:
		if !ok {
			t.Fatal("expected the buffered value to remain available before closure")
		}
	case <-time.After(time.Second):
		t.Fatal("detached subscriber buffered value was lost")
	}
	select {
	case _, ok := <-sub.ch:
		if ok {
			t.Fatal("expected detached subscriber channel to be closed after draining")
		}
	case <-time.After(time.Second):
		t.Fatal("detached subscriber channel was not closed")
	}
}

func TestFailSubscriptionsDoesNotClearNewLifecycle(t *testing.T) {
	client := NewClient("wss://ws.gemini.com")
	defer client.Close()

	feed := newSubscription[DepthUpdate](1)
	client.subsMu.Lock()
	tables := client.subTables.Load().clone()
	tables.depthSubs["BTCUSD"] = []*subscription[DepthUpdate]{feed}
	client.subTables.Store(tables)
	client.activeFeeds["depth:BTCUSD@depth"] = RequestFrame{ID: 1, Method: "SUBSCRIBE", Params: []string{"btcusd@depth"}}
	client.subsMu.Unlock()

	client.lifecycle.Store(1)
	client.subsMu.Lock()
	cleanupDone := make(chan struct{})
	go func() {
		client.failSubscriptionsIfCurrent(1, errors.New("stale reconnect failed"))
		close(cleanupDone)
	}()
	client.lifecycle.Store(2)
	client.subsMu.Unlock()

	select {
	case <-cleanupDone:
	case <-time.After(time.Second):
		t.Fatal("timed out waiting for stale cleanup")
	}

	select {
	case _, ok := <-feed.ch:
		if !ok {
			t.Fatal("stale reconnect cleanup closed a subscription from a newer lifecycle")
		}
	default:
	}
	client.subsMu.Lock()
	defer client.subsMu.Unlock()
	if _, ok := client.activeFeeds["depth:BTCUSD@depth"]; !ok {
		t.Fatal("stale reconnect cleanup removed a subscription from a newer lifecycle")
	}
}

func TestResubscribeFailureBlocksNewConnectionUntilCleanup(t *testing.T) {
	oldConn := newReplayRaceConn()
	dialer := &replayRaceDialer{conn: oldConn}
	client := NewClient(
		"wss://ws.gemini.com",
		WithDialer(dialer),
		WithAutoReconnect(false),
	)
	t.Cleanup(func() { _ = client.Close() })

	client.mu.Lock()
	client.conn = oldConn
	client.state.Store(int32(StateConnected))
	client.lifecycle.Store(1)
	client.mu.Unlock()

	feed := newSubscription[DepthUpdate](1)
	client.subsMu.Lock()
	tables := client.subTables.Load().clone()
	tables.depthSubs["BTCUSD"] = []*subscription[DepthUpdate]{feed}
	client.subTables.Store(tables)
	client.activeFeeds["depth:BTCUSD@depth"] = RequestFrame{ID: 1, Method: "SUBSCRIBE", Params: []string{"btcusd@depth"}}

	// Hold subsMu while the failed connection acquires lifecycleGate and stages
	// cleanup. A new manual connection must not install and replay against a
	// table that the failure path is about to replace.
	failureDone := make(chan struct{})
	go func() {
		client.handleResubscribeFailure(1, errors.New("resubscribe failed"))
		close(failureDone)
	}()
	deadline := time.After(time.Second)
	for client.State() != StateDisconnected || client.lifecycle.Load() != 2 {
		select {
		case <-deadline:
			client.subsMu.Unlock()
			t.Fatal("resubscribe failure did not invalidate the old lifecycle")
		default:
			time.Sleep(time.Millisecond)
		}
	}

	newConn := newReplayRaceConn()
	dialer.conn = newConn
	connectDone := make(chan error, 1)
	go func() { connectDone <- client.Connect(context.Background()) }()

	select {
	case <-connectDone:
		client.subsMu.Unlock()
		t.Fatal("new connection completed before failed subscriptions were cleaned up")
	case <-time.After(50 * time.Millisecond):
	}
	client.subsMu.Unlock()

	select {
	case <-failureDone:
	case <-time.After(time.Second):
		t.Fatal("resubscribe cleanup did not complete")
	}

	select {
	case _, ok := <-feed.ch:
		if ok {
			t.Fatal("expected failed subscription channel to close")
		}
	case <-time.After(time.Second):
		t.Fatal("failed subscription channel was not closed")
	}

	select {
	case err := <-connectDone:
		if err != nil {
			t.Fatalf("new connection failed after cleanup: %v", err)
		}
	case <-time.After(time.Second):
		t.Fatal("new connection did not complete after cleanup")
	}
}

func TestRegisterPendingRejectsInvalidatedConnection(t *testing.T) {
	client := NewClient("wss://ws.gemini.com")
	t.Cleanup(func() { _ = client.Close() })

	client.mu.Lock()
	client.conn = newReplayRaceConn()
	client.state.Store(int32(StateConnected))
	client.lifecycle.Store(1)
	registered := make(chan error, 1)
	go func() {
		registered <- client.registerPending("1", make(chan requestResult, 1))
	}()

	// The failure transition and pending admission share c.mu. Once the
	// transition invalidates the connection, the request cannot be admitted
	// into a map that the read pump has already drained.
	client.state.Store(int32(StateDisconnected))
	client.lifecycle.Add(1)
	client.failPending(errors.New("connection dropped"))
	client.mu.Unlock()

	select {
	case err := <-registered:
		if err == nil {
			t.Fatal("expected pending registration to fail after invalidation")
		}
	case <-time.After(time.Second):
		t.Fatal("pending registration did not complete")
	}
	client.pendingMu.Lock()
	defer client.pendingMu.Unlock()
	if len(client.pending) != 0 {
		t.Fatalf("expected no pending requests after invalidation, got %d", len(client.pending))
	}
}

type replayRaceConn struct {
	closeOnce      sync.Once
	closed         chan struct{}
	readChan       chan []byte
	replayStarted  chan struct{}
	releaseReplay  chan struct{}
	mu             sync.Mutex
	methods        []string
	subscribeCount int
}

func newReplayRaceConn() *replayRaceConn {
	return &replayRaceConn{
		closed:        make(chan struct{}),
		readChan:      make(chan []byte, 16),
		replayStarted: make(chan struct{}),
		releaseReplay: make(chan struct{}),
	}
}

func (c *replayRaceConn) ReadMessage(ctx context.Context) (int, []byte, error) {
	select {
	case <-ctx.Done():
		return 0, nil, ctx.Err()
	case <-c.closed:
		return 0, nil, errors.New("replay race connection closed")
	case payload := <-c.readChan:
		return TextMessage, payload, nil
	}
}

func (c *replayRaceConn) WriteMessage(ctx context.Context, _ int, payload []byte) error {
	var request RequestFrame
	if err := json.Unmarshal(payload, &request); err != nil {
		return err
	}

	c.mu.Lock()
	c.methods = append(c.methods, request.Method)
	waitForReplay := false
	if request.Method == "SUBSCRIBE" {
		c.subscribeCount++
		if c.subscribeCount == 2 {
			close(c.replayStarted)
			waitForReplay = true
		}
	}
	c.mu.Unlock()

	if waitForReplay {
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-c.closed:
			return errors.New("replay race connection closed")
		case <-c.releaseReplay:
		}
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
		return errors.New("replay race connection closed")
	case c.readChan <- ack:
		return nil
	}
}

func (c *replayRaceConn) Close() error {
	c.closeOnce.Do(func() { close(c.closed) })
	return nil
}

type replayRaceDialer struct{ conn *replayRaceConn }

func (d replayRaceDialer) Dial(context.Context, string, http.Header) (Conn, *http.Response, error) {
	return d.conn, &http.Response{StatusCode: http.StatusSwitchingProtocols}, nil
}

func TestResubscribeSerializesWithUnsubscribe(t *testing.T) {
	conn := newReplayRaceConn()
	client := NewClient(
		"wss://ws.gemini.com",
		WithDialer(replayRaceDialer{conn: conn}),
		WithAutoReconnect(false),
	)
	defer client.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	depth, err := client.SubscribeDepth(ctx, "BTCUSD")
	if err != nil {
		t.Fatalf("SubscribeDepth failed: %v", err)
	}
	lifecycle := client.lifecycle.Load()

	resubscribeDone := make(chan error, 1)
	go func() { resubscribeDone <- client.resubscribeActiveFeeds(lifecycle) }()
	select {
	case <-conn.replayStarted:
	case <-time.After(time.Second):
		t.Fatal("timed out waiting for replay subscribe")
	}

	unsubscribed := make(chan error, 1)
	go func() { unsubscribed <- client.UnsubscribeDepth(ctx, "BTCUSD") }()
	select {
	case _, ok := <-depth:
		if !ok {
			t.Fatal("unsubscribe closed the feed before replay completed")
		}
	case <-time.After(100 * time.Millisecond):
	}

	close(conn.releaseReplay)
	if err := <-resubscribeDone; err != nil {
		t.Fatalf("resubscribe failed: %v", err)
	}
	if err := <-unsubscribed; err != nil {
		t.Fatalf("unsubscribe failed: %v", err)
	}

	conn.mu.Lock()
	methods := append([]string(nil), conn.methods...)
	conn.mu.Unlock()
	want := []string{"SUBSCRIBE", "SUBSCRIBE", "UNSUBSCRIBE"}
	if len(methods) != len(want) {
		t.Fatalf("expected methods %v, got %v", want, methods)
	}
	for i := range want {
		if methods[i] != want[i] {
			t.Fatalf("expected methods %v, got %v", want, methods)
		}
	}
}

func TestReplayDoesNotBlockConnectionFailureHandling(t *testing.T) {
	conn := newReplayRaceConn()
	client := NewClient(
		"wss://ws.gemini.com",
		WithDialer(replayRaceDialer{conn: conn}),
		WithAutoReconnect(false),
	)
	defer client.Close()

	client.subsMu.Lock()
	client.activeFeeds["depth:BTCUSD@depth"] = RequestFrame{ID: 1, Method: "SUBSCRIBE", Params: []string{"btcusd@depth"}}
	client.activeFeeds["depth:ETHUSD@depth"] = RequestFrame{ID: 2, Method: "SUBSCRIBE", Params: []string{"ethusd@depth"}}
	client.subsMu.Unlock()

	connectDone := make(chan error, 1)
	go func() { connectDone <- client.Connect(context.Background()) }()
	select {
	case <-conn.replayStarted:
	case <-time.After(time.Second):
		t.Fatal("timed out waiting for replay to block")
	}

	// The socket drops while replay is waiting for its second SUBSCRIBE ACK.
	// Failure handling must acquire lifecycleGate immediately rather than wait
	// for the replay timeout.
	if err := conn.Close(); err != nil {
		t.Fatalf("failed closing replay connection: %v", err)
	}
	select {
	case err := <-connectDone:
		if err == nil {
			t.Fatal("expected Connect to report the dropped socket")
		}
	case <-time.After(time.Second):
		t.Fatal("connection failure handling was blocked by feed replay")
	}
}

type selectiveReplayConn struct {
	closed       chan struct{}
	closeOnce    sync.Once
	reads        chan []byte
	firstBlocked chan string
	blockOnce    sync.Once
	release      chan struct{}
	mu           sync.Mutex
	requests     []RequestFrame
}

func newSelectiveReplayConn() *selectiveReplayConn {
	return &selectiveReplayConn{
		closed:       make(chan struct{}),
		reads:        make(chan []byte, 16),
		firstBlocked: make(chan string, 1),
		release:      make(chan struct{}),
	}
}

func (c *selectiveReplayConn) ReadMessage(ctx context.Context) (int, []byte, error) {
	select {
	case <-ctx.Done():
		return 0, nil, ctx.Err()
	case <-c.closed:
		return 0, nil, errors.New("selective replay connection closed")
	case payload := <-c.reads:
		return TextMessage, payload, nil
	}
}

func (c *selectiveReplayConn) WriteMessage(ctx context.Context, _ int, payload []byte) error {
	var request RequestFrame
	if err := json.Unmarshal(payload, &request); err != nil {
		return err
	}
	c.mu.Lock()
	c.requests = append(c.requests, request)
	c.mu.Unlock()

	ack, err := json.Marshal(map[string]any{
		"id":     request.ID,
		"status": http.StatusOK,
		"result": map[string]any{},
	})
	if err != nil {
		return err
	}

	if request.Method == "SUBSCRIBE" && len(request.Params) > 0 {
		var shouldBlock bool
		c.blockOnce.Do(func() {
			shouldBlock = true
			c.firstBlocked <- request.Params[0]
		})
		if shouldBlock {
			go func() {
				select {
				case <-c.closed:
				case <-c.release:
					select {
					case <-c.closed:
					case c.reads <- ack:
					}
				}
			}()
			return nil
		}
	}

	select {
	case <-ctx.Done():
		return ctx.Err()
	case <-c.closed:
		return errors.New("selective replay connection closed")
	case c.reads <- ack:
		return nil
	}
}

func (c *selectiveReplayConn) Close() error {
	c.closeOnce.Do(func() { close(c.closed) })
	return nil
}

type selectiveReplayDialer struct{ conn *selectiveReplayConn }

func (d selectiveReplayDialer) Dial(context.Context, string, http.Header) (Conn, *http.Response, error) {
	return d.conn, &http.Response{StatusCode: http.StatusSwitchingProtocols}, nil
}

func TestResubscribeSkipsFeedRemovedAfterSnapshot(t *testing.T) {
	conn := newSelectiveReplayConn()
	client := NewClient(
		"wss://ws.gemini.com",
		WithDialer(selectiveReplayDialer{conn: conn}),
		WithAutoReconnect(false),
	)
	defer client.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	if err := client.Connect(ctx); err != nil {
		t.Fatalf("Connect failed: %v", err)
	}

	client.subsMu.Lock()
	tables := client.subTables.Load().clone()
	tables.depthSubs["BTCUSD"] = []*subscription[DepthUpdate]{newSubscription[DepthUpdate](1)}
	tables.depthSubs["ETHUSD"] = []*subscription[DepthUpdate]{newSubscription[DepthUpdate](1)}
	client.subTables.Store(tables)
	client.activeFeeds["depth:BTCUSD@depth"] = RequestFrame{ID: 1, Method: "SUBSCRIBE", Params: []string{"btcusd@depth"}}
	client.activeFeeds["depth:ETHUSD@depth"] = RequestFrame{ID: 2, Method: "SUBSCRIBE", Params: []string{"ethusd@depth"}}
	client.subsMu.Unlock()

	lifecycle := client.lifecycle.Load()
	replayDone := make(chan error, 1)
	go func() { replayDone <- client.resubscribeActiveFeeds(lifecycle) }()

	var blockedStream string
	select {
	case blockedStream = <-conn.firstBlocked:
	case <-time.After(time.Second):
		t.Fatal("timed out waiting for the first replay request")
	}

	unsubSymbol := "ETHUSD"
	unsubStream := "ethusd@depth"
	if blockedStream == "ethusd@depth" {
		unsubSymbol = "BTCUSD"
		unsubStream = "btcusd@depth"
	}

	unsubDone := make(chan error, 1)
	go func() { unsubDone <- client.UnsubscribeDepth(ctx, unsubSymbol) }()
	removed := false
	deadline := time.Now().Add(time.Second)
	for time.Now().Before(deadline) {
		client.subsMu.Lock()
		_, stillActive := client.activeFeeds["depth:"+unsubSymbol+"@depth"]
		client.subsMu.Unlock()
		if !stillActive {
			removed = true
			break
		}
		time.Sleep(time.Millisecond)
	}
	if !removed {
		t.Fatal("unsubscribe of a later feed did not detach it while an earlier replay was blocked")
	}

	close(conn.release)
	if err := <-unsubDone; err != nil {
		t.Fatalf("UnsubscribeDepth failed: %v", err)
	}
	if err := <-replayDone; err != nil {
		t.Fatalf("replay failed: %v", err)
	}

	conn.mu.Lock()
	requests := append([]RequestFrame(nil), conn.requests...)
	conn.mu.Unlock()
	for _, request := range requests {
		if request.Method == "SUBSCRIBE" && len(request.Params) > 0 && request.Params[0] == unsubStream {
			t.Fatalf("replayed feed %q which was removed after the replay snapshot", unsubStream)
		}
	}
}

func TestConnectWaitsForFeedReplayBeforeAllowingNewSubscription(t *testing.T) {
	conn := newReplayRaceConn()
	client := NewClient(
		"wss://ws.gemini.com",
		WithDialer(replayRaceDialer{conn: conn}),
		WithAutoReconnect(false),
	)
	defer client.Close()
	connectionEvents, stopConnectionEvents := client.SubscribeConnectionEvents(8)
	defer stopConnectionEvents()

	client.subsMu.Lock()
	client.activeFeeds["depth:BTCUSD@depth"] = RequestFrame{ID: 1, Method: "SUBSCRIBE", Params: []string{"btcusd@depth"}}
	client.activeFeeds["depth:ETHUSD@depth"] = RequestFrame{ID: 2, Method: "SUBSCRIBE", Params: []string{"ethusd@depth"}}
	client.subsMu.Unlock()

	connectDone := make(chan error, 1)
	go func() { connectDone <- client.Connect(context.Background()) }()
	select {
	case <-conn.replayStarted:
	case <-time.After(time.Second):
		t.Fatal("timed out waiting for feed replay to reach its blocking request")
	}
	select {
	case event := <-connectionEvents:
		if event.State == StateConnected {
			t.Fatal("published StateConnected before feed replay completed")
		}
	case <-time.After(100 * time.Millisecond):
	}

	subscribeDone := make(chan error, 1)
	go func() {
		_, err := client.SubscribeBookTicker(context.Background(), "SOLUSD")
		subscribeDone <- err
	}()
	select {
	case err := <-subscribeDone:
		t.Fatalf("new subscription completed during feed replay: %v", err)
	case <-time.After(100 * time.Millisecond):
	}

	conn.mu.Lock()
	methodCount := len(conn.methods)
	conn.mu.Unlock()
	if methodCount != 2 {
		t.Fatalf("new subscription raced ahead of replay; saw %d wire methods", methodCount)
	}

	close(conn.releaseReplay)
	if err := <-connectDone; err != nil {
		t.Fatalf("Connect failed: %v", err)
	}
	connectedEvent := false
	deadline := time.After(time.Second)
	for !connectedEvent {
		select {
		case event := <-connectionEvents:
			connectedEvent = event.State == StateConnected
		case <-deadline:
			t.Fatal("did not publish StateConnected after feed replay completed")
		}
	}
	select {
	case err := <-subscribeDone:
		if err != nil {
			t.Fatalf("new subscription failed after replay: %v", err)
		}
	case <-time.After(time.Second):
		t.Fatal("new subscription did not proceed after replay")
	}
}
