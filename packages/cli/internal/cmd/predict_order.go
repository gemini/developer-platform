package cmd

import (
	"context"
	"fmt"
	"strings"

	"github.com/spf13/cobra"

	"github.com/gemini/developer-platform/packages/cli/internal/api"
	apporders "github.com/gemini/developer-platform/packages/cli/internal/app/orders"
	"github.com/gemini/developer-platform/packages/cli/internal/output"
	internalschema "github.com/gemini/developer-platform/packages/cli/internal/schema"
)

var predictOrderCmd = &cobra.Command{
	Use:   "order",
	Short: "Manage prediction market orders",
	Long:  "Commands for placing, viewing, and canceling prediction market orders.",
}

var (
	predictOrderSymbol        string
	predictOrderSide          string
	predictOrderOutcome       string
	predictOrderType          string
	predictOrderQuantity      string
	predictOrderPrice         string
	predictOrderStopPrice     string
	predictOrderTimeInForce   string
	predictOrderClientOrderID string
	predictOrderMakerOrCancel bool
	predictOrderDollars       string
	predictPlaceDryRun        bool
	predictCancelAllDryRun    bool
	predictOrderStdin         bool
	predictCancelAllYes       bool
)

var predictOrderPlaceCmd = &cobra.Command{
	Use:   "place",
	Short: "Place a new prediction market order",
	Example: `  gemini-markets predict order place --symbol GEMI-OSCARBP26-OSBP26ONEB --side buy --outcome yes --quantity 100 --price 0.65
  gemini-markets predict order place --symbol GEMI-OSCARBP26-OSBP26ONEB --side buy --outcome yes --quantity 100 --price 0.65 --client-order-id agent-123
  gemini-markets predict order place --symbol GEMI-OSCARBP26-OSBP26ONEB --side buy --outcome yes --dollars 50 --price 0.65 --dry-run -q
  echo '{"symbol":"GEMI-OSCARBP26-OSBP26ONEB","side":"buy","outcome":"yes","quantity":"100","price":"0.65"}' | gemini-markets predict order place --stdin -q
  gemini-markets --sandbox --no-websocket predict order place --symbol GEMI-TEST --side buy --outcome yes --quantity 10 --price 0.50 --client-order-id test-123 -q`,
	Long: `Place a new prediction market order.

Examples:
  gemini-markets predict order place --symbol NBA-LAL-BOS-2024 --side buy --outcome yes \
    --type limit --quantity 100 --price 0.62

  # With idempotency key (critical for agents)
  gemini-markets predict order place --symbol NBA-LAL-BOS-2024 --side buy --outcome yes \
    --type limit --quantity 100 --price 0.62 --client-order-id "agent-12345"

  # From stdin (flags override stdin values)
  echo '{"symbol":"GEMI-...","side":"buy","outcome":"yes","quantity":"100","price":"0.65"}' \
    | gemini-markets predict order place --stdin

  # Buy up to $50 worth of contracts including estimated prediction fees
  gemini-markets predict order place --symbol GEMI-... --side buy --outcome yes \
    --dollars 50 --price 0.65

  # Dry run (validate without placing)
  gemini-markets predict order place --symbol GEMI-... --side buy --outcome yes \
    --quantity 100 --price 0.65 --dry-run -q`,
	RunE: func(cmd *cobra.Command, args []string) error {
		if predictOrderStdin {
			if err := applyPredictOrderStdin(cmd); err != nil {
				return handleCommandError(err)
			}
		}

		cfg := requireAuth(cmd)
		client, err := newAPIClient(cmd, cfg)
		if err != nil {
			return handleCommandError(err)
		}
		ctx := context.Background()
		wsManager, err := getWSManager(cmd, cfg)
		if err != nil {
			return handleCommandError(err)
		}
		svc := apporders.NewService(client, wsManager, IsWebSocketDisabled())
		req, dryRun, err := svc.PreparePredictPlace(ctx, apporders.PredictPlaceInput{
			Symbol:        predictOrderSymbol,
			Side:          predictOrderSide,
			Outcome:       predictOrderOutcome,
			Type:          predictOrderType,
			Quantity:      predictOrderQuantity,
			Price:         predictOrderPrice,
			Dollars:       predictOrderDollars,
			StopPrice:     predictOrderStopPrice,
			TimeInForce:   predictOrderTimeInForce,
			ClientOrderID: predictOrderClientOrderID,
			MakerOrCancel: predictOrderMakerOrCancel,
		})
		if err != nil {
			return handleCommandError(err)
		}

		// --dry-run: validate and show order parameters without placing
		if predictPlaceDryRun {
			if IsTableOutput() {
				fmt.Println("[DRY RUN] Would place order:")
				fmt.Printf("  Symbol:     %s\n", req.Symbol)
				fmt.Printf("  Side:       %s %s\n", req.Side, req.Outcome)
				fmt.Printf("  Type:       %s\n", req.OrderType)
				fmt.Printf("  Quantity:   %s\n", req.Quantity)
				fmt.Printf("  Price:      %s\n", req.Price)
				fmt.Printf("  Client ID:  %s\n", req.ClientOrderID)
				fmt.Println("\nNo order placed.")
				return nil
			}
			return output.PrintJSON(dryRun)
		}

		if !IsWebSocketDisabled() {
			if err := validatePrivateWebSocketAuth(cfg, "order placement"); err != nil {
				return handleCommandError(err)
			}
		}

		order, err := svc.ExecutePredictPlace(ctx, req)
		if err != nil {
			return handleAPIError(err)
		}

		if IsTableOutput() {
			return printPredictOrderDetail(order)
		}
		return output.PrintJSON(order)
	},
}

