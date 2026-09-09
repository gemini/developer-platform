package cli

import (
	"encoding/json"
	"fmt"
	"strconv"
	"strings"

	"github.com/gemini/developer-platform/packages/gemini-markets-cli/internal/output"
	"github.com/gemini/developer-platform/packages/sdk-go/generated/marketdata"
	"github.com/spf13/cobra"
)

func newMarketsCommand(factory PublicServiceFactory) *cobra.Command {
	command := &cobra.Command{
		Use:     "markets",
		Aliases: []string{"market"},
		Short:   "Public spot and derivatives market data",
		Args:    cobra.NoArgs,
	}
	command.AddCommand(
		newMarketSymbolsCommand(factory),
		newMarketTickerCommand(factory),
		newMarketBookCommand(factory),
		newMarketCandlesCommand(factory),
	)
	return command
}

func newMarketSymbolsCommand(factory PublicServiceFactory) *cobra.Command {
	return &cobra.Command{
		Use:     "symbols",
		Aliases: []string{"symbol"},
		Short:   "List available market symbols",
		Args:    cobra.NoArgs,
		RunE: func(cmd *cobra.Command, _ []string) error {
			return withPublicServices(cmd, factory, func(services PublicServices) error {
				if services.MarketData == nil {
					return fmt.Errorf("market data service is unavailable")
				}
				values, err := services.MarketData.GetSymbols(cmd.Context())
				if err != nil {
					return fmt.Errorf("list market symbols: %w", err)
				}
				return writePublicResult(cmd, values, tableForStrings("SYMBOL", values))
			})
		},
	}
}

func newMarketTickerCommand(factory PublicServiceFactory) *cobra.Command {
	return &cobra.Command{
		Use:     "ticker SYMBOL",
		Aliases: []string{"price"},
		Short:   "Show the latest ticker for a symbol",
		Args:    oneNonEmptyArgument("symbol"),
		RunE: func(cmd *cobra.Command, args []string) error {
			symbol := strings.TrimSpace(args[0])
			return withPublicServices(cmd, factory, func(services PublicServices) error {
				if services.MarketData == nil {
					return fmt.Errorf("market data service is unavailable")
				}
				ticker, err := services.MarketData.GetTicker(cmd.Context(), symbol)
				if err != nil {
					return fmt.Errorf("get ticker for %s: %w", symbol, err)
				}
				return writePublicResult(cmd, ticker, tickerTable(symbol, ticker))
			})
		},
	}
}

func newMarketBookCommand(factory PublicServiceFactory) *cobra.Command {
	var limitBids, limitAsks int
	command := &cobra.Command{
		Use:     "book SYMBOL",
		Aliases: []string{"order-book"},
		Short:   "Show the current order-book snapshot",
		Args:    oneNonEmptyArgument("symbol"),
		RunE: func(cmd *cobra.Command, args []string) error {
			if limitBids < -1 || limitAsks < -1 {
				return fmt.Errorf("book limits must be -1 (omit) or non-negative")
			}
			symbol := strings.TrimSpace(args[0])
			return withPublicServices(cmd, factory, func(services PublicServices) error {
				if services.MarketData == nil {
					return fmt.Errorf("market data service is unavailable")
				}
				book, err := services.MarketData.GetOrderBook(cmd.Context(), symbol, limitBids, limitAsks)
				if err != nil {
					return fmt.Errorf("get order book for %s: %w", symbol, err)
				}
				return writePublicResult(cmd, book, bookTable(book))
			})
		},
	}
	command.Flags().IntVar(&limitBids, "limit-bids", -1, "maximum bid levels (-1 omits the parameter)")
	command.Flags().IntVar(&limitAsks, "limit-asks", -1, "maximum ask levels (-1 omits the parameter)")
	return command
}

func newMarketCandlesCommand(factory PublicServiceFactory) *cobra.Command {
	command := &cobra.Command{
		Use:     "candles SYMBOL TIMEFRAME",
		Aliases: []string{"candle"},
		Short:   "Show OHLCV candles for a symbol",
		Args:    twoNonEmptyArguments("symbol", "timeframe"),
		RunE: func(cmd *cobra.Command, args []string) error {
			symbol, timeframe := strings.TrimSpace(args[0]), strings.TrimSpace(args[1])
			apiTimeframe, err := normalizeCandleTimeframe(timeframe)
			if err != nil {
				return err
			}
			return withPublicServices(cmd, factory, func(services PublicServices) error {
				if services.MarketData == nil {
					return fmt.Errorf("market data service is unavailable")
				}
				candles, err := services.MarketData.GetCandles(cmd.Context(), symbol, apiTimeframe)
				if err != nil {
					return fmt.Errorf("get candles for %s (%s): %w", symbol, timeframe, err)
				}
				return writePublicResult(cmd, candles, candlesTable(candles))
			})
		},
	}
	return command
}

