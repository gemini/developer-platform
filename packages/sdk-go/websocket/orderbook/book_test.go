package orderbook

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/gemini/gemini-go/transport"
	"github.com/gemini/gemini-go/types"
	"github.com/gemini/gemini-go/websocket"
)

func TestOrderBook_LevelsAndBBO(t *testing.T) {
	book := NewOrderBook("BTCUSD")

	rawBids := [][]string{
		{"64000.00", "1.2"},
		{"64500.00", "0.5"},
		{"63900.00", "2.0"},
	}
	rawAsks := [][]string{
		{"65000.00", "1.0"},
		{"64800.00", "0.8"},
		{"65200.00", "3.0"},
	}

	book.ApplySnapshot(100, rawBids, rawAsks)

	bestBid, ok := book.BestBid()
	if !ok || bestBid.Price != "64500.00" || bestBid.Amount != "0.5" {
		t.Fatalf("expected best bid 64500.00 @ 0.5, got %+v", bestBid)
	}

	bestAsk, ok := book.BestAsk()
	if !ok || bestAsk.Price != "64800.00" || bestAsk.Amount != "0.8" {
		t.Fatalf("expected best ask 64800.00 @ 0.8, got %+v", bestAsk)
	}

	spread, ok := book.Spread()
	if !ok || spread != 300.00 {
		t.Fatalf("expected spread 300.00, got %f", spread)
	}

	mid, ok := book.Mid()
	if !ok || mid != 64650.00 {
		t.Fatalf("expected mid 64650.00, got %f", mid)
	}

	// Update best bid
	book.ApplyLevel(true, "64600.00", "1.5")
	bestBid, _ = book.BestBid()
	if bestBid.Price != "64600.00" {
		t.Errorf("expected updated best bid 64600.00, got %s", bestBid.Price)
	}

	// Delete level with 0 amount
	book.ApplyLevel(true, "64600.00", "0")
	bestBid, _ = book.BestBid()
	if bestBid.Price != "64500.00" {
		t.Errorf("expected best bid back to 64500.00 after deletion, got %s", bestBid.Price)
	}
}

func TestLiveOrderBook_RejectsMismatchedSymbols(t *testing.T) {
	liveBook := NewLiveOrderBook("BTCUSD")

	err := liveBook.ApplySnapshot(&websocket.OrderBookSnapshot{
		Symbol:       "ETHUSD",
		LastUpdateID: 1,
		Bids:         [][]string{{"100", "1"}},
	})
	if !errors.Is(err, ErrSymbolMismatch) {
		t.Fatalf("expected snapshot symbol mismatch, got %v", err)
	}

	err = liveBook.IngestDiff(&websocket.DepthUpdate{
		Symbol:        "ETHUSD",
		FirstUpdateID: 1,
		LastUpdateID:  1,
	})
	if !errors.Is(err, ErrSymbolMismatch) {
		t.Fatalf("expected diff symbol mismatch, got %v", err)
	}
}

func TestOrderBook_UsesExactPricesForLevelIdentity(t *testing.T) {
	book := NewOrderBook("BTCUSD")
	if err := book.ApplySnapshot(1,
		[][]string{{"10000000000000000.01", "1"}, {"10000000000000000.02", "2"}},
		[][]string{{"10000000000000000.03", "1"}},
	); err != nil {
		t.Fatalf("ApplySnapshot failed: %v", err)
	}

	bids := book.Bids(10)
	if len(bids) != 2 || bids[0].Price != "10000000000000000.02" || bids[1].Price != "10000000000000000.01" {
		t.Fatalf("expected exact descending price order, got %+v", bids)
	}
	if err := book.ApplyLevel(true, "10000000000000000.01", "3"); err != nil {
		t.Fatalf("ApplyLevel failed: %v", err)
	}
	bids = book.Bids(10)
	if len(bids) != 2 || bids[1].Amount != "3" {
		t.Fatalf("expected only the requested exact level to change, got %+v", bids)
	}
}

