package websocket_test

import (
	"context"
	"encoding/json"
	"testing"
	"time"

	"github.com/gemini/gemini-go/auth"
	"github.com/gemini/gemini-go/websocket"
)

func TestTypedPublicDepthOptionsUseDocumentedStreams(t *testing.T) {
	dialer := &mockDrainDialer{}
	client := websocket.NewPublicClient("wss://ws.gemini.com", websocket.WithDialer(dialer))
	defer client.Close()

	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()

	depth, err := client.SubscribeDepthWithOptions(ctx, "BTCUSD", websocket.DepthSubscriptionOptions{
		Interval: 100 * time.Millisecond,
	})
	if err != nil {
		t.Fatalf("SubscribeDepthWithOptions failed: %v", err)
	}
	partial, err := client.SubscribePartialDepth(ctx, "ETHUSD", websocket.PartialDepthSubscriptionOptions{
		Levels:   websocket.DepthLevel20,
		Interval: 100 * time.Millisecond,
	})
	if err != nil {
		t.Fatalf("SubscribePartialDepth failed: %v", err)
	}

	writes := writtenFrames(dialer.latestConn())
	assertSubscribeFrame(t, writes[0], "btcusd@depth@100ms")
	assertSubscribeFrame(t, writes[1], "ethusd@depth20@100ms")

	dialer.latestConn().feedServerMsg([]byte(`{"lastUpdateId":42,"symbol":"ETHUSD","bids":[["10","2"]],"asks":[["11","3"]]}`))
	select {
	case snapshot := <-partial:
		if snapshot.Symbol != "ETHUSD" || snapshot.LastUpdateID != 42 || len(snapshot.Bids) != 1 || len(snapshot.Asks) != 1 {
			t.Fatalf("unexpected partial-depth snapshot: %+v", snapshot)
		}
	case <-time.After(time.Second):
		t.Fatal("timed out waiting for partial-depth snapshot")
	}

	dialer.latestConn().feedServerMsg([]byte(`{"e":"depthUpdate","s":"BTCUSD","U":41,"u":42,"b":[["10","2"]],"a":[]}`))
	select {
	case update := <-depth:
		if update.Symbol != "BTCUSD" || update.LastUpdateID != 42 {
			t.Fatalf("unexpected differential-depth update: %+v", update)
		}
	case <-time.After(time.Second):
		t.Fatal("timed out waiting for differential-depth update")
	}
}

func TestTypedDepthSnapshotUsesDocumentedRequestAndDecodesResult(t *testing.T) {
	dialer := &mockDrainDialer{
		responseResult: json.RawMessage(`{"lastUpdateId":9,"bids":[["10","2"]],"asks":[["11","3"]]}`),
	}
	client := websocket.NewPublicClient("wss://ws.gemini.com", websocket.WithDialer(dialer))
	defer client.Close()

	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()
	snapshot, err := client.GetDepthSnapshot(ctx, "BTCUSD", websocket.DepthSnapshotOptions{Limit: 20})
	if err != nil {
		t.Fatalf("GetDepthSnapshot failed: %v", err)
	}
	if snapshot.LastUpdateID != 9 || len(snapshot.Bids) != 1 || len(snapshot.Asks) != 1 {
		t.Fatalf("unexpected depth snapshot: %+v", snapshot)
	}

	writes := writtenFrames(dialer.latestConn())
	if len(writes) != 1 {
		t.Fatalf("expected one depth request, got %d", len(writes))
	}
	var frame struct {
		Method string `json:"method"`
		Params struct {
			Symbol string `json:"symbol"`
			Limit  int    `json:"limit"`
		} `json:"params"`
	}
	if err := json.Unmarshal(writes[0], &frame); err != nil {
		t.Fatalf("decode depth request: %v", err)
	}
	if frame.Method != "depth" || frame.Params.Symbol != "btcusd" || frame.Params.Limit != 20 {
		t.Fatalf("unexpected depth request: %s", writes[0])
	}
}

