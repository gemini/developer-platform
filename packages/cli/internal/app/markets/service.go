package markets

import (
	"context"

	"github.com/gemini/developer-platform/packages/cli/internal/api"
)

type Client interface {
	ListMarkets(context.Context, *api.ListMarketsParams) (*api.MarketsResponse, error)
	GetMarket(context.Context, string) (*api.Market, error)
	ListCategories(context.Context, []string) (*api.CategoriesResponse, error)
	ListPredictSymbols(context.Context) ([]string, error)
	ListNewlyListedMarkets(context.Context, []string, int, int) (*api.MarketsResponse, error)
	ListRecentlySettledMarkets(context.Context, []string, int, int) (*api.MarketsResponse, error)
	ListUpcomingMarkets(context.Context, []string, int, int) (*api.MarketsResponse, error)
	ListSpotSymbols(context.Context) ([]string, error)
	GetSpotSymbolDetails(context.Context, string) (*api.SpotSymbolDetails, error)
}

type Service struct {
	client Client
}

func NewService(client Client) *Service {
	return &Service{client: client}
}

func (s *Service) ListPredictMarkets(ctx context.Context, params api.ListMarketsParams) (*api.MarketsResponse, error) {
	return s.client.ListMarkets(ctx, &params)
}

func (s *Service) SearchPredictMarkets(ctx context.Context, query string, limit, offset int) (*api.MarketsResponse, error) {
	return s.client.ListMarkets(ctx, &api.ListMarketsParams{
		Search: query,
		Status: []string{"active"},
		Limit:  limit,
		Offset: offset,
	})
}

func (s *Service) GetPredictMarket(ctx context.Context, id string) (*api.Market, error) {
	return s.client.GetMarket(ctx, id)
}

func (s *Service) ListPredictCategories(ctx context.Context, status []string) (*api.CategoriesResponse, error) {
	return s.client.ListCategories(ctx, status)
}

func (s *Service) ListPredictSymbols(ctx context.Context) ([]string, error) {
	return s.client.ListPredictSymbols(ctx)
}

func (s *Service) ListNewlyListedPredictMarkets(ctx context.Context, category []string, limit, offset int) (*api.MarketsResponse, error) {
	return s.client.ListNewlyListedMarkets(ctx, category, limit, offset)
}

func (s *Service) ListRecentlySettledPredictMarkets(ctx context.Context, category []string, limit, offset int) (*api.MarketsResponse, error) {
	return s.client.ListRecentlySettledMarkets(ctx, category, limit, offset)
}

func (s *Service) ListUpcomingPredictMarkets(ctx context.Context, category []string, limit, offset int) (*api.MarketsResponse, error) {
	return s.client.ListUpcomingMarkets(ctx, category, limit, offset)
}

func (s *Service) ListSpotSymbols(ctx context.Context) ([]string, error) {
	return s.client.ListSpotSymbols(ctx)
}

func (s *Service) GetSpotSymbolDetails(ctx context.Context, symbol string) (*api.SpotSymbolDetails, error) {
	return s.client.GetSpotSymbolDetails(ctx, symbol)
}
