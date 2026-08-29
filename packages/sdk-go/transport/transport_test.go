package transport

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"reflect"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/gemini/developer-platform/packages/sdk-go/auth"
)

type roundTripFunc func(*http.Request) (*http.Response, error)

func (f roundTripFunc) RoundTrip(req *http.Request) (*http.Response, error) {
	return f(req)
}

func TestTransport_ExecuteReturnsReadableResponseBody(t *testing.T) {
	client := NewClient(WithHTTPClient(&http.Client{
		Transport: roundTripFunc(func(req *http.Request) (*http.Response, error) {
			return &http.Response{
				StatusCode: http.StatusOK,
				Header:     make(http.Header),
				Body:       io.NopCloser(strings.NewReader(`{"result":"ok"}`)),
				Request:    req,
			}, nil
		}),
	}))
	req, err := http.NewRequest(http.MethodGet, "https://api.gemini.com/v1/test", nil)
	if err != nil {
		t.Fatalf("creating request: %v", err)
	}
	resp, body, err := client.Execute(context.Background(), req, nil)
	if err != nil {
		t.Fatalf("Execute returned error: %v", err)
	}
	defer resp.Body.Close()
	if string(body) != `{"result":"ok"}` {
		t.Fatalf("unexpected captured body: %s", body)
	}
	readable, err := io.ReadAll(resp.Body)
	if err != nil {
		t.Fatalf("reading returned response body: %v", err)
	}
	if string(readable) != string(body) {
		t.Fatalf("returned response body differs from captured body: %s", readable)
	}
}

func TestTransport_AuthenticatedRequestsRequireHTTPS(t *testing.T) {
	var roundTrips atomic.Int32
	client := NewClient(
		WithHTTPClient(&http.Client{Transport: roundTripFunc(func(req *http.Request) (*http.Response, error) {
			roundTrips.Add(1)
			return &http.Response{
				StatusCode: http.StatusOK,
				Header:     make(http.Header),
				Body:       io.NopCloser(strings.NewReader(`{"result":"unexpected"}`)),
				Request:    req,
			}, nil
		})}),
		WithAuth(auth.NewBearer(auth.BearerToken("test-token"))),
	)

	req, err := http.NewRequest(http.MethodGet, "http://api.gemini.com/v1/test", nil)
	if err != nil {
		t.Fatalf("creating request: %v", err)
	}
	if _, _, err := client.Execute(context.Background(), req, nil); !errors.Is(err, ErrHTTPSRequired) {
		t.Fatalf("Execute error = %v, want ErrHTTPSRequired", err)
	}
	if got := roundTrips.Load(); got != 0 {
		t.Fatalf("insecure authenticated request reached RoundTripper %d times", got)
	}
}

func TestTransport_PublicRequestsRequireHTTPS(t *testing.T) {
	var roundTrips atomic.Int32
	client := NewClient(WithHTTPClient(&http.Client{Transport: roundTripFunc(func(req *http.Request) (*http.Response, error) {
		roundTrips.Add(1)
		return &http.Response{
			StatusCode: http.StatusOK,
			Header:     make(http.Header),
			Body:       io.NopCloser(strings.NewReader(`{"result":"unexpected"}`)),
			Request:    req,
		}, nil
	})}))

	req, err := http.NewRequest(http.MethodGet, "http://api.gemini.com/v1/symbols", nil)
	if err != nil {
		t.Fatalf("creating request: %v", err)
	}
	if _, _, err := client.Execute(context.Background(), req, nil); !errors.Is(err, ErrHTTPSRequired) {
		t.Fatalf("Execute error = %v, want ErrHTTPSRequired", err)
	}
	if got := roundTrips.Load(); got != 0 {
		t.Fatalf("insecure public request reached RoundTripper %d times", got)
	}
}

