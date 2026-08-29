package websocket

import (
	"bytes"
	"encoding/json"
	"fmt"
	"strings"
)

type snapshotEnvelope struct {
	LastUpdateID *int64     `json:"lastUpdateId"`
	EventTime    int64      `json:"E"`
	Symbol       string     `json:"symbol"`
	Bids         [][]string `json:"bids"`
	Asks         [][]string `json:"asks"`
}

// dispatchOrderBookSnapshot recognizes the partial-depth snapshot envelope.
// The envelope intentionally has no required symbol field, so symbol-less
// frames are accepted only when the current generation has one unambiguous
// active depth target.
func (c *Client) dispatchOrderBookSnapshot(stop <-chan struct{}, payload []byte, generation uint64, tables *subTables) (bool, error) {
	if !bytes.Contains(payload, bLastUpdateID) || !bytes.Contains(payload, bids) || !bytes.Contains(payload, bAsks) {
		return false, nil
	}

	var envelope snapshotEnvelope
	if err := json.Unmarshal(payload, &envelope); err != nil {
		c.reportSnapshotError(fmt.Errorf("%w: %v", ErrMalformedSnapshot, err))
		return true, nil
	}
	if envelope.LastUpdateID == nil || *envelope.LastUpdateID <= 0 || envelope.Bids == nil || envelope.Asks == nil {
		c.reportSnapshotError(ErrMalformedSnapshot)
		return true, nil
	}

	symbolLess := strings.TrimSpace(envelope.Symbol) == ""
	symbol := strings.ToUpper(envelope.Symbol)
	if symbolLess {
		var ok bool
		symbol, ok = c.uniqueSnapshotSymbol(tables)
		if !ok {
			c.reportSnapshotError(ErrAmbiguousSnapshot)
			return true, nil
		}
	}

	// A snapshot from an older generation must not replace a newer pending
	// baseline. This matters when a frame was already queued while a reconnect
	// or unsubscribe/resubscribe advanced the subscription generation.
	if pendingGeneration, pending := c.snapshotPendingGeneration(symbol); pending && generation < pendingGeneration {
		return true, nil
	}

	snapshot := &OrderBookSnapshot{
		EventTime:    envelope.EventTime,
		Symbol:       symbol,
		LastUpdateID: *envelope.LastUpdateID,
		Bids:         envelope.Bids,
		Asks:         envelope.Asks,
	}
	for _, sub := range tables.partialDepthSubs[symbol] {
		sub.send(stop, snapshot)
	}
	// A symbol-less frame is the partial-depth contract. The shared client
	// normally rejects mixed depth variants before they reach this point, but
	// keep the dispatcher fail-closed if a stale table or a future subscription
	// path ever violates that invariant: never synthesize an incomplete
	// differential-depth baseline from a partial snapshot.
	if symbolLess && len(tables.partialDepthSubs[symbol]) > 0 {
		return true, nil
	}

	if len(tables.depthSubs[symbol]) == 0 {
		return true, nil
	}
	update := &DepthUpdate{
		EventType:     "depthUpdate",
		EventTime:     envelope.EventTime,
		Symbol:        symbol,
		FirstUpdateID: *envelope.LastUpdateID,
		LastUpdateID:  *envelope.LastUpdateID,
		Bids:          envelope.Bids,
		Asks:          envelope.Asks,
		Snapshot:      true,
	}
	if pendingGeneration, pending := c.snapshotPendingGeneration(symbol); pending && generation >= pendingGeneration {
		c.consumeSnapshotPending(symbol, generation)
	}
	for _, sub := range tables.depthSubs[symbol] {
		sub.send(stop, update)
	}
	return true, nil
}

func (c *Client) uniqueSnapshotSymbol(tables *subTables) (string, bool) {
	c.subsMu.Lock()
	defer c.subsMu.Unlock()

	candidates := make(map[string]struct{})
	for symbol, subs := range tables.depthSubs {
		if len(subs) > 0 {
			candidates[symbol] = struct{}{}
		}
	}
	for symbol, subs := range tables.partialDepthSubs {
		if len(subs) > 0 {
			candidates[symbol] = struct{}{}
		}
	}
	// Pending generations fence stale differential snapshots after a symbol is
	// resolved; they must not remove other active symbol-less targets from the
	// candidate set. If more than one target shares a connection, routing an
	// unlabelled frame is unsafe and the caller reports ErrAmbiguousSnapshot.
	if len(candidates) != 1 {
		return "", false
	}
	for symbol := range candidates {
		return symbol, true
	}
	return "", false
}

func (c *Client) snapshotPendingGeneration(symbol string) (uint64, bool) {
	c.subsMu.Lock()
	defer c.subsMu.Unlock()
	pendingGeneration, ok := c.snapshotPending[strings.ToUpper(symbol)]
	return pendingGeneration, ok
}

func (c *Client) reportSnapshotError(err error) {
	if err == nil {
		return
	}
	c.publishEvent(ConnectionEvent{State: c.State(), Err: err})
}
