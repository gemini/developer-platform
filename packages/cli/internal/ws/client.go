package ws

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha512"
	"encoding/base64"
	"encoding/binary"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"math"
	"net"
	"net/http"
	"sync"
	"sync/atomic"
	"time"

	"github.com/gorilla/websocket"

	"github.com/gemini/developer-platform/packages/cli/internal/debug"
)

const (
	// DefaultReconnectBaseDelay is the initial delay before reconnecting.
	DefaultReconnectBaseDelay = 1 * time.Second
	// DefaultReconnectMaxDelay is the maximum delay between reconnects.
	DefaultReconnectMaxDelay = 60 * time.Second
	// DefaultMaxReconnects is the maximum number of reconnection attempts.
	DefaultMaxReconnects = 5
	// DefaultWriteTimeout is the timeout for writing messages.
	DefaultWriteTimeout = 10 * time.Second
	// DefaultPingInterval is the interval between ping messages.
	DefaultPingInterval = 30 * time.Second
	// DefaultPongTimeout is the timeout for receiving pong responses.
	DefaultPongTimeout = 10 * time.Second
)

// AuthConfig contains API authentication configuration for WebSocket.
type AuthConfig struct {
	APIKey            string
	APISecret         string
	BearerToken       string
	BearerTokenSource func(context.Context) (string, error)
}

// Client is a WebSocket client with automatic reconnection.
type Client struct {
	conn               *websocket.Conn
	mu                 sync.Mutex
	requestID          atomic.Int64
	done               chan struct{}
	closeOnce          sync.Once
	url                string
	subscriptions      []string
	reconnectEnabled   bool
	maxReconnects      int
	reconnectBaseDelay time.Duration
	reconnectMaxDelay  time.Duration
	writeTimeout       time.Duration
	pingInterval       time.Duration
	pongTimeout        time.Duration
	onReconnect        func()
	auth               *AuthConfig

	pendingMu       sync.Mutex
	pendingRequests map[int64]chan Response
	streamCh        chan StreamMessage
	readLoopOnce    sync.Once

	lastPongMu   sync.RWMutex
	lastPongTime time.Time
}

// Request represents a WebSocket request message.
type Request struct {
	ID     int64           `json:"id"`
	Method string          `json:"method"`
	Params json.RawMessage `json:"params,omitempty"`
}

// Response represents a WebSocket response message.
type Response struct {
	ID     int64           `json:"id"`
	Status int             `json:"status"`
	Result json.RawMessage `json:"result,omitempty"`
	Error  *Error          `json:"error,omitempty"`
}

// Error represents a WebSocket error response.
type Error struct {
	Code int    `json:"code"`
	Msg  string `json:"msg"`
}

func (e *Error) Error() string {
	return fmt.Sprintf("%d: %s", e.Code, e.Msg)
}

// Compile-time interface check.
var _ error = (*Error)(nil)

// HTTPError represents a WebSocket upgrade failure with an HTTP response.
type HTTPError struct {
	StatusCode int
	Status     string
	Body       string
	Err        error
}

func (e *HTTPError) Error() string {
	status := e.Status
	if status == "" {
		status = fmt.Sprintf("HTTP %d", e.StatusCode)
	}
	msg := "websocket dial failed: " + status
	if e.Err != nil {
		msg = fmt.Sprintf("websocket dial failed: %s: %v", status, e.Err)
	}
	if e.Body != "" {
		msg += " (server: " + e.Body + ")"
	}
	return msg
}

func (e *HTTPError) Unwrap() error {
	return e.Err
}

// Compile-time interface check.
var _ error = (*HTTPError)(nil)

// StreamMessage represents a streamed data message.
type StreamMessage struct {
	Stream string          `json:"stream"`
	Data   json.RawMessage `json:"data"`
}

// ClientOption is a functional option for configuring a WebSocket client.
type ClientOption func(*Client)

// WithReconnect enables automatic reconnection with a maximum retry count.
func WithReconnect(maxRetries int) ClientOption {
	return func(c *Client) {
		c.reconnectEnabled = true
		c.maxReconnects = maxRetries
	}
}

