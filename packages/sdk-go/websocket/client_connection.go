package websocket

import (
	"context"
	"crypto/rand"
	"errors"
	"fmt"
	"log/slog"
	"math/big"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/gemini/gemini-go/auth"
	"github.com/gemini/gemini-go/transport"
)

func (c *Client) acquireLifecycle(ctx context.Context) error {
	if ctx == nil {
		ctx = context.Background()
	}
	select {
	case <-ctx.Done():
		return ctx.Err()
	case <-c.doneChan:
		return fmt.Errorf("%w: websocket client is closed", transport.ErrConnectionClosed)
	case <-c.lifecycleGate:
		return nil
	}
}

func (c *Client) releaseLifecycle() {
	c.lifecycleGate <- struct{}{}
}

func (c *Client) startConnectAttemptLocked() uint64 {
	lifecycle := c.lifecycle.Add(1)
	if c.connectDone == nil {
		c.connectDone = make(chan struct{})
	} else {
		select {
		case <-c.connectDone:
			c.connectDone = make(chan struct{})
		default:
		}
	}
	c.connectErr = nil
	return lifecycle
}

func (c *Client) broadcastConnectLocked(err error) {
	c.connectErr = err
	if c.connectDone != nil {
		select {
		case <-c.connectDone:
		default:
			close(c.connectDone)
		}
	}
}

func (c *Client) getUpgradeHeadersForURL(ctx context.Context, wsURL string) (http.Header, error) {
	headers := c.headers.Clone()
	if headers == nil {
		headers = make(http.Header)
	}
	for key := range headers {
		if isReservedAuthHeader(key) {
			return nil, fmt.Errorf("gemini websocket: custom header %q conflicts with authentication", key)
		}
	}
	if c.auth != nil {
		req, err := http.NewRequestWithContext(ctx, http.MethodGet, wsURL, nil)
		if err != nil {
			return nil, fmt.Errorf("gemini websocket: failed creating upgrade request: %w", err)
		}
		if wsAuth, ok := c.auth.(interface {
			AuthenticateWebSocket(ctx context.Context, req *http.Request) error
		}); ok {
			if err := wsAuth.AuthenticateWebSocket(ctx, req); err != nil {
				return nil, fmt.Errorf("gemini websocket: upgrade auth failed: %w", err)
			}
		} else {
			if err := c.auth.Authenticate(ctx, req, nil); err != nil {
				return nil, fmt.Errorf("gemini websocket: upgrade auth failed: %w", err)
			}
		}
		for k, vv := range req.Header {
			for _, v := range vv {
				headers.Set(k, v)
			}
		}
	}
	return headers, nil
}

func (c *Client) dial(ctx context.Context, dialer Dialer, wsURL string) (Conn, *http.Response, error) {
	if sequencer, ok := c.auth.(auth.RequestSequencer); ok {
		release, err := sequencer.AcquireRequest(ctx)
		if err != nil {
			return nil, nil, err
		}
		defer release()
	}

	headers, err := c.getUpgradeHeadersForURL(ctx, wsURL)
	if err != nil {
		return nil, nil, err
	}
	conn, resp, err := dialer.Dial(ctx, wsURL, headers)
	if err == nil && conn == nil {
		return nil, resp, errors.New("gemini websocket: dialer returned a nil connection")
	}
	return conn, resp, err
}

func isReservedAuthHeader(key string) bool {
	switch strings.ToLower(key) {
	case "authorization", "x-gemini-apikey", "x-gemini-nonce", "x-gemini-payload", "x-gemini-signature":
		return true
	default:
		return false
	}
}

