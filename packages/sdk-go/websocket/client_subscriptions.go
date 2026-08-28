package websocket

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"sync/atomic"
	"time"
)

var globalReqID atomic.Int64

// ErrSubscriptionVariantMismatch indicates that an unsubscribe request targets
// a different cadence or depth variant than the active public feed.
var ErrSubscriptionVariantMismatch = errors.New("gemini websocket: subscription variant mismatch")

func normalizeSymbol(symbol string) (string, error) {
	normalized := strings.ToUpper(strings.TrimSpace(symbol))
	if normalized == "" {
		return "", errors.New("gemini websocket: symbol is required")
	}
	return normalized, nil
}

// SubscriptionScope identifies the account or authenticated WebSocket session
// associated with a private stream.
type SubscriptionScope string

const (
	ScopeAccount SubscriptionScope = "account"
	ScopeSession SubscriptionScope = "session"
)

// DepthSubscriptionOptions controls the differential depth stream interval.
// The exchange supports the default interval and a 100ms accelerated stream.
type DepthSubscriptionOptions struct {
	Interval time.Duration
}

// PartialDepthLevel identifies the number of top-of-book levels in a partial
// depth stream.
type PartialDepthLevel int

const (
	DepthLevel5  PartialDepthLevel = 5
	DepthLevel10 PartialDepthLevel = 10
	DepthLevel20 PartialDepthLevel = 20
)

// PartialDepthSubscriptionOptions controls a partial-depth snapshot stream.
// A zero Levels value selects the documented default of 10 levels.
type PartialDepthSubscriptionOptions struct {
	Levels   PartialDepthLevel
	Interval time.Duration
}

// AccountStreamOptions controls the optional one-second snapshot interval for
// authenticated balance and position streams.
type AccountStreamOptions struct {
	Interval time.Duration
}

func depthIntervalSuffix(interval time.Duration) (string, error) {
	switch interval {
	case 0:
		return "depth", nil
	case 100 * time.Millisecond:
		return "depth@100ms", nil
	default:
		return "", fmt.Errorf("gemini websocket: depth interval must be 0 or 100ms")
	}
}

func partialDepthStreamSuffix(options PartialDepthSubscriptionOptions) (string, error) {
	levels := options.Levels
	if levels == 0 {
		levels = DepthLevel10
	}
	if levels != DepthLevel5 && levels != DepthLevel10 && levels != DepthLevel20 {
		return "", fmt.Errorf("gemini websocket: partial depth levels must be 5, 10, or 20")
	}
	suffix := fmt.Sprintf("depth%d", levels)
	if options.Interval == 0 {
		return suffix, nil
	}
	if options.Interval != 100*time.Millisecond {
		return "", fmt.Errorf("gemini websocket: partial depth interval must be 0 or 100ms")
	}
	return suffix + "@100ms", nil
}

func accountStreamName(base string, options AccountStreamOptions) (string, error) {
	switch options.Interval {
	case 0:
		return base + "@account", nil
	case time.Second:
		return base + "@account@1s", nil
	default:
		return "", fmt.Errorf("gemini websocket: account stream interval must be 0 or 1s")
	}
}

// acquireSubscriptionWire serializes control requests for one feed. Keeping
// the gate per feed means a stalled depth request cannot block cleanup of an
// unrelated private feed.
func (c *Client) acquireSubscriptionWire(ctx context.Context, feedKey string) error {
	if ctx == nil {
		ctx = context.Background()
	}
	c.subscriptionWireMu.Lock()
	gate := c.subscriptionGates[feedKey]
	if gate == nil {
		gate = newTokenGate()
		c.subscriptionGates[feedKey] = gate
	}
	c.subscriptionWireMu.Unlock()

	select {
	case <-ctx.Done():
		return ctx.Err()
	case <-c.doneChan:
		return fmt.Errorf("gemini websocket: subscription gate closed: %w", context.Canceled)
	case <-gate:
		return nil
	}
}

func (c *Client) releaseSubscriptionWire(feedKey string) {
	c.subscriptionWireMu.Lock()
	gate := c.subscriptionGates[feedKey]
	c.subscriptionWireMu.Unlock()
	if gate != nil {
		gate <- struct{}{}
	}
}

