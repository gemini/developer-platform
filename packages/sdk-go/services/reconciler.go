package services

import (
	"context"
	"errors"
	"fmt"
	"math"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"

	"github.com/gemini/gemini-go/generated/trading"
	"github.com/gemini/gemini-go/types"
	"github.com/gemini/gemini-go/websocket"
)

// DesiredQuote specifies an intended order for the target quoting grid.
type DesiredQuote struct {
	Side          string        // "buy" or "sell"
	Price         types.Decimal // Target unit price
	Amount        types.Decimal // Target order quantity
	ClientOrderID string        // Optional client order ID
}

// RestingOrder tracks an active order currently on the exchange order book.
type RestingOrder struct {
	OrderID        string
	ClientOrderID  string
	Side           string
	Price          types.Decimal
	Amount         types.Decimal
	OriginalAmount types.Decimal
}

// ReconcileResult summarizes the actions taken during a reconciliation cycle.
type ReconcileResult struct {
	Kept      int     // Orders left untouched (preserved FIFO queue priority)
	Cancelled int     // Stale/mispriced orders cancelled
	Placed    int     // New quotes successfully placed
	Errors    []error // Any non-fatal errors during execution
}

// Err returns the aggregate of all non-fatal errors recorded during the
// reconciliation cycle. Sync returns its result alongside a nil error when it
// can complete the cycle but some individual cancellations or placements
// fail; callers should check both the Sync error and this result error.
func (r *ReconcileResult) Err() error {
	if r == nil || len(r.Errors) == 0 {
		return nil
	}
	return errors.Join(r.Errors...)
}

// ErrStreamingAlreadyStarted indicates that a QuoteReconciler already has an
// active order-event stream. A reconciler must have at most one stream because
// each stream consumes and applies events to the same in-memory ledger.
var ErrStreamingAlreadyStarted = errors.New("gemini reconciler: streaming already started")

// ReconcilerOption configures the QuoteReconciler behavior.
type ReconcilerOption func(*QuoteReconciler)

// WithToleranceBps sets the maximum price drift allowed before an order is considered stale.
func WithToleranceBps(bps float64) ReconcilerOption {
	return func(r *QuoteReconciler) {
		r.toleranceBps = bps
	}
}

// WithQuantization enforces minimum tick and lot sizes on all desired quotes.
func WithQuantization(tickSize, lotSize types.Decimal) ReconcilerOption {
	return func(r *QuoteReconciler) {
		r.tickSize = tickSize
		r.lotSize = lotSize
	}
}

// WithMaxConcurrentRequests limits concurrent cancel and placement requests
// issued by a reconciliation cycle.
func WithMaxConcurrentRequests(limit int) ReconcilerOption {
	return func(r *QuoteReconciler) {
		if limit > 0 {
			r.maxConcurrent = limit
		}
	}
}

// WithAccount selects the exchange account used by the reconciler. It is
// required when the client authenticates with a Master API key.
func WithAccount(account string) ReconcilerOption {
	return func(r *QuoteReconciler) {
		r.account = strings.TrimSpace(account)
	}
}

// QuoteReconciler manages declarative order book quoting, computing minimal cancel-replace diffs.
// It prioritizes WebSocket order streams for low-latency state updates and falls back to HTTP/2 REST.
type QuoteReconciler struct {
	syncMu        sync.Mutex // Serializes whole Sync execution cycles
	streamMu      sync.Mutex
	streaming     bool
	mu            sync.RWMutex
	trading       *TradingService
	ws            *websocket.Client
	symbol        string
	account       string
	toleranceBps  float64
	tickSize      types.Decimal
	lotSize       types.Decimal
	maxConcurrent int
	resting       map[string]RestingOrder // Keyed by OrderID
}

// NewQuoteReconciler initializes a new smart quote reconciler for a trading symbol.
func NewQuoteReconciler(trading *TradingService, ws *websocket.Client, symbol string, opts ...ReconcilerOption) *QuoteReconciler {
	r := &QuoteReconciler{
		trading:       trading,
		ws:            ws,
		symbol:        strings.ToUpper(strings.TrimSpace(symbol)),
		toleranceBps:  0.0,
		tickSize:      types.Zero(),
		lotSize:       types.Zero(),
		maxConcurrent: 4,
		resting:       make(map[string]RestingOrder),
	}
	for _, opt := range opts {
		opt(r)
	}
	return r
}