// Connect establishes the WebSocket connection using the configured dialer.
// If a connection or reconnection attempt is already in flight, Connect waits until
// the client successfully connects, encounters an error, or the context is cancelled.
func (c *Client) Connect(ctx context.Context) error {
	if ctx == nil {
		ctx = context.Background()
	}
	if c.configErr != nil {
		return c.configErr
	}
	c.mu.Lock()

	for {
		if c.State() == StateClosed {
			c.mu.Unlock()
			return fmt.Errorf("%w: websocket client is closed", transport.ErrConnectionClosed)
		}
		if c.privateOnly && c.auth == nil {
			c.mu.Unlock()
			return ErrAuthenticationRequired
		}
		if c.conn != nil && c.State() == StateConnected && !c.replayInProgress {
			c.mu.Unlock()
			return nil // Already connected
		}
		if c.State() == StateConnecting || c.State() == StateReconnecting || c.replayInProgress {
			// Another dial or reconnect is currently in flight.
			// Wait for the active connection attempt to broadcast completion.
			done := c.connectDone
			c.mu.Unlock()
			select {
			case <-ctx.Done():
				return ctx.Err()
			case <-c.doneChan:
				return fmt.Errorf("%w: websocket client is closed", transport.ErrConnectionClosed)
			case <-done:
			}
			c.mu.Lock()
			if c.State() == StateConnected && !c.replayInProgress {
				c.mu.Unlock()
				return nil
			}
			if c.State() == StateClosed {
				c.mu.Unlock()
				return fmt.Errorf("%w: websocket client is closed", transport.ErrConnectionClosed)
			}
			if c.connectErr != nil {
				err := c.connectErr
				c.mu.Unlock()
				return fmt.Errorf("gemini websocket: connection failed: %w", err)
			}
			continue
		}
		if c.dialer == nil {
			c.mu.Unlock()
			return ErrNoDialerConfigured
		}

		// State is Disconnected. Serialize the complete new connection attempt
		// with stale subscription cleanup and reconnect installation. The helper
		// rechecks state after acquiring the gate because another lifecycle may
		// have started while this caller was waiting for it.
		c.mu.Unlock()
		err, retry := c.connectNew(ctx)
		if retry {
			c.mu.Lock()
			continue
		}
		return err
	}
}

func (c *Client) connectNew(ctx context.Context) (error, bool) {
	if err := c.acquireLifecycle(ctx); err != nil {
		return err, false
	}
	lifecycleHeld := true
	defer func() {
		if lifecycleHeld {
			c.releaseLifecycle()
		}
	}()

	c.mu.Lock()
	if c.State() == StateClosed {
		c.mu.Unlock()
		return fmt.Errorf("%w: websocket client is closed", transport.ErrConnectionClosed), false
	}
	if c.privateOnly && c.auth == nil {
		c.mu.Unlock()
		return ErrAuthenticationRequired, false
	}
	if c.conn != nil && c.State() == StateConnected && !c.replayInProgress {
		c.mu.Unlock()
		return nil, false
	}
	if c.State() != StateDisconnected {
		c.mu.Unlock()
		return nil, true
	}
	if c.dialer == nil {
		c.mu.Unlock()
		return ErrNoDialerConfigured, false
	}

	c.setState(StateConnecting, nil)
	lifecycle := c.startConnectAttemptLocked()
	dialer := c.dialer
	url := c.url
	c.mu.Unlock()

	dialCtx, dialCancel := context.WithCancel(ctx)
	go func() {
		select {
		case <-c.doneChan:
			dialCancel()
		case <-dialCtx.Done():
		}
	}()
	conn, _, dialErr := c.dial(dialCtx, dialer, url)
	dialCancel()

	c.mu.Lock()
	if c.State() == StateClosed {
		if conn != nil {
			_ = conn.Close()
		}
		c.broadcastConnectLocked(fmt.Errorf("%w: websocket client is closed", transport.ErrConnectionClosed))
		c.mu.Unlock()
		return fmt.Errorf("%w: websocket client is closed", transport.ErrConnectionClosed), false
	}

	if dialErr != nil {
		if conn != nil {
			_ = conn.Close()
		}
		c.setState(StateDisconnected, dialErr)
		c.broadcastConnectLocked(dialErr)
		c.mu.Unlock()
		return fmt.Errorf("gemini websocket: dial failed: %w", dialErr), false
	}

	c.configureReadLimit(conn)
	c.conn = conn
	c.state.Store(int32(StateConnected))
	c.replayInProgress = true
	c.pumpWg.Add(1)
	go c.readPump(lifecycle)
	c.mu.Unlock()
	// The lifecycle gate protects connection installation and stale cleanup.
	// Replay waits for server acknowledgements and must not prevent the read
	// pump from observing a dropped socket and starting recovery.
	c.releaseLifecycle()
	lifecycleHeld = false

	if err := c.resubscribeActiveFeeds(lifecycle); err != nil {
		resubscribeErr := fmt.Errorf("%w: %w", ErrResubscribeFailed, err)
		c.handleResubscribeFailure(lifecycle, resubscribeErr)
		return resubscribeErr, false
	}
	c.mu.Lock()
	if c.State() == StateConnected && c.lifecycle.Load() == lifecycle {
		c.replayInProgress = false
		c.startLivenessPumpLocked(lifecycle)
		c.publishEvent(ConnectionEvent{State: StateConnected})
		c.broadcastConnectLocked(nil)
		c.mu.Unlock()
		return nil, false
	}
	state := c.State()
	err := c.connectErr
	c.mu.Unlock()
	if state == StateClosed {
		return fmt.Errorf("%w: websocket client is closed", transport.ErrConnectionClosed), false
	}
	if state == StateReconnecting || state == StateConnecting {
		return nil, true
	}
	if err == nil {
		err = errors.New("connection lost during feed replay")
	}
	return fmt.Errorf("gemini websocket: connection failed during feed replay: %w", err), false
}

