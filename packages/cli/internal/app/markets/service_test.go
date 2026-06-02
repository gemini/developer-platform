package markets

import (
	"context"
	"testing"

	"github.com/gemini/developer-platform/packages/cli/internal/api"
)

type stubClient struct {
	listMarketsParams *api.ListMarketsParams
	listMarketsResp   *api.MarketsResponse
	listMarketsErr    error
	marketResp        *api.Market
	categoriesResp    *api.CategoriesResponse
	symbolsResp       []string
	spotSymbolsResp   []string
	spotDetailsResp   *api.SpotSymbolDetails
}

func (s *stubClient) ListMarkets(_ context.Context, params *api.ListMarketsParams) (*api.MarketsResponse, error) {
	s.listMarketsParams = params
	return s.listMarketsResp, s.listMarketsErr
}
func (s *stubClient) GetMarket(context.Context, string) (*api.Market, error) {
	return s.marketResp, nil
}
func (s *stubClient) ListCategories(context.Context, []string) (*api.CategoriesResponse, error) {
	return s.categoriesResp, nil
}
func (s *stubClient) ListPredictSymbols(context.Context) ([]string, error) {
	return s.symbolsResp, nil
}
func (s *stubClient) ListNewlyListedMarkets(context.Context, []string, int, int) (*api.MarketsResponse, error) {
	return s.listMarketsResp, nil
}
func (s *stubClient) ListRecentlySettledMarkets(context.Context, []string, int, int) (*api.MarketsResponse, error) {
	return s.listMarketsResp, nil
}
func (s *stubClient) ListUpcomingMarkets(context.Context, []string, int, int) (*api.MarketsResponse, error) {
	return s.listMarketsResp, nil
}
func (s *stubClient) ListSpotSymbols(context.Context) ([]string, error) {
	return s.spotSymbolsResp, nil
}
func (s *stubClient) GetSpotSymbolDetails(context.Context, string) (*api.SpotSymbolDetails, error) {
	return s.spotDetailsResp, nil
}

func TestSearchPredictMarketsForcesActiveStatus(t *testing.T) {
	client := &stubClient{listMarketsResp: &api.MarketsResponse{}}
	svc := NewService(client)

	_, err := svc.SearchPredictMarkets(context.Background(), "BTC", 20, 5)
	if err != nil {
		t.Fatalf("SearchPredictMarkets() error = %v", err)
	}
	if client.listMarketsParams == nil {
		t.Fatal("expected ListMarkets to be called")
	}
	if client.listMarketsParams.Search != "BTC" {
		t.Fatalf("Search = %q, want BTC", client.listMarketsParams.Search)
	}
	if len(client.listMarketsParams.Status) != 1 || client.listMarketsParams.Status[0] != "active" {
		t.Fatalf("Status = %#v, want [active]", client.listMarketsParams.Status)
	}
}

func TestSpotSymbolDelegation(t *testing.T) {
	client := &stubClient{spotDetailsResp: &api.SpotSymbolDetails{Symbol: "btcusd"}}
	svc := NewService(client)

	resp, err := svc.GetSpotSymbolDetails(context.Background(), "btcusd")
	if err != nil {
		t.Fatalf("GetSpotSymbolDetails() error = %v", err)
	}
	if resp.Symbol != "btcusd" {
		t.Fatalf("Symbol = %q, want btcusd", resp.Symbol)
	}
}
