package websocket

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"strconv"
	"strings"

	"github.com/gemini/gemini-go/transport"
)

// DepthSnapshotOptions controls the optional limit on a one-shot depth
// snapshot request. A zero limit uses the exchange default; valid explicit
// limits range from 1 through 5000.
type DepthSnapshotOptions struct {
	Limit int
}

// GetDepthSnapshot sends the typed WebSocket depth request and decodes its
// full order-book result.
func (c *Client) GetDepthSnapshot(ctx context.Context, symbol string, options DepthSnapshotOptions) (*OrderBookSnapshot, error) {
	if options.Limit < 0 || options.Limit > 5000 {
		return nil, fmt.Errorf("gemini websocket: depth snapshot limit must be 0 or between 1 and 5000")
	}
	normSymbol, err := normalizeSymbol(symbol)
	if err != nil {
		return nil, err
	}
	params := struct {
		Symbol string `json:"symbol"`
		Limit  int    `json:"limit,omitempty"`
	}{
		Symbol: strings.ToLower(normSymbol),
		Limit:  options.Limit,
	}
	response, err := c.Request(ctx, "depth", params)
	if err != nil {
		return nil, err
	}
	if len(response.Result) == 0 {
		return nil, errors.New("gemini websocket: depth response missing result")
	}
	var snapshot OrderBookSnapshot
	if err := response.DecodeResult(&snapshot); err != nil {
		return nil, fmt.Errorf("gemini websocket: decoding depth response: %w", err)
	}
	return &snapshot, nil
}

// Send writes a JSON frame to the active connection.
func (c *Client) Send(ctx context.Context, payload any) error {
	if ctx == nil {
		ctx = context.Background()
	}
	data, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("gemini websocket: marshaling payload: %w", err)
	}

	c.logger.Debug("websocket sending frame", slog.Int("bytes", len(data)))
	c.writeMu.Lock()
	defer c.writeMu.Unlock()

	c.mu.RLock()
	conn := c.conn
	state := c.State()
	if state == StateClosed {
		c.mu.RUnlock()
		return fmt.Errorf("%w: websocket connection closed", transport.ErrConnectionClosed)
	}
	if conn == nil || state != StateConnected {
		c.mu.RUnlock()
		return errors.New("gemini websocket: not connected")
	}
	c.mu.RUnlock()
	// Close is documented (see the Conn interface) as safe to call
	// concurrently with an in-flight WriteMessage, and gorilla/websocket
	// itself guarantees this, so conn is not held past this point: doing so
	// would make Close/state-transition paths that need c.mu wait on a
	// slow or blocked write (see TestSubscriptionCleanupDoesNotWaitForBlockedWireRequest).
	return conn.WriteMessage(ctx, TextMessage, data)
}

// Request sends a JSON WebSocket method request and waits for its correlated
// response. The params value is encoded as the wire-level params field and may
// be nil when the method has no parameters.
func (c *Client) Request(ctx context.Context, method string, params any) (ResponseFrame, error) {
	return c.request(ctx, method, params)
}

// RequestAuthenticated sends a JSON WebSocket method request that is required
// to use the configured authentication strategy. Use this for private methods
// when the method name is supplied dynamically.
func (c *Client) RequestAuthenticated(ctx context.Context, method string, params any) (ResponseFrame, error) {
	if c.auth == nil {
		return ResponseFrame{}, ErrAuthenticationRequired
	}
	return c.request(ctx, method, params)
}

func (c *Client) request(ctx context.Context, method string, params any) (ResponseFrame, error) {
	if ctx == nil {
		ctx = context.Background()
	}
	if strings.TrimSpace(method) == "" {
		return ResponseFrame{}, errors.New("gemini websocket: request method is empty")
	}
	if requiresAuthentication(method, params) && c.auth == nil {
		return ResponseFrame{}, ErrAuthenticationRequired
	}
	if err := c.Connect(ctx); err != nil {
		return ResponseFrame{}, err
	}
	return c.requestConnected(ctx, method, params)
}

func requiresAuthentication(method string, params any) bool {
	method = strings.ToLower(strings.TrimSpace(method))
	if strings.HasPrefix(method, "order.") || strings.HasPrefix(method, "rfq.") {
		return true
	}
	if method != "subscribe" && method != "unsubscribe" {
		return false
	}

	// The protocol uses SUBSCRIBE/UNSUBSCRIBE for both public and private
	// feeds. Decode the params shape used by the wire protocol so a caller
	// cannot accidentally send an authenticated feed request through a public
	// client using the generic Request method.
	encoded, err := json.Marshal(params)
	if err != nil {
		// A malformed subscription payload must not become a way to bypass the
		// public/private boundary. The server will reject it anyway, so fail
		// closed before anything is sent on a public connection.
		return true
	}
	var streams []string
	if err := json.Unmarshal(encoded, &streams); err != nil {
		return true
	}
	for _, stream := range streams {
		stream = strings.ToLower(strings.TrimSpace(stream))
		for _, privatePrefix := range []string{
			"orders@",
			"balances@",
			"positions@",
			"settlements@",
			"requestforquote@",
		} {
			if strings.HasPrefix(stream, privatePrefix) {
				return true
			}
		}
	}
	return false
}

