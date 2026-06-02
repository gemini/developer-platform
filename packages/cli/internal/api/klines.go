package api

import (
	"context"
	"net/url"
	"strconv"
	"strings"
)

// Candle represents an OHLCV candlestick data point.
type Candle struct {
	Timestamp int64   `json:"timestamp"`
	Open      float64 `json:"open"`
	High      float64 `json:"high"`
	Low       float64 `json:"low"`
	Close     float64 `json:"close"`
	Volume    float64 `json:"volume"`
}

// KlinesParams contains parameters for requesting historical candlestick data.
type KlinesParams struct {
	Symbol    string
	Interval  string
	StartTime int64
	EndTime   int64
}

// GetKlines retrieves historical candlestick data for a symbol.
func (c *Client) GetKlines(ctx context.Context, params KlinesParams) ([]Candle, error) {
	query := url.Values{}
	query.Set("symbol", strings.ToLower(params.Symbol))
	query.Set("interval", params.Interval)
	query.Set("startTime", strconv.FormatInt(params.StartTime, 10))
	query.Set("endTime", strconv.FormatInt(params.EndTime, 10))

	var rawCandles [][]float64
	err := c.doPublicRequest(ctx, "/v2/klines", query, &rawCandles)
	if err != nil {
		return nil, err
	}

	return parseCandles(rawCandles), nil
}

// GetCandles retrieves recent candlestick data for a symbol.
func (c *Client) GetCandles(ctx context.Context, symbol, timeFrame string, limit int) ([]Candle, error) {
	path := "/v2/candles/" + strings.ToLower(symbol) + "/" + timeFrame

	var query url.Values
	if limit > 0 {
		query = url.Values{}
		query.Set("limit", strconv.Itoa(limit))
	}

	var rawCandles [][]float64
	err := c.doPublicRequest(ctx, path, query, &rawCandles)
	if err != nil {
		return nil, err
	}

	return parseCandles(rawCandles), nil
}

func parseCandles(raw [][]float64) []Candle {
	candles := make([]Candle, 0, len(raw))
	for _, c := range raw {
		if len(c) >= 6 {
			candles = append(candles, Candle{
				Timestamp: int64(c[0]),
				Open:      c[1],
				High:      c[2],
				Low:       c[3],
				Close:     c[4],
				Volume:    c[5],
			})
		}
	}
	return candles
}
