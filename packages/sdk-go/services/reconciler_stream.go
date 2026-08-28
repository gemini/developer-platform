package services

import (
	"context"
	"fmt"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/gemini/gemini-go/types"
	"github.com/gemini/gemini-go/websocket"
)

const maxPendingOrderEvents = 4096

type orderEventKey websocket.OrderEvent

func enqueuePendingOrderEvent(pending []*websocket.OrderEvent, pendingKeys map[orderEventKey]struct{}, evt *websocket.OrderEvent) ([]*websocket.OrderEvent, bool) {
	if key, ok := orderEventKeyFor(evt); ok {
		if _, seen := pendingKeys[key]; seen {
			return pending, true
		}
		if len(pending) >= maxPendingOrderEvents {
			return pending, false
		}
		pendingKeys[key] = struct{}{}
	} else if len(pending) >= maxPendingOrderEvents {
		return pending, false
	}
	return append(pending, evt), true
}

// ApplyOrderEvent updates the in-memory state ledger based on incoming WebSocket order events.
func (r *QuoteReconciler) ApplyOrderEvent(evt *websocket.OrderEvent) {
	if evt == nil || (evt.Symbol != "" && strings.ToUpper(strings.TrimSpace(evt.Symbol)) != r.symbol) {
		return
	}
	if evt.OrderID <= 0 {
		return
	}

	r.mu.Lock()
	defer r.mu.Unlock()

	ordID := strconv.FormatInt(evt.OrderID, 10)
	status := strings.ToUpper(evt.OrderStatus)
	side := strings.ToLower(strings.TrimSpace(evt.Side))

	switch status {
	case "NEW", "ACCEPTED", "BOOKED", "OPEN":
		p, errP := types.ParseDecimal(evt.Price)
		q, errQ := types.ParseDecimal(evt.Quantity)
		if (side == "buy" || side == "sell") && errP == nil && errQ == nil && p.IsPositive() && q.IsPositive() {
			r.resting[ordID] = RestingOrder{
				OrderID:        ordID,
				ClientOrderID:  evt.ClientOrderID,
				Side:           side,
				Price:          p,
				Amount:         q,
				OriginalAmount: q,
			}
		}

	case "MODIFIED", "AMENDED", "REPLACED":
		p, errP := types.ParseDecimal(evt.Price)
		original, errOriginal := types.ParseDecimal(evt.Quantity)
		if errP == nil && errOriginal == nil && p.IsPositive() && original.IsPositive() {
			remaining := original
			if strings.TrimSpace(evt.RemainingQty) != "" {
				parsedRemaining, errRemaining := types.ParseDecimal(evt.RemainingQty)
				if errRemaining != nil || parsedRemaining.GreaterThan(original) {
					return
				}
				if !parsedRemaining.IsPositive() {
					delete(r.resting, ordID)
					return
				}
				remaining = parsedRemaining
			}
			if current, exists := r.resting[ordID]; exists {
				if evt.Side != "" && side != "buy" && side != "sell" {
					return
				}
				current.Price = p
				current.Amount = remaining
				current.OriginalAmount = original
				if evt.ClientOrderID != "" {
					current.ClientOrderID = evt.ClientOrderID
				}
				if evt.Side != "" {
					current.Side = side
				}
				r.resting[ordID] = current
			} else if side == "buy" || side == "sell" {
				r.resting[ordID] = RestingOrder{
					OrderID:        ordID,
					ClientOrderID:  evt.ClientOrderID,
					Side:           side,
					Price:          p,
					Amount:         remaining,
					OriginalAmount: original,
				}
			}
		}

	case "CANCELED", "CANCELLED", "FILLED", "EXPIRED", "REJECTED":
		delete(r.resting, ordID)

	case "PARTIALLY_FILLED":
		rem, errRem := types.ParseDecimal(evt.RemainingQty)
		if errRem == nil && rem.IsPositive() {
			if current, exists := r.resting[ordID]; exists {
				if rem.GreaterThan(current.OriginalAmount) {
					return
				}
				current.Amount = rem
				r.resting[ordID] = current
			} else {
				p, errP := types.ParseDecimal(evt.Price)
				q, errQ := types.ParseDecimal(evt.Quantity)
				if errP != nil || !p.IsPositive() || (side != "buy" && side != "sell") {
					return
				}
				if errQ != nil || !q.IsPositive() {
					q = rem
				} else if q.LessThan(rem) {
					return
				}
				r.resting[ordID] = RestingOrder{
					OrderID:        ordID,
					ClientOrderID:  evt.ClientOrderID,
					Side:           side,
					Price:          p,
					Amount:         rem,
					OriginalAmount: q,
				}
			}
		} else if errRem == nil && !rem.IsPositive() {
			delete(r.resting, ordID)
		}
	}
}

