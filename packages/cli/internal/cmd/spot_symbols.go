package cmd

import (
	"context"
	"fmt"

	"github.com/spf13/cobra"

	"github.com/gemini/developer-platform/packages/cli/internal/api"
	appmarkets "github.com/gemini/developer-platform/packages/cli/internal/app/markets"
	"github.com/gemini/developer-platform/packages/cli/internal/output"
)

var spotSymbolsCmd = &cobra.Command{
	Use:   "symbols",
	Short: "List tradeable spot pairs",
	Long: `List all available spot trading pairs on Gemini.

Examples:
  gemini-markets spot symbols
  gemini-markets spot symbols | grep BTC`,
	RunE: func(cmd *cobra.Command, args []string) error {
		cfg, err := loadConfigWithFallback(cmd)
		if err != nil {
			return handleCommandError(err)
		}
		client, err := newAPIClient(cmd, cfg)
		if err != nil {
			return handleCommandError(err)
		}
		svc := appmarkets.NewService(client)
		ctx := context.Background()

		symbols, err := svc.ListSpotSymbols(ctx)
		if err != nil {
			return handleAPIError(err)
		}

		if IsTableOutput() {
			table := output.NewTableWriter("SYMBOL")
			for _, s := range symbols {
				table.AddRow(s)
			}
			table.Render()
			return nil
		}
		return output.PrintJSON(symbols)
	},
}

var spotSymbolCmd = &cobra.Command{
	Use:   "symbol <pair>",
	Short: "Get symbol details",
	Long: `Get detailed information about a specific trading pair.

Returns tick size, minimum order size, and other trading parameters.

Examples:
  gemini-markets spot symbol btcusd
  gemini-markets spot symbol ethusd -o table`,
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
		svc := appmarkets.NewService(client)
		ctx := context.Background()

		details, err := svc.GetSpotSymbolDetails(ctx, args[0])
		if err != nil {
			return handleAPIError(err)
		}

		if IsTableOutput() {
			return printSpotSymbolDetails(details)
		}
		return output.PrintJSON(details)
	},
}

func init() {
	spotCmd.AddCommand(spotSymbolsCmd)
	spotCmd.AddCommand(spotSymbolCmd)
}

func printSpotSymbolDetails(d *api.SpotSymbolDetails) error {
	fmt.Println()
	fmt.Printf("Symbol:         %s\n", d.Symbol)
	fmt.Printf("Base:           %s\n", d.BaseCurrency)
	fmt.Printf("Quote:          %s\n", d.QuoteCurrency)
	fmt.Printf("Status:         %s\n", d.Status)
	fmt.Printf("Tick Size:      %s\n", d.TickSize)
	fmt.Printf("Quote Incr:     %s\n", d.QuoteIncrement)
	fmt.Printf("Min Order:      %s\n", d.MinOrderSize)
	if d.ProductType != "" {
		fmt.Printf("Product Type:   %s\n", d.ProductType)
	}
	fmt.Println()
	return nil
}
