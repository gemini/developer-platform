package transport

import (
	"context"
	"log/slog"
	"net/http"
	"time"
)

func logURL(req *http.Request) string {
	if req == nil || req.URL == nil {
		return ""
	}
	// Query strings can contain account identifiers or caller-supplied tokens.
	// The SDK never needs them for transport diagnostics, so keep them out of
	// the built-in logs. Custom hooks still receive the original request.
	urlCopy := *req.URL
	urlCopy.User = nil
	urlCopy.RawQuery = ""
	urlCopy.ForceQuery = false
	return urlCopy.String()
}

// Hook provides observability lifecycle callbacks for HTTP requests.
// Implementations can attach OpenTelemetry spans, Prometheus metrics, or custom loggers.
type Hook interface {
	// OnRequestStart is invoked before the HTTP request is executed.
	OnRequestStart(ctx context.Context, req *http.Request) context.Context

	// OnRequestEnd is invoked after the HTTP request finishes (success or failure).
	OnRequestEnd(ctx context.Context, req *http.Request, resp *http.Response, duration time.Duration, err error)

	// OnRetry is invoked before a request is retried.
	OnRetry(ctx context.Context, req *http.Request, attempt int, backoff time.Duration, err error)

	// OnRateLimit is invoked when a 429 response is received with a Retry-After directive.
	OnRateLimit(ctx context.Context, req *http.Request, retryAfter time.Duration)
}

// MultiHook aggregates multiple Hooks into a single pipeline.
type MultiHook []Hook

var (
	_ Hook = (MultiHook)(nil)
	_ Hook = (*SlogHook)(nil)
)

// OnRequestStart dispatches OnRequestStart across all registered hooks.
func (m MultiHook) OnRequestStart(ctx context.Context, req *http.Request) context.Context {
	for _, h := range m {
		if h != nil {
			if next := h.OnRequestStart(ctx, req); next != nil {
				ctx = next
			}
		}
	}
	return ctx
}

// OnRequestEnd dispatches OnRequestEnd across all registered hooks.
func (m MultiHook) OnRequestEnd(ctx context.Context, req *http.Request, resp *http.Response, duration time.Duration, err error) {
	for _, h := range m {
		if h != nil {
			h.OnRequestEnd(ctx, req, resp, duration, err)
		}
	}
}

// OnRetry dispatches OnRetry across all registered hooks.
func (m MultiHook) OnRetry(ctx context.Context, req *http.Request, attempt int, backoff time.Duration, err error) {
	for _, h := range m {
		if h != nil {
			h.OnRetry(ctx, req, attempt, backoff, err)
		}
	}
}

// OnRateLimit dispatches OnRateLimit across all registered hooks.
func (m MultiHook) OnRateLimit(ctx context.Context, req *http.Request, retryAfter time.Duration) {
	for _, h := range m {
		if h != nil {
			h.OnRateLimit(ctx, req, retryAfter)
		}
	}
}

// SlogHook is a built-in Hook implementation using standard library slog.
type SlogHook struct {
	logger *slog.Logger
}

// NewSlogHook creates a new SlogHook.
func NewSlogHook(logger *slog.Logger) *SlogHook {
	if logger == nil {
		logger = slog.Default()
	}
	return &SlogHook{logger: logger}
}

func (s *SlogHook) OnRequestStart(ctx context.Context, req *http.Request) context.Context {
	return ctx
}

func (s *SlogHook) OnRequestEnd(ctx context.Context, req *http.Request, resp *http.Response, duration time.Duration, err error) {
	status := 0
	if resp != nil {
		status = resp.StatusCode
	}
	if err != nil {
		s.logger.DebugContext(ctx, "gemini request finished with error",
			slog.String("method", req.Method),
			slog.String("url", logURL(req)),
			slog.Int("status", status),
			slog.Duration("duration", duration),
			slog.String("error", err.Error()),
		)
	} else {
		s.logger.DebugContext(ctx, "gemini request completed",
			slog.String("method", req.Method),
			slog.String("url", logURL(req)),
			slog.Int("status", status),
			slog.Duration("duration", duration),
		)
	}
}

func (s *SlogHook) OnRetry(ctx context.Context, req *http.Request, attempt int, backoff time.Duration, err error) {
	errStr := ""
	if err != nil {
		errStr = err.Error()
	}
	s.logger.WarnContext(ctx, "gemini request failed; retrying",
		slog.String("method", req.Method),
		slog.String("url", logURL(req)),
		slog.Int("attempt", attempt),
		slog.Duration("backoff", backoff),
		slog.String("error", errStr),
	)
}

func (s *SlogHook) OnRateLimit(ctx context.Context, req *http.Request, retryAfter time.Duration) {
	s.logger.WarnContext(ctx, "gemini rate limit encountered",
		slog.String("method", req.Method),
		slog.String("url", logURL(req)),
		slog.Duration("retry_after", retryAfter),
	)
}