// Close gracefully terminates the connection and subscriber channels.
func (c *Client) Close() error {
	c.closeOnce.Do(func() {
		var err error
		c.mu.Lock()
		c.setState(StateClosed, nil)
		close(c.doneChan)
		closedErr := fmt.Errorf("%w: websocket client is closed", transport.ErrConnectionClosed)
		c.broadcastConnectLocked(closedErr)
		c.failPending(closedErr)
		if c.conn != nil {
			err = c.conn.Close()
			c.conn = nil
		}
		c.mu.Unlock()

		c.pumpWg.Wait()
		c.eventWg.Wait()

		c.subsMu.Lock()
		oldTables := c.subTables.Load()
		emptyTables := newSubTables()
		c.subTables.Store(emptyTables)
		c.activeFeeds = make(map[string]RequestFrame)
		c.snapshotPending = make(map[string]uint64)
		c.subsMu.Unlock()

		oldTables.closeAll()
		c.eventMu.Lock()
		if !c.eventClosed {
			c.eventClosed = true
			close(c.eventChan)
			for id, subscriber := range c.eventSubscribers {
				close(subscriber)
				delete(c.eventSubscribers, id)
			}
		}
		c.eventMu.Unlock()

		c.snapshotMu.Lock()
		isolatedClients := make([]*Client, 0, len(c.snapshotClients)+len(c.partialSnapshotClients))
		for symbol, snapshotClient := range c.snapshotClients {
			isolatedClients = append(isolatedClients, snapshotClient)
			delete(c.snapshotClients, symbol)
		}
		for symbol, snapshotClient := range c.partialSnapshotClients {
			isolatedClients = append(isolatedClients, snapshotClient)
			delete(c.partialSnapshotClients, symbol)
		}
		clear(c.snapshotClientRefs)
		clear(c.partialSnapshotRefs)
		c.snapshotMu.Unlock()
		for _, snapshotClient := range isolatedClients {
			if closeErr := snapshotClient.Close(); err == nil && closeErr != nil {
				err = closeErr
			}
		}
		c.closeErr = err
	})
	return c.closeErr
}

