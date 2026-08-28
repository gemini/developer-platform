package services_test

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/gemini/gemini-go/generated/trading"
	"github.com/gemini/gemini-go/services"
	"github.com/gemini/gemini-go/transport"
	"github.com/gemini/gemini-go/types"
	"github.com/gemini/gemini-go/websocket"
)

func TestReconcileResult_ErrAggregatesPartialFailures(t *testing.T) {
	result := &services.ReconcileResult{Errors: []error{services.ErrStreamingAlreadyStarted, context.Canceled}}
	if err := result.Err(); err == nil {
		t.Fatal("expected aggregate reconciliation error")
	} else {
		if !errors.Is(err, services.ErrStreamingAlreadyStarted) {
			t.Fatalf("aggregate error does not retain first cause: %v", err)
		}
		if !errors.Is(err, context.Canceled) {
			t.Fatalf("aggregate error does not retain second cause: %v", err)
		}
	}
	if (&services.ReconcileResult{}).Err() != nil {
		t.Fatal("expected no error for a successful reconciliation result")
	}
}

func TestQuoteReconciler_StateDiff(t *testing.T) {
	var cancelCalls int32
	var placeCalls int32
	var mu sync.Mutex
	var orderCounter int64 = 1000

	server := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")

		switch r.URL.Path {
		case "/v1/orders":
			// Return initial resting orders:
			// Order 1: Buy 0.05 BTC @ 64950.00
			// Order 2: Buy 0.05 BTC @ 64880.00 (Stale)
			// Order 3: Sell 0.05 BTC @ 65050.00
			// Order 4: Sell 0.05 BTC @ 65100.00
			ord1 := "101"
			ord2 := "102"
			ord3 := "103"
			ord4 := "104"
			sym := "BTCUSD"
			p1, p2, p3, p4 := "64950.00", "64880.00", "65050.00", "65100.00"
			amt := "0.05"
			sideBuy := trading.LimitOrderResponseSideBuy
			sideSell := trading.LimitOrderResponseSideSell

			orders := []trading.LimitOrderResponse{
				{OrderId: &ord1, Symbol: &sym, Price: &p1, OriginalAmount: &amt, Side: &sideBuy},
				{OrderId: &ord2, Symbol: &sym, Price: &p2, OriginalAmount: &amt, Side: &sideBuy},
				{OrderId: &ord3, Symbol: &sym, Price: &p3, OriginalAmount: &amt, Side: &sideSell},
				{OrderId: &ord4, Symbol: &sym, Price: &p4, OriginalAmount: &amt, Side: &sideSell},
			}
			_ = json.NewEncoder(w).Encode(orders)

		case "/v1/order/cancel":
			atomic.AddInt32(&cancelCalls, 1)
			_ = json.NewEncoder(w).Encode(trading.CancelOrderResponse{IsCancelled: ptrBool(true), IsLive: ptrBool(false)})

		case "/v1/order/new":
			atomic.AddInt32(&placeCalls, 1)
			mu.Lock()
			orderCounter++
			newID := fmt.Sprintf("ord-%d", orderCounter)
			mu.Unlock()

			sym := "BTCUSD"
			res := trading.LimitOrderResponse{
				OrderId: &newID,
				Symbol:  &sym,
			}
			_ = json.NewEncoder(w).Encode(res)
		}
	}))
	defer server.Close()

	trans := transport.NewClient(transport.WithHTTPClient(server.Client()))
	tradingSvc := services.NewTradingService(trans, server.URL)

	reconciler := services.NewQuoteReconciler(tradingSvc, nil, "BTCUSD",
		services.WithToleranceBps(0.5),
		services.WithQuantization(types.MustParseDecimal("0.01"), types.MustParseDecimal("0.0001")),
	)

	ctx := context.Background()

	// 1. Hydrate state
	if err := reconciler.Hydrate(ctx); err != nil {
		t.Fatalf("Hydrate failed: %v", err)
	}

	active := reconciler.ActiveOrders()
	if len(active) != 4 {
		t.Fatalf("expected 4 active orders after hydration, got %d", len(active))
	}

	// 2. Define target desired quotes:
	// - Buy 0.05 @ 64950.00 (Matches resting 101 -> KEPT, 0 API calls)
	// - Buy 0.05 @ 64900.00 (New -> PLACED)
	// - Buy 0.05 @ 64850.00 (New -> PLACED)
	// - Sell 0.05 @ 65050.00 (Matches resting 103 -> KEPT, 0 API calls)
	// - Sell 0.05 @ 65100.00 (Matches resting 104 -> KEPT, 0 API calls)
	// - Sell 0.05 @ 65150.00 (New -> PLACED)
	// (Resting 102 @ 64880.00 is obsolete -> CANCELLED)
	size := types.MustParseDecimal("0.05")
	targets := []services.DesiredQuote{
		{Side: "buy", Price: types.MustParseDecimal("64950.00"), Amount: size},
		{Side: "buy", Price: types.MustParseDecimal("64900.00"), Amount: size},
		{Side: "buy", Price: types.MustParseDecimal("64850.00"), Amount: size},
		{Side: "sell", Price: types.MustParseDecimal("65050.00"), Amount: size},
		{Side: "sell", Price: types.MustParseDecimal("65100.00"), Amount: size},
		{Side: "sell", Price: types.MustParseDecimal("65150.00"), Amount: size},
	}

	result, err := reconciler.Sync(ctx, targets)
	if err != nil {
		t.Fatalf("Sync failed: %v", err)
	}

	if result.Kept != 3 {
		t.Errorf("expected 3 kept orders, got %d", result.Kept)
	}
	if result.Cancelled != 1 {
		t.Errorf("expected 1 cancelled order, got %d", result.Cancelled)
	}
	if result.Placed != 3 {
		t.Errorf("expected 3 placed orders, got %d", result.Placed)
	}
	if len(result.Errors) > 0 {
		t.Errorf("unexpected errors during sync: %v", result.Errors)
	}

	if atomic.LoadInt32(&cancelCalls) != 1 {
		t.Errorf("expected 1 cancel HTTP call, got %d", cancelCalls)
	}
	if atomic.LoadInt32(&placeCalls) != 3 {
		t.Errorf("expected 3 place HTTP calls, got %d", placeCalls)
	}
}