func TestOrderBook_RejectsMalformedUpdatesAtomically(t *testing.T) {
	book := NewOrderBook("BTCUSD")
	if err := book.ApplySnapshot(10, [][]string{{"65000", "1"}}, [][]string{{"65100", "1"}}); err != nil {
		t.Fatalf("initial snapshot failed: %v", err)
	}

	if err := book.ApplySnapshot(11, [][]string{{"65001", "."}}, [][]string{{"65101", "1"}}); err == nil {
		t.Fatal("expected malformed snapshot to fail")
	}
	if book.LastUpdateID() != 10 {
		t.Fatalf("malformed snapshot changed update ID to %d", book.LastUpdateID())
	}
	if bid, ok := book.BestBid(); !ok || bid.Price != "65000" || bid.Amount != "1" {
		t.Fatalf("malformed snapshot changed existing book: %+v", bid)
	}

	if err := book.ApplyDiff(11, [][]string{{"65000", "-1"}}, nil); err == nil {
		t.Fatal("expected negative amount diff to fail")
	}
	if book.LastUpdateID() != 10 {
		t.Fatalf("malformed diff changed update ID to %d", book.LastUpdateID())
	}
	if err := book.ApplyLevel(true, "65000", "0"); err != nil {
		t.Fatalf("zero amount should delete a level: %v", err)
	}
	if _, ok := book.BestBid(); ok {
		t.Fatal("expected zero amount update to delete the level")
	}
}

func TestOrderBook_RejectsInvalidSequenceIDs(t *testing.T) {
	book := NewOrderBook("BTCUSD")
	levels := [][]string{{"65000", "1"}}

	for _, sequenceID := range []int64{0, -1} {
		if err := book.ApplySnapshot(sequenceID, levels, nil); !errors.Is(err, ErrInvalidSequence) {
			t.Fatalf("ApplySnapshot(%d) error = %v, want ErrInvalidSequence", sequenceID, err)
		}
	}
	if err := book.ApplySnapshot(10, levels, nil); err != nil {
		t.Fatalf("initial snapshot failed: %v", err)
	}
	if err := book.ApplyDiff(9, [][]string{{"65000", "2"}}, nil); !errors.Is(err, ErrInvalidSequence) {
		t.Fatalf("retrograde ApplyDiff error = %v, want ErrInvalidSequence", err)
	}
	if book.LastUpdateID() != 10 {
		t.Fatalf("retrograde diff changed update ID to %d", book.LastUpdateID())
	}

	liveBook := NewLiveOrderBook("BTCUSD")
	err := liveBook.ApplySnapshot(&websocket.OrderBookSnapshot{
		LastUpdateID: 0,
		Bids:         levels,
	})
	if !errors.Is(err, ErrInvalidSequence) {
		t.Fatalf("live invalid snapshot error = %v, want ErrInvalidSequence", err)
	}
	if liveBook.IsLive() {
		t.Fatal("invalid snapshot incorrectly marked the live book as live")
	}
}

func TestLiveOrderBook_SequenceAndGaps(t *testing.T) {
	liveBook := NewLiveOrderBook("BTCUSD")

	// 1. Ingest diffs before snapshot (pre-buffering)
	_ = liveBook.IngestDiff(&websocket.DepthUpdate{
		FirstUpdateID: 101,
		LastUpdateID:  102,
		Bids:          [][]string{{"64600.00", "1.0"}},
	})

	if liveBook.IsLive() {
		t.Fatal("expected book not to be live before snapshot")
	}

	// 2. Ingest snapshot
	liveBook.ApplySnapshot(&websocket.OrderBookSnapshot{
		LastUpdateID: 100,
		Bids:         [][]string{{"64500.00", "0.5"}},
		Asks:         [][]string{{"64800.00", "0.8"}},
	})

	if !liveBook.IsLive() {
		t.Fatal("expected book to be live after snapshot and buffer flush")
	}

	bestBid, _ := liveBook.Book().BestBid()
	if bestBid.Price != "64600.00" {
		t.Fatalf("expected buffered diff applied, best bid 64600.00, got %s", bestBid.Price)
	}

	// 3. Ingest next contiguous diff
	err := liveBook.IngestDiff(&websocket.DepthUpdate{
		FirstUpdateID: 103,
		LastUpdateID:  105,
		Bids:          [][]string{{"64700.00", "2.0"}},
	})
	if err != nil {
		t.Fatalf("unexpected error on contiguous diff: %v", err)
	}
	if liveBook.Book().LastUpdateID() != 105 {
		t.Errorf("expected lastUpdateId 105, got %d", liveBook.Book().LastUpdateID())
	}

	// 4. Ingest GAP diff (FirstUpdateID 110 > 105 + 1)
	err = liveBook.IngestDiff(&websocket.DepthUpdate{
		FirstUpdateID: 110,
		LastUpdateID:  112,
		Bids:          [][]string{{"64800.00", "1.0"}},
	})

	if err == nil {
		t.Fatal("expected gap error, got nil")
	}
	if !errors.Is(err, transport.ErrResyncRequired) {
		t.Fatalf("expected errors.Is(err, ErrResyncRequired) to be true, got %v", err)
	}
	if liveBook.IsLive() {
		t.Fatal("expected book to be marked not live after gap")
	}
}

