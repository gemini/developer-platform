package services

import (
	"context"

	"github.com/gemini/gemini-go/generated/clearing"
	"github.com/gemini/gemini-go/transport"
)

// ClearingService provides access to off-exchange Gemini Clearing operations.
type ClearingService struct {
	baseService
}

// ClearingOperationResponse reports the result of a clearing cancellation or
// confirmation request.
type ClearingOperationResponse struct {
	Result  string `json:"result,omitempty"`
	Details string `json:"details,omitempty"`
}

// NewClearingService creates a new ClearingService.
func NewClearingService(client *transport.Client, baseURL string) *ClearingService {
	return &ClearingService{
		baseService: newBaseService(client, baseURL),
	}
}

// NewClearingOrder creates a new off-exchange bilateral clearing settlement.
func (s *ClearingService) NewClearingOrder(ctx context.Context, req *clearing.CreateNewClearingOrderJSONBody) (*clearing.ClearingOrder, error) {
	var res clearing.ClearingOrder
	if err := s.post(ctx, "/v1/clearing/new", req, &res); err != nil {
		return nil, err
	}
	return &res, nil
}

// GetClearingOrder returns the current status and details of a clearing order.
func (s *ClearingService) GetClearingOrder(ctx context.Context, req *clearing.GetClearingOrderJSONBody) (*clearing.ClearingOrder, error) {
	var res clearing.ClearingOrder
	if err := s.post(ctx, "/v1/clearing/status", req, &res); err != nil {
		return nil, err
	}
	return &res, nil
}

// CancelClearingOrder cancels an unconfirmed clearing order.
func (s *ClearingService) CancelClearingOrder(ctx context.Context, req *clearing.CancelClearingOrderJSONBody) (*ClearingOperationResponse, error) {
	var res ClearingOperationResponse
	if err := s.post(ctx, "/v1/clearing/cancel", req, &res); err != nil {
		return nil, err
	}
	return &res, nil
}

// ConfirmClearingOrder confirms acceptance of a broker or counterparty clearing order.
func (s *ClearingService) ConfirmClearingOrder(ctx context.Context, req *clearing.ConfirmClearingOrderJSONBody) (*ClearingOperationResponse, error) {
	var res ClearingOperationResponse
	if err := s.post(ctx, "/v1/clearing/confirm", req, &res); err != nil {
		return nil, err
	}
	return &res, nil
}
