package services_test

import (
	"context"
	"encoding/json"
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
)

func TestQuoteReconciler_LimitsConcurrentRequests(t *testing.T) {
	var active atomic.Int32
	var maxActive atomic.Int32
	var orderID atomic.Int64
	started := make(chan struct{}, 8)
	release := make(chan struct{})
	var releaseOnce sync.Once
	unblock := func() { releaseOnce.Do(func() { close(release) }) }
	t.Cleanup(unblock)

	server := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v1/order/new" {
			http.NotFound(w, r)
			return
		}
		current := active.Add(1)
		for {
			previous := maxActive.Load()
			if current <= previous || maxActive.CompareAndSwap(previous, current) {
				break
			}
		}
		started <- struct{}{}
		<-release
		active.Add(-1)
		id := fmt.Sprintf("%d", orderID.Add(1))
		symbol := "BTCUSD"
		_ = json.NewEncoder(w).Encode(trading.LimitOrderResponse{OrderId: &id, Symbol: &symbol})
	}))
	t.Cleanup(server.Close)

	reconciler := services.NewQuoteReconciler(
		services.NewTradingService(
			transport.NewClient(transport.WithHTTPClient(server.Client())),
			server.URL,
		),
		nil,
		"BTCUSD",
		services.WithMaxConcurrentRequests(2),
	)

	targets := make([]services.DesiredQuote, 0, 5)
	for i := 0; i < 5; i++ {
		targets = append(targets, services.DesiredQuote{
			Side:   "buy",
			Price:  types.MustParseDecimal(fmt.Sprintf("%d", 65000+i)),
			Amount: types.MustParseDecimal("0.1"),
		})
	}

	resultCh := make(chan *services.ReconcileResult, 1)
	errCh := make(chan error, 1)
	go func() {
		result, err := reconciler.Sync(context.Background(), targets)
		resultCh <- result
		errCh <- err
	}()

	for i := 0; i < 2; i++ {
		select {
		case <-started:
		case <-time.After(time.Second):
			t.Fatal("expected two concurrent placement requests")
		}
	}
	if got := maxActive.Load(); got != 2 {
		t.Fatalf("expected configured concurrency of 2, observed %d", got)
	}
	unblock()

	select {
	case err := <-errCh:
		if err != nil {
			t.Fatalf("Sync failed: %v", err)
		}
	case <-time.After(time.Second):
		t.Fatal("Sync did not finish after releasing placement requests")
	}
	result := <-resultCh
	if result.Placed != len(targets) || len(result.Errors) != 0 {
		t.Fatalf("unexpected reconcile result: %+v", result)
	}
}
