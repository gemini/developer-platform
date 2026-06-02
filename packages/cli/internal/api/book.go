package api

import (
	"context"
	"net/url"
	"strconv"
)

// OrderBookEntry represents a single price level in the order book.
type OrderBookEntry struct {
	Price     string `json:"price"`
	Amount    string `json:"amount"`
	Timestamp string `json:"timestamp"`
}

// OrderBook contains bid and ask orders for a symbol.
type OrderBook struct {
	Bids []OrderBookEntry `json:"bids"`
	Asks []OrderBookEntry `json:"asks"`
}

// GetOrderBook retrieves the order book for a symbol.
func (c *Client) GetOrderBook(ctx context.Context, symbol string, limitBids, limitAsks int) (*OrderBook, error) {
	query := url.Values{}
	if limitBids > 0 {
		query.Set("limit_bids", strconv.Itoa(limitBids))
	}
	if limitAsks > 0 {
		query.Set("limit_asks", strconv.Itoa(limitAsks))
	}

	var book OrderBook
	err := c.doPublicRequest(ctx, "/v1/book/"+symbol, query, &book)
	if err != nil {
		return nil, err
	}
	return &book, nil
}