// WithOnReconnect sets a callback function to run after reconnection.
func WithOnReconnect(fn func()) ClientOption {
	return func(c *Client) {
		c.onReconnect = fn
	}
}

// WithAuth configures API key authentication for the WebSocket connection.
func WithAuth(apiKey, apiSecret string) ClientOption {
	return func(c *Client) {
		c.auth = &AuthConfig{
			APIKey:    apiKey,
			APISecret: apiSecret,
		}
	}
}

// WithBearerAuth configures Bearer token authentication for the WebSocket connection.
func WithBearerAuth(token string) ClientOption {
	return func(c *Client) {
		c.auth = &AuthConfig{
			BearerToken: token,
		}
	}
}

// WithBearerTokenSource configures Bearer token authentication via a refreshable token source.
func WithBearerTokenSource(source func(context.Context) (string, error)) ClientOption {
	return func(c *Client) {
		c.auth = &AuthConfig{
			BearerTokenSource: source,
		}
	}
}

// WithWriteTimeout sets the write timeout for WebSocket messages.
func WithWriteTimeout(d time.Duration) ClientOption {
	return func(c *Client) {
		c.writeTimeout = d
	}
}

// Connect establishes a new WebSocket connection.
func Connect(ctx context.Context, url string, opts ...ClientOption) (*Client, error) {
	c := &Client{
		done:               make(chan struct{}),
		url:                url,
		maxReconnects:      DefaultMaxReconnects,
		reconnectBaseDelay: DefaultReconnectBaseDelay,
		reconnectMaxDelay:  DefaultReconnectMaxDelay,
		writeTimeout:       DefaultWriteTimeout,
		pingInterval:       DefaultPingInterval,
		pongTimeout:        DefaultPongTimeout,
		lastPongTime:       time.Now(),
	}

	for _, opt := range opts {
		opt(c)
	}

	var headers http.Header
	if c.auth != nil {
		authHeaders, err := c.generateAuthHeaders(ctx)
		if err != nil {
			return nil, fmt.Errorf("authenticate websocket: %w", err)
		}
		headers = authHeaders
		debug.Log("connecting to WebSocket (authenticated): %s", url)
	} else {
		debug.Log("connecting to WebSocket: %s", url)
	}

	conn, resp, err := websocket.DefaultDialer.DialContext(ctx, url, headers)
	var respBody string
	if resp != nil && resp.Body != nil {
		body, _ := io.ReadAll(resp.Body)
		resp.Body.Close()
		respBody = string(bytes.TrimSpace(body))
	}
	if err != nil {
		return nil, websocketDialErrorWithBody(resp, err, respBody)
	}

	conn.SetPongHandler(func(appData string) error {
		c.lastPongMu.Lock()
		c.lastPongTime = time.Now()
		c.lastPongMu.Unlock()
		return nil
	})

	c.conn = conn

	// Start heartbeat goroutine
	go c.heartbeat(ctx)

	return c, nil
}

func (c *Client) generateAuthHeaders(ctx context.Context) (http.Header, error) {
	headers := http.Header{}

	if c.auth.BearerTokenSource != nil {
		token, err := c.auth.BearerTokenSource(ctx)
		if err != nil {
			return nil, fmt.Errorf("get bearer token: %w", err)
		}
		headers.Set("Authorization", "Bearer "+token)
		return headers, nil
	}

	if c.auth.BearerToken != "" {
		headers.Set("Authorization", "Bearer "+c.auth.BearerToken)
		return headers, nil
	}

	// HMAC-SHA384 signing with nanosecond nonce
	nonce := fmt.Sprintf("%d", time.Now().UnixNano())
	payload := base64.StdEncoding.EncodeToString([]byte(nonce))

	mac := hmac.New(sha512.New384, []byte(c.auth.APISecret))
	mac.Write([]byte(payload))
	signature := hex.EncodeToString(mac.Sum(nil))

	headers.Set("X-GEMINI-APIKEY", c.auth.APIKey)
	headers.Set("X-GEMINI-PAYLOAD", payload)
	headers.Set("X-GEMINI-SIGNATURE", signature)
	headers.Set("X-GEMINI-NONCE", nonce)

	return headers, nil
}