func (r *QuoteReconciler) accountPointer() *string {
	if r.account == "" {
		return nil
	}
	account := r.account
	return &account
}

func validateCancelResponse(res *trading.CancelOrderResponse) error {
	if res == nil {
		return errors.New("gemini reconciler: cancel response was empty")
	}
	if res.IsLive != nil {
		if *res.IsLive {
			return errors.New("gemini reconciler: cancelled order is still live")
		}
		return nil
	}
	if res.IsCancelled != nil && *res.IsCancelled {
		return nil
	}
	return errors.New("gemini reconciler: cancel response did not prove that the order is no longer live")
}

// Hydrate queries current open orders from the exchange to initialize the in-memory ledger.
func (r *QuoteReconciler) Hydrate(ctx context.Context) error {
	if ctx == nil {
		return fmt.Errorf("gemini reconciler: nil context")
	}
	if r.trading == nil {
		return fmt.Errorf("gemini reconciler: trading service not configured")
	}
	r.syncMu.Lock()
	defer r.syncMu.Unlock()
	orders, err := r.trading.GetActiveOrders(ctx, &trading.ListActiveOrdersJSONBody{
		Account: r.accountPointer(),
	})
	if err != nil {
		return err
	}

	r.mu.Lock()
	defer r.mu.Unlock()

	r.resting = make(map[string]RestingOrder, len(orders))
	for _, o := range orders {
		if o.Symbol != nil && strings.ToUpper(strings.TrimSpace(*o.Symbol)) != r.symbol {
			continue
		}
		if o.OrderId == nil || o.Price == nil || o.OriginalAmount == nil {
			continue
		}
		p, errP := types.ParseDecimal(*o.Price)
		a, errA := types.ParseDecimal(*o.OriginalAmount)
		if errP != nil || errA != nil {
			continue
		}

		origAmount := a
		if o.ExecutedAmount != nil {
			if exec, errExec := types.ParseDecimal(*o.ExecutedAmount); errExec == nil && exec.IsPositive() {
				a = a.Sub(exec)
			}
		}
		if !a.IsPositive() {
			continue
		}

		sideStr := ""
		if o.Side != nil {
			switch *o.Side {
			case trading.LimitOrderResponseSideBuy:
				sideStr = "buy"
			case trading.LimitOrderResponseSideSell:
				sideStr = "sell"
			}
		}
		if sideStr == "" {
			continue
		}

		clientOrdID := ""
		if o.ClientOrderId != nil {
			clientOrdID = *o.ClientOrderId
		}

		r.resting[*o.OrderId] = RestingOrder{
			OrderID:        *o.OrderId,
			ClientOrderID:  clientOrdID,
			Side:           sideStr,
			Price:          p,
			Amount:         a,
			OriginalAmount: origAmount,
		}
	}
	return nil
}