// acquireSubscriptionReplay reserves the short table-snapshot interval used
// during reconnect. It must never be held while waiting for a server ACK.
func (c *Client) acquireSubscriptionReplay(ctx context.Context) error {
	if ctx == nil {
		ctx = context.Background()
	}
	select {
	case <-ctx.Done():
		return ctx.Err()
	case <-c.doneChan:
		return fmt.Errorf("gemini websocket: subscription replay gate closed: %w", context.Canceled)
	case <-c.subscriptionReplayGate:
		return nil
	}
}

func (c *Client) releaseSubscriptionReplay() {
	c.subscriptionReplayGate <- struct{}{}
}

func subscribePublicFeed[T any](
	ctx context.Context,
	c *Client,
	symbol string,
	feedPrefix string,
	streamSuffix string,
	chBuf int,
	getMap func(*subTables) map[string][]*subscription[T],
	setMap func(*subTables, map[string][]*subscription[T]),
) (<-chan *T, error) {
	normSymbol, err := normalizeSymbol(symbol)
	if err != nil {
		return nil, err
	}
	if err := c.Connect(ctx); err != nil {
		return nil, err
	}

	feedKey := fmt.Sprintf("%s:%s@%s", feedPrefix, normSymbol, streamSuffix)
	var stream string
	isContract := streamSuffix == "contractStatus"
	if isContract {
		stream = "contractStatus"
		feedKey = "contractStatus"
	} else {
		stream = fmt.Sprintf("%s@%s", strings.ToLower(normSymbol), streamSuffix)
	}
	sub := newSubscription[T](chBuf)

	req := RequestFrame{
		ID:     globalReqID.Add(1),
		Method: "SUBSCRIBE",
		Params: []string{stream},
	}

	if err := c.acquireSubscriptionWire(ctx, feedKey); err != nil {
		return nil, err
	}
	defer c.releaseSubscriptionWire(feedKey)
	if err := c.acquireSubscriptionReplay(ctx); err != nil {
		return nil, err
	}

	c.subsMu.Lock()
	oldTables := c.subTables.Load()
	if feedPrefix == "depth" || feedPrefix == "partialDepth" {
		for activeKey := range c.activeFeeds {
			prefix := fmt.Sprintf("%s:%s@", feedPrefix, normSymbol)
			if strings.HasPrefix(activeKey, prefix) && activeKey != feedKey {
				c.subsMu.Unlock()
				c.releaseSubscriptionReplay()
				return nil, fmt.Errorf("gemini websocket: %s stream variant already active for %s", feedPrefix, normSymbol)
			}
		}
	}
	_, alreadyActive := c.activeFeeds[feedKey]
	needWireSubscribe := !alreadyActive
	newTables := oldTables.clone()
	setMap(newTables, addMapSub(getMap(oldTables), normSymbol, sub))
	c.subTables.Store(newTables)
	if needWireSubscribe {
		c.activeFeeds[feedKey] = req
		if feedPrefix == "depth" && c.snapshotMode {
			c.snapshotPending[normSymbol] = c.subscriptionGeneration.Add(1)
		}
	}
	c.subsMu.Unlock()
	c.releaseSubscriptionReplay()

	if needWireSubscribe {
		if _, err := c.requestConnected(ctx, req.Method, req.Params); err != nil {
			removePublicSubscription(c, feedKey, normSymbol, sub, feedPrefix, getMap, setMap)
			return nil, fmt.Errorf("gemini websocket: subscribe send failed: %w", err)
		}
	}

	return sub.ch, nil
}

