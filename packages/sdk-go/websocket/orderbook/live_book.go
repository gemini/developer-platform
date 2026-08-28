package orderbook

import (
	"context"
	"errors"
	"fmt"
	"slices"
	"strings"
	"sync"

	"github.com/gemini/gemini-go/transport"
	"github.com/gemini/gemini-go/types"
	"github.com/gemini/gemini-go/websocket"
)

// BBO represents the top of the order book and derived metrics.
type BBO struct {
	Symbol    string
	BestBid   string
	BestAsk   string
	Mid       float64
	Spread    float64
	SpreadBps float64
	HasBBO    bool
	IsCrossed bool
}

// LiveOrderBook coordinates real-time order book snapshots, diff processing, and sequence gap recovery.
type LiveOrderBook struct {
	book           *OrderBook
	mu             sync.RWMutex
	live           bool
	err            error
	diffQueue      []*websocket.DepthUpdate
	bboListeners   []bboListener
	nextListenerID uint64
	lastBBO        BBO
}

// OrderBookView exposes the read-only operations available from a live book.
// LiveOrderBook.Book returns this view so callers cannot mutate sequence state
// behind the live reconciler's recovery and synchronization rules.
type OrderBookView interface {
	Symbol() string
	LastUpdateID() int64
	BestBid() (PriceLevel, bool)
	BestAsk() (PriceLevel, bool)
	IsCrossed() bool
	Spread() (float64, bool)
	Mid() (float64, bool)
	Bids(depth int) []PriceLevel
	Asks(depth int) []PriceLevel
	VWAP(isBuy bool, targetQty types.Decimal) (SimulatedFill, error)
	Imbalance(depth int) (float64, bool)
	CumulativeDepth(isBid bool, depth int) (totalQty types.Decimal, totalNotional types.Decimal)
}

type bboListener struct {
	id       uint64
	callback func(BBO)
}

const maxBufferedDiffs = 4096

// ErrSymbolMismatch indicates that an update was applied to an order book
// for a different market.
var ErrSymbolMismatch = errors.New("gemini order book: symbol mismatch")

// NewLiveOrderBook creates a new LiveOrderBook manager.
func NewLiveOrderBook(symbol string) *LiveOrderBook {
	return &LiveOrderBook{
		book:         NewOrderBook(symbol),
		diffQueue:    make([]*websocket.DepthUpdate, 0, 128),
		bboListeners: make([]bboListener, 0, 4),
	}
}

// Book returns a read-only view of the synchronized order book.
func (l *LiveOrderBook) Book() OrderBookView {
	return l.book
}

// IsLive returns true if the book has ingested a baseline snapshot and is actively synchronized.
func (l *LiveOrderBook) IsLive() bool {
	l.mu.RLock()
	defer l.mu.RUnlock()
	return l.live
}

// Err returns any unrecoverable synchronization error encountered by the live book.
func (l *LiveOrderBook) Err() error {
	l.mu.RLock()
	defer l.mu.RUnlock()
	return l.err
}

// Reset resets the live state and clears buffered diffs.
func (l *LiveOrderBook) Reset() {
	l.mu.Lock()
	defer l.mu.Unlock()
	l.live = false
	l.err = nil
	l.diffQueue = l.diffQueue[:0]
	l.lastBBO = BBO{}
	l.book.Clear()
}

// CurrentBBO returns the current top-of-book metrics.
func (l *LiveOrderBook) CurrentBBO() BBO {
	l.mu.RLock()
	defer l.mu.RUnlock()
	return l.currentBBOLocked()
}

func (l *LiveOrderBook) currentBBOLocked() BBO {
	bid, hasBid := l.book.BestBid()
	ask, hasAsk := l.book.BestAsk()

	bbo := BBO{
		Symbol: l.book.Symbol(),
	}
	if hasBid && hasAsk {
		bbo.BestBid = bid.Price
		bbo.BestAsk = ask.Price
		bbo.HasBBO = true
		bbo.Spread = ask.val - bid.val
		bbo.Mid = (ask.val + bid.val) / 2.0
		bbo.IsCrossed = bid.decimal.Cmp(ask.decimal) >= 0
		if bbo.Mid > 0 {
			bbo.SpreadBps = (bbo.Spread / bbo.Mid) * 10000.0
		}
	} else if hasBid {
		bbo.BestBid = bid.Price
	} else if hasAsk {
		bbo.BestAsk = ask.Price
	}
	return bbo
}

