package cmd

import (
	"context"
	"fmt"

	"github.com/spf13/cobra"

	"github.com/gemini/developer-platform/packages/cli/internal/api"
	"github.com/gemini/developer-platform/packages/cli/internal/output"
)

var spotFeesCmd = &cobra.Command{
	Use:   "fees",
	Short: "Get fee tier and 30-day trading volume",
	Long: `Get your current fee tier and 30-day trading volume.

Shows maker/taker fee rates by channel (API, Web, FIX, Block) and notional volume.

Examples:
  gemini-markets spot fees
  gemini-markets spot fees -q`,
	RunE: func(cmd *cobra.Command, args []string) error {
		cfg := requireAuth(cmd)
		client, err := newAPIClient(cmd, cfg)
		if err != nil {
			return handleCommandError(err)
		}
		ctx := context.Background()

		volume, err := client.GetNotionalVolume(ctx)
		if err != nil {
			return handleAPIError(err)
		}

		if IsTableOutput() {
			return printSpotFeesTable(volume)
		}
		return output.PrintJSON(volume)
	},
}

func init() {
	spotCmd.AddCommand(spotFeesCmd)
}

func printSpotFeesTable(v *api.NotionalVolumeResponse) error {
	fmt.Println()
	fmt.Printf("30-Day Volume:  $%s\n", v.NotionalThirtyDayVolume)
	fmt.Println()
	fmt.Println("Fee Rates (bps):")

	table := output.NewTableWriter("CHANNEL", "MAKER", "TAKER", "AUCTION")
	table.AddRow("API", fmt.Sprintf("%d", v.APIMakerFeeBps), fmt.Sprintf("%d", v.APITakerFeeBps), fmt.Sprintf("%d", v.APIAuctionFeeBps))
	table.AddRow("Web", fmt.Sprintf("%d", v.WebMakerFeeBps), fmt.Sprintf("%d", v.WebTakerFeeBps), fmt.Sprintf("%d", v.WebAuctionFeeBps))
	table.AddRow("FIX", fmt.Sprintf("%d", v.FixMakerFeeBps), fmt.Sprintf("%d", v.FixTakerFeeBps), fmt.Sprintf("%d", v.FixAuctionFeeBps))
	table.AddRow("Block", fmt.Sprintf("%d", v.BlockMakerFeeBps), fmt.Sprintf("%d", v.BlockTakerFeeBps), "-")
	table.Render()
	fmt.Println()
	return nil
}
