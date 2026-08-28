package gemini

import (
	"context"
	"iter"

	"github.com/gemini/gemini-go/auth"
	"github.com/gemini/gemini-go/services"
	"github.com/gemini/gemini-go/transport"
	"github.com/gemini/gemini-go/types"
	"github.com/gemini/gemini-go/websocket"
	"github.com/gemini/gemini-go/websocket/orderbook"
)

// Re-exported types for streamlined developer experience without importing multiple sub-packages.
type (
	// APIKey represents a Gemini API Key identifier.
	APIKey = auth.APIKey

	// APISecret represents a Gemini API secret used for HMAC-SHA384 signatures.
	APISecret = auth.APISecret

	// BearerToken represents an OAuth2 bearer access token.
	BearerToken = auth.BearerToken

	// Decimal represents an exact fixed-precision decimal number for financial calculations.
	Decimal = types.Decimal

	// DecimalNumber represents an exact decimal encoded as a JSON number.
	DecimalNumber = types.DecimalNumber

	// DesiredQuote specifies an intended target order in a market making grid.
	DesiredQuote = services.DesiredQuote

	// RestingOrder represents an active order resting on the exchange order book.
	RestingOrder = services.RestingOrder

	// ReconcileResult summarizes actions executed by the state reconciler.
	ReconcileResult = services.ReconcileResult

	// CustodyFeeTransfer describes a custody fee charged to the account.
	CustodyFeeTransfer = services.CustodyFeeTransfer

	// AddBankResponse is returned when a bank account is submitted for linking.
	AddBankResponse = services.AddBankResponse

	// ApprovedAddressMessage is returned when an approved address is requested or removed.
	ApprovedAddressMessage = services.ApprovedAddressMessage

	// PaymentMethodsResponse contains linked account payment methods.
	PaymentMethodsResponse = services.PaymentMethodsResponse

	// ClearingOperationResponse reports a clearing cancellation or confirmation result.
	ClearingOperationResponse = services.ClearingOperationResponse

	// PredictionOrderOperationResponse reports a prediction-market order action result.
	PredictionOrderOperationResponse = services.PredictionOrderOperationResponse

	// SportsContestCluster groups raw prediction events into a sports contest view.
	SportsContestCluster = services.SportsContestCluster

	// QuoteReconciler manages declarative target order diffing and execution.
	QuoteReconciler = services.QuoteReconciler

	// OrderOption configures an outgoing order request.
	OrderOption = services.OrderOption

	// BBO captures the current Best Bid and Offer top-of-book snapshot.
	BBO = orderbook.BBO

	// OrderEvent represents a private order lifecycle update over WebSockets.
	OrderEvent = websocket.OrderEvent

	// OrderPlaceParams contains the typed WebSocket order.place payload.
	OrderPlaceParams = websocket.OrderPlaceParams

	// OrderCancelParams contains the typed WebSocket order.cancel payload.
	OrderCancelParams = websocket.OrderCancelParams

	// CancelAllOptions protects account-wide WebSocket cancellation methods from accidental invocation.
	CancelAllOptions = websocket.CancelAllOptions

	// OrderSide identifies whether a WebSocket order buys or sells.
	OrderSide = websocket.OrderSide

	// OrderType identifies the WebSocket order execution style.
	OrderType = websocket.OrderType

	// TimeInForce controls how long a WebSocket order remains eligible for execution.
	TimeInForce = websocket.TimeInForce

	// EventOutcome identifies the prediction-market outcome attached to a WebSocket order.
	EventOutcome = websocket.EventOutcome

	// BalanceUpdate represents an authenticated account balance update.
	BalanceUpdate = websocket.BalanceUpdate

	// PositionReport represents an authenticated account position report.
	PositionReport = websocket.PositionReport

	// SettlementUpdate represents an authenticated contract settlement update.
	SettlementUpdate = websocket.SettlementUpdate

	// ContractStatusEvent represents a public prediction contract lifecycle event.
	ContractStatusEvent = websocket.ContractStatusEvent

	// RFQPublicEvent represents an anonymous public combo RFQ discovery event.
	RFQPublicEvent = websocket.RFQPublicEvent

	// RFQPrivateDelivery represents an authenticated combo RFQ lifecycle delivery.
	RFQPrivateDelivery = websocket.RFQPrivateDelivery

	// RFQSubmitQuoteParams contains the quote submitted by a maker.
	RFQSubmitQuoteParams = websocket.RFQSubmitQuoteParams

	// RFQWithdrawQuoteParams identifies a maker quote to withdraw.
	RFQWithdrawQuoteParams = websocket.RFQWithdrawQuoteParams

	// RFQConfirmQuoteParams contains the winning maker's last-look decision.
	RFQConfirmQuoteParams = websocket.RFQConfirmQuoteParams

	// DepthUpdate represents an incremental L2 order book diff.
	DepthUpdate = websocket.DepthUpdate

	// TradeEvent represents a public trade execution.
	TradeEvent = websocket.TradeEvent

	// BookTicker represents a top-of-book price and quantity update.
	BookTicker = websocket.BookTicker

	// SimulatedFill contains the execution summary of a simulated market order through L2 book depth.
	SimulatedFill = orderbook.SimulatedFill
)

