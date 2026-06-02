package cmd

import (
	"context"
	"fmt"

	"github.com/spf13/cobra"

	"github.com/gemini/developer-platform/packages/cli/internal/api"
	appmarkets "github.com/gemini/developer-platform/packages/cli/internal/app/markets"
	"github.com/gemini/developer-platform/packages/cli/internal/output"
	internalschema "github.com/gemini/developer-platform/packages/cli/internal/schema"
)

var predictMarketsCmd = &cobra.Command{
	Use:   "markets",
	Short: "Browse prediction markets",
	Long:  "Commands for browsing and searching prediction markets.",
	RunE: func(cmd *cobra.Command, args []string) error {
		if len(args) > 0 {
			return output.FormatError(output.NewInputError(
				fmt.Sprintf("unknown command %q for %q", args[0], cmd.CommandPath()),
			))
		}
		return cmd.Help()
	},
}

var (
	predictMarketsStatus   []string
	predictMarketsCategory []string
	predictMarketsSearch   string
	predictMarketsLimit    int
	predictMarketsOffset   int
	predictMarketsSort     string
)

var predictMarketsListCmd = &cobra.Command{
	Use:   "list",
	Short: "List prediction markets",
	Example: `  gemini-markets predict markets list --status active
  gemini-markets predict markets list --category Sports --limit 10 -q
  gemini-markets predict markets list --search "NBA Finals" -o table`,
	Long: `List prediction markets with optional filtering.

Examples:
  gemini-markets predict markets list --status active
  gemini-markets predict markets list --category sports
  gemini-markets predict markets list --search "Lakers"`,
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

		params := api.ListMarketsParams{
			Status:   predictMarketsStatus,
			Category: predictMarketsCategory,
			Search:   predictMarketsSearch,
			Limit:    predictMarketsLimit,
			Offset:   predictMarketsOffset,
			Sort:     predictMarketsSort,
		}

		resp, err := svc.ListPredictMarkets(ctx, params)
		if err != nil {
			return handleAPIError(err)
		}

		if IsTableOutput() {
			return printPredictMarketsTable(resp)
		}
		return output.PrintJSON(resp)
	},
}

var predictMarketsGetCmd = &cobra.Command{
	Use:   "get <id>",
	Short: "Get market details",
	Example: `  gemini-markets predict markets get OSCARBP26
  gemini-markets predict markets get OSCARBP26 -q`,
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

		market, err := svc.GetPredictMarket(ctx, args[0])
		if err != nil {
			return handleAPIError(err)
		}

		if IsTableOutput() {
			return printPredictMarketDetail(market)
		}
		return output.PrintJSON(market)
	},
}

var predictMarketsSearchCmd = &cobra.Command{
	Use:   "search <query>",
	Short: "Search markets",
	Example: `  gemini-markets predict markets search "Bitcoin"
  gemini-markets predict markets search "NBA" --limit 10 -q`,
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

		resp, err := svc.SearchPredictMarkets(ctx, args[0], predictMarketsLimit, predictMarketsOffset)
		if err != nil {
			return handleAPIError(err)
		}

		if IsTableOutput() {
			return printPredictMarketsTable(resp)
		}
		return output.PrintJSON(resp)
	},
}

var predictCategoriesCmd = &cobra.Command{
	Use:   "categories",
	Short: "List market categories",
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

		resp, err := svc.ListPredictCategories(ctx, predictMarketsStatus)
		if err != nil {
			return handleAPIError(err)
		}

		if IsTableOutput() {
			table := output.NewTableWriter("CATEGORY")
			for _, cat := range resp.Categories {
				table.AddRow(cat)
			}
			table.Render()
			return nil
		}
		return output.PrintJSON(resp)
	},
}