func TestTransport_RequestURLsRejectMissingHostAndUserinfo(t *testing.T) {
	client := NewClient(WithHTTPClient(&http.Client{Transport: roundTripFunc(func(*http.Request) (*http.Response, error) {
		t.Fatal("invalid request URL reached RoundTripper")
		return nil, nil
	})}))

	tests := []string{
		"https:/v1/test",
		"https://user:password@api.gemini.com/v1/test",
	}
	for _, rawURL := range tests {
		t.Run(rawURL, func(t *testing.T) {
			req, err := http.NewRequest(http.MethodGet, rawURL, nil)
			if err != nil {
				t.Fatalf("creating request: %v", err)
			}
			if _, _, err := client.Execute(context.Background(), req, nil); !errors.Is(err, ErrInvalidRequestURL) {
				t.Fatalf("Execute error = %v, want ErrInvalidRequestURL", err)
			}
		})
	}
}

func TestTransport_SafeGetRetry(t *testing.T) {
	var attempts int32
	server := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		current := atomic.AddInt32(&attempts, 1)
		if current < 3 {
			w.Header().Set("Retry-After", "0")
			w.WriteHeader(http.StatusTooManyRequests)
			_, _ = w.Write([]byte(`{"result":"error","reason":"RateLimit","message":"too many requests"}`))
			return
		}
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"result":"ok","symbols":["BTCUSD"]}`))
	}))
	defer server.Close()

	client := NewClient(
		WithHTTPClient(server.Client()),
		WithRetryPolicy(RetryPolicy{
			MaxRetries: 4,
			BaseDelay:  time.Millisecond,
			MaxDelay:   5 * time.Millisecond,
			Multiplier: 1.0,
			Jitter:     false,
		}),
	)

	var target struct {
		Result  string   `json:"result"`
		Symbols []string `json:"symbols"`
	}

	err := client.Request(context.Background(), http.MethodGet, server.URL, nil, &target)
	if err != nil {
		t.Fatalf("expected successful retry, got error: %v", err)
	}

	if attempts != 3 {
		t.Fatalf("expected 3 attempts, got %d", attempts)
	}

	if len(target.Symbols) != 1 || target.Symbols[0] != "BTCUSD" {
		t.Fatalf("unexpected target result: %+v", target)
	}
}

func TestTransport_SafeGetRetryReplaysRequestBody(t *testing.T) {
	var bodies []string
	server := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, err := io.ReadAll(r.Body)
		if err != nil {
			t.Errorf("read request body: %v", err)
		}
		bodies = append(bodies, string(body))
		if len(bodies) == 1 {
			w.WriteHeader(http.StatusServiceUnavailable)
			return
		}
		w.WriteHeader(http.StatusOK)
	}))
	defer server.Close()

	client := NewClient(
		WithHTTPClient(server.Client()),
		WithRetryPolicy(RetryPolicy{
			MaxRetries: 1,
			BaseDelay:  time.Millisecond,
			MaxDelay:   5 * time.Millisecond,
			Multiplier: 1.0,
			Jitter:     false,
		}),
	)

	if err := client.Request(context.Background(), http.MethodGet, server.URL, map[string]string{"cursor": "next"}, nil); err != nil {
		t.Fatalf("expected successful retry, got %v", err)
	}
	if len(bodies) != 2 || bodies[0] != bodies[1] {
		t.Fatalf("expected identical request bodies across retry, got %q", bodies)
	}
}

func TestTransport_BearerReauthenticatesSafeGetRetry(t *testing.T) {
	var attempts atomic.Int32
	var sourceCalls atomic.Int32
	var authHeaders []string
	server := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		authHeaders = append(authHeaders, r.Header.Get("Authorization"))
		if attempts.Add(1) == 1 {
			w.WriteHeader(http.StatusServiceUnavailable)
			return
		}
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"result":"ok"}`))
	}))
	defer server.Close()

	strategy := auth.NewBearerWithSource(auth.TokenFunc(func(context.Context) (string, error) {
		if sourceCalls.Add(1) == 1 {
			return "oauth-token-1", nil
		}
		return "oauth-token-2", nil
	}))
	client := NewClient(
		WithHTTPClient(server.Client()),
		WithAuth(strategy),
		WithRetryPolicy(RetryPolicy{
			MaxRetries: 1,
			BaseDelay:  time.Millisecond,
			MaxDelay:   5 * time.Millisecond,
			Multiplier: 1,
			Jitter:     false,
		}),
	)

	if err := client.Request(context.Background(), http.MethodGet, server.URL, nil, nil); err != nil {
		t.Fatalf("expected successful authenticated retry, got %v", err)
	}
	if got := attempts.Load(); got != 2 {
		t.Fatalf("HTTP attempts = %d, want 2", got)
	}
	if got := sourceCalls.Load(); got != 2 {
		t.Fatalf("token source calls = %d, want 2", got)
	}
	if !reflect.DeepEqual(authHeaders, []string{"Bearer oauth-token-1", "Bearer oauth-token-2"}) {
		t.Fatalf("Authorization headers across retry = %v", authHeaders)
	}
}

