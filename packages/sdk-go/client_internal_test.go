package gemini

import (
	"testing"

	"github.com/gemini/developer-platform/packages/sdk-go/auth"
)

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

func TestWithOptionsRecoversFromCorrectedConfiguration(t *testing.T) {
	tests := map[string]struct {
		base *Client
		opts []Option
	}{
		"REST endpoint": {
			base: NewClient(WithCustomRESTURL("://invalid")),
			opts: []Option{WithCustomRESTURL("https://api.gemini.com")},
		},
		"authentication": {
			base: NewClient(WithAuth(auth.NewHMAC("", "secret"))),
			opts: []Option{WithAuth(auth.NewHMAC("key", "secret"))},
		},
	}

	for name, test := range tests {
		t.Run(name, func(t *testing.T) {
			defer test.base.Close()
			if test.base.config.configErr == nil {
				t.Fatal("expected base client configuration error")
			}

			clone := test.base.WithOptions(test.opts...)
			defer clone.Close()
			if err := clone.config.configErr; err != nil {
				t.Fatalf("corrected client retained configuration error: %v", err)
			}
		})
	}
}