func TestOrderBook_EmptyBookEdgeCases(t *testing.T) {
	book := NewOrderBook("BTCUSD")

	if _, ok := book.BestBid(); ok {
		t.Error("expected BestBid to return false on empty book")
	}
	if _, ok := book.BestAsk(); ok {
		t.Error("expected BestAsk to return false on empty book")
	}
	if _, ok := book.Spread(); ok {
		t.Error("expected Spread to return false on empty book")
	}
	if _, ok := book.Mid(); ok {
		t.Error("expected Mid to return false on empty book")
	}
	if len(book.Bids(10)) != 0 || len(book.Asks(10)) != 0 {
		t.Error("expected 0 bids and asks on empty book")
	}

	book.ApplyLevel(true, "64000.00", "1.0")
	if _, ok := book.Spread(); ok {
		t.Error("expected Spread to return false when asks are empty")
	}
}

func TestLiveOrderBook_ResetAndResync(t *testing.T) {
	liveBook := NewLiveOrderBook("BTCUSD")

	// Apply snapshot
	liveBook.ApplySnapshot(&websocket.OrderBookSnapshot{
		LastUpdateID: 200,
		Bids:         [][]string{{"64000.00", "1.0"}},
		Asks:         [][]string{{"64100.00", "1.0"}},
	})
	if !liveBook.IsLive() {
		t.Fatal("expected book to be live")
	}

	// Trigger manual reset (e.g. on disconnect/reconnect)
	liveBook.Reset()
	if liveBook.IsLive() {
		t.Fatal("expected book not to be live after Reset()")
	}
	if liveBook.Book().LastUpdateID() != 0 {
		t.Fatalf("expected Reset to clear last update ID, got %d", liveBook.Book().LastUpdateID())
	}
	if _, ok := liveBook.Book().BestBid(); ok {
		t.Fatal("expected Reset to clear stale bid levels")
	}

	// Apply fresh snapshot
	liveBook.ApplySnapshot(&websocket.OrderBookSnapshot{
		LastUpdateID: 300,
		Bids:         [][]string{{"64200.00", "2.0"}},
		Asks:         [][]string{{"64300.00", "2.0"}},
	})
	if !liveBook.IsLive() {
		t.Fatal("expected book to be live after fresh snapshot")
	}
	if liveBook.Book().LastUpdateID() != 300 {
		t.Errorf("expected LastUpdateID 300, got %d", liveBook.Book().LastUpdateID())
	}
}

func TestLiveOrderBook_RejectsInvalidSequenceAndBounds(t *testing.T) {
	liveBook := NewLiveOrderBook("BTCUSD")
	if err := liveBook.ApplySnapshot(&websocket.OrderBookSnapshot{
		LastUpdateID: 100,
		Bids:         [][]string{{"65000", "1"}},
		Asks:         [][]string{{"65100", "1"}},
	}); err != nil {
		t.Fatalf("snapshot failed: %v", err)
	}

	err := liveBook.IngestDiff(&websocket.DepthUpdate{
		FirstUpdateID: 101,
		LastUpdateID:  100,
	})
	if err == nil || !errors.Is(err, transport.ErrResyncRequired) {
		t.Fatalf("expected invalid bounds to require resync, got %v", err)
	}
	if liveBook.IsLive() {
		t.Fatal("expected invalid sequence to mark book non-live")
	}
}