func TestQuoteReconciler_PreservesNewerEventDuringCancellation(t *testing.T) {
	cancelStarted := make(chan struct{})
	releaseCancel := make(chan struct{})
	var cancelOnce sync.Once

	server := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v1/order/cancel" {
			http.NotFound(w, r)
			return
		}
		cancelOnce.Do(func() { close(cancelStarted) })
		<-releaseCancel
		_ = json.NewEncoder(w).Encode(trading.CancelOrderResponse{
			IsCancelled: ptrBool(true),
			IsLive:      ptrBool(false),
		})
	}))
	defer server.Close()

	reconciler := services.NewQuoteReconciler(
		services.NewTradingService(
			transport.NewClient(transport.WithHTTPClient(server.Client())),
			server.URL,
		),
		nil,
		"BTCUSD",
	)
	reconciler.ApplyOrderEvent(&websocket.OrderEvent{
		EventType:   "order",
		Symbol:      "BTCUSD",
		OrderID:     9001,
		Side:        "BUY",
		Price:       "100",
		Quantity:    "1",
		OrderStatus: "NEW",
	})

	resultCh := make(chan *services.ReconcileResult, 1)
	errCh := make(chan error, 1)
	go func() {
		result, err := reconciler.Sync(context.Background(), nil)
		resultCh <- result
		errCh <- err
	}()

	select {
	case <-cancelStarted:
	case <-time.After(time.Second):
		t.Fatal("cancellation request did not start")
	}

	// This event represents newer state observed while the REST cancellation
	// was in flight. The stale cancellation result must not erase it.
	reconciler.ApplyOrderEvent(&websocket.OrderEvent{
		EventType:    "order",
		Symbol:       "BTCUSD",
		OrderID:      9001,
		Side:         "BUY",
		OrderStatus:  "PARTIALLY_FILLED",
		RemainingQty: "0.5",
	})
	close(releaseCancel)

	select {
	case err := <-errCh:
		if err != nil {
			t.Fatalf("Sync failed: %v", err)
		}
	case <-time.After(time.Second):
		t.Fatal("Sync did not finish")
	}
	result := <-resultCh
	if result.Cancelled != 1 || len(result.Errors) != 0 {
		t.Fatalf("unexpected reconcile result: %+v", result)
	}

	active := reconciler.ActiveOrders()
	if len(active) != 1 || active[0].OrderID != "9001" || active[0].Amount.String() != "0.5" {
		t.Fatalf("newer order state was lost after cancellation: %+v", active)
	}
}