func (c *Client) heartbeat(ctx context.Context) {
	ticker := time.NewTicker(c.pingInterval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-c.done:
			return
		case <-ticker.C:
			c.mu.Lock()
			if c.conn != nil {
				_ = c.conn.SetWriteDeadline(time.Now().Add(c.writeTimeout))
				err := c.conn.WriteMessage(websocket.PingMessage, nil)
				_ = c.conn.SetWriteDeadline(time.Time{}) // Clear deadline
				if err != nil {
					debug.Log("heartbeat ping failed: %v", err)
					// Connection may be dead, reconnect will handle it
				}
			}
			c.mu.Unlock()
		}
	}
}

func (c *Client) reconnect(ctx context.Context) error {
	c.mu.Lock()
	subs := make([]string, len(c.subscriptions))
	copy(subs, c.subscriptions)
	oldConn := c.conn
	c.mu.Unlock()

	// Close old connection if it exists
	if oldConn != nil {
		oldConn.Close()
	}

	var lastErr error
	for attempt := 0; attempt < c.maxReconnects; attempt++ {
		// Add jitter to prevent thundering herd
		jitter := 1.0 + cryptoRandFloat64()*0.3
		delay := time.Duration(float64(c.reconnectBaseDelay) * math.Pow(2, float64(attempt)) * jitter)
		if delay > c.reconnectMaxDelay {
			delay = c.reconnectMaxDelay
		}

		debug.Log("reconnecting (attempt %d) after %v", attempt+1, delay)

		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-time.After(delay):
		}

		var headers http.Header
		if c.auth != nil {
			authHeaders, err := c.generateAuthHeaders(ctx)
			if err != nil {
				lastErr = err
				continue
			}
			headers = authHeaders
		}

		conn, resp, err := websocket.DefaultDialer.DialContext(ctx, c.url, headers)
		var reconnBody string
		if resp != nil && resp.Body != nil {
			body, _ := io.ReadAll(resp.Body)
			resp.Body.Close()
			reconnBody = string(bytes.TrimSpace(body))
		}
		if err != nil {
			lastErr = websocketDialErrorWithBody(resp, err, reconnBody)
			continue
		}

		c.mu.Lock()
		c.conn = conn
		c.mu.Unlock()

		if len(subs) > 0 {
			if err := c.sendSubscriptionRequest(ctx, "subscribe", subs, false); err != nil {
				lastErr = err
				continue
			}
		}

		debug.Log("reconnected successfully")
		if c.onReconnect != nil {
			c.onReconnect()
		}

		return nil
	}

	return fmt.Errorf("reconnect failed after %d attempts: %w", c.maxReconnects, lastErr)
}

func websocketDialErrorWithBody(resp *http.Response, err error, body string) error {
	if resp == nil {
		return fmt.Errorf("websocket dial: %w", err)
	}
	return &HTTPError{
		StatusCode: resp.StatusCode,
		Status:     resp.Status,
		Body:       body,
		Err:        err,
	}
}

// Close closes the WebSocket connection.
func (c *Client) Close() error {
	var err error
	c.closeOnce.Do(func() {
		close(c.done)
		c.mu.Lock()
		if c.conn != nil {
			err = c.conn.Close()
		}
		c.mu.Unlock()
	})
	return err
}

// IsHealthy returns whether the connection is healthy based on recent pong.
func (c *Client) IsHealthy() bool {
	c.lastPongMu.RLock()
	lastPong := c.lastPongTime
	c.lastPongMu.RUnlock()

	staleThreshold := c.pingInterval + c.pongTimeout
	return time.Since(lastPong) < staleThreshold
}

// Ping sends a ping message to the server.
func (c *Client) Ping() error {
	c.mu.Lock()
	defer c.mu.Unlock()

	if c.conn == nil {
		return fmt.Errorf("connection closed")
	}

	_ = c.conn.SetWriteDeadline(time.Now().Add(c.writeTimeout))
	err := c.conn.WriteMessage(websocket.PingMessage, nil)
	_ = c.conn.SetWriteDeadline(time.Time{})
	return err
}