func TestLiveOrderBook_BoundedPreSnapshotBuffer(t *testing.T) {
	liveBook := NewLiveOrderBook("BTCUSD")
	for i := 0; i < maxBufferedDiffs; i++ {
		if err := liveBook.IngestDiff(&websocket.DepthUpdate{
			FirstUpdateID: int64(i + 1),
			LastUpdateID:  int64(i + 2),
		}); err != nil {
			t.Fatalf("unexpected buffer error at %d: %v", i, err)
		}
	}
	if err := liveBook.IngestDiff(&websocket.DepthUpdate{FirstUpdateID: maxBufferedDiffs + 1, LastUpdateID: maxBufferedDiffs + 2}); err == nil {
		t.Fatal("expected pre-snapshot buffer overflow to require resync")
	} else if !errors.Is(err, transport.ErrResyncRequired) {
		t.Fatalf("expected ErrResyncRequired, got %v", err)
	}
}

func TestLiveOrderBook_DropsMalformedBufferedDiffAfterReplayFailure(t *testing.T) {
	liveBook := NewLiveOrderBook("BTCUSD")
	if err := liveBook.IngestDiff(&websocket.DepthUpdate{
		FirstUpdateID: 101,
		LastUpdateID:  101,
		Bids:          [][]string{{"not-a-price", "1"}},
	}); err != nil {
		t.Fatalf("unexpected pre-snapshot buffering error: %v", err)
	}

	if err := liveBook.ApplySnapshot(&websocket.OrderBookSnapshot{
		LastUpdateID: 100,
		Bids:         [][]string{{"65000", "1"}},
		Asks:         [][]string{{"65100", "1"}},
	}); err == nil {
		t.Fatal("expected malformed buffered diff to fail replay")
	}
	if liveBook.IsLive() {
		t.Fatal("expected malformed replay to mark the book non-live")
	}

	if err := liveBook.ApplySnapshot(&websocket.OrderBookSnapshot{
		LastUpdateID: 200,
		Bids:         [][]string{{"65200", "1"}},
		Asks:         [][]string{{"65300", "1"}},
	}); err != nil {
		t.Fatalf("expected a later snapshot to recover after dropping the malformed diff: %v", err)
	}
	if !liveBook.IsLive() {
		t.Fatal("expected later valid snapshot to restore live state")
	}
}

func TestLiveOrderBook_OnBBOChanged(t *testing.T) {
	liveBook := NewLiveOrderBook("BTCUSD")

	bboChan := make(chan BBO, 10)
	liveBook.OnBBOChanged(func(bbo BBO) {
		bboChan <- bbo
	})

	// 1. Initial snapshot triggers first BBO callback
	liveBook.ApplySnapshot(&websocket.OrderBookSnapshot{
		LastUpdateID: 100,
		Bids:         [][]string{{"65000.00", "1.0"}},
		Asks:         [][]string{{"65100.00", "1.0"}},
	})

	select {
	case bbo := <-bboChan:
		if bbo.BestBid != "65000.00" || bbo.BestAsk != "65100.00" {
			t.Errorf("unexpected initial BBO: %+v", bbo)
		}
		if bbo.Mid != 65050.00 {
			t.Errorf("expected mid 65050, got %f", bbo.Mid)
		}
		if bbo.Spread != 100.00 {
			t.Errorf("expected spread 100, got %f", bbo.Spread)
		}
	case <-time.After(time.Second):
		t.Fatal("timed out waiting for initial BBO callback")
	}

	// 2. Incremental diff with higher bid triggers second BBO callback
	_ = liveBook.IngestDiff(&websocket.DepthUpdate{
		LastUpdateID:  101,
		FirstUpdateID: 101,
		Bids:          [][]string{{"65020.00", "2.0"}},
	})

	select {
	case bbo := <-bboChan:
		if bbo.BestBid != "65020.00" || bbo.BestAsk != "65100.00" {
			t.Errorf("unexpected updated BBO: %+v", bbo)
		}
		if bbo.Mid != 65060.00 {
			t.Errorf("expected mid 65060, got %f", bbo.Mid)
		}
	case <-time.After(time.Second):
		t.Fatal("timed out waiting for updated BBO callback")
	}

	// 3. CurrentBBO synchronous accessor
	current := liveBook.CurrentBBO()
	if !current.HasBBO || current.BestBid != "65020.00" {
		t.Errorf("unexpected CurrentBBO(): %+v", current)
	}
}

