package api

import (
	"context"
	"net/url"
	"strconv"
)

// Market represents a prediction market with its contracts and metadata.
type Market struct {
	Ticker     string     `json:"ticker"`
	Title      string     `json:"title"`
	Status     string     `json:"status"`
	Category   string     `json:"category"`
	Type       string     `json:"type"`
	Volume24h  string     `json:"volume24h,omitempty"`
	Volume     string     `json:"volume,omitempty"`
	Liquidity  string     `json:"liquidity,omitempty"`
	ExpiryDate string     `json:"expiryDate,omitempty"`
	Contracts  []Contract `json:"contracts,omitempty"`
}

// Contract represents a tradeable contract within a prediction market.
type Contract struct {
	ID               string         `json:"id"`
	InstrumentSymbol string         `json:"instrumentSymbol,omitempty"`
	Ticker           string         `json:"ticker,omitempty"`
	Label            string         `json:"label"`
	Status           string         `json:"status"`
	Prices           ContractPrices `json:"prices"`
}

// ContractPrices contains buy and sell prices for a contract.
type ContractPrices struct {
	Buy  OutcomePrices `json:"buy"`
	Sell OutcomePrices `json:"sell"`
}

// OutcomePrices contains prices for yes and no outcomes.
type OutcomePrices struct {
	Yes string `json:"yes"`
	No  string `json:"no"`
}

// MarketsResponse contains a list of markets with pagination.
type MarketsResponse struct {
	Data       []Market   `json:"data"`
	Pagination Pagination `json:"pagination"`
}

// Pagination contains pagination metadata.
type Pagination struct {
	Total  int `json:"total"`
	Limit  int `json:"limit"`
	Offset int `json:"offset"`
}

// CategoriesResponse contains a list of market categories.
type CategoriesResponse struct {
	Categories []string `json:"categories"`
}

// ListMarketsParams contains filter parameters for listing markets.
type ListMarketsParams struct {
	Status   []string
	Category []string
	Search   string
	Limit    int
	Offset   int
	Sort     string
}

// ListMarkets retrieves a list of prediction markets.
func (c *Client) ListMarkets(ctx context.Context, params *ListMarketsParams) (*MarketsResponse, error) {
	query := url.Values{}

	for _, s := range params.Status {
		query.Add("status", s)
	}
	for _, cat := range params.Category {
		query.Add("category", cat)
	}
	if params.Search != "" {
		query.Set("search", params.Search)
	}
	if params.Limit > 0 {
		query.Set("limit", strconv.Itoa(params.Limit))
	}
	if params.Offset > 0 {
		query.Set("offset", strconv.Itoa(params.Offset))
	}
	if params.Sort != "" {
		query.Set("sort", params.Sort)
	}

	var resp MarketsResponse
	err := c.doPublicRequest(ctx, "/v1/prediction-markets/events", query, &resp)
	return &resp, err
}

// GetMarket retrieves details for a specific prediction market.
func (c *Client) GetMarket(ctx context.Context, eventTicker string) (*Market, error) {
	var market Market
	err := c.doPublicRequest(ctx, "/v1/prediction-markets/events/"+eventTicker, nil, &market)
	return &market, err
}

// ListCategories retrieves all available market categories.
func (c *Client) ListCategories(ctx context.Context, status []string) (*CategoriesResponse, error) {
	query := url.Values{}
	for _, s := range status {
		query.Add("status", s)
	}

	var resp CategoriesResponse
	err := c.doPublicRequest(ctx, "/v1/prediction-markets/categories", query, &resp)
	return &resp, err
}

// ListPredictSymbols retrieves all tradeable prediction market symbols.
func (c *Client) ListPredictSymbols(ctx context.Context) ([]string, error) {
	var symbols []string
	err := c.doPublicRequest(ctx, "/v1/prediction-markets/symbols", nil, &symbols)
	return symbols, err
}

// ListNewlyListedMarkets retrieves markets created in the last 24 hours.
func (c *Client) ListNewlyListedMarkets(ctx context.Context, category []string, limit, offset int) (*MarketsResponse, error) {
	query := url.Values{}
	for _, cat := range category {
		query.Add("category", cat)
	}
	if limit > 0 {
		query.Set("limit", strconv.Itoa(limit))
	}
	if offset > 0 {
		query.Set("offset", strconv.Itoa(offset))
	}

	var resp MarketsResponse
	err := c.doPublicRequest(ctx, "/v1/prediction-markets/events/newly-listed", query, &resp)
	return &resp, err
}

// ListRecentlySettledMarkets retrieves markets settled in the last 24 hours.
func (c *Client) ListRecentlySettledMarkets(ctx context.Context, category []string, limit, offset int) (*MarketsResponse, error) {
	query := url.Values{}
	for _, cat := range category {
		query.Add("category", cat)
	}
	if limit > 0 {
		query.Set("limit", strconv.Itoa(limit))
	}
	if offset > 0 {
		query.Set("offset", strconv.Itoa(offset))
	}

	var resp MarketsResponse
	err := c.doPublicRequest(ctx, "/v1/prediction-markets/events/recently-settled", query, &resp)
	return &resp, err
}

// ListUpcomingMarkets retrieves pre-launch approved markets.
func (c *Client) ListUpcomingMarkets(ctx context.Context, category []string, limit, offset int) (*MarketsResponse, error) {
	query := url.Values{}
	for _, cat := range category {
		query.Add("category", cat)
	}
	if limit > 0 {
		query.Set("limit", strconv.Itoa(limit))
	}
	if offset > 0 {
		query.Set("offset", strconv.Itoa(offset))
	}

	var resp MarketsResponse
	err := c.doPublicRequest(ctx, "/v1/prediction-markets/events/upcoming", query, &resp)
	return &resp, err
}