func normalizeCandleTimeframe(timeframe string) (string, error) {
	switch strings.ToLower(strings.TrimSpace(timeframe)) {
	case "1m", "5m", "15m", "30m":
		return strings.ToLower(strings.TrimSpace(timeframe)), nil
	case "1h", "1hr":
		return "1hr", nil
	case "6h", "6hr":
		return "6hr", nil
	case "1d", "1day":
		return "1day", nil
	default:
		return "", fmt.Errorf("invalid timeframe %q (want 1m, 5m, 15m, 30m, 1h, 6h, or 1d)", timeframe)
	}
}

func writePublicResult(cmd *cobra.Command, value any, table output.TableData) error {
	format := Options(cmd).Format
	if format == output.JSON {
		return output.Write(cmd.OutOrStdout(), value, output.JSON)
	}
	return output.Write(cmd.OutOrStdout(), table, output.Table)
}

func oneNonEmptyArgument(name string) cobra.PositionalArgs {
	return func(cmd *cobra.Command, args []string) error {
		if err := cobra.ExactArgs(1)(cmd, args); err != nil {
			return err
		}
		if strings.TrimSpace(args[0]) == "" {
			return fmt.Errorf("%s is required", name)
		}
		return nil
	}
}

func twoNonEmptyArguments(first, second string) cobra.PositionalArgs {
	return func(cmd *cobra.Command, args []string) error {
		if err := cobra.ExactArgs(2)(cmd, args); err != nil {
			return err
		}
		if strings.TrimSpace(args[0]) == "" {
			return fmt.Errorf("%s is required", first)
		}
		if strings.TrimSpace(args[1]) == "" {
			return fmt.Errorf("%s is required", second)
		}
		return nil
	}
}

func tableForStrings(header string, values []string) output.TableData {
	rows := make([][]string, 0, len(values))
	for _, value := range values {
		rows = append(rows, []string{value})
	}
	return output.TableData{Headers: []string{header}, Rows: rows}
}

func tickerTable(symbol string, ticker *marketdata.Ticker) output.TableData {
	headers := []string{"SYMBOL", "BID", "ASK", "LAST", "PRICE_VOLUME", "QUANTITY_VOLUME", "VOLUME_TIMESTAMP"}
	if ticker == nil {
		return output.TableData{Headers: headers, Rows: [][]string{{symbol, "", "", "", "", "", ""}}}
	}
	row := []string{symbol, publicStringValue(ticker.Bid), publicStringValue(ticker.Ask), publicStringValue(ticker.Last)}
	if ticker.Volume != nil {
		row = append(row, publicStringValue(ticker.Volume.PriceSymbol), publicStringValue(ticker.Volume.QuantitySymbol), timestampValue(ticker.Volume.Timestamp))
	} else {
		row = append(row, "", "", "")
	}
	return output.TableData{Headers: headers, Rows: [][]string{row}}
}

func bookTable(book *marketdata.OrderBook) output.TableData {
	table := output.TableData{Headers: []string{"SIDE", "PRICE", "AMOUNT"}}
	if book == nil {
		return table
	}
	if book.Bids != nil {
		for _, level := range *book.Bids {
			table.Rows = append(table.Rows, []string{"BID", publicStringValue(level.Price), publicStringValue(level.Amount)})
		}
	}
	if book.Asks != nil {
		for _, level := range *book.Asks {
			table.Rows = append(table.Rows, []string{"ASK", publicStringValue(level.Price), publicStringValue(level.Amount)})
		}
	}
	return table
}

func candlesTable(candles marketdata.CandleResponse) output.TableData {
	table := output.TableData{Headers: []string{"TIMESTAMP", "OPEN", "HIGH", "LOW", "CLOSE", "VOLUME"}}
	for _, candle := range candles {
		row := make([]string, len(table.Headers))
		for i := range row {
			if i < len(candle) {
				row[i] = strconv.FormatFloat(candle[i], 'f', -1, 64)
			}
		}
		table.Rows = append(table.Rows, row)
	}
	return table
}

func publicStringValue(value *string) string {
	if value == nil {
		return ""
	}
	return *value
}

func timestampValue(value *marketdata.TimestampType) string {
	if value == nil {
		return ""
	}
	encoded, err := json.Marshal(value)
	if err != nil {
		return ""
	}
	return strings.Trim(string(encoded), "\"")
}
