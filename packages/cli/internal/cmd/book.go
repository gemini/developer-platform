package cmd

import (
	"context"
	"fmt"

	"github.com/spf13/cobra"

	"github.com/gemini/developer-platform/packages/cli/internal/api"
	"github.com/gemini/developer-platform/packages/cli/internal/output"
	internalschema "github.com/gemini/developer-platform/packages/cli/internal/schema"
)

var bookLimit int

var bookCmd = &cobra.Command{
	Use:   "book <symbol>",
	Short: "Get order book depth",
	Long: `Fetch the order book (bids and asks) for a prediction market contract.

Shows current buy and sell orders at each price level. Essential for:
- Understanding market liquidity
- Estimating fill prices for larger orders
- Building custom quote calculations

Examples:
  gemini-markets book GEMI-OSCARBP26-OSBP26ONEB
  gemini-markets book GEMI-OSCARBP26-OSBP26ONEB --limit 20
  gemini-markets book GEMI-OSCARBP26-OSBP26ONEB -o table`,
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

		book, err := client.GetOrderBook(ctx, symbol, bookLimit, bookLimit)
		if err != nil {
			return handleAPIError(err)
		}

		if IsTableOutput() {
			return printOrderBookTable(book)
		}
		return output.PrintJSON(book)
	},
}

func init() {
	internalschema.Register(&internalschema.CommandMeta{
		MCPName:     "gemini_book",
		Description: "Get order book depth for any symbol (spot or prediction).",
		Params: map[string]internalschema.ParamMeta{
			"symbol": {Type: internalschema.ParamString, Required: true, Description: "Symbol (e.g., BTCUSD or GEMI-OSCARBP26-...)", Example: "BTCUSD"},
			"limit":  {Type: internalschema.ParamString, Description: "Number of levels per side (default: 20)", Default: "20"},
		},
		Output: &internalschema.OutputMeta{Type: "object", Description: "Bids and asks arrays", Schema: "#/schemas/OrderBook"},
	})

	bookCmd.Flags().IntVar(&bookLimit, "limit", 10, "number of price levels to show")
	rootCmd.AddCommand(bookCmd)
}

func printOrderBookTable(book *api.OrderBook) error {
	fmt.Println("ASKS (Sell Orders)")
	askTable := output.NewTableWriter("PRICE", "AMOUNT")
	for i := len(book.Asks) - 1; i >= 0; i-- {
		ask := book.Asks[i]
		askTable.AddRow(ask.Price, ask.Amount)
	}
	askTable.Render()

	fmt.Println()
	fmt.Println("BIDS (Buy Orders)")
	bidTable := output.NewTableWriter("PRICE", "AMOUNT")
	for _, bid := range book.Bids {
		bidTable.AddRow(bid.Price, bid.Amount)
	}
	bidTable.Render()

	return nil
}
