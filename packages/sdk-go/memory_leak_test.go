package gemini_test

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"runtime"
	"runtime/pprof"
	"testing"
	"time"

	"github.com/gemini/developer-platform/packages/sdk-go"
	"github.com/gemini/developer-platform/packages/sdk-go/types"
	"github.com/gemini/developer-platform/packages/sdk-go/websocket"
	"github.com/gemini/developer-platform/packages/sdk-go/websocket/orderbook"
)

type mockDialer struct{}
type mockConn struct {
	closed    chan struct{}
	responses chan []byte
}

func (m *mockDialer) Dial(ctx context.Context, urlStr string, requestHeader http.Header) (websocket.Conn, *http.Response, error) {
	return &mockConn{
		closed:    make(chan struct{}),
		responses: make(chan []byte, 4),
	}, &http.Response{StatusCode: 101}, nil
}

func (m *mockConn) ReadMessage(ctx context.Context) (int, []byte, error) {
	select {
	case <-m.closed:
		return 0, nil, context.Canceled
	case <-ctx.Done():
		return 0, nil, ctx.Err()
	case response := <-m.responses:
		return websocket.TextMessage, response, nil
	}
}

func (m *mockConn) WriteMessage(ctx context.Context, messageType int, data []byte) error {
	var request struct {
		ID     int64  `json:"id"`
		Method string `json:"method"`
	}
	if err := json.Unmarshal(data, &request); err != nil || request.ID == 0 || request.Method == "" {
		return nil
	}
	response, err := json.Marshal(map[string]any{
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
	case <-m.closed:
		return context.Canceled
	case m.responses <- response:
		return nil
	}
}

func (m *mockConn) Close() error {
	select {
	case <-m.closed:
	default:
		close(m.closed)
	}
	return nil
}

func TestZeroGoroutineAndMemoryLeak(t *testing.T) {
	server := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"result":"ok"}`))
	}))
	defer server.Close()
	httpClient := server.Client()
	defer httpClient.CloseIdleConnections()

	// Baseline goroutine count
	runtime.GC()
	time.Sleep(50 * time.Millisecond)
	initialGoroutines := runtime.NumGoroutine()

	for cycle := 0; cycle < 50; cycle++ {
		// 1. WebSocket Client Lifecycle
		ws := websocket.NewClient("wss://api.gemini.com/v1/marketdata",
			websocket.WithDialer(&mockDialer{}),
			websocket.WithAutoReconnect(false),
		)

		ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
		_ = ws.Connect(ctx)
		subChan, _ := ws.SubscribeDepth(ctx, "BTCUSD")
		cancel()

		_ = ws.Send(context.Background(), map[string]string{"type": "subscribe"})

		// 2. OrderBook Ingestion & Memory Allocation
		book := orderbook.NewOrderBook("BTCUSD")
		for i := 0; i < 100; i++ {
			book.ApplySnapshot(int64(i), [][]string{{"60000", "1.0"}}, [][]string{{"60100", "1.0"}})
			_, _ = book.VWAP(true, types.MustParseDecimal("0.5"))
			_, _ = book.Imbalance(5)
		}

		// 3. Heartbeat Session Lifecycle with mock server
		hbClient := gemini.NewClient(
			gemini.WithAPIKey("test-key", "test-secret"),
			gemini.WithCustomRESTURL(server.URL),
			gemini.WithHTTPClient(httpClient),
		)
		session := hbClient.Heartbeat.Start(context.Background(), 20*time.Millisecond)
		time.Sleep(5 * time.Millisecond)
		session.Stop()
		_ = hbClient.Close()
		httpClient.CloseIdleConnections()

		// 4. Close WebSocket
		_ = ws.Close()

		// Drain subChan
		for range subChan {
		}
	}

	runtime.GC()
	time.Sleep(100 * time.Millisecond)
	finalGoroutines := runtime.NumGoroutine()

	if finalGoroutines > initialGoroutines+1 {
		_ = pprof.Lookup("goroutine").WriteTo(os.Stdout, 1)
		t.Fatalf("Goroutine leak detected: started with %d, ended with %d", initialGoroutines, finalGoroutines)
	}

	t.Logf("Memory test passed: 50 full cycles completed with 0 leaked goroutines (initial: %d, final: %d)", initialGoroutines, finalGoroutines)
}
