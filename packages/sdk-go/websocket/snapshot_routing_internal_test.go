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

func TestDispatchSymbolLessSnapshotDoesNotBecomeDifferentialBaseline(t *testing.T) {
	client := NewClient("wss://ws.sandbox.gemini.com")
	client.state.Store(int32(StateConnected))

	partial := newSubscription[OrderBookSnapshot](1)
	differential := newSubscription[DepthUpdate](1)
	client.subsMu.Lock()
	tables := client.subTables.Load().clone()
	tables.partialDepthSubs["BTCUSD"] = []*subscription[OrderBookSnapshot]{partial}
	tables.depthSubs["BTCUSD"] = []*subscription[DepthUpdate]{differential}
	client.subTables.Store(tables)
	client.subsMu.Unlock()

	stop := make(chan struct{})
	const snapshot = `{"lastUpdateId":7,"bids":[["100","1"]],"asks":[]}`
	if handled, err := client.dispatchOrderBookSnapshot(stop, []byte(snapshot), 1, tables); !handled || err != nil {
		t.Fatalf("dispatchOrderBookSnapshot() = handled %t, error %v", handled, err)
	}
	select {
	case got := <-partial.ch:
		if got.Symbol != "BTCUSD" || got.LastUpdateID != 7 {
			t.Fatalf("unexpected partial snapshot: %+v", got)
		}
	case <-time.After(time.Second):
		t.Fatal("timed out waiting for partial snapshot")
	}
	select {
	case got := <-differential.ch:
		t.Fatalf("partial snapshot was delivered as differential update: %+v", got)
	default:
	}
	client.Close()
}
