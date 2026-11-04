package services

import (
	"context"

	"github.com/gemini/developer-platform/packages/sdk-go/generated/account"
	"github.com/gemini/developer-platform/packages/sdk-go/transport"
)

// StakingService provides access to Gemini Staking deposits, redemptions, rates, rewards, and history.
type StakingService struct {
	baseService
	public baseService
}

// NewStakingService creates a new StakingService.
func NewStakingService(client *transport.Client, baseURL string) *StakingService {
	return NewStakingServiceWithPublicClient(client, client, baseURL)
}

// NewStakingServiceWithPublicClient creates a staking service with separate
// transports for public rates and authenticated account operations.
func NewStakingServiceWithPublicClient(privateClient, publicClient *transport.Client, baseURL string) *StakingService {
	return &StakingService{
		baseService: newBaseService(privateClient, baseURL),
		public:      newBaseService(publicClient, baseURL),
	}
}

// 1. GetStakingBalances returns the current staked balances and amounts available to unstake.
func (s *StakingService) GetStakingBalances(ctx context.Context, req *account.ListStakingBalancesJSONBody) ([]account.StakingBalance, error) {
	if req == nil {
		req = &account.ListStakingBalancesJSONBody{}
	}
	var res []account.StakingBalance
	if err := s.post(ctx, "/v1/balances/staking", req, &res); err != nil {
		return nil, err
	}
	return res, nil
}

// 2. Stake initiates a crypto staking deposit for a supported asset.
func (s *StakingService) Stake(ctx context.Context, req *account.StakeCryptoFundsJSONBody) (*account.StakingDeposit, error) {
	var res account.StakingDeposit
	if err := s.post(ctx, "/v1/staking/stake", req, &res); err != nil {
		return nil, err
	}
	return &res, nil
}

// 3. Unstake initiates a staking redemption/withdrawal back to the exchange account.
func (s *StakingService) Unstake(ctx context.Context, req *account.UnstakeCryptoFundsJSONBody) (*account.StakingWithdrawal, error) {
	var res account.StakingWithdrawal
	if err := s.post(ctx, "/v1/staking/unstake", req, &res); err != nil {
		return nil, err
	}
	return &res, nil
}

// 4. GetStakingHistory retrieves historical staking transactions (deposits, redemptions, accruals).
func (s *StakingService) GetStakingHistory(ctx context.Context, req *account.ListStakingEventHistoryJSONBody) ([]account.StakingHistory, error) {
	if req == nil {
		req = &account.ListStakingEventHistoryJSONBody{}
	}
	var res []account.StakingHistory
	if err := s.post(ctx, "/v1/staking/history", req, &res); err != nil {
		return nil, err
	}
	return res, nil
}

// 5. GetStakingRates retrieves current Gemini Staking interest rates (in bps) and APY grouped by Provider UUID and Currency.
func (s *StakingService) GetStakingRates(ctx context.Context) (map[string]map[string]account.StakingRate, error) {
	var res map[string]map[string]account.StakingRate
	if err := s.public.get(ctx, "/v1/staking/rates", &res); err != nil {
		return nil, err
	}
	return res, nil
}

// 6. GetStakingRewards retrieves historical staking reward distributions grouped by Provider UUID and Currency.
func (s *StakingService) GetStakingRewards(ctx context.Context, req *account.ListStakingRewardsJSONBody) (map[string]map[string]account.StakingRewards, error) {
	if req == nil {
		req = &account.ListStakingRewardsJSONBody{}
	}
	var res map[string]map[string]account.StakingRewards
	if err := s.post(ctx, "/v1/staking/rewards", req, &res); err != nil {
		return nil, err
	}
	return res, nil
}