func unsubscribePublicFeed[T any](
	ctx context.Context,
	c *Client,
	symbol string,
	feedPrefix string,
	streamSuffix string,
	getMap func(*subTables) map[string][]*subscription[T],
	setMap func(*subTables, map[string][]*subscription[T]),
) error {
	normSymbol, err := normalizeSymbol(symbol)
	if err != nil {
		return err
	}
	feedKey := fmt.Sprintf("%s:%s@%s", feedPrefix, normSymbol, streamSuffix)
	var stream string
	isContract := streamSuffix == "contractStatus"
	if isContract {
		stream = "contractStatus"
		feedKey = "contractStatus"
	} else {
		stream = fmt.Sprintf("%s@%s", strings.ToLower(normSymbol), streamSuffix)
	}

	if err := c.acquireSubscriptionWire(ctx, feedKey); err != nil {
		return err
	}
	defer c.releaseSubscriptionWire(feedKey)
	if err := c.acquireSubscriptionReplay(ctx); err != nil {
		return err
	}

	c.subsMu.Lock()
	if !isContract {
		if err := validateActivePublicFeedVariantLocked(c, feedPrefix, normSymbol, feedKey, streamSuffix); err != nil {
			c.subsMu.Unlock()
			c.releaseSubscriptionReplay()
			return err
		}
	}
	oldTables := c.subTables.Load()
	newMap, subs, exists := removeMapSub(getMap(oldTables), normSymbol)
	if !exists {
		c.subsMu.Unlock()
		c.releaseSubscriptionReplay()
		return nil
	}

	newTables := oldTables.clone()
	setMap(newTables, newMap)
	c.subTables.Store(newTables)

	needWireUnsubscribe := true
	if isContract {
		if len(newTables.contractSubs) > 0 {
			needWireUnsubscribe = false
		} else {
			delete(c.activeFeeds, "contractStatus")
		}
	} else {
		delete(c.activeFeeds, feedKey)
		if feedPrefix == "depth" {
			delete(c.snapshotPending, normSymbol)
			c.subscriptionGeneration.Add(1)
		}
	}

	c.subsMu.Unlock()
	c.releaseSubscriptionReplay()
	closeSubscriptions(subs)

	if needWireUnsubscribe && c.State() == StateConnected {
		req := RequestFrame{
			ID:     globalReqID.Add(1),
			Method: "UNSUBSCRIBE",
			Params: []string{stream},
		}
		_, err := c.requestConnected(ctx, req.Method, req.Params)
		return err
	}
	return nil
}

func validateActivePublicFeedVariantLocked(c *Client, feedPrefix, symbol, requestedKey, requestedStream string) error {
	prefix := fmt.Sprintf("%s:%s@", feedPrefix, symbol)
	for activeKey := range c.activeFeeds {
		if strings.HasPrefix(activeKey, prefix) && activeKey != requestedKey {
			return fmt.Errorf("%w: active %q, requested %q", ErrSubscriptionVariantMismatch, activeKey, requestedStream)
		}
	}
	return nil
}

func subscribePrivateFeed[T any](
	ctx context.Context,
	c *Client,
	feedName string,
	chBuf int,
	getMap func(*subTables) map[string][]*subscription[T],
	setMap func(*subTables, map[string][]*subscription[T]),
) (<-chan *T, error) {
	if c.auth == nil {
		return nil, ErrAuthenticationRequired
	}

	if err := c.Connect(ctx); err != nil {
		return nil, err
	}

	sub := newSubscription[T](chBuf)
	req := RequestFrame{
		ID:     globalReqID.Add(1),
		Method: "SUBSCRIBE",
		Params: []string{feedName},
	}

	if err := c.acquireSubscriptionWire(ctx, feedName); err != nil {
		return nil, err
	}
	defer c.releaseSubscriptionWire(feedName)
	if err := c.acquireSubscriptionReplay(ctx); err != nil {
		return nil, err
	}

	c.subsMu.Lock()
	oldTables := c.subTables.Load()
	oldMap := getMap(oldTables)
	needWireSubscribe := len(oldMap[feedName]) == 0
	newTables := oldTables.clone()
	newMap := cloneMapSlice(oldMap)
	newMap[feedName] = appendSubscription(oldMap[feedName], sub)
	setMap(newTables, newMap)
	c.subTables.Store(newTables)
	if needWireSubscribe {
		c.activeFeeds[feedName] = req
	}
	c.subsMu.Unlock()
	c.releaseSubscriptionReplay()

	if needWireSubscribe {
		if _, err := c.requestConnected(ctx, req.Method, req.Params); err != nil {
			removePrivateSubscription(c, feedName, sub, getMap, setMap)
			return nil, fmt.Errorf("gemini websocket: subscribe send failed: %w", err)
		}
	}

	return sub.ch, nil
}