// Subscribe subscribes to WebSocket streams.
func (c *Client) Subscribe(ctx context.Context, streams ...string) error {
	c.mu.Lock()
	existing := make(map[string]bool)
	for _, s := range c.subscriptions {
		existing[s] = true
	}
	newStreams := make([]string, 0, len(streams))
	for _, s := range streams {
		if !existing[s] {
			newStreams = append(newStreams, s)
		}
	}
	c.mu.Unlock()

	if len(newStreams) == 0 {
		return nil
	}
	if err := c.sendSubscriptionRequest(ctx, "subscribe", newStreams, true); err != nil {
		return err
	}

	c.mu.Lock()
	defer c.mu.Unlock()
	existing = make(map[string]bool)
	for _, s := range c.subscriptions {
		existing[s] = true
	}
	for _, s := range newStreams {
		if !existing[s] {
			c.subscriptions = append(c.subscriptions, s)
		}
	}
	return nil
}

// Unsubscribe unsubscribes from WebSocket streams.
func (c *Client) Unsubscribe(ctx context.Context, streams ...string) error {
	if err := c.sendSubscriptionRequest(ctx, "unsubscribe", streams, true); err != nil {
		return err
	}

	c.mu.Lock()
	defer c.mu.Unlock()

	remove := make(map[string]bool, len(streams))
	for _, stream := range streams {
		remove[stream] = true
	}
	kept := c.subscriptions[:0]
	for _, stream := range c.subscriptions {
		if !remove[stream] {
			kept = append(kept, stream)
		}
	}
	c.subscriptions = kept
	return nil
}

func (c *Client) sendSubscriptionRequest(ctx context.Context, method string, streams []string, wait bool) error {
	if wait {
		_, err := c.SendRequest(ctx, method, streams)
		return err
	}

	params, _ := json.Marshal(streams)
	return c.send(Request{
		ID:     c.requestID.Add(1),
		Method: method,
		Params: params,
	})
}

// Stream returns a channel of streamed messages.
func (c *Client) Stream(ctx context.Context) <-chan StreamMessage {
	c.startReadLoop()

	ch := make(chan StreamMessage, 100)
	go func() {
		defer close(ch)
		for {
			select {
			case <-ctx.Done():
				return
			case <-c.done:
				return
			case msg, ok := <-c.streamCh:
				if !ok {
					return
				}
				select {
				case ch <- msg:
				case <-ctx.Done():
					return
				}
			}
		}
	}()

	return ch
}

func (c *Client) send(req Request) error {
	c.mu.Lock()
	defer c.mu.Unlock()

	if c.conn == nil {
		return fmt.Errorf("connection closed")
	}

	data, err := json.Marshal(req)
	if err != nil {
		return fmt.Errorf("marshal websocket request: %w", err)
	}

	debug.Log("ws send: method=%s id=%d", req.Method, req.ID)

	_ = c.conn.SetWriteDeadline(time.Now().Add(c.writeTimeout))
	err = c.conn.WriteMessage(websocket.TextMessage, data)
	_ = c.conn.SetWriteDeadline(time.Time{}) // Clear deadline

	if err != nil {
		return fmt.Errorf("websocket write: %w", err)
	}
	return nil
}

func (c *Client) initPendingRequests() {
	c.pendingMu.Lock()
	defer c.pendingMu.Unlock()
	if c.pendingRequests == nil {
		c.pendingRequests = make(map[int64]chan Response)
	}
}

func (c *Client) startReadLoop() {
	c.readLoopOnce.Do(func() {
		c.initPendingRequests()
		c.streamCh = make(chan StreamMessage, 100)
		go c.readLoop()
	})
}

