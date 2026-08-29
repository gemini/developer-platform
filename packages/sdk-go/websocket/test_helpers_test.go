package websocket_test

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"sync"

	"github.com/gemini/developer-platform/packages/sdk-go/websocket"
)

// mockDrainDialer is the deterministic in-memory transport used by lifecycle
// and subscription contract tests. It acknowledges method requests so tests
// exercise the same request/response path as the real server.
type mockDrainDialer struct {
	mu               sync.Mutex
	connections      []*mockDrainConn
	urls             []string
	headers          []http.Header
	responseStatus   int
	responseStatuses []int
	responseMessage  string
	responseResult   json.RawMessage
}

type mockDrainConn struct {
	mu              sync.Mutex
	closed          bool
	closedChan      chan struct{}
	readChan        chan []byte
	written         [][]byte
	writeErr        error
	responseStatus  int
	responseMessage string
	responseResult  json.RawMessage
}

func (m *mockDrainConn) feedServerMsg(msg []byte) {
	select {
	case <-m.closedChan:
	case m.readChan <- msg:
	}
}

func (m *mockDrainConn) ReadMessage(ctx context.Context) (int, []byte, error) {
	select {
	case <-ctx.Done():
		return 0, nil, ctx.Err()
	case <-m.closedChan:
		return 0, nil, errors.New("connection reset by peer (server deploy drain)")
	case msg := <-m.readChan:
		return websocket.TextMessage, msg, nil
	}
}

func (m *mockDrainConn) WriteMessage(ctx context.Context, _ int, payload []byte) error {
	m.mu.Lock()
	if m.writeErr != nil {
		err := m.writeErr
		m.mu.Unlock()
		return err
	}
	m.written = append(m.written, append([]byte(nil), payload...))
	status := m.responseStatus
	if status == 0 {
		status = http.StatusOK
	}
	responseMessage := m.responseMessage
	responseResult := append(json.RawMessage(nil), m.responseResult...)
	m.mu.Unlock()

	var request struct {
		ID     int64  `json:"id"`
		Method string `json:"method"`
	}
	if err := json.Unmarshal(payload, &request); err != nil || request.ID == 0 || request.Method == "" {
		return nil
	}

	response := map[string]any{
		"id":     request.ID,
		"status": status,
	}
	if status >= http.StatusBadRequest {
		response["error"] = map[string]any{"code": status, "message": responseMessage}
	} else {
		if len(responseResult) > 0 {
			var result any
			if err := json.Unmarshal(responseResult, &result); err == nil {
				response["result"] = result
			} else {
				response["result"] = map[string]any{}
			}
		} else {
			response["result"] = map[string]any{}
		}
	}
	ack, _ := json.Marshal(response)
	select {
	case <-ctx.Done():
		return ctx.Err()
	case <-m.closedChan:
		return errors.New("connection closed")
	case m.readChan <- ack:
		return nil
	}
}

func (m *mockDrainConn) Close() error {
	m.mu.Lock()
	defer m.mu.Unlock()
	if !m.closed {
		m.closed = true
		close(m.closedChan)
	}
	return nil
}

func (d *mockDrainDialer) Dial(_ context.Context, url string, headers http.Header) (websocket.Conn, *http.Response, error) {
	d.mu.Lock()
	defer d.mu.Unlock()
	d.urls = append(d.urls, url)
	d.headers = append(d.headers, headers.Clone())
	responseStatus := d.responseStatus
	if len(d.responseStatuses) > len(d.connections) {
		responseStatus = d.responseStatuses[len(d.connections)]
	}
	conn := &mockDrainConn{
		closedChan:      make(chan struct{}),
		readChan:        make(chan []byte, 512),
		responseStatus:  responseStatus,
		responseMessage: d.responseMessage,
		responseResult:  append(json.RawMessage(nil), d.responseResult...),
	}
	d.connections = append(d.connections, conn)
	return conn, &http.Response{StatusCode: http.StatusSwitchingProtocols}, nil
}

