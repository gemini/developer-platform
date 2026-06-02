package cmd

import (
	"context"
	"fmt"
	"time"

	"github.com/spf13/cobra"

	"github.com/gemini/developer-platform/packages/cli/internal/api"
	"github.com/gemini/developer-platform/packages/cli/internal/output"
)

var (
	klinesInterval  string
	klinesStartTime string
	klinesEndTime   string
	klinesLookback  string
	candlesLimit    int
)

var klinesCmd = &cobra.Command{
	Use:   "klines <symbol>",
	Short: "Get historical OHLCV data with time range",
	Long: `Fetch historical candlestick (OHLCV) data for a prediction market contract.

The symbol should be the instrument symbol (e.g., GEMI-OSCARBP26-OSBP26ONEB).
Use 'markets get <ticker>' to find instrument symbols for contracts.

Intervals: 1m, 5m, 15m, 30m, 1hr, 6hr, 1day

Examples:
  gemini-markets klines GEMI-OSCARBP26-OSBP26ONEB --interval 1day --lookback 7d
  gemini-markets klines GEMI-BTC2602252200-HI65000 --interval 1hr --lookback 24h
  gemini-markets klines GEMI-SOTUATT2026-IOMAR --start 2024-02-01 --end 2024-02-25`,
	Args: cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		cfg, err := loadConfigWithFallback(cmd)
		if err != nil {
			return handleCommandError(err)
		}
		client, err := newAPIClient(cmd, cfg)
		if err != nil {
			return handleCommandError(err)
		}
		ctx := context.Background()

		symbol := args[0]

		var startTime, endTime int64

		if klinesLookback != "" {
			duration, err := parseDuration(klinesLookback)
			if err != nil {
				return fmt.Errorf("invalid lookback: %w", err)
			}
			endTime = time.Now().UnixMilli()
			startTime = endTime - duration.Milliseconds()
		} else {
			if klinesStartTime != "" {
				t, err := parseTime(klinesStartTime)
				if err != nil {
					return fmt.Errorf("invalid start time: %w", err)
				}
				startTime = t.UnixMilli()
			} else {
				startTime = time.Now().Add(-7 * 24 * time.Hour).UnixMilli()
			}

			if klinesEndTime != "" {
				t, err := parseTime(klinesEndTime)
				if err != nil {
					return fmt.Errorf("invalid end time: %w", err)
				}
				endTime = t.UnixMilli()
			} else {
				endTime = time.Now().UnixMilli()
			}
		}

		params := api.KlinesParams{
			Symbol:    symbol,
			Interval:  klinesInterval,
			StartTime: startTime,
			EndTime:   endTime,
		}

		candles, err := client.GetKlines(ctx, params)
		if err != nil {
			return handleAPIError(err)
		}

		if IsTableOutput() {
			return printCandlesTable(candles)
		}
		return output.PrintJSON(candles)
	},
}

var candlesCmd = &cobra.Command{
	Use:   "candles <symbol>",
	Short: "Get recent OHLCV candles",
	Long: `Fetch recent candlestick (OHLCV) data for a prediction market contract.

Simpler than klines - just specify symbol and timeframe to get recent candles.

Timeframes: 1m, 5m, 15m, 30m, 1hr, 6hr, 1day

Examples:
  gemini-markets candles GEMI-OSCARBP26-OSBP26ONEB --timeframe 1day
  gemini-markets candles GEMI-BTC2602252200-HI65000 --timeframe 1hr --limit 24`,
	Args: cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		cfg, err := loadConfigWithFallback(cmd)
		if err != nil {
			return handleCommandError(err)
		}
		client, err := newAPIClient(cmd, cfg)
		if err != nil {
			return handleCommandError(err)
		}
		ctx := context.Background()

		symbol := args[0]
		timeFrame, _ := cmd.Flags().GetString("timeframe")

		candles, err := client.GetCandles(ctx, symbol, timeFrame, candlesLimit)
		if err != nil {
			return handleAPIError(err)
		}

		if IsTableOutput() {
			return printCandlesTable(candles)
		}
		return output.PrintJSON(candles)
	},
}

func init() {
	klinesCmd.Flags().StringVar(&klinesInterval, "interval", "1day", "candle interval: 1m, 5m, 15m, 30m, 1hr, 6hr, 1day")
	klinesCmd.Flags().StringVar(&klinesStartTime, "start", "", "start time (YYYY-MM-DD or RFC3339)")
	klinesCmd.Flags().StringVar(&klinesEndTime, "end", "", "end time (YYYY-MM-DD or RFC3339)")
	klinesCmd.Flags().StringVar(&klinesLookback, "lookback", "", "lookback period (e.g., 24h, 7d, 30d)")

	candlesCmd.Flags().String("timeframe", "1day", "candle timeframe: 1m, 5m, 15m, 30m, 1hr, 6hr, 1day")
	candlesCmd.Flags().IntVar(&candlesLimit, "limit", 0, "max number of candles to return")

	rootCmd.AddCommand(klinesCmd)
	rootCmd.AddCommand(candlesCmd)
}

func printCandlesTable(candles []api.Candle) error {
	if len(candles) == 0 {
		fmt.Println("No candle data")
		return nil
	}

	table := output.NewTableWriter("TIME", "OPEN", "HIGH", "LOW", "CLOSE", "VOLUME")

	for _, c := range candles {
		t := time.UnixMilli(c.Timestamp).Format("2006-01-02 15:04")
		table.AddRow(
			t,
			fmt.Sprintf("%.4f", c.Open),
			fmt.Sprintf("%.4f", c.High),
			fmt.Sprintf("%.4f", c.Low),
			fmt.Sprintf("%.4f", c.Close),
			fmt.Sprintf("%.0f", c.Volume),
		)
	}

	table.Render()
	return nil
}

func parseDuration(s string) (time.Duration, error) {
	if len(s) < 2 {
		return 0, fmt.Errorf("invalid duration format")
	}

	unit := s[len(s)-1]
	valueStr := s[:len(s)-1]

	var value int
	if _, err := fmt.Sscanf(valueStr, "%d", &value); err != nil {
		return 0, err
	}

	switch unit {
	case 'h':
		return time.Duration(value) * time.Hour, nil
	case 'd':
		return time.Duration(value) * 24 * time.Hour, nil
	case 'w':
		return time.Duration(value) * 7 * 24 * time.Hour, nil
	case 'm':
		return time.Duration(value) * time.Minute, nil
	default:
		return 0, fmt.Errorf("unknown duration unit: %c", unit)
	}
}

func parseTime(s string) (time.Time, error) {
	if t, err := time.Parse(time.RFC3339, s); err == nil {
		return t, nil
	}
	if t, err := time.Parse("2006-01-02", s); err == nil {
		return t, nil
	}
	return time.Time{}, fmt.Errorf("cannot parse time: %s", s)
}
