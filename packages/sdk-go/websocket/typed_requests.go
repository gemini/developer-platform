package websocket

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"strconv"
	"strings"

	"github.com/gemini/developer-platform/packages/sdk-go/transport"
	"github.com/gemini/developer-platform/packages/sdk-go/types"
)

// JSONObject is the lossless generic object shape used by WebSocket methods
// whose result fields are intentionally open-ended in the API contract.
// ResponseFrame.DecodeResult uses json.Number for numeric values.
type JSONObject map[string]any

// OrderSide identifies whether an order buys or sells.
type OrderSide string

const (
	OrderSideBuy  OrderSide = "BUY"
	OrderSideSell OrderSide = "SELL"
)

// OrderType identifies the execution style requested by order.place. Stop-
// limit orders use OrderTypeLimit together with StopPrice.
type OrderType string

const (
	OrderTypeLimit  OrderType = "LIMIT"
	OrderTypeMarket OrderType = "MARKET"
)

// TimeInForce controls how long an order remains eligible for execution.
type TimeInForce string

const (
	TimeInForceGTC TimeInForce = "GTC"
	TimeInForceIOC TimeInForce = "IOC"
	TimeInForceFOK TimeInForce = "FOK"
	TimeInForceMOC TimeInForce = "MOC"
)

// EventOutcome identifies the prediction-market outcome attached to an order.
type EventOutcome string

const (
	EventOutcomeYes EventOutcome = "YES"
	EventOutcomeNo  EventOutcome = "NO"
)

// OrderPlaceParams is the typed payload for order.place. A stop-limit order
// uses Type "LIMIT" with both Price and StopPrice; the exchange reports its
// resulting order type as STOP_LIMIT on order events. The WebSocket contract
// permits an equal stop and limit price; REST order validation has separate
// strict inequality rules.
type OrderPlaceParams struct {
	Symbol        string       `json:"symbol"`
	Side          OrderSide    `json:"side"`
	Type          OrderType    `json:"type"`
	TimeInForce   TimeInForce  `json:"timeInForce"`
	Price         string       `json:"price,omitempty"`
	StopPrice     string       `json:"stopPrice,omitempty"`
	Quantity      string       `json:"quantity"`
	ClientOrderID string       `json:"clientOrderId,omitempty"`
	EventOutcome  EventOutcome `json:"eventOutcome,omitempty"`
}

// OrderCancelParams is the typed payload for order.cancel. OrderID accepts
// either the numeric or string identifier form supported by the exchange.
type OrderCancelParams struct {
	OrderID any `json:"orderId"`
}

// CancelAllOptions protects the account-wide cancellation methods from an
// accidental empty invocation.
type CancelAllOptions struct {
	Confirm bool
}

// ErrCancelConfirmationRequired indicates that a destructive cancel-all
// request was not explicitly confirmed by the caller.
var ErrCancelConfirmationRequired = transport.ErrCancelConfirmationRequired

// ConnInfo returns the open-ended result of conninfo.
func (c *Client) ConnInfo(ctx context.Context) (JSONObject, error) {
	response, err := c.Request(ctx, string(OpConnInfo), nil)
	if err != nil {
		return nil, err
	}
	return decodeObjectResult(response, string(OpConnInfo))
}

// Time returns the raw result of time. The API does not guarantee a stable
// result shape, so the raw JSON is preserved for callers to decode as needed.
func (c *Client) Time(ctx context.Context) (json.RawMessage, error) {
	response, err := c.Request(ctx, string(OpTime), nil)
	if err != nil {
		return nil, err
	}
	var result json.RawMessage
	if err := response.DecodeResult(&result); err != nil {
		return nil, fmt.Errorf("gemini websocket: decoding time response: %w", err)
	}
	return result, nil
}

// ListSubscriptions returns the streams currently registered on the
// connection.
func (c *Client) ListSubscriptions(ctx context.Context) ([]string, error) {
	response, err := c.Request(ctx, string(OpListSubscriptions), nil)
	if err != nil {
		return nil, err
	}
	var result []string
	if err := response.DecodeResult(&result); err != nil {
		return nil, fmt.Errorf("gemini websocket: decoding subscriptions response: %w", err)
	}
	return result, nil
}

// SubscribeStreams subscribes to one or more raw stream names using the
// documented WebSocket control-plane method. Private stream names require an
// authenticated client. Raw subscriptions are not represented in the typed
// subscription registry and are not replayed after a reconnect; use a typed
// Subscribe* method when automatic feed resumption is required.
func (c *Client) SubscribeStreams(ctx context.Context, streams ...string) error {
	return c.updateStreams(ctx, string(OpSubscribe), streams)
}

// UnsubscribeStreams unsubscribes from one or more raw stream names using the
// documented WebSocket control-plane method. Private stream names require an
// authenticated client. It only affects the server-side subscription and does
// not alter the typed subscription registry.
func (c *Client) UnsubscribeStreams(ctx context.Context, streams ...string) error {
	return c.updateStreams(ctx, string(OpUnsubscribe), streams)
}

func (c *Client) updateStreams(ctx context.Context, method string, streams []string) error {
	if len(streams) == 0 {
		return errors.New("gemini websocket: at least one stream is required")
	}
	for _, stream := range streams {
		if strings.TrimSpace(stream) == "" {
			return errors.New("gemini websocket: stream name is empty")
		}
	}
	_, err := c.Request(ctx, method, streams)
	return err
}

// PlaceOrder sends the typed order.place request on an authenticated client.
func (c *Client) PlaceOrder(ctx context.Context, params OrderPlaceParams) (JSONObject, error) {
	if err := validateOrderPlaceParams(params); err != nil {
		return nil, err
	}
	response, err := c.authenticatedRequest(ctx, string(OpOrderNew), params)
	if err != nil {
		return nil, err
	}
	return decodeObjectResult(response, "order.place")
}

