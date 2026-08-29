package services

import (
	"context"
	"fmt"
	"net/url"

	"github.com/gemini/developer-platform/packages/sdk-go/generated/marketdata"
	"github.com/gemini/developer-platform/packages/sdk-go/transport"
)

// MarketDataService provides access to public market data endpoints.
type MarketDataService struct {
	baseService
}

func NewMarketDataService(client *transport.Client, baseURL string) *MarketDataService {
	return &MarketDataService{
		baseService: newBaseService(client, baseURL),
	}
}

// GetSymbols returns a list of all available trading pairs on Gemini.
func (s *MarketDataService) GetSymbols(ctx context.Context) ([]string, error) {
	var symbols []string
	if err := s.get(ctx, "/v1/symbols", &symbols); err != nil {
		return nil, err
	}
	return symbols, nil
}

// GetSymbolDetails returns detailed specifications (min tick size, min order size) for a symbol.
func (s *MarketDataService) GetSymbolDetails(ctx context.Context, symbol string) (*marketdata.SymbolDetails, error) {
	var res marketdata.SymbolDetails
	if err := s.get(ctx, "/v1/symbols/details/"+url.PathEscape(symbol), &res); err != nil {
		return nil, err
	}
	return &res, nil
}

// GetTicker returns the latest price, bid/ask, and 24h volume for a symbol.
func (s *MarketDataService) GetTicker(ctx context.Context, symbol string) (*marketdata.Ticker, error) {
	var ticker marketdata.Ticker
	if err := s.get(ctx, "/v1/pubticker/"+url.PathEscape(symbol), &ticker); err != nil {
		return nil, err
	}
	return &ticker, nil
}

// GetTickerV2 returns the extended V2 ticker information.
func (s *MarketDataService) GetTickerV2(ctx context.Context, symbol string) (*marketdata.TickerInfo, error) {
	var ticker marketdata.TickerInfo
	if err := s.get(ctx, "/v2/ticker/"+url.PathEscape(symbol), &ticker); err != nil {
		return nil, err
	}
	return &ticker, nil
}

// GetOrderBook returns the current L2 order book snapshot for a symbol.
// Pass limitBids or limitAsks < 0 to omit the parameter and use default depth.
func (s *MarketDataService) GetOrderBook(ctx context.Context, symbol string, limitBids, limitAsks int) (*marketdata.OrderBook, error) {
	path := "/v1/book/" + url.PathEscape(symbol)
	q := url.Values{}
	if limitBids >= 0 {
		q.Set("limit_bids", fmt.Sprintf("%d", limitBids))
	}
	if limitAsks >= 0 {
		q.Set("limit_asks", fmt.Sprintf("%d", limitAsks))
	}
	if len(q) > 0 {
		path = fmt.Sprintf("%s?%s", path, q.Encode())
	}
	var book marketdata.OrderBook
	if err := s.get(ctx, path, &book); err != nil {
		return nil, err
	}
	return &book, nil
}

// GetTrades returns recent historical trades for a symbol.
func (s *MarketDataService) GetTrades(ctx context.Context, symbol string, limitTrades int) ([]marketdata.Trade, error) {
	path := "/v1/trades/" + url.PathEscape(symbol)
	if limitTrades > 0 {
		path = fmt.Sprintf("%s?limit_trades=%d", path, limitTrades)
	}
	var trades []marketdata.Trade
	if err := s.get(ctx, path, &trades); err != nil {
		return nil, err
	}
	return trades, nil
}

// GetCandles returns OHLCV candlestick data for a symbol and timeframe.
func (s *MarketDataService) GetCandles(ctx context.Context, symbol string, timeframe string) (marketdata.CandleResponse, error) {
	var candles marketdata.CandleResponse
	if err := s.get(ctx, "/v2/candles/"+url.PathEscape(symbol)+"/"+url.PathEscape(timeframe), &candles); err != nil {
		return nil, err
	}
	return candles, nil
}
