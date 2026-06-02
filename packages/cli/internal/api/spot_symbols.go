package api

import (
	"context"
	"encoding/json"
)

// SpotSymbolDetails contains detailed information about a trading pair.
type SpotSymbolDetails struct {
	Symbol                string      `json:"symbol"`
	BaseCurrency          string      `json:"base_currency"`
	QuoteCurrency         string      `json:"quote_currency"`
	TickSize              json.Number `json:"tick_size"`
	QuoteIncrement        json.Number `json:"quote_increment"`
	MinOrderSize          string      `json:"min_order_size"`
	Status                string      `json:"status"`
	WrapEnabled           bool        `json:"wrap_enabled"`
	ProductType           string      `json:"product_type,omitempty"`
	ContractType          string      `json:"contract_type,omitempty"`
	ContractPriceCurrency string      `json:"contract_price_currency,omitempty"`
}

// ListSpotSymbols retrieves all tradeable spot symbols.
func (c *Client) ListSpotSymbols(ctx context.Context) ([]string, error) {
	var symbols []string
	err := c.doPublicRequest(ctx, "/v1/symbols", nil, &symbols)
	return symbols, err
}

// GetSpotSymbolDetails retrieves details for a specific spot symbol.
func (c *Client) GetSpotSymbolDetails(ctx context.Context, symbol string) (*SpotSymbolDetails, error) {
	var details SpotSymbolDetails
	err := c.doPublicRequest(ctx, "/v1/symbols/details/"+symbol, nil, &details)
	return &details, err
}
