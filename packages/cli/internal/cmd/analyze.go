package cmd

import (
	"context"
	"fmt"

	"github.com/spf13/cobra"

	"github.com/gemini/developer-platform/packages/cli/internal/api"
	"github.com/gemini/developer-platform/packages/cli/internal/output"
)

var (
	analyzeQuantity float64
	analyzeLevels   int
)

var analyzeCmd = &cobra.Command{
	Use:   "analyze <symbol>",
	Short: "Analyze market depth and liquidity",
	Long: `Analyze order book depth, spread, and liquidity for market making.

Provides:
- Bid/ask spread and mid-price
- Liquidity depth at N levels
- Fill estimates for a given quantity
- Order book imbalance

Essential for market makers to assess:
- Current spread profitability
- Slippage on large orders
- Inventory management decisions

Examples:
  gemini-markets analyze GEMI-OSCARBP26-OSBP26ONEB
  gemini-markets analyze GEMI-OSCARBP26-OSBP26ONEB --quantity 500
  gemini-markets analyze GEMI-OSCARBP26-OSBP26ONEB --levels 20`,
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

		book, err := client.GetOrderBook(ctx, symbol, analyzeLevels, analyzeLevels)
		if err != nil {
			return handleAPIError(err)
		}

		spread := api.CalculateSpread(book)
		liquidity := api.CalculateLiquidity(book, analyzeLevels)

		var buyEstimate, sellEstimate *api.FillEstimate
		if analyzeQuantity > 0 {
			buyEstimate = api.EstimateFill(book, "buy", analyzeQuantity)
			sellEstimate = api.EstimateFill(book, "sell", analyzeQuantity)
		}

		result := map[string]any{
			"symbol":    symbol,
			"spread":    spread,
			"liquidity": liquidity,
		}
		if buyEstimate != nil {
			result["buyEstimate"] = buyEstimate
			result["sellEstimate"] = sellEstimate
		}

		if IsTableOutput() {
			return printAnalysis(symbol, spread, liquidity, buyEstimate, sellEstimate)
		}
		return output.PrintJSON(result)
	},
}

func init() {
	analyzeCmd.Flags().Float64Var(&analyzeQuantity, "quantity", 0, "quantity to estimate fill for")
	analyzeCmd.Flags().IntVar(&analyzeLevels, "levels", 10, "number of price levels to analyze")
	rootCmd.AddCommand(analyzeCmd)
}

func printAnalysis(symbol string, spread *api.SpreadInfo, liq *api.LiquidityInfo, buy, sell *api.FillEstimate) error {
	fmt.Printf("\nMarket Analysis: %s\n", symbol)
	fmt.Println("════════════════════════════════════════")

	if spread != nil {
		fmt.Println("\nSpread Analysis:")
		fmt.Printf("  Best Bid:    %.4f\n", spread.BidPrice)
		fmt.Printf("  Best Ask:    %.4f\n", spread.AskPrice)
		fmt.Printf("  Mid Price:   %.4f\n", spread.MidPrice)
		fmt.Printf("  Spread:      %.4f (%.2f bps)\n", spread.Spread, spread.SpreadBps)
	}

	if liq != nil {
		fmt.Println("\nLiquidity:")
		fmt.Printf("  Bid Side:    $%.2f\n", liq.BidLiquidity)
		fmt.Printf("  Ask Side:    $%.2f\n", liq.AskLiquidity)
		fmt.Printf("  Total:       $%.2f\n", liq.TotalLiquidity)
		imbalanceDir := "neutral"
		if liq.Imbalance > 0.1 {
			imbalanceDir = "bid heavy"
		} else if liq.Imbalance < -0.1 {
			imbalanceDir = "ask heavy"
		}
		fmt.Printf("  Imbalance:   %.2f%% (%s)\n", liq.Imbalance*100, imbalanceDir)
	}

	if buy != nil {
		fmt.Println("\nFill Estimates:")
		fmt.Printf("  BUY %.0f contracts:\n", buy.Filled+buy.Unfilled)
		fmt.Printf("    Avg Price:  %.4f\n", buy.AveragePrice)
		fmt.Printf("    Total Cost: $%.2f\n", buy.TotalCost)
		fmt.Printf("    Slippage:   %.4f (%.2f bps)\n", buy.Slippage, buy.SlippageBps)
		if buy.Unfilled > 0 {
			fmt.Printf("    Unfilled:   %.0f (insufficient liquidity)\n", buy.Unfilled)
		}
	}

	if sell != nil {
		fmt.Printf("\n  SELL %.0f contracts:\n", sell.Filled+sell.Unfilled)
		fmt.Printf("    Avg Price:  %.4f\n", sell.AveragePrice)
		fmt.Printf("    Total Cost: $%.2f\n", sell.TotalCost)
		fmt.Printf("    Slippage:   %.4f (%.2f bps)\n", sell.Slippage, sell.SlippageBps)
		if sell.Unfilled > 0 {
			fmt.Printf("    Unfilled:   %.0f (insufficient liquidity)\n", sell.Unfilled)
		}
	}

	fmt.Println()
	return nil
}
