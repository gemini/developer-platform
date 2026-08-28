package services_test

import (
	"context"
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"
	"time"

	"github.com/gemini/gemini-go/services"
	"github.com/gemini/gemini-go/transport"
)

func TestHeartbeatSession_LifecycleAndErrors(t *testing.T) {
	var heartbeatCount int32
	var failMode atomic.Bool
	beats := make(chan struct{}, 16)

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v1/heartbeat" {
			http.NotFound(w, r)
			return
		}
		atomic.AddInt32(&heartbeatCount, 1)
		beats <- struct{}{}

		if failMode.Load() {
			w.WriteHeader(http.StatusServiceUnavailable)
			_, _ = w.Write([]byte(`{"result":"error","reason":"Maintenance"}`))
			return
		}

		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"result":"ok"}`))
	}))
	defer server.Close()

	transportClient := transport.NewClient(
		transport.WithHTTPClient(server.Client()),
	)

	service := services.NewHeartbeatService(transportClient, server.URL)

	// 1. Start heartbeat ticking every 5ms. The handler signal makes this
	// deterministic without sleeping for an assumed number of intervals.
	session := service.Start(context.Background(), 5*time.Millisecond)
	t.Cleanup(session.Stop)

	if !session.IsAlive() {
		t.Fatal("expected session to be alive")
	}

	for i := 0; i < 3; i++ {
		select {
		case <-beats:
		case <-time.After(time.Second):
			t.Fatalf("timed out waiting for heartbeat pulse %d", i+1)
		}
	}

	if session.LastBeat().IsZero() {
		t.Fatal("expected non-zero LastBeat timestamp")
	}

	// 2. Trigger error failure mode
	failMode.Store(true)

	select {
	case err := <-session.Errors():
		if err == nil {
			t.Fatal("expected error, got nil")
		}
	case <-time.After(500 * time.Millisecond):
		t.Fatal("timed out waiting for heartbeat error broadcast")
	}

	// 3. Stop session
	session.Stop()
	if session.IsAlive() {
		t.Fatal("expected session to be dead after Stop()")
	}

	for range session.Errors() {
		// Drain until the session has fully stopped.
	}
	countAfterStop := atomic.LoadInt32(&heartbeatCount)
	if countAfterStop < 3 {
		t.Fatalf("expected at least three heartbeats before stopping, got %d", countAfterStop)
	}
}
