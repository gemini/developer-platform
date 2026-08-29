package services

import (
	"context"
	"net/url"
	"strconv"

	"github.com/gemini/developer-platform/packages/sdk-go/generated/predictions"
)

// ListCombos returns paginated combo contracts matching params.
func (s *PredictionsService) ListCombos(ctx context.Context, params *predictions.ListCombosParams) (*predictions.ListCombosResponse, error) {
	var res predictions.ListCombosResponse
	if err := s.public.get(ctx, withQuery("/v1/prediction-markets/combos", listCombosQuery(params)), &res); err != nil {
		return nil, err
	}
	return &res, nil
}

// CreateCombo creates or retrieves the canonical combo for a set of legs.
func (s *PredictionsService) CreateCombo(ctx context.Context, req *predictions.CreateComboJSONRequestBody) (*predictions.CreateComboResponse, error) {
	var res predictions.CreateComboResponse
	if err := s.post(ctx, "/v1/prediction-markets/combos", req, &res); err != nil {
		return nil, err
	}
	return &res, nil
}

// GetCombo returns a combo by instrument symbol.
func (s *PredictionsService) GetCombo(ctx context.Context, instrumentSymbol string) (*predictions.ComboResponse, error) {
	var res predictions.ComboResponse
	if err := s.public.get(ctx, "/v1/prediction-markets/combos/"+url.PathEscape(instrumentSymbol), &res); err != nil {
		return nil, err
	}
	return &res, nil
}

func listCombosQuery(params *predictions.ListCombosParams) url.Values {
	q := url.Values{}
	if params == nil {
		return q
	}
	if params.Status != nil {
		q.Set("status", *params.Status)
	}
	if params.ContractId != nil {
		q.Set("contractId", strconv.FormatInt(*params.ContractId, 10))
	}
	if params.InstrumentRegistered != nil {
		q.Set("instrumentRegistered", strconv.FormatBool(*params.InstrumentRegistered))
	}
	addLimitOffset(q, params.Limit, params.Offset)
	return q
}