func TestTransport_DefaultClientDoesNotFollowRedirects(t *testing.T) {
	var targetHits atomic.Int32
	target := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		targetHits.Add(1)
		w.WriteHeader(http.StatusOK)
	}))
	defer target.Close()

	redirect := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Redirect(w, r, target.URL, http.StatusFound)
	}))
	defer redirect.Close()

	client := NewClient(WithHTTPClient(redirect.Client()))
	err := client.Request(context.Background(), http.MethodGet, redirect.URL, nil, nil)
	if err == nil {
		t.Fatal("expected redirect response to be returned as an error")
	}
	if got := targetHits.Load(); got != 0 {
		t.Fatalf("expected default client not to follow redirect, target received %d requests", got)
	}
}

func TestTransport_CustomClientDoesNotFollowRedirects(t *testing.T) {
	var targetHits atomic.Int32
	target := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		targetHits.Add(1)
		w.WriteHeader(http.StatusOK)
	}))
	defer target.Close()

	redirect := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Redirect(w, r, target.URL, http.StatusFound)
	}))
	defer redirect.Close()

	client := NewClient(WithHTTPClient(redirect.Client()))
	if err := client.Request(context.Background(), http.MethodGet, redirect.URL, nil, nil); err == nil {
		t.Fatal("expected redirect response to be returned as an error")
	}
	if got := targetHits.Load(); got != 0 {
		t.Fatalf("expected custom client not to follow redirect, target received %d requests", got)
	}
}

func TestTransport_BearerCredentialsAreNotForwardedAcrossRedirects(t *testing.T) {
	var redirectAuth string
	var targetHits atomic.Int32
	target := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		targetHits.Add(1)
		w.WriteHeader(http.StatusOK)
	}))
	defer target.Close()

	redirect := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		redirectAuth = r.Header.Get("Authorization")
		http.Redirect(w, r, target.URL, http.StatusFound)
	}))
	defer redirect.Close()

	client := NewClient(
		WithHTTPClient(redirect.Client()),
		WithAuth(auth.NewBearer(auth.BearerToken("redirect-oauth-token"))),
	)
	if err := client.Request(context.Background(), http.MethodGet, redirect.URL, nil, nil); err == nil {
		t.Fatal("expected redirect response to be returned as an error")
	}
	if redirectAuth != "Bearer redirect-oauth-token" {
		t.Fatalf("redirect request Authorization = %q, want original bearer credentials", redirectAuth)
	}
	if got := targetHits.Load(); got != 0 {
		t.Fatalf("redirect target received %d requests; bearer credentials may have been forwarded", got)
	}
}

func TestTransport_NilInputsAreHandledWithoutPanic(t *testing.T) {
	client := NewClient()
	var nilContext context.Context
	if _, _, err := client.Execute(nilContext, nil, nil); err == nil {
		t.Fatal("expected nil request error")
	}
	if _, _, err := client.Execute(context.Background(), &http.Request{}, nil); err == nil {
		t.Fatal("expected nil request URL error")
	}

	server := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))
	defer server.Close()
	client = NewClient(WithHTTPClient(server.Client()))
	if err := client.Request(nilContext, http.MethodGet, server.URL, nil, nil); err != nil {
		t.Fatalf("expected nil context to use a background context, got %v", err)
	}
}

