package main

import "testing"

func TestDemoOAuthScopesRequestWriteAccessOnlyForRFQSubmission(t *testing.T) {
	readOnly := demoOAuthScopes(false)
	if containsScope(readOnly, "orders:create") {
		t.Fatalf("read-only demo scopes unexpectedly include orders:create: %v", readOnly)
	}

	withRFQ := demoOAuthScopes(true)
	if !containsScope(withRFQ, "orders:create") {
		t.Fatalf("RFQ demo scopes omit orders:create: %v", withRFQ)
	}
}

func containsScope(scopes []string, want string) bool {
	for _, scope := range scopes {
		if scope == want {
			return true
		}
	}
	return false
}
