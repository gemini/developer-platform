package cmd

import (
	"context"
	"fmt"
	"strings"

	"github.com/spf13/cobra"

	"github.com/gemini/developer-platform/packages/cli/internal/api"
	"github.com/gemini/developer-platform/packages/cli/internal/output"
	internalschema "github.com/gemini/developer-platform/packages/cli/internal/schema"
)

var (
	predictPositionsEventTicker string
	predictPositionsLimit       int
	predictPositionsOffset      int
)

var predictPositionsCmd = &cobra.Command{
	Use:   "positions",
	Short: "View your prediction market positions",
	Long:  "Commands for viewing prediction market positions.",
}

var predictPositionsListCmd = &cobra.Command{
	Use:   "list",
	Short: "List open positions",
	Long: `List your open prediction market positions.

Examples:
  gemini-markets predict positions list
  gemini-markets predict positions list --event NBA-LAL-BOS-2024`,
	RunE: func(cmd *cobra.Command, args []string) error {
		cfg := requireAuth(cmd)
		client, err := newAPIClient(cmd, cfg)
		if err != nil {
			return handleCommandError(err)
		}
		ctx := context.Background()

		params := api.ListPositionsParams{
			EventTicker: predictPositionsEventTicker,
			Limit:       predictPositionsLimit,
			Offset:      predictPositionsOffset,
		}

		positions, err := client.ListPositions(ctx, params)
		if err != nil {
			return handleAPIError(err)
		}

		if IsTableOutput() {
			return printPredictPositionsTable(positions, false)
		}
		return output.PrintJSON(positions)
	},
}

var predictPositionsSettledCmd = &cobra.Command{
	Use:   "settled",
	Short: "List settled positions",
	Long: `List your settled prediction market positions.

Examples:
  gemini-markets predict positions settled`,
	RunE: func(cmd *cobra.Command, args []string) error {
		cfg := requireAuth(cmd)
		client, err := newAPIClient(cmd, cfg)
		if err != nil {
			return handleCommandError(err)
		}
		ctx := context.Background()

		params := api.ListPositionsParams{
			Limit:  predictPositionsLimit,
			Offset: predictPositionsOffset,
		}

		positions, err := client.ListSettledPositions(ctx, params)
		if err != nil {
			return handleAPIError(err)
		}

		if IsTableOutput() {
			return printPredictPositionsTable(positions, true)
		}
		return output.PrintJSON(positions)
	},
}

func init() {
	internalschema.Register(&internalschema.CommandMeta{
		MCPName:     "gemini_predict_positions_list",
		Description: "List all open prediction market positions with P&L.",
		Params:      map[string]internalschema.ParamMeta{},
		Output:      &internalschema.OutputMeta{Type: "array", Description: "Open positions with avgPrice, pnl", Schema: "#/schemas/Position"},
	})
	internalschema.Register(&internalschema.CommandMeta{
		MCPName:     "gemini_predict_positions_settled",
		Description: "List settled prediction market positions (resolved markets).",
		Params: map[string]internalschema.ParamMeta{
			"limit":  {Type: internalschema.ParamString, Description: "Max results (default: 50)", Default: "50"},
			"offset": {Type: internalschema.ParamString, Description: "Pagination offset", Default: "0"},
		},
		Output: &internalschema.OutputMeta{Type: "array", Description: "Settled positions with final P&L", Schema: "#/schemas/Position"},
	})

	predictPositionsListCmd.Flags().StringVar(&predictPositionsEventTicker, "event", "", "filter by event ticker")
	predictPositionsListCmd.Flags().IntVar(&predictPositionsLimit, "limit", 50, "max results")
	predictPositionsListCmd.Flags().IntVar(&predictPositionsOffset, "offset", 0, "pagination offset")

	predictPositionsSettledCmd.Flags().IntVar(&predictPositionsLimit, "limit", 50, "max results")
	predictPositionsSettledCmd.Flags().IntVar(&predictPositionsOffset, "offset", 0, "pagination offset")

	predictPositionsCmd.AddCommand(predictPositionsListCmd)
	predictPositionsCmd.AddCommand(predictPositionsSettledCmd)

	predictCmd.AddCommand(predictPositionsCmd)
}

func printPredictPositionsTable(resp *api.PositionsResponse, settled bool) error {
	if len(resp.Data) == 0 {
		if settled {
			fmt.Println("No settled positions")
		} else {
			fmt.Println("No open positions")
		}
		return nil
	}

	var table *output.TableWriter
	if settled {
		table = output.NewTableWriter("CONTRACT", "SHARES", "COST", "PAYOUT", "RETURN")
	} else {
		table = output.NewTableWriter("CONTRACT", "SHARES", "AVG PRICE", "VALUE", "P&L")
	}

	for i := range resp.Data {
		p := &resp.Data[i]
		if settled {
			table.AddRow(
				p.ContractID,
				p.Shares,
				formatPredictMoney(p.Amount),
				formatPredictMoney(p.Payout),
				formatPredictReturn(p.TotalReturn, p.TotalReturnPercentage),
			)
		} else {
			table.AddRow(
				p.ContractID,
				p.Shares,
				formatPredictMoney(p.AvgPrice),
				formatPredictMoney(p.CurrentMarketValue),
				formatPredictPnL(p.PnL),
			)
		}
	}

	table.Render()
	return nil
}

func formatPredictMoney(s string) string {
	if s == "" {
		return "-"
	}
	return "$" + s
}

func formatPredictPnL(s string) string {
	if s == "" {
		return "-"
	}
	if strings.HasPrefix(s, "-") {
		return "-$" + s[1:]
	}
	return "+$" + s
}

func formatPredictReturn(amount, percent string) string {
	if amount == "" {
		return "-"
	}
	result := formatPredictPnL(amount)
	if percent != "" {
		result += " (" + percent + ")"
	}
	return result
}