func unsubscribePrivateFeed[T any](
	ctx context.Context,
	c *Client,
	feedName string,
	getMap func(*subTables) map[string][]*subscription[T],
	setMap func(*subTables, map[string][]*subscription[T]),
) error {
	if err := c.acquireSubscriptionWire(ctx, feedName); err != nil {
		return err
	}
	defer c.releaseSubscriptionWire(feedName)
	if err := c.acquireSubscriptionReplay(ctx); err != nil {
		return err
	}

	c.subsMu.Lock()
	oldTables := c.subTables.Load()
	oldMap := getMap(oldTables)
	subs := oldMap[feedName]
	if len(subs) == 0 {
		delete(c.activeFeeds, feedName)
		c.subsMu.Unlock()
		c.releaseSubscriptionReplay()
		return nil
	}

	newTables := oldTables.clone()
	newMap := cloneMapSlice(oldMap)
	delete(newMap, feedName)
	setMap(newTables, newMap)
	c.subTables.Store(newTables)
	delete(c.activeFeeds, feedName)
	c.subsMu.Unlock()
	c.releaseSubscriptionReplay()
	closeSubscriptions(subs)

	if c.State() == StateConnected {
		var reqCtx context.Context
		if ctx != nil {
			reqCtx = ctx
		} else {
			var cancel context.CancelFunc
			reqCtx, cancel = context.WithTimeout(context.Background(), 5*time.Second)
			defer cancel()
		}
		req := RequestFrame{
			ID:     globalReqID.Add(1),
			Method: "UNSUBSCRIBE",
			Params: []string{feedName},
		}
		_, err := c.requestConnected(reqCtx, req.Method, req.Params)
		return err
	}
	return nil
}

func unsubscribePrivateFeedChannel[T any](
	ctx context.Context,
	c *Client,
	feedName string,
	target <-chan *T,
	getMap func(*subTables) map[string][]*subscription[T],
	setMap func(*subTables, map[string][]*subscription[T]),
) error {
	if target == nil {
		return nil
	}
	if err := c.acquireSubscriptionWire(ctx, feedName); err != nil {
		return err
	}
	defer c.releaseSubscriptionWire(feedName)
	if err := c.acquireSubscriptionReplay(ctx); err != nil {
		return err
	}

	c.subsMu.Lock()
	oldTables := c.subTables.Load()
	oldMap := getMap(oldTables)
	subs := oldMap[feedName]
	targetIndex := -1
	for i, sub := range subs {
		if sub.ch == target {
			targetIndex = i
			break
		}
	}
	if targetIndex < 0 {
		c.subsMu.Unlock()
		c.releaseSubscriptionReplay()
		return nil
	}

	remaining := make([]*subscription[T], 0, len(subs)-1)
	remaining = append(remaining, subs[:targetIndex]...)
	remaining = append(remaining, subs[targetIndex+1:]...)
	newTables := oldTables.clone()
	newMap := cloneMapSlice(oldMap)
	if len(remaining) == 0 {
		delete(newMap, feedName)
	} else {
		newMap[feedName] = remaining
	}
	setMap(newTables, newMap)
	c.subTables.Store(newTables)

	needWireUnsubscribe := len(remaining) == 0
	if needWireUnsubscribe {
		delete(c.activeFeeds, feedName)
	}
	sub := subs[targetIndex]

	if needWireUnsubscribe && c.State() == StateConnected {
		var reqCtx context.Context
		if ctx != nil {
			reqCtx = ctx
		} else {
			var cancel context.CancelFunc
			reqCtx, cancel = context.WithTimeout(context.Background(), 5*time.Second)
			defer cancel()
		}
		req := RequestFrame{
			ID:     globalReqID.Add(1),
			Method: "UNSUBSCRIBE",
			Params: []string{feedName},
		}
		c.subsMu.Unlock()
		c.releaseSubscriptionReplay()
		sub.close()
		_, err := c.requestConnected(reqCtx, req.Method, req.Params)
		return err
	}
	c.subsMu.Unlock()
	c.releaseSubscriptionReplay()
	sub.close()
	return nil
}

func removePublicSubscription[T any](
	c *Client,
	feedKey, symbol string,
	target *subscription[T],
	feedPrefix string,
	getMap func(*subTables) map[string][]*subscription[T],
	setMap func(*subTables, map[string][]*subscription[T]),
) {
	c.subsMu.Lock()
	oldTables := c.subTables.Load()
	current := getMap(oldTables)
	list := current[symbol]
	remaining := make([]*subscription[T], 0, len(list))
	found := false
	for _, sub := range list {
		if sub == target {
			found = true
			continue
		}
		remaining = append(remaining, sub)
	}
	if found {
		newTables := oldTables.clone()
		newMap := cloneMapSlice(current)
		if len(remaining) == 0 {
			delete(newMap, symbol)
		} else {
			newMap[symbol] = remaining
		}
		setMap(newTables, newMap)
		c.subTables.Store(newTables)
		if len(remaining) == 0 {
			delete(c.activeFeeds, feedKey)
			if feedPrefix == "depth" {
				delete(c.snapshotPending, symbol)
			}
		}
	}
	c.subsMu.Unlock()
	target.close()
}

