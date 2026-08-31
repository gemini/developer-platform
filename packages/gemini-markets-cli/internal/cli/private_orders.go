package cli

import (
	"context"
	"fmt"
	"io"
	"strconv"
	"strings"

	"github.com/gemini/developer-platform/packages/gemini-markets-cli/internal/output"
	"github.com/gemini/developer-platform/packages/sdk-go/generated/predictions"
	"github.com/gemini/developer-platform/packages/sdk-go/generated/trading"
	sdkservices "github.com/gemini/developer-platform/packages/sdk-go/services"
	sdktypes "github.com/gemini/developer-platform/packages/sdk-go/types"
	"github.com/spf13/cobra"
)

// SpotOrdersClient is the narrow part of the SDK TradingService used by the
// spot order commands.
type SpotOrdersClient interface {
	NewOrder(context.Context, *trading.NewOrderRequest) (*trading.LimitOrderResponse, error)
	GetActiveOrders(context.Context, *trading.ListActiveOrdersJSONBody) ([]trading.LimitOrderResponse, error)
	GetOrderStatus(context.Context, *trading.OrderStatusRequest) (*trading.LimitOrderResponse, error)
	CancelOrder(context.Context, *trading.CancelOrderRequest) (*trading.CancelOrderResponse, error)
}

// PredictionOrdersClient is the narrow part of the SDK PredictionsService
// used by the prediction order commands.
type PredictionOrdersClient interface {
	NewOrder(context.Context, *predictions.OrderRequest) (*predictions.OrderResponse, error)
	GetActiveOrders(context.Context, *predictions.GetActiveOrdersJSONRequestBody) (*predictions.OrdersResponse, error)
	GetOrderHistory(context.Context, *predictions.GetOrderHistoryJSONRequestBody) (*predictions.OrdersResponse, error)
	CancelOrder(context.Context, *predictions.CancelOrderJSONRequestBody) (*sdkservices.PredictionOrderOperationResponse, error)
}

// SpotOrdersFactory creates the authenticated spot trading service and its
// owner. The owner is closed after each command invocation.
type SpotOrdersFactory func(context.Context, GlobalOptions) (SpotOrdersClient, io.Closer, error)

// PredictionOrdersFactory creates the authenticated prediction trading
// service and its owner. The owner is closed after each command invocation.
type PredictionOrdersFactory func(context.Context, GlobalOptions) (PredictionOrdersClient, io.Closer, error)

func defaultSpotOrdersFactory(ctx context.Context, options GlobalOptions) (SpotOrdersClient, io.Closer, error) {
	value, err := newPrivateSession(ctx, options)
	if err != nil {
		return nil, nil, err
	}
	return value.Client.Trading, closeSession(value), nil
}

func defaultPredictionOrdersFactory(ctx context.Context, options GlobalOptions) (PredictionOrdersClient, io.Closer, error) {
	value, err := newPrivateSession(ctx, options)
	if err != nil {
		return nil, nil, err
	}
	return value.Client.Predictions, closeSession(value), nil
}

// NewOrdersCommand creates the authenticated spot and prediction order
// command groups.
//
// Root command wiring intentionally remains in root.go's owner: callers should
// add the returned command with root.AddCommand(NewOrdersCommand()).
func NewOrdersCommand() *cobra.Command {
	return NewOrdersCommandWithFactories(defaultSpotOrdersFactory, defaultPredictionOrdersFactory)
}

// NewOrdersCommandWithFactories creates orders with injected SDK consumers.
// It is primarily useful for focused command tests.
func NewOrdersCommandWithFactories(spotFactory SpotOrdersFactory, predictionFactory PredictionOrdersFactory) *cobra.Command {
	if spotFactory == nil {
		spotFactory = defaultSpotOrdersFactory
	}
	if predictionFactory == nil {
		predictionFactory = defaultPredictionOrdersFactory
	}

	command := &cobra.Command{
		Use:     "orders",
		Aliases: []string{"order"},
		Short:   "Authenticated order operations",
		Args:    cobra.NoArgs,
	}
	command.AddCommand(newSpotOrdersCommand(spotFactory), newPredictionOrdersCommand(predictionFactory))
	return command
}

// NewPrivateOrdersCommand is an explicit-name alias for NewOrdersCommand.
func NewPrivateOrdersCommand() *cobra.Command { return NewOrdersCommand() }

// NewPrivateOrdersCommandWithFactories is the explicit-name form for callers
// that need to inject SDK consumers into the private order tree.
func NewPrivateOrdersCommandWithFactories(spotFactory SpotOrdersFactory, predictionFactory PredictionOrdersFactory) *cobra.Command {
	return NewOrdersCommandWithFactories(spotFactory, predictionFactory)
}

