package conformance

import (
	"encoding/json"
	"io/fs"
	"os"
	"path/filepath"
	"sort"
	"testing"
)

func TestManifest(t *testing.T) {
	manifest := LoadManifest(t)
	if manifest.Version != 1 {
		t.Fatalf("manifest version = %d, want 1", manifest.Version)
	}

	expectedSuites := []FixtureSuite{
		{ID: "http/hmac-requests", Kind: "hmacRequest", Cases: []string{"private-post-with-body", "private-post-empty-body", "private-post-wide-integer", "websocket-upgrade-nonce"}},
		{ID: "http/unsigned-requests", Kind: "unsignedRequest", Cases: []string{"market-data-ticker", "market-data-order-book-limits", "prediction-markets-list-events-filters"}},
		{ID: "http/errors", Kind: "errorMapping", Cases: []string{"invalid-nonce-400", "missing-role-403-result-envelope", "missing-role-403-error-envelope", "terms-required-400-must-accept", "terms-required-400-accept-terms-required", "insufficient-funds-406", "rate-limited-429-retry-after", "order-not-found-404", "market-closed-400", "server-error-500-unstructured", "not-found-404-empty-body"}},
		{ID: "json", Kind: "jsonDecoding", Cases: []string{"wide-integer-unsafe", "wide-integer-safe", "decimal-string-exact", "decimal-number-exact"}},
		{ID: "websocket/subscriptions", Kind: "wsSubscription", Cases: []string{"public-trades", "public-trades-untrimmed-symbol", "public-book-ticker", "public-depth-diff", "public-depth-diff-interval", "public-partial-depth-20", "public-contract-status", "private-orders-session", "private-balances-interval"}},
		{ID: "websocket/events", Kind: "wsEvent", Cases: []string{"trade", "depth-unsafe-last-update-id", "order-update", "balance-update"}},
	}
	if len(manifest.Suites) != len(expectedSuites) {
		t.Fatalf("manifest suite count = %d, want %d", len(manifest.Suites), len(expectedSuites))
	}
	for i, want := range expectedSuites {
		got := manifest.Suites[i]
		if got.ID != want.ID || got.Kind != want.Kind {
			t.Errorf("suite %d = (%q, %q), want (%q, %q)", i, got.ID, got.Kind, want.ID, want.Kind)
		}
		if !equalStrings(got.Cases, want.Cases) {
			t.Errorf("suite %s cases = %v, want %v", got.ID, got.Cases, want.Cases)
		}
	}

	wantExceptions := []string{
		"rest-nonce-json-type",
		"rest-payload-key-order",
		"ws-subscription-id-scope",
		"ws-inbound-symbol-case",
		"int64-static-typing",
		"http-406-insufficient-funds",
		"rest-query-signing",
		"candle-timeframe-spelling",
	}
	if !equalStringSet(manifest.Exceptions, wantExceptions) {
		t.Fatalf("manifest exception ids = %v, want exact set %v", manifest.Exceptions, wantExceptions)
	}

	root := ConformanceRoot(t)
	conformanceDir := filepath.Join(root, "conformance")
	listed := make(map[string]struct{})
	referencedExceptions := make(map[string]struct{})
	for _, suite := range manifest.Suites {
		for _, caseID := range suite.Cases {
			rel := filepath.ToSlash(filepath.Join(suite.ID, caseID+".json"))
			if _, ok := listed[rel]; ok {
				t.Fatalf("manifest lists duplicate case %s", rel)
			}
			listed[rel] = struct{}{}
			path := filepath.Join(conformanceDir, filepath.FromSlash(rel))
			if _, err := os.Stat(path); err != nil {
				t.Errorf("manifest case %s is missing: %v", rel, err)
				continue
			}
			var envelope struct {
				Exceptions []string `json:"exceptions"`
			}
			data, err := os.ReadFile(path)
			if err != nil {
				t.Errorf("reading listed case %s: %v", rel, err)
				continue
			}
			if err := json.Unmarshal(data, &envelope); err != nil {
				t.Errorf("decoding listed case %s: %v", rel, err)
				continue
			}
			for _, id := range envelope.Exceptions {
				referencedExceptions[id] = struct{}{}
			}
		}
	}

	diskCases := make(map[string]struct{})
	if err := filepath.WalkDir(conformanceDir, func(path string, entry fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if entry.IsDir() {
			return nil
		}
		rel, err := filepath.Rel(conformanceDir, path)
		if err != nil {
			return err
		}
		if filepath.ToSlash(rel) == "manifest.json" || filepath.Ext(path) != ".json" {
			return nil
		}
		diskCases[filepath.ToSlash(rel)] = struct{}{}
		return nil
	}); err != nil {
		t.Fatalf("walking conformance fixtures: %v", err)
	}
	for rel := range listed {
		if _, ok := diskCases[rel]; !ok {
			t.Errorf("manifest-listed case %s is not present on disk", rel)
		}
	}
	for rel := range diskCases {
		if _, ok := listed[rel]; !ok {
			t.Errorf("orphaned fixture file %s is not listed in manifest", rel)
		}
	}
	declaredExceptions := make(map[string]struct{}, len(manifest.Exceptions))
	for _, id := range manifest.Exceptions {
		declaredExceptions[id] = struct{}{}
	}
	for id := range referencedExceptions {
		if _, ok := declaredExceptions[id]; !ok {
			t.Errorf("case references undeclared exception %q", id)
		}
	}
}

func equalStrings(a, b []string) bool {
	if len(a) != len(b) {
		return false
	}
	for i := range a {
		if a[i] != b[i] {
			return false
		}
	}
	return true
}

func equalStringSet(a, b []string) bool {
	if len(a) != len(b) {
		return false
	}
	left := append([]string(nil), a...)
	right := append([]string(nil), b...)
	sort.Strings(left)
	sort.Strings(right)
	for i := range left {
		if left[i] != right[i] || left[i] == "" {
			return false
		}
	}
	return true
}