func removePrivateSubscription[T any](
	c *Client,
	feedName string,
	target *subscription[T],
	getMap func(*subTables) map[string][]*subscription[T],
	setMap func(*subTables, map[string][]*subscription[T]),
) {
	c.subsMu.Lock()
	oldTables := c.subTables.Load()
	oldMap := getMap(oldTables)
	current := oldMap[feedName]
	remaining := make([]*subscription[T], 0, len(current))
	found := false
	for _, sub := range current {
		if sub == target {
			found = true
			continue
		}
		remaining = append(remaining, sub)
	}
	if found {
		newTables := oldTables.clone()
		newMap := cloneMapSlice(oldMap)
		if len(remaining) == 0 {
			delete(newMap, feedName)
		} else {
			newMap[feedName] = remaining
		}
		setMap(newTables, newMap)
		c.subTables.Store(newTables)
		if len(remaining) == 0 {
			delete(c.activeFeeds, feedName)
		}
	}
	c.subsMu.Unlock()
	target.close()
}

func (c *Client) markSnapshotPendingLocked(frame RequestFrame) {
	if !c.snapshotMode || len(frame.Params) == 0 {
		return
	}
	stream := frame.Params[0]
	symbol, ok := differentialDepthSymbol(stream)
	if !ok {
		return
	}
	c.snapshotPending[strings.ToUpper(symbol)] = c.subscriptionGeneration.Add(1)
}

func differentialDepthSymbol(stream string) (string, bool) {
	for _, suffix := range []string{"@depth@100ms", "@depth"} {
		if strings.HasSuffix(stream, suffix) {
			symbol := strings.TrimSuffix(stream, suffix)
			if symbol != "" {
				return symbol, true
			}
		}
	}
	return "", false
}

func (c *Client) consumeSnapshotPending(symbol string, frameGeneration uint64) bool {
	c.subsMu.Lock()
	defer c.subsMu.Unlock()
	pendingGeneration, ok := c.snapshotPending[strings.ToUpper(symbol)]
	if !ok || frameGeneration < pendingGeneration {
		return false
	}
	delete(c.snapshotPending, strings.ToUpper(symbol))
	return true
}

// SubscribeDepth creates a typed channel receiving incremental order book depth updates.
func (c *Client) SubscribeDepth(ctx context.Context, symbol string) (<-chan *DepthUpdate, error) {
	return c.SubscribeDepthWithOptions(ctx, symbol, DepthSubscriptionOptions{})
}

// SubscribeDepthWithOptions creates a typed differential depth stream with
// either the default cadence or the exchange's accelerated 100ms cadence.
func (c *Client) SubscribeDepthWithOptions(ctx context.Context, symbol string, options DepthSubscriptionOptions) (<-chan *DepthUpdate, error) {
	suffix, err := depthIntervalSuffix(options.Interval)
	if err != nil {
		return nil, err
	}
	if c.usesIsolatedSnapshots() {
		return c.subscribeIsolatedDepth(ctx, symbol, suffix)
	}
	return subscribePublicFeed(ctx, c, symbol, "depth", suffix, 256,
		func(t *subTables) map[string][]*subscription[DepthUpdate] { return t.depthSubs },
		func(t *subTables, m map[string][]*subscription[DepthUpdate]) { t.depthSubs = m },
	)
}