var (
	predictOrdersTickerID string
	predictOrdersStatus   string
	predictOrdersLimit    int
	predictOrdersOffset   int
)

var predictOrdersListCmd = &cobra.Command{
	Use:   "list",
	Short: "List open prediction market orders",
	RunE: func(cmd *cobra.Command, args []string) error {
		cfg := requireAuth(cmd)
		client, err := newAPIClient(cmd, cfg)
		if err != nil {
			return handleCommandError(err)
		}
		ctx := context.Background()

		params := api.ListPredictOrdersParams{
			TickerID: predictOrdersTickerID,
			Limit:    predictOrdersLimit,
			Offset:   predictOrdersOffset,
		}

		orders, err := client.ListOpenPredictOrders(ctx, params)
		if err != nil {
			return handleAPIError(err)
		}

		if IsTableOutput() {
			return printPredictOrdersTable(orders)
		}
		return output.PrintJSON(orders)
	},
}

var predictOrdersHistoryCmd = &cobra.Command{
	Use:   "history",
	Short: "List prediction market order history",
	RunE: func(cmd *cobra.Command, args []string) error {
		cfg := requireAuth(cmd)
		client, err := newAPIClient(cmd, cfg)
		if err != nil {
			return handleCommandError(err)
		}
		ctx := context.Background()

		params := api.ListPredictOrdersParams{
			TickerID: predictOrdersTickerID,
			Status:   predictOrdersStatus,
			Limit:    predictOrdersLimit,
			Offset:   predictOrdersOffset,
		}

		orders, err := client.ListPredictOrderHistory(ctx, params)
		if err != nil {
			return handleAPIError(err)
		}

		if IsTableOutput() {
			return printPredictOrdersTable(orders)
		}
		return output.PrintJSON(orders)
	},
}

