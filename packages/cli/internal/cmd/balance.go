package cmd

import (
	"context"
	"fmt"

	"github.com/spf13/cobra"

	"github.com/gemini/developer-platform/packages/cli/internal/api"
	"github.com/gemini/developer-platform/packages/cli/internal/output"
)

var balanceCurrency string

var balanceCmd = &cobra.Command{
	Use:   "balance",
	Short: "Get account balances",
	Long: `Fetch your account balances across all currencies.

Requires authentication. Shows:
- Total amount held
- Available for trading
- Available for withdrawal

For prediction market trading, check your USD balance.

Examples:
  gemini-markets balance
  gemini-markets balance --currency USD
  gemini-markets balance -o table`,
	RunE: func(cmd *cobra.Command, args []string) error {
		rt, err := authenticatedRuntime(cmd)
		if err != nil {
			return handleCommandError(err)
		}
		ctx := context.Background()

		balances, err := rt.API.GetBalances(ctx)
		if err != nil {
			return handleAPIError(err)
		}

		if balanceCurrency != "" {
			filtered := make([]api.Balance, 0)
			for _, b := range balances {
				if b.Currency == balanceCurrency {
					filtered = append(filtered, b)
				}
			}
			balances = filtered
		}

		if IsTableOutput() {
			return printBalancesTable(balances)
		}
		return output.PrintJSON(balances)
	},
}

func init() {
	balanceCmd.Flags().StringVar(&balanceCurrency, "currency", "", "filter by currency (e.g., USD, BTC)")
	rootCmd.AddCommand(balanceCmd)
}

func printBalancesTable(balances []api.Balance) error {
	if len(balances) == 0 {
		fmt.Println("No balances found")
		return nil
	}

	table := output.NewTableWriter("CURRENCY", "AMOUNT", "AVAILABLE", "WITHDRAWABLE")
	for _, b := range balances {
		table.AddRow(b.Currency, b.Amount, b.Available, b.AvailableForWithdrawal)
	}
	table.Render()
	return nil
}
