package gorilla

import (
	"context"
	"errors"
	"fmt"
	"net"
	"net/http"
	"time"

	"github.com/gemini/gemini-go/websocket"
	gorilla_ws "github.com/gorilla/websocket"
)

// connAdapter wraps a Gorilla WebSocket Conn to satisfy websocket.Conn interface.
type connAdapter struct {
	conn *gorilla_ws.Conn
}

var _ websocket.Conn = (*connAdapter)(nil)
var _ websocket.ReadLimitSetter = (*connAdapter)(nil)

func (c *connAdapter) ReadMessage(ctx context.Context) (int, []byte, error) {
	if ctx == nil {
		ctx = context.Background()
	}
	if ctx.Err() != nil {
		return 0, nil, ctx.Err()
	}
	if deadline, ok := ctx.Deadline(); ok {
		_ = c.conn.SetReadDeadline(deadline)
	}
	done, watcherDone := watchContext(ctx, func() error {
		return c.conn.SetReadDeadline(time.Unix(1, 0))
	})
	msgType, payload, err := c.conn.ReadMessage()
	if done != nil {
		close(done)
		<-watcherDone
	}
	_ = c.conn.SetReadDeadline(time.Time{})
	if ctx.Err() != nil {
		return 0, nil, ctx.Err()
	}
	if errors.Is(err, gorilla_ws.ErrReadLimit) {
		return 0, nil, fmt.Errorf("%w: %v", websocket.ErrMessageTooLarge, err)
	}
	return msgType, payload, err
}

func (c *connAdapter) WriteMessage(ctx context.Context, messageType int, payload []byte) error {
	if ctx == nil {
		ctx = context.Background()
	}
	if ctx.Err() != nil {
		return ctx.Err()
	}
	if deadline, ok := ctx.Deadline(); ok {
		_ = c.conn.SetWriteDeadline(deadline)
	}
	done, watcherDone := watchContext(ctx, func() error {
		return c.conn.SetWriteDeadline(time.Unix(1, 0))
	})
	err := c.conn.WriteMessage(messageType, payload)
	if done != nil {
		close(done)
		<-watcherDone
	}
	_ = c.conn.SetWriteDeadline(time.Time{})
	if ctx.Err() != nil {
		// A deadline interrupt leaves Gorilla's connection unusable for a
		// subsequent write. Close it so the owning client can observe the
		// terminal state and reconnect instead of reusing a poisoned socket.
		_ = c.conn.Close()
		return ctx.Err()
	}
	var netErr net.Error
	if err != nil && errors.As(err, &netErr) && netErr.Timeout() {
		_ = c.conn.Close()
	}
	return err
}

func watchContext(ctx context.Context, interrupt func() error) (done, watcherDone chan struct{}) {
	if ctx.Done() == nil {
		return nil, nil
	}
	done = make(chan struct{})
	watcherDone = make(chan struct{})
	go func() {
		defer close(watcherDone)
		select {
		case <-ctx.Done():
			_ = interrupt()
		case <-done:
		}
	}()
	return done, watcherDone
}

func (c *connAdapter) Close() error {
	return c.conn.Close()
}

func (c *connAdapter) SetReadLimit(limit int64) {
	c.conn.SetReadLimit(limit)
}

// DialerAdapter implements websocket.Dialer using gorilla/websocket.
type DialerAdapter struct {
	dialer *gorilla_ws.Dialer
}

var _ websocket.Dialer = (*DialerAdapter)(nil)

// NewDialer creates a new Gorilla WebSocket dialer adapter.
func NewDialer(opts ...func(*gorilla_ws.Dialer)) *DialerAdapter {
	d := *gorilla_ws.DefaultDialer
	dialer := &d
	for _, opt := range opts {
		opt(dialer)
	}
	return &DialerAdapter{dialer: dialer}
}

// Dial establishes a WebSocket connection.
func (d *DialerAdapter) Dial(ctx context.Context, url string, headers http.Header) (websocket.Conn, *http.Response, error) {
	if d == nil || d.dialer == nil {
		return nil, nil, errors.New("gemini websocket: nil gorilla dialer")
	}
	if ctx == nil {
		ctx = context.Background()
	}
	conn, resp, err := d.dialer.DialContext(ctx, url, headers)
	if err != nil {
		return nil, resp, err
	}
	return &connAdapter{conn: conn}, resp, nil
}