func newSpotOrdersCommand(factory SpotOrdersFactory) *cobra.Command {
	command := &cobra.Command{Use: "spot", Short: "Manage spot exchange orders", Args: cobra.NoArgs}
	command.AddCommand(
		newSpotPlaceCommand(factory),
		newSpotListCommand(factory),
		newSpotGetCommand(factory),
		newSpotCancelCommand(factory),
	)
	return command
}

func newSpotPlaceCommand(factory SpotOrdersFactory) *cobra.Command {
	var (
		symbol        string
		side          string
		amount        string
		price         string
		orderType     string
		option        string
		stopPrice     string
		clientOrderID string
		accountName   string
		dryRun        bool
	)
	command := &cobra.Command{
		Use:   "place",
		Short: "Place a spot order",
		Example: "  gemini-markets orders spot place --symbol BTCUSD --side buy --amount 0.01 --price 60000 --dry-run\n" +
			"  gemini-markets --environment sandbox orders spot place --symbol BTCUSD --side sell --amount 0.01 --price 70000",
		Args: cobra.NoArgs,
		RunE: func(cmd *cobra.Command, _ []string) error {
			request, err := buildSpotOrderRequest(symbol, side, amount, price, orderType, option, stopPrice, clientOrderID, accountName)
			if err != nil {
				return err
			}
			format := Options(cmd).Format
			if dryRun {
				return writeSpotOrderRequest(cmd.OutOrStdout(), request, format)
			}
			client, closer, err := factory(cmd.Context(), Options(cmd))
			if err != nil {
				return fmt.Errorf("create spot orders client: %w", err)
			}
			if client == nil {
				if closer != nil {
					_ = closer.Close()
				}
				return fmt.Errorf("spot orders service is unavailable")
			}
			if closer != nil {
				defer func() { _ = closer.Close() }()
			}
			response, err := client.NewOrder(cmd.Context(), request)
			if err != nil {
				return fmt.Errorf("place spot order: %w", err)
			}
			return writeSpotOrderResponse(cmd.OutOrStdout(), response, format)
		},
	}
	command.Flags().StringVar(&symbol, "symbol", "", "trading symbol, for example BTCUSD")
	command.Flags().StringVar(&side, "side", "", "order side (buy or sell)")
	command.Flags().StringVar(&amount, "amount", "", "base amount")
	command.Flags().StringVar(&price, "price", "", "price per unit")
	command.Flags().StringVar(&orderType, "type", string(trading.NewOrderRequestTypeExchangeLimit), "order type (exchange limit or exchange stop limit; use --option immediate-or-cancel for IOC)")
	command.Flags().StringVar(&option, "option", "", "execution option (maker-or-cancel, immediate-or-cancel, or fill-or-kill)")
	command.Flags().StringVar(&stopPrice, "stop-price", "", "stop trigger price for stop-limit orders")
	command.Flags().StringVar(&clientOrderID, "client-order-id", "", "client-specified order ID")
	command.Flags().StringVarP(&accountName, "account", "a", "primary", "account or subaccount name")
	command.Flags().BoolVar(&dryRun, "dry-run", false, "print the generated request without submitting it")
	return command
}