// Sync compares desired target quotes against resting orders, executes the minimal diff concurrently, and updates state.
func (r *QuoteReconciler) Sync(ctx context.Context, targets []DesiredQuote) (*ReconcileResult, error) {
	r.syncMu.Lock()
	defer r.syncMu.Unlock()

	if ctx == nil {
		return nil, fmt.Errorf("gemini reconciler: nil context")
	}
	if r.trading == nil {
		return nil, fmt.Errorf("gemini reconciler: trading service not configured")
	}
	cleanTargets, err := r.normalizeTargets(targets)
	if err != nil {
		return nil, err
	}

	result := &ReconcileResult{
		Errors: make([]error, 0),
	}

	// 2. Diff Matching (Under Read Lock): Find which resting orders match target quotes
	var toCancel []RestingOrder
	var toPlace []DesiredQuote

	r.mu.RLock()
	matchedResting := make(map[string]bool)
	matchedTargets := make(map[int]bool)

	for tIdx, target := range cleanTargets {
		for ordID, ord := range r.resting {
			if matchedResting[ordID] {
				continue
			}
			if ord.Side != target.Side {
				continue
			}

			// Check exact price or within tolerance bps AND amount equality
			priceMatch := false
			if ord.Price.Cmp(target.Price) == 0 {
				priceMatch = true
			} else if r.toleranceBps > 0 {
				if diffBps, err := ord.Price.BpsDiffChecked(target.Price); err == nil && math.Abs(diffBps) <= r.toleranceBps {
					priceMatch = true
				}
			}

			amountMatch := ord.Amount.Cmp(target.Amount) == 0

			if priceMatch && amountMatch {
				matchedResting[ordID] = true
				matchedTargets[tIdx] = true
				result.Kept++
				break
			}
		}
	}

	for ordID, ord := range r.resting {
		if !matchedResting[ordID] {
			toCancel = append(toCancel, ord)
		}
	}
	r.mu.RUnlock()

	for tIdx, target := range cleanTargets {
		if !matchedTargets[tIdx] {
			toPlace = append(toPlace, target)
		}
	}

	// 3. Phase 1: Cancels (Concurrent Dispatch - No Lock Held)
	var cancelMu sync.Mutex
	var cancelledOrders []RestingOrder
	cancelErr := runBounded(ctx, r.maxConcurrent, toCancel, func(o RestingOrder) {
		if ctx.Err() != nil {
			cancelMu.Lock()
			result.Errors = append(result.Errors, fmt.Errorf("cancelling order %s: %w", o.OrderID, ctx.Err()))
			cancelMu.Unlock()
			return
		}
		idInt, errParse := strconv.ParseInt(o.OrderID, 10, 64)
		if errParse != nil {
			cancelMu.Lock()
			result.Errors = append(result.Errors, fmt.Errorf("invalid order id %s: %w", o.OrderID, errParse))
			cancelMu.Unlock()
			return
		}
		req := &trading.CancelOrderRequest{
			OrderId: idInt,
			Account: r.accountPointer(),
		}
		res, err := r.trading.CancelOrder(ctx, req)
		if err == nil {
			err = validateCancelResponse(res)
		}
		cancelMu.Lock()
		if err != nil {
			result.Errors = append(result.Errors, fmt.Errorf("failed to cancel order %s: %w", o.OrderID, err))
		} else {
			cancelledOrders = append(cancelledOrders, o)
			result.Cancelled++
		}
		cancelMu.Unlock()
	})
	if cancelErr != nil {
		cancelMu.Lock()
		result.Errors = append(result.Errors, fmt.Errorf("cancelling quotes: %w", cancelErr))
		cancelMu.Unlock()
	}

	// Apply successful cancellations to resting state
	if len(cancelledOrders) > 0 {
		r.mu.Lock()
		for _, cancelled := range cancelledOrders {
			deleteRestingIfUnchanged(r.resting, cancelled)
		}
		r.mu.Unlock()
	}
	// Never place replacement orders after a cancellation phase that was not
	// fully successful. Doing so can temporarily (or permanently) exceed the
	// caller's intended exposure when an old order is still live.
	if len(result.Errors) > 0 {
		return result, nil
	}

	// 4. Phase 2: Placements (Concurrent Dispatch - No Lock Held)
	var placeMu sync.Mutex
	var placedOrders []RestingOrder
	placeErr := runBounded(ctx, r.maxConcurrent, toPlace, func(t DesiredQuote) {
		if ctx.Err() != nil {
			placeMu.Lock()
			result.Errors = append(result.Errors, fmt.Errorf("placing %s quote: %w", t.Side, ctx.Err()))
			placeMu.Unlock()
			return
		}
		var res *trading.LimitOrderResponse
		var err error

		var opts []OrderOption
		if t.ClientOrderID != "" {
			opts = append(opts, WithClientOrderID(t.ClientOrderID))
		}
		if r.account != "" {
			opts = append(opts, withOrderAccount(r.account))
		}

		if t.Side == "buy" {
			res, err = r.trading.PostOnlyBid(ctx, r.symbol, t.Amount, t.Price, opts...)
		} else if t.Side == "sell" {
			res, err = r.trading.PostOnlyAsk(ctx, r.symbol, t.Amount, t.Price, opts...)
		} else {
			err = fmt.Errorf("invalid order side %q (must be 'buy' or 'sell')", t.Side)
		}
		if err == nil && res != nil && ((res.IsCancelled != nil && *res.IsCancelled) || (res.IsLive != nil && !*res.IsLive)) {
			err = fmt.Errorf("exchange did not leave the order live")
		}

		placeMu.Lock()
		if err != nil {
			result.Errors = append(result.Errors, fmt.Errorf("failed to place %s quote @ %s: %w", t.Side, t.Price.String(), err))
		} else if res == nil || res.OrderId == nil || strings.TrimSpace(*res.OrderId) == "" {
			result.Errors = append(result.Errors, fmt.Errorf("failed to place %s quote @ %s: exchange returned no order ID", t.Side, t.Price.String()))
		} else {
			result.Placed++
			placedOrders = append(placedOrders, RestingOrder{
				OrderID:        *res.OrderId,
				ClientOrderID:  t.ClientOrderID,
				Side:           t.Side,
				Price:          t.Price,
				Amount:         t.Amount,
				OriginalAmount: t.Amount,
			})
		}
		placeMu.Unlock()
	})
	if placeErr != nil {
		placeMu.Lock()
		result.Errors = append(result.Errors, fmt.Errorf("placing quotes: %w", placeErr))
		placeMu.Unlock()
	}

	// Apply successful placements to resting state without clobbering fresher WebSocket updates
	if len(placedOrders) > 0 {
		r.mu.Lock()
		for _, p := range placedOrders {
			if _, exists := r.resting[p.OrderID]; !exists {
				r.resting[p.OrderID] = p
			}
		}
		r.mu.Unlock()
	}

	return result, nil
}

