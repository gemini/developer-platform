package services

import (
	"testing"

	"github.com/gemini/developer-platform/packages/sdk-go/websocket"
)

func TestEnqueuePendingOrderEventHasHardLimit(t *testing.T) {
	pending := make([]*websocket.OrderEvent, 0, 64)
	keys := make(map[orderEventKey]struct{}, 64)
	for i := 0; i < maxPendingOrderEvents; i++ {
		var queued bool
		pending, queued = enqueuePendingOrderEvent(pending, keys, &websocket.OrderEvent{
			EventTime: int64(i),
			OrderID:   100,
		})
		if !queued {
			t.Fatalf("event %d was rejected before the queue reached its limit", i)
		}
	}
	if len(pending) != maxPendingOrderEvents {
		t.Fatalf("queued %d events, want %d", len(pending), maxPendingOrderEvents)
	}

	duplicate := pending[len(pending)-1]
	var queued bool
	pending, queued = enqueuePendingOrderEvent(pending, keys, duplicate)
	if !queued || len(pending) != maxPendingOrderEvents {
		t.Fatalf("duplicate event should not grow or overflow the queue: queued=%t len=%d", queued, len(pending))
	}

	_, queued = enqueuePendingOrderEvent(pending, keys, &websocket.OrderEvent{EventTime: maxPendingOrderEvents, OrderID: 100})
	if queued {
		t.Fatal("event beyond the hard queue limit was accepted")
	}
}