func TestLiveOrderBook_BufferedDiffGapOnSnapshot(t *testing.T) {
	liveBook := NewLiveOrderBook("BTCUSD")

	// Pre-buffer a diff with a gap relative to subsequent snapshot (e.g., diff starts at 150)
	_ = liveBook.IngestDiff(&websocket.DepthUpdate{
		FirstUpdateID: 150,
		LastUpdateID:  155,
		Bids:          [][]string{{"65000.00", "1.0"}},
	})

	// Snapshot at sequence 100 (gap between 100 and 150)
	liveBook.ApplySnapshot(&websocket.OrderBookSnapshot{
		LastUpdateID: 100,
		Bids:         [][]string{{"64900.00", "1.0"}},
		Asks:         [][]string{{"65100.00", "1.0"}},
	})

	if liveBook.IsLive() {
		t.Fatal("expected book not to be live due to buffered sequence gap")
	}
	if !errors.Is(liveBook.Err(), transport.ErrResyncRequired) {
		t.Fatalf("expected ErrResyncRequired error on gap, got: %v", liveBook.Err())
	}
}

func TestLiveOrderBook_AutoBootInitialDepthUpdate(t *testing.T) {
	liveBook := NewLiveOrderBook("BTCUSD")

	// Ingest Gemini wire snapshot frame where U == u (e.g. 100 == 100)
	err := liveBook.IngestDiff(&websocket.DepthUpdate{
		EventType:     "depthUpdate",
		FirstUpdateID: 100,
		LastUpdateID:  100,
		Snapshot:      true,
		Bids:          [][]string{{"65000.00", "2.0"}},
		Asks:          [][]string{{"65100.00", "1.5"}},
	})
	if err != nil {
		t.Fatalf("unexpected error on initial depth update: %v", err)
	}

	if !liveBook.IsLive() {
		t.Fatal("expected book to be live immediately upon receiving initial wire snapshot (U==u)")
	}

	bestBid, ok := liveBook.Book().BestBid()
	if !ok || bestBid.Price != "65000.00" {
		t.Fatalf("expected best bid 65000.00, got %+v", bestBid)
	}

	// Apply contiguous subsequent diff (101 to 102)
	err = liveBook.IngestDiff(&websocket.DepthUpdate{
		EventType:     "depthUpdate",
		FirstUpdateID: 101,
		LastUpdateID:  102,
		Bids:          [][]string{{"65050.00", "3.0"}},
	})
	if err != nil {
		t.Fatalf("unexpected error on diff ingest: %v", err)
	}
	bestBid, ok = liveBook.Book().BestBid()
	if !ok || bestBid.Price != "65050.00" {
		t.Fatalf("expected updated best bid 65050.00, got %+v", bestBid)
	}
}

