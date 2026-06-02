package cmd

import (
	"context"
	"fmt"
	"strings"

	"github.com/spf13/cobra"

	"github.com/gemini/developer-platform/packages/cli/internal/api"
	apporders "github.com/gemini/developer-platform/packages/cli/internal/app/orders"
	"github.com/gemini/developer-platform/packages/cli/internal/output"
)

var spotOrderCmd = &cobra.Command{
	Use:   "order",
	Short: "Manage spot orders",
	Long:  "Commands for placing, viewing, and canceling spot orders.",
}

var (
	spotOrderSymbol        string
	spotOrderSide          string
	spotOrderType          string
	spotOrderAmount        string
	spotOrderPrice         string
	spotOrderStopPrice     string
	spotOrderClientOrderID string
	spotOrderMakerOrCancel bool
	spotOrderIOC           bool
	spotOrderFOK           bool
	spotOrderAccount       string
	spotOrderDollars       string
	spotPlaceDryRun        bool
	spotCancelAllDryRun    bool
	spotOrderStdin         bool
	spotCancelAllYes       bool
)

var spotOrderPlaceCmd = &cobra.Command{
	Use:   "place",
	Short: "Place a new spot order",
	Example: `  gemini-markets spot order place --symbol btcusd --side buy --amount 0.1 --price 50000
  gemini-markets spot order place --symbol btcusd --side buy --amount 0.1 --price 50000 --client-order-id agent-123
  gemini-markets spot order place --symbol btcusd --side buy --dollars 50 --price 50000 --dry-run -q
  echo '{"symbol":"btcusd","side":"buy","amount":"0.1","price":"50000"}' | gemini-markets spot order place --stdin -q
  gemini-markets --sandbox --no-websocket spot order place --symbol btcusd --side buy --amount 0.01 --price 50000 --client-order-id test-123 -q`,
	Long: `Place a new spot trading order.

Examples:
  # Market buy 0.1 BTC
  gemini-markets spot order place --symbol btcusd --side buy --type exchange market --amount 0.1

  # Limit buy 0.5 ETH at $2000
  gemini-markets spot order place --symbol ethusd --side buy --type exchange limit \
    --amount 0.5 --price 2000

  # With idempotency key (critical for agents)
  gemini-markets spot order place --symbol btcusd --side buy --type exchange limit \
    --amount 0.1 --price 50000 --client-order-id "agent-12345"

  # Buy $50 worth of BTC (fee-adjusted)
  gemini-markets spot order place --symbol btcusd --side buy --dollars 50 --price 50000

  # From stdin (flags override stdin values)
  echo '{"symbol":"btcusd","side":"buy","amount":"0.1","price":"50000"}' \
    | gemini-markets spot order place --stdin

  # Dry run (validate without placing)
  gemini-markets spot order place --symbol btcusd --side buy --amount 0.1 --price 50000 --dry-run -q`,
	RunE: func(cmd *cobra.Command, args []string) error {
		if spotOrderStdin {
			if err := applySpotOrderStdin(cmd); err != nil {
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
		req, dryRun, err := svc.PrepareSpotPlace(ctx, apporders.SpotPlaceInput{
			Symbol:        spotOrderSymbol,
			Side:          spotOrderSide,
			Type:          spotOrderType,
			Amount:        spotOrderAmount,
			Price:         spotOrderPrice,
			Dollars:       spotOrderDollars,
			StopPrice:     spotOrderStopPrice,
			ClientOrderID: spotOrderClientOrderID,
			MakerOrCancel: spotOrderMakerOrCancel,
			IOC:           spotOrderIOC,
			FOK:           spotOrderFOK,
			Account:       spotOrderAccount,
		})
		if err != nil {
			return handleCommandError(err)
		}

		// --dry-run: validate and show order parameters without placing
		if spotPlaceDryRun {
			if IsTableOutput() {
				fmt.Println("[DRY RUN] Would place order:")
				fmt.Printf("  Symbol:     %s\n", req.Symbol)
				fmt.Printf("  Side:       %s\n", req.Side)
				fmt.Printf("  Type:       %s\n", req.Type)
				fmt.Printf("  Amount:     %s\n", req.Amount)
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

		order, err := svc.ExecuteSpotPlace(ctx, req)
		if err != nil {
			return handleAPIError(err)
		}

		if IsTableOutput() {
			return printSpotOrderDetail(order)
		}
		return output.PrintJSON(order)
	},
}

var spotOrderGetCmd = &cobra.Command{
	Use:   "get <order-id>",
	Short: "Get spot order details",
	Long: `Get details and current status of a specific spot order.

Examples:
  gemini-markets spot order get 12345678
  gemini-markets spot order get 12345678 -q`,
	Args: cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		cfg := requireAuth(cmd)
		client, err := newAPIClient(cmd, cfg)
		if err != nil {
			return handleCommandError(err)
		}
		ctx := context.Background()

		order, err := client.GetSpotOrderStatus(ctx, args[0])
		if err != nil {
			return handleAPIError(err)
		}

		if IsTableOutput() {
			return printSpotOrderStatus(order)
		}
		return output.PrintJSON(order)
	},
}

var spotOrderListCmd = &cobra.Command{
	Use:   "list",
	Short: "List open spot orders",
	RunE: func(cmd *cobra.Command, args []string) error {
		cfg := requireAuth(cmd)
		client, err := newAPIClient(cmd, cfg)
		if err != nil {
			return handleCommandError(err)
		}
		ctx := context.Background()

		params := api.ListSpotOrdersParams{
			Account: spotOrderAccount,
		}

		orders, err := client.ListSpotOrders(ctx, params)
		if err != nil {
			return handleAPIError(err)
		}

		if IsTableOutput() {
			return printSpotOrdersTable(orders)
		}
		return output.PrintJSON(orders)
	},
}

var spotOrderCancelCmd = &cobra.Command{
	Use:   "cancel <order-id>",
	Short: "Cancel a spot order",
	Example: `  gemini-markets spot order cancel 12345678
  gemini-markets --no-websocket spot order cancel 12345678 -q`,
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
		order, err := svc.CancelSpotOrder(ctx, args[0])
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

var spotOrderCancelAllCmd = &cobra.Command{
	Use:   "cancel-all",
	Short: "Cancel all open spot orders",
	Example: `  gemini-markets spot order cancel-all --dry-run -q
  gemini-markets spot order cancel-all --yes -q
  gemini-markets --sandbox spot order cancel-all --yes -q`,
	Long: `Cancel all open spot orders atomically.

Note: the preview may not reflect orders placed by other sessions between
preview and execution. The cancel itself is atomic on the exchange.

Examples:
  gemini-markets spot order cancel-all
  gemini-markets spot order cancel-all --yes
  gemini-markets spot order cancel-all --dry-run -q
  gemini-markets spot order cancel-all -q`,
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
		if spotCancelAllDryRun {
			orders, dryRun, err := svc.PreviewSpotCancelAll(ctx, spotOrderAccount)
			if err != nil {
				return handleAPIError(err)
			}
			return renderCancelAllDryRun(orders, dryRun, formatSpotCancelAllLine)
		}

		// Confirmation prompt for interactive use (skipped with --yes or -q)
		if !spotCancelAllYes && !IsQuiet() {
			orders, _, err := svc.PreviewSpotCancelAll(ctx, spotOrderAccount)
			if err != nil {
				return handleAPIError(err)
			}
			hasOrders, confirmed := confirmCancelAllOrders(orders, formatSpotCancelAllLine)
			if !hasOrders || !confirmed {
				return nil
			}
		}

		result, err := svc.CancelAllSpotOrders(ctx, spotOrderAccount)
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
	spotOrderPlaceCmd.Flags().StringVar(&spotOrderSymbol, "symbol", "", "trading pair symbol (required)")
	spotOrderPlaceCmd.Flags().StringVar(&spotOrderSide, "side", "", "order side: buy or sell (required)")
	spotOrderPlaceCmd.Flags().StringVar(&spotOrderType, "type", "exchange limit", "order type: exchange limit, exchange market")
	spotOrderPlaceCmd.Flags().StringVar(&spotOrderAmount, "amount", "", "order amount in base currency (required unless --dollars)")
	spotOrderPlaceCmd.Flags().StringVar(&spotOrderDollars, "dollars", "", "total dollar spend including fees (adjusts for fee tier)")
	spotOrderPlaceCmd.Flags().StringVar(&spotOrderPrice, "price", "", "limit price")
	spotOrderPlaceCmd.Flags().StringVar(&spotOrderStopPrice, "stop-price", "", "stop price for stop orders")
	spotOrderPlaceCmd.Flags().StringVar(&spotOrderClientOrderID, "client-order-id", "", "idempotency key (auto-generated if not provided)")
	spotOrderPlaceCmd.Flags().BoolVar(&spotOrderMakerOrCancel, "maker-or-cancel", false, "post-only order")
	spotOrderPlaceCmd.Flags().BoolVar(&spotOrderIOC, "ioc", false, "immediate-or-cancel")
	spotOrderPlaceCmd.Flags().BoolVar(&spotOrderFOK, "fok", false, "fill-or-kill")
	spotOrderPlaceCmd.Flags().StringVar(&spotOrderAccount, "account", "", "account name (optional)")

	spotOrderListCmd.Flags().StringVar(&spotOrderAccount, "account", "", "account name (optional)")

	spotOrderCancelAllCmd.Flags().StringVar(&spotOrderAccount, "account", "", "account name (optional)")
	spotOrderCancelAllCmd.Flags().BoolVarP(&spotCancelAllYes, "yes", "y", false, "skip confirmation prompt")
	spotOrderCancelAllCmd.Flags().BoolVar(&spotCancelAllDryRun, "dry-run", false, "list orders that would be canceled without canceling")

	spotOrderPlaceCmd.Flags().BoolVar(&spotPlaceDryRun, "dry-run", false, "validate and show order parameters without placing")
	spotOrderPlaceCmd.Flags().BoolVar(&spotOrderStdin, "stdin", false, "read order parameters from stdin as JSON")

	spotOrderCmd.AddCommand(spotOrderPlaceCmd)
	spotOrderCmd.AddCommand(spotOrderGetCmd)
	spotOrderCmd.AddCommand(spotOrderListCmd)
	spotOrderCmd.AddCommand(spotOrderCancelCmd)
	spotOrderCmd.AddCommand(spotOrderCancelAllCmd)

	spotCmd.AddCommand(spotOrderCmd)
}

func printSpotOrdersTable(orders []api.SpotOrderResponse) error {
	if len(orders) == 0 {
		fmt.Println("No open orders")
		return nil
	}

	table := output.NewTableWriter("ORDER ID", "SYMBOL", "SIDE", "TYPE", "AMOUNT", "PRICE", "FILLED", "STATUS")

	for i := range orders {
		o := &orders[i]
		status := "OPEN"
		if o.IsCancelled {
			status = "CANCELED"
		} else if !o.IsLive {
			status = "FILLED"
		}
		table.AddRow(
			o.OrderID,
			strings.ToUpper(o.Symbol),
			strings.ToUpper(o.Side),
			strings.ToUpper(o.Type),
			o.OriginalAmount,
			o.Price,
			o.ExecutedAmount,
			status,
		)
	}

	table.Render()
	return nil
}

func formatSpotCancelAllLine(o api.SpotOrderResponse) string {
	return fmt.Sprintf("  %s  %s %s  amount=%s  price=$%s",
		o.OrderID, strings.ToUpper(o.Symbol), strings.ToUpper(o.Side), o.OriginalAmount, o.Price)
}

func printSpotOrderDetail(o *api.SpotOrderResponse) error {
	fmt.Println()
	fmt.Println("Order placed successfully!")
	fmt.Printf("  Order ID:     %s\n", o.OrderID)
	if o.ClientOrderID != "" {
		fmt.Printf("  Client ID:    %s\n", o.ClientOrderID)
	}
	status := "OPEN"
	if o.IsCancelled {
		status = "CANCELED"
	} else if !o.IsLive {
		status = "FILLED"
	}
	fmt.Printf("  Status:       %s\n", status)
	fmt.Printf("  Symbol:       %s\n", strings.ToUpper(o.Symbol))
	fmt.Printf("  Side:         %s\n", strings.ToUpper(o.Side))
	fmt.Printf("  Amount:       %s @ $%s\n", o.OriginalAmount, o.Price)
	fmt.Println()
	return nil
}

func printSpotOrderStatus(o *api.SpotOrderResponse) error {
	fmt.Println()
	fmt.Printf("Order ID:       %s\n", o.OrderID)
	if o.ClientOrderID != "" {
		fmt.Printf("Client ID:      %s\n", o.ClientOrderID)
	}
	status := "OPEN"
	if o.IsCancelled {
		status = "CANCELED"
	} else if !o.IsLive {
		status = "FILLED"
	}
	fmt.Printf("Status:         %s\n", status)
	fmt.Printf("Symbol:         %s\n", strings.ToUpper(o.Symbol))
	fmt.Printf("Side:           %s\n", strings.ToUpper(o.Side))
	fmt.Printf("Type:           %s\n", strings.ToUpper(o.Type))
	fmt.Printf("Price:          $%s\n", o.Price)
	if o.AvgExecutionPrice != "" && o.AvgExecutionPrice != "0.00" {
		fmt.Printf("Avg Fill:       $%s\n", o.AvgExecutionPrice)
	}
	fmt.Printf("Amount:         %s\n", o.OriginalAmount)
	fmt.Printf("Filled:         %s\n", o.ExecutedAmount)
	fmt.Printf("Remaining:      %s\n", o.RemainingAmount)
	fmt.Println()
	return nil
}
