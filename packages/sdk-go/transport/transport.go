package transport

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net"
	"net/http"
	"runtime"
	"strings"
	"sync"
	"time"

	"github.com/gemini/developer-platform/packages/sdk-go/auth"
)

var defaultClientUserAgentJSON = func() string {
	info := map[string]string{
		"bindings_version": "0.1.0",
		"lang":             "go",
		"lang_version":     runtime.Version(),
		"platform":         runtime.GOOS,
		"arch":             runtime.GOARCH,
		"engine":           runtime.Compiler,
	}
	data, _ := json.Marshal(info)
	return string(data)
}()

// DefaultHTTPTransport returns a production-tuned HTTP transport optimized for high-throughput REST API calls.
func DefaultHTTPTransport() *http.Transport {
	return &http.Transport{
		Proxy: http.ProxyFromEnvironment,
		DialContext: (&net.Dialer{
			Timeout:   10 * time.Second,
			KeepAlive: 30 * time.Second,
		}).DialContext,
		ForceAttemptHTTP2:     true,
		MaxIdleConns:          128,
		MaxIdleConnsPerHost:   128,
		IdleConnTimeout:       90 * time.Second,
		TLSHandshakeTimeout:   10 * time.Second,
		ExpectContinueTimeout: 1 * time.Second,
	}
}

// DefaultHTTPClient returns a pre-configured http.Client with connection pooling and reasonable timeouts.
func DefaultHTTPClient() *http.Client {
	return &http.Client{
		Transport: DefaultHTTPTransport(),
		Timeout:   30 * time.Second,
		// API credentials must never be forwarded to an unexpected redirect
		// target. The SDK transport intentionally does not follow redirects;
		// callers that need redirect behavior should issue the final request
		// explicitly so authentication is applied to the intended URL.
		CheckRedirect: func(_ *http.Request, _ []*http.Request) error {
			return http.ErrUseLastResponse
		},
	}
}

// Client executes HTTP requests with Gemini authentication, safe retries, and structured logging.
type Client struct {
	httpClient *http.Client
	auth       auth.Strategy
	retry      RetryPolicy
	logger     *slog.Logger
	userAgent  string
	hooks      MultiHook
	configErr  error
}

// Option configures the transport Client.
type Option func(*Client)

// WithAuth sets the authentication strategy.
func WithAuth(strategy auth.Strategy) Option {
	return func(c *Client) {
		c.auth = strategy
	}
}

// WithRetryPolicy sets the retry policy.
func WithRetryPolicy(p RetryPolicy) Option {
	return func(c *Client) {
		c.retry = p
	}
}

// WithLogger sets the structured logger.
func WithLogger(l *slog.Logger) Option {
	return func(c *Client) {
		c.logger = l
	}
}

// WithHTTPClient sets a custom base http.Client.
func WithHTTPClient(hc *http.Client) Option {
	return func(c *Client) {
		c.httpClient = hc
	}
}

// WithUserAgent sets a custom User-Agent header string.
func WithUserAgent(ua string) Option {
	return func(c *Client) {
		c.userAgent = ua
	}
}

// WithHooks appends observability hooks to the transport client.
func WithHooks(hooks ...Hook) Option {
	return func(c *Client) {
		c.hooks = append(c.hooks, hooks...)
	}
}

// WithConfigurationError makes every request fail with the supplied
// configuration error. It is used by higher-level facades that must preserve
// a source-compatible constructor while preventing requests from using an
// unsafe configuration.
func WithConfigurationError(err error) Option {
	return func(c *Client) {
		c.configErr = err
	}
}