func TestLiveOrderBook_SnapshotResetsAnAlreadyLiveBook(t *testing.T) {
	liveBook := NewLiveOrderBook("BTCUSD")
	if err := liveBook.IngestDiff(&websocket.DepthUpdate{
		FirstUpdateID: 100,
		LastUpdateID:  100,
		Snapshot:      true,
		Bids:          [][]string{{"65000", "1"}},
	}); err != nil {
		t.Fatalf("initial snapshot failed: %v", err)
	}
	if err := liveBook.IngestDiff(&websocket.DepthUpdate{
		FirstUpdateID: 101,
		LastUpdateID:  101,
		Bids:          [][]string{{"65001", "2"}},
	}); err != nil {
		t.Fatalf("initial diff failed: %v", err)
	}

	if err := liveBook.IngestDiff(&websocket.DepthUpdate{
		LastUpdateID: 200,
		Snapshot:     true,
		Bids:         [][]string{{"64000", "3"}},
	}); err != nil {
		t.Fatalf("reconnect snapshot failed: %v", err)
	}
	if got := liveBook.Book().LastUpdateID(); got != 200 {
		t.Fatalf("expected snapshot sequence 200, got %d", got)
	}
	if _, ok := liveBook.Book().BestBid(); !ok {
		t.Fatal("expected a bid after reconnect snapshot")
	}
	if bid, _ := liveBook.Book().BestBid(); bid.Price != "64000" {
		t.Fatalf("expected old book to be replaced, got best bid %+v", bid)
	}
	if err := liveBook.IngestDiff(&websocket.DepthUpdate{
		FirstUpdateID: 201,
		LastUpdateID:  201,
		Bids:          [][]string{{"64100", "4"}},
	}); err != nil {
		t.Fatalf("diff after reconnect snapshot failed: %v", err)
	}
}

func TestLiveOrderBook_DoesNotInferSnapshotFromEqualUpdateBounds(t *testing.T) {
	liveBook := NewLiveOrderBook("BTCUSD")
	if err := liveBook.IngestDiff(&websocket.DepthUpdate{
		EventType:     "depthUpdate",
		FirstUpdateID: 100,
		LastUpdateID:  100,
		Bids:          [][]string{{"65000.00", "2.0"}},
	}); err != nil {
		t.Fatalf("unexpected error while buffering differential update: %v", err)
	}
	if liveBook.IsLive() {
		t.Fatal("equal U/u differential update must not be treated as a snapshot")
	}
}

func TestOrderBook_ApplyDiffAndIsCrossed(t *testing.T) {
	book := NewOrderBook("BTCUSD")

	// Apply batch diff
	book.ApplyDiff(10, [][]string{
		{"64000.00", "1.0"},
		{"64100.00", "2.0"},
	}, [][]string{
		{"64200.00", "1.5"},
		{"64300.00", "3.0"},
	})

	if book.LastUpdateID() != 10 {
		t.Fatalf("expected lastUpdateId 10, got %d", book.LastUpdateID())
	}
	if book.IsCrossed() {
		t.Fatal("expected uncrossed book, got crossed")
	}

	bestBid, _ := book.BestBid()
	bestAsk, _ := book.BestAsk()
	if bestBid.Price != "64100.00" || bestAsk.Price != "64200.00" {
		t.Fatalf("unexpected BBO: bid=%s, ask=%s", bestBid.Price, bestAsk.Price)
	}

	// Make crossed
	book.ApplyLevel(true, "64250.00", "1.0")
	if !book.IsCrossed() {
		t.Fatal("expected crossed book when bid > ask")
	}

	// Test LiveOrderBook BBO IsCrossed flag
	liveBook := NewLiveOrderBook("BTCUSD")
	liveBook.ApplySnapshot(&websocket.OrderBookSnapshot{
		LastUpdateID: 1,
		Bids:         [][]string{{"64500.00", "1.0"}},
		Asks:         [][]string{{"64400.00", "1.0"}}, // crossed
	})
	bbo := liveBook.CurrentBBO()
	if !bbo.IsCrossed {
		t.Fatal("expected BBO.IsCrossed to be true on crossed book")
	}
}

