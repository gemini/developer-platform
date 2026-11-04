package transport

import (
	"context"
	"crypto/tls"
	"net/http"
	"net/http/httptrace"
	"sync"
	"time"
)

// LatencyBreakdown records fine-grained network microsecond latencies for an HTTP request.
type LatencyBreakdown struct {
	DNSDuration      time.Duration
	ConnectDuration  time.Duration
	TLSHandshake     time.Duration
	ConnectionReused bool
	TimeToFirstByte  time.Duration
	TotalDuration    time.Duration
}

// TraceCallback is invoked with fine-grained latency breakdown upon request completion.
type TraceCallback func(req *http.Request, trace LatencyBreakdown, err error)

type traceContextKey struct{}

type traceTimers struct {
	mu              sync.Mutex
	dnsStart        time.Time
	dnsDuration     time.Duration
	connectStart    time.Time
	connectDuration time.Duration
	tlsStart        time.Time
	tlsDuration     time.Duration
	reused          bool
	firstByteTime   time.Time
	start           time.Time
}

// TraceHook captures low-level network performance metrics using net/http/httptrace.
type TraceHook struct {
	callback TraceCallback
}

var _ Hook = (*TraceHook)(nil)

// NewTraceHook creates a new Hook that profiles microsecond-level HTTP connection latencies.
func NewTraceHook(callback TraceCallback) *TraceHook {
	return &TraceHook{callback: callback}
}

// OnRequestStart attaches httptrace.ClientTrace to the request context.
func (h *TraceHook) OnRequestStart(ctx context.Context, req *http.Request) context.Context {
	if h.callback == nil {
		return ctx
	}

	timers := &traceTimers{
		start: time.Now(),
	}

	clientTrace := &httptrace.ClientTrace{
		DNSStart: func(_ httptrace.DNSStartInfo) {
			timers.mu.Lock()
			defer timers.mu.Unlock()
			timers.dnsStart = time.Now()
		},
		DNSDone: func(_ httptrace.DNSDoneInfo) {
			timers.mu.Lock()
			defer timers.mu.Unlock()
			if !timers.dnsStart.IsZero() {
				timers.dnsDuration += time.Since(timers.dnsStart)
				timers.dnsStart = time.Time{}
			}
		},
		ConnectStart: func(_, _ string) {
			timers.mu.Lock()
			defer timers.mu.Unlock()
			timers.connectStart = time.Now()
		},
		ConnectDone: func(_, _ string, _ error) {
			timers.mu.Lock()
			defer timers.mu.Unlock()
			if !timers.connectStart.IsZero() {
				timers.connectDuration += time.Since(timers.connectStart)
				timers.connectStart = time.Time{}
			}
		},
		TLSHandshakeStart: func() {
			timers.mu.Lock()
			defer timers.mu.Unlock()
			timers.tlsStart = time.Now()
		},
		TLSHandshakeDone: func(_ tls.ConnectionState, _ error) {
			timers.mu.Lock()
			defer timers.mu.Unlock()
			if !timers.tlsStart.IsZero() {
				timers.tlsDuration += time.Since(timers.tlsStart)
				timers.tlsStart = time.Time{}
			}
		},
		GotConn: func(info httptrace.GotConnInfo) {
			timers.mu.Lock()
			defer timers.mu.Unlock()
			timers.reused = info.Reused
		},
		GotFirstResponseByte: func() {
			timers.mu.Lock()
			defer timers.mu.Unlock()
			if timers.firstByteTime.IsZero() {
				timers.firstByteTime = time.Now()
			}
		},
	}

	ctx = httptrace.WithClientTrace(ctx, clientTrace)
	return context.WithValue(ctx, traceContextKey{}, timers)
}

// OnRequestEnd computes final latency deltas and triggers the TraceCallback.
func (h *TraceHook) OnRequestEnd(ctx context.Context, req *http.Request, _ *http.Response, duration time.Duration, err error) {
	if h.callback == nil {
		return
	}

	timers, ok := ctx.Value(traceContextKey{}).(*traceTimers)
	if !ok || timers == nil {
		return
	}

	timers.mu.Lock()
	dnsDuration := timers.dnsDuration
	connectDuration := timers.connectDuration
	tlsDuration := timers.tlsDuration
	connectionReused := timers.reused
	firstByteTime := timers.firstByteTime
	timers.mu.Unlock()

	var ttfb time.Duration
	if !firstByteTime.IsZero() {
		ttfb = firstByteTime.Sub(timers.start)
	}

	breakdown := LatencyBreakdown{
		DNSDuration:      dnsDuration,
		ConnectDuration:  connectDuration,
		TLSHandshake:     tlsDuration,
		ConnectionReused: connectionReused,
		TimeToFirstByte:  ttfb,
		TotalDuration:    duration,
	}

	h.callback(req, breakdown, err)
}

// OnRetry implements Hook.
func (h *TraceHook) OnRetry(_ context.Context, _ *http.Request, _ int, _ time.Duration, _ error) {}

// OnRateLimit implements Hook.
func (h *TraceHook) OnRateLimit(_ context.Context, _ *http.Request, _ time.Duration) {}