var predictOrderGetCmd = &cobra.Command{
	Use:   "get <order-id>",
	Short: "Get prediction market order details",
	Long: `Get details and current status of a specific prediction market order.

Examples:
  gemini-markets predict order get 12345678
  gemini-markets predict order get 12345678 -q`,
	Args: cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		cfg := requireAuth(cmd)
		client, err := newAPIClient(cmd, cfg)
		if err != nil {
			return handleCommandError(err)
		}
		ctx := context.Background()

		order, err := client.GetPredictOrder(ctx, args[0])
		if err != nil {
			return handleAPIError(err)
		}

		if IsTableOutput() {
			return printPredictOrderStatus(order)
		}
		return output.PrintJSON(order)
	},
}

var predictOrderCancelCmd = &cobra.Command{
	Use:   "cancel <order-id>",
	Short: "Cancel a prediction market order",
	Example: `  gemini-markets predict order cancel 12345678
  gemini-markets --no-websocket predict order cancel 12345678 -q`,
	Args: cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		cfg := requireAuth(cmd)
		client, err := newAPIClient(cmd, cfg)
		if err != nil {
			return handleCommandError(err)
		}
		ctx := context.Background()
		wsManager, err := getWSManager(cmd, cfg)
		if err != nil {
			return handleCommandError(err)
		}
		svc := apporders.NewService(client, wsManager, IsWebSocketDisabled())
		order, err := svc.CancelPredictOrder(ctx, args[0])
		if err != nil {
			return handleAPIError(err)
		}

		if IsTableOutput() {
			fmt.Printf("Order %s canceled\n", order.OrderID)
			return nil
		}
		return output.PrintJSON(order)
	},
}

var predictOrderCancelAllCmd = &cobra.Command{
	Use:   "cancel-all",
	Short: "Cancel all open prediction market orders",
	Example: `  gemini-markets predict order cancel-all --dry-run -q
  gemini-markets predict order cancel-all --yes -q
  gemini-markets --sandbox predict order cancel-all --yes -q`,
	Long: `Cancel all open prediction market orders. Essential for risk management.

The command previews open prediction orders, then cancels those prediction orders
by order ID. Spot orders are not canceled by this command.

Use this as an emergency kill switch or before shutting down a bot.

Note: the preview may not reflect orders placed by other sessions between
preview and execution.

Examples:
  gemini-markets predict order cancel-all
  gemini-markets predict order cancel-all --yes
  gemini-markets predict order cancel-all --dry-run -q
  gemini-markets predict order cancel-all -q`,
	RunE: func(cmd *cobra.Command, args []string) error {
		cfg := requireAuth(cmd)
		client, err := newAPIClient(cmd, cfg)
		if err != nil {
			return handleCommandError(err)
		}
		ctx := context.Background()
		wsManager, err := getWSManager(cmd, cfg)
		if err != nil {
			return handleCommandError(err)
		}
		svc := apporders.NewService(client, wsManager, IsWebSocketDisabled())

		// --dry-run: show what would be canceled without canceling
		if predictCancelAllDryRun {
			orders, dryRun, err := svc.PreviewPredictCancelAll(ctx)
			if err != nil {
				return handleAPIError(err)
			}
			return renderCancelAllDryRun(orders, dryRun, formatPredictCancelAllLine)
		}

		// Confirmation prompt for interactive use (skipped with --yes or -q)
		if !predictCancelAllYes && !IsQuiet() {
			orders, _, err := svc.PreviewPredictCancelAll(ctx)
			if err != nil {
				return handleAPIError(err)
			}
			hasOrders, confirmed := confirmCancelAllOrders(orders, formatPredictCancelAllLine)
			if !hasOrders || !confirmed {
				return nil
			}
		}

		result, err := svc.CancelAllPredictOrders(ctx)
		if err != nil {
			return handleAPIError(err)
		}

		if IsTableOutput() {
			printCanceledOrderSummary(result.CanceledOrders)
			return nil
		}
		return output.PrintJSON(result)
	},
}

