package conformance

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"reflect"
	"testing"

	"github.com/gemini/developer-platform/packages/sdk-go"
	"github.com/gemini/developer-platform/packages/sdk-go/generated/predictions"
)

func TestUnsignedRequests(t *testing.T) {
	manifest := LoadManifest(t)
	var suite FixtureSuite
	for _, candidate := range manifest.Suites {
		if candidate.ID == "http/unsigned-requests" {
			suite = candidate
			break
		}
	}
	if suite.ID == "" {
		t.Fatal("manifest does not contain http/unsigned-requests suite")
	}
	for _, caseID := range suite.Cases {
		t.Run(caseID, func(t *testing.T) {
			var fixture FixtureUnsigned
			if err := json.Unmarshal(LoadCase(t, suite.ID, caseID), &fixture); err != nil {
				t.Fatalf("decoding fixture: %v", err)
			}
			if fixture.ID != suite.ID+"/"+caseID || fixture.Kind != suite.Kind {
				t.Fatalf("fixture identity = (%q, %q), want (%q, %q)", fixture.ID, fixture.Kind, suite.ID+"/"+caseID, suite.Kind)
			}
			testUnsignedRequest(t, fixture)
		})
	}
}

func testUnsignedRequest(t *testing.T, fixture FixtureUnsigned) {
	t.Helper()
	var observed *http.Request
	server := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, req *http.Request) {
		observed = req.Clone(req.Context())
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{}`))
	}))
	defer server.Close()

	client := gemini.NewClient(
		gemini.WithEnvironment(gemini.Sandbox),
		gemini.WithCustomRESTURL(server.URL),
		gemini.WithHTTPClient(server.Client()),
	)
	defer client.Close()

	ctx := context.Background()
	switch fixture.Operation {
	case "marketData.getTicker":
		symbol := requiredStringInput(t, fixture.Input, "symbol")
		if _, err := client.MarketData.GetTicker(ctx, symbol); err != nil {
			t.Fatalf("MarketData.GetTicker failed: %v", err)
		}
	case "marketData.getCurrentOrderBook":
		symbol := requiredStringInput(t, fixture.Input, "symbol")
		limitBids := requiredIntInput(t, fixture.Input, "limit_bids")
		limitAsks := requiredIntInput(t, fixture.Input, "limit_asks")
		if _, err := client.MarketData.GetOrderBook(ctx, symbol, limitBids, limitAsks); err != nil {
			t.Fatalf("MarketData.GetOrderBook failed: %v", err)
		}
	case "predictions.listEvents":
		var statusValues []string
		raw, ok := fixture.Input["status"]
		if !ok {
			t.Fatal("prediction fixture input is missing status")
		}
		if err := json.Unmarshal(raw, &statusValues); err != nil {
			t.Fatalf("decoding status input: %v", err)
		}
		statuses := make([]predictions.MarketStatus, len(statusValues))
		for i, value := range statusValues {
			statuses[i] = predictions.MarketStatus(value)
		}
		params := &predictions.ListEventsParams{Status: &statuses}
		if _, err := client.Predictions.GetEvents(ctx, params); err != nil {
			t.Fatalf("Predictions.GetEvents failed: %v", err)
		}
	default:
		t.Fatalf("unsupported unsigned operation %q", fixture.Operation)
	}
	if observed == nil {
		t.Fatal("service request did not reach httptest handler")
	}
	if observed.Method != fixture.Expect.Method {
		t.Errorf("method = %q, want %q", observed.Method, fixture.Expect.Method)
	}
	if observed.URL.Path != fixture.Expect.Path {
		t.Errorf("path = %q, want %q", observed.URL.Path, fixture.Expect.Path)
	}
	if got, want := observed.URL.Query(), fixture.Expect.Query; !reflect.DeepEqual(map[string][]string(got), want) {
		t.Errorf("query = %v, want %v", got, want)
	}
	for _, name := range fixture.Expect.AuthHeaders {
		if observed.Header.Get(name) == "" {
			t.Errorf("expected non-empty authentication header %q", name)
		}
	}
	for _, name := range []string{"Authorization", "X-GEMINI-APIKEY", "X-GEMINI-NONCE", "X-GEMINI-PAYLOAD", "X-GEMINI-SIGNATURE"} {
		if !contains(fixture.Expect.AuthHeaders, name) && observed.Header.Get(name) != "" {
			t.Errorf("unsigned request unexpectedly included %s=%q", name, observed.Header.Get(name))
		}
	}
}

func requiredStringInput(t *testing.T, input map[string]json.RawMessage, name string) string {
	t.Helper()
	raw, ok := input[name]
	if !ok {
		t.Fatalf("input is missing %s", name)
	}
	var value string
	if err := json.Unmarshal(raw, &value); err != nil || value == "" {
		t.Fatalf("input %s is not a non-empty string: %s", name, raw)
	}
	return value
}

func requiredIntInput(t *testing.T, input map[string]json.RawMessage, name string) int {
	t.Helper()
	raw, ok := input[name]
	if !ok {
		t.Fatalf("input is missing %s", name)
	}
	var value int
	if err := json.Unmarshal(raw, &value); err != nil {
		t.Fatalf("input %s is not an integer: %s (%v)", name, raw, err)
	}
	return value
}

func contains(values []string, target string) bool {
	for _, value := range values {
		if value == target {
			return true
		}
	}
	return false
}
