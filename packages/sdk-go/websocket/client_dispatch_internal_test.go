package websocket

import (
	"errors"
	"testing"
	"time"
)

func TestDispatchFrame_OrderUpdateWithTradeIDRemainsOrderEvent(t *testing.T) {
	client := NewClient("wss://ws.gemini.com")
	client.state.Store(int32(StateConnected))
	orderSub := newSubscription[OrderEvent](1)
	client.subsMu.Lock()
	tables := client.subTables.Load().clone()
	tables.orderSubs = map[string][]*subscription[OrderEvent]{"orders@account": {orderSub}}
	client.subTables.Store(tables)
	client.subsMu.Unlock()

	client.dispatchFrame(make(chan struct{}), []byte(`{"e":"orderUpdate","s":"BTCUSD","t":777,"i":12345,"S":"BUY","X":"NEW"}`), 0)
	select {
	case event := <-orderSub.ch:
		if event.EventType != "orderUpdate" || event.TradeID != 777 || event.OrderID != 12345 {
			t.Fatalf("unexpected order event: %+v", event)
		}
	case <-time.After(time.Second):
		t.Fatal("order update was not dispatched")
	}
}

func TestDispatchFrame_DoesNotApplyNewSnapshotToQueuedOldFrame(t *testing.T) {
	client := NewClient("wss://ws.gemini.com")
	client.state.Store(int32(StateConnected))
	client.snapshotMode = true
	sub := newSubscription[DepthUpdate](2)
	client.subsMu.Lock()
	tables := client.subTables.Load().clone()
	tables.depthSubs["BTCUSD"] = []*subscription[DepthUpdate]{sub}
	client.subTables.Store(tables)
	client.snapshotPending["BTCUSD"] = 2
	client.subsMu.Unlock()

	stop := make(chan struct{})
	client.dispatchFrame(stop, []byte(`{"e":"depthUpdate","s":"BTCUSD","U":1,"u":1,"b":[],"a":[]}`), 1)
	client.dispatchFrame(stop, []byte(`{"e":"depthUpdate","s":"BTCUSD","U":2,"u":2,"b":[],"a":[]}`), 2)

	first := <-sub.ch
	second := <-sub.ch
	if first.Snapshot {
		t.Fatal("queued old-generation depth event was incorrectly marked as a snapshot")
	}
	if !second.Snapshot {
		t.Fatal("new-generation depth event did not consume the pending snapshot marker")
	}
}

func TestDispatchResponse_FailsPendingRequestOnMalformedCorrelatedResponse(t *testing.T) {
	client := NewClient("wss://ws.gemini.com")
	resultCh := make(chan requestResult, 1)
	client.pendingMu.Lock()
	client.pending["7"] = resultCh
	client.pendingMu.Unlock()

	handled, err := client.dispatchResponse([]byte(`{"id":7,"status":200,"error":{"code":"not-an-integer"}}`))
	if !handled {
		t.Fatal("malformed correlated response was not recognized")
	}
	if !errors.Is(err, ErrMalformedResponse) {
		t.Fatalf("dispatchResponse error = %v, want ErrMalformedResponse", err)
	}
	select {
	case result := <-resultCh:
		if !errors.Is(result.err, ErrMalformedResponse) {
			t.Fatalf("pending request error = %v, want ErrMalformedResponse", result.err)
		}
	case <-time.After(time.Second):
		t.Fatal("pending request was not failed immediately")
	}
	client.pendingMu.Lock()
	defer client.pendingMu.Unlock()
	if _, ok := client.pending["7"]; ok {
		t.Fatal("malformed correlated response left the pending request registered")
	}
}