func init() {
	internalschema.Register(&internalschema.CommandMeta{
		MCPName:     "gemini_predict_order_place",
		Description: "Place a prediction market order. IMPORTANT: Always provide client_order_id for safe retries - if a request fails, retry with the SAME client_order_id and duplicates will be rejected. For active trading, run 'gemini-markets stream orders' in background to get real-time fill notifications instead of polling.",
		Params: map[string]internalschema.ParamMeta{
			"symbol":          {Type: internalschema.ParamString, Required: true, Description: "Contract symbol (e.g., GEMI-BTC2603052200-HI70500)", Example: "GEMI-BTC2603052200-HI70500"},
			"side":            {Type: internalschema.ParamString, Required: true, Enum: []string{"buy", "sell"}, Description: "Order side", Example: "buy"},
			"outcome":         {Type: internalschema.ParamString, Required: true, Enum: []string{"yes", "no"}, Description: "Contract outcome", Example: "yes"},
			"client_order_id": {Type: internalschema.ParamString, Required: true, Description: "Idempotency key for safe retries. REQUIRED for agents. Use format: agent-{timestamp}-{uuid}", Example: "agent-1709424000-abc123"},
			"quantity":        {Type: internalschema.ParamString, Description: "Number of contracts (1-10000). Required unless dollars is set", Example: "100"},
			"dollars":         {Type: internalschema.ParamString, Description: "Dollar amount. Buys cap total spend including estimated prediction fees; sells target gross notional. Market/IOC/FOK sizing uses a WebSocket depth snapshot", Example: "50"},
			"price":           {Type: internalschema.ParamString, Description: "Limit price (0.01-0.99). Required for limit orders and dollar-based sizing", Example: "0.65"},
			"type":            {Type: internalschema.ParamString, Enum: []string{"limit", "market"}, Default: "limit", Description: "Order type"},
			"time_in_force":   {Type: internalschema.ParamString, Enum: []string{"good-til-cancel", "immediate-or-cancel", "fill-or-kill", "post-only"}, Default: "good-til-cancel", Description: "Time in force policy"},
			"dry_run":         {Type: internalschema.ParamBoolean, Description: "Validate and preview order without placing. Returns order params that would be sent"},
		},
		AnyOf:  [][]string{{"quantity"}, {"dollars"}},
		Output: &internalschema.OutputMeta{Type: "object", Description: "PredictOrderResponse with orderId, status, filledQuantity", Schema: "#/schemas/PredictOrderResponse"},
	})
	internalschema.Register(&internalschema.CommandMeta{
		MCPName:     "gemini_predict_order_cancel",
		Description: "Cancel a prediction market order by order ID.",
		Params: map[string]internalschema.ParamMeta{
			"order_id": {Type: internalschema.ParamString, Required: true, Description: "Server-assigned order ID to cancel", Example: "12345678"},
		},
		Output: &internalschema.OutputMeta{Type: "object", Description: "Canceled order details", Schema: "#/schemas/PredictOrderResponse"},
	})
	internalschema.Register(&internalschema.CommandMeta{
		MCPName:     "gemini_predict_order_cancel_all",
		Description: "Cancel ALL open prediction market orders atomically. Use as emergency kill switch. Use dry_run=true to preview which orders would be canceled.",
		Params: map[string]internalschema.ParamMeta{
			"dry_run": {Type: internalschema.ParamBoolean, Description: "List orders that would be canceled without canceling"},
		},
		Output: &internalschema.OutputMeta{Type: "object", Description: "List of canceled order IDs"},
	})
	internalschema.Register(&internalschema.CommandMeta{
		MCPName:     "gemini_predict_order_list",
		Description: "List all open prediction market orders.",
		Params: map[string]internalschema.ParamMeta{
			"ticker": {Type: internalschema.ParamString, Description: "Filter by market ticker (optional)", Example: "OSCARBP26"},
			"limit":  {Type: internalschema.ParamString, Description: "Max results (default: 50)", Default: "50"},
		},
		Output: &internalschema.OutputMeta{Type: "array", Description: "Array of open orders", Schema: "#/schemas/PredictOrderResponse"},
	})
	internalschema.Register(&internalschema.CommandMeta{
		MCPName:     "gemini_predict_order_get",
		Description: "Get status and details of a specific prediction market order.",
		Params: map[string]internalschema.ParamMeta{
			"order_id": {Type: internalschema.ParamString, Required: true, Description: "Server-assigned order ID", Example: "12345678"},
		},
		Output: &internalschema.OutputMeta{Type: "object", Description: "Order details with current status", Schema: "#/schemas/PredictOrderResponse"},
	})
	internalschema.Register(&internalschema.CommandMeta{
		MCPName:     "gemini_predict_order_history",
		Description: "List prediction market order history (filled, canceled, etc.).",
		Params: map[string]internalschema.ParamMeta{
			"ticker": {Type: internalschema.ParamString, Description: "Filter by market ticker (optional)", Example: "OSCARBP26"},
			"status": {Type: internalschema.ParamString, Description: "Filter by status (e.g., filled, canceled)", Example: "filled"},
			"limit":  {Type: internalschema.ParamString, Description: "Max results (default: 50)", Default: "50"},
		},
		Output: &internalschema.OutputMeta{Type: "array", Description: "Historical orders", Schema: "#/schemas/PredictOrderResponse"},
	})

	predictOrderPlaceCmd.Flags().StringVar(&predictOrderSymbol, "symbol", "", "market symbol (required)")
	predictOrderPlaceCmd.Flags().StringVar(&predictOrderSide, "side", "", "order side: buy or sell (required)")
	predictOrderPlaceCmd.Flags().StringVar(&predictOrderOutcome, "outcome", "", "contract outcome: yes or no (required)")
	predictOrderPlaceCmd.Flags().StringVar(&predictOrderType, "type", "limit", "order type: limit, market")
	predictOrderPlaceCmd.Flags().StringVar(&predictOrderQuantity, "quantity", "", "number of contracts (required unless --dollars)")
	predictOrderPlaceCmd.Flags().StringVar(&predictOrderPrice, "price", "", "limit price")
	predictOrderPlaceCmd.Flags().StringVar(&predictOrderDollars, "dollars", "", "dollar amount; buys cap spend including fees, sells target notional")
	predictOrderPlaceCmd.Flags().StringVar(&predictOrderStopPrice, "stop-price", "", "stop price")
	predictOrderPlaceCmd.Flags().StringVar(&predictOrderTimeInForce, "tif", "good-til-cancel", "time-in-force: good-til-cancel, immediate-or-cancel, fill-or-kill, post-only")
	predictOrderPlaceCmd.Flags().StringVar(&predictOrderClientOrderID, "client-order-id", "", "idempotency key (auto-generated if not provided)")
	predictOrderPlaceCmd.Flags().BoolVar(&predictOrderMakerOrCancel, "maker-or-cancel", false, "post-only order (alias for --tif post-only)")
	_ = predictOrderPlaceCmd.Flags().MarkHidden("maker-or-cancel")
	predictOrderPlaceCmd.Flags().BoolVar(&predictPlaceDryRun, "dry-run", false, "validate and show order parameters without placing")
	predictOrderPlaceCmd.Flags().BoolVar(&predictOrderStdin, "stdin", false, "read order parameters from stdin as JSON")

	predictOrdersListCmd.Flags().StringVar(&predictOrdersTickerID, "ticker", "", "filter by ticker")
	predictOrdersListCmd.Flags().IntVar(&predictOrdersLimit, "limit", 50, "max results")
	predictOrdersListCmd.Flags().IntVar(&predictOrdersOffset, "offset", 0, "pagination offset")

	predictOrdersHistoryCmd.Flags().StringVar(&predictOrdersTickerID, "ticker", "", "filter by ticker")
	predictOrdersHistoryCmd.Flags().StringVar(&predictOrdersStatus, "status", "", "filter by status")
	predictOrdersHistoryCmd.Flags().IntVar(&predictOrdersLimit, "limit", 50, "max results")
	predictOrdersHistoryCmd.Flags().IntVar(&predictOrdersOffset, "offset", 0, "pagination offset")

	predictOrderCancelAllCmd.Flags().BoolVarP(&predictCancelAllYes, "yes", "y", false, "skip confirmation prompt")
	predictOrderCancelAllCmd.Flags().BoolVar(&predictCancelAllDryRun, "dry-run", false, "list orders that would be canceled without canceling")

	predictOrderCmd.AddCommand(predictOrderPlaceCmd)
	predictOrderCmd.AddCommand(predictOrderGetCmd)
	predictOrderCmd.AddCommand(predictOrdersListCmd)
	predictOrderCmd.AddCommand(predictOrdersHistoryCmd)
	predictOrderCmd.AddCommand(predictOrderCancelCmd)
	predictOrderCmd.AddCommand(predictOrderCancelAllCmd)

	predictCmd.AddCommand(predictOrderCmd)
}