// OnBBOChanged registers a callback that triggers when top-of-book prices or
// spread change. Callbacks run synchronously after an update and should be
// short and non-blocking. The returned function unregisters the callback.
func (l *LiveOrderBook) OnBBOChanged(callback func(BBO)) func() {
	if callback == nil {
		return func() {}
	}
	l.mu.Lock()
	l.nextListenerID++
	id := l.nextListenerID
	l.bboListeners = append(l.bboListeners, bboListener{id: id, callback: callback})
	l.mu.Unlock()
	return func() {
		l.mu.Lock()
		defer l.mu.Unlock()
		for i, listener := range l.bboListeners {
			if listener.id == id {
				l.bboListeners = append(l.bboListeners[:i], l.bboListeners[i+1:]...)
				return
			}
		}
	}
}

func (l *LiveOrderBook) checkBBOChangeLocked() ([]func(BBO), BBO, bool) {
	if len(l.bboListeners) == 0 {
		return nil, BBO{}, false
	}
	newBBO := l.currentBBOLocked()
	if newBBO.BestBid != l.lastBBO.BestBid || newBBO.BestAsk != l.lastBBO.BestAsk {
		l.lastBBO = newBBO
		listeners := make([]func(BBO), len(l.bboListeners))
		for i, listener := range l.bboListeners {
			listeners[i] = listener.callback
		}
		return listeners, newBBO, true
	}
	return nil, BBO{}, false
}

func notifyListeners(listeners []func(BBO), bbo BBO) {
	for _, cb := range listeners {
		if cb != nil {
			cb(bbo)
		}
	}
}

// ApplySnapshot ingests a fresh snapshot and applies buffered diffs.
func (l *LiveOrderBook) ApplySnapshot(snapshot *websocket.OrderBookSnapshot) error {
	if snapshot == nil {
		return fmt.Errorf("gemini order book: nil snapshot")
	}
	if err := validateSymbol(l.book.Symbol(), snapshot.Symbol); err != nil {
		return err
	}
	l.mu.Lock()

	if err := l.book.ApplySnapshot(snapshot.LastUpdateID, snapshot.Bids, snapshot.Asks); err != nil {
		l.live = false
		l.err = err
		l.mu.Unlock()
		return err
	}
	l.live = true
	l.err = nil

	if err := l.replayQueuedDiffsLocked(); err != nil {
		l.live = false
		l.err = err
	}
	listeners, bbo, changed := l.checkBBOChangeLocked()
	err := l.err
	l.mu.Unlock()

	if changed {
		notifyListeners(listeners, bbo)
	}
	return err
}

// ApplySnapshotFromDepthUpdate boots the live order book directly from an initial depth update frame.
func (l *LiveOrderBook) ApplySnapshotFromDepthUpdate(update *websocket.DepthUpdate) error {
	if update == nil {
		return fmt.Errorf("gemini order book: nil depth update")
	}
	return l.ApplySnapshot(&websocket.OrderBookSnapshot{
		EventType:    update.EventType,
		EventTime:    update.EventTime,
		Symbol:       update.Symbol,
		LastUpdateID: update.LastUpdateID,
		Bids:         update.Bids,
		Asks:         update.Asks,
	})
}

// IngestDiff processes an incremental depth update or initial snapshot from the WebSocket feed.
func (l *LiveOrderBook) IngestDiff(diff *websocket.DepthUpdate) error {
	if diff == nil {
		return nil
	}
	if err := validateSymbol(l.book.Symbol(), diff.Symbol); err != nil {
		return err
	}
	l.mu.Lock()

	// A snapshot is a new sequence baseline even when the previous stream was
	// live (for example after reconnect). Apply it before the live/diff branch;
	// treating it as an incremental update can reject a valid snapshot as stale
	// or create a false sequence gap.
	if diff.Snapshot {
		if diff.LastUpdateID <= 0 {
			l.live = false
			l.err = &transport.ResyncRequiredError{
				LastUpdateID:  l.book.LastUpdateID(),
				FirstUpdateID: diff.FirstUpdateID,
			}
			err := l.err
			l.mu.Unlock()
			return err
		}
		if err := l.book.ApplySnapshot(diff.LastUpdateID, diff.Bids, diff.Asks); err != nil {
			l.live = false
			l.err = err
			l.mu.Unlock()
			return err
		}
		l.live = true
		l.err = nil
		if err := l.replayQueuedDiffsLocked(); err != nil {
			l.live = false
			l.err = err
		}
		listeners, bbo, changed := l.checkBBOChangeLocked()
		err := l.err
		l.mu.Unlock()
		if changed {
			notifyListeners(listeners, bbo)
		}
		return err
	}

	if !l.live {
		// Snapshot mode is selected on the connection URL. Do not infer a
		// snapshot from U == u: ordinary differential updates may have that
		// shape as well.
		if diff.FirstUpdateID <= 0 || diff.LastUpdateID < diff.FirstUpdateID {
			l.err = &transport.ResyncRequiredError{
				LastUpdateID:  l.book.LastUpdateID(),
				FirstUpdateID: diff.FirstUpdateID,
			}
			err := l.err
			l.mu.Unlock()
			return err
		}
		// Buffer incoming diffs while waiting for initial snapshot.
		if len(l.diffQueue) >= maxBufferedDiffs {
			l.live = false
			l.err = fmt.Errorf("%w: buffered diff queue exceeded %d updates", transport.ErrResyncRequired, maxBufferedDiffs)
			err := l.err
			l.mu.Unlock()
			return err
		}
		l.diffQueue = append(l.diffQueue, diff)
		l.mu.Unlock()
		return nil
	}

	lastID := l.book.LastUpdateID()

	// 1. Validate the update's own bounds first.
	if diff.FirstUpdateID <= 0 || diff.LastUpdateID < diff.FirstUpdateID {
		l.live = false
		l.err = &transport.ResyncRequiredError{
			LastUpdateID:  lastID,
			FirstUpdateID: diff.FirstUpdateID,
		}
		err := l.err
		l.mu.Unlock()
		return err
	}

	// 2. Drop stale diff
	if diff.LastUpdateID <= lastID {
		l.mu.Unlock()
		return nil
	}

	// 3. Validate sequence continuity (no gaps).
	nextID := nextUpdateID(lastID)
	if diff.FirstUpdateID > nextID {
		l.live = false
		l.err = &transport.ResyncRequiredError{
			LastUpdateID:  lastID,
			FirstUpdateID: diff.FirstUpdateID,
		}
		err := l.err
		l.mu.Unlock()
		return err
	}

	if err := l.applyDiffLocked(diff); err != nil {
		l.live = false
		l.err = err
		l.mu.Unlock()
		return err
	}
	listeners, bbo, changed := l.checkBBOChangeLocked()
	l.mu.Unlock()

	if changed {
		notifyListeners(listeners, bbo)
	}
	return nil
}