func buildSpotOrderRequest(symbol, side, amount, price, orderType, option, stopPrice, clientOrderID, accountName string) (*trading.NewOrderRequest, error) {
	symbol = strings.TrimSpace(symbol)
	side = strings.ToLower(strings.TrimSpace(side))
	amount = strings.TrimSpace(amount)
	price = strings.TrimSpace(price)
	orderType = strings.ToLower(strings.TrimSpace(orderType))
	option = strings.ToLower(strings.TrimSpace(option))
	stopPrice = strings.TrimSpace(stopPrice)
	clientOrderID = strings.TrimSpace(clientOrderID)
	accountName = strings.TrimSpace(accountName)
	if symbol == "" {
		return nil, fmt.Errorf("symbol is required")
	}
	if !trading.NewOrderRequestSide(side).Valid() {
		return nil, fmt.Errorf("invalid side %q (want buy or sell)", side)
	}
	if amount == "" {
		return nil, fmt.Errorf("amount is required")
	}
	if err := validatePositiveDecimal(amount, "amount"); err != nil {
		return nil, err
	}
	if price == "" {
		return nil, fmt.Errorf("price is required")
	}
	limit, err := positiveDecimal(price, "price")
	if err != nil {
		return nil, err
	}
	orderTypeValue := trading.NewOrderRequestType(orderType)
	if !orderTypeValue.Valid() || (orderTypeValue != trading.NewOrderRequestTypeExchangeLimit && orderTypeValue != trading.NewOrderRequestTypeExchangeStopLimit) {
		if orderTypeValue == trading.NewOrderRequestTypeExchangeMarket {
			return nil, fmt.Errorf("exchange market orders are unsupported; use exchange limit with --option immediate-or-cancel")
		}
		return nil, fmt.Errorf("invalid order type %q", orderType)
	}
	if accountName == "" {
		return nil, fmt.Errorf("account is required")
	}
	if stopPrice != "" && orderTypeValue != trading.NewOrderRequestTypeExchangeStopLimit {
		return nil, fmt.Errorf("stop-price requires exchange stop limit order type")
	}
	if orderTypeValue == trading.NewOrderRequestTypeExchangeStopLimit && stopPrice == "" {
		return nil, fmt.Errorf("stop-price is required for exchange stop limit orders")
	}
	if stopPrice != "" {
		stop, err := positiveDecimal(stopPrice, "stop-price")
		if err != nil {
			return nil, err
		}
		if option != "" {
			return nil, fmt.Errorf("stop-limit orders cannot use execution options")
		}
		switch trading.NewOrderRequestSide(side) {
		case trading.NewOrderRequestSideBuy:
			if stop.Cmp(limit) >= 0 {
				return nil, fmt.Errorf("buy stop-price must be less than price")
			}
		case trading.NewOrderRequestSideSell:
			if stop.Cmp(limit) <= 0 {
				return nil, fmt.Errorf("sell stop-price must be greater than price")
			}
		}
	}
	request := &trading.NewOrderRequest{
		Account: stringPointer(accountName),
		Amount:  amount,
		Price:   price,
		Request: "/v1/order/new",
		Side:    trading.NewOrderRequestSide(side),
		Symbol:  symbol,
		Type:    orderTypeValue,
	}
	if stopPrice != "" {
		request.StopPrice = &stopPrice
	}
	if clientOrderID != "" {
		request.ClientOrderId = &clientOrderID
	}
	if option != "" {
		value := trading.NewOrderRequestOptions(option)
		if !value.Valid() {
			return nil, fmt.Errorf("invalid option %q", option)
		}
		request.Options = &[]trading.NewOrderRequestOptions{value}
	}
	return request, nil
}

func newSpotListCommand(factory SpotOrdersFactory) *cobra.Command {
	var accountName string
	command := &cobra.Command{
		Use:   "list",
		Short: "List active spot orders",
		Args:  cobra.NoArgs,
		RunE: func(cmd *cobra.Command, _ []string) error {
			accountName = strings.TrimSpace(accountName)
			if accountName == "" {
				return fmt.Errorf("account is required")
			}
			client, closer, err := factory(cmd.Context(), Options(cmd))
			if err != nil {
				return fmt.Errorf("create spot orders client: %w", err)
			}
			if client == nil {
				if closer != nil {
					_ = closer.Close()
				}
				return fmt.Errorf("spot orders service is unavailable")
			}
			if closer != nil {
				defer func() { _ = closer.Close() }()
			}
			orders, err := client.GetActiveOrders(cmd.Context(), &trading.ListActiveOrdersJSONBody{Account: stringPointer(accountName)})
			if err != nil {
				return fmt.Errorf("list spot orders: %w", err)
			}
			return writeSpotOrders(cmd.OutOrStdout(), orders, Options(cmd).Format)
		},
	}
	command.Flags().StringVarP(&accountName, "account", "a", "primary", "account or subaccount name")
	return command
}

func newSpotGetCommand(factory SpotOrdersFactory) *cobra.Command {
	var (
		accountName   string
		orderID       string
		clientOrderID string
		includeTrades bool
	)
	command := &cobra.Command{
		Use:   "get",
		Short: "Get a spot order status",
		Args:  cobra.NoArgs,
		RunE: func(cmd *cobra.Command, _ []string) error {
			id, err := optionalUint64(orderID, "order-id")
			if err != nil {
				return err
			}
			clientOrderID = strings.TrimSpace(clientOrderID)
			if id == 0 && clientOrderID == "" {
				return fmt.Errorf("one of order-id or client-order-id is required")
			}
			if id != 0 && clientOrderID != "" {
				return fmt.Errorf("order-id and client-order-id cannot be combined")
			}
			accountName = strings.TrimSpace(accountName)
			if accountName == "" {
				return fmt.Errorf("account is required")
			}
			request := &trading.OrderStatusRequest{Account: stringPointer(accountName), ClientOrderId: optionalString(clientOrderID), IncludeTrades: boolPointerIfSet(includeTrades, cmd.Flags().Changed("include-trades")), OrderId: id, Request: "/v1/order/status"}
			client, closer, err := factory(cmd.Context(), Options(cmd))
			if err != nil {
				return fmt.Errorf("create spot orders client: %w", err)
			}
			if client == nil {
				if closer != nil {
					_ = closer.Close()
				}
				return fmt.Errorf("spot orders service is unavailable")
			}
			if closer != nil {
				defer func() { _ = closer.Close() }()
			}
			response, err := client.GetOrderStatus(cmd.Context(), request)
			if err != nil {
				return fmt.Errorf("get spot order: %w", err)
			}
			return writeSpotOrderResponse(cmd.OutOrStdout(), response, Options(cmd).Format)
		},
	}
	command.Flags().StringVarP(&accountName, "account", "a", "primary", "account or subaccount name")
	command.Flags().StringVar(&orderID, "order-id", "", "numeric order ID")
	command.Flags().StringVar(&clientOrderID, "client-order-id", "", "client-specified order ID")
	command.Flags().BoolVar(&includeTrades, "include-trades", false, "include individual fills")
	return command
}