func TestQuoteReconciler_SyncPrefersOldestDuplicateOrder(t *testing.T) {
	server := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		if r.URL.Path != "/v1/order/cancel" {
			http.NotFound(w, r)
			return
		}
		_ = json.NewEncoder(w).Encode(trading.CancelOrderResponse{IsCancelled: ptrBool(true), IsLive: ptrBool(false)})
	}))
	defer server.Close()

	reconciler := services.NewQuoteReconciler(
		services.NewTradingService(
			transport.NewClient(transport.WithHTTPClient(server.Client())),
			server.URL,
		),
		nil,
		"BTCUSD",
	)

	// Two resting orders left with identical side/price/quantity, as can
	// happen after a partial fill. Order 101 was queued first; the reconciler
	// must deterministically keep it and cancel the newer duplicate (102)
	// rather than depending on Go's randomized map iteration order.
	for _, id := range []int64{101, 102} {
		reconciler.ApplyOrderEvent(&websocket.OrderEvent{
			EventType:   "order",
			Symbol:      "BTCUSD",
			OrderID:     id,
			Side:        "BUY",
			Price:       "100",
			Quantity:    "1",
			OrderStatus: "NEW",
		})
	}

	target := []services.DesiredQuote{
		{Side: "buy", Price: types.MustParseDecimal("100"), Amount: types.MustParseDecimal("1")},
	}

	for i := 0; i < 20; i++ {
		result, err := reconciler.Sync(context.Background(), target)
		if err != nil {
			t.Fatalf("Sync failed: %v", err)
		}
		if result.Kept != 1 || result.Cancelled != 1 {
			t.Fatalf("run %d: unexpected reconcile result: %+v", i, result)
		}

		active := reconciler.ActiveOrders()
		if len(active) != 1 || active[0].OrderID != "101" {
			t.Fatalf("run %d: expected oldest order 101 to be kept, got %+v", i, active)
		}

		// Restore order 102 for the next iteration so repeated runs keep
		// exercising the same duplicate-matching decision.
		reconciler.ApplyOrderEvent(&websocket.OrderEvent{
			EventType:   "order",
			Symbol:      "BTCUSD",
			OrderID:     102,
			Side:        "BUY",
			Price:       "100",
			Quantity:    "1",
			OrderStatus: "NEW",
		})
	}
}

func TestQuoteReconciler_ApplyOrderEvent(t *testing.T) {
	reconciler := services.NewQuoteReconciler(nil, nil, "BTCUSD")

	// 1. Ingest NEW order event
	reconciler.ApplyOrderEvent(&websocket.OrderEvent{
		EventType:   "order",
		Symbol:      "BTCUSD",
		OrderID:     7701,
		Side:        "BUY",
		Price:       "65000.00",
		Quantity:    "0.10",
		OrderStatus: "NEW",
	})

	active := reconciler.ActiveOrders()
	if len(active) != 1 || active[0].OrderID != "7701" {
		t.Fatalf("expected 1 active order with ID 7701, got: %+v", active)
	}

	// 2. Ingest PARTIALLY_FILLED event (0.06 remaining)
	reconciler.ApplyOrderEvent(&websocket.OrderEvent{
		EventType:    "order",
		Symbol:       "BTCUSD",
		OrderID:      7701,
		Side:         "BUY",
		OrderStatus:  "PARTIALLY_FILLED",
		RemainingQty: "0.06",
	})

	active = reconciler.ActiveOrders()
	if len(active) != 1 || active[0].Amount.String() != "0.06" {
		t.Fatalf("expected remaining amount 0.06, got: %+v", active[0].Amount.String())
	}

	// 2b. Ingest second PARTIALLY_FILLED event (0.03 remaining)
	reconciler.ApplyOrderEvent(&websocket.OrderEvent{
		EventType:    "order",
		Symbol:       "BTCUSD",
		OrderID:      7701,
		Side:         "BUY",
		OrderStatus:  "PARTIALLY_FILLED",
		RemainingQty: "0.03",
	})

	active = reconciler.ActiveOrders()
	if len(active) != 1 || active[0].Amount.String() != "0.03" {
		t.Fatalf("expected remaining amount 0.03 after second fill, got: %+v", active[0].Amount.String())
	}

	// 3. Ingest FILLED event
	reconciler.ApplyOrderEvent(&websocket.OrderEvent{
		EventType:   "order",
		Symbol:      "BTCUSD",
		OrderID:     7701,
		OrderStatus: "FILLED",
	})

	active = reconciler.ActiveOrders()
	if len(active) != 0 {
		t.Fatalf("expected 0 active orders after FILLED, got %d", len(active))
	}
}

