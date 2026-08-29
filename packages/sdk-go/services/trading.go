package services

import (
	"context"
	"errors"
	"strings"

	"github.com/gemini/developer-platform/packages/sdk-go/generated/trading"
	"github.com/gemini/developer-platform/packages/sdk-go/transport"
	"github.com/gemini/developer-platform/packages/sdk-go/types"
)

// TradingService provides access to authenticated order management and execution endpoints.
type TradingService struct {
	baseService
}

// CancelAllOrdersOptions controls the destructive account-wide cancellation
// endpoint. Callers must explicitly set Confirm to true before a request is
// sent.
type CancelAllOrdersOptions struct {
	Confirm bool
}

// NewTradingService creates a new TradingService.
func NewTradingService(client *transport.Client, baseURL string) *TradingService {
	return &TradingService{
		baseService: newBaseService(client, baseURL),
	}
}

// NewOrder submits a new order to the Gemini matching engine.
func (s *TradingService) NewOrder(ctx context.Context, req *trading.NewOrderRequest) (*trading.LimitOrderResponse, error) {
	if err := validateNewOrderRequest(req); err != nil {
		return nil, err
	}
	var res trading.LimitOrderResponse
	if err := s.post(ctx, "/v1/order/new", req, &res); err != nil {
		return nil, err
	}
	return &res, nil
}

func validateNewOrderRequest(req *trading.NewOrderRequest) error {
	if req == nil {
		return errors.New("gemini trading: order request is required")
	}

	if req.StopPrice != nil && strings.TrimSpace(*req.StopPrice) == "" {
		return errors.New("gemini trading: stop price must be a non-empty decimal")
	}
	if req.StopPrice == nil {
		if req.Type == trading.NewOrderRequestTypeExchangeStopLimit {
			return errors.New("gemini trading: stop-limit orders require stop price")
		}
		return nil
	}

	if req.Type != trading.NewOrderRequestTypeExchangeStopLimit {
		return errors.New("gemini trading: stop price is only valid for stop-limit orders")
	}
	if req.Options != nil && len(*req.Options) > 0 {
		return errors.New("gemini trading: stop-limit orders cannot use execution options")
	}

	price, err := types.ParseDecimal(req.Price)
	if err != nil || !price.IsPositive() {
		return errors.New("gemini trading: stop-limit price must be a positive decimal")
	}
	stopPrice, err := types.ParseDecimal(*req.StopPrice)
	if err != nil || !stopPrice.IsPositive() {
		return errors.New("gemini trading: stop price must be a positive decimal")
	}

	switch req.Side {
	case trading.NewOrderRequestSideBuy:
		if stopPrice.Cmp(price) >= 0 {
			return errors.New("gemini trading: buy stop price must be below the limit price")
		}
	case trading.NewOrderRequestSideSell:
		if stopPrice.Cmp(price) <= 0 {
			return errors.New("gemini trading: sell stop price must be above the limit price")
		}
	default:
		return errors.New("gemini trading: stop-limit order side must be buy or sell")
	}
	return nil
}

// OrderOption configures an outgoing order request.
type OrderOption func(*trading.NewOrderRequest)

// WithClientOrderID assigns a custom client-specified order ID for tracking and idempotency.
func WithClientOrderID(clientOrderID string) OrderOption {
	return func(req *trading.NewOrderRequest) {
		req.ClientOrderId = &clientOrderID
	}
}

func withOrderAccount(account string) OrderOption {
	return func(req *trading.NewOrderRequest) {
		req.Account = &account
	}
}

// WithStopPrice sets a stop loss trigger price and configures the order type as exchange stop limit.
func WithStopPrice(stopPrice types.Decimal) OrderOption {
	return func(req *trading.NewOrderRequest) {
		s := stopPrice.String()
		req.StopPrice = &s
		req.Type = trading.NewOrderRequestTypeExchangeStopLimit
		// Execution options apply only to exchange-limit orders. A stop-limit
		// order cannot also be maker-or-cancel or immediate-or-cancel.
		req.Options = nil
	}
}

func (s *TradingService) buildAndExecuteOrder(ctx context.Context, side trading.NewOrderRequestSide, symbol string, amount, price types.Decimal, optType *trading.NewOrderRequestOptions, opts []OrderOption) (*trading.LimitOrderResponse, error) {
	req := &trading.NewOrderRequest{
		Symbol: symbol,
		Side:   side,
		Type:   trading.NewOrderRequestTypeExchangeLimit,
		Amount: amount.String(),
		Price:  price.String(),
	}
	if optType != nil {
		req.Options = &[]trading.NewOrderRequestOptions{*optType}
	}
	for _, opt := range opts {
		opt(req)
	}
	return s.NewOrder(ctx, req)
}

// PostOnlyBid places a Maker-or-Cancel buy limit order.
func (s *TradingService) PostOnlyBid(ctx context.Context, symbol string, amount, price types.Decimal, opts ...OrderOption) (*trading.LimitOrderResponse, error) {
	moc := trading.MakerOrCancel
	return s.buildAndExecuteOrder(ctx, trading.NewOrderRequestSideBuy, symbol, amount, price, &moc, opts)
}

