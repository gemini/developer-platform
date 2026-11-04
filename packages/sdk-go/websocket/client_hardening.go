package websocket

import (
	"context"
	"errors"
	"fmt"
	"time"
)

const (
	// DefaultMaxMessageSize is the default maximum inbound WebSocket message
	// size. It matches the limit used by the TypeScript SDK and protects the
	// read pump from unbounded server payloads.
	DefaultMaxMessageSize int64 = 1 << 20
)

var (
	// ErrMessageTooLarge indicates that an inbound WebSocket message exceeded
	// the configured maximum size. The connection is closed so callers cannot
	// continue from an unknown stream boundary.
	ErrMessageTooLarge = errors.New("gemini websocket: inbound message exceeds configured limit")

	// ErrMalformedFrame indicates that a frame was not valid JSON. Malformed
	// frames are reported through ConnectionEvent.Err and ignored so a single
	// bad frame does not tear down an otherwise healthy connection.
	ErrMalformedFrame = errors.New("gemini websocket: malformed inbound frame")

	// ErrMalformedResponse indicates that a correlated response could not be
	// decoded. The matching pending request is failed immediately when its ID
	// can be recovered; otherwise the connection lifecycle fails all pending
	// requests while recovering the stream.
	ErrMalformedResponse = errors.New("gemini websocket: malformed correlated response")

	// ErrLivenessFailed indicates that an opt-in application-level ping did not
	// complete successfully. The underlying error is retained for errors.Is and
	// errors.As checks.
	ErrLivenessFailed = errors.New("gemini websocket: liveness check failed")
)

// WithMaxMessageSize configures the maximum size, in bytes, of an inbound
// WebSocket message. The default is DefaultMaxMessageSize. A non-positive
// value disables the client-side limit; transports that support
// ReadLimitSetter receive the same positive limit before the read pump starts.
func WithMaxMessageSize(limit int64) ClientOption {
	return func(c *Client) {
		c.maxMessageSize = limit
	}
}

// WithLiveness enables an application-level liveness watchdog. At every
// interval the client sends the existing correlated ping method and waits up
// to timeout for its response. A failed check is reported through
// ConnectionEvent.Err and the current connection is closed so the normal
// reconnect policy can recover it. A non-positive interval disables the
// watchdog; a non-positive timeout uses the interval as the timeout.
func WithLiveness(interval, timeout time.Duration) ClientOption {
	return func(c *Client) {
		if interval <= 0 {
			c.livenessInterval = 0
			c.livenessTimeout = 0
			return
		}
		if timeout <= 0 {
			timeout = interval
		}
		c.livenessInterval = interval
		c.livenessTimeout = timeout
	}
}

func (c *Client) configureReadLimit(conn Conn) {
	if c.maxMessageSize <= 0 {
		return
	}
	if setter, ok := conn.(ReadLimitSetter); ok {
		setter.SetReadLimit(c.maxMessageSize)
	}
}

func (c *Client) startLivenessPumpLocked(lifecycle uint64) {
	if c.livenessInterval <= 0 || c.State() != StateConnected || c.lifecycle.Load() != lifecycle {
		return
	}
	c.pumpWg.Add(1)
	go c.livenessPump(lifecycle)
}

func (c *Client) livenessPump(lifecycle uint64) {
	defer c.pumpWg.Done()

	ticker := time.NewTicker(c.livenessInterval)
	defer ticker.Stop()

	for {
		select {
		case <-c.doneChan:
			return
		case <-ticker.C:
		}

		c.mu.RLock()
		active := c.State() == StateConnected && c.lifecycle.Load() == lifecycle && !c.replayInProgress && c.conn != nil
		c.mu.RUnlock()
		if !active {
			return
		}

		ctx, cancel := context.WithTimeout(context.Background(), c.livenessTimeout)
		_, err := c.requestConnected(ctx, string(OpPing), nil)
		cancel()
		if err == nil {
			continue
		}

		failure := fmt.Errorf("%w: %w", ErrLivenessFailed, err)
		c.mu.RLock()
		stillCurrent := c.State() == StateConnected && c.lifecycle.Load() == lifecycle && c.conn != nil
		conn := c.conn
		c.mu.RUnlock()
		if !stillCurrent {
			return
		}

		// Publish the liveness error before closing the transport. The read pump
		// will then apply the normal reconnect policy, while callers retain the
		// original error identity instead of seeing only a socket-close error.
		c.publishEvent(ConnectionEvent{State: StateConnected, Err: failure})
		_ = conn.Close()
		return
	}
}