// readPump listens for incoming frames and initiates reconnects if connection drops.
func (c *Client) readPump(lifecycle uint64) {
	defer c.pumpWg.Done()
	frames := make(chan inboundFrame, 1024)
	dispatchDone := make(chan struct{})
	var dispatchWg sync.WaitGroup
	var stopDispatchOnce sync.Once
	stopDispatch := func() {
		stopDispatchOnce.Do(func() {
			close(dispatchDone)
			dispatchWg.Wait()
		})
	}
	dispatchWg.Add(1)
	go func() {
		defer dispatchWg.Done()
		for {
			select {
			case frame := <-frames:
				if err := c.dispatchFrame(dispatchDone, frame.payload, frame.generation); err != nil {
					c.publishEvent(ConnectionEvent{State: StateConnected, Err: err})
				}
			case <-dispatchDone:
				return
			}
		}
	}()
	defer stopDispatch()

	for {
		c.mu.RLock()
		conn := c.conn
		isClosed := c.State() == StateClosed
		stale := c.lifecycle.Load() != lifecycle
		c.mu.RUnlock()

		if isClosed || stale || conn == nil {
			return
		}

		_, payload, err := conn.ReadMessage(context.Background())
		if err == nil {
			if c.maxMessageSize > 0 && int64(len(payload)) > c.maxMessageSize {
				err = fmt.Errorf("%w: received %d bytes, limit is %d", ErrMessageTooLarge, len(payload), c.maxMessageSize)
			} else if c.lifecycle.Load() != lifecycle {
				return
			} else {
				handled, responseErr := c.dispatchResponse(payload)
				if responseErr != nil {
					err = responseErr
				} else if handled {
					continue
				} else {
					select {
					case frames <- inboundFrame{payload: payload, generation: c.subscriptionGeneration.Load()}:
						continue
					case <-c.doneChan:
						return
					default:
						err = fmt.Errorf("%w: inbound frame queue capacity %d exceeded", ErrSlowConsumer, cap(frames))
					}
				}
			}
		}
		if err != nil {
			stopDispatch()
			// Serialize failure handling with connection installation and
			// subscription cleanup. This prevents a stale read pump from clearing
			// subscriptions after a newer lifecycle has been installed, and keeps
			// pending-request admission atomic with invalidating this connection.
			if acquireErr := c.acquireLifecycle(context.Background()); acquireErr != nil {
				return
			}
			slowConsumer := errors.Is(err, ErrSlowConsumer)
			c.mu.Lock()
			if c.State() == StateClosed || c.lifecycle.Load() != lifecycle {
				c.mu.Unlock()
				c.releaseLifecycle()
				return
			}
			if c.State() == StateDisconnected && c.conn == nil {
				// Another lifecycle path already invalidated this connection, for
				// example after a failed feed resubscription.
				c.mu.Unlock()
				c.releaseLifecycle()
				return
			}
			// Connection dropped
			c.logger.Warn("gemini websocket connection dropped", slog.String("error", err.Error()))
			if c.conn != nil {
				_ = c.conn.Close()
				c.conn = nil
			}
			// The failed connection's replay turn is no longer active. A
			// subsequent manual Connect must not remain stuck behind the old
			// connectDone boundary when automatic reconnect is disabled.
			c.replayInProgress = false

			if c.autoReconnect {
				c.setState(StateReconnecting, err)
				reconnectLifecycle := c.startConnectAttemptLocked()
				c.failPending(err)
				c.mu.Unlock()
				if slowConsumer {
					// Apply the slow-consumer policy before starting the reconnect
					// loop. This prevents a new subscription established after a
					// reconnect from being closed by the old read pump.
					c.failSubscriptionsIfCurrentLocked(reconnectLifecycle, err)
				}
				c.releaseLifecycle()

				c.pumpWg.Add(1)
				go func() {
					defer c.pumpWg.Done()
					c.reconnectLoop(reconnectLifecycle)
				}()
			} else {
				c.setState(StateDisconnected, err)
				cleanupLifecycle := c.lifecycle.Add(1)
				c.broadcastConnectLocked(err)
				c.failPending(err)
				c.mu.Unlock()
				c.failSubscriptionsIfCurrentLocked(cleanupLifecycle, err)
				c.releaseLifecycle()
			}
			return
		}

	}
}

