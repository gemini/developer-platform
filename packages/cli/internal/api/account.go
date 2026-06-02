package api

import (
	"context"
)

// Balance represents an account balance for a specific currency.
type Balance struct {
	Currency               string `json:"currency"`
	Amount                 string `json:"amount"`
	Available              string `json:"available"`
	AvailableForWithdrawal string `json:"availableForWithdrawal"`
}

// GetBalances retrieves all account balances.
func (c *Client) GetBalances(ctx context.Context) ([]Balance, error) {
	var balances []Balance
	err := c.doPrivateRequest(ctx, "/v1/balances", map[string]any{}, &balances)
	return balances, err
}