func TestTypedPrivateOptionsUseDocumentedScopesAndIntervals(t *testing.T) {
	dialer := &mockDrainDialer{}
	client := websocket.NewPrivateClient(
		"wss://ws.gemini.com",
		auth.NewHMAC("key", "secret"),
		websocket.WithDialer(dialer),
	)
	defer client.Close()

	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()

	orders, err := client.SubscribeOrderEventsWithScope(ctx, websocket.ScopeSession)
	if err != nil {
		t.Fatalf("SubscribeOrderEventsWithScope failed: %v", err)
	}
	balances, err := client.SubscribeBalancesWithOptions(ctx, websocket.AccountStreamOptions{Interval: time.Second})
	if err != nil {
		t.Fatalf("SubscribeBalancesWithOptions failed: %v", err)
	}
	positions, err := client.SubscribePositionsWithOptions(ctx, websocket.AccountStreamOptions{Interval: time.Second})
	if err != nil {
		t.Fatalf("SubscribePositionsWithOptions failed: %v", err)
	}
	if _, err := client.SubscribeSettlements(ctx); err != nil {
		t.Fatalf("SubscribeSettlements failed: %v", err)
	}

	writes := writtenFrames(dialer.latestConn())
	assertSubscribeFrame(t, writes[0], "orders@session")
	assertSubscribeFrame(t, writes[1], "balances@account@1s")
	assertSubscribeFrame(t, writes[2], "positions@account@1s")
	assertSubscribeFrame(t, writes[3], "settlements@account")

	dialer.latestConn().feedServerMsg([]byte(`{"e":"orderUpdate","s":"GEMI-X","i":7,"X":"NEW"}`))
	select {
	case event := <-orders:
		if event.OrderID != 7 || event.Symbol != "GEMI-X" {
			t.Fatalf("unexpected session order event: %+v", event)
		}
	case <-time.After(time.Second):
		t.Fatal("timed out waiting for session order event")
	}

	dialer.latestConn().feedServerMsg([]byte(`{"e":"balanceUpdate","E":1,"u":2,"B":[]}`))
	select {
	case update := <-balances:
		if update.EventType != "balanceUpdate" || update.UpdateTime != 2 {
			t.Fatalf("unexpected balance update: %+v", update)
		}
	case <-time.After(time.Second):
		t.Fatal("timed out waiting for balance update")
	}

	dialer.latestConn().feedServerMsg([]byte(`{"e":"positionReport","E":1,"u":2,"A":3,"P":[]}`))
	select {
	case report := <-positions:
		if report.EventType != "positionReport" || report.AccountID != 3 {
			t.Fatalf("unexpected position report: %+v", report)
		}
	case <-time.After(time.Second):
		t.Fatal("timed out waiting for position report")
	}
}

func TestTypedSubscriptionOptionsRejectUnsupportedValues(t *testing.T) {
	client := websocket.NewPublicClient("wss://ws.gemini.com")
	defer client.Close()

	ctx := context.Background()
	if _, err := client.SubscribeDepthWithOptions(ctx, "BTCUSD", websocket.DepthSubscriptionOptions{Interval: time.Second}); err == nil {
		t.Fatal("expected invalid differential-depth interval to fail")
	}
	if _, err := client.SubscribePartialDepth(ctx, "BTCUSD", websocket.PartialDepthSubscriptionOptions{Levels: 25}); err == nil {
		t.Fatal("expected invalid partial-depth level to fail")
	}
	if _, err := client.SubscribeBalancesWithOptions(ctx, websocket.AccountStreamOptions{Interval: 2 * time.Second}); err == nil {
		t.Fatal("expected invalid account-stream interval to fail")
	}
	if _, err := client.SubscribeOrderEventsWithScope(ctx, websocket.SubscriptionScope("invalid")); err == nil {
		t.Fatal("expected invalid order scope to fail")
	}
}

func TestTypedDepthVariantsDoNotShareAnAmbiguousSymbol(t *testing.T) {
	dialer := &mockDrainDialer{}
	client := websocket.NewPublicClient("wss://ws.gemini.com", websocket.WithDialer(dialer))
	defer client.Close()

	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()
	if _, err := client.SubscribeDepth(ctx, "BTCUSD"); err != nil {
		t.Fatalf("SubscribeDepth failed: %v", err)
	}
	if _, err := client.SubscribeDepthWithOptions(ctx, "BTCUSD", websocket.DepthSubscriptionOptions{Interval: 100 * time.Millisecond}); err == nil {
		t.Fatal("expected conflicting depth variant to fail")
	}
	if _, err := client.SubscribeDepthWithOptions(ctx, "ETHUSD", websocket.DepthSubscriptionOptions{Interval: 100 * time.Millisecond}); err != nil {
		t.Fatalf("depth gate was not released after conflict: %v", err)
	}
}

func writtenFrames(conn *mockDrainConn) [][]byte {
	conn.mu.Lock()
	defer conn.mu.Unlock()
	frames := make([][]byte, len(conn.written))
	for i, frame := range conn.written {
		frames[i] = append([]byte(nil), frame...)
	}
	return frames
}

func assertSubscribeFrame(t *testing.T, payload []byte, stream string) {
	t.Helper()
	var frame struct {
		Method string   `json:"method"`
		Params []string `json:"params"`
	}
	if err := json.Unmarshal(payload, &frame); err != nil {
		t.Fatalf("decode request %q: %v", payload, err)
	}
	if frame.Method != "SUBSCRIBE" || len(frame.Params) != 1 || frame.Params[0] != stream {
		t.Fatalf("unexpected subscribe frame: %s", payload)
	}
}
