package auth

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha512"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"hash"
	"io"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"time"
)

// NonceGenerator generates nonce strings.
type NonceGenerator interface {
	Next() string
}

type monotonicNonce struct {
	lastNonce  atomic.Int64
	skewOffset atomic.Int64 // Skew in nanoseconds
	nowFunc    func() time.Time
	unit       func(time.Time) int64
}

var _ NonceGenerator = (*monotonicNonce)(nil)

func newMonotonicNonce(nowFunc func() time.Time) *monotonicNonce {
	if nowFunc == nil {
		nowFunc = time.Now
	}
	return &monotonicNonce{
		nowFunc: nowFunc,
		unit:    func(now time.Time) int64 { return now.UnixMilli() },
	}
}

func newSecondNonce(nowFunc func() time.Time) *monotonicNonce {
	if nowFunc == nil {
		nowFunc = time.Now
	}
	return &monotonicNonce{
		nowFunc: nowFunc,
		unit:    func(now time.Time) int64 { return now.Unix() },
	}
}

type timeBasedNonce struct {
	skewOffset atomic.Int64 // Skew in nanoseconds
	nowFunc    func() time.Time
}

func newTimeBasedNonce(nowFunc func() time.Time) *timeBasedNonce {
	if nowFunc == nil {
		nowFunc = time.Now
	}
	return &timeBasedNonce{nowFunc: nowFunc}
}

func (n *timeBasedNonce) SetSkew(skew time.Duration) {
	n.skewOffset.Store(int64(skew))
}

func (n *timeBasedNonce) Next() string {
	skew := time.Duration(n.skewOffset.Load())
	return strconv.FormatInt(n.nowFunc().Add(skew).Unix(), 10)
}

func (m *monotonicNonce) SetSkew(skew time.Duration) {
	m.skewOffset.Store(int64(skew))
}

func (m *monotonicNonce) Next() string {
	skew := time.Duration(m.skewOffset.Load())
	now := m.unit(m.nowFunc().Add(skew))
	for {
		last := m.lastNonce.Load()
		next := now
		if next <= last {
			next = last + 1
		}
		if m.lastNonce.CompareAndSwap(last, next) {
			return strconv.FormatInt(next, 10)
		}
	}
}

// ClockSkewCalibrator allows calibrating local timestamp generation against remote server time.
type ClockSkewCalibrator interface {
	CalibrateServerTime(serverTime time.Time)
}

// NonceMode identifies the API-key nonce contract used by an HMAC strategy.
// Monotonic mode is appropriate for REST API keys that require strictly
// increasing millisecond nonces. Time-based mode uses epoch seconds for both
// REST and private WebSocket authentication, as required by time-based keys.
type NonceMode uint8

const (
	NonceModeMonotonic NonceMode = iota
	NonceModeTimeBased
)

func (m NonceMode) valid() bool {
	return m == NonceModeMonotonic || m == NonceModeTimeBased
}

// HMAC implements Gemini's HMAC-SHA384 payload signing authentication strategy.
type HMAC struct {
	key              APIKey
	secret           APISecret
	nonceMode        NonceMode
	nonces           NonceGenerator
	wsNonces         NonceGenerator
	requestGate      chan struct{}
	hasherPool       sync.Pool
	configurationErr error
}

var (
	_ Strategy            = (*HMAC)(nil)
	_ ClockSkewCalibrator = (*HMAC)(nil)
	_ RequestSequencer    = (*HMAC)(nil)
)

type HMACOption func(*HMAC)

// WithNonceMode selects the nonce contract for the HMAC strategy. The option
// updates both REST and WebSocket defaults so a time-based strategy can safely
// authenticate both surfaces with the same API key.
func WithNonceMode(mode NonceMode) HMACOption {
	return func(h *HMAC) {
		if !mode.valid() {
			h.configurationErr = fmt.Errorf("%w: %d", ErrInvalidNonceMode, mode)
			return
		}
		h.nonceMode = mode
		if mode == NonceModeTimeBased {
			h.nonces = newTimeBasedNonce(time.Now)
			h.wsNonces = newTimeBasedNonce(time.Now)
			return
		}
		h.nonces = newMonotonicNonce(time.Now)
		h.wsNonces = newSecondNonce(time.Now)
	}
}

// WithCustomNonceGenerator allows injecting a deterministic or custom nonce generator.
func WithCustomNonceGenerator(gen NonceGenerator) HMACOption {
	return func(h *HMAC) {
		if gen != nil {
			h.nonces = gen
		}
	}
}