// NewClient creates a new configured Gemini transport client.
func NewClient(opts ...Option) *Client {
	c := &Client{
		httpClient: DefaultHTTPClient(),
		retry:      DefaultRetryPolicy(),
		logger:     slog.Default(),
		userAgent:  "gemini-go/0.1.0",
		hooks:      make(MultiHook, 0, 4),
	}
	for _, opt := range opts {
		opt(c)
	}
	if c.httpClient == nil {
		c.httpClient = DefaultHTTPClient()
	}
	// Do not allow a caller-provided redirect policy to forward authenticated
	// headers or signed bodies to another origin. Clone the client so the
	// caller's object is not mutated while preserving its transport, timeout,
	// and cookie jar.
	httpClient := *c.httpClient
	httpClient.CheckRedirect = func(_ *http.Request, _ []*http.Request) error {
		return http.ErrUseLastResponse
	}
	c.httpClient = &httpClient
	// Always include SlogHook if logger is present
	if c.logger != nil {
		c.hooks = append(c.hooks, NewSlogHook(c.logger))
	}
	return c
}

// CloseIdleConnections closes idle HTTP connections held by the client's
// transport. It is safe to call when the client uses a custom http.Client.
func (c *Client) CloseIdleConnections() {
	if c != nil && c.httpClient != nil {
		c.httpClient.CloseIdleConnections()
	}
}

// ConfigurationError returns the error that causes every request to fail
// before network I/O, if one was supplied during construction.
func (c *Client) ConfigurationError() error {
	if c == nil {
		return nil
	}
	return c.configErr
}