func TestTransport_DropsPartialResponseWhenRoundTripReturnsError(t *testing.T) {
	partialResponse := &http.Response{
		StatusCode: http.StatusBadGateway,
		Header:     make(http.Header),
		Body:       io.NopCloser(strings.NewReader("partial response")),
	}
	client := NewClient(
		WithHTTPClient(&http.Client{Transport: roundTripFunc(func(*http.Request) (*http.Response, error) {
			return partialResponse, errors.New("connection failed")
		})}),
		WithRetryPolicy(RetryPolicy{Jitter: false}),
	)
	req, err := http.NewRequest(http.MethodGet, "https://api.gemini.com/v1/test", nil)
	if err != nil {
		t.Fatalf("creating request: %v", err)
	}

	resp, body, err := client.Execute(context.Background(), req, nil)
	if resp != nil {
		t.Fatalf("Execute returned partial response: %#v", resp)
	}
	if body != nil {
		t.Fatalf("Execute returned partial body: %q", body)
	}
	if err == nil || !strings.Contains(err.Error(), "connection failed") {
		t.Fatalf("Execute error = %v, want connection failure", err)
	}
}

func TestTransport_MutatingPostNeverRetried(t *testing.T) {
	var attempts int32
	server := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		atomic.AddInt32(&attempts, 1)
		w.WriteHeader(http.StatusTooManyRequests)
		_, _ = w.Write([]byte(`{"result":"error","reason":"RateLimit","message":"rate limited on order creation"}`))
	}))
	defer server.Close()

	client := NewClient(
		WithHTTPClient(server.Client()),
		WithRetryPolicy(RetryPolicy{
			MaxRetries: 5,
			BaseDelay:  time.Millisecond,
		}),
	)

	err := client.Request(context.Background(), http.MethodPost, server.URL, map[string]string{"order": "123"}, nil)
	if err == nil {
		t.Fatal("expected error, got nil")
	}

	if attempts != 1 {
		t.Fatalf("CRITICAL SAFETY FAILURE: POST was retried! Expected 1 attempt, got %d", attempts)
	}

	if !errors.Is(err, ErrRateLimited) {
		t.Fatalf("expected errors.Is(err, ErrRateLimited) to be true, got %v", err)
	}
}

func TestTransport_BearerPostNeverRetried(t *testing.T) {
	var attempts atomic.Int32
	var sourceCalls atomic.Int32
	server := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		attempts.Add(1)
		w.WriteHeader(http.StatusTooManyRequests)
		_, _ = w.Write([]byte(`{"result":"error","reason":"RateLimit","message":"oauth operation rate limited"}`))
	}))
	defer server.Close()

	client := NewClient(
		WithHTTPClient(server.Client()),
		WithAuth(auth.NewBearerWithSource(auth.TokenFunc(func(context.Context) (string, error) {
			sourceCalls.Add(1)
			return "oauth-token", nil
		}))),
		WithRetryPolicy(RetryPolicy{MaxRetries: 5, BaseDelay: time.Millisecond}),
	)

	err := client.Request(context.Background(), http.MethodPost, server.URL, map[string]string{"operation": "revoke"}, nil)
	if !errors.Is(err, ErrRateLimited) {
		t.Fatalf("expected ErrRateLimited, got %v", err)
	}
	if got := attempts.Load(); got != 1 {
		t.Fatalf("OAuth POST attempts = %d, want 1", got)
	}
	if got := sourceCalls.Load(); got != 1 {
		t.Fatalf("token source calls = %d, want 1", got)
	}
}

