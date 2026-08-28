package services

import (
	"context"

	"github.com/gemini/gemini-go/generated/margin"
	"github.com/gemini/gemini-go/transport"
)

// MarginService provides access to margin trading and account margin information.
type MarginService struct {
	baseService
}

// NewMarginService creates a new MarginService.
func NewMarginService(client *transport.Client, baseURL string) *MarginService {
	return &MarginService{
		baseService: newBaseService(client, baseURL),
	}
}

// GetAccountSummary returns margin account summary and purchasing power.
func (s *MarginService) GetAccountSummary(ctx context.Context, req *margin.GetMarginAccountJSONBody) (*margin.MarginAccountSummary, error) {
	if req == nil {
		req = &margin.GetMarginAccountJSONBody{}
	}
	var res margin.MarginAccountSummary
	if err := s.post(ctx, "/v1/margin/account", req, &res); err != nil {
		return nil, err
	}
	return &res, nil
}

// GetInterestRates returns active margin interest rates across supported currencies.
func (s *MarginService) GetInterestRates(ctx context.Context, req *margin.GetMarginRatesJSONBody) (*margin.MarginRatesResponse, error) {
	if req == nil {
		req = &margin.GetMarginRatesJSONBody{}
	}
	var res margin.MarginRatesResponse
	if err := s.post(ctx, "/v1/margin/rates", req, &res); err != nil {
		return nil, err
	}
	return &res, nil
}

// PreviewOrder previews margin requirements and impact for a prospective order.
func (s *MarginService) PreviewOrder(ctx context.Context, req *margin.PreviewMarginOrderJSONBody) (*margin.MarginOrderPreview, error) {
	var res margin.MarginOrderPreview
	if err := s.post(ctx, "/v1/margin/order/preview", req, &res); err != nil {
		return nil, err
	}
	return &res, nil
}