func newSpotCancelCommand(factory SpotOrdersFactory) *cobra.Command {
	var (
		accountName string
		orderID     string
	)
	command := &cobra.Command{
		Use:   "cancel",
		Short: "Cancel a spot order",
		Args:  cobra.NoArgs,
		RunE: func(cmd *cobra.Command, _ []string) error {
			id, err := requiredUint64(orderID, "order-id")
			if err != nil {
				return err
			}
			accountName = strings.TrimSpace(accountName)
			if accountName == "" {
				return fmt.Errorf("account is required")
			}
			client, closer, err := factory(cmd.Context(), Options(cmd))
			if err != nil {
				return fmt.Errorf("create spot orders client: %w", err)
			}
			if client == nil {
				if closer != nil {
					_ = closer.Close()
				}
				return fmt.Errorf("spot orders service is unavailable")
			}
			if closer != nil {
				defer func() { _ = closer.Close() }()
			}
			response, err := client.CancelOrder(cmd.Context(), &trading.CancelOrderRequest{Account: stringPointer(accountName), OrderId: id, Request: "/v1/order/cancel"})
			if err != nil {
				return fmt.Errorf("cancel spot order: %w", err)
			}
			return writeSpotOrderResponse(cmd.OutOrStdout(), response, Options(cmd).Format)
		},
	}
	command.Flags().StringVarP(&accountName, "account", "a", "primary", "account or subaccount name")
	command.Flags().StringVar(&orderID, "order-id", "", "numeric order ID")
	return command
}

func newPredictionOrdersCommand(factory PredictionOrdersFactory) *cobra.Command {
	command := &cobra.Command{Use: "prediction", Aliases: []string{"predictions"}, Short: "Manage prediction-market orders", Args: cobra.NoArgs}
	command.AddCommand(
		newPredictionPlaceCommand(factory),
		newPrivatePredictionListCommand(factory),
		newPredictionCancelCommand(factory),
	)
	return command
}

func newPredictionPlaceCommand(factory PredictionOrdersFactory) *cobra.Command {
	var (
		symbol        string
		side          string
		outcome       string
		quantity      string
		price         string
		orderType     string
		stopPrice     string
		timeInForce   string
		makerOrCancel bool
		dryRun        bool
	)
	command := &cobra.Command{
		Use:   "place",
		Short: "Place a prediction-market order",
		Example: "  gemini-markets orders prediction place --symbol GEMI-FEDJAN26-DN25 --side buy --outcome yes --quantity 10 --price 0.65 --dry-run\n" +
			"  gemini-markets --environment sandbox orders prediction place --symbol GEMI-FEDJAN26-DN25 --side buy --outcome yes --quantity 10 --price 0.65",
		Args: cobra.NoArgs,
		RunE: func(cmd *cobra.Command, _ []string) error {
			request, err := buildPredictionOrderRequest(symbol, side, outcome, quantity, price, orderType, stopPrice, timeInForce, makerOrCancel)
			if err != nil {
				return err
			}
			format := Options(cmd).Format
			if dryRun {
				return writePredictionOrderRequest(cmd.OutOrStdout(), request, format)
			}
			client, closer, err := factory(cmd.Context(), Options(cmd))
			if err != nil {
				return fmt.Errorf("create prediction orders client: %w", err)
			}
			if client == nil {
				if closer != nil {
					_ = closer.Close()
				}
				return fmt.Errorf("prediction orders service is unavailable")
			}
			if closer != nil {
				defer func() { _ = closer.Close() }()
			}
			response, err := client.NewOrder(cmd.Context(), request)
			if err != nil {
				return fmt.Errorf("place prediction order: %w", err)
			}
			return writePredictionOrderResponse(cmd.OutOrStdout(), response, format)
		},
	}
	command.Flags().StringVar(&symbol, "symbol", "", "prediction contract symbol")
	command.Flags().StringVar(&side, "side", "", "order side (buy or sell)")
	command.Flags().StringVar(&outcome, "outcome", "", "contract outcome (yes or no)")
	command.Flags().StringVar(&quantity, "quantity", "", "number of contracts")
	command.Flags().StringVar(&price, "price", "", "limit price")
	command.Flags().StringVar(&orderType, "type", string(predictions.OrderTypeLimit), "order type (limit or stop-limit)")
	command.Flags().StringVar(&stopPrice, "stop-price", "", "stop trigger price for stop-limit orders")
	command.Flags().StringVar(&timeInForce, "time-in-force", "", "time-in-force (good-til-cancel, immediate-or-cancel, or fill-or-kill)")
	command.Flags().BoolVar(&makerOrCancel, "maker-or-cancel", false, "require maker-only execution")
	command.Flags().BoolVar(&dryRun, "dry-run", false, "print the generated request without submitting it")
	return command
}

