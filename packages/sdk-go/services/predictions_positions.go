package services

import (
	"context"
	"net/url"
	"strconv"

	"github.com/gemini/gemini-go/generated/predictions"
)

// GetPositions returns the authenticated account's current prediction-market
// positions. Parameters are sent as query parameters on the signed POST.
func (s *PredictionsService) GetPositions(ctx context.Context, params *predictions.GetPositionsParams) (*predictions.PositionsResponse, error) {
	var res predictions.PositionsResponse
	if err := s.post(ctx, withQuery("/v1/prediction-markets/positions", getPositionsQuery(params)), nil, &res); err != nil {
		return nil, err
	}
	return &res, nil
}

// GetSettledPositions returns the authenticated account's settled prediction-
// market positions. Parameters are sent as query parameters on the signed
// POST.
func (s *PredictionsService) GetSettledPositions(ctx context.Context, params *predictions.GetSettledPositionsParams) (*predictions.SettledPositionsResponse, error) {
	var res predictions.SettledPositionsResponse
	if err := s.post(ctx, withQuery("/v1/prediction-markets/positions/settled", getSettledPositionsQuery(params)), nil, &res); err != nil {
		return nil, err
	}
	return &res, nil
}

// GetVolumeMetrics returns per-contract volume metrics for an event.
func (s *PredictionsService) GetVolumeMetrics(ctx context.Context, req *predictions.GetVolumeMetricsJSONRequestBody) (*predictions.VolumeMetricsResponse, error) {
	var res predictions.VolumeMetricsResponse
	if err := s.post(ctx, "/v1/prediction-markets/metrics/volume", req, &res); err != nil {
		return nil, err
	}
	return &res, nil
}

func getPositionsQuery(params *predictions.GetPositionsParams) url.Values {
	if params == nil {
		return url.Values{}
	}
	q := positionsQuery(params.EventTicker, params.Limit, params.Offset, stringPointerValue(params.Sort))
	return q
}

func getSettledPositionsQuery(params *predictions.GetSettledPositionsParams) url.Values {
	if params == nil {
		return url.Values{}
	}
	q := positionsQuery(params.EventTicker, params.Limit, params.Offset, stringPointerValue(params.Sort))
	if params.Search != nil {
		q.Set("search", *params.Search)
	}
	if params.Category != nil {
		q.Set("category", *params.Category)
	}
	if params.WithCashOuts != nil {
		q.Set("withCashOuts", strconv.FormatBool(*params.WithCashOuts))
	}
	return q
}

func positionsQuery(eventTicker *string, limit, offset *int, sort string) url.Values {
	q := url.Values{}
	if eventTicker != nil {
		q.Set("eventTicker", *eventTicker)
	}
	if limit != nil {
		q.Set("limit", strconv.Itoa(*limit))
	}
	if offset != nil {
		q.Set("offset", strconv.Itoa(*offset))
	}
	if sort != "" {
		q.Set("sort", sort)
	}
	return q
}

func stringPointerValue[T ~string](value *T) string {
	if value == nil {
		return ""
	}
	return string(*value)
}
