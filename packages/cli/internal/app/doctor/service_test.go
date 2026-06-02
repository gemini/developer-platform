package doctor

import (
	"context"
	"errors"
	"testing"

	"github.com/gemini/developer-platform/packages/cli/internal/api"
	"github.com/gemini/developer-platform/packages/cli/internal/config"
)

type stubAPIClient struct {
	marketsResp *api.MarketsResponse
	marketsErr  error
	balances    []api.Balance
	balancesErr error
}

func (s *stubAPIClient) ListMarkets(context.Context, *api.ListMarketsParams) (*api.MarketsResponse, error) {
	return s.marketsResp, s.marketsErr
}

func (s *stubAPIClient) GetBalances(context.Context) ([]api.Balance, error) {
	return s.balances, s.balancesErr
}

type stubWSProber struct {
	err error
}

func (s *stubWSProber) Probe(context.Context, string, *config.Config) error {
	return s.err
}

func TestRunHealthyReport(t *testing.T) {
	svc := NewService(&stubAPIClient{
		marketsResp: &api.MarketsResponse{Data: []api.Market{{Ticker: "BTC"}}},
		balances:    []api.Balance{{Currency: "USD"}},
	}, &stubWSProber{})

	report := svc.Run(context.Background(), &config.Config{
		APIKey:      "account-1234567890",
		APISecret:   "secret-1234567890",
		Environment: "sandbox",
	}, "environment variables", Options{})

	if report.Status != StatusOK {
		t.Fatalf("Status = %s, want %s", report.Status, StatusOK)
	}
	if !report.ReadyForTrading {
		t.Fatal("ReadyForTrading = false, want true")
	}
	if report.ReadyReason != "All required trading checks passed." {
		t.Fatalf("ReadyReason = %q, want success message", report.ReadyReason)
	}
	if len(report.BlockingChecks) != 0 {
		t.Fatalf("BlockingChecks = %#v, want empty", report.BlockingChecks)
	}
	if report.Summary.Fail != 0 || report.Summary.Warn != 0 {
		t.Fatalf("summary = %#v, want no warnings/failures", report.Summary)
	}
}

func TestRunTreatsOAuthAsPrivateWebSocketAuth(t *testing.T) {
	svc := NewService(&stubAPIClient{
		marketsResp: &api.MarketsResponse{Data: []api.Market{{Ticker: "BTC"}}},
		balances:    []api.Balance{{Currency: "USD"}},
	}, &stubWSProber{})

	report := svc.Run(context.Background(), &config.Config{
		AccessToken: "oauth-token",
		AuthType:    config.AuthTypeOAuth,
		Environment: "sandbox",
	}, "OAuth login", Options{})

	if report.Status != StatusOK {
		t.Fatalf("Status = %s, want %s", report.Status, StatusOK)
	}

	var websocket Check
	for _, check := range report.Checks {
		if check.Name == "websocket" {
			websocket = check
			break
		}
	}
	if websocket.Details == nil {
		t.Fatal("websocket.Details = nil, want private auth details")
	}
	if websocket.Details["privateAccountStreams"] != true {
		t.Fatalf("privateAccountStreams = %v, want true", websocket.Details["privateAccountStreams"])
	}
	if websocket.Details["privateWebSocketAuth"] != config.AuthTypeOAuth {
		t.Fatalf("privateWebSocketAuth = %v, want %s", websocket.Details["privateWebSocketAuth"], config.AuthTypeOAuth)
	}
}

func TestRunWarnsWhenWebSocketDisabledAndAuthMissing(t *testing.T) {
	svc := NewService(&stubAPIClient{
		marketsResp: &api.MarketsResponse{Data: []api.Market{{Ticker: "BTC"}}},
	}, &stubWSProber{})

	report := svc.Run(context.Background(), &config.Config{
		Environment: "production",
	}, "not configured", Options{WebSocketDisabled: true})

	if report.Status != StatusWarn {
		t.Fatalf("Status = %s, want %s", report.Status, StatusWarn)
	}
	if report.ReadyForTrading {
		t.Fatal("ReadyForTrading = true, want false when auth is missing")
	}
	if len(report.BlockingChecks) != 1 || report.BlockingChecks[0] != "auth" {
		t.Fatalf("BlockingChecks = %#v, want [auth]", report.BlockingChecks)
	}
	if report.Summary.Warn < 2 {
		t.Fatalf("summary = %#v, want warnings", report.Summary)
	}
}

func TestRunFailsWhenPublicChecksFail(t *testing.T) {
	svc := NewService(&stubAPIClient{
		marketsErr:  errors.New("rest down"),
		balancesErr: errors.New("auth down"),
	}, &stubWSProber{err: errors.New("ws down")})

	report := svc.Run(context.Background(), &config.Config{
		APIKey:      "account-1234567890",
		APISecret:   "secret-1234567890",
		Environment: "production",
	}, "environment variables", Options{})

	if report.Status != StatusFail {
		t.Fatalf("Status = %s, want %s", report.Status, StatusFail)
	}
	if report.ReadyForTrading {
		t.Fatal("ReadyForTrading = true, want false")
	}
	if len(report.BlockingChecks) != 3 {
		t.Fatalf("BlockingChecks = %#v, want 3 items", report.BlockingChecks)
	}
	if report.Summary.Fail < 3 {
		t.Fatalf("summary = %#v, want multiple failures", report.Summary)
	}
}
