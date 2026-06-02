package cmd

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/spf13/cobra"

	"github.com/gemini/developer-platform/packages/cli/internal/api"
	"github.com/gemini/developer-platform/packages/cli/internal/output"
)

var (
	spotTradesSymbol  string
	spotTradesLimit   int
	spotTradesAccount string
)

var spotTradesCmd = &cobra.Command{
	Use:   "trades",
	Short: "List your spot trade history",
	Long: `List your executed spot trades.

Examples:
  gemini-markets spot trades
  gemini-markets spot trades --symbol btcusd
  gemini-markets spot trades --limit 100`,
	RunE: func(cmd *cobra.Command, args []string) error {
		cfg := requireAuth(cmd)
		client, err := newAPIClient(cmd, cfg)
		if err != nil {
			return handleCommandError(err)
		}
		ctx := context.Background()

		params := api.ListSpotTradesParams{
			Symbol:      spotTradesSymbol,
			LimitTrades: spotTradesLimit,
			Account:     spotTradesAccount,
		}

		trades, err := client.ListSpotTrades(ctx, params)
		if err != nil {
			return handleAPIError(err)
		}

		if IsTableOutput() {
			return printSpotTradesTable(trades)
		}
		return output.PrintJSON(trades)
	},
}

func init() {
	spotTradesCmd.Flags().StringVar(&spotTradesSymbol, "symbol", "", "filter by trading pair")
	spotTradesCmd.Flags().IntVar(&spotTradesLimit, "limit", 50, "max results")
	spotTradesCmd.Flags().StringVar(&spotTradesAccount, "account", "", "account name (optional)")

	spotCmd.AddCommand(spotTradesCmd)
}

func printSpotTradesTable(trades []api.SpotTrade) error {
	if len(trades) == 0 {
		fmt.Println("No trades found")
		return nil
	}

	table := output.NewTableWriter("TRADE ID", "SYMBOL", "TYPE", "PRICE", "AMOUNT", "FEE", "TIME")

	for i := range trades {
		t := &trades[i]
		symbol := t.Symbol
		if symbol == "" {
			symbol = "-"
		}
		ts := time.UnixMilli(t.TimestampMs).Format("2006-01-02 15:04:05")
		fee := fmt.Sprintf("%s %s", t.FeeAmount, t.FeeCurrency)
		table.AddRow(
			fmt.Sprintf("%d", t.TID),
			strings.ToUpper(symbol),
			strings.ToUpper(t.Type),
			t.Price,
			t.Amount,
			fee,
			ts,
		)
	}

	table.Render()
	return nil
}
