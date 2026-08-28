package websocket

import (
	"testing"
	"time"
)

func TestDispatchSymbolLessSnapshotFencesOlderGeneration(t *testing.T) {
	client := NewClient("wss://ws.sandbox.gemini.com", WithSnapshot(-1))
	client.state.Store(int32(StateConnected))

	sub := newSubscription[DepthUpdate](1)
	client.subsMu.Lock()
	tables := client.subTables.Load().clone()
	tables.depthSubs["BTCUSD"] = []*subscription[DepthUpdate]{sub}
	client.subTables.Store(tables)
	client.snapshotPending["BTCUSD"] = 2
	client.subsMu.Unlock()

	stop := make(chan struct{})
	const snapshot = `{"lastUpdateId":7,"bids":[["100","1"]],"asks":[]}`
	client.dispatchFrame(stop, []byte(snapshot), 1)
	select {
	case update := <-sub.ch:
		t.Fatalf("older-generation snapshot was dispatched: %+v", update)
	default:
	}

	client.dispatchFrame(stop, []byte(snapshot), 2)
	select {
	case update := <-sub.ch:
		if update.Symbol != "BTCUSD" || update.LastUpdateID != 7 || !update.Snapshot {
			t.Fatalf("unexpected current-generation snapshot: %+v", update)
		}
	case <-time.After(time.Second):
		t.Fatal("timed out waiting for current-generation snapshot")
	}
	client.Close()
}
