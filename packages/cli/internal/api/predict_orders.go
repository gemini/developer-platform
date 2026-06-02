package api

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
)

// PredictOrderRequest contains parameters for placing a prediction market order.
type PredictOrderRequest struct {
	Symbol        string `json:"symbol"`
	Side          string `json:"side"`
	Outcome       string `json:"outcome"`
	OrderType     string `json:"orderType"`
	Quantity      string `json:"quantity"`
	Price         string `json:"price,omitempty"`
	StopPrice     string `json:"stopPrice,omitempty"`
	TimeInForce   string `json:"timeInForce,omitempty"`
	ClientOrderID string `json:"clientOrderId,omitempty"`
	MakerOrCancel bool   `json:"makerOrCancel,omitempty"`
}

// PredictOrderResponse contains the response from a prediction market order operation.
type PredictOrderResponse struct {
	OrderID        string `json:"orderId"`
	ClientOrderID  string `json:"clientOrderId,omitempty"`
	Symbol         string `json:"symbol"`
	Side           string `json:"side"`
	Outcome        string `json:"outcome"`
	OrderType      string `json:"orderType"`
	Status         string `json:"status"`
	Price          string `json:"price"`
	Quantity       string `json:"quantity"`
	FilledQuantity string `json:"filledQuantity"`
	CreatedAt      string `json:"createdAt"`
}

func (r *PredictOrderResponse) UnmarshalJSON(data []byte) error {
	var wire struct {
		OrderID        jsonString `json:"orderId"`
		ClientOrderID  jsonString `json:"clientOrderId"`
		Symbol         jsonString `json:"symbol"`
		Side           jsonString `json:"side"`
		Outcome        jsonString `json:"outcome"`
		OrderType      jsonString `json:"orderType"`
		Status         jsonString `json:"status"`
		Price          jsonString `json:"price"`
		Quantity       jsonString `json:"quantity"`
		FilledQuantity jsonString `json:"filledQuantity"`
		CreatedAt      jsonString `json:"createdAt"`
	}
	if err := json.Unmarshal(data, &wire); err != nil {
		return err
	}

	r.OrderID = string(wire.OrderID)
	r.ClientOrderID = string(wire.ClientOrderID)
	r.Symbol = string(wire.Symbol)
	r.Side = string(wire.Side)
	r.Outcome = string(wire.Outcome)
	r.OrderType = string(wire.OrderType)
	r.Status = string(wire.Status)
	r.Price = string(wire.Price)
	r.Quantity = string(wire.Quantity)
	r.FilledQuantity = string(wire.FilledQuantity)
	r.CreatedAt = string(wire.CreatedAt)
	return nil
}

type jsonString string

func (s *jsonString) UnmarshalJSON(data []byte) error {
	if bytes.Equal(data, []byte("null")) {
		*s = ""
		return nil
	}

	var text string
	if err := json.Unmarshal(data, &text); err == nil {
		*s = jsonString(text)
		return nil
	}

	decoder := json.NewDecoder(bytes.NewReader(data))
	decoder.UseNumber()
	var number json.Number
	if err := decoder.Decode(&number); err == nil {
		*s = jsonString(number.String())
		return nil
	}

	return fmt.Errorf("expected string or number, got %s", data)
}

// PredictOrdersResponse contains a list of prediction market orders with pagination.
type PredictOrdersResponse struct {
	Data       []PredictOrderResponse `json:"data"`
	Pagination Pagination             `json:"pagination"`
}

// ListPredictOrdersParams contains filter parameters for listing prediction orders.
type ListPredictOrdersParams struct {
	TickerID    string
	EventTicker string
	Status      string
	Limit       int
	Offset      int
}

// PlacePredictOrder places a new prediction market order.
func (c *Client) PlacePredictOrder(ctx context.Context, req *PredictOrderRequest) (*PredictOrderResponse, error) {
	params := map[string]any{
		"symbol":    req.Symbol,
		"side":      req.Side,
		"outcome":   req.Outcome,
		"orderType": req.OrderType,
		"quantity":  req.Quantity,
	}

	if req.Price != "" {
		params["price"] = req.Price
	}
	if req.StopPrice != "" {
		params["stopPrice"] = req.StopPrice
	}
	if req.TimeInForce != "" {
		params["timeInForce"] = req.TimeInForce
	}
	if req.ClientOrderID != "" {
		params["clientOrderId"] = req.ClientOrderID
	}
	if req.MakerOrCancel {
		params["makerOrCancel"] = true
	}

	var resp PredictOrderResponse
	err := c.doPrivateRequest(ctx, "/v1/prediction-markets/order", params, &resp)
	return &resp, err
}