func TestOrderBook_VWAP_Imbalance_CumulativeDepth(t *testing.T) {
	book := NewOrderBook("BTCUSD")

	// Set up bids:
	// 60,000 @ 1.0 BTC
	// 59,900 @ 2.0 BTC
	// 59,800 @ 3.0 BTC
	// Total Bid Qty = 6.0 BTC, Notional = 60k*1 + 59.9k*2 + 59.8k*3 = 60,000 + 119,800 + 179,400 = 359,200

	// Set up asks:
	// 60,100 @ 1.0 BTC
	// 60,200 @ 2.0 BTC
	// 60,300 @ 3.0 BTC
	// Total Ask Qty = 6.0 BTC, Notional = 60.1k*1 + 60.2k*2 + 60.3k*3 = 60,100 + 120,400 + 180,900 = 361,400

	book.ApplySnapshot(1, [][]string{
		{"60000.00", "1.0"},
		{"59900.00", "2.0"},
		{"59800.00", "3.0"},
	}, [][]string{
		{"60100.00", "1.0"},
		{"60200.00", "2.0"},
		{"60300.00", "3.0"},
	})

	// 1. Test Imbalance
	// Equal 6.0 bids and 6.0 asks -> Imbalance = 0.0
	imbalance, ok := book.Imbalance(3)
	if !ok || imbalance != 0.0 {
		t.Fatalf("expected 0.0 imbalance, got %f (ok=%v)", imbalance, ok)
	}

	// Add more bids: 60,050 @ 4.0 -> Bids = 10.0, Asks = 6.0 -> (10-6)/(10+6) = 4/16 = +0.25
	book.ApplyLevel(true, "60050.00", "4.0")
	imbalance, ok = book.Imbalance(4)
	if !ok || imbalance != 0.25 {
		t.Fatalf("expected +0.25 imbalance, got %f", imbalance)
	}

	// 2. Test CumulativeDepth
	bidQty, bidNotional := book.CumulativeDepth(true, 2)
	// Top 2 bids: 60050@4.0 + 60000@1.0 = 5.0 Qty, Notional = 240,200 + 60,000 = 300,200
	if bidQty.String() != "5" || bidNotional.String() != "300200" {
		t.Fatalf("unexpected CumulativeDepth bids: qty=%s, notional=%s", bidQty.String(), bidNotional.String())
	}

	// 3. Test VWAP Buy
	// Sweeping 2.5 BTC of asks:
	// 1.0 BTC @ 60,100 = 60,100
	// 1.5 BTC @ 60,200 = 90,300
	// Total Notional = 150,400, Total Qty = 2.5
	// VWAP = 150,400 / 2.5 = 60,160
	fillBuy, err := book.VWAP(true, types.MustParseDecimal("2.5"))
	if err != nil {
		t.Fatalf("unexpected error in VWAP buy: %v", err)
	}
	if fillBuy.FilledQuantity.String() != "2.5" {
		t.Fatalf("expected filled qty 2.5, got %s", fillBuy.FilledQuantity.String())
	}
	if fillBuy.TotalNotional.String() != "150400" {
		t.Fatalf("expected total notional 150400, got %s", fillBuy.TotalNotional.String())
	}
	if fillBuy.AveragePrice.String() != "60160" {
		t.Fatalf("expected average price 60160, got %s", fillBuy.AveragePrice.String())
	}
	if fillBuy.LevelsConsumed != 2 {
		t.Fatalf("expected 2 levels consumed, got %d", fillBuy.LevelsConsumed)
	}
	if fillBuy.RemainingQty.IsPositive() {
		t.Fatalf("expected 0 remaining qty, got %s", fillBuy.RemainingQty.String())
	}

	// 4. Test VWAP Partial Fill (Requested quantity exceeds book depth)
	fillOversized, err := book.VWAP(true, types.MustParseDecimal("10.0"))
	if err != nil {
		t.Fatalf("unexpected error in oversized VWAP: %v", err)
	}
	if fillOversized.FilledQuantity.String() != "6" {
		t.Fatalf("expected filled qty 6 (all asks), got %s", fillOversized.FilledQuantity.String())
	}
	if fillOversized.RemainingQty.String() != "4" {
		t.Fatalf("expected remaining qty 4, got %s", fillOversized.RemainingQty.String())
	}
}