func TestTransport_ClockSkewCalibration(t *testing.T) {
	// Server clock is 2 hours in the future
	futureServerTime := time.Now().Add(2 * time.Hour).UTC().Truncate(time.Second)

	server := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Date", futureServerTime.Format(http.TimeFormat))
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"result":"ok"}`))
	}))
	defer server.Close()

	hmacAuth := auth.NewHMAC("my-key", "my-secret")
	client := NewClient(
		WithHTTPClient(server.Client()),
		WithAuth(hmacAuth),
	)

	// Before calibration, nonce is around local time (within seconds)
	nonceBefore, _ := strconv.ParseInt(hmacAuth.NextNonce(), 10, 64)
	localMilli := time.Now().UnixMilli()
	if nonceBefore-localMilli > 10000 {
		t.Fatalf("nonceBefore unexpectedly far from local time: %d vs %d", nonceBefore, localMilli)
	}

	// Make request to trigger Date header inspection and clock calibration
	var res map[string]any
	if err := client.Request(context.Background(), http.MethodGet, server.URL, nil, &res); err != nil {
		t.Fatalf("request failed: %v", err)
	}

	// After calibration, nonce must match future server time (+2 hours)
	nonceAfter, _ := strconv.ParseInt(hmacAuth.NextNonce(), 10, 64)
	futureMilli := futureServerTime.UnixMilli()

	diff := nonceAfter - futureMilli
	if diff < -2000 || diff > 2000 {
		t.Fatalf("expected nonceAfter to be within 2s of server time (%d), got %d (diff=%dms)",
			futureMilli, nonceAfter, diff)
	}
}

func TestTransport_SerializesAuthenticatedRequestsThroughRetries(t *testing.T) {
	var active atomic.Int32
	var maxActive atomic.Int32
	firstRequestStarted := make(chan struct{})
	releaseFirstRequest := make(chan struct{})
	var firstRequest sync.Once
	server := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		current := active.Add(1)
		for {
			previous := maxActive.Load()
			if current <= previous || maxActive.CompareAndSwap(previous, current) {
				break
			}
		}
		firstRequest.Do(func() { close(firstRequestStarted) })
		<-releaseFirstRequest
		active.Add(-1)
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"result":"ok"}`))
	}))
	defer server.Close()

	client := NewClient(
		WithHTTPClient(server.Client()),
		WithAuth(auth.NewHMAC("key", "secret")),
		WithRetryPolicy(RetryPolicy{MaxRetries: 0}),
	)

	const requests = 16
	var wg sync.WaitGroup
	errs := make(chan error, requests)
	for i := 0; i < requests; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			errs <- client.Request(context.Background(), http.MethodGet, server.URL, nil, nil)
		}()
	}
	select {
	case <-firstRequestStarted:
	case <-time.After(time.Second):
		t.Fatal("timed out waiting for the first authenticated request")
	}
	close(releaseFirstRequest)
	wg.Wait()
	close(errs)
	for err := range errs {
		if err != nil {
			t.Fatalf("authenticated request failed: %v", err)
		}
	}
	if got := maxActive.Load(); got != 1 {
		t.Fatalf("expected authenticated requests to be serialized, max concurrency was %d", got)
	}
}

func TestTransport_DeadlineErrorsUnwrapToSentinel(t *testing.T) {
	server := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		time.Sleep(100 * time.Millisecond)
		w.WriteHeader(http.StatusOK)
	}))
	defer server.Close()

	client := NewClient(WithHTTPClient(server.Client()))
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Millisecond)
	defer cancel()

	err := client.Request(ctx, http.MethodGet, server.URL, nil, nil)
	if err == nil || !errors.Is(err, ErrDeadlineExceeded) || !errors.Is(err, context.DeadlineExceeded) {
		t.Fatalf("expected ErrDeadlineExceeded, got %v", err)
	}
}

func TestTransport_NilResponseAndRawBodySafety(t *testing.T) {
	if err := ClassifyResponse(nil, nil); !errors.Is(err, ErrNoResponse) {
		t.Fatalf("expected ErrNoResponse, got %v", err)
	}

	const secretBody = `{"error":"do not put this in the error string"}`
	err := ClassifyResponse(&http.Response{StatusCode: http.StatusBadRequest}, []byte(secretBody))
	if err == nil {
		t.Fatal("expected classified error")
	}
	if strings.Contains(err.Error(), secretBody) {
		t.Fatalf("API error exposed raw response body: %v", err)
	}
}

type nilStartHook struct{}

type transportContextKey struct{}

func (nilStartHook) OnRequestStart(context.Context, *http.Request) context.Context {
	return nil
}

func (nilStartHook) OnRequestEnd(context.Context, *http.Request, *http.Response, time.Duration, error) {
}
func (nilStartHook) OnRetry(context.Context, *http.Request, int, time.Duration, error) {}
func (nilStartHook) OnRateLimit(context.Context, *http.Request, time.Duration)         {}

func TestTransport_HookCannotDiscardRequestContext(t *testing.T) {
	ctx := context.WithValue(context.Background(), transportContextKey{}, "preserved")
	hooks := MultiHook{nilStartHook{}}
	got := hooks.OnRequestStart(ctx, &http.Request{})
	if got == nil || got.Value(transportContextKey{}) != "preserved" {
		t.Fatalf("expected hook pipeline to preserve context, got %v", got)
	}
}