// CancelOrder sends the typed order.cancel request on an authenticated client.
func (c *Client) CancelOrder(ctx context.Context, params OrderCancelParams) (JSONObject, error) {
	if !validOrderID(params.OrderID) {
		return nil, errors.New("gemini websocket: order ID is required")
	}
	response, err := c.authenticatedRequest(ctx, string(OpOrderCancel), params)
	if err != nil {
		return nil, err
	}
	return decodeObjectResult(response, "order.cancel")
}

// CancelAllOrders cancels all active orders after explicit confirmation.
func (c *Client) CancelAllOrders(ctx context.Context, options CancelAllOptions) (JSONObject, error) {
	return c.cancelAll(ctx, OpOrderCancelAll, options)
}

// CancelSessionOrders cancels all active orders for the current session after
// explicit confirmation.
func (c *Client) CancelSessionOrders(ctx context.Context, options CancelAllOptions) (JSONObject, error) {
	return c.cancelAll(ctx, OpOrderCancelSession, options)
}

func (c *Client) cancelAll(ctx context.Context, method RequestOp, options CancelAllOptions) (JSONObject, error) {
	if !options.Confirm {
		return nil, ErrCancelConfirmationRequired
	}
	response, err := c.authenticatedRequest(ctx, string(method), nil)
	if err != nil {
		return nil, err
	}
	return decodeObjectResult(response, string(method))
}

func (c *Client) authenticatedRequest(ctx context.Context, method string, params any) (ResponseFrame, error) {
	return c.RequestAuthenticated(ctx, method, params)
}

func decodeObjectResult(response ResponseFrame, method string) (JSONObject, error) {
	result := JSONObject{}
	if len(response.Result) == 0 || string(response.Result) == "null" {
		return result, nil
	}
	if err := response.DecodeResult(&result); err != nil {
		return nil, fmt.Errorf("gemini websocket: decoding %s response: %w", method, err)
	}
	if result == nil {
		return JSONObject{}, nil
	}
	return result, nil
}

func validateOrderPlaceParams(params OrderPlaceParams) error {
	if strings.TrimSpace(params.Symbol) == "" || strings.TrimSpace(params.Quantity) == "" {
		return errors.New("gemini websocket: order symbol and quantity are required")
	}
	if params.Side != OrderSideBuy && params.Side != OrderSideSell {
		return errors.New("gemini websocket: order side must be BUY or SELL")
	}
	if err := validatePositiveDecimal("quantity", params.Quantity); err != nil {
		return err
	}
	if params.StopPrice != "" && strings.TrimSpace(params.StopPrice) == "" {
		return errors.New("gemini websocket: stopPrice must be a non-empty decimal")
	}
	switch params.Type {
	case OrderTypeLimit:
		if strings.TrimSpace(params.Price) == "" {
			return errors.New("gemini websocket: limit orders require price")
		}
		if err := validatePositiveDecimal("price", params.Price); err != nil {
			return err
		}
	case OrderTypeMarket:
		if strings.TrimSpace(params.StopPrice) != "" {
			return errors.New("gemini websocket: stopPrice is not valid with market orders")
		}
	default:
		return errors.New("gemini websocket: order type must be LIMIT or MARKET; use LIMIT with stopPrice for stop-limit orders")
	}
	if strings.TrimSpace(params.StopPrice) != "" {
		if err := validatePositiveDecimal("stopPrice", params.StopPrice); err != nil {
			return err
		}
		price, _ := types.ParseDecimal(params.Price)
		stopPrice, _ := types.ParseDecimal(params.StopPrice)
		switch params.Side {
		case OrderSideBuy:
			if stopPrice.Cmp(price) > 0 {
				return errors.New("gemini websocket: buy stopPrice must not exceed price")
			}
		case OrderSideSell:
			if stopPrice.Cmp(price) < 0 {
				return errors.New("gemini websocket: sell stopPrice must not be below price")
			}
		}
	}
	switch params.TimeInForce {
	case TimeInForceGTC, TimeInForceIOC, TimeInForceFOK, TimeInForceMOC:
	default:
		return errors.New("gemini websocket: unsupported time-in-force")
	}
	if params.EventOutcome != "" && params.EventOutcome != EventOutcomeYes && params.EventOutcome != EventOutcomeNo {
		return errors.New("gemini websocket: event outcome must be YES or NO")
	}
	return nil
}

func validatePositiveDecimal(name, value string) error {
	decimal, err := types.ParseDecimal(value)
	if err != nil || !decimal.IsPositive() {
		return fmt.Errorf("gemini websocket: %s must be a positive decimal", name)
	}
	return nil
}

func validOrderID(value any) bool {
	switch id := value.(type) {
	case string:
		return strings.TrimSpace(id) != ""
	case json.Number:
		n, err := strconv.ParseUint(string(id), 10, 64)
		return err == nil && n > 0
	case int:
		return id > 0
	case int8:
		return id > 0
	case int16:
		return id > 0
	case int32:
		return id > 0
	case int64:
		return id > 0
	case uint:
		return id > 0
	case uint8:
		return id > 0
	case uint16:
		return id > 0
	case uint32:
		return id > 0
	case uint64:
		return id > 0
	case float64:
		const maxSafeJSONInteger = 1<<53 - 1
		return id > 0 && id <= maxSafeJSONInteger && math.Trunc(id) == id && !math.IsNaN(id) && !math.IsInf(id, 0)
	default:
		return false
	}
}
