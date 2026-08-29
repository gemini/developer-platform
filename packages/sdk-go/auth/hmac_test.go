package auth

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"sync"
	"testing"
	"time"
)

func TestMonotonicNonce_Concurrency(t *testing.T) {
	fakeTime := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)
	gen := newMonotonicNonce(func() time.Time {
		return fakeTime
	})

	const goroutines = 50
	const iterations = 500
	results := make([][]int64, goroutines)
	var wg sync.WaitGroup

	for i := 0; i < goroutines; i++ {
		wg.Add(1)
		go func(workerID int) {
			defer wg.Done()
			workerResults := make([]int64, iterations)
			for j := 0; j < iterations; j++ {
				nStr := gen.Next()
				val, err := strconv.ParseInt(nStr, 10, 64)
				if err != nil {
					t.Errorf("worker %d: invalid int: %v", workerID, err)
					return
				}
				workerResults[j] = val
			}
			results[workerID] = workerResults
		}(i)
	}

	wg.Wait()

	seen := make(map[int64]bool, goroutines*iterations)
	for workerID, workerResults := range results {
		for _, nonce := range workerResults {
			if seen[nonce] {
				t.Fatalf("duplicate nonce detected from worker %d: %d", workerID, nonce)
			}
			seen[nonce] = true
		}
	}

	if len(seen) != goroutines*iterations {
		t.Fatalf("expected %d unique nonces, got %d", goroutines*iterations, len(seen))
	}
}

func TestHMAC_Authenticate(t *testing.T) {
	key := APIKey("my-test-api-key")
	secret := APISecret("my-test-secret-12345")

	fixedTime := time.Date(2026, 1, 1, 12, 0, 0, 0, time.UTC)
	gen := newMonotonicNonce(func() time.Time { return fixedTime })

	h := NewHMAC(key, secret, WithCustomNonceGenerator(gen))

	req := httptest.NewRequest("POST", "https://api.gemini.com/v1/order/new", nil)
	customParams := []byte(`{"symbol":"btcusd","amount":"1.5","price":"65000.00","side":"buy","type":"exchange limit"}`)

	err := h.Authenticate(context.Background(), req, customParams)
	if err != nil {
		t.Fatalf("Authenticate failed: %v", err)
	}

	if req.Header.Get("X-GEMINI-APIKEY") != "my-test-api-key" {
		t.Errorf("expected API key header, got %s", req.Header.Get("X-GEMINI-APIKEY"))
	}

	payloadB64 := req.Header.Get("X-GEMINI-PAYLOAD")
	if payloadB64 == "" {
		t.Fatal("expected X-GEMINI-PAYLOAD header")
	}

	decodedBytes, err := base64.StdEncoding.DecodeString(payloadB64)
	if err != nil {
		t.Fatalf("failed decoding payload base64: %v", err)
	}

	var parsed map[string]any
	if err := json.Unmarshal(decodedBytes, &parsed); err != nil {
		t.Fatalf("failed unmarshaling payload: %v", err)
	}

	if parsed["request"] != "/v1/order/new" {
		t.Errorf("expected request path /v1/order/new, got %v", parsed["request"])
	}
	if parsed["symbol"] != "btcusd" {
		t.Errorf("expected symbol btcusd, got %v", parsed["symbol"])
	}
	if parsed["nonce"] != strconv.FormatInt(fixedTime.UnixMilli(), 10) {
		t.Errorf("expected nonce %d, got %v", fixedTime.UnixMilli(), parsed["nonce"])
	}

	sig := req.Header.Get("X-GEMINI-SIGNATURE")
	if sig == "" {
		t.Fatal("expected X-GEMINI-SIGNATURE header")
	}
	if !VerifySignature(secret, payloadB64, sig) {
		t.Fatal("expected X-GEMINI-SIGNATURE to cryptographically match payload and secret")
	}
	if req.ContentLength != 0 {
		t.Errorf("expected ContentLength 0, got %d", req.ContentLength)
	}
	if req.Body != http.NoBody {
		t.Errorf("expected req.Body to be http.NoBody")
	}
}

