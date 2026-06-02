package api

import (
	"context"
)

// SpotTrade represents a historical trade execution.
type SpotTrade struct {
	Price          string `json:"price"`
	Amount         string `json:"amount"`
	Timestamp      int64  `json:"timestamp"`
	TimestampMs    int64  `json:"timestampms"`
	Type           string `json:"type"`
	Aggressor      bool   `json:"aggressor"`
	FeeCurrency    string `json:"fee_currency"`
	FeeAmount      string `json:"fee_amount"`
	TID            int64  `json:"tid"`
	OrderID        string `json:"order_id"`
	ClientOrderID  string `json:"client_order_id,omitempty"`
	Exchange       string `json:"exchange,omitempty"`
	IsAuctionFill  bool   `json:"is_auction_fill,omitempty"`
	IsClearingFill bool   `json:"is_clearing_fill,omitempty"`
	Symbol         string `json:"symbol,omitempty"`
}

// ListSpotTradesParams contains filter parameters for listing spot trades.
type ListSpotTradesParams struct {
	Symbol      string
	LimitTrades int
	Timestamp   int64
	Account     string
}

// ListSpotTrades retrieves historical spot trade executions.
func (c *Client) ListSpotTrades(ctx context.Context, params ListSpotTradesParams) ([]SpotTrade, error) {
	reqParams := map[string]any{}
	if params.Symbol != "" {
		reqParams["symbol"] = params.Symbol
	}
	if params.LimitTrades > 0 {
		reqParams["limit_trades"] = params.LimitTrades
	}
	if params.Timestamp > 0 {
		reqParams["timestamp"] = params.Timestamp
	}
	if params.Account != "" {
		reqParams["account"] = params.Account
	}

	var resp []SpotTrade
	err := c.doPrivateRequest(ctx, "/v1/mytrades", reqParams, &resp)
	return resp, err
}