// PostOnlyAsk places a Maker-or-Cancel sell limit order.
func (s *TradingService) PostOnlyAsk(ctx context.Context, symbol string, amount, price types.Decimal, opts ...OrderOption) (*trading.LimitOrderResponse, error) {
	moc := trading.MakerOrCancel
	return s.buildAndExecuteOrder(ctx, trading.NewOrderRequestSideSell, symbol, amount, price, &moc, opts)
}

// LimitBuy places a standard buy limit order.
func (s *TradingService) LimitBuy(ctx context.Context, symbol string, amount, price types.Decimal, opts ...OrderOption) (*trading.LimitOrderResponse, error) {
	return s.buildAndExecuteOrder(ctx, trading.NewOrderRequestSideBuy, symbol, amount, price, nil, opts)
}

// LimitSell places a standard sell limit order.
func (s *TradingService) LimitSell(ctx context.Context, symbol string, amount, price types.Decimal, opts ...OrderOption) (*trading.LimitOrderResponse, error) {
	return s.buildAndExecuteOrder(ctx, trading.NewOrderRequestSideSell, symbol, amount, price, nil, opts)
}

// ImmediateOrCancelBuy places an IOC buy limit order.
func (s *TradingService) ImmediateOrCancelBuy(ctx context.Context, symbol string, amount, price types.Decimal, opts ...OrderOption) (*trading.LimitOrderResponse, error) {
	ioc := trading.ImmediateOrCancel
	return s.buildAndExecuteOrder(ctx, trading.NewOrderRequestSideBuy, symbol, amount, price, &ioc, opts)
}

// ImmediateOrCancelSell places an IOC sell limit order.
func (s *TradingService) ImmediateOrCancelSell(ctx context.Context, symbol string, amount, price types.Decimal, opts ...OrderOption) (*trading.LimitOrderResponse, error) {
	ioc := trading.ImmediateOrCancel
	return s.buildAndExecuteOrder(ctx, trading.NewOrderRequestSideSell, symbol, amount, price, &ioc, opts)
}

// CancelOrder cancels an active order by order_id or client_order_id.
func (s *TradingService) CancelOrder(ctx context.Context, req *trading.CancelOrderRequest) (*trading.CancelOrderResponse, error) {
	var res trading.CancelOrderResponse
	if err := s.post(ctx, "/v1/order/cancel", req, &res); err != nil {
		return nil, err
	}
	return &res, nil
}

// CancelAllOrders cancels all active orders for the authenticated account/session
// after explicit confirmation. The variadic form preserves source compatibility
// for existing callers, but omitting confirmation now fails closed.
func (s *TradingService) CancelAllOrders(ctx context.Context, req *trading.CancelAllOrdersRequest, options ...CancelAllOrdersOptions) (*trading.CancelAllResult, error) {
	if len(options) != 1 || !options[0].Confirm {
		return nil, transport.ErrCancelConfirmationRequired
	}
	if req == nil {
		req = &trading.CancelAllOrdersRequest{}
	}
	var res trading.CancelAllResult
	if err := s.post(ctx, "/v1/order/cancel/all", req, &res); err != nil {
		return nil, err
	}
	return &res, nil
}

// GetOrderStatus gets current status for an order.
func (s *TradingService) GetOrderStatus(ctx context.Context, req *trading.OrderStatusRequest) (*trading.LimitOrderResponse, error) {
	var res trading.LimitOrderResponse
	if err := s.post(ctx, "/v1/order/status", req, &res); err != nil {
		return nil, err
	}
	return &res, nil
}

// GetOrderStatusByID gets current status for an order by its unsigned 64-bit ID.
func (s *TradingService) GetOrderStatusByID(ctx context.Context, orderID uint64) (*trading.LimitOrderResponse, error) {
	return s.GetOrderStatus(ctx, &trading.OrderStatusRequest{
		OrderId: orderID,
	})
}

// GetActiveOrders returns all currently open orders.
func (s *TradingService) GetActiveOrders(ctx context.Context, req *trading.ListActiveOrdersJSONBody) ([]trading.LimitOrderResponse, error) {
	if req == nil {
		req = &trading.ListActiveOrdersJSONBody{}
	}
	var res []trading.LimitOrderResponse
	if err := s.post(ctx, "/v1/orders", req, &res); err != nil {
		return nil, err
	}
	return res, nil
}

// GetPastTrades returns execution history for the authenticated account.
func (s *TradingService) GetPastTrades(ctx context.Context, req *trading.MyTradesRequest) ([]trading.MyTrade, error) {
	var res []trading.MyTrade
	if err := s.post(ctx, "/v1/mytrades", req, &res); err != nil {
		return nil, err
	}
	return res, nil
}

// GetPastTradesBySymbol returns execution history for a symbol with optional limit.
func (s *TradingService) GetPastTradesBySymbol(ctx context.Context, symbol string, limitTrades ...int) ([]trading.MyTrade, error) {
	req := &trading.MyTradesRequest{
		Symbol: &symbol,
	}
	if len(limitTrades) > 0 && limitTrades[0] > 0 {
		req.LimitTrades = &limitTrades[0]
	}
	return s.GetPastTrades(ctx, req)
}
