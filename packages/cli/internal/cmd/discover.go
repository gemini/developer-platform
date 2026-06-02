package cmd

import (
	"github.com/spf13/cobra"

	"github.com/gemini/developer-platform/packages/cli/internal/output"
)

var discoverCmd = &cobra.Command{
	Use:   "discover",
	Short: "Discover CLI capabilities (ultra-compact)",
	Long:  "Output a compact overview of available commands, documentation locations, rate limits, and retryable errors. Designed for quick agent discovery.",
	RunE: func(cmd *cobra.Command, args []string) error {
		discovery := buildDiscovery()
		return output.PrintJSON(discovery)
	},
}

// Discovery contains ultra-compact CLI capability overview.
type Discovery struct {
	Version   string          `json:"v"`
	ToolCount int             `json:"tools"`
	Commands  []string        `json:"cmds"`
	Docs      DiscoveryDocs   `json:"docs"`
	Limits    DiscoveryLimits `json:"limits"`
	Retry     []string        `json:"retry"`
	NoRetry   []string        `json:"noRetry"`
}

// DiscoveryDocs points to documentation resources.
type DiscoveryDocs struct {
	Quick    string   `json:"quick"`
	Spec     string   `json:"spec"`
	Sections []string `json:"sections"`
	Full     string   `json:"full"`
}

// DiscoveryLimits describes key rate limits.
type DiscoveryLimits struct {
	RestAPI        string `json:"rest"`
	WebSocket      string `json:"ws"`
	CircuitBreaker string `json:"circuit"`
}

func buildDiscovery() Discovery {
	return Discovery{
		Version:   Version,
		ToolCount: len(buildMCPTools()),
		Commands: []string{
			"balance",
			"book",
			"predict.markets.list",
			"predict.markets.get",
			"predict.markets.search",
			"predict.markets.newly-listed",
			"predict.markets.recently-settled",
			"predict.markets.upcoming",
			"predict.markets.categories",
			"predict.markets.symbols",
			"predict.order.place",
			"predict.order.get",
			"predict.order.list",
			"predict.order.history",
			"predict.order.cancel",
			"predict.order.cancel-all",
			"predict.positions.list",
			"predict.positions.settled",
			"spot.symbols",
			"spot.symbol",
			"spot.order.place",
			"spot.order.get",
			"spot.order.list",
			"spot.order.cancel",
			"spot.order.cancel-all",
			"spot.trades",
			"spot.fees",
			"stream.ticker",
			"stream.trades",
			"stream.depth",
			"stream.orders",
			"stream.balances",
			"candles",
			"klines",
			"analyze",
		},
		Docs: DiscoveryDocs{
			Quick:    "QUICKREF.md",
			Spec:     "gemini-markets spec -q",
			Sections: []string{"errors", "schemas", "workflows", "commands", "limits"},
			Full:     "AGENTS.md",
		},
		Limits: DiscoveryLimits{
			RestAPI:        "600/min",
			WebSocket:      "5 concurrent",
			CircuitBreaker: "3x 429 = 30s cooldown",
		},
		Retry: []string{
			"RATE_LIMITED",
			"NETWORK_ERROR",
			"SERVER_ERROR",
		},
		NoRetry: []string{
			"INSUFFICIENT_FUNDS",
			"AUTH_FAILED",
			"INVALID_INPUT",
			"MARKET_CLOSED",
			"ORDER_REJECTED",
			"NOT_FOUND",
		},
	}
}

func init() {
	rootCmd.AddCommand(discoverCmd)
}
