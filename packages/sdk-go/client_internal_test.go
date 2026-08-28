package gemini

import "testing"

func TestWithOptionsDoesNotShareSDKOwnedHTTPClient(t *testing.T) {
	base := NewClient()
	clone := base.WithOptions(WithCustomRESTURL("https://custom.gemini.local"))
	defer base.Close()
	defer clone.Close()

	if base.config.httpClient == clone.config.httpClient {
		t.Fatal("WithOptions shared an SDK-owned HTTP client")
	}
	if !base.config.ownsHTTPClient || !clone.config.ownsHTTPClient {
		t.Fatal("expected both clients to own their independent default HTTP clients")
	}
}
