package api

import (
	"context"
)

// SpotOrderRequest contains parameters for placing a spot order.
type SpotOrderRequest struct {
	Symbol        string   `json:"symbol"`
	Amount        string   `json:"amount"`
	Price         string   `json:"price,omitempty"`
	Side          string   `json:"side"`
	Type          string   `json:"type"`
	ClientOrderID string   `json:"client_order_id,omitempty"`
	Options       []string `json:"options,omitempty"`
	StopPrice     string   `json:"stop_price,omitempty"`
	Account       string   `json:"account,omitempty"`
}

// SpotOrderResponse contains the response from a spot order operation.
type SpotOrderResponse struct {
	OrderID           string   `json:"order_id"`
	ID                string   `json:"id,omitempty"`
	ClientOrderID     string   `json:"client_order_id,omitempty"`
	Symbol            string   `json:"symbol"`
	Exchange          string   `json:"exchange,omitempty"`
	Side              string   `json:"side"`
	Type              string   `json:"type"`
	Price             string   `json:"price"`
	AvgExecutionPrice string   `json:"avg_execution_price,omitempty"`
	OriginalAmount    string   `json:"original_amount"`
	ExecutedAmount    string   `json:"executed_amount"`
	RemainingAmount   string   `json:"remaining_amount"`
	IsLive            bool     `json:"is_live"`
	IsCancelled       bool     `json:"is_cancelled"` //nolint:misspell // Gemini API field name
	IsHidden          bool     `json:"is_hidden,omitempty"`
	WasForced         bool     `json:"was_forced,omitempty"`
	Options           []string `json:"options,omitempty"`
	StopPrice         string   `json:"stop_price,omitempty"`
	TimestampMs       int64    `json:"timestampms"`
}

// ListSpotOrdersParams contains filter parameters for listing spot orders.
type ListSpotOrdersParams struct {
	Symbol    string
	Account   string
	Limit     int
	Timestamp int64
}

// PlaceSpotOrder places a new spot order.
func (c *Client) PlaceSpotOrder(ctx context.Context, req *SpotOrderRequest) (*SpotOrderResponse, error) {
	params := map[string]any{
		"symbol": req.Symbol,
		"amount": req.Amount,
		"side":   req.Side,
		"type":   req.Type,
	}

	if req.Price != "" {
		params["price"] = req.Price
	}
	if req.ClientOrderID != "" {
		params["client_order_id"] = req.ClientOrderID
	}
	if len(req.Options) > 0 {
		params["options"] = req.Options
	}
	if req.StopPrice != "" {
		params["stop_price"] = req.StopPrice
	}
	if req.Account != "" {
		params["account"] = req.Account
	}

	var resp SpotOrderResponse
	err := c.doPrivateRequest(ctx, "/v1/order/new", params, &resp)
	return &resp, err
}

// GetSpotOrderStatus retrieves the status of a spot order.
func (c *Client) GetSpotOrderStatus(ctx context.Context, orderID string) (*SpotOrderResponse, error) {
	var resp SpotOrderResponse
	err := c.doPrivateRequest(ctx, "/v1/order/status", map[string]any{
		"order_id": orderID,
	}, &resp)
	return &resp, err
}

// ListSpotOrders retrieves a list of spot orders.
func (c *Client) ListSpotOrders(ctx context.Context, params ListSpotOrdersParams) ([]SpotOrderResponse, error) {
	reqParams := map[string]any{}
	if params.Account != "" {
		reqParams["account"] = params.Account
	}

	var resp []SpotOrderResponse
	err := c.doPrivateRequest(ctx, "/v1/orders", reqParams, &resp)
	return resp, err
}

// CancelSpotOrder cancels a spot order by ID.
func (c *Client) CancelSpotOrder(ctx context.Context, orderID string) (*SpotOrderResponse, error) {
	var resp SpotOrderResponse
	err := c.doPrivateRequest(ctx, "/v1/order/cancel", map[string]any{
		"order_id": orderID,
	}, &resp)
	return &resp, err
}

// CancelAllSpotOrders cancels all open spot orders.
func (c *Client) CancelAllSpotOrders(ctx context.Context, account string) (*CancelAllResult, error) {
	params := map[string]any{}
	if account != "" {
		params["account"] = account
	}

	var resp CancelAllResult
	err := c.doPrivateRequest(ctx, "/v1/order/cancel/all", params, &resp)
	return &resp, err
}