// ListOpenPredictOrders retrieves all open prediction market orders.
func (c *Client) ListOpenPredictOrders(ctx context.Context, params ListPredictOrdersParams) (*PredictOrdersResponse, error) {
	reqParams := map[string]any{}
	if params.TickerID != "" {
		reqParams["symbol"] = params.TickerID
	}
	if params.Limit > 0 {
		reqParams["limit"] = params.Limit
	}
	if params.Offset > 0 {
		reqParams["offset"] = params.Offset
	}

	var resp PredictOrdersResponse
	err := c.doPrivateRequest(ctx, "/v1/prediction-markets/orders/active", reqParams, &resp)
	return &resp, err
}

// ListPredictOrderHistory retrieves historical prediction market orders.
func (c *Client) ListPredictOrderHistory(ctx context.Context, params ListPredictOrdersParams) (*PredictOrdersResponse, error) {
	reqParams := map[string]any{}
	if params.TickerID != "" {
		reqParams["symbol"] = params.TickerID
	}
	if params.Status != "" {
		reqParams["status"] = params.Status
	}
	if params.Limit > 0 {
		reqParams["limit"] = params.Limit
	}
	if params.Offset > 0 {
		reqParams["offset"] = params.Offset
	}

	var resp PredictOrdersResponse
	err := c.doPrivateRequest(ctx, "/v1/prediction-markets/orders/history", reqParams, &resp)
	return &resp, err
}

// CancelPredictOrder cancels a prediction market order by ID.
func (c *Client) CancelPredictOrder(ctx context.Context, orderID string) (*PredictOrderResponse, error) {
	var resp PredictOrderResponse
	err := c.doPrivateRequest(ctx, "/v1/prediction-markets/order/cancel", map[string]any{
		"orderId": orderID,
	}, &resp)
	return &resp, err
}

// GetPredictOrder retrieves the status of a prediction market order by ID.
func (c *Client) GetPredictOrder(ctx context.Context, orderID string) (*PredictOrderResponse, error) {
	var resp PredictOrderResponse
	err := c.doPrivateRequest(ctx, "/v1/prediction-markets/order/status", map[string]any{
		"orderId": orderID,
	}, &resp)
	return &resp, err
}

// CancelAllResult contains the result of canceling all orders.
type CancelAllResult struct {
	Result          string                 `json:"result"`
	Details         CancelAllDetails       `json:"details"`
	CancelledOrders []CancelledOrderDetail `json:"cancelledOrders,omitempty"`
}

// CancelAllDetails contains details of canceled orders.
type CancelAllDetails struct {
	CancelledOrders []CancelledOrderDetail `json:"cancelledOrders"`
}

// CancelledOrderDetail contains information about a single canceled order.
type CancelledOrderDetail struct {
	OrderID string `json:"order_id"`
}

func (d *CancelledOrderDetail) UnmarshalJSON(data []byte) error {
	if bytes.Equal(data, []byte("null")) {
		*d = CancelledOrderDetail{}
		return nil
	}

	var id jsonString
	if err := json.Unmarshal(data, &id); err == nil && id != "" {
		d.OrderID = string(id)
		return nil
	}

	var wire struct {
		OrderID      jsonString `json:"order_id"`
		OrderIDCamel jsonString `json:"orderId"`
	}
	if err := json.Unmarshal(data, &wire); err != nil {
		return err
	}
	if wire.OrderID != "" {
		d.OrderID = string(wire.OrderID)
	} else {
		d.OrderID = string(wire.OrderIDCamel)
	}
	return nil
}

// CancelAllOrders cancels all open orders across all symbols.
func (c *Client) CancelAllOrders(ctx context.Context) (*CancelAllResult, error) {
	var resp CancelAllResult
	err := c.doPrivateRequest(ctx, "/v1/order/cancel/all", map[string]any{}, &resp)
	if err != nil {
		return nil, err
	}
	return &resp, nil
}