// runBounded executes at most max workers. A semaphore alone would bound
// requests but still create one goroutine per quote; workers keep memory and
// scheduler overhead proportional to the configured concurrency.
func runBounded[T any](ctx context.Context, max int, items []T, fn func(T)) error {
	if len(items) == 0 {
		return nil
	}
	if max <= 0 || max > len(items) {
		max = len(items)
	}
	var next atomic.Int64
	var wg sync.WaitGroup
	wg.Add(max)
	for i := 0; i < max; i++ {
		go func() {
			defer wg.Done()
			for {
				if ctx.Err() != nil {
					return
				}
				idx := int(next.Add(1) - 1)
				if idx >= len(items) {
					return
				}
				fn(items[idx])
			}
		}()
	}
	wg.Wait()
	return ctx.Err()
}

func (r *QuoteReconciler) normalizeTargets(targets []DesiredQuote) ([]DesiredQuote, error) {
	if r.symbol == "" {
		return nil, fmt.Errorf("gemini reconciler: symbol is required")
	}
	if math.IsNaN(r.toleranceBps) || math.IsInf(r.toleranceBps, 0) || r.toleranceBps < 0 {
		return nil, fmt.Errorf("gemini reconciler: tolerance must be finite and non-negative")
	}
	if (!r.tickSize.IsZero() && !r.tickSize.IsPositive()) || (!r.lotSize.IsZero() && !r.lotSize.IsPositive()) {
		return nil, fmt.Errorf("gemini reconciler: tick and lot sizes must be positive")
	}

	cleanTargets := make([]DesiredQuote, 0, len(targets))
	seen := make(map[string]struct{}, len(targets))
	for _, target := range targets {
		q := target
		q.Side = strings.ToLower(strings.TrimSpace(q.Side))
		if q.Side != "buy" && q.Side != "sell" {
			return nil, fmt.Errorf("gemini reconciler: invalid order side %q", target.Side)
		}
		if !q.Price.IsPositive() || !q.Amount.IsPositive() {
			return nil, fmt.Errorf("gemini reconciler: price and amount must be positive for %s quote", q.Side)
		}
		if !r.tickSize.IsZero() {
			q.Price = q.Price.QuantizePrice(r.tickSize)
		}
		if !r.lotSize.IsZero() {
			q.Amount = q.Amount.QuantizeAmount(r.lotSize)
		}
		if !q.Price.IsPositive() || !q.Amount.IsPositive() {
			return nil, fmt.Errorf("gemini reconciler: quantization produced a non-positive %s quote", q.Side)
		}
		key := q.Side + "|" + q.Price.String() + "|" + q.Amount.String()
		if _, exists := seen[key]; exists {
			return nil, fmt.Errorf("gemini reconciler: duplicate target quote %s", key)
		}
		seen[key] = struct{}{}
		cleanTargets = append(cleanTargets, q)
	}
	return cleanTargets, nil
}