func TestAuthenticationStrategiesClearReservedHeaders(t *testing.T) {
	req := httptest.NewRequest("POST", "https://api.gemini.com/v1/order/new", nil)
	req.Header = http.Header{
		"Authorization":      {"Bearer stale-token"},
		"X-GEMINI-APIKEY":    {"stale-key"},
		"X-GEMINI-NONCE":     {"stale-nonce"},
		"X-GEMINI-PAYLOAD":   {"stale-payload"},
		"X-GEMINI-SIGNATURE": {"stale-signature"},
	}

	hmacStrategy := NewHMAC(APIKey("hmac-key"), APISecret("hmac-secret"))
	if err := hmacStrategy.Authenticate(context.Background(), req, []byte(`{"symbol":"btcusd"}`)); err != nil {
		t.Fatalf("HMAC Authenticate failed: %v", err)
	}
	if got := req.Header.Get(authorizationHeader); got != "" {
		t.Fatalf("HMAC authentication retained Authorization header %q", got)
	}
	if got := req.Header.Get(geminiNonceHeader); got != "" {
		t.Fatalf("HMAC REST authentication retained nonce header %q", got)
	}

	bearerStrategy := NewBearer(BearerToken("bearer-token"))
	if err := bearerStrategy.Authenticate(context.Background(), req, []byte(`{"symbol":"btcusd"}`)); err != nil {
		t.Fatalf("Bearer Authenticate failed: %v", err)
	}
	if got := req.Header.Get(authorizationHeader); got != "Bearer bearer-token" {
		t.Fatalf("Bearer authentication header = %q", got)
	}
	for _, key := range []string{geminiAPIKeyHeader, geminiNonceHeader, geminiSignatureHeader} {
		if got := req.Header.Get(key); got != "" {
			t.Fatalf("Bearer authentication retained %s header %q", key, got)
		}
	}
}

func TestHMAC_ValidateRejectsMissingCredentials(t *testing.T) {
	for name, strategy := range map[string]*HMAC{
		"nil":              nil,
		"empty key":        NewHMAC("", "secret"),
		"key with space":   NewHMAC("key with space", "secret"),
		"key with newline": NewHMAC("key\nwith-newline", "secret"),
		"empty secret":     NewHMAC("key", ""),
		"zero value":       &HMAC{},
	} {
		t.Run(name, func(t *testing.T) {
			if err := strategy.Validate(); err != ErrInvalidHMACCredentials {
				t.Fatalf("Validate() error = %v, want ErrInvalidHMACCredentials", err)
			}
		})
	}
}

func TestHMAC_AuthenticateWebSocket(t *testing.T) {
	key := APIKey("my-ws-api-key")
	secret := APISecret("my-ws-secret-67890")
	h := NewHMAC(key, secret)

	req := httptest.NewRequest("GET", "wss://ws.gemini.com/v1/marketdata", nil)
	err := h.AuthenticateWebSocket(context.Background(), req)
	if err != nil {
		t.Fatalf("AuthenticateWebSocket failed: %v", err)
	}

	apiKey := req.Header.Get("X-GEMINI-APIKEY")
	if apiKey != "my-ws-api-key" {
		t.Fatalf("expected X-GEMINI-APIKEY my-ws-api-key, got %s", apiKey)
	}

	nonceStr := req.Header.Get("X-GEMINI-NONCE")
	if nonceStr == "" {
		t.Fatal("expected non-empty X-GEMINI-NONCE header")
	}
	nonceVal, err := strconv.ParseInt(nonceStr, 10, 64)
	if err != nil || nonceVal <= 0 {
		t.Fatalf("expected valid monotonic integer for X-GEMINI-NONCE, got %s", nonceStr)
	}
	if nonceVal < time.Now().Add(-time.Second).Unix() {
		t.Fatalf("expected epoch-second nonce near current time, got %d", nonceVal)
	}

	payloadB64 := req.Header.Get("X-GEMINI-PAYLOAD")
	if payloadB64 == "" {
		t.Fatal("expected non-empty X-GEMINI-PAYLOAD header")
	}
	decodedBytes, err := base64.StdEncoding.DecodeString(payloadB64)
	if err != nil {
		t.Fatalf("failed decoding X-GEMINI-PAYLOAD base64: %v", err)
	}
	if string(decodedBytes) != nonceStr {
		t.Fatalf("expected decoded X-GEMINI-PAYLOAD %s, got %s", nonceStr, string(decodedBytes))
	}

	sig := req.Header.Get("X-GEMINI-SIGNATURE")
	if sig == "" {
		t.Fatal("expected non-empty X-GEMINI-SIGNATURE header")
	}
	if !VerifySignature(secret, payloadB64, sig) {
		t.Fatal("expected X-GEMINI-SIGNATURE to cryptographically match X-GEMINI-PAYLOAD and secret")
	}
}

func TestHMAC_BuildPayloadPreservesJSONAndEscapesRequestPath(t *testing.T) {
	h := NewHMAC("key", "secret", WithCustomNonceGenerator(newMonotonicNonce(func() time.Time {
		return time.UnixMilli(123)
	})))

	built, err := h.BuildPayload(`/v1/quote/"slash\\value`, []byte(`{"amount":9007199254740993,"request":"spoofed","nonce":0}`))
	if err != nil {
		t.Fatalf("BuildPayload failed: %v", err)
	}

	var payload map[string]json.RawMessage
	if err := json.Unmarshal(built, &payload); err != nil {
		t.Fatalf("failed decoding payload: %v", err)
	}
	var request, nonce string
	if err := json.Unmarshal(payload["request"], &request); err != nil {
		t.Fatalf("request was not encoded as a string: %v", err)
	}
	if request != `/v1/quote/"slash\\value` {
		t.Fatalf("unexpected request path %q", request)
	}
	if err := json.Unmarshal(payload["nonce"], &nonce); err != nil {
		t.Fatalf("nonce was not encoded as a string: %v", err)
	}
	if nonce != "123" {
		t.Fatalf("expected nonce 123, got %q", nonce)
	}
	if got := string(payload["amount"]); got != "9007199254740993" {
		t.Fatalf("large JSON number was changed: got %s", got)
	}
}