func buildPredictionOrderRequest(symbol, side, outcome, quantity, price, orderType, stopPrice, timeInForce string, makerOrCancel bool) (*predictions.OrderRequest, error) {
	symbol = strings.TrimSpace(symbol)
	side = strings.ToLower(strings.TrimSpace(side))
	outcome = strings.ToLower(strings.TrimSpace(outcome))
	quantity = strings.TrimSpace(quantity)
	price = strings.TrimSpace(price)
	orderType = strings.ToLower(strings.TrimSpace(orderType))
	stopPrice = strings.TrimSpace(stopPrice)
	timeInForce = strings.ToLower(strings.TrimSpace(timeInForce))
	if symbol == "" {
		return nil, fmt.Errorf("symbol is required")
	}
	if !predictions.OrderSide(side).Valid() {
		return nil, fmt.Errorf("invalid side %q (want buy or sell)", side)
	}
	if !predictions.Outcome(outcome).Valid() {
		return nil, fmt.Errorf("invalid outcome %q (want yes or no)", outcome)
	}
	if quantity == "" {
		return nil, fmt.Errorf("quantity is required")
	}
	if err := validatePositiveDecimal(quantity, "quantity"); err != nil {
		return nil, err
	}
	if price == "" {
		return nil, fmt.Errorf("price is required")
	}
	limit, err := predictionPrice(price, "price")
	if err != nil {
		return nil, err
	}
	orderTypeValue := predictions.OrderType(orderType)
	if !orderTypeValue.Valid() {
		return nil, fmt.Errorf("invalid order type %q (want limit or stop-limit)", orderType)
	}
	if stopPrice != "" && orderTypeValue != predictions.OrderTypeStopLimit {
		return nil, fmt.Errorf("stop-price requires stop-limit order type")
	}
	if orderTypeValue == predictions.OrderTypeStopLimit && stopPrice == "" {
		return nil, fmt.Errorf("stop-price is required for stop-limit orders")
	}
	if stopPrice != "" {
		stop, err := predictionPrice(stopPrice, "stop-price")
		if err != nil {
			return nil, err
		}
		switch predictions.OrderSide(side) {
		case predictions.OrderSideBuy:
			if stop.Cmp(limit) > 0 {
				return nil, fmt.Errorf("buy stop-price must be less than or equal to price")
			}
		case predictions.OrderSideSell:
			if stop.Cmp(limit) < 0 {
				return nil, fmt.Errorf("sell stop-price must be greater than or equal to price")
			}
		}
	}
	request := &predictions.OrderRequest{
		OrderType: orderTypeValue,
		Outcome:   predictions.Outcome(outcome),
		Price:     price,
		Quantity:  quantity,
		Side:      predictions.OrderSide(side),
		Symbol:    symbol,
	}
	if stopPrice != "" {
		request.StopPrice = &stopPrice
	}
	if timeInForce != "" {
		value := predictions.TimeInForce(timeInForce)
		if !value.Valid() {
			return nil, fmt.Errorf("invalid time-in-force %q", timeInForce)
		}
		request.TimeInForce = &value
	}
	if makerOrCancel {
		request.MakerOrCancel = &makerOrCancel
	}
	return request, nil
}