func (c *Client) reconnectLoop(lifecycle uint64) {
	baseBackoff := 100 * time.Millisecond
	maxBackoff := 5 * time.Second
	var lastDialErr error

	attempt := 1
	for {
		if c.maxReconnects > 0 && attempt > c.maxReconnects {
			break
		}

		shift := attempt - 1
		if shift > 6 {
			shift = 6
		}
		var jitterFactor float64 = 1.0
		if n, err := rand.Int(rand.Reader, big.NewInt(1000)); err == nil {
			jitterFactor = 0.5 + float64(n.Int64())/1000.0 // 0.5 to 1.5
		}
		backoff := time.Duration(float64(baseBackoff) * float64(int64(1)<<shift) * jitterFactor)
		if backoff > maxBackoff {
			backoff = maxBackoff
		}

		c.logger.Info("reconnecting to gemini websocket",
			slog.Int("attempt", attempt),
			slog.Duration("backoff", backoff),
		)

		select {
		case <-c.doneChan:
			c.mu.Lock()
			c.broadcastConnectLocked(fmt.Errorf("%w: websocket client is closed", transport.ErrConnectionClosed))
			c.mu.Unlock()
			return
		case <-time.After(backoff):
		}

		c.mu.Lock()
		if c.State() == StateClosed || c.lifecycle.Load() != lifecycle {
			c.mu.Unlock()
			return
		}
		if c.State() == StateConnected && c.conn != nil {
			// A concurrent manual Connect() restored the connection
			c.mu.Unlock()
			return
		}
		c.mu.Unlock()

		// Keep connection installation serialized with stale subscription
		// cleanup. Feed replay runs after the gate is released so a dropped
		// socket can be failed and replaced without waiting for ACK timeouts.
		if err := c.acquireLifecycle(context.Background()); err != nil {
			return
		}
		c.mu.Lock()
		if c.State() == StateClosed || c.lifecycle.Load() != lifecycle {
			c.mu.Unlock()
			c.releaseLifecycle()
			return
		}
		if c.State() == StateConnected && c.conn != nil {
			c.mu.Unlock()
			c.releaseLifecycle()
			return
		}
		c.mu.Unlock()

		dialCtx, dialCancel := context.WithTimeout(context.Background(), 10*time.Second)
		go func() {
			select {
			case <-c.doneChan:
				dialCancel()
			case <-dialCtx.Done():
			}
		}()

		c.mu.RLock()
		dialer := c.dialer
		wsURL := c.url
		c.mu.RUnlock()
		conn, _, dialErr := c.dial(dialCtx, dialer, wsURL)
		dialCancel()
		if dialErr == nil {
			c.configureReadLimit(conn)
			c.mu.Lock()
			if c.State() == StateClosed || c.lifecycle.Load() != lifecycle {
				_ = conn.Close()
				c.mu.Unlock()
				c.releaseLifecycle()
				return
			}
			if c.State() == StateConnected && c.conn != nil {
				// Concurrent manual Connect succeeded before us; close our redundant connection
				_ = conn.Close()
				c.mu.Unlock()
				c.releaseLifecycle()
				return
			}
			c.conn = conn
			c.state.Store(int32(StateConnected))
			c.replayInProgress = true
			c.pumpWg.Add(1)
			go c.readPump(lifecycle)
			c.mu.Unlock()
			// Do not hold lifecycleGate while replay waits for feed ACKs. The
			// read pump must be able to acquire it and handle a dropped socket.
			c.releaseLifecycle()

			if err := c.resubscribeActiveFeeds(lifecycle); err != nil {
				c.handleResubscribeFailure(lifecycle, fmt.Errorf("%w: %w", ErrResubscribeFailed, err))
			} else {
				c.mu.Lock()
				if c.State() == StateConnected && c.lifecycle.Load() == lifecycle {
					c.replayInProgress = false
					c.startLivenessPumpLocked(lifecycle)
					c.publishEvent(ConnectionEvent{State: StateConnected})
					c.broadcastConnectLocked(nil)
				}
				c.mu.Unlock()
			}
			return
		}

		if conn != nil {
			_ = conn.Close()
		}
		c.releaseLifecycle()
		lastDialErr = dialErr
		if errors.Is(dialErr, auth.ErrTokenSourceFailure) || errors.Is(dialErr, auth.ErrInvalidTokenSource) {
			authErr := fmt.Errorf("gemini websocket: reconnect authentication failed: %w", dialErr)
			c.mu.Lock()
			if c.State() == StateClosed || c.lifecycle.Load() != lifecycle {
				c.mu.Unlock()
				return
			}
			c.setState(StateDisconnected, authErr)
			c.broadcastConnectLocked(authErr)
			c.mu.Unlock()
			c.failSubscriptionsIfCurrent(lifecycle, authErr)
			return
		}
		attempt++
	}

	c.mu.Lock()
	if c.State() == StateClosed || c.lifecycle.Load() != lifecycle {
		c.mu.Unlock()
		return
	}
	maxErr := errors.New("gemini websocket: max reconnect attempts exceeded")
	if lastDialErr != nil {
		maxErr = fmt.Errorf("%w: last attempt failed: %w", maxErr, lastDialErr)
	}
	c.setState(StateDisconnected, maxErr)
	c.broadcastConnectLocked(maxErr)
	c.mu.Unlock()
	c.failSubscriptionsIfCurrent(lifecycle, maxErr)
}

