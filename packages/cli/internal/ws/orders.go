package ws

import (
	"context"
	"encoding/json"
)

// OrderParams contains parameters for placing an order.
type OrderParams struct {
	Symbol        string `json:"symbol"`
	Side          string `json:"side"`
	Type          string `json:"type"`
	TimeInForce   string `json:"timeInForce,omitempty"`
	Price         string `json:"price,omitempty"`
	Quantity      string `json:"quantity"`
	ClientOrderID string `json:"clientOrderId,omitempty"`
	EventOutcome  string `json:"eventOutcome,omitempty"`
	MakerOrCancel bool   `json:"makerOrCancel,omitempty"`
}

// OrderResult contains the result of an order operation.
type OrderResult struct {
	OrderID            string `json:"orderId"`
	ClientOrderID      string `json:"clientOrderId,omitempty"`
	Symbol             string `json:"symbol"`
	Side               string `json:"side"`
	Type               string `json:"type"`
	TimeInForce        string `json:"timeInForce,omitempty"`
	Price              string `json:"price,omitempty"`
	OrigQty            string `json:"origQty"`
	ExecutedQty        string `json:"executedQty"`
	CumulativeQuoteQty string `json:"cumulativeQuoteQty,omitempty"`
	Status             string `json:"status"`
	EventOutcome       string `json:"eventOutcome,omitempty"`
}

// CancelParams contains parameters for canceling an order.
type CancelParams struct {
	OrderID       string `json:"orderId,omitempty"`
	ClientOrderID string `json:"clientOrderId,omitempty"`
	Symbol        string `json:"symbol,omitempty"`
}

// CancelAllParams contains parameters for canceling all orders.
type CancelAllParams struct {
	Symbol string `json:"symbol,omitempty"`
}

// CancelAllResult contains the result of a cancel all operation.
type CancelAllResult struct {
	CancelledOrders []string `json:"cancelledOrders"`
}

// PlaceOrder places a new order via WebSocket.
func (c *Client) PlaceOrder(ctx context.Context, params *OrderParams) (*OrderResult, error) {
	resp, err := c.SendRequest(ctx, "order.place", params)
	if err != nil {
		return nil, err
	}

	var result OrderResult
	if err := json.Unmarshal(resp.Result, &result); err != nil {
		return nil, err
	}
	return &result, nil
}

// CancelOrder cancels an existing order via WebSocket.
func (c *Client) CancelOrder(ctx context.Context, params CancelParams) (*OrderResult, error) {
	resp, err := c.SendRequest(ctx, "order.cancel", params)
	if err != nil {
		return nil, err
	}

	var result OrderResult
	if err := json.Unmarshal(resp.Result, &result); err != nil {
		return nil, err
	}
	return &result, nil
}

// CancelAllOrders cancels all active orders via WebSocket.
func (c *Client) CancelAllOrders(ctx context.Context, params *CancelAllParams) (*CancelAllResult, error) {
	resp, err := c.SendRequest(ctx, "order.cancel_all", params)
	if err != nil {
		return nil, err
	}

	var result CancelAllResult
	if err := json.Unmarshal(resp.Result, &result); err != nil {
		return nil, err
	}
	return &result, nil
}

// CancelSessionOrders cancels all session orders via WebSocket.
func (c *Client) CancelSessionOrders(ctx context.Context) (*CancelAllResult, error) {
	resp, err := c.SendRequest(ctx, "order.cancel_session", nil)
	if err != nil {
		return nil, err
	}

	var result CancelAllResult
	if err := json.Unmarshal(resp.Result, &result); err != nil {
		return nil, err
	}
	return &result, nil
}
