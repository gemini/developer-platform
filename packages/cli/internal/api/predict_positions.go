package api

import (
	"context"
)

// Position represents a prediction market position.
type Position struct {
	ContractID            string `json:"contractId"`
	Shares                string `json:"shares"`
	AvgPrice              string `json:"avgPrice,omitempty"`
	CurrentMarketValue    string `json:"currentMarketValue,omitempty"`
	PnL                   string `json:"pnl,omitempty"`
	Amount                string `json:"amount,omitempty"`
	Payout                string `json:"payout,omitempty"`
	TotalReturn           string `json:"totalReturn,omitempty"`
	TotalReturnPercentage string `json:"totalReturnPercentage,omitempty"`
}

// PositionsResponse contains a list of positions with pagination.
type PositionsResponse struct {
	Data       []Position `json:"data"`
	Pagination Pagination `json:"pagination"`
}

// ListPositionsParams contains filter parameters for listing positions.
type ListPositionsParams struct {
	EventTicker string
	Limit       int
	Offset      int
}

// ListPositions retrieves open prediction market positions.
func (c *Client) ListPositions(ctx context.Context, params ListPositionsParams) (*PositionsResponse, error) {
	reqParams := map[string]any{}
	if params.EventTicker != "" {
		reqParams["symbol"] = params.EventTicker
	}
	if params.Limit > 0 {
		reqParams["limit"] = params.Limit
	}
	if params.Offset > 0 {
		reqParams["offset"] = params.Offset
	}

	var resp PositionsResponse
	err := c.doPrivateRequest(ctx, "/v1/prediction-markets/positions", reqParams, &resp)
	return &resp, err
}

// ListSettledPositions retrieves settled prediction market positions.
func (c *Client) ListSettledPositions(ctx context.Context, params ListPositionsParams) (*PositionsResponse, error) {
	reqParams := map[string]any{}
	if params.Limit > 0 {
		reqParams["limit"] = params.Limit
	}
	if params.Offset > 0 {
		reqParams["offset"] = params.Offset
	}

	var resp PositionsResponse
	err := c.doPrivateRequest(ctx, "/v1/prediction-markets/positions/settled", reqParams, &resp)
	return &resp, err
}