var predictSymbolsCmd = &cobra.Command{
	Use:   "symbols",
	Short: "List tradeable contract symbols",
	Long: `List all currently tradeable prediction market contract symbols.

These symbols can be used with the klines and stream commands.

Examples:
  gemini-markets predict markets symbols
  gemini-markets predict markets symbols | grep BTC`,
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

		symbols, err := svc.ListPredictSymbols(ctx)
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

var predictNewlyListedCmd = &cobra.Command{
	Use:   "newly-listed",
	Short: "List markets created in last 24h",
	Long: `List prediction markets created in the last 24 hours.

Sorted by creation date (newest first).

Examples:
  gemini-markets predict markets newly-listed
  gemini-markets predict markets newly-listed --category sports --limit 10`,
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

		resp, err := svc.ListNewlyListedPredictMarkets(ctx, predictMarketsCategory, predictMarketsLimit, predictMarketsOffset)
		if err != nil {
			return handleAPIError(err)
		}

		if IsTableOutput() {
			return printPredictMarketsTable(resp)
		}
		return output.PrintJSON(resp)
	},
}

var predictRecentlySettledCmd = &cobra.Command{
	Use:   "recently-settled",
	Short: "List markets settled in last 24h",
	Long: `List prediction markets settled in the last 24 hours.

Sorted by resolution date (most recent first).

Examples:
  gemini-markets predict markets recently-settled
  gemini-markets predict markets recently-settled --category sports`,
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

		resp, err := svc.ListRecentlySettledPredictMarkets(ctx, predictMarketsCategory, predictMarketsLimit, predictMarketsOffset)
		if err != nil {
			return handleAPIError(err)
		}

		if IsTableOutput() {
			return printPredictMarketsTable(resp)
		}
		return output.PrintJSON(resp)
	},
}

var predictUpcomingCmd = &cobra.Command{
	Use:   "upcoming",
	Short: "List pre-launch approved markets",
	Long: `List pre-launch approved prediction markets.

These are markets that have been approved but not yet started trading.
Sorted by start time (soonest first).

Examples:
  gemini-markets predict markets upcoming
  gemini-markets predict markets upcoming --category sports`,
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

		resp, err := svc.ListUpcomingPredictMarkets(ctx, predictMarketsCategory, predictMarketsLimit, predictMarketsOffset)
		if err != nil {
			return handleAPIError(err)
		}

		if IsTableOutput() {
			return printPredictMarketsTable(resp)
		}
		return output.PrintJSON(resp)
	},
}