// ActiveOrders returns a snapshot of currently tracked resting orders.
func (r *QuoteReconciler) ActiveOrders() []RestingOrder {
	r.mu.RLock()
	defer r.mu.RUnlock()

	res := make([]RestingOrder, 0, len(r.resting))
	for _, o := range r.resting {
		res = append(res, o)
	}
	return res
}

// CancelAll performs an emergency purge of all tracked orders on the exchange.
func (r *QuoteReconciler) CancelAll(ctx context.Context) error {
	if ctx == nil {
		return fmt.Errorf("gemini reconciler: nil context")
	}
	if r.trading == nil {
		return fmt.Errorf("gemini reconciler: trading service not configured")
	}
	r.syncMu.Lock()
	defer r.syncMu.Unlock()

	r.mu.RLock()
	orders := make([]RestingOrder, 0, len(r.resting))
	for _, order := range r.resting {
		orders = append(orders, order)
	}
	r.mu.RUnlock()

	var cancelMu sync.Mutex
	var failures []error
	var cancelledOrders []RestingOrder
	if err := runBounded(ctx, r.maxConcurrent, orders, func(order RestingOrder) {
		id, err := strconv.ParseInt(order.OrderID, 10, 64)
		if err != nil {
			cancelMu.Lock()
			failures = append(failures, fmt.Errorf("invalid order id %s: %w", order.OrderID, err))
			cancelMu.Unlock()
			return
		}
		res, err := r.trading.CancelOrder(ctx, &trading.CancelOrderRequest{
			Account: r.accountPointer(),
			OrderId: id,
		})
		if err == nil {
			err = validateCancelResponse(res)
		}
		if err != nil {
			cancelMu.Lock()
			failures = append(failures, fmt.Errorf("failed to cancel order %s: %w", order.OrderID, err))
			cancelMu.Unlock()
			return
		}
		cancelMu.Lock()
		cancelledOrders = append(cancelledOrders, order)
		cancelMu.Unlock()
	}); err != nil {
		failures = append(failures, fmt.Errorf("cancelling orders: %w", err))
	}

	if len(cancelledOrders) > 0 {
		r.mu.Lock()
		for _, cancelled := range cancelledOrders {
			deleteRestingIfUnchanged(r.resting, cancelled)
		}
		r.mu.Unlock()
	}
	if len(failures) > 0 {
		return errors.Join(failures...)
	}
	return nil
}

// deleteRestingIfUnchanged removes an order only when the ledger still holds
// the same snapshot that was cancelled. A WebSocket event may update the
// order while the REST cancellation is in flight; retaining that newer state
// is safer than allowing a stale cancellation result to erase it.
func deleteRestingIfUnchanged(resting map[string]RestingOrder, expected RestingOrder) {
	current, ok := resting[expected.OrderID]
	if !ok || !sameRestingOrder(current, expected) {
		return
	}
	delete(resting, expected.OrderID)
}

func sameRestingOrder(a, b RestingOrder) bool {
	return a.OrderID == b.OrderID &&
		a.ClientOrderID == b.ClientOrderID &&
		a.Side == b.Side &&
		a.Price.Cmp(b.Price) == 0 &&
		a.Amount.Cmp(b.Amount) == 0 &&
		a.OriginalAmount.Cmp(b.OriginalAmount) == 0
}