func (c *Client) readLoop() {
	defer close(c.streamCh)
	loopCtx, cancel := context.WithCancel(context.Background())
	defer cancel()
	go func() {
		select {
		case <-c.done:
			cancel()
		case <-loopCtx.Done():
		}
	}()

	for {
		select {
		case <-c.done:
			return
		default:
			c.mu.Lock()
			conn := c.conn
			c.mu.Unlock()

			if conn == nil {
				time.Sleep(100 * time.Millisecond)
				continue
			}

			_, data, err := conn.ReadMessage()
			if err != nil {
				debug.Log("read error: %v", err)

				// Check for intentional close before attempting reconnect.
				select {
				case <-c.done:
					return
				default:
				}

				// Clean server close (normal close frame or connection already closed
				// locally after gorilla processed a close frame) — exit without reconnecting.
				if websocket.IsCloseError(err, websocket.CloseNormalClosure, websocket.CloseGoingAway) ||
					errors.Is(err, net.ErrClosed) || errors.Is(err, io.EOF) {
					debug.Log("stream closed by server")
					return
				}

				if c.reconnectEnabled {
					if reconnErr := c.reconnect(loopCtx); reconnErr != nil {
						debug.Log("reconnect failed: %v", reconnErr)
						return
					}
					continue
				}
				return
			}

			var raw map[string]json.RawMessage
			if err := json.Unmarshal(data, &raw); err != nil {
				debug.Log("unmarshal raw error: %v", err)
				continue
			}

			if _, hasStream := raw["stream"]; hasStream {
				var msg StreamMessage
				if err := json.Unmarshal(data, &msg); err != nil {
					debug.Log("unmarshal stream error: %v", err)
					continue
				}
				if msg.Stream != "" {
					select {
					case c.streamCh <- msg:
					case <-c.done:
						return
					}
				}
			} else if _, hasStatus := raw["status"]; hasStatus {
				var resp Response
				if err := json.Unmarshal(data, &resp); err != nil {
					debug.Log("unmarshal response error: %v", err)
					continue
				}

				c.pendingMu.Lock()
				if ch, ok := c.pendingRequests[resp.ID]; ok {
					select {
					case ch <- resp:
					default:
					}
					delete(c.pendingRequests, resp.ID)
				}
				c.pendingMu.Unlock()
			}
		}
	}
}

// SendRequest sends a request and waits for the response.
func (c *Client) SendRequest(ctx context.Context, method string, params any) (*Response, error) {
	c.startReadLoop()

	reqID := c.requestID.Add(1)
	respCh := make(chan Response, 1)

	c.pendingMu.Lock()
	c.pendingRequests[reqID] = respCh
	c.pendingMu.Unlock()

	defer func() {
		c.pendingMu.Lock()
		delete(c.pendingRequests, reqID)
		c.pendingMu.Unlock()
	}()

	paramsJSON, err := json.Marshal(params)
	if err != nil {
		return nil, fmt.Errorf("marshal params: %w", err)
	}

	req := Request{
		ID:     reqID,
		Method: method,
		Params: paramsJSON,
	}

	if err := c.send(req); err != nil {
		return nil, err
	}

	select {
	case <-ctx.Done():
		return nil, ctx.Err()
	case resp := <-respCh:
		if resp.Error != nil {
			return nil, resp.Error
		}
		return &resp, nil
	}
}

// TickerStream returns the stream name for ticker updates.
func TickerStream(symbol string) string {
	return fmt.Sprintf("%s@bookTicker", symbol)
}

// TradesStream returns the stream name for trade updates.
func TradesStream(symbol string) string {
	return fmt.Sprintf("%s@trade", symbol)
}

// DepthStream returns the stream name for order book depth.
func DepthStream(symbol string, levels int) string {
	return fmt.Sprintf("%s@depth%d", symbol, levels)
}

// OrdersStream returns the stream name for order updates.
func OrdersStream() string {
	return "orders@account"
}

// OrdersSessionStream returns the stream name for session order updates.
func OrdersSessionStream() string {
	return "orders@session"
}

// BalancesStream returns the stream name for balance updates.
func BalancesStream() string {
	return "balances@account"
}

// BalancesSnapshotStream returns the stream name for balance snapshots.
func BalancesSnapshotStream() string {
	return "balances@account@1s"
}

// PositionsStream returns the stream name for position updates.
func PositionsStream() string {
	return "positions@account"
}

// ContractStatusStream returns the stream name for contract lifecycle events.
func ContractStatusStream() string {
	return "contractStatus"
}

func cryptoRandFloat64() float64 {
	var b [8]byte
	if _, err := rand.Read(b[:]); err != nil {
		return 0
	}
	return float64(binary.BigEndian.Uint64(b[:])>>11) / (1 << 53)
}