type mockRateLimitHook struct {
	MultiHook
	rateLimitedAfter time.Duration
	notified         bool
}

func (m *mockRateLimitHook) OnRateLimit(ctx context.Context, req *http.Request, retryAfter time.Duration) {
	m.rateLimitedAfter = retryAfter
	m.notified = true
}

func TestTransport_RateLimitWithRetryAfter(t *testing.T) {
	server := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Retry-After", "3")
		w.WriteHeader(http.StatusTooManyRequests)
		_, _ = w.Write([]byte(`{"result":"error","reason":"RateLimit","message":"exceeded 100 rps limit"}`))
	}))
	defer server.Close()

	hook := &mockRateLimitHook{}
	client := NewClient(
		WithHTTPClient(server.Client()),
		WithHooks(hook),
		WithRetryPolicy(RetryPolicy{MaxRetries: 0}), // Don't retry, test immediate error
	)

	err := client.Request(context.Background(), http.MethodGet, server.URL, nil, nil)
	if err == nil {
		t.Fatal("expected error, got nil")
	}

	var rateErr *RateLimitError
	if !errors.As(err, &rateErr) {
		t.Fatalf("expected *RateLimitError, got %T: %v", err, err)
	}

	if rateErr.RetryAfter != 3*time.Second {
		t.Fatalf("expected RetryAfter=3s, got %v", rateErr.RetryAfter)
	}

	if !hook.notified || hook.rateLimitedAfter != 3*time.Second {
		t.Fatalf("expected hook to be notified with 3s, got notified=%v, duration=%v", hook.notified, hook.rateLimitedAfter)
	}
}

func TestTransport_PaginationSeq(t *testing.T) {
	items := []string{"item1", "item2", "item3", "item4", "item5"}

	fetcher := func(ctx context.Context, offset, limit int) ([]string, bool, error) {
		if offset >= len(items) {
			return nil, false, nil
		}
		end := offset + limit
		if end > len(items) {
			end = len(items)
		}
		return items[offset:end], end < len(items), nil
	}

	paginator := NewPaginator(context.Background(), 0, 2, fetcher)

	var collected []string
	for item, err := range paginator {
		if err != nil {
			t.Fatalf("unexpected pagination error: %v", err)
		}
		collected = append(collected, item)
	}

	if len(collected) != len(items) {
		t.Fatalf("expected %d items, got %d", len(items), len(collected))
	}
	for i, v := range collected {
		if v != items[i] {
			t.Errorf("at index %d: expected %s, got %s", i, items[i], v)
		}
	}
}

func TestTransport_ErrorUnwrap(t *testing.T) {
	apiErr := &APIError{
		StatusCode: 400,
		Reason:     "InvalidNonce",
		Message:    "Nonce 100 is less than last nonce 105",
	}

	if !errors.Is(apiErr, ErrInvalidNonce) {
		t.Fatalf("expected errors.Is(apiErr, ErrInvalidNonce) to be true")
	}
	formatted := fmt.Sprintf("%v", apiErr)
	if formatted != "gemini api error (status 400): InvalidNonce - Nonce 100 is less than last nonce 105" {
		t.Errorf("unexpected error format: %s", formatted)
	}
}