// Execute performs an HTTP request with safe retries and response error
// classification. The returned response body is readable and must be closed by
// the caller; the returned byte slice contains the same captured body.
func (c *Client) Execute(ctx context.Context, req *http.Request, payloadJSON []byte) (*http.Response, []byte, error) {
	if c.configErr != nil {
		return nil, nil, c.configErr
	}
	if ctx == nil {
		ctx = context.Background()
	}
	if req == nil {
		return nil, nil, errors.New("gemini transport: nil request")
	}
	if req.URL == nil {
		return nil, nil, errors.New("gemini transport: request URL is nil")
	}
	if req.URL.Host == "" || req.URL.User != nil {
		return nil, nil, ErrInvalidRequestURL
	}
	// Keep the transport boundary HTTPS-only even for public requests. Public
	// data must not silently downgrade when a caller supplies a custom endpoint;
	// test servers should use TLS or an in-memory RoundTripper instead.
	if !strings.EqualFold(req.URL.Scheme, "https") {
		return nil, nil, ErrHTTPSRequired
	}
	if req.Header == nil {
		req.Header = make(http.Header)
	}
	if c.userAgent != "" && req.Header.Get("User-Agent") == "" {
		req.Header.Set("User-Agent", c.userAgent)
	}
	if req.Header.Get("X-Gemini-Client-User-Agent") == "" {
		req.Header.Set("X-Gemini-Client-User-Agent", defaultClientUserAgentJSON)
	}

	start := time.Now()
	requestCtx := ctx
	ctx = c.hooks.OnRequestStart(ctx, req)
	if ctx == nil {
		ctx = requestCtx
	}

	var releaseRequest func()
	if sequencer, ok := c.auth.(auth.RequestSequencer); ok {
		var err error
		releaseRequest, err = sequencer.AcquireRequest(ctx)
		if err != nil {
			c.hooks.OnRequestEnd(ctx, req, nil, time.Since(start), err)
			return nil, nil, err
		}
		defer releaseRequest()
	}

	// Apply authentication if provided
	if c.auth != nil {
		if err := c.auth.Authenticate(ctx, req, payloadJSON); err != nil {
			err = fmt.Errorf("gemini transport: auth failed: %w", err)
			c.hooks.OnRequestEnd(ctx, req, nil, time.Since(start), err)
			return nil, nil, err
		}
	} else if len(payloadJSON) > 0 {
		// Public request with body (unauthenticated)
		req.Header.Set("Content-Type", "application/json")
		req.GetBody = func() (io.ReadCloser, error) {
			return io.NopCloser(bytes.NewReader(payloadJSON)), nil
		}
		body, bodyErr := req.GetBody()
		if bodyErr != nil {
			bodyErr = fmt.Errorf("gemini transport: creating request body: %w", bodyErr)
			c.hooks.OnRequestEnd(ctx, req, nil, time.Since(start), bodyErr)
			return nil, nil, bodyErr
		}
		req.Body = body
		req.ContentLength = int64(len(payloadJSON))
	}

	var resp *http.Response
	var body []byte
	var lastErr error

	maxAttempts := c.retry.MaxRetries
	if maxAttempts < 0 {
		maxAttempts = 0
	}

	for attempt := 0; attempt <= maxAttempts; attempt++ {
		if ctx.Err() != nil {
			err := normalizeTransportError(ctx.Err())
			c.hooks.OnRequestEnd(ctx, req, resp, time.Since(start), err)
			return nil, nil, err
		}

		if attempt > 0 {
			if c.auth != nil {
				if err := c.auth.Authenticate(ctx, req, payloadJSON); err != nil {
					err = fmt.Errorf("gemini transport: auth re-sign failed: %w", err)
					c.hooks.OnRequestEnd(ctx, req, nil, time.Since(start), err)
					return nil, nil, err
				}
			} else if req.GetBody != nil {
				body, bodyErr := req.GetBody()
				if bodyErr != nil {
					bodyErr = fmt.Errorf("gemini transport: recreating request body: %w", bodyErr)
					c.hooks.OnRequestEnd(ctx, req, nil, time.Since(start), bodyErr)
					return nil, nil, bodyErr
				}
				req.Body = body
			}
		}

		// Execute HTTP call. Keep the response for this attempt separate from
		// the response exposed to hooks and callers so an error path can never
		// leave a partially initialized response behind.
		attemptResp, attemptErr := c.httpClient.Do(req.WithContext(ctx))
		lastErr = attemptErr
		resp = nil
		if attemptErr != nil {
			if attemptResp != nil && attemptResp.Body != nil {
				_ = attemptResp.Body.Close()
			}
		} else if attemptResp == nil {
			lastErr = ErrNoResponse
		} else {
			resp = attemptResp
			body, lastErr = readResponseBody(resp)
			if lastErr == nil {
				// readResponseBody closes the network response body. Expose a
				// readable replacement to Execute callers while higher-level
				// helpers continue to consume the captured bytes directly.
				resp.Body = io.NopCloser(bytes.NewReader(body))
			}

			// Calibrate remote clock skew if Date header is present
			dateStr := resp.Header.Get("Date")
			if serverTime, err := http.ParseTime(dateStr); err == nil {
				if cal, ok := c.auth.(auth.ClockSkewCalibrator); ok {
					cal.CalibrateServerTime(serverTime)
				}
			}

			if lastErr == nil && resp.StatusCode >= 200 && resp.StatusCode < 300 {
				c.hooks.OnRequestEnd(ctx, req, resp, time.Since(start), nil)
				return resp, body, nil
			}
		}
		if attemptErr == nil && resp == nil {
			// Defensive fallback: the branch above should always assign resp
			// when attemptErr is nil and attemptResp is non-nil.
			lastErr = ErrNoResponse
		}

		statusCode := 0
		if resp != nil {
			statusCode = resp.StatusCode
		}

		if statusCode == http.StatusTooManyRequests {
			retryAfterHeader := ""
			if resp != nil {
				retryAfterHeader = resp.Header.Get("Retry-After")
			}
			delay := parseRetryAfter(retryAfterHeader)
			c.hooks.OnRateLimit(ctx, req, delay)
		}

		// Check if we should retry
		if attempt < c.retry.MaxRetries && IsRetryable(req.Method, statusCode, lastErr) {
			retryAfterHeader := ""
			if resp != nil {
				retryAfterHeader = resp.Header.Get("Retry-After")
			}
			backoff := c.retry.CalculateBackoff(attempt, retryAfterHeader)

			c.hooks.OnRetry(ctx, req, attempt+1, backoff, lastErr)

			timer := time.NewTimer(backoff)
			select {
			case <-ctx.Done():
				if !timer.Stop() {
					select {
					case <-timer.C:
					default:
					}
				}
				err := normalizeTransportError(ctx.Err())
				c.hooks.OnRequestEnd(ctx, req, resp, time.Since(start), err)
				return nil, nil, err
			case <-timer.C:
				continue
			}
		}

		break
	}

	if lastErr != nil {
		lastErr = normalizeTransportError(lastErr)
	}
	classifiedErr := lastErr
	if classifiedErr == nil {
		classifiedErr = ClassifyResponse(resp, body)
	}

	c.hooks.OnRequestEnd(ctx, req, resp, time.Since(start), classifiedErr)
	return resp, body, classifiedErr
}