// NewHMAC creates a new HMAC-SHA384 authentication strategy with monotonic nonce generator.
func NewHMAC(key APIKey, secret APISecret, opts ...HMACOption) *HMAC {
	h := &HMAC{
		key:         key,
		secret:      secret,
		nonceMode:   NonceModeMonotonic,
		nonces:      newMonotonicNonce(time.Now),
		wsNonces:    newSecondNonce(time.Now),
		requestGate: make(chan struct{}, 1),
	}
	h.requestGate <- struct{}{}
	h.hasherPool.New = func() any {
		return hmac.New(sha512.New384, []byte(secret))
	}
	for _, opt := range opts {
		opt(h)
	}
	return h
}

// NewTimeBasedHMAC creates an HMAC strategy for a time-based API key. Its
// epoch-second nonce generator is valid for both private REST and WebSocket
// authentication.
func NewTimeBasedHMAC(key APIKey, secret APISecret, opts ...HMACOption) *HMAC {
	allOpts := make([]HMACOption, 0, len(opts)+1)
	allOpts = append(allOpts, WithNonceMode(NonceModeTimeBased))
	allOpts = append(allOpts, opts...)
	return NewHMAC(key, secret, allOpts...)
}

// Validate reports whether the HMAC strategy has usable credentials.
func (h *HMAC) Validate() error {
	if h == nil || !validHeaderCredential(string(h.key)) || strings.TrimSpace(string(h.secret)) == "" {
		return ErrInvalidHMACCredentials
	}
	if h.configurationErr != nil {
		return h.configurationErr
	}
	if !h.nonceMode.valid() {
		return fmt.Errorf("%w: %d", ErrInvalidNonceMode, h.nonceMode)
	}
	return nil
}

// Key returns a masked API-key identifier suitable for logs and telemetry.
func (h *HMAC) Key() string {
	return h.key.String()
}

// AcquireRequest serializes a complete authenticated request attempt sequence.
// Gemini rejects a request when its nonce arrives after a larger nonce from the
// same API key, so the gate must remain held through transport retries.
func (h *HMAC) AcquireRequest(ctx context.Context) (func(), error) {
	if err := h.Validate(); err != nil {
		return nil, err
	}
	if ctx == nil {
		ctx = context.Background()
	}
	select {
	case <-ctx.Done():
		return nil, ctx.Err()
	case <-h.requestGate:
		return func() { h.requestGate <- struct{}{} }, nil
	}
}

// NextNonce returns the next nonce for the configured nonce mode.
func (h *HMAC) NextNonce() string {
	return h.nonces.Next()
}

// CalibrateServerTime adjusts nonce timestamps based on remote Gemini server time.
func (h *HMAC) CalibrateServerTime(serverTime time.Time) {
	skew := time.Until(serverTime)
	if mono, ok := h.nonces.(*monotonicNonce); ok {
		mono.SetSkew(skew)
	}
	if mono, ok := h.wsNonces.(*monotonicNonce); ok {
		mono.SetSkew(skew)
	}
	if timestamp, ok := h.nonces.(*timeBasedNonce); ok {
		timestamp.SetSkew(skew)
	}
	if timestamp, ok := h.wsNonces.(*timeBasedNonce); ok {
		timestamp.SetSkew(skew)
	}
}

// BuildPayload constructs the Gemini payload map with request path and nonce injected.
func (h *HMAC) BuildPayload(requestPath string, customParams []byte) ([]byte, error) {
	if err := h.Validate(); err != nil {
		return nil, err
	}
	trimmed := bytes.TrimSpace(customParams)
	nonce := h.NextNonce()

	payloadMap := make(map[string]json.RawMessage)
	if len(trimmed) > 0 && !bytes.Equal(trimmed, []byte("null")) {
		if err := json.Unmarshal(trimmed, &payloadMap); err != nil {
			return nil, fmt.Errorf("gemini auth: invalid json payload parameters: %w", err)
		}
		if payloadMap == nil {
			payloadMap = make(map[string]json.RawMessage)
		}
	}

	requestJSON, err := json.Marshal(requestPath)
	if err != nil {
		return nil, fmt.Errorf("gemini auth: encoding request path: %w", err)
	}
	nonceJSON, err := json.Marshal(nonce)
	if err != nil {
		return nil, fmt.Errorf("gemini auth: encoding nonce: %w", err)
	}
	payloadMap["request"] = requestJSON
	payloadMap["nonce"] = nonceJSON

	return json.Marshal(payloadMap)
}