func (c *Client) resubscribeActiveFeeds(lifecycle uint64) error {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := c.acquireSubscriptionReplay(ctx); err != nil {
		return err
	}
	c.subsMu.Lock()
	if c.lifecycle.Load() != lifecycle {
		c.subsMu.Unlock()
		c.releaseSubscriptionReplay()
		return nil
	}
	frames := make([]struct {
		key   string
		frame RequestFrame
	}, 0, len(c.activeFeeds))
	for key, frame := range c.activeFeeds {
		frames = append(frames, struct {
			key   string
			frame RequestFrame
		}{key: key, frame: frame})
		c.markSnapshotPendingLocked(frame)
	}
	c.subsMu.Unlock()
	c.releaseSubscriptionReplay()
	var errs []error

	for _, feed := range frames {
		if c.lifecycle.Load() != lifecycle {
			return nil
		}
		if err := c.acquireSubscriptionWire(ctx, feed.key); err != nil {
			errs = append(errs, fmt.Errorf("stream %q: acquire wire operation: %w", feed.key, err))
			continue
		}
		if c.lifecycle.Load() != lifecycle {
			c.releaseSubscriptionWire(feed.key)
			return nil
		}
		c.subsMu.Lock()
		current, stillActive := c.activeFeeds[feed.key]
		stillCurrent := stillActive && sameRequestFrame(current, feed.frame)
		c.subsMu.Unlock()
		if !stillCurrent {
			c.releaseSubscriptionWire(feed.key)
			continue
		}
		_, requestErr := c.requestConnected(ctx, feed.frame.Method, feed.frame.Params)
		c.releaseSubscriptionWire(feed.key)
		if requestErr != nil {
			stream := ""
			if len(feed.frame.Params) > 0 {
				stream = feed.frame.Params[0]
			}
			errs = append(errs, fmt.Errorf("stream %q: %w", stream, requestErr))
		}
	}
	return errors.Join(errs...)
}

func sameRequestFrame(a, b RequestFrame) bool {
	if a.ID != b.ID || a.Method != b.Method || len(a.Params) != len(b.Params) {
		return false
	}
	for i := range a.Params {
		if a.Params[i] != b.Params[i] {
			return false
		}
	}
	return true
}

func (c *Client) failSubscriptionsIfCurrent(lifecycle uint64, err error) {
	if err == nil {
		return
	}
	if c.lifecycle.Load() != lifecycle || c.State() == StateClosed {
		return
	}
	if acquireErr := c.acquireLifecycle(context.Background()); acquireErr != nil {
		return
	}
	defer c.releaseLifecycle()
	c.failSubscriptionsIfCurrentLocked(lifecycle, err)
}

// failSubscriptionsIfCurrentLocked requires lifecycleGate to be held. The
// gate serializes this table swap with connection installation and stale
// lifecycle cleanup.
func (c *Client) failSubscriptionsIfCurrentLocked(lifecycle uint64, err error) {
	if err == nil {
		return
	}
	if c.lifecycle.Load() != lifecycle || c.State() == StateClosed {
		return
	}
	if acquireErr := c.acquireSubscriptionReplay(context.Background()); acquireErr != nil {
		return
	}
	defer c.releaseSubscriptionReplay()
	c.subsMu.Lock()
	if c.lifecycle.Load() != lifecycle || c.State() == StateClosed {
		c.subsMu.Unlock()
		return
	}
	oldTables := c.subTables.Load()
	c.subTables.Store(newSubTables())
	c.activeFeeds = make(map[string]RequestFrame)
	c.snapshotPending = make(map[string]uint64)
	c.subsMu.Unlock()

	oldTables.closeAll()
	c.publishEvent(ConnectionEvent{State: c.State(), Err: err})
}

func (c *Client) handleResubscribeFailure(lifecycle uint64, err error) {
	if err == nil {
		return
	}
	// Keep lifecycle invalidation and subscription-table cleanup in the same
	// critical section. Otherwise a concurrent manual Connect can install a
	// newer lifecycle between these operations and cause the failed replay's
	// cleanup to be discarded as stale.
	if acquireErr := c.acquireLifecycle(context.Background()); acquireErr != nil {
		return
	}
	defer c.releaseLifecycle()

	c.mu.Lock()
	if c.State() != StateClosed && c.lifecycle.Load() == lifecycle {
		c.replayInProgress = false
		if c.conn != nil {
			_ = c.conn.Close()
			c.conn = nil
		}
		// Invalidate the read pump and any reconnect work associated with the
		// failed connection before allowing a new manual Connect to proceed.
		cleanupLifecycle := c.lifecycle.Add(1)
		c.setState(StateDisconnected, err)
		c.broadcastConnectLocked(err)
		c.mu.Unlock()
		c.failSubscriptionsIfCurrentLocked(cleanupLifecycle, err)
		return
	}
	c.mu.Unlock()
}