func TestTransport_ContextCancellation(t *testing.T) {
	server := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"result":"ok"}`))
	}))
	defer server.Close()

	client := NewClient(
		WithHTTPClient(server.Client()),
	)

	ctx, cancel := context.WithCancel(context.Background())
	cancel() // cancel immediately

	err := client.Request(ctx, http.MethodGet, server.URL, nil, nil)
	if err == nil || !errors.Is(err, context.Canceled) {
		t.Fatalf("expected context.Canceled error, got %v", err)
	}
}

func TestTransport_APIErrorPayloadParsing(t *testing.T) {
	testCases := []struct {
		name        string
		status      int
		body        string
		expectedErr error
	}{
		{
			name:        "InvalidSignature",
			status:      400,
			body:        `{"result":"error","reason":"InvalidSignature","message":"Signature failed HMAC-SHA384 verification"}`,
			expectedErr: ErrInvalidSignature,
		},
		{
			name:        "MarketClosed",
			status:      400,
			body:        `{"result":"error","reason":"MarketClosed","message":"Trading on this pair is halted"}`,
			expectedErr: ErrMarketClosed,
		},
		{
			name:        "OrderNotFound",
			status:      404,
			body:        `{"result":"error","reason":"OrderNotFound","message":"Order 123456 not found in active book"}`,
			expectedErr: ErrOrderNotFound,
		},
		{
			name:        "InsufficientFunds",
			status:      400,
			body:        `{"result":"error","reason":"InsufficientFunds","message":"Account balance insufficient for order"}`,
			expectedErr: ErrInsufficientFunds,
		},
		{
			name:        "MustAcceptTerms",
			status:      403,
			body:        `{"result":"error","reason":"MustAcceptTerms","message":"User must accept prediction market terms"}`,
			expectedErr: ErrAcceptTermsRequired,
		},
		{
			name:        "SelfCrossPrevented",
			status:      400,
			body:        `{"result":"error","reason":"SelfCrossPrevented","message":"Order would execute against existing resting order"}`,
			expectedErr: ErrSelfCrossPrevented,
		},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			server := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				w.Header().Set("Content-Type", "application/json")
				w.WriteHeader(tc.status)
				_, _ = w.Write([]byte(tc.body))
			}))
			defer server.Close()

			client := NewClient(WithHTTPClient(server.Client()))
			err := client.Request(context.Background(), http.MethodGet, server.URL, nil, nil)
			if err == nil {
				t.Fatalf("expected error, got nil")
			}
			if !errors.Is(err, tc.expectedErr) {
				t.Fatalf("expected errors.Is(err, %v), got %v", tc.expectedErr, err)
			}
		})
	}
}

func TestTransport_TelemetryHeaders(t *testing.T) {
	var capturedUserAgent string
	var capturedClientTelemetry string

	server := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		capturedUserAgent = r.Header.Get("User-Agent")
		capturedClientTelemetry = r.Header.Get("X-Gemini-Client-User-Agent")
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"status":"ok"}`))
	}))
	defer server.Close()

	client := NewClient(WithHTTPClient(server.Client()))
	err := client.Request(context.Background(), http.MethodGet, server.URL, nil, nil)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if capturedUserAgent != "gemini-go/0.1.0" {
		t.Fatalf("expected User-Agent gemini-go/0.1.0, got %s", capturedUserAgent)
	}
	if capturedClientTelemetry == "" {
		t.Fatal("expected X-Gemini-Client-User-Agent header to be populated")
	}

	var telemetry map[string]string
	if err := json.Unmarshal([]byte(capturedClientTelemetry), &telemetry); err != nil {
		t.Fatalf("failed unmarshaling telemetry header JSON: %v", err)
	}
	if telemetry["lang"] != "go" || telemetry["bindings_version"] != "0.1.0" {
		t.Fatalf("unexpected telemetry values: %+v", telemetry)
	}
}

func TestTransport_RequestIDExtraction(t *testing.T) {
	server := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("X-GEMINI-REQUEST-ID", "req_abc123xyz")
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		_, _ = w.Write([]byte(`{"result":"error","reason":"InvalidPayload","message":"bad field"}`))
	}))
	defer server.Close()

	client := NewClient(WithHTTPClient(server.Client()))
	err := client.Request(context.Background(), http.MethodGet, server.URL, nil, nil)
	if err == nil {
		t.Fatal("expected error, got nil")
	}

	reqID := RequestIDFromError(err)
	if reqID != "req_abc123xyz" {
		t.Fatalf("expected request id req_abc123xyz, got %q", reqID)
	}

	var apiErr *APIError
	if !errors.As(err, &apiErr) {
		t.Fatalf("expected error to be *APIError")
	}
	if apiErr.RequestID != "req_abc123xyz" {
		t.Fatalf("expected APIError.RequestID to be req_abc123xyz, got %q", apiErr.RequestID)
	}
	if !strings.Contains(err.Error(), "req_abc123xyz") {
		t.Fatalf("expected error string to contain request id, got %s", err.Error())
	}
}