func hashToHex(hasher hash.Hash) string {
	var sumBuf [48]byte
	sum := hasher.Sum(sumBuf[:0])
	var hexBuf [96]byte
	hex.Encode(hexBuf[:], sum)
	return string(hexBuf[:])
}

// Sign calculates the HMAC-SHA384 hex signature of a base64 encoded payload.
func (h *HMAC) Sign(b64Payload []byte) string {
	if h == nil || h.Validate() != nil {
		return ""
	}
	hasher, ok := h.hasherPool.Get().(hash.Hash)
	if !ok || hasher == nil {
		return ""
	}
	hasher.Reset()
	hasher.Write(b64Payload)
	sig := hashToHex(hasher)
	h.hasherPool.Put(hasher)
	return sig
}

// SignString calculates the HMAC-SHA384 hex signature of a base64 encoded string payload.
func (h *HMAC) SignString(b64Payload string) string {
	if h == nil || h.Validate() != nil {
		return ""
	}
	hasher, ok := h.hasherPool.Get().(hash.Hash)
	if !ok || hasher == nil {
		return ""
	}
	hasher.Reset()
	_, _ = io.WriteString(hasher, b64Payload)
	sig := hashToHex(hasher)
	h.hasherPool.Put(hasher)
	return sig
}

// Authenticate prepares the HTTP request according to Gemini private REST protocol.
func (h *HMAC) Authenticate(ctx context.Context, req *http.Request, payloadJSON []byte) error {
	if ctx != nil {
		if err := ctx.Err(); err != nil {
			return err
		}
	}
	if req == nil {
		return fmt.Errorf("gemini auth: nil request")
	}
	if err := h.Validate(); err != nil {
		return err
	}
	if req.Header == nil {
		req.Header = make(http.Header)
	}
	clearAuthenticationHeaders(req.Header)
	if req.URL == nil {
		return fmt.Errorf("gemini auth: request URL is nil")
	}
	fullPayload, err := h.BuildPayload(req.URL.Path, payloadJSON)
	if err != nil {
		return err
	}

	b64Payload := base64.StdEncoding.EncodeToString(fullPayload)
	signature := h.SignString(b64Payload)

	req.Header.Set("Content-Type", "text/plain")
	req.Header.Set("Content-Length", "0")
	req.Header.Set(geminiAPIKeyHeader, string(h.key))
	req.Header.Set(geminiPayloadHeader, b64Payload)
	req.Header.Set(geminiSignatureHeader, signature)
	req.Header.Set("Cache-Control", "no-cache")

	// Ensure empty body on the wire
	req.Body = http.NoBody
	req.ContentLength = 0

	return nil
}

// AuthenticateWebSocket prepares handshake HTTP headers for Gemini private WebSocket feeds.
func (h *HMAC) AuthenticateWebSocket(ctx context.Context, req *http.Request) error {
	if ctx != nil {
		if err := ctx.Err(); err != nil {
			return err
		}
	}
	if req == nil {
		return fmt.Errorf("gemini auth: nil request")
	}
	if err := h.Validate(); err != nil {
		return err
	}
	if h.nonceMode != NonceModeTimeBased {
		return ErrTimeBasedNonceRequired
	}
	if req.Header == nil {
		req.Header = make(http.Header)
	}
	clearAuthenticationHeaders(req.Header)
	nonce := h.wsNonces.Next()
	b64Payload := base64.StdEncoding.EncodeToString([]byte(nonce))
	signature := h.SignString(b64Payload)

	req.Header.Set(geminiAPIKeyHeader, string(h.key))
	req.Header.Set(geminiNonceHeader, nonce)
	req.Header.Set(geminiPayloadHeader, b64Payload)
	req.Header.Set(geminiSignatureHeader, signature)
	return nil
}

// VerifySignature verifies an incoming Gemini HMAC-SHA384 signature in constant time against a Base64-encoded payload.
func VerifySignature(secret APISecret, b64Payload, signature string) bool {
	if strings.TrimSpace(string(secret)) == "" || len(signature) != hex.EncodedLen(sha512.Size384) {
		return false
	}
	provided, err := hex.DecodeString(signature)
	if err != nil {
		return false
	}

	hasher := hmac.New(sha512.New384, []byte(secret))
	_, _ = io.WriteString(hasher, b64Payload)
	return hmac.Equal(hasher.Sum(nil), provided)
}