// StartStreaming begins listening to real-time WebSocket order events to continuously synchronize the in-memory ledger.
func (r *QuoteReconciler) StartStreaming(ctx context.Context) (<-chan error, error) {
	if r.ws == nil {
		return nil, fmt.Errorf("websocket client not configured")
	}
	if ctx == nil {
		ctx = context.Background()
	}
	r.streamMu.Lock()
	if r.streaming {
		r.streamMu.Unlock()
		return nil, ErrStreamingAlreadyStarted
	}
	r.streaming = true
	r.streamMu.Unlock()

	connectionEvents, stopConnectionEvents := r.ws.SubscribeConnectionEvents(16)
	// Subscribe before hydrating so order events cannot arrive in the gap
	// between the REST snapshot and WebSocket registration. The reader starts
	// immediately and buffers events until hydration establishes a base state,
	// then replays them while holding the handoff lock to preserve order.
	ch, err := r.ws.SubscribeOrderEvents(ctx)
	if err != nil {
		stopConnectionEvents()
		r.streamMu.Lock()
		r.streaming = false
		r.streamMu.Unlock()
		return nil, fmt.Errorf("failed to subscribe order events: %w", err)
	}

	errChan := make(chan error, 1)
	streamCtx, cancel := context.WithCancel(ctx)
	var handoffMu sync.Mutex
	var hydrationMu sync.Mutex
	var hydrationGeneration uint64
	hydrating := true
	recovering := false
	pending := make([]*websocket.OrderEvent, 0, 64)
	pendingKeys := make(map[orderEventKey]struct{}, 64)
	var pendingErr error

	hydrateAndReplay := func(hydrateCtx context.Context) error {
		hydrationMu.Lock()
		defer hydrationMu.Unlock()

		handoffMu.Lock()
		generation := hydrationGeneration
		handoffMu.Unlock()

		if err := r.Hydrate(hydrateCtx); err != nil {
			handoffMu.Lock()
			stale := generation != hydrationGeneration
			handoffMu.Unlock()
			if stale {
				return nil
			}
			return err
		}

		// Swap batches under the handoff lock, then apply them outside the
		// lock. New events continue accumulating while replay performs the
		// potentially expensive ledger updates; the loop closes the handoff
		// only after all events observed during replay have also been applied.
		for {
			handoffMu.Lock()
			if generation != hydrationGeneration {
				handoffMu.Unlock()
				return nil
			}
			if pendingErr != nil {
				err := pendingErr
				handoffMu.Unlock()
				return err
			}
			batch := pending
			pending = nil
			if len(batch) == 0 {
				pendingKeys = nil
				pendingErr = nil
				hydrating = false
				handoffMu.Unlock()
				return nil
			}
			handoffMu.Unlock()

			for _, evt := range batch {
				r.ApplyOrderEvent(evt)
			}
		}
	}

	go func() {
		defer stopConnectionEvents()
		defer func() {
			r.streamMu.Lock()
			r.streaming = false
			r.streamMu.Unlock()
		}()
		defer cancel()
		defer func() {
			cleanupCtx, cleanupCancel := context.WithTimeout(context.Background(), 5*time.Second)
			defer cleanupCancel()
			_ = r.ws.UnsubscribeOrderEventsChannel(cleanupCtx, ch)
			close(errChan)
		}()
		for {
			select {
			case <-streamCtx.Done():
				return
			case event, ok := <-connectionEvents:
				if !ok {
					if streamCtx.Err() == nil && r.ws.State() != websocket.StateClosed {
						select {
						case errChan <- fmt.Errorf("gemini reconciler: connection event stream closed unexpectedly"):
						default:
						}
						return
					}
					connectionEvents = nil
					continue
				}
				switch event.State {
				case websocket.StateReconnecting:
					if !recovering {
						handoffMu.Lock()
						hydrationGeneration++
						hydrating = true
						pending = pending[:0]
						pendingKeys = make(map[orderEventKey]struct{}, 64)
						pendingErr = nil
						handoffMu.Unlock()
						recovering = true
					}
				case websocket.StateConnected:
					if !recovering {
						continue
					}
					if err := hydrateAndReplay(streamCtx); err != nil {
						if streamCtx.Err() == nil {
							select {
							case errChan <- fmt.Errorf("gemini reconciler: reconnect hydration failed: %w", err):
							default:
							}
						}
						return
					}
					recovering = false
				}
			case evt, ok := <-ch:
				if !ok {
					select {
					case errChan <- fmt.Errorf("gemini reconciler: order event stream closed unexpectedly"):
					default:
					}
					return
				}
				if evt == nil {
					continue
				}
				handoffMu.Lock()
				if hydrating {
					var queued bool
					pending, queued = enqueuePendingOrderEvent(pending, pendingKeys, evt)
					if !queued {
						if pendingErr == nil {
							pendingErr = fmt.Errorf("gemini reconciler: pending order event buffer exceeded %d events; resynchronization required", maxPendingOrderEvents)
						}
						handoffMu.Unlock()
						continue
					}
					handoffMu.Unlock()
					continue
				}
				r.ApplyOrderEvent(evt)
				handoffMu.Unlock()
			}
		}
	}()

	// Hydrate after the stream is active. Events received during this request
	// are replayed below, eliminating the REST-to-WebSocket startup race.
	if err := hydrateAndReplay(ctx); err != nil {
		cancel()
		stopConnectionEvents()
		cleanupCtx, cleanupCancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cleanupCancel()
		_ = r.ws.UnsubscribeOrderEventsChannel(cleanupCtx, ch)
		return nil, fmt.Errorf("initial hydration failed: %w", err)
	}

	return errChan, nil
}

// orderEventKeyFor provides startup-window deduplication for repeated
// deliveries. The order stream does not expose a single documented event ID,
// so the complete typed event payload is used as a comparable allocation-free
// key for this handoff.
func orderEventKeyFor(evt *websocket.OrderEvent) (orderEventKey, bool) {
	if evt == nil {
		return orderEventKey{}, false
	}
	return orderEventKey(*evt), true
}
