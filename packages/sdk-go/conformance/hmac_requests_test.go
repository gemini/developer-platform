package conformance

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"io"
	"net/http"
	"net/url"
	"regexp"
	"strings"
	"testing"

	"github.com/gemini/developer-platform/packages/sdk-go/auth"
	"github.com/gemini/developer-platform/packages/sdk-go/transport"
)

type fixedNonce struct {
	value string
}

func (n fixedNonce) Next() string { return n.value }

type fixtureRoundTripFunc func(*http.Request) (*http.Response, error)

func (f fixtureRoundTripFunc) RoundTrip(req *http.Request) (*http.Response, error) {
	return f(req)
}

func TestHMACRequests(t *testing.T) {
	manifest := LoadManifest(t)
	var suite FixtureSuite
	for _, candidate := range manifest.Suites {
		if candidate.ID == "http/hmac-requests" {
			suite = candidate
			break
		}
	}
	if suite.ID == "" {
		t.Fatal("manifest does not contain http/hmac-requests suite")
	}
	for _, caseID := range suite.Cases {
		t.Run(caseID, func(t *testing.T) {
			var fixture FixtureHMAC
			if err := json.Unmarshal(LoadCase(t, suite.ID, caseID), &fixture); err != nil {
				t.Fatalf("decoding fixture: %v", err)
			}
			if fixture.ID != suite.ID+"/"+caseID || fixture.Kind != suite.Kind {
				t.Fatalf("fixture identity = (%q, %q), want (%q, %q)", fixture.ID, fixture.Kind, suite.ID+"/"+caseID, suite.Kind)
			}
			switch fixture.Nonce.Mode {
			case "monotonic":
				testHMACREST(t, fixture)
			case "websocket":
				testHMACWebSocket(t, fixture)
			default:
				t.Fatalf("unsupported nonce mode %q", fixture.Nonce.Mode)
			}
		})
	}
}

func testHMACREST(t *testing.T, fixture FixtureHMAC) {
	t.Helper()
	if fixture.Nonce.Value == "" {
		t.Fatal("monotonic fixture nonce is empty")
	}
	if fixture.Request.Method == "" || fixture.Request.Path == "" {
		t.Fatal("fixture request method/path must be non-empty")
	}
	if len(fixture.Request.Body) == 0 {
		fixture.Request.Body = json.RawMessage("null")
	}
	requestURL := "https://api.sandbox.gemini.com" + fixture.Request.Path
	parsed, err := url.Parse(requestURL)
	if err != nil {
		t.Fatalf("parsing fixture request path: %v", err)
	}
	var observed *http.Request
	rt := fixtureRoundTripFunc(func(req *http.Request) (*http.Response, error) {
		observed = req.Clone(req.Context())
		return &http.Response{
			StatusCode: http.StatusOK,
			Header:     make(http.Header),
			Body:       io.NopCloser(strings.NewReader(`{}`)),
			Request:    req,
		}, nil
	})
	strategy := auth.NewHMAC(
		auth.APIKey(fixture.Credentials.APIKey),
		auth.APISecret(fixture.Credentials.APISecret),
		auth.WithCustomNonceGenerator(fixedNonce{value: fixture.Nonce.Value}),
	)
	client := transport.NewClient(
		transport.WithHTTPClient(&http.Client{Transport: rt}),
		transport.WithAuth(strategy),
		transport.WithRetryPolicy(transport.RetryPolicy{MaxRetries: 0}),
	)
	req, err := http.NewRequestWithContext(context.Background(), fixture.Request.Method, parsed.String(), nil)
	if err != nil {
		t.Fatalf("creating fixture request: %v", err)
	}
	if _, _, err := client.Execute(context.Background(), req, fixture.Request.Body); err != nil {
		t.Fatalf("transport Execute failed: %v", err)
	}
	if observed == nil {
		t.Fatal("fixture request did not reach HTTP handler")
	}
	if observed.Method != fixture.Request.Method {
		t.Errorf("method = %q, want %q", observed.Method, fixture.Request.Method)
	}
	if observed.URL.Path != parsed.Path || observed.URL.RawQuery != parsed.RawQuery {
		t.Errorf("URL path/query = %q?%q, want %q?%q", observed.URL.Path, observed.URL.RawQuery, parsed.Path, parsed.RawQuery)
	}
	if observed.Body != http.NoBody || observed.ContentLength != 0 {
		t.Errorf("authenticated request wire body = %v, content length %d; want empty", observed.Body, observed.ContentLength)
	}
	assertHMACHeaders(t, observed.Header, fixture)
	payloadB64 := observed.Header.Get("X-GEMINI-PAYLOAD")
	decoded, err := base64.StdEncoding.DecodeString(payloadB64)
	if err != nil {
		t.Fatalf("decoding payload header: %v", err)
	}
	assertRESTPayload(t, decoded, fixture.Expect.Payload)
	if fixture.Expect.Signature.Algorithm != "HMAC-SHA384" || fixture.Expect.Signature.Over != "payloadBase64" || fixture.Expect.Signature.Encoding != "hex-lower" {
		t.Fatalf("unsupported signature expectation: %+v", fixture.Expect.Signature)
	}
	if !auth.VerifySignature(auth.APISecret(fixture.Credentials.APISecret), payloadB64, observed.Header.Get("X-GEMINI-SIGNATURE")) {
		t.Fatal("signature does not verify against the exact base64 payload")
	}
}

