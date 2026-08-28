package transport_test

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/gemini/gemini-go/transport"
)

func TestTraceHook_LatencyBreakdown(t *testing.T) {
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		time.Sleep(10 * time.Millisecond)
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"status":"ok"}`))
	}))
	defer ts.Close()

	var receivedTrace transport.LatencyBreakdown
	var captured bool

	traceHook := transport.NewTraceHook(func(req *http.Request, trace transport.LatencyBreakdown, err error) {
		receivedTrace = trace
		captured = true
	})

	client := transport.NewClient(
		transport.WithHooks(traceHook),
	)

	req, err := http.NewRequestWithContext(context.Background(), http.MethodGet, ts.URL, nil)
	if err != nil {
		t.Fatalf("failed creating request: %v", err)
	}

	_, _, err = client.Execute(context.Background(), req, nil)
	if err != nil {
		t.Fatalf("execute failed: %v", err)
	}

	if !captured {
		t.Fatal("expected TraceHook callback to be invoked")
	}

	if receivedTrace.TotalDuration < 10*time.Millisecond {
		t.Fatalf("expected TotalDuration >= 10ms, got %v", receivedTrace.TotalDuration)
	}
	if receivedTrace.TimeToFirstByte == 0 {
		t.Fatal("expected TimeToFirstByte to be recorded")
	}
}