func TestQuoteReconciler_UppercaseSides(t *testing.T) {
	var placeCalls int32
	server := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		if r.URL.Path == "/v1/order/new" {
			atomic.AddInt32(&placeCalls, 1)
			sym := "BTCUSD"
			id := "ord-99"
			_ = json.NewEncoder(w).Encode(trading.LimitOrderResponse{
				OrderId: &id,
				Symbol:  &sym,
			})
		}
	}))
	defer server.Close()

	trans := transport.NewClient(transport.WithHTTPClient(server.Client()))
	tradingSvc := services.NewTradingService(trans, server.URL)
	reconciler := services.NewQuoteReconciler(tradingSvc, nil, "BTCUSD")

	// Target with uppercase "BUY" and "SELL"
	targets := []services.DesiredQuote{
		{Side: "BUY", Price: types.MustParseDecimal("65000.00"), Amount: types.MustParseDecimal("0.01")},
		{Side: "SELL", Price: types.MustParseDecimal("66000.00"), Amount: types.MustParseDecimal("0.01")},
	}

	result, err := reconciler.Sync(context.Background(), targets)
	if err != nil {
		t.Fatalf("Sync failed: %v", err)
	}
	if len(result.Errors) > 0 {
		t.Fatalf("unexpected errors: %v", result.Errors)
	}
	if result.Placed != 2 {
		t.Fatalf("expected 2 placed orders, got %d", result.Placed)
	}
}

func TestQuoteReconciler_PreservesWebSocketStateOnPlacement(t *testing.T) {
	var reconciler *services.QuoteReconciler
	server := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		if r.URL.Path == "/v1/order/new" {
			sym := "BTCUSD"
			id := "9999"

			// Simulate immediate WebSocket partial fill arriving before REST response finishes
			reconciler.ApplyOrderEvent(&websocket.OrderEvent{
				EventType:    "order",
				Symbol:       "BTCUSD",
				OrderID:      9999,
				Side:         "BUY",
				Price:        "65000.00",
				OrderStatus:  "PARTIALLY_FILLED",
				RemainingQty: "0.02", // only 0.02 remaining
			})

			_ = json.NewEncoder(w).Encode(trading.LimitOrderResponse{
				OrderId: &id,
				Symbol:  &sym,
			})
		}
	}))
	defer server.Close()

	trans := transport.NewClient(transport.WithHTTPClient(server.Client()))
	tradingSvc := services.NewTradingService(trans, server.URL)
	reconciler = services.NewQuoteReconciler(tradingSvc, nil, "BTCUSD")

	targets := []services.DesiredQuote{
		{Side: "buy", Price: types.MustParseDecimal("65000.00"), Amount: types.MustParseDecimal("0.10")},
	}

	_, err := reconciler.Sync(context.Background(), targets)
	if err != nil {
		t.Fatalf("Sync failed: %v", err)
	}

	active := reconciler.ActiveOrders()
	if len(active) != 1 {
		t.Fatalf("expected 1 active order, got %d", len(active))
	}
	// The active amount must remain 0.02 (from WebSocket), NOT 0.10 (from original REST request)
	if active[0].Amount.String() != "0.02" {
		t.Fatalf("expected active amount to be preserved as 0.02 from WebSocket, got %s", active[0].Amount.String())
	}
}

