package services

import (
	"context"

	"github.com/gemini/gemini-go/generated/predictions"
)

// PredictionOrderOperationResponse reports the result of a prediction-market
// order operation such as canceling an order.
type PredictionOrderOperationResponse struct {
	Result  string `json:"result,omitempty"`
	Message string `json:"message,omitempty"`
}

// PlaceOrderBatch submits up to 20 prediction-market orders in one request.
// Results preserve the request order and may contain a mix of accepted and
// rejected entries.
func (s *PredictionsService) PlaceOrderBatch(ctx context.Context, req *predictions.PlaceOrderBatchJSONRequestBody) (*predictions.PlaceOrderBatchResponse, error) {
	var res predictions.PlaceOrderBatchResponse
	if err := s.post(ctx, "/v1/prediction-markets/order/batch", req, &res); err != nil {
		return nil, err
	}
	return &res, nil
}

// CancelOrder cancels one prediction-market order.
func (s *PredictionsService) CancelOrder(ctx context.Context, req *predictions.CancelOrderJSONRequestBody) (*PredictionOrderOperationResponse, error) {
	var res PredictionOrderOperationResponse
	if err := s.post(ctx, "/v1/prediction-markets/order/cancel", req, &res); err != nil {
		return nil, err
	}
	return &res, nil
}

// CancelOrderBatch cancels up to 20 prediction-market orders in one request.
// Results preserve the request order and may contain a mix of successful and
// rejected entries.
func (s *PredictionsService) CancelOrderBatch(ctx context.Context, req *predictions.CancelOrderBatchJSONRequestBody) (*predictions.CancelOrderBatchResponse, error) {
	var res predictions.CancelOrderBatchResponse
	if err := s.post(ctx, "/v1/prediction-markets/order/batch/cancel", req, &res); err != nil {
		return nil, err
	}
	return &res, nil
}

// GetActiveOrders returns the authenticated account's active prediction-market
// orders, optionally filtered and paginated by the request body.
func (s *PredictionsService) GetActiveOrders(ctx context.Context, req *predictions.GetActiveOrdersJSONRequestBody) (*predictions.OrdersResponse, error) {
	var res predictions.OrdersResponse
	if err := s.post(ctx, "/v1/prediction-markets/orders/active", req, &res); err != nil {
		return nil, err
	}
	return &res, nil
}

// GetOrderHistory returns historical filled or cancelled prediction-market
// orders, optionally filtered by symbol, status, time range, and pagination.
func (s *PredictionsService) GetOrderHistory(ctx context.Context, req *predictions.GetOrderHistoryJSONRequestBody) (*predictions.OrdersResponse, error) {
	var res predictions.OrdersResponse
	if err := s.post(ctx, "/v1/prediction-markets/orders/history", req, &res); err != nil {
		return nil, err
	}
	return &res, nil
}