func (d *mockDrainDialer) lastURL() string {
	d.mu.Lock()
	defer d.mu.Unlock()
	if len(d.urls) == 0 {
		return ""
	}
	return d.urls[len(d.urls)-1]
}

func (d *mockDrainDialer) latestConn() *mockDrainConn {
	d.mu.Lock()
	defer d.mu.Unlock()
	if len(d.connections) == 0 {
		return nil
	}
	return d.connections[len(d.connections)-1]
}

func (d *mockDrainDialer) latestHeaders() http.Header {
	d.mu.Lock()
	defer d.mu.Unlock()
	if len(d.headers) == 0 {
		return nil
	}
	return d.headers[len(d.headers)-1].Clone()
}

func (d *mockDrainDialer) connCount() int {
	d.mu.Lock()
	defer d.mu.Unlock()
	return len(d.connections)
}

type interruptibleConn struct {
	closeOnce    sync.Once
	closed       chan struct{}
	readStarted  chan struct{}
	writeStarted chan struct{}
}

func newInterruptibleConn() *interruptibleConn {
	return &interruptibleConn{
		closed:       make(chan struct{}),
		readStarted:  make(chan struct{}),
		writeStarted: make(chan struct{}),
	}
}

func (c *interruptibleConn) ReadMessage(ctx context.Context) (int, []byte, error) {
	select {
	case <-c.readStarted:
	default:
		close(c.readStarted)
	}
	select {
	case <-c.closed:
		return 0, nil, errors.New("connection closed")
	case <-ctx.Done():
		return 0, nil, ctx.Err()
	}
}

func (c *interruptibleConn) WriteMessage(ctx context.Context, _ int, _ []byte) error {
	select {
	case <-c.writeStarted:
	default:
		close(c.writeStarted)
	}
	select {
	case <-c.closed:
		return errors.New("connection closed")
	case <-ctx.Done():
		return ctx.Err()
	}
}

func (c *interruptibleConn) Close() error {
	c.closeOnce.Do(func() { close(c.closed) })
	return nil
}

type interruptibleDialer struct {
	conn    *interruptibleConn
	started chan struct{}
}

func (d *interruptibleDialer) Dial(ctx context.Context, _ string, _ http.Header) (websocket.Conn, *http.Response, error) {
	select {
	case <-d.started:
	default:
		close(d.started)
	}
	select {
	case <-ctx.Done():
		return nil, nil, ctx.Err()
	case <-d.conn.closed:
		return nil, nil, errors.New("dialer closed")
	}
}

type singleConnDialer struct {
	conn *interruptibleConn
}

func (d *singleConnDialer) Dial(context.Context, string, http.Header) (websocket.Conn, *http.Response, error) {
	return d.conn, &http.Response{StatusCode: http.StatusSwitchingProtocols}, nil
}

type errorConnDialer struct {
	conn *silentConn
}

func (d *errorConnDialer) Dial(context.Context, string, http.Header) (websocket.Conn, *http.Response, error) {
	return d.conn, nil, errors.New("dial failed after allocating connection")
}

type silentConn struct {
	closeOnce    sync.Once
	closed       chan struct{}
	writeStarted chan struct{}
}

func newSilentConn() *silentConn {
	return &silentConn{
		closed:       make(chan struct{}),
		writeStarted: make(chan struct{}),
	}
}

func (c *silentConn) ReadMessage(ctx context.Context) (int, []byte, error) {
	select {
	case <-c.closed:
		return 0, nil, errors.New("connection closed")
	case <-ctx.Done():
		return 0, nil, ctx.Err()
	}
}

func (c *silentConn) WriteMessage(context.Context, int, []byte) error {
	select {
	case <-c.writeStarted:
	default:
		close(c.writeStarted)
	}
	return nil
}

func (c *silentConn) Close() error {
	c.closeOnce.Do(func() { close(c.closed) })
	return nil
}

type silentDialer struct {
	conn *silentConn
}

func (d *silentDialer) Dial(context.Context, string, http.Header) (websocket.Conn, *http.Response, error) {
	return d.conn, &http.Response{StatusCode: http.StatusSwitchingProtocols}, nil
}