// PageFetcher is a function that fetches a page of items for Go 1.23+ pagination.
type PageFetcher[T any] func(ctx context.Context, offset, limit int) (items []T, hasMore bool, err error)

// NewPaginator creates a native Go 1.23+ iter.Seq2 iterator for paginated endpoints.
func NewPaginator[T any](ctx context.Context, initialOffset, pageSize int, fetcher PageFetcher[T]) iter.Seq2[T, error] {
	return transport.NewPaginator(ctx, initialOffset, pageSize, transport.PageFetcher[T](fetcher))
}

// Re-exported helper functions and options.
var (
	// ErrCancelConfirmationRequired indicates that a destructive WebSocket cancellation was not confirmed.
	ErrCancelConfirmationRequired = websocket.ErrCancelConfirmationRequired

	// ErrNoDialerConfigured indicates that no WebSocket transport adapter was configured.
	ErrNoDialerConfigured = websocket.ErrNoDialerConfigured

	// ParseDecimal parses a financial number string into a fixed-scale Decimal.
	ParseDecimal = types.ParseDecimal

	// MustDecimal parses a decimal string or panics.
	MustDecimal = types.MustParseDecimal

	// ParseDecimalNumber parses a decimal string for a generated JSON-number field.
	ParseDecimalNumber = types.ParseDecimalNumber

	// MustDecimalNumber parses a decimal string for a generated JSON-number field or panics.
	MustDecimalNumber = types.MustParseDecimalNumber

	// ZeroDecimal returns a zero-valued Decimal (0).
	ZeroDecimal = types.Zero

	// MinDecimal returns the smaller of two Decimals.
	MinDecimal = types.Min

	// MaxDecimal returns the larger of two Decimals.
	MaxDecimal = types.Max

	// CalculateNotional computes the total notional value of an order (Price * Quantity).
	CalculateNotional = types.CalculateNotional

	// CalculateFee computes the transaction fee in quote currency: Notional * (feeBps / 10000).
	CalculateFee = types.CalculateFee

	// CalculatePnL computes the profit/loss and ROI percentage for a position or trade.
	CalculatePnL = types.CalculatePnL

	// CalculateLiquidationPrice estimates the bankruptcy liquidation trigger price for a leveraged position.
	CalculateLiquidationPrice = types.CalculateLiquidationPrice

	// PredictionMarketPayout calculates financial returns for binary prediction contracts ($1.00 settlement).
	PredictionMarketPayout = types.PredictionMarketPayout

	// VerifySignature verifies an incoming Gemini HMAC-SHA384 signature in constant time against a Base64 payload.
	VerifySignature = auth.VerifySignature

	// WithClientOrderID attaches a client-specified order ID to fluent order requests.
	WithClientOrderID = services.WithClientOrderID

	// WithStopPrice attaches a stop trigger price to fluent order requests.
	WithStopPrice = services.WithStopPrice

	// NormalizeContestRoot normalizes a sports event or instrument into its contest root.
	NormalizeContestRoot = services.NormalizeContestRoot

	// ExtractCleanContestTitle removes market-family suffixes from sports titles.
	ExtractCleanContestTitle = services.ExtractCleanContestTitle

	// BuildSportsContestCluster groups raw sports events into a contest view.
	BuildSportsContestCluster = services.BuildSportsContestCluster

	// ClusterSportsEvents groups sports events by contest root.
	ClusterSportsEvents = services.ClusterSportsEvents

	// ResolveSportsContest resolves a contest from already-fetched events.
	ResolveSportsContest = services.ResolveSportsContest

	// WithToleranceBps configures the acceptable price drift tolerance in basis points.
	WithToleranceBps = services.WithToleranceBps

	// WithQuantization configures tick and lot size rounding rules.
	WithQuantization = services.WithQuantization

	// WithMaxConcurrentRequests limits concurrent quote cancel and placement requests.
	WithMaxConcurrentRequests = services.WithMaxConcurrentRequests
)