// requestConnected sends a request without attempting to establish a
// connection. Subscription and replay code uses this after it has already
// coordinated connection state, so it cannot recursively wait on the
// lifecycle gate while holding another subscription-operation lock.
func (c *Client) requestConnected(ctx context.Context, method string, params any) (ResponseFrame, error) {
	if ctx == nil {
		ctx = context.Background()
	}
	if strings.TrimSpace(method) == "" {
		return ResponseFrame{}, errors.New("gemini websocket: request method is empty")
	}

	id := globalReqID.Add(1)
	idString := strconv.FormatInt(id, 10)
	resultCh := make(chan requestResult, 1)
	if err := c.registerPending(idString, resultCh); err != nil {
		return ResponseFrame{}, err
	}

	frame := struct {
		ID     int64  `json:"id"`
		Method string `json:"method"`
		Params any    `json:"params,omitempty"`
	}{
		ID:     id,
		Method: method,
		Params: params,
	}
	if err := c.Send(ctx, frame); err != nil {
		c.removePending(idString)
		return ResponseFrame{}, err
	}

	select {
	case result := <-resultCh:
		return result.response, result.err
	case <-ctx.Done():
		c.removePending(idString)
		return ResponseFrame{}, ctx.Err()
	case <-c.doneChan:
		c.removePending(idString)
		return ResponseFrame{}, fmt.Errorf("%w: websocket client is closed", transport.ErrConnectionClosed)
	}
}

// registerPending admits a request only while the connection is still
// connected. It takes c.mu before pendingMu so connection failure can
// invalidate the lifecycle and drain pending requests without allowing a
// request to register in the gap between those operations.
func (c *Client) registerPending(id string, resultCh chan requestResult) error {
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.State() == StateClosed {
		return fmt.Errorf("%w: websocket connection closed", transport.ErrConnectionClosed)
	}
	if c.conn == nil || c.State() != StateConnected {
		return errors.New("gemini websocket: not connected")
	}
	c.pendingMu.Lock()
	if c.pending == nil {
		c.pending = make(map[string]chan requestResult)
	}
	c.pending[id] = resultCh
	c.pendingMu.Unlock()
	return nil
}

// Ping performs the public WebSocket ping method and waits for the server's
// response. Applications can use it as an explicit liveness check; automatic
// keepalive traffic is intentionally opt-in at the application layer.
func (c *Client) Ping(ctx context.Context) error {
	_, err := c.Request(ctx, string(OpPing), nil)
	return err
}

func (c *Client) removePending(id string) {
	c.pendingMu.Lock()
	delete(c.pending, id)
	c.pendingMu.Unlock()
}

func (c *Client) failPending(err error) {
	c.pendingMu.Lock()
	pending := c.pending
	c.pending = make(map[string]chan requestResult)
	c.pendingMu.Unlock()

	for _, resultCh := range pending {
		resultCh <- requestResult{err: err}
	}
}

func (c *Client) dispatchResponse(payload []byte) (bool, error) {
	var envelope struct {
		ID     json.RawMessage `json:"id"`
		Status *int            `json:"status"`
	}
	if err := json.Unmarshal(payload, &envelope); err != nil || len(envelope.ID) == 0 || envelope.Status == nil {
		return false, nil
	}

	responseID, idErr := decodeResponseID(envelope.ID)
	var response ResponseFrame
	if err := json.Unmarshal(payload, &response); err != nil {
		malformedErr := fmt.Errorf("%w: %v", ErrMalformedResponse, err)
		if idErr == nil {
			c.pendingMu.Lock()
			resultCh, ok := c.pending[responseID]
			if ok {
				delete(c.pending, responseID)
			}
			c.pendingMu.Unlock()
			if ok {
				resultCh <- requestResult{err: malformedErr}
			}
		} else {
			malformedErr = fmt.Errorf("%w: invalid response id: %v", ErrMalformedResponse, idErr)
		}
		return true, malformedErr
	}

	c.pendingMu.Lock()
	resultCh, ok := c.pending[response.ID]
	if ok {
		delete(c.pending, response.ID)
	}
	c.pendingMu.Unlock()
	if !ok {
		return true, nil
	}

	result := requestResult{response: response}
	if response.Status < http.StatusOK || response.Status >= http.StatusMultipleChoices {
		message := ""
		code := 0
		if response.Error != nil {
			message = response.Error.Message
			if message == "" {
				message = response.Error.Msg
			}
			code = response.Error.Code
		}
		result.err = &RequestError{
			ID:      response.ID,
			Status:  response.Status,
			Code:    code,
			Message: message,
		}
	}
	resultCh <- result
	return true, nil
}
