package ws

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gorilla/websocket"
)

func TestDepthSnapshotSubscribesAndParsesFirstSnapshot(t *testing.T) {
	const streamName = "GEMI-TEST@depth10"

	reqCh := make(chan Request, 1)
	upgrader := websocket.Upgrader{}
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		conn, err := upgrader.Upgrade(w, r, nil)
		if err != nil {
			t.Errorf("Upgrade() error = %v", err)
			return
		}
		defer conn.Close()

		var req Request
		if err := conn.ReadJSON(&req); err != nil {
			t.Errorf("ReadJSON() error = %v", err)
			return
		}
		reqCh <- req

		if err := conn.WriteJSON(map[string]any{
			"id":     req.ID,
			"status": 200,
		}); err != nil {
			t.Errorf("WriteJSON(subscribe ack) error = %v", err)
			return
		}

		if err := conn.WriteJSON(map[string]any{
			"stream": streamName,
			"data": map[string]any{
				"bids": []map[string]any{{"price": "0.62", "amount": "100"}},
				"asks": []map[string]any{{"price": "0.65", "amount": "25"}},
			},
		}); err != nil {
			t.Errorf("WriteJSON() error = %v", err)
			return
		}
	}))
	defer server.Close()

	mgr := NewConnectionManager(ManagerConfig{
		URL: "ws" + strings.TrimPrefix(server.URL, "http"),
	})
	defer mgr.Close()

	book, err := mgr.DepthSnapshot(context.Background(), "GEMI-TEST", 10)
	if err != nil {
		t.Fatalf("DepthSnapshot() error = %v", err)
	}

	req := <-reqCh
	if req.Method != "subscribe" {
		t.Fatalf("subscription method = %q, want subscribe", req.Method)
	}
	var streams []string
	if err := json.Unmarshal(req.Params, &streams); err != nil {
		t.Fatalf("Unmarshal subscription params error = %v", err)
	}
	if len(streams) != 1 || streams[0] != streamName {
		t.Fatalf("subscription params = %#v, want [%s]", streams, streamName)
	}
	if len(book.Bids) != 1 || book.Bids[0].Price != "0.62" || book.Bids[0].Amount != "100" {
		t.Fatalf("unexpected bids: %#v", book.Bids)
	}
	if len(book.Asks) != 1 || book.Asks[0].Price != "0.65" || book.Asks[0].Amount != "25" {
		t.Fatalf("unexpected asks: %#v", book.Asks)
	}
}

func TestParseDepthSnapshotObjectLevels(t *testing.T) {
	book, err := parseDepthSnapshot(json.RawMessage(`{
		"bids":[{"price":"0.62","amount":"100"}],
		"asks":[{"price":"0.65","amount":"25"}]
	}`))
	if err != nil {
		t.Fatalf("parseDepthSnapshot() error = %v", err)
	}
	if len(book.Bids) != 1 || book.Bids[0].Price != "0.62" || book.Bids[0].Amount != "100" {
		t.Fatalf("unexpected bids: %#v", book.Bids)
	}
	if len(book.Asks) != 1 || book.Asks[0].Price != "0.65" || book.Asks[0].Amount != "25" {
		t.Fatalf("unexpected asks: %#v", book.Asks)
	}
}

func TestParseDepthSnapshotArrayLevels(t *testing.T) {
	book, err := parseDepthSnapshot(json.RawMessage(`{
		"b":[["0.62","100"]],
		"a":[["0.65","25"]]
	}`))
	if err != nil {
		t.Fatalf("parseDepthSnapshot() error = %v", err)
	}
	if len(book.Bids) != 1 || book.Bids[0].Price != "0.62" || book.Bids[0].Amount != "100" {
		t.Fatalf("unexpected bids: %#v", book.Bids)
	}
	if len(book.Asks) != 1 || book.Asks[0].Price != "0.65" || book.Asks[0].Amount != "25" {
		t.Fatalf("unexpected asks: %#v", book.Asks)
	}
}

func TestParseDepthSnapshotGeminiEvents(t *testing.T) {
	book, err := parseDepthSnapshot(json.RawMessage(`{
		"type":"update",
		"events":[
			{"type":"change","side":"bid","price":"0.62","remaining":"100"},
			{"type":"change","side":"ask","price":"0.65","remaining":"25"}
		]
	}`))
	if err != nil {
		t.Fatalf("parseDepthSnapshot() error = %v", err)
	}
	if len(book.Bids) != 1 || book.Bids[0].Price != "0.62" || book.Bids[0].Amount != "100" {
		t.Fatalf("unexpected bids: %#v", book.Bids)
	}
	if len(book.Asks) != 1 || book.Asks[0].Price != "0.65" || book.Asks[0].Amount != "25" {
		t.Fatalf("unexpected asks: %#v", book.Asks)
	}
}