func validateSymbol(bookSymbol, updateSymbol string) error {
	bookSymbol = strings.TrimSpace(bookSymbol)
	updateSymbol = strings.TrimSpace(updateSymbol)
	if bookSymbol == "" || updateSymbol == "" || strings.EqualFold(bookSymbol, updateSymbol) {
		return nil
	}
	return fmt.Errorf("%w: book=%q update=%q", ErrSymbolMismatch, bookSymbol, updateSymbol)
}

func (l *LiveOrderBook) applyDiffLocked(diff *websocket.DepthUpdate) error {
	if diff.FirstUpdateID <= 0 || diff.LastUpdateID < diff.FirstUpdateID {
		return &transport.ResyncRequiredError{
			LastUpdateID:  l.book.LastUpdateID(),
			FirstUpdateID: diff.FirstUpdateID,
		}
	}
	return l.book.ApplyDiff(diff.LastUpdateID, diff.Bids, diff.Asks)
}

func (l *LiveOrderBook) replayQueuedDiffsLocked() error {
	if len(l.diffQueue) == 0 {
		return nil
	}
	slices.SortStableFunc(l.diffQueue, func(a, b *websocket.DepthUpdate) int {
		if a.FirstUpdateID < b.FirstUpdateID {
			return -1
		}
		if a.FirstUpdateID > b.FirstUpdateID {
			return 1
		}
		return 0
	})
	remaining := make([]*websocket.DepthUpdate, 0, len(l.diffQueue))
	for i, diff := range l.diffQueue {
		lastID := l.book.LastUpdateID()
		if diff.LastUpdateID <= lastID {
			continue
		}
		nextID := nextUpdateID(lastID)
		if diff.FirstUpdateID > nextID {
			remaining = append(remaining, diff)
			continue
		}
		if err := l.applyDiffLocked(diff); err != nil {
			// Drop the malformed or otherwise unusable event while retaining
			// later events for the next snapshot. Retaining the failing event
			// would make every subsequent snapshot fail in the same place until
			// the caller performed a full Reset.
			l.diffQueue = append(remaining, l.diffQueue[i+1:]...)
			return err
		}
	}
	l.diffQueue = remaining
	if len(remaining) > 0 {
		return &transport.ResyncRequiredError{
			LastUpdateID:  l.book.LastUpdateID(),
			FirstUpdateID: remaining[0].FirstUpdateID,
		}
	}
	return nil
}

func nextUpdateID(lastID int64) int64 {
	if lastID == int64(^uint64(0)>>1) {
		return lastID
	}
	return lastID + 1
}

// Run pumps updates from a WebSocket channel into the LiveOrderBook.
func (l *LiveOrderBook) Run(ctx context.Context, depthUpdates <-chan *websocket.DepthUpdate) error {
	if ctx == nil {
		ctx = context.Background()
	}
	for {
		select {
		case <-ctx.Done():
			return ctx.Err()
		case update, ok := <-depthUpdates:
			if !ok {
				return transport.ErrConnectionClosed
			}
			if err := l.IngestDiff(update); err != nil {
				return err
			}
		}
	}
}