func normalizeTransportError(err error) error {
	if err == nil {
		return nil
	}
	if errors.Is(err, context.Canceled) {
		return err
	}
	if errors.Is(err, context.DeadlineExceeded) {
		return fmt.Errorf("%w: %w", ErrDeadlineExceeded, err)
	}
	var netErr net.Error
	if errors.As(err, &netErr) && netErr.Timeout() {
		return fmt.Errorf("%w: %w", ErrDeadlineExceeded, err)
	}
	return err
}

var jsonBufferPool = sync.Pool{
	New: func() any {
		return new(bytes.Buffer)
	},
}

func encodePayload(payload any) ([]byte, func(), error) {
	if payload == nil {
		return nil, func() {}, nil
	}
	buf := jsonBufferPool.Get().(*bytes.Buffer)
	buf.Reset()
	if err := json.NewEncoder(buf).Encode(payload); err != nil {
		jsonBufferPool.Put(buf)
		return nil, nil, err
	}
	raw := bytes.TrimRight(buf.Bytes(), "\n")
	return raw, func() {
		jsonBufferPool.Put(buf)
	}, nil
}

// Request executes a request and unmarshals JSON response into target.
func (c *Client) Request(ctx context.Context, method, targetURL string, payload any, target any) error {
	body, _, err := c.RequestRaw(ctx, method, targetURL, payload)
	if err != nil {
		return err
	}

	if target != nil && len(body) > 0 {
		if err := json.Unmarshal(body, target); err != nil {
			return fmt.Errorf("gemini transport: unmarshaling response into %T: %w", target, err)
		}
	}

	return nil
}

// RequestRaw executes a request and returns raw bytes and headers (for file downloads).
func (c *Client) RequestRaw(ctx context.Context, method, targetURL string, payload any) ([]byte, http.Header, error) {
	if c.configErr != nil {
		return nil, nil, c.configErr
	}
	if ctx == nil {
		ctx = context.Background()
	}
	payloadBytes, cleanup, err := encodePayload(payload)
	if err != nil {
		return nil, nil, fmt.Errorf("gemini transport: marshaling payload: %w", err)
	}
	defer cleanup()

	req, err := http.NewRequestWithContext(ctx, method, targetURL, nil)
	if err != nil {
		return nil, nil, fmt.Errorf("gemini transport: creating request: %w", err)
	}

	resp, body, err := c.Execute(ctx, req, payloadBytes)
	if resp != nil && resp.Body != nil {
		defer resp.Body.Close()
	}
	if err != nil {
		return nil, nil, err
	}

	return body, resp.Header, nil
}

const maxResponseBodyBytes = 32 * 1024 * 1024 // 32MB safety limit
var ErrBodyExceededLimit = errors.New("gemini transport: response body exceeded maximum limit of 32MB")

func readResponseBody(resp *http.Response) ([]byte, error) {
	if resp == nil || resp.Body == nil {
		return nil, nil
	}
	defer resp.Body.Close()

	limitReader := io.LimitReader(resp.Body, maxResponseBodyBytes+1)
	var buf bytes.Buffer
	if resp.ContentLength > 0 && resp.ContentLength <= maxResponseBodyBytes {
		buf.Grow(int(resp.ContentLength))
	}
	if _, err := buf.ReadFrom(limitReader); err != nil {
		return nil, err
	}
	data := buf.Bytes()
	if int64(len(data)) > maxResponseBodyBytes {
		return nil, ErrBodyExceededLimit
	}
	return data, nil
}
