package conformance

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/gemini/developer-platform/packages/sdk-go/transport"
)

func TestErrorMapping(t *testing.T) {
	manifest := LoadManifest(t)
	var suite FixtureSuite
	for _, candidate := range manifest.Suites {
		if candidate.ID == "http/errors" {
			suite = candidate
			break
		}
	}
	if suite.ID == "" {
		t.Fatal("manifest does not contain http/errors suite")
	}
	for _, caseID := range suite.Cases {
		t.Run(caseID, func(t *testing.T) {
			var fixture FixtureError
			if err := json.Unmarshal(LoadCase(t, suite.ID, caseID), &fixture); err != nil {
				t.Fatalf("decoding fixture: %v", err)
			}
			if fixture.ID != suite.ID+"/"+caseID || fixture.Kind != suite.Kind {
				t.Fatalf("fixture identity = (%q, %q), want (%q, %q)", fixture.ID, fixture.Kind, suite.ID+"/"+caseID, suite.Kind)
			}
			testErrorCase(t, fixture)
		})
	}
}

func testErrorCase(t *testing.T, fixture FixtureError) {
	t.Helper()
	server := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, req *http.Request) {
		if req.Method != http.MethodGet {
			t.Errorf("handler method = %s, want GET", req.Method)
		}
		for name, value := range fixture.Response.Headers {
			w.Header().Set(name, value)
		}
		w.WriteHeader(fixture.Response.Status)
		if fixture.Response.Body != "" {
			_, _ = io.WriteString(w, fixture.Response.Body)
		}
	}))
	defer server.Close()

	client := transport.NewClient(
		transport.WithHTTPClient(server.Client()),
		transport.WithRetryPolicy(transport.RetryPolicy{MaxRetries: 0}),
	)
	_, _, err := client.RequestRaw(context.Background(), http.MethodGet, server.URL+"/v1/conformance", nil)
	if err == nil {
		t.Fatal("expected fixture response to return an error")
	}
	wantSentinel := errorForCanonicalKind(fixture.Expect.Kind)
	if wantSentinel == nil {
		t.Fatalf("unsupported canonical error kind %q", fixture.Expect.Kind)
	}
	if !errors.Is(err, wantSentinel) {
		t.Errorf("error %v does not match %v for canonical kind %q", err, wantSentinel, fixture.Expect.Kind)
	}

	var apiErr *transport.APIError
	if !errors.As(err, &apiErr) {
		t.Fatalf("error %T does not expose *transport.APIError", err)
	}
	if apiErr.StatusCode != fixture.Response.Status {
		t.Errorf("error status = %d, want %d", apiErr.StatusCode, fixture.Response.Status)
	}
	if string(apiErr.RawBody) != fixture.Response.Body {
		t.Errorf("error raw body = %q, want exact %q", apiErr.RawBody, fixture.Response.Body)
	}
	if fixture.Expect.Reason != "" {
		reason := apiErr.Reason
		if reason == "" {
			reason = apiErr.ErrorMessage
		}
		if reason != fixture.Expect.Reason {
			t.Errorf("error reason = %q, want %q", reason, fixture.Expect.Reason)
		}
	}
	if fixture.Expect.RetryAfterSeconds != nil {
		var rateErr *transport.RateLimitError
		if !errors.As(err, &rateErr) {
			t.Fatalf("error %T does not expose *transport.RateLimitError", err)
		}
		want := time.Duration(*fixture.Expect.RetryAfterSeconds) * time.Second
		if rateErr.RetryAfter != want {
			t.Errorf("retry-after = %v, want %v", rateErr.RetryAfter, want)
		}
	}
	if fixture.Response.Body == "" && len(apiErr.RawBody) != 0 {
		t.Errorf("empty response body produced raw bytes %q", apiErr.RawBody)
	}
}

func errorForCanonicalKind(kind string) error {
	switch kind {
	case "invalid_nonce":
		return transport.ErrInvalidNonce
	case "missing_nonce":
		return transport.ErrMissingNonce
	case "invalid_signature":
		return transport.ErrInvalidSignature
	case "missing_role":
		return transport.ErrMissingRole
	case "terms_required":
		return transport.ErrAcceptTermsRequired
	case "insufficient_funds":
		return transport.ErrInsufficientFunds
	case "rate_limited":
		return transport.ErrRateLimited
	case "order_not_found":
		return transport.ErrOrderNotFound
	case "market_closed":
		return transport.ErrMarketClosed
	case "not_found":
		return transport.ErrNotFound
	case "service_error":
		return transport.ErrInternalServer
	case "invalid_request":
		return transport.ErrBadRequest
	default:
		return nil
	}
}