func init() {
	internalschema.Register(&internalschema.CommandMeta{
		MCPName:     "gemini_predict_markets_list",
		Description: "List available prediction markets. Use to discover tradeable markets.",
		Params: map[string]internalschema.ParamMeta{
			"status":   {Type: internalschema.ParamString, Enum: []string{"active", "closed", "settled"}, Description: "Filter by status", Example: "active"},
			"category": {Type: internalschema.ParamString, Description: "Filter by category (e.g., Sports, Politics, Crypto)", Example: "Crypto"},
		},
		Output: &internalschema.OutputMeta{Type: "object", Description: "Markets with pagination", Schema: "#/schemas/Market"},
	})
	internalschema.Register(&internalschema.CommandMeta{
		MCPName:     "gemini_predict_markets_get",
		Description: "Get detailed market info including contracts and current prices. Use this to find the instrumentSymbol needed for order placement.",
		Params: map[string]internalschema.ParamMeta{
			"ticker": {Type: internalschema.ParamString, Required: true, Description: "Market ticker (e.g., OSCARBP26)", Example: "BTC2603052200"},
		},
		Output: &internalschema.OutputMeta{Type: "object", Description: "Market with contracts[] containing instrumentSymbol for trading", Schema: "#/schemas/Market"},
	})
	internalschema.Register(&internalschema.CommandMeta{
		MCPName:     "gemini_predict_markets_search",
		Description: "Search prediction markets by keyword.",
		Params: map[string]internalschema.ParamMeta{
			"query": {Type: internalschema.ParamString, Required: true, Description: "Search query (e.g., 'NBA', 'Bitcoin', 'Election')", Example: "Bitcoin"},
		},
		Output: &internalschema.OutputMeta{Type: "object", Description: "Matching markets", Schema: "#/schemas/Market"},
	})
	internalschema.Register(&internalschema.CommandMeta{
		MCPName:     "gemini_predict_markets_newly_listed",
		Description: "List prediction markets created in the last 24 hours. Sorted by creation date (newest first).",
		Params: map[string]internalschema.ParamMeta{
			"category": {Type: internalschema.ParamString, Description: "Filter by category (e.g., Sports, Politics, Crypto)", Example: "Sports"},
			"limit":    {Type: internalschema.ParamString, Description: "Max results (default: 50)", Default: "50"},
			"offset":   {Type: internalschema.ParamString, Description: "Pagination offset", Default: "0"},
		},
		Output: &internalschema.OutputMeta{Type: "object", Description: "New markets with pagination", Schema: "#/schemas/Market"},
	})
	internalschema.Register(&internalschema.CommandMeta{
		MCPName:     "gemini_predict_markets_recently_settled",
		Description: "List prediction markets settled in the last 24 hours. Sorted by resolution date (most recent first).",
		Params: map[string]internalschema.ParamMeta{
			"category": {Type: internalschema.ParamString, Description: "Filter by category (e.g., Sports, Politics, Crypto)", Example: "Sports"},
			"limit":    {Type: internalschema.ParamString, Description: "Max results (default: 50)", Default: "50"},
			"offset":   {Type: internalschema.ParamString, Description: "Pagination offset", Default: "0"},
		},
		Output: &internalschema.OutputMeta{Type: "object", Description: "Settled markets with pagination", Schema: "#/schemas/Market"},
	})
	internalschema.Register(&internalschema.CommandMeta{
		MCPName:     "gemini_predict_markets_upcoming",
		Description: "List pre-launch approved prediction markets. Sorted by start time (soonest first).",
		Params: map[string]internalschema.ParamMeta{
			"category": {Type: internalschema.ParamString, Description: "Filter by category (e.g., Sports, Politics, Crypto)", Example: "Sports"},
			"limit":    {Type: internalschema.ParamString, Description: "Max results (default: 50)", Default: "50"},
			"offset":   {Type: internalschema.ParamString, Description: "Pagination offset", Default: "0"},
		},
		Output: &internalschema.OutputMeta{Type: "object", Description: "Upcoming markets with pagination", Schema: "#/schemas/Market"},
	})
	internalschema.Register(&internalschema.CommandMeta{
		MCPName:     "gemini_predict_markets_categories",
		Description: "List all available prediction market categories.",
		Params: map[string]internalschema.ParamMeta{
			"status": {Type: internalschema.ParamString, Enum: []string{"active", "closed", "settled"}, Description: "Filter categories by market status", Example: "active"},
		},
		Output: &internalschema.OutputMeta{Type: "object", Description: "Array of category strings"},
	})

	predictMarketsListCmd.Flags().StringSliceVar(&predictMarketsStatus, "status", nil, "filter by status")
	predictMarketsListCmd.Flags().StringSliceVar(&predictMarketsCategory, "category", nil, "filter by category")
	predictMarketsListCmd.Flags().StringVar(&predictMarketsSearch, "search", "", "search query")
	predictMarketsListCmd.Flags().IntVar(&predictMarketsLimit, "limit", 50, "max results")
	predictMarketsListCmd.Flags().IntVar(&predictMarketsOffset, "offset", 0, "pagination offset")
	predictMarketsListCmd.Flags().StringVar(&predictMarketsSort, "sort", "", "sort order")

	predictMarketsSearchCmd.Flags().IntVar(&predictMarketsLimit, "limit", 20, "max results")
	predictMarketsSearchCmd.Flags().IntVar(&predictMarketsOffset, "offset", 0, "pagination offset")

	predictNewlyListedCmd.Flags().StringSliceVar(&predictMarketsCategory, "category", nil, "filter by category")
	predictNewlyListedCmd.Flags().IntVar(&predictMarketsLimit, "limit", 50, "max results")
	predictNewlyListedCmd.Flags().IntVar(&predictMarketsOffset, "offset", 0, "pagination offset")

	predictRecentlySettledCmd.Flags().StringSliceVar(&predictMarketsCategory, "category", nil, "filter by category")
	predictRecentlySettledCmd.Flags().IntVar(&predictMarketsLimit, "limit", 50, "max results")
	predictRecentlySettledCmd.Flags().IntVar(&predictMarketsOffset, "offset", 0, "pagination offset")

	predictUpcomingCmd.Flags().StringSliceVar(&predictMarketsCategory, "category", nil, "filter by category")
	predictUpcomingCmd.Flags().IntVar(&predictMarketsLimit, "limit", 50, "max results")
	predictUpcomingCmd.Flags().IntVar(&predictMarketsOffset, "offset", 0, "pagination offset")

	predictMarketsCmd.AddCommand(predictMarketsListCmd)
	predictMarketsCmd.AddCommand(predictMarketsGetCmd)
	predictMarketsCmd.AddCommand(predictMarketsSearchCmd)
	predictMarketsCmd.AddCommand(predictCategoriesCmd)
	predictMarketsCmd.AddCommand(predictSymbolsCmd)
	predictMarketsCmd.AddCommand(predictNewlyListedCmd)
	predictMarketsCmd.AddCommand(predictRecentlySettledCmd)
	predictMarketsCmd.AddCommand(predictUpcomingCmd)

	predictCmd.AddCommand(predictMarketsCmd)
}