func newPrivatePredictionListCommand(factory PredictionOrdersFactory) *cobra.Command {
	var (
		symbol  string
		limit   int
		offset  int
		history bool
		status  string
		from    int64
		to      int64
	)
	command := &cobra.Command{
		Use:   "list",
		Short: "List active prediction orders or order history",
		Args:  cobra.NoArgs,
		RunE: func(cmd *cobra.Command, _ []string) error {
			symbol = strings.TrimSpace(symbol)
			format := Options(cmd).Format
			if !history {
				request := &predictions.GetActiveOrdersJSONRequestBody{Symbol: optionalString(symbol)}
				if cmd.Flags().Changed("limit") {
					if limit < 1 {
						return fmt.Errorf("limit must be positive")
					}
					request.Limit = &limit
				}
				if cmd.Flags().Changed("offset") {
					if offset < 0 {
						return fmt.Errorf("offset cannot be negative")
					}
					request.Offset = &offset
				}
				client, closer, err := factory(cmd.Context(), Options(cmd))
				if err != nil {
					return fmt.Errorf("create prediction orders client: %w", err)
				}
				if client == nil {
					if closer != nil {
						_ = closer.Close()
					}
					return fmt.Errorf("prediction orders service is unavailable")
				}
				if closer != nil {
					defer func() { _ = closer.Close() }()
				}
				response, err := client.GetActiveOrders(cmd.Context(), request)
				if err != nil {
					return fmt.Errorf("list prediction orders: %w", err)
				}
				return writePredictionOrders(cmd.OutOrStdout(), response, format)
			}
			request := &predictions.GetOrderHistoryJSONRequestBody{Symbol: optionalString(symbol)}
			if cmd.Flags().Changed("limit") {
				if limit < 1 {
					return fmt.Errorf("limit must be positive")
				}
				request.Limit = &limit
			}
			if cmd.Flags().Changed("offset") {
				if offset < 0 {
					return fmt.Errorf("offset cannot be negative")
				}
				request.Offset = &offset
			}
			if cmd.Flags().Changed("from") {
				if from < 0 {
					return fmt.Errorf("from cannot be negative")
				}
				request.From = &from
			}
			if cmd.Flags().Changed("to") {
				if to < 0 {
					return fmt.Errorf("to cannot be negative")
				}
				request.To = &to
			}
			if cmd.Flags().Changed("status") {
				status = strings.ToLower(strings.TrimSpace(status))
				value := predictions.GetOrderHistoryJSONBodyStatus(status)
				if !value.Valid() {
					return fmt.Errorf("invalid status %q (want filled or cancelled)", status)
				}
				request.Status = &value
			}
			client, closer, err := factory(cmd.Context(), Options(cmd))
			if err != nil {
				return fmt.Errorf("create prediction orders client: %w", err)
			}
			if client == nil {
				if closer != nil {
					_ = closer.Close()
				}
				return fmt.Errorf("prediction orders service is unavailable")
			}
			if closer != nil {
				defer func() { _ = closer.Close() }()
			}
			response, err := client.GetOrderHistory(cmd.Context(), request)
			if err != nil {
				return fmt.Errorf("list prediction order history: %w", err)
			}
			return writePredictionOrders(cmd.OutOrStdout(), response, format)
		},
	}
	command.Flags().StringVar(&symbol, "symbol", "", "filter by contract symbol")
	command.Flags().IntVar(&limit, "limit", 0, "maximum number of orders")
	command.Flags().IntVar(&offset, "offset", 0, "number of orders to skip")
	command.Flags().BoolVar(&history, "history", false, "list filled and cancelled orders")
	command.Flags().StringVar(&status, "status", "", "history status (filled or cancelled)")
	command.Flags().Int64Var(&from, "from", 0, "history start time in Unix milliseconds")
	command.Flags().Int64Var(&to, "to", 0, "history end time in Unix milliseconds")
	return command
}

func newPredictionCancelCommand(factory PredictionOrdersFactory) *cobra.Command {
	var orderID string
	command := &cobra.Command{
		Use:   "cancel",
		Short: "Cancel a prediction-market order",
		Args:  cobra.NoArgs,
		RunE: func(cmd *cobra.Command, _ []string) error {
			id, err := requiredInt64(orderID, "order-id")
			if err != nil {
				return err
			}
			client, closer, err := factory(cmd.Context(), Options(cmd))
			if err != nil {
				return fmt.Errorf("create prediction orders client: %w", err)
			}
			if client == nil {
				if closer != nil {
					_ = closer.Close()
				}
				return fmt.Errorf("prediction orders service is unavailable")
			}
			if closer != nil {
				defer func() { _ = closer.Close() }()
			}
			response, err := client.CancelOrder(cmd.Context(), &predictions.CancelOrderJSONRequestBody{OrderId: id})
			if err != nil {
				return fmt.Errorf("cancel prediction order: %w", err)
			}
			return writePredictionOrderResponse(cmd.OutOrStdout(), response, Options(cmd).Format)
		},
	}
	command.Flags().StringVar(&orderID, "order-id", "", "numeric prediction order ID")
	return command
}

