package services

import (
	"context"
	"fmt"
	"net/url"
	"strconv"

	"github.com/gemini/developer-platform/packages/sdk-go/generated/predictions"
	"github.com/gemini/developer-platform/packages/sdk-go/transport"
)

// PredictionsService provides access to prediction markets endpoints.
type PredictionsService struct {
	baseService
	public baseService
}

// NewPredictionsService creates a prediction markets service. Terms are
// enforced by Gemini; callers must explicitly accept them when the backend
// returns ErrAcceptTermsRequired.
func NewPredictionsService(client *transport.Client, baseURL string) *PredictionsService {
	return NewPredictionsServiceWithPublicClient(client, client, baseURL)
}

// NewPredictionsServiceWithPublicClient creates a prediction markets service
// with separate transports for public and authenticated operations. The
// high-level client uses this split so public market discovery remains
// available without credentials while private account and trading methods
// fail closed when authentication is absent.
func NewPredictionsServiceWithPublicClient(privateClient, publicClient *transport.Client, baseURL string) *PredictionsService {
	return &PredictionsService{
		baseService: newBaseService(privateClient, baseURL),
		public:      newBaseService(publicClient, baseURL),
	}
}

// AcceptTerms explicitly accepts the prediction markets terms of service.
func (s *PredictionsService) AcceptTerms(ctx context.Context) (*predictions.AcceptPredictionMarketsTermsResponse, error) {
	var res predictions.AcceptPredictionMarketsTermsResponse
	if err := s.post(ctx, "/v1/prediction-markets/terms/accept", struct{}{}, &res); err != nil {
		return nil, err
	}
	if !res.Success {
		return nil, fmt.Errorf("gemini predictions: accepting terms was not successful: %w", transport.ErrAcceptTermsRequired)
	}
	return &res, nil
}

// AcceptPredictionMarketsTerms is an alias for AcceptTerms matching the OpenAPI operation ID.
func (s *PredictionsService) AcceptPredictionMarketsTerms(ctx context.Context) (*predictions.AcceptPredictionMarketsTermsResponse, error) {
	return s.AcceptTerms(ctx)
}

// GetTerms fetches the terms of service agreement content.
func (s *PredictionsService) GetTerms(ctx context.Context) (*predictions.PredictionMarketsTerms, error) {
	var res predictions.PredictionMarketsTerms
	if err := s.public.get(ctx, "/v1/prediction-markets/terms", &res); err != nil {
		return nil, err
	}
	return &res, nil
}

// GetTermsStatus checks whether the account group has accepted the latest prediction terms.
func (s *PredictionsService) GetTermsStatus(ctx context.Context) (*predictions.PredictionMarketsTermsStatus, error) {
	var res predictions.PredictionMarketsTermsStatus
	if err := s.get(ctx, "/v1/prediction-markets/terms/status", &res); err != nil {
		return nil, err
	}
	return &res, nil
}

// GetCategories returns active prediction market categories.
func (s *PredictionsService) GetCategories(ctx context.Context) ([]string, error) {
	var res []string
	if err := s.public.get(ctx, "/v1/prediction-markets/categories", &res); err != nil {
		return nil, err
	}
	return res, nil
}

// GetEvents lists prediction market events with optional spec-defined filters.
func (s *PredictionsService) GetEvents(ctx context.Context, params *predictions.ListEventsParams) (*predictions.EventsResponse, error) {
	path := "/v1/prediction-markets/events"
	if q := listEventsQuery(params); len(q) > 0 {
		path = fmt.Sprintf("%s?%s", path, q.Encode())
	}

	var res predictions.EventsResponse
	if err := s.public.get(ctx, path, &res); err != nil {
		return nil, err
	}
	return &res, nil
}

// GetEvent returns details and contract listings for a specific event ticker.
func (s *PredictionsService) GetEvent(ctx context.Context, eventTicker string) (*predictions.Event, error) {
	var res predictions.Event
	if err := s.public.get(ctx, "/v1/prediction-markets/events/"+url.PathEscape(eventTicker), &res); err != nil {
		return nil, err
	}
	return &res, nil
}

func listEventsQuery(params *predictions.ListEventsParams) url.Values {
	q := url.Values{}
	if params == nil {
		return q
	}
	for _, status := range valueOrEmpty(params.Status) {
		q.Add("status", string(status))
	}
	for _, category := range valueOrEmpty(params.Category) {
		q.Add("category", category)
	}
	for _, sport := range valueOrEmpty(params.Sport) {
		q.Add("sport", string(sport))
	}
	for _, marketType := range valueOrEmpty(params.SportsMarketType) {
		q.Add("sports_market_type", string(marketType))
	}
	for _, subject := range valueOrEmpty(params.SportsMarketSubject) {
		q.Add("sports_market_subject", string(subject))
	}
	for _, scope := range valueOrEmpty(params.SportsMarketScope) {
		q.Add("sports_market_scope", string(scope))
	}
	for _, metric := range valueOrEmpty(params.SportsMarketMetric) {
		q.Add("sports_market_metric", string(metric))
	}
	if params.Search != nil {
		q.Set("search", *params.Search)
	}
	if params.Limit != nil {
		q.Set("limit", strconv.Itoa(*params.Limit))
	}
	if params.Offset != nil {
		q.Set("offset", strconv.Itoa(*params.Offset))
	}
	return q
}

func valueOrEmpty[T any](value *[]T) []T {
	if value == nil {
		return nil
	}
	return *value
}

// NewOrder places a typed order on a prediction market. If Gemini returns
// ErrAcceptTermsRequired, callers must explicitly call AcceptTerms and retry.
func (s *PredictionsService) NewOrder(ctx context.Context, orderReq *predictions.OrderRequest) (*predictions.OrderResponse, error) {
	var res predictions.OrderResponse
	if err := s.post(ctx, "/v1/prediction-markets/order", orderReq, &res); err != nil {
		return nil, err
	}
	return &res, nil
}