func TestQuoteReconciler_OpenAndModifiedStatuses(t *testing.T) {
	reconciler := services.NewQuoteReconciler(nil, nil, "BTCUSD")

	// 1. OPEN event
	reconciler.ApplyOrderEvent(&websocket.OrderEvent{
		EventType:   "order",
		Symbol:      "BTCUSD",
		OrderID:     8888,
		Side:        "BUY",
		Price:       "60000.00",
		Quantity:    "0.5",
		OrderStatus: "OPEN",
	})

	active := reconciler.ActiveOrders()
	if len(active) != 1 || active[0].OrderID != "8888" || active[0].Price.String() != "60000" {
		t.Fatalf("expected order 8888 to be tracked after OPEN event, got %+v", active)
	}

	// 2. MODIFIED event
	reconciler.ApplyOrderEvent(&websocket.OrderEvent{
		EventType:    "order",
		Symbol:       "BTCUSD",
		OrderID:      8888,
		Side:         "BUY",
		Price:        "61000.00",
		Quantity:     "0.75",
		RemainingQty: "0.25",
		OrderStatus:  "MODIFIED",
	})

	active = reconciler.ActiveOrders()
	if len(active) != 1 || active[0].Price.String() != "61000" || active[0].Amount.String() != "0.25" || active[0].OriginalAmount.String() != "0.75" {
		t.Fatalf("expected order 8888 to be updated after MODIFIED event, got %+v", active)
	}
}

func TestQuoteReconciler_ConcurrentSyncSerialized(t *testing.T) {
	var placeCount atomic.Int64
	var orderCounter atomic.Int64

	server := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		if r.URL.Path == "/v1/order/new" {
			placeCount.Add(1)
			id := fmt.Sprintf("%d", orderCounter.Add(1))
			sym := "BTCUSD"
			_ = json.NewEncoder(w).Encode(trading.LimitOrderResponse{
				OrderId: &id,
				Symbol:  &sym,
			})
		}
	}))
	defer server.Close()

	trans := transport.NewClient(transport.WithHTTPClient(server.Client()))
	tradingSvc := services.NewTradingService(trans, server.URL)
	reconciler := services.NewQuoteReconciler(tradingSvc, nil, "BTCUSD")

	const goroutines = 10
	var wg sync.WaitGroup
	wg.Add(goroutines)

	targets := []services.DesiredQuote{
		{Side: "buy", Price: types.MustParseDecimal("60000.00"), Amount: types.MustParseDecimal("0.1")},
	}

	for i := 0; i < goroutines; i++ {
		go func() {
			defer wg.Done()
			_, _ = reconciler.Sync(context.Background(), targets)
		}()
	}
	wg.Wait()

	// Only the first Sync should place the order; subsequent Syncs see it as resting and keep it!
	if placeCount.Load() != 1 {
		t.Fatalf("expected exactly 1 order placement across serialized concurrent Syncs, got %d", placeCount.Load())
	}
}

func TestQuoteReconciler_DoesNotPlaceAfterCancellationFailure(t *testing.T) {
	var placeCalls atomic.Int32
	server := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/v1/order/cancel":
			w.WriteHeader(http.StatusBadRequest)
			_, _ = w.Write([]byte(`{"result":"error","reason":"InvalidPayload"}`))
		case "/v1/order/new":
			placeCalls.Add(1)
			w.WriteHeader(http.StatusInternalServerError)
		default:
			http.NotFound(w, r)
		}
	}))
	t.Cleanup(server.Close)

	tradingSvc := services.NewTradingService(transport.NewClient(transport.WithHTTPClient(server.Client())), server.URL)
	reconciler := services.NewQuoteReconciler(tradingSvc, nil, "BTCUSD")
	reconciler.ApplyOrderEvent(&websocket.OrderEvent{
		Symbol: "BTCUSD", OrderID: 100, Side: "BUY", Price: "65000", Quantity: "0.1", OrderStatus: "OPEN",
	})

	result, err := reconciler.Sync(context.Background(), []services.DesiredQuote{{
		Side: "buy", Price: types.MustParseDecimal("65100"), Amount: types.MustParseDecimal("0.1"),
	}})
	if err != nil {
		t.Fatalf("Sync failed: %v", err)
	}
	if len(result.Errors) == 0 || placeCalls.Load() != 0 {
		t.Fatalf("expected cancellation failure to block placements, result=%+v placeCalls=%d", result, placeCalls.Load())
	}
}