func optionalUint64(value, name string) (uint64, error) {
	value = strings.TrimSpace(value)
	if value == "" {
		return 0, nil
	}
	parsed, err := strconv.ParseUint(value, 10, 64)
	if err != nil || parsed == 0 {
		return 0, fmt.Errorf("%s must be a positive integer", name)
	}
	return parsed, nil
}

func requiredUint64(value, name string) (uint64, error) {
	parsed, err := optionalUint64(value, name)
	if err != nil {
		return 0, err
	}
	if parsed == 0 {
		return 0, fmt.Errorf("%s is required", name)
	}
	return parsed, nil
}

func requiredInt64(value, name string) (int64, error) {
	value = strings.TrimSpace(value)
	if value == "" {
		return 0, fmt.Errorf("%s is required", name)
	}
	parsed, err := strconv.ParseInt(value, 10, 64)
	if err != nil || parsed <= 0 {
		return 0, fmt.Errorf("%s must be a positive integer", name)
	}
	return parsed, nil
}

func validatePositiveDecimal(value, name string) error {
	_, err := positiveDecimal(value, name)
	return err
}

func positiveDecimal(value, name string) (sdktypes.Decimal, error) {
	decimal, err := sdktypes.ParseDecimal(value)
	if err != nil || !decimal.IsPositive() {
		return sdktypes.Decimal{}, fmt.Errorf("%s must be a positive decimal", name)
	}
	return decimal, nil
}

func predictionPrice(value, name string) (sdktypes.Decimal, error) {
	decimal, err := sdktypes.ParseDecimal(value)
	if err != nil || decimal.Cmp(sdktypes.MustParseDecimal("0.01")) < 0 || decimal.Cmp(sdktypes.MustParseDecimal("0.99")) > 0 {
		return sdktypes.Decimal{}, fmt.Errorf("%s must be a decimal between 0.01 and 0.99", name)
	}
	return decimal, nil
}

func stringPointer(value string) *string { return &value }

func optionalString(value string) *string {
	if value == "" {
		return nil
	}
	return &value
}

func boolPointerIfSet(value, set bool) *bool {
	if !set {
		return nil
	}
	return &value
}

func writeSpotOrderRequest(w io.Writer, value *trading.NewOrderRequest, format output.Format) error {
	if format == output.JSON {
		return output.Write(w, value, format)
	}
	return output.Write(w, output.TableData{Headers: []string{"FIELD", "VALUE"}, Rows: [][]string{
		{"account", privateStringValue(value.Account)}, {"symbol", value.Symbol}, {"side", string(value.Side)},
		{"type", string(value.Type)}, {"amount", value.Amount}, {"price", value.Price},
		{"option", spotOrderOptionsString(value.Options)},
		{"stop-price", privateStringValue(value.StopPrice)}, {"client-order-id", privateStringValue(value.ClientOrderId)},
	}}, format)
}

func writePredictionOrderRequest(w io.Writer, value *predictions.OrderRequest, format output.Format) error {
	if format == output.JSON {
		return output.Write(w, value, format)
	}
	return output.Write(w, output.TableData{Headers: []string{"FIELD", "VALUE"}, Rows: [][]string{
		{"symbol", value.Symbol}, {"side", string(value.Side)}, {"outcome", string(value.Outcome)},
		{"order-type", string(value.OrderType)}, {"quantity", value.Quantity}, {"price", value.Price},
		{"stop-price", privateStringValue(value.StopPrice)}, {"time-in-force", predictionTimeInForceString(value.TimeInForce)},
		{"maker-or-cancel", boolValue(value.MakerOrCancel)},
	}}, format)
}

func spotOrderOptionsString(value *[]trading.NewOrderRequestOptions) string {
	if value == nil {
		return ""
	}
	options := make([]string, 0, len(*value))
	for _, option := range *value {
		options = append(options, string(option))
	}
	return strings.Join(options, ",")
}

func writeSpotOrderResponse(w io.Writer, value any, format output.Format) error {
	if format == output.JSON {
		return output.Write(w, value, format)
	}
	return output.Write(w, spotOrderTable(value), format)
}