// SubscribePartialDepth creates a typed channel receiving top-of-book
// snapshots for 5, 10, or 20 levels. The shared Go WebSocket client permits one
// partial-depth variant per symbol because the exchange snapshot payload does
// not identify the subscribed level; a second subscriber to the same variant
// is multiplexed normally.
func (c *Client) SubscribePartialDepth(ctx context.Context, symbol string, options PartialDepthSubscriptionOptions) (<-chan *OrderBookSnapshot, error) {
	if c.usesIsolatedPartialSnapshots() {
		return c.subscribeIsolatedPartialDepth(ctx, symbol, options)
	}
	suffix, err := partialDepthStreamSuffix(options)
	if err != nil {
		return nil, err
	}
	return subscribePublicFeed(ctx, c, symbol, "partialDepth", suffix, 256,
		func(t *subTables) map[string][]*subscription[OrderBookSnapshot] { return t.partialDepthSubs },
		func(t *subTables, m map[string][]*subscription[OrderBookSnapshot]) { t.partialDepthSubs = m },
	)
}

// SubscribeTrades creates a typed channel receiving trade stream execution updates.
func (c *Client) SubscribeTrades(ctx context.Context, symbol string) (<-chan *TradeEvent, error) {
	return subscribePublicFeed(ctx, c, symbol, "trade", "trade", 256,
		func(t *subTables) map[string][]*subscription[TradeEvent] { return t.tradeSubs },
		func(t *subTables, m map[string][]*subscription[TradeEvent]) { t.tradeSubs = m },
	)
}

// SubscribeBookTicker creates a typed channel receiving best bid and offer updates.
func (c *Client) SubscribeBookTicker(ctx context.Context, symbol string) (<-chan *BookTicker, error) {
	return subscribePublicFeed(ctx, c, symbol, "bookTicker", "bookTicker", 256,
		func(t *subTables) map[string][]*subscription[BookTicker] { return t.tickerSubs },
		func(t *subTables, m map[string][]*subscription[BookTicker]) { t.tickerSubs = m },
	)
}

// SubscribeContractStatus creates a typed channel receiving prediction market contract status updates.
func (c *Client) SubscribeContractStatus(ctx context.Context, symbol string) (<-chan *ContractStatusEvent, error) {
	return subscribePublicFeed(ctx, c, symbol, "contractStatus", "contractStatus", 128,
		func(t *subTables) map[string][]*subscription[ContractStatusEvent] { return t.contractSubs },
		func(t *subTables, m map[string][]*subscription[ContractStatusEvent]) { t.contractSubs = m },
	)
}

// UnsubscribeDepth closes and removes depth subscription channels for a symbol.
func (c *Client) UnsubscribeDepth(ctx context.Context, symbol string) error {
	return c.UnsubscribeDepthWithOptions(ctx, symbol, DepthSubscriptionOptions{})
}

// UnsubscribeDepthWithOptions removes a differential depth subscription for
// the selected cadence.
func (c *Client) UnsubscribeDepthWithOptions(ctx context.Context, symbol string, options DepthSubscriptionOptions) error {
	suffix, err := depthIntervalSuffix(options.Interval)
	if err != nil {
		return err
	}
	if c.usesIsolatedSnapshots() {
		return c.unsubscribeIsolatedDepth(ctx, symbol, suffix)
	}
	return unsubscribePublicFeed(ctx, c, symbol, "depth", suffix,
		func(t *subTables) map[string][]*subscription[DepthUpdate] { return t.depthSubs },
		func(t *subTables, m map[string][]*subscription[DepthUpdate]) { t.depthSubs = m },
	)
}

// UnsubscribePartialDepth removes the selected partial-depth stream for a
// symbol and closes all local subscribers to that stream.
func (c *Client) UnsubscribePartialDepth(ctx context.Context, symbol string, options PartialDepthSubscriptionOptions) error {
	if c.usesIsolatedPartialSnapshots() {
		return c.unsubscribeIsolatedPartialDepth(ctx, symbol, options)
	}
	suffix, err := partialDepthStreamSuffix(options)
	if err != nil {
		return err
	}
	return unsubscribePublicFeed(ctx, c, symbol, "partialDepth", suffix,
		func(t *subTables) map[string][]*subscription[OrderBookSnapshot] { return t.partialDepthSubs },
		func(t *subTables, m map[string][]*subscription[OrderBookSnapshot]) { t.partialDepthSubs = m },
	)
}

// UnsubscribeTrades closes and removes trade subscription channels for a symbol.
func (c *Client) UnsubscribeTrades(ctx context.Context, symbol string) error {
	return unsubscribePublicFeed(ctx, c, symbol, "trade", "trade",
		func(t *subTables) map[string][]*subscription[TradeEvent] { return t.tradeSubs },
		func(t *subTables, m map[string][]*subscription[TradeEvent]) { t.tradeSubs = m },
	)
}

