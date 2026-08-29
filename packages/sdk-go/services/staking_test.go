package services_test

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gemini/developer-platform/packages/sdk-go/generated/account"
	"github.com/gemini/developer-platform/packages/sdk-go/services"
	"github.com/gemini/developer-platform/packages/sdk-go/transport"
)

func TestStakingService_Methods(t *testing.T) {
	server := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		switch r.URL.Path {
		case "/v1/balances/staking":
			_ = json.NewEncoder(w).Encode([]map[string]any{
				{"currency": "ETH", "amount": 10.0, "amountAvailable": 8.0},
			})
		case "/v1/staking/stake":
			_ = json.NewEncoder(w).Encode(map[string]any{
				"transactionId": "stk-123", "currency": "ETH", "amount": 2.5,
			})
		case "/v1/staking/unstake":
			_ = json.NewEncoder(w).Encode(map[string]any{
				"transactionId": "unstk-456",
				"currency":      "ETH",
				"amount":        1.0,
			})
		case "/v1/staking/history":
			_ = json.NewEncoder(w).Encode([]map[string]any{
				{
					"providerId": "62b21e17-2534-4b9f-afcf-b7edb609dd8d",
					"transactions": []map[string]any{
						{"transactionId": "stk-123", "amountCurrency": "ETH", "amount": 2.5, "transactionType": "Deposit"},
					},
				},
			})
		case "/v1/staking/rates":
			_ = json.NewEncoder(w).Encode(map[string]any{
				"62b21e17-2534-4b9f-afcf-b7edb609dd8d": map[string]any{
					"ETH": map[string]any{"rate": 95.8909, "apyPct": 4.6, "providerId": "62b21e17-2534-4b9f-afcf-b7edb609dd8d"},
				},
			})
		case "/v1/staking/rewards":
			_ = json.NewEncoder(w).Encode(map[string]any{
				"62b21e17-2534-4b9f-afcf-b7edb609dd8d": map[string]any{
					"ETH": map[string]any{
						"providerId":   "62b21e17-2534-4b9f-afcf-b7edb609dd8d",
						"currency":     "ETH",
						"accrualTotal": 0.01799,
						"ratePeriods": []map[string]any{
							{"currency": "ETH", "apyPct": 4.6, "accrualTotal": 0.001},
						},
					},
				},
			})
		default:
			http.NotFound(w, r)
		}
	}))
	defer server.Close()

	trans := transport.NewClient(transport.WithHTTPClient(server.Client()))
	svc := services.NewStakingService(trans, server.URL)
	ctx := context.Background()

	// 1. GetStakingBalances
	balances, err := svc.GetStakingBalances(ctx, &account.ListStakingBalancesJSONBody{})
	if err != nil || len(balances) != 1 {
		t.Fatalf("GetStakingBalances failed: %v", err)
	}

	// 2. Stake
	stk, err := svc.Stake(ctx, &account.StakeCryptoFundsJSONBody{
		ProviderId: "62b21e17-2534-4b9f-afcf-b7edb609dd8d",
		Currency:   "ETH",
		Amount:     "2.5",
	})
	if err != nil || stk.TransactionId == nil || *stk.TransactionId != "stk-123" {
		t.Fatalf("Stake failed: %v", err)
	}

	// 3. Unstake
	unstk, err := svc.Unstake(ctx, &account.UnstakeCryptoFundsJSONBody{
		ProviderId: "62b21e17-2534-4b9f-afcf-b7edb609dd8d",
		Currency:   "ETH",
		Amount:     "1.0",
	})
	if err != nil || unstk.TransactionId == nil || *unstk.TransactionId != "unstk-456" {
		t.Fatalf("Unstake failed: %v", err)
	}

	// 4. GetStakingHistory
	limit := 50
	hist, err := svc.GetStakingHistory(ctx, &account.ListStakingEventHistoryJSONBody{Limit: &limit})
	if err != nil || len(hist) != 1 || hist[0].Transactions == nil || len(*hist[0].Transactions) != 1 {
		t.Fatalf("GetStakingHistory failed: %v", err)
	}

	// 5. GetStakingRates
	rates, err := svc.GetStakingRates(ctx)
	if err != nil || len(rates) == 0 {
		t.Fatalf("GetStakingRates failed: %v", err)
	}
	ethRate, ok := rates["62b21e17-2534-4b9f-afcf-b7edb609dd8d"]["ETH"]
	if !ok || ethRate.Rate == nil || ethRate.Rate.String() != "95.8909" || ethRate.ApyPct == nil || ethRate.ApyPct.String() != "4.6" {
		t.Fatalf("expected ETH rate 95.8909 and APY 4.6, got rate=%v apy=%v", ethRate.Rate, ethRate.ApyPct)
	}

	// 6. GetStakingRewards
	rewards, err := svc.GetStakingRewards(ctx, &account.ListStakingRewardsJSONBody{Since: "2022-08-20T00:00:00.000Z"})
	if err != nil || len(rewards) == 0 {
		t.Fatalf("GetStakingRewards failed: %v", err)
	}
	ethReward, ok := rewards["62b21e17-2534-4b9f-afcf-b7edb609dd8d"]["ETH"]
	if !ok || ethReward.RatePeriods == nil || len(*ethReward.RatePeriods) != 1 {
		t.Fatalf("expected ETH rate periods, got %v", ethReward.RatePeriods)
	}
}
