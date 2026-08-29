package services

import (
	"context"
	"net/url"
	"strconv"

	"github.com/gemini/developer-platform/packages/sdk-go/generated/perpetuals"
	"github.com/gemini/developer-platform/packages/sdk-go/transport"
)

// PerpetualsService provides access to derivatives and perpetual contract trading.
type PerpetualsService struct {
	baseService
	public baseService
}

// NewPerpetualsService creates a new PerpetualsService.
func NewPerpetualsService(client *transport.Client, baseURL string) *PerpetualsService {
	return NewPerpetualsServiceWithPublicClient(client, client, baseURL)
}

// NewPerpetualsServiceWithPublicClient creates a derivatives service with
// separate transports for public funding metadata and authenticated funding
// payment history.
func NewPerpetualsServiceWithPublicClient(privateClient, publicClient *transport.Client, baseURL string) *PerpetualsService {
	return &PerpetualsService{
		baseService: newBaseService(privateClient, baseURL),
		public:      newBaseService(publicClient, baseURL),
	}
}

// GetFundingAmount returns current and estimated funding amount for a perpetual contract.
func (s *PerpetualsService) GetFundingAmount(ctx context.Context, symbol string) (*perpetuals.FundingAmountResponse, error) {
	var res perpetuals.FundingAmountResponse
	if err := s.public.get(ctx, "/v1/fundingamount/"+url.PathEscape(symbol), &res); err != nil {
		return nil, err
	}
	return &res, nil
}

// GetNextFundingTimestamp returns the timestamp for the next funding period for a perpetual contract.
func (s *PerpetualsService) GetNextFundingTimestamp(ctx context.Context, symbol string) (int64, error) {
	var res int64
	if err := s.public.get(ctx, "/v1/nextfundingtimestamp/"+url.PathEscape(symbol), &res); err != nil {
		return 0, err
	}
	return res, nil
}

// GetFundingPayments returns funding payment records, optionally filtered by
// millisecond timestamps. It uses the documented perpetuals endpoint.
func (s *PerpetualsService) GetFundingPayments(ctx context.Context, req *perpetuals.ListFundingPaymentsJSONBody, since, to *int64) ([]perpetuals.FundingPayment, error) {
	if req == nil {
		req = &perpetuals.ListFundingPaymentsJSONBody{}
	}
	path := "/v1/perpetuals/fundingPayment"
	query := url.Values{}
	if since != nil {
		query.Set("since", strconv.FormatInt(*since, 10))
	}
	if to != nil {
		query.Set("to", strconv.FormatInt(*to, 10))
	}
	if encoded := query.Encode(); encoded != "" {
		path += "?" + encoded
	}
	var res []perpetuals.FundingPayment
	if err := s.post(ctx, path, req, &res); err != nil {
		return nil, err
	}
	return res, nil
}