func TestOrderBook_ImbalanceAcceptsOneSidedBooks(t *testing.T) {
	tests := []struct {
		name       string
		bids, asks [][]string
		want       float64
	}{
		{
			name: "bids only",
			bids: [][]string{{"60000", "2"}},
			want: 1,
		},
		{
			name: "asks only",
			asks: [][]string{{"60000", "2"}},
			want: -1,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			book := NewOrderBook("BTCUSD")
			if err := book.ApplySnapshot(1, tt.bids, tt.asks); err != nil {
				t.Fatalf("ApplySnapshot failed: %v", err)
			}
			got, ok := book.Imbalance(0)
			if !ok || got != tt.want {
				t.Fatalf("expected imbalance %v (ok=true), got %v (ok=%v)", tt.want, got, ok)
			}
		})
	}
}

func TestOrderBook_SetLastUpdateID(t *testing.T) {
	book := NewOrderBook("BTCUSD")
	book.SetLastUpdateID(42)
	if got := book.LastUpdateID(); got != 42 {
		t.Fatalf("expected last update ID 42, got %d", got)
	}
}

func TestLiveOrderBook_ApplySnapshotFromDepthUpdateAndRun(t *testing.T) {
	liveBook := NewLiveOrderBook("BTCUSD")
	if err := liveBook.ApplySnapshotFromDepthUpdate(nil); err == nil {
		t.Fatal("expected nil depth update to fail")
	}
	if err := liveBook.ApplySnapshotFromDepthUpdate(&websocket.DepthUpdate{
		Symbol:        "BTCUSD",
		FirstUpdateID: 100,
		LastUpdateID:  100,
		Bids:          [][]string{{"65000", "1"}},
		Asks:          [][]string{{"65100", "1"}},
	}); err != nil {
		t.Fatalf("ApplySnapshotFromDepthUpdate failed: %v", err)
	}

	updated := make(chan struct{}, 1)
	liveBook.OnBBOChanged(func(BBO) { updated <- struct{}{} })
	updates := make(chan *websocket.DepthUpdate, 1)
	ctx, cancel := context.WithCancel(context.Background())
	runDone := make(chan error, 1)
	go func() { runDone <- liveBook.Run(ctx, updates) }()
	updates <- &websocket.DepthUpdate{
		FirstUpdateID: 101,
		LastUpdateID:  101,
		Bids:          [][]string{{"65010", "2"}},
	}
	select {
	case <-updated:
		cancel()
	case <-time.After(time.Second):
		cancel()
		t.Fatal("Run did not process the depth update")
	}
	select {
	case err := <-runDone:
		if !errors.Is(err, context.Canceled) {
			t.Fatalf("expected Run to return context cancellation, got %v", err)
		}
	case <-time.After(time.Second):
		t.Fatal("Run did not stop after context cancellation")
	}

	closed := make(chan *websocket.DepthUpdate)
	close(closed)
	if err := liveBook.Run(context.Background(), closed); !errors.Is(err, transport.ErrConnectionClosed) {
		t.Fatalf("expected closed update channel error, got %v", err)
	}
}

func TestLiveOrderBook_BBOListenerUnregister(t *testing.T) {
	liveBook := NewLiveOrderBook("BTCUSD")
	if unregister := liveBook.OnBBOChanged(nil); unregister == nil {
		t.Fatal("expected nil callback to return a no-op unregister function")
	}

	updates := make(chan BBO, 2)
	unregister := liveBook.OnBBOChanged(func(bbo BBO) { updates <- bbo })
	if err := liveBook.ApplySnapshot(&websocket.OrderBookSnapshot{
		LastUpdateID: 1,
		Bids:         [][]string{{"100", "1"}},
		Asks:         [][]string{{"101", "1"}},
	}); err != nil {
		t.Fatalf("snapshot failed: %v", err)
	}
	select {
	case <-updates:
	case <-time.After(time.Second):
		t.Fatal("expected initial BBO callback")
	}
	unregister()
	unregister()

	if err := liveBook.IngestDiff(&websocket.DepthUpdate{
		FirstUpdateID: 2,
		LastUpdateID:  2,
		Bids:          [][]string{{"102", "1"}},
	}); err != nil {
		t.Fatalf("diff failed: %v", err)
	}
	select {
	case bbo := <-updates:
		t.Fatalf("received callback after unregister: %+v", bbo)
	default:
	}
}
