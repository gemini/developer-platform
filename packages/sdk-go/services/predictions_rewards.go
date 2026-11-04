package services

import (
	"context"
	"net/url"
	"strconv"

	"github.com/gemini/developer-platform/packages/sdk-go/generated/predictions"
	"github.com/gemini/developer-platform/packages/sdk-go/types"
)

// GetMakerRebateRates returns the currently effective maker-rebate rules.
func (s *PredictionsService) GetMakerRebateRates(ctx context.Context, params *predictions.GetMakerRebateRatesParams) (*predictions.MakerRebateRatesResponse, error) {
	var res predictions.MakerRebateRatesResponse
	if err := s.public.get(ctx, withQuery("/v1/prediction-markets/maker-rebate/rates", makerRebateRatesQuery(params)), &res); err != nil {
		return nil, err
	}
	return &res, nil
}

// ListMakerRebatePayouts returns paginated maker-rebate payouts.
func (s *PredictionsService) ListMakerRebatePayouts(ctx context.Context, params *predictions.ListMakerRebatePayoutsParams) (*predictions.MakerRebatePayoutsResponse, error) {
	var res predictions.MakerRebatePayoutsResponse
	if err := s.post(ctx, withQuery("/v1/prediction-markets/maker-rebate/payouts", makerRebatePayoutsQuery(params)), nil, &res); err != nil {
		return nil, err
	}
	return &res, nil
}

// GetMakerRebateLifetimeSummary returns lifetime maker-rebate totals,
// optionally restricted to an inclusive date range.
func (s *PredictionsService) GetMakerRebateLifetimeSummary(ctx context.Context, params *predictions.GetMakerRebateLifetimeSummaryParams) (*predictions.MakerRebateLifetimeSummary, error) {
	var res predictions.MakerRebateLifetimeSummary
	if err := s.get(ctx, withQuery("/v1/prediction-markets/maker-rebate/summary/total", makerRebateSummaryQuery(params)), &res); err != nil {
		return nil, err
	}
	return &res, nil
}

// GetLiquidityRewardsConfig returns the public liquidity-rewards program
// configuration.
func (s *PredictionsService) GetLiquidityRewardsConfig(ctx context.Context) (*predictions.LiquidityRewardsConfig, error) {
	var res predictions.LiquidityRewardsConfig
	if err := s.public.get(ctx, "/v1/prediction-markets/liquidity-rewards/config", &res); err != nil {
		return nil, err
	}
	return &res, nil
}

// ListLiquidityRewardsEvents returns paginated events participating in the
// liquidity-rewards program.
func (s *PredictionsService) ListLiquidityRewardsEvents(ctx context.Context, params *predictions.ListLiquidityRewardsEventsParams) (*predictions.LiquidityRewardsEventsResponse, error) {
	var res predictions.LiquidityRewardsEventsResponse
	if err := s.public.get(ctx, withQuery("/v1/prediction-markets/liquidity-rewards/events", liquidityRewardsEventsQuery(params)), &res); err != nil {
		return nil, err
	}
	return &res, nil
}

// GetLiquidityRewardsDailySummary returns account rewards for the required
// date window.
func (s *PredictionsService) GetLiquidityRewardsDailySummary(ctx context.Context, params *predictions.GetLiquidityRewardsDailySummaryParams) (*predictions.LiquidityRewardsDailySummaryResponse, error) {
	var res predictions.LiquidityRewardsDailySummaryResponse
	if err := s.get(ctx, withQuery("/v1/prediction-markets/liquidity-rewards/summary/daily", liquidityRewardsDailySummaryQuery(params)), &res); err != nil {
		return nil, err
	}
	return &res, nil
}

// GetLiquidityRewardsLifetimeSummary returns lifetime account rewards,
// optionally restricted to an inclusive date range.
func (s *PredictionsService) GetLiquidityRewardsLifetimeSummary(ctx context.Context, params *predictions.GetLiquidityRewardsLifetimeSummaryParams) (*predictions.LiquidityRewardsLifetimeSummary, error) {
	var res predictions.LiquidityRewardsLifetimeSummary
	if err := s.get(ctx, withQuery("/v1/prediction-markets/liquidity-rewards/summary/total", liquidityRewardsLifetimeSummaryQuery(params)), &res); err != nil {
		return nil, err
	}
	return &res, nil
}

func makerRebateRatesQuery(params *predictions.GetMakerRebateRatesParams) url.Values {
	q := url.Values{}
	if params != nil && params.Category != nil {
		q.Set("category", *params.Category)
	}
	return q
}

func makerRebatePayoutsQuery(params *predictions.ListMakerRebatePayoutsParams) url.Values {
	q := url.Values{}
	if params != nil {
		addLimitOffset(q, params.Limit, params.Offset)
	}
	return q
}

func makerRebateSummaryQuery(params *predictions.GetMakerRebateLifetimeSummaryParams) url.Values {
	q := url.Values{}
	if params == nil {
		return q
	}
	addDate(q, "dateFrom", params.DateFrom)
	addDate(q, "dateTo", params.DateTo)
	return q
}

func liquidityRewardsEventsQuery(params *predictions.ListLiquidityRewardsEventsParams) url.Values {
	q := url.Values{}
	if params == nil {
		return q
	}
	if params.Category != nil {
		q.Set("category", *params.Category)
	}
	if params.Search != nil {
		q.Set("search", *params.Search)
	}
	if params.Sort != nil {
		q.Set("sort", string(*params.Sort))
	}
	if params.Limit != nil {
		q.Set("limit", strconv.Itoa(*params.Limit))
	}
	if params.Offset != nil {
		q.Set("offset", strconv.Itoa(*params.Offset))
	}
	return q
}

func liquidityRewardsDailySummaryQuery(params *predictions.GetLiquidityRewardsDailySummaryParams) url.Values {
	q := url.Values{}
	if params == nil {
		return q
	}
	addDateValue(q, "dateFrom", params.DateFrom)
	addDateValue(q, "dateTo", params.DateTo)
	return q
}

func liquidityRewardsLifetimeSummaryQuery(params *predictions.GetLiquidityRewardsLifetimeSummaryParams) url.Values {
	q := url.Values{}
	if params == nil {
		return q
	}
	addDate(q, "dateFrom", params.DateFrom)
	addDate(q, "dateTo", params.DateTo)
	return q
}

func addDate(q url.Values, name string, value *types.Date) {
	if value != nil && !value.IsZero() {
		q.Set(name, value.String())
	}
}

func addDateValue(q url.Values, name string, value types.Date) {
	if !value.IsZero() {
		q.Set(name, value.String())
	}
}