func writeSpotOrders(w io.Writer, values []trading.LimitOrderResponse, format output.Format) error {
	if format == output.JSON {
		return output.Write(w, values, format)
	}
	rows := make([][]string, 0, len(values))
	for _, value := range values {
		rows = append(rows, []string{orderStringValue(value.OrderId), orderStringValue(value.Symbol), orderStringValue(value.Side), orderStringValue(value.Price), boolValue(value.IsLive)})
	}
	return output.Write(w, output.TableData{Headers: []string{"ORDER ID", "SYMBOL", "SIDE", "PRICE", "LIVE"}, Rows: rows}, format)
}

func spotOrderTable(value any) output.TableData {
	var orderID, symbol, side, price, live string
	switch order := value.(type) {
	case *trading.LimitOrderResponse:
		if order == nil {
			return output.TableData{Headers: []string{"FIELD", "VALUE"}}
		}
		orderID, symbol, side, price, live = orderStringValue(order.OrderId), orderStringValue(order.Symbol), orderStringValue(order.Side), orderStringValue(order.Price), boolValue(order.IsLive)
	case *trading.CancelOrderResponse:
		if order == nil {
			return output.TableData{Headers: []string{"FIELD", "VALUE"}}
		}
		orderID, symbol, side, price, live = orderStringValue(order.OrderId), orderStringValue(order.Symbol), orderStringValue(order.Side), orderStringValue(order.Price), boolValue(order.IsLive)
	default:
		return output.TableData{Headers: []string{"FIELD", "VALUE"}, Rows: [][]string{{"response", fmt.Sprintf("%v", value)}}}
	}
	return output.TableData{Headers: []string{"ORDER ID", "SYMBOL", "SIDE", "PRICE", "LIVE"}, Rows: [][]string{{orderID, symbol, side, price, live}}}
}

func writePredictionOrderResponse(w io.Writer, value any, format output.Format) error {
	if format == output.JSON {
		return output.Write(w, value, format)
	}
	return output.Write(w, predictionOrderTable(value), format)
}

func writePredictionOrders(w io.Writer, value *predictions.OrdersResponse, format output.Format) error {
	if format == output.JSON {
		return output.Write(w, value, format)
	}
	return output.Write(w, predictionOrdersTable(value), format)
}

func predictionOrdersTable(value *predictions.OrdersResponse) output.TableData {
	rows := [][]string{}
	if value != nil && value.Orders != nil {
		rows = make([][]string, 0, len(*value.Orders))
		for _, order := range *value.Orders {
			rows = append(rows, []string{int64Value(order.OrderId), orderStringValue(order.Symbol), orderStringValue(order.Side), orderStringValue(order.Price), orderStringValue(order.Status)})
		}
	}
	return output.TableData{Headers: []string{"ORDER ID", "SYMBOL", "SIDE", "PRICE", "STATUS"}, Rows: rows}
}

func predictionOrderTable(value any) output.TableData {
	if order, ok := value.(*predictions.OrderResponse); ok {
		if order == nil {
			return output.TableData{Headers: []string{"FIELD", "VALUE"}}
		}
		return output.TableData{Headers: []string{"ORDER ID", "SYMBOL", "SIDE", "PRICE", "STATUS"}, Rows: [][]string{{int64Value(order.OrderId), orderStringValue(order.Symbol), orderStringValue(order.Side), orderStringValue(order.Price), orderStringValue(order.Status)}}}
	}
	if operation, ok := value.(*sdkservices.PredictionOrderOperationResponse); ok {
		if operation == nil {
			return output.TableData{Headers: []string{"FIELD", "VALUE"}}
		}
		return output.TableData{Headers: []string{"RESULT", "MESSAGE"}, Rows: [][]string{{operation.Result, operation.Message}}}
	}
	return output.TableData{Headers: []string{"FIELD", "VALUE"}, Rows: [][]string{{"response", fmt.Sprintf("%v", value)}}}
}

func privateStringValue(value *string) string {
	if value == nil {
		return ""
	}
	return *value
}

func orderStringValue(value any) string {
	switch typed := value.(type) {
	case *string:
		return privateStringValue(typed)
	case *trading.LimitOrderResponseSide:
		if typed != nil {
			return string(*typed)
		}
	case *trading.CancelOrderResponseSide:
		if typed != nil {
			return string(*typed)
		}
	case *predictions.OrderSide:
		if typed != nil {
			return string(*typed)
		}
	case *predictions.OrderStatus:
		if typed != nil {
			return string(*typed)
		}
	}
	return ""
}

func boolValue(value *bool) string {
	if value == nil {
		return ""
	}
	return strconv.FormatBool(*value)
}

func int64Value(value *int64) string {
	if value == nil {
		return ""
	}
	return strconv.FormatInt(*value, 10)
}

func predictionTimeInForceString(value *predictions.TimeInForce) string {
	if value == nil {
		return ""
	}
	return string(*value)
}