func TestQuoteReconciler_RejectsLiveCancellationResponse(t *testing.T) {
	var placeCalls atomic.Int32
	server := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/v1/order/cancel":
			_ = json.NewEncoder(w).Encode(trading.CancelOrderResponse{
				IsCancelled: ptrBool(false),
				IsLive:      ptrBool(true),
			})
		case "/v1/order/new":
			placeCalls.Add(1)
		default:
			http.NotFound(w, r)
		}
	}))
	t.Cleanup(server.Close)

	tradingSvc := services.NewTradingService(transport.NewClient(transport.WithHTTPClient(server.Client())), server.URL)
	reconciler := services.NewQuoteReconciler(tradingSvc, nil, "BTCUSD")
	reconciler.ApplyOrderEvent(&websocket.OrderEvent{
		Symbol: "BTCUSD", OrderID: 100, Side: "BUY", Price: "65000", Quantity: "0.1", OrderStatus: "OPEN",
	})

	result, err := reconciler.Sync(context.Background(), []services.DesiredQuote{{
		Side: "buy", Price: types.MustParseDecimal("65100"), Amount: types.MustParseDecimal("0.1"),
	}})
	if err != nil {
		t.Fatalf("Sync failed: %v", err)
	}
	if len(result.Errors) == 0 || placeCalls.Load() != 0 || len(reconciler.ActiveOrders()) != 1 {
		t.Fatalf("expected live cancellation response to block replacement, result=%+v places=%d active=%+v", result, placeCalls.Load(), reconciler.ActiveOrders())
	}

	if err := reconciler.CancelAll(context.Background()); err == nil {
		t.Fatal("expected CancelAll to reject a response that still reports the order as live")
	}
	if len(reconciler.ActiveOrders()) != 1 {
		t.Fatal("CancelAll must preserve tracking when cancellation status is ambiguous")
	}
}

func TestQuoteReconciler_RejectsNonLiveMakerOrCancelResponse(t *testing.T) {
	server := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v1/order/new" {
			http.NotFound(w, r)
			return
		}
		id := "101"
		_ = json.NewEncoder(w).Encode(trading.LimitOrderResponse{OrderId: &id, IsCancelled: ptrBool(true), IsLive: ptrBool(false)})
	}))
	t.Cleanup(server.Close)

	tradingSvc := services.NewTradingService(transport.NewClient(transport.WithHTTPClient(server.Client())), server.URL)
	reconciler := services.NewQuoteReconciler(tradingSvc, nil, "BTCUSD")
	result, err := reconciler.Sync(context.Background(), []services.DesiredQuote{{
		Side: "buy", Price: types.MustParseDecimal("65000"), Amount: types.MustParseDecimal("0.1"),
	}})
	if err != nil {
		t.Fatalf("Sync failed: %v", err)
	}
	if result.Placed != 0 || len(result.Errors) == 0 || len(reconciler.ActiveOrders()) != 0 {
		t.Fatalf("expected non-live response to be rejected, result=%+v active=%+v", result, reconciler.ActiveOrders())
	}
}

func ptrBool(v bool) *bool { return &v }

func TestQuoteReconciler_CancelAllClearsOnlyAfterSuccess(t *testing.T) {
	var fail atomic.Bool
	server := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v1/order/cancel" {
			http.NotFound(w, r)
			return
		}
		if fail.Load() {
			w.WriteHeader(http.StatusBadRequest)
			_, _ = w.Write([]byte(`{"result":"error","reason":"InvalidPayload"}`))
			return
		}
		_, _ = w.Write([]byte(`{"order_id":"123","is_cancelled":true,"is_live":false}`))
	}))
	t.Cleanup(server.Close)

	tradingSvc := services.NewTradingService(
		transport.NewClient(transport.WithHTTPClient(server.Client())),
		server.URL,
	)
	reconciler := services.NewQuoteReconciler(tradingSvc, nil, "BTCUSD")
	reconciler.ApplyOrderEvent(&websocket.OrderEvent{
		EventType:   "order",
		Symbol:      "BTCUSD",
		OrderID:     123,
		Side:        "BUY",
		Price:       "65000",
		Quantity:    "0.1",
		OrderStatus: "OPEN",
	})

	fail.Store(true)
	if err := reconciler.CancelAll(context.Background()); err == nil {
		t.Fatal("expected CancelAll backend error")
	}
	if len(reconciler.ActiveOrders()) != 1 {
		t.Fatal("failed CancelAll must preserve tracked orders")
	}

	fail.Store(false)
	if err := reconciler.CancelAll(context.Background()); err != nil {
		t.Fatalf("CancelAll failed: %v", err)
	}
	if len(reconciler.ActiveOrders()) != 0 {
		t.Fatal("successful CancelAll must clear tracked orders")
	}
}

