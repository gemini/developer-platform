package transport_test

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gemini/gemini-go/transport"
)

func TestTransport_PaginatorEdgeCases(t *testing.T) {
	tests := []struct {
		name string
		seq  func(yield func(int, error) bool)
	}{
		{
			name: "nil fetcher",
			seq: func() func(func(int, error) bool) {
				var nilContext context.Context
				return transport.NewPaginator[int](nilContext, 0, 0, nil)
			}(),
		},
		{
			name: "negative offset",
			seq: transport.NewPaginator(context.Background(), -1, 10, func(context.Context, int, int) ([]int, bool, error) {
				t.Fatal("negative offset should not call fetcher")
				return nil, false, nil
			}),
		},
		{
			name: "canceled context",
			seq: func() func(func(int, error) bool) {
				ctx, cancel := context.WithCancel(context.Background())
				cancel()
				return transport.NewPaginator(ctx, 0, 10, func(context.Context, int, int) ([]int, bool, error) {
					t.Fatal("canceled context should not call fetcher")
					return nil, false, nil
				})
			}(),
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			var gotErr error
			for _, err := range tt.seq {
				if err != nil {
					gotErr = err
					break
				}
			}
			if gotErr == nil {
				t.Fatal("expected paginator to yield an error")
			}
		})
	}

	var calls []struct{ offset, limit int }
	paginator := transport.NewPaginator(context.Background(), 4, 0, func(_ context.Context, offset, limit int) ([]int, bool, error) {
		calls = append(calls, struct{ offset, limit int }{offset, limit})
		if len(calls) == 1 {
			return []int{10, 11}, true, nil
		}
		return []int{12}, false, nil
	})
	var got []int
	for item, err := range paginator {
		if err != nil {
			t.Fatalf("unexpected pagination error: %v", err)
		}
		got = append(got, item)
	}
	if fmt.Sprint(got) != "[10 11 12]" {
		t.Fatalf("unexpected paginated items: %v", got)
	}
	if len(calls) != 2 || calls[0].offset != 4 || calls[0].limit != 50 || calls[1].offset != 6 {
		t.Fatalf("unexpected pagination calls: %+v", calls)
	}

	fetchErr := errors.New("fetch failed")
	for _, err := range transport.NewPaginator(context.Background(), 0, 1, func(context.Context, int, int) ([]string, bool, error) {
		return nil, false, fetchErr
	}) {
		if !errors.Is(err, fetchErr) {
			t.Fatalf("expected fetch error, got %v", err)
		}
	}

	called := 0
	for item, err := range transport.NewPaginator(context.Background(), 0, 1, func(context.Context, int, int) ([]int, bool, error) {
		called++
		return []int{1, 2}, true, nil
	}) {
		if err != nil {
			t.Fatalf("unexpected early-stop error: %v", err)
		}
		if item != 1 {
			t.Fatalf("unexpected first item: %d", item)
		}
		break
	}
	if called != 1 {
		t.Fatalf("expected early stop after one fetch, got %d calls", called)
	}
}

func TestTransport_ErrorHelperEdges(t *testing.T) {
	resync := &transport.ResyncRequiredError{LastUpdateID: 10, FirstUpdateID: 12}
	if !errors.Is(resync, transport.ErrResyncRequired) {
		t.Fatal("expected ResyncRequiredError to unwrap to ErrResyncRequired")
	}
	if got := resync.Error(); got == "" {
		t.Fatal("expected ResyncRequiredError to have a useful message")
	}

	for _, reason := range []string{"InvalidNonce", "MustAcceptTerms", "RateLimit"} {
		if !(&transport.APIError{Reason: reason}).IsDomain() {
			t.Errorf("expected %q to be a domain reason", reason)
		}
	}
	if (&transport.APIError{Reason: "InvalidPayload"}).IsDomain() {
		t.Fatal("unexpected domain classification for InvalidPayload")
	}

	rateErr := &transport.RateLimitError{APIError: transport.APIError{RequestID: "rate-limit-id"}}
	if got := transport.RequestIDFromError(rateErr); got != "rate-limit-id" {
		t.Fatalf("expected rate-limit request ID, got %q", got)
	}
	if got := transport.RequestIDFromError(nil); got != "" {
		t.Fatalf("expected empty request ID for nil error, got %q", got)
	}
	if got := transport.RequestIDFromError(errors.New("unrelated")); got != "" {
		t.Fatalf("expected empty request ID for unrelated error, got %q", got)
	}
}

func TestTransport_CustomUserAgentAndCloseIdleConnections(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if got := r.UserAgent(); got != "coverage-test-agent" {
			t.Errorf("expected custom user agent, got %q", got)
		}
		w.WriteHeader(http.StatusNoContent)
	}))
	t.Cleanup(server.Close)

	client := transport.NewClient(
		transport.WithHTTPClient(server.Client()),
		transport.WithUserAgent("coverage-test-agent"),
		transport.WithLogger(nil),
	)
	if err := client.Request(context.Background(), http.MethodGet, server.URL, nil, nil); err != nil {
		t.Fatalf("request failed: %v", err)
	}
	client.CloseIdleConnections()
	var nilClient *transport.Client
	nilClient.CloseIdleConnections()
}