func TestHMAC_KeyDoesNotExposeSecret(t *testing.T) {
	h := NewHMAC(APIKey("public-key"), APISecret("super-secret"))
	if got := h.Key(); got != APIKey("public-key").String() {
		t.Fatalf("expected masked key identifier, got %q", got)
	}
	if h.Key() == "public-key" {
		t.Fatal("HMAC Key exposed the full API key")
	}
	if strings.Contains(h.Key(), "super-secret") {
		t.Fatal("HMAC Key exposed the API secret")
	}
}

func TestVerifySignature(t *testing.T) {
	secret := APISecret("super-secret-key-98765")
	b64Payload := "eyJyZXF1ZXN0IjoiL3YxL29yZGVyL3N0YXR1cyIsIm5vbmNlIjoiMTIzNDU2Nzg5In0="

	h := NewHMAC("any-key", secret)
	validSig := h.Sign([]byte(b64Payload))

	if !VerifySignature(secret, b64Payload, validSig) {
		t.Fatal("expected valid signature to verify successfully")
	}

	// Test case insensitivity of hex string
	if !VerifySignature(secret, b64Payload, strings.ToUpper(validSig)) {
		t.Fatal("expected uppercase signature verification to succeed")
	}

	// Invalid signature
	if VerifySignature(secret, b64Payload, "deadbeef1234567890abcdef") {
		t.Fatal("expected invalid signature to fail verification")
	}

	// Wrong secret
	if VerifySignature(APISecret("wrong-secret"), b64Payload, validSig) {
		t.Fatal("expected wrong secret to fail verification")
	}

	// Tampered payload
	if VerifySignature(secret, "tampered-payload", validSig) {
		t.Fatal("expected tampered payload to fail verification")
	}

	if VerifySignature("", b64Payload, NewHMAC("any-key", "").Sign([]byte(b64Payload))) {
		t.Fatal("expected an empty HMAC secret to fail closed")
	}
	if VerifySignature(secret, b64Payload, strings.Repeat("g", 96)) {
		t.Fatal("expected malformed hexadecimal signature to fail verification")
	}
}

func TestHMAC_BuildPayload_NoDuplicateEnvelopeKeys(t *testing.T) {
	key := APIKey("test-key")
	secret := APISecret("test-secret")
	h := NewHMAC(key, secret)

	// Simulate generated OpenAPI struct payload with zero-valued envelope fields
	structJSON := []byte(`{"amount":"1.0","nonce":0,"price":"50000","request":"","side":"buy","symbol":"btcusd"}`)
	built, err := h.BuildPayload("/v1/order/new", structJSON)
	if err != nil {
		t.Fatalf("BuildPayload failed: %v", err)
	}

	// Verify only one occurrence of "request" and "nonce" in wire JSON
	s := string(built)
	if strings.Count(s, `"request"`) != 1 {
		t.Fatalf("expected exactly 1 'request' key in payload, got %d in: %s", strings.Count(s, `"request"`), s)
	}
	if strings.Count(s, `"nonce"`) != 1 {
		t.Fatalf("expected exactly 1 'nonce' key in payload, got %d in: %s", strings.Count(s, `"nonce"`), s)
	}

	var parsed map[string]any
	if err := json.Unmarshal(built, &parsed); err != nil {
		t.Fatalf("failed unmarshaling built payload: %v", err)
	}
	if parsed["request"] != "/v1/order/new" {
		t.Fatalf("expected request /v1/order/new, got %v", parsed["request"])
	}
	if parsed["amount"] != "1.0" {
		t.Fatalf("expected amount 1.0, got %v", parsed["amount"])
	}
}

func BenchmarkHMAC_Authenticate(b *testing.B) {
	key := APIKey("my-test-api-key")
	secret := APISecret("my-test-secret-12345")
	h := NewHMAC(key, secret)
	req := httptest.NewRequest("POST", "https://api.gemini.com/v1/order/new", nil)
	customParams := []byte(`{"symbol":"btcusd","amount":"1.5","price":"65000.00","side":"buy","type":"exchange limit"}`)
	ctx := context.Background()

	b.ResetTimer()
	b.ReportAllocs()

	for i := 0; i < b.N; i++ {
		_ = h.Authenticate(ctx, req, customParams)
	}
}

func BenchmarkMonotonicNonce_Next(b *testing.B) {
	gen := newMonotonicNonce(time.Now)
	b.ResetTimer()
	b.ReportAllocs()

	for i := 0; i < b.N; i++ {
		_ = gen.Next()
	}
}