func TestQuoteReconciler_StartStreamingConfigurationAndHydrationErrors(t *testing.T) {
	if _, err := services.NewQuoteReconciler(nil, nil, "BTCUSD").StartStreaming(context.Background()); err == nil {
		t.Fatal("expected StartStreaming to reject a missing WebSocket client")
	}

	server := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusServiceUnavailable)
		_, _ = w.Write([]byte(`{"result":"error","reason":"ServiceUnavailable"}`))
	}))
	t.Cleanup(server.Close)

	tradingSvc := services.NewTradingService(
		transport.NewClient(transport.WithHTTPClient(server.Client())),
		server.URL,
	)
	wsClient := websocket.NewClient("wss://ws.gemini.com")
	if _, err := services.NewQuoteReconciler(tradingSvc, wsClient, "BTCUSD").StartStreaming(context.Background()); err == nil {
		t.Fatal("expected StartStreaming to return initial hydration error")
	}
	var nilContext context.Context
	if _, err := services.NewQuoteReconciler(tradingSvc, wsClient, "BTCUSD").StartStreaming(nilContext); err == nil {
		t.Fatal("expected StartStreaming to reject a nil context during hydration")
	}
}

func TestQuoteReconciler_MasterAccountIsPropagated(t *testing.T) {
	var mu sync.Mutex
	requests := make(map[string]map[string]any)
	server := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var payload map[string]any
		if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		mu.Lock()
		requests[r.URL.Path] = payload
		mu.Unlock()

		w.Header().Set("Content-Type", "application/json")
		switch r.URL.Path {
		case "/v1/orders":
			orderID, symbol, price, amount := "101", "BTCUSD", "64950", "0.05"
			side := trading.LimitOrderResponseSideBuy
			_ = json.NewEncoder(w).Encode([]trading.LimitOrderResponse{{
				OrderId:        &orderID,
				Symbol:         &symbol,
				Price:          &price,
				OriginalAmount: &amount,
				Side:           &side,
			}})
		case "/v1/order/cancel":
			_ = json.NewEncoder(w).Encode(trading.CancelOrderResponse{IsCancelled: ptrBool(true), IsLive: ptrBool(false)})
		case "/v1/order/new":
			orderID, symbol := "102", "BTCUSD"
			_ = json.NewEncoder(w).Encode(trading.LimitOrderResponse{OrderId: &orderID, Symbol: &symbol})
		default:
			http.NotFound(w, r)
		}
	}))
	t.Cleanup(server.Close)

	tradingSvc := services.NewTradingService(
		transport.NewClient(transport.WithHTTPClient(server.Client())),
		server.URL,
	)
	reconciler := services.NewQuoteReconciler(
		tradingSvc,
		nil,
		"BTCUSD",
		services.WithAccount(" subaccount-1 "),
	)

	if err := reconciler.Hydrate(context.Background()); err != nil {
		t.Fatalf("Hydrate failed: %v", err)
	}
	result, err := reconciler.Sync(context.Background(), []services.DesiredQuote{{
		Side:   "sell",
		Price:  types.MustParseDecimal("65050"),
		Amount: types.MustParseDecimal("0.05"),
	}})
	if err != nil || len(result.Errors) != 0 {
		t.Fatalf("Sync failed: %v, errors: %v", err, result.Errors)
	}

	mu.Lock()
	defer mu.Unlock()
	for _, path := range []string{"/v1/orders", "/v1/order/cancel", "/v1/order/new"} {
		account, ok := requests[path]["account"]
		if !ok || account != "subaccount-1" {
			t.Errorf("expected account on %s request, got %v", path, requests[path])
		}
	}
}