// UnsubscribeBookTicker closes and removes book ticker subscription channels for a symbol.
func (c *Client) UnsubscribeBookTicker(ctx context.Context, symbol string) error {
	return unsubscribePublicFeed(ctx, c, symbol, "bookTicker", "bookTicker",
		func(t *subTables) map[string][]*subscription[BookTicker] { return t.tickerSubs },
		func(t *subTables, m map[string][]*subscription[BookTicker]) { t.tickerSubs = m },
	)
}

// UnsubscribeContractStatus closes and removes contract status subscription channels for a symbol.
func (c *Client) UnsubscribeContractStatus(ctx context.Context, symbol string) error {
	return unsubscribePublicFeed(ctx, c, symbol, "contractStatus", "contractStatus",
		func(t *subTables) map[string][]*subscription[ContractStatusEvent] { return t.contractSubs },
		func(t *subTables, m map[string][]*subscription[ContractStatusEvent]) { t.contractSubs = m },
	)
}

// SubscribeOrderEvents creates a typed channel receiving authenticated order lifecycle events.
// Requires authentication configured on the WebSocket client.
func (c *Client) SubscribeOrderEvents(ctx context.Context) (<-chan *OrderEvent, error) {
	return c.SubscribeOrderEventsWithScope(ctx, ScopeAccount)
}

// SubscribeOrderEventsWithScope creates a typed order stream for the account
// or authenticated WebSocket session.
func (c *Client) SubscribeOrderEventsWithScope(ctx context.Context, scope SubscriptionScope) (<-chan *OrderEvent, error) {
	if scope != ScopeAccount && scope != ScopeSession {
		return nil, fmt.Errorf("gemini websocket: order stream scope must be account or session")
	}
	return subscribePrivateFeed(ctx, c, "orders@"+string(scope), 512,
		func(t *subTables) map[string][]*subscription[OrderEvent] { return t.orderSubs },
		func(t *subTables, m map[string][]*subscription[OrderEvent]) { t.orderSubs = m },
	)
}

// UnsubscribeOrderEvents closes and removes all active order event subscription channels.
func (c *Client) UnsubscribeOrderEvents(ctx context.Context) error {
	return c.UnsubscribeOrderEventsWithScope(ctx, ScopeAccount)
}

// UnsubscribeOrderEventsWithScope closes and removes all order event channels
// for the selected account or session scope.
func (c *Client) UnsubscribeOrderEventsWithScope(ctx context.Context, scope SubscriptionScope) error {
	if scope != ScopeAccount && scope != ScopeSession {
		return fmt.Errorf("gemini websocket: order stream scope must be account or session")
	}
	return unsubscribePrivateFeed(ctx, c, "orders@"+string(scope),
		func(t *subTables) map[string][]*subscription[OrderEvent] { return t.orderSubs },
		func(t *subTables, m map[string][]*subscription[OrderEvent]) { t.orderSubs = m },
	)
}

// UnsubscribeOrderEventsChannel closes and removes only the specified order
// event subscription channel. It leaves other order event subscribers active.
// If the channel was already removed by a disconnect or global unsubscribe,
// this method is a no-op.
func (c *Client) UnsubscribeOrderEventsChannel(ctx context.Context, ch <-chan *OrderEvent) error {
	return c.UnsubscribeOrderEventsChannelWithScope(ctx, ScopeAccount, ch)
}

// UnsubscribeOrderEventsChannelWithScope removes only the specified order
// event channel from the selected account or session scope.
func (c *Client) UnsubscribeOrderEventsChannelWithScope(ctx context.Context, scope SubscriptionScope, ch <-chan *OrderEvent) error {
	if scope != ScopeAccount && scope != ScopeSession {
		return fmt.Errorf("gemini websocket: order stream scope must be account or session")
	}
	return unsubscribePrivateFeedChannel(ctx, c, "orders@"+string(scope), ch,
		func(t *subTables) map[string][]*subscription[OrderEvent] { return t.orderSubs },
		func(t *subTables, m map[string][]*subscription[OrderEvent]) { t.orderSubs = m },
	)
}