func TestTransport_HTTPStatusTaxonomy(t *testing.T) {
	testCases := []struct {
		statusCode  int
		expectedErr error
	}{
		{http.StatusBadRequest, ErrBadRequest},
		{http.StatusUnauthorized, ErrUnauthorized},
		{http.StatusForbidden, ErrPermissionDenied},
		{http.StatusNotFound, ErrNotFound},
		{http.StatusConflict, ErrConflict},
		{http.StatusInternalServerError, ErrInternalServer},
		{http.StatusServiceUnavailable, ErrServiceUnavailable},
	}

	for _, tc := range testCases {
		t.Run(http.StatusText(tc.statusCode), func(t *testing.T) {
			server := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				w.WriteHeader(tc.statusCode)
				_, _ = w.Write([]byte(`{"error":"raw server message"}`))
			}))
			defer server.Close()

			client := NewClient(WithHTTPClient(server.Client()))
			err := client.Request(context.Background(), http.MethodGet, server.URL, nil, nil)
			if err == nil {
				t.Fatal("expected error, got nil")
			}
			if !errors.Is(err, tc.expectedErr) {
				t.Fatalf("expected errors.Is(err, %v), got %v", tc.expectedErr, err)
			}
		})
	}
}

func TestTransport_BoundedResponseBody(t *testing.T) {
	server := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/octet-stream")
		w.WriteHeader(http.StatusOK)
		// Stream 33 MB of zeroes (exceeds 32 MB limit)
		chunk := make([]byte, 1024*1024)
		for i := 0; i < 33; i++ {
			if _, err := w.Write(chunk); err != nil {
				return
			}
		}
	}))
	defer server.Close()

	client := NewClient(WithHTTPClient(server.Client()))
	err := client.Request(context.Background(), http.MethodGet, server.URL, nil, nil)
	if err == nil {
		t.Fatal("expected error for response body exceeding 32MB limit, got nil")
	}
	if !errors.Is(err, ErrBodyExceededLimit) {
		t.Fatalf("expected ErrBodyExceededLimit, got %v", err)
	}
}

func TestError_AsAndIsTaxonomy(t *testing.T) {
	rateLimitErr := &RateLimitError{
		APIError: APIError{
			StatusCode: http.StatusTooManyRequests,
			Reason:     "RateLimit",
			Message:    "too many requests",
			RequestID:  "req-123",
		},
		RetryAfter: 2 * time.Second,
	}

	var apiErr *APIError
	if !errors.As(rateLimitErr, &apiErr) {
		t.Fatal("expected errors.As to match *APIError from *RateLimitError")
	}
	if apiErr.RequestID != "req-123" {
		t.Errorf("expected RequestID 'req-123', got '%s'", apiErr.RequestID)
	}
	if !errors.Is(rateLimitErr, ErrRateLimited) {
		t.Fatal("expected errors.Is(rateLimitErr, ErrRateLimited) to be true")
	}

	missingNonceErr := &APIError{
		StatusCode: http.StatusBadRequest,
		Reason:     "MissingNonce",
		Message:    "nonce missing",
	}
	if !errors.Is(missingNonceErr, ErrMissingNonce) {
		t.Fatal("expected errors.Is(missingNonceErr, ErrMissingNonce) to be true")
	}
	if !errors.Is(missingNonceErr, ErrInvalidNonce) {
		t.Fatal("expected errors.Is(missingNonceErr, ErrInvalidNonce) to be true")
	}

	missingRoleErr := &APIError{
		StatusCode: http.StatusForbidden,
		Reason:     "MissingRole",
		Message:    "role missing",
	}
	if !errors.Is(missingRoleErr, ErrMissingRole) {
		t.Fatal("expected errors.Is(missingRoleErr, ErrMissingRole) to be true")
	}
}

func BenchmarkTransport_Request(b *testing.B) {
	server := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"result":"ok","order_id":"12345"}`))
	}))
	defer server.Close()

	client := NewClient(
		WithHTTPClient(server.Client()),
	)

	payload := map[string]string{"symbol": "BTCUSD", "amount": "1.5"}
	var target struct {
		Result  string `json:"result"`
		OrderID string `json:"order_id"`
	}

	b.ResetTimer()
	b.ReportAllocs()

	for i := 0; i < b.N; i++ {
		_ = client.Request(context.Background(), http.MethodPost, server.URL, payload, &target)
	}
}