func testHMACWebSocket(t *testing.T, fixture FixtureHMAC) {
	t.Helper()
	if fixture.Request.Method != "" || fixture.Request.Path != "" || len(fixture.Request.Body) != 0 {
		t.Fatalf("websocket fixture unexpectedly contains REST request: %+v", fixture.Request)
	}
	strategy := auth.NewTimeBasedHMAC(
		auth.APIKey(fixture.Credentials.APIKey),
		auth.APISecret(fixture.Credentials.APISecret),
		auth.WithCustomNonceGenerator(fixedNonce{value: fixture.Nonce.Value}),
	)
	req, err := http.NewRequest(http.MethodGet, "wss://ws.sandbox.gemini.com/v1/marketdata", nil)
	if err != nil {
		t.Fatalf("creating websocket handshake request: %v", err)
	}
	if err := strategy.AuthenticateWebSocket(context.Background(), req); err != nil {
		t.Fatalf("authenticating websocket handshake: %v", err)
	}
	for _, name := range fixture.Expect.Headers {
		if value := req.Header.Get(name); strings.TrimSpace(value) == "" {
			t.Errorf("expected non-empty %s header", name)
		}
	}
	if got := req.Header.Get("X-GEMINI-APIKEY"); got != fixture.Expect.APIKeyHeader {
		t.Errorf("API key header = %q, want %q", got, fixture.Expect.APIKeyHeader)
	}
	nonce := req.Header.Get("X-GEMINI-NONCE")
	if !regexp.MustCompile(`^[0-9]{10}$`).MatchString(nonce) {
		t.Fatalf("websocket nonce = %q, want epoch-second shape", nonce)
	}
	payloadB64 := req.Header.Get("X-GEMINI-PAYLOAD")
	decoded, err := base64.StdEncoding.DecodeString(payloadB64)
	if err != nil {
		t.Fatalf("decoding websocket payload header: %v", err)
	}
	if string(decoded) != nonce {
		t.Errorf("decoded websocket payload = %q, want nonce %q", decoded, nonce)
	}
	if !auth.VerifySignature(auth.APISecret(fixture.Credentials.APISecret), payloadB64, req.Header.Get("X-GEMINI-SIGNATURE")) {
		t.Fatal("websocket signature does not verify")
	}
}

func assertHMACHeaders(t *testing.T, headers http.Header, fixture FixtureHMAC) {
	t.Helper()
	for _, name := range fixture.Expect.Headers {
		if strings.TrimSpace(headers.Get(name)) == "" {
			t.Errorf("expected non-empty %s header", name)
		}
	}
	if got := headers.Get("X-GEMINI-APIKEY"); got != fixture.Expect.APIKeyHeader {
		t.Errorf("API key header = %q, want %q", got, fixture.Expect.APIKeyHeader)
	}
}

func assertRESTPayload(t *testing.T, decoded []byte, expected FixtureHMACPayload) {
	t.Helper()
	var payload map[string]json.RawMessage
	if err := json.Unmarshal(decoded, &payload); err != nil {
		t.Fatalf("decoding signed payload JSON %q: %v", decoded, err)
	}
	if len(payload) != len(expected.Fields)+2 {
		t.Fatalf("payload keys = %v, want request, nonce, and fields %v", mapKeys(payload), mapKeys(expected.Fields))
	}
	var request string
	if err := json.Unmarshal(payload["request"], &request); err != nil {
		t.Fatalf("payload request is not a JSON string: %v", err)
	}
	if request != expected.Request {
		t.Errorf("payload request = %q, want %q", request, expected.Request)
	}
	if got := decimalJSONText(payload["nonce"]); got != expected.Nonce {
		t.Errorf("payload nonce text = %q, want %q", got, expected.Nonce)
	}
	for name, want := range expected.Fields {
		got, ok := payload[name]
		if !ok {
			t.Errorf("payload is missing field %q", name)
			continue
		}
		if !jsonRawEqual(got, want) {
			t.Errorf("payload field %s = %s, want %s", name, got, want)
		}
	}
	for name := range payload {
		if name != "request" && name != "nonce" {
			if _, ok := expected.Fields[name]; !ok {
				t.Errorf("payload contains undeclared field %q", name)
			}
		}
	}
}

func decimalJSONText(raw json.RawMessage) string {
	text := strings.TrimSpace(string(raw))
	if len(text) >= 2 && text[0] == '"' && text[len(text)-1] == '"' {
		var value string
		if json.Unmarshal(raw, &value) == nil {
			return value
		}
	}
	return text
}

func jsonRawEqual(a, b json.RawMessage) bool {
	return strings.TrimSpace(string(a)) == strings.TrimSpace(string(b))
}

func mapKeys[T any](values map[string]T) []string {
	keys := make([]string, 0, len(values))
	for key := range values {
		keys = append(keys, key)
	}
	return keys
}