func printPredictMarketsTable(resp *api.MarketsResponse) error {
	table := output.NewTableWriter("TICKER", "TITLE", "STATUS", "VOLUME 24H", "CATEGORY")

	for i := range resp.Data {
		m := &resp.Data[i]
		title := m.Title
		if len(title) > 40 {
			title = title[:37] + "..."
		}
		volume := m.Volume24h
		if volume == "" {
			volume = "-"
		} else {
			volume = "$" + volume
		}
		table.AddRow(m.Ticker, title, m.Status, volume, m.Category)
	}

	table.Render()
	return nil
}

func printPredictMarketDetail(m *api.Market) error {
	fmt.Println()
	fmt.Println("Market:", m.Title)
	fmt.Println("Ticker:", m.Ticker)
	fmt.Println("Status:", m.Status)
	fmt.Println("Category:", m.Category)
	fmt.Println("Type:", m.Type)
	if m.Volume24h != "" {
		fmt.Println("Volume 24h: $" + m.Volume24h)
	}
	if m.Volume != "" {
		fmt.Println("Total Volume: $" + m.Volume)
	}
	if m.Liquidity != "" {
		fmt.Println("Liquidity: $" + m.Liquidity)
	}
	if m.ExpiryDate != "" {
		fmt.Println("Expiry:", m.ExpiryDate)
	}
	fmt.Println()

	if len(m.Contracts) > 0 {
		table := output.NewTableWriter("CONTRACT", "LABEL", "STATUS", "BUY YES", "BUY NO", "SELL YES", "SELL NO")
		for i := range m.Contracts {
			c := &m.Contracts[i]
			id := c.ID
			if c.InstrumentSymbol != "" {
				id = c.InstrumentSymbol
			}
			table.AddRow(
				id,
				c.Label,
				c.Status,
				formatPredictPrice(c.Prices.Buy.Yes),
				formatPredictPrice(c.Prices.Buy.No),
				formatPredictPrice(c.Prices.Sell.Yes),
				formatPredictPrice(c.Prices.Sell.No),
			)
		}
		table.Render()
	}
	return nil
}

func formatPredictPrice(s string) string {
	if s == "" {
		return "-"
	}
	return s
}