func printPredictOrdersTable(resp *api.PredictOrdersResponse) error {
	table := output.NewTableWriter("ORDER ID", "SYMBOL", "SIDE", "OUTCOME", "QTY", "PRICE", "STATUS")

	for i := range resp.Data {
		o := &resp.Data[i]
		price := o.Price
		if price == "" {
			price = "MARKET"
		} else {
			price = "$" + price
		}
		table.AddRow(
			o.OrderID,
			o.Symbol,
			strings.ToUpper(o.Side),
			strings.ToUpper(o.Outcome),
			o.Quantity,
			price,
			strings.ToUpper(o.Status),
		)
	}

	table.Render()
	return nil
}

func formatPredictCancelAllLine(o api.PredictOrderResponse) string {
	return fmt.Sprintf("  %s  %s %s %s  qty=%s  price=$%s",
		o.OrderID, o.Symbol, strings.ToUpper(o.Side), strings.ToUpper(o.Outcome), o.Quantity, o.Price)
}

func printPredictOrderDetail(o *api.PredictOrderResponse) error {
	fmt.Println()
	fmt.Println("Order placed successfully!")
	fmt.Printf("  Order ID:     %s\n", o.OrderID)
	if o.ClientOrderID != "" {
		fmt.Printf("  Client ID:    %s\n", o.ClientOrderID)
	}
	fmt.Printf("  Status:       %s\n", strings.ToUpper(o.Status))
	fmt.Printf("  Symbol:       %s\n", o.Symbol)
	fmt.Printf("  Side:         %s %s\n", strings.ToUpper(o.Side), strings.ToUpper(o.Outcome))
	fmt.Printf("  Quantity:     %s @ $%s\n", o.Quantity, o.Price)
	fmt.Println()
	return nil
}

func printPredictOrderStatus(o *api.PredictOrderResponse) error {
	fmt.Println()
	fmt.Printf("Order ID:       %s\n", o.OrderID)
	if o.ClientOrderID != "" {
		fmt.Printf("Client ID:      %s\n", o.ClientOrderID)
	}
	fmt.Printf("Status:         %s\n", strings.ToUpper(o.Status))
	fmt.Printf("Symbol:         %s\n", o.Symbol)
	fmt.Printf("Side:           %s %s\n", strings.ToUpper(o.Side), strings.ToUpper(o.Outcome))
	fmt.Printf("Type:           %s\n", strings.ToUpper(o.OrderType))
	price := o.Price
	if price == "" {
		price = "MARKET"
	} else {
		price = "$" + price
	}
	fmt.Printf("Price:          %s\n", price)
	fmt.Printf("Quantity:       %s\n", o.Quantity)
	fmt.Printf("Filled:         %s\n", o.FilledQuantity)
	if o.CreatedAt != "" {
		fmt.Printf("Created:        %s\n", o.CreatedAt)
	}
	fmt.Println()
	return nil
}