// SubscribeBalances creates a typed channel receiving authenticated balance update events.
// Requires authentication configured on the WebSocket client.
func (c *Client) SubscribeBalances(ctx context.Context) (<-chan *BalanceUpdate, error) {
	return c.SubscribeBalancesWithOptions(ctx, AccountStreamOptions{})
}

// SubscribeBalancesWithOptions creates an authenticated balance stream with
// either live updates or one-second snapshots.
func (c *Client) SubscribeBalancesWithOptions(ctx context.Context, options AccountStreamOptions) (<-chan *BalanceUpdate, error) {
	feedName, err := accountStreamName("balances", options)
	if err != nil {
		return nil, err
	}
	return subscribePrivateFeed(ctx, c, feedName, 256,
		func(t *subTables) map[string][]*subscription[BalanceUpdate] { return t.balanceSubs },
		func(t *subTables, m map[string][]*subscription[BalanceUpdate]) { t.balanceSubs = m },
	)
}

// UnsubscribeBalances closes and removes all active balance event subscription channels.
func (c *Client) UnsubscribeBalances(ctx context.Context) error {
	return c.UnsubscribeBalancesWithOptions(ctx, AccountStreamOptions{})
}

// UnsubscribeBalancesWithOptions removes a balance stream with the selected
// cadence.
func (c *Client) UnsubscribeBalancesWithOptions(ctx context.Context, options AccountStreamOptions) error {
	feedName, err := accountStreamName("balances", options)
	if err != nil {
		return err
	}
	return unsubscribePrivateFeed(ctx, c, feedName,
		func(t *subTables) map[string][]*subscription[BalanceUpdate] { return t.balanceSubs },
		func(t *subTables, m map[string][]*subscription[BalanceUpdate]) { t.balanceSubs = m },
	)
}

// SubscribePositions creates a typed channel receiving authenticated position reports.
// Requires authentication configured on the WebSocket client.
func (c *Client) SubscribePositions(ctx context.Context) (<-chan *PositionReport, error) {
	return c.SubscribePositionsWithOptions(ctx, AccountStreamOptions{})
}

// SubscribePositionsWithOptions creates an authenticated position stream with
// either live updates or one-second snapshots.
func (c *Client) SubscribePositionsWithOptions(ctx context.Context, options AccountStreamOptions) (<-chan *PositionReport, error) {
	feedName, err := accountStreamName("positions", options)
	if err != nil {
		return nil, err
	}
	return subscribePrivateFeed(ctx, c, feedName, 256,
		func(t *subTables) map[string][]*subscription[PositionReport] { return t.positionSubs },
		func(t *subTables, m map[string][]*subscription[PositionReport]) { t.positionSubs = m },
	)
}

// UnsubscribePositions closes and removes all active position report subscription channels.
func (c *Client) UnsubscribePositions(ctx context.Context) error {
	return c.UnsubscribePositionsWithOptions(ctx, AccountStreamOptions{})
}

// UnsubscribePositionsWithOptions removes a position stream with the selected
// cadence.
func (c *Client) UnsubscribePositionsWithOptions(ctx context.Context, options AccountStreamOptions) error {
	feedName, err := accountStreamName("positions", options)
	if err != nil {
		return err
	}
	return unsubscribePrivateFeed(ctx, c, feedName,
		func(t *subTables) map[string][]*subscription[PositionReport] { return t.positionSubs },
		func(t *subTables, m map[string][]*subscription[PositionReport]) { t.positionSubs = m },
	)
}

// SubscribeSettlements creates a typed channel receiving authenticated contract settlement updates.
// Requires authentication configured on the WebSocket client.
func (c *Client) SubscribeSettlements(ctx context.Context) (<-chan *SettlementUpdate, error) {
	return subscribePrivateFeed(ctx, c, "settlements@account", 128,
		func(t *subTables) map[string][]*subscription[SettlementUpdate] { return t.settleSubs },
		func(t *subTables, m map[string][]*subscription[SettlementUpdate]) { t.settleSubs = m },
	)
}

// UnsubscribeSettlements closes and removes all active settlement update subscription channels.
func (c *Client) UnsubscribeSettlements(ctx context.Context) error {
	return unsubscribePrivateFeed(ctx, c, "settlements@account",
		func(t *subTables) map[string][]*subscription[SettlementUpdate] { return t.settleSubs },
		func(t *subTables, m map[string][]*subscription[SettlementUpdate]) { t.settleSubs = m },
	)
}
