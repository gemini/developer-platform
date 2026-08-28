package websocket

import (
	"context"
	"errors"
	"fmt"
	"strings"
)

// RFQLifecycleState is the lifecycle state carried by RFQ events.
type RFQLifecycleState string

const (
	RFQStateOpen              RFQLifecycleState = "OPEN"
	RFQStatePendingAcceptance RFQLifecycleState = "PENDING_ACCEPTANCE"
	RFQStateConfirming        RFQLifecycleState = "CONFIRMING"
	RFQStateFinalizing        RFQLifecycleState = "FINALIZING"
	RFQStateFinalized         RFQLifecycleState = "FINALIZED"
	RFQStateCancelled         RFQLifecycleState = "CANCELLED"
	RFQStateExpired           RFQLifecycleState = "EXPIRED"
	RFQStateFailed            RFQLifecycleState = "FAILED"
)

// RFQQuoteStatus is the status of a quote on an authenticated RFQ delivery.
type RFQQuoteStatus string

const (
	RFQQuoteActive    RFQQuoteStatus = "ACTIVE"
	RFQQuoteWithdrawn RFQQuoteStatus = "WITHDRAWN"
	RFQQuoteExpired   RFQQuoteStatus = "EXPIRED"
	RFQQuoteWon       RFQQuoteStatus = "WON"
	RFQQuoteLost      RFQQuoteStatus = "LOST"
)

// RFQQuoteTransition identifies the customer-visible transition in a private
// RFQ delivery.
type RFQQuoteTransition string

const (
	RFQTransitionClosed    RFQQuoteTransition = "CLOSED"
	RFQTransitionAccepted  RFQQuoteTransition = "ACCEPTED"
	RFQTransitionConfirmed RFQQuoteTransition = "CONFIRMED"
	RFQTransitionDeclined  RFQQuoteTransition = "DECLINED"
	RFQTransitionFinalized RFQQuoteTransition = "FINALIZED"
	RFQTransitionFailed    RFQQuoteTransition = "FAILED"
)

// RFQLeg describes one contract and outcome in a combo RFQ.
type RFQLeg struct {
	ContractID       string  `json:"c"`
	Outcome          string  `json:"o"`
	InstrumentSymbol *string `json:"s,omitempty"`
}

// RFQPublicEvent is an anonymous public combo RFQ discovery or lifecycle event.
// The public feed never contains quote contents or participant identities.
type RFQPublicEvent struct {
	EventType     string            `json:"e"`
	EventTime     int64             `json:"E"`
	RFQID         string            `json:"r"`
	Symbol        *string           `json:"s,omitempty"`
	Legs          []RFQLeg          `json:"l"`
	Notional      *string           `json:"n,omitempty"`
	Quantity      *string           `json:"q,omitempty"`
	ExecutionQty  *string           `json:"f,omitempty"`
	State         RFQLifecycleState `json:"S"`
	QuoteDeadline *int64            `json:"w,omitempty"`
	ExpiryTime    *int64            `json:"x,omitempty"`
	CreatedAt     *int64            `json:"c,omitempty"`
}

// RFQPrivateDelivery is an authenticated, at-least-once RFQ lifecycle delivery.
// DeliveryID is the durable idempotency key for consumer-side deduplication.
type RFQPrivateDelivery struct {
	EventType   string             `json:"e"`
	DeliveryID  string             `json:"i"`
	EventTime   int64              `json:"E"`
	RFQID       string             `json:"r"`
	Transition  RFQQuoteTransition `json:"x"`
	State       RFQLifecycleState  `json:"S"`
	QuoteID     *string            `json:"q,omitempty"`
	Price       *string            `json:"p,omitempty"`
	Quantity    *string            `json:"sz,omitempty"`
	QuoteStatus *RFQQuoteStatus    `json:"qs,omitempty"`
	ValidUntil  *int64             `json:"vu,omitempty"`
}

// RFQSubmitQuoteParams contains the immutable quote submitted by a maker.
type RFQSubmitQuoteParams struct {
	RFQID      string `json:"rfqId"`
	Price      string `json:"price"`
	Quantity   string `json:"quantity"`
	ValidUntil *int64 `json:"validUntil,omitempty"`
}

// RFQWithdrawQuoteParams identifies a maker quote to withdraw.
type RFQWithdrawQuoteParams struct {
	RFQID   string `json:"rfqId"`
	QuoteID string `json:"quoteId"`
}

// RFQConfirmQuoteParams contains the winning maker's last-look decision.
type RFQConfirmQuoteParams struct {
	RFQID   string `json:"rfqId"`
	QuoteID string `json:"quoteId"`
	Confirm bool   `json:"confirm"`
}

// RFQQuoteResponse is returned by submit and withdraw operations.
type RFQQuoteResponse struct {
	RFQID   string `json:"rfqId"`
	QuoteID string `json:"quoteId"`
}

// RFQConfirmQuoteResponse is returned by the confirm operation.
type RFQConfirmQuoteResponse struct {
	RFQID     string `json:"rfqId"`
	QuoteID   string `json:"quoteId"`
	Confirmed bool   `json:"confirmed"`
}

// ErrRFQScopeConflict indicates that both mutually exclusive authenticated
// RFQ delivery scopes were requested on the same WebSocket connection.
var ErrRFQScopeConflict = errors.New("gemini websocket: RFQ account and session scopes are mutually exclusive")

// ErrInvalidRFQParams indicates that an RFQ quote request is missing a
// required identifier or contains a value outside the wire contract.
var ErrInvalidRFQParams = errors.New("gemini websocket: invalid RFQ parameters")

// SubscribeRFQEvents subscribes to the public combo RFQ discovery stream.
func (c *Client) SubscribeRFQEvents(ctx context.Context) (<-chan *RFQPublicEvent, error) {
	return subscribeGlobalFeed(ctx, c, "requestForQuote", 256,
		func(t *subTables) map[string][]*subscription[RFQPublicEvent] { return t.rfqPublicSubs },
		func(t *subTables, m map[string][]*subscription[RFQPublicEvent]) { t.rfqPublicSubs = m })
}

// UnsubscribeRFQEvents removes all public combo RFQ subscriptions.
func (c *Client) UnsubscribeRFQEvents(ctx context.Context) error {
	return unsubscribeGlobalFeed(ctx, c, "requestForQuote",
		func(t *subTables) map[string][]*subscription[RFQPublicEvent] { return t.rfqPublicSubs },
		func(t *subTables, m map[string][]*subscription[RFQPublicEvent]) { t.rfqPublicSubs = m })
}

// SubscribeRFQDeliveries subscribes to authenticated RFQ deliveries for the
// account or session scope. The account and session streams are mutually
// exclusive on a connection according to the API contract.
func (c *Client) SubscribeRFQDeliveries(ctx context.Context, scope SubscriptionScope) (<-chan *RFQPrivateDelivery, error) {
	if scope != ScopeAccount && scope != ScopeSession {
		return nil, fmt.Errorf("gemini websocket: RFQ stream scope must be account or session")
	}
	c.rfqScopeMu.Lock()
	defer c.rfqScopeMu.Unlock()
	if err := c.ensureRFQScopeAvailable(scope); err != nil {
		return nil, err
	}
	return subscribePrivateFeed(ctx, c, "requestForQuote@"+string(scope), 256,
		func(t *subTables) map[string][]*subscription[RFQPrivateDelivery] { return t.rfqPrivateSubs },
		func(t *subTables, m map[string][]*subscription[RFQPrivateDelivery]) { t.rfqPrivateSubs = m })
}

// UnsubscribeRFQDeliveries removes all authenticated RFQ subscriptions for a scope.
func (c *Client) UnsubscribeRFQDeliveries(ctx context.Context, scope SubscriptionScope) error {
	if scope != ScopeAccount && scope != ScopeSession {
		return fmt.Errorf("gemini websocket: RFQ stream scope must be account or session")
	}
	c.rfqScopeMu.Lock()
	defer c.rfqScopeMu.Unlock()
	return unsubscribePrivateFeed(ctx, c, "requestForQuote@"+string(scope),
		func(t *subTables) map[string][]*subscription[RFQPrivateDelivery] { return t.rfqPrivateSubs },
		func(t *subTables, m map[string][]*subscription[RFQPrivateDelivery]) { t.rfqPrivateSubs = m })
}

func (c *Client) ensureRFQScopeAvailable(scope SubscriptionScope) error {
	requestedFeed := "requestForQuote@" + string(scope)
	tables := c.subTables.Load()
	if tables == nil {
		return nil
	}
	for feed, subscriptions := range tables.rfqPrivateSubs {
		if feed != requestedFeed && len(subscriptions) > 0 {
			return fmt.Errorf("%w: %s is already active", ErrRFQScopeConflict, feed)
		}
	}
	return nil
}

// SubmitRFQQuote submits an immutable quote on an open RFQ.
func (c *Client) SubmitRFQQuote(ctx context.Context, params RFQSubmitQuoteParams) (*RFQQuoteResponse, error) {
	var result RFQQuoteResponse
	if err := c.requestTypedRFQ(ctx, "rfq.submit_quote", params, &result); err != nil {
		return nil, err
	}
	return &result, nil
}

// WithdrawRFQQuote permanently withdraws a maker quote while the RFQ is open.
func (c *Client) WithdrawRFQQuote(ctx context.Context, params RFQWithdrawQuoteParams) (*RFQQuoteResponse, error) {
	var result RFQQuoteResponse
	if err := c.requestTypedRFQ(ctx, "rfq.withdraw_quote", params, &result); err != nil {
		return nil, err
	}
	return &result, nil
}

// ConfirmRFQQuote confirms or declines the winning maker quote.
func (c *Client) ConfirmRFQQuote(ctx context.Context, params RFQConfirmQuoteParams) (*RFQConfirmQuoteResponse, error) {
	var result RFQConfirmQuoteResponse
	if err := c.requestTypedRFQ(ctx, "rfq.confirm_quote", params, &result); err != nil {
		return nil, err
	}
	return &result, nil
}

func (c *Client) requestTypedRFQ(ctx context.Context, method string, params any, target any) error {
	if c.auth == nil {
		return ErrAuthenticationRequired
	}
	if err := validateRFQQuoteParams(params); err != nil {
		return err
	}
	response, err := c.Request(ctx, method, params)
	if err != nil {
		return err
	}
	if len(response.Result) == 0 {
		return fmt.Errorf("gemini websocket: %s response missing result", method)
	}
	if err := response.DecodeResult(target); err != nil {
		return fmt.Errorf("gemini websocket: decoding %s response: %w", method, err)
	}
	return nil
}

func validateRFQQuoteParams(params any) error {
	invalid := func(reason string) error {
		return fmt.Errorf("%w: %s", ErrInvalidRFQParams, reason)
	}

	switch params := params.(type) {
	case RFQSubmitQuoteParams:
		if strings.TrimSpace(params.RFQID) == "" {
			return invalid("rfqId is required")
		}
		if !validRFQPlainDecimal(&params.Price) {
			return invalid("price must be a decimal string")
		}
		if !validRFQPlainDecimal(&params.Quantity) {
			return invalid("quantity must be a decimal string")
		}
		if params.ValidUntil != nil && *params.ValidUntil < 0 {
			return invalid("validUntil must be non-negative")
		}
	case RFQWithdrawQuoteParams:
		if strings.TrimSpace(params.RFQID) == "" {
			return invalid("rfqId is required")
		}
		if strings.TrimSpace(params.QuoteID) == "" {
			return invalid("quoteId is required")
		}
	case RFQConfirmQuoteParams:
		if strings.TrimSpace(params.RFQID) == "" {
			return invalid("rfqId is required")
		}
		if strings.TrimSpace(params.QuoteID) == "" {
			return invalid("quoteId is required")
		}
	default:
		return invalid("unsupported parameter type")
	}
	return nil
}

func subscribeGlobalFeed[T any](
	ctx context.Context,
	c *Client,
	feedName string,
	chBuf int,
	getMap func(*subTables) map[string][]*subscription[T],
	setMap func(*subTables, map[string][]*subscription[T]),
) (<-chan *T, error) {
	if err := c.Connect(ctx); err != nil {
		return nil, err
	}
	sub := newSubscription[T](chBuf)
	req := RequestFrame{ID: globalReqID.Add(1), Method: "SUBSCRIBE", Params: []string{feedName}}
	if err := c.acquireSubscriptionWire(ctx, feedName); err != nil {
		return nil, err
	}
	defer c.releaseSubscriptionWire(feedName)
	if err := c.acquireSubscriptionReplay(ctx); err != nil {
		return nil, err
	}
	c.subsMu.Lock()
	oldTables := c.subTables.Load()
	oldMap := getMap(oldTables)
	needWireSubscribe := len(oldMap[feedName]) == 0
	newTables := oldTables.clone()
	newMap := cloneMapSlice(oldMap)
	newMap[feedName] = appendSubscription(oldMap[feedName], sub)
	setMap(newTables, newMap)
	c.subTables.Store(newTables)
	if needWireSubscribe {
		c.activeFeeds[feedName] = req
	}
	c.subsMu.Unlock()
	c.releaseSubscriptionReplay()

	if needWireSubscribe {
		if _, err := c.requestConnected(ctx, req.Method, req.Params); err != nil {
			removeGlobalSubscription(c, feedName, sub, getMap, setMap)
			return nil, fmt.Errorf("gemini websocket: subscribe send failed: %w", err)
		}
	}
	return sub.ch, nil
}

func unsubscribeGlobalFeed[T any](
	ctx context.Context,
	c *Client,
	feedName string,
	getMap func(*subTables) map[string][]*subscription[T],
	setMap func(*subTables, map[string][]*subscription[T]),
) error {
	return unsubscribePrivateFeed(ctx, c, feedName, getMap, setMap)
}

func removeGlobalSubscription[T any](
	c *Client,
	feedName string,
	target *subscription[T],
	getMap func(*subTables) map[string][]*subscription[T],
	setMap func(*subTables, map[string][]*subscription[T]),
) {
	removePrivateSubscription(c, feedName, target, getMap, setMap)
}

func validRFQLifecycleState(state RFQLifecycleState) bool {
	switch state {
	case RFQStateOpen, RFQStatePendingAcceptance, RFQStateConfirming, RFQStateFinalizing,
		RFQStateFinalized, RFQStateCancelled, RFQStateExpired, RFQStateFailed:
		return true
	default:
		return false
	}
}

func validRFQQuoteStatus(status RFQQuoteStatus) bool {
	switch status {
	case RFQQuoteActive, RFQQuoteWithdrawn, RFQQuoteExpired, RFQQuoteWon, RFQQuoteLost:
		return true
	default:
		return false
	}
}

func validRFQPlainDecimal(value *string) bool {
	if value == nil || *value == "" {
		return value == nil
	}
	hasDigit := false
	hasDot := false
	for i := 0; i < len(*value); i++ {
		char := (*value)[i]
		if char >= '0' && char <= '9' {
			hasDigit = true
			continue
		}
		if char == '.' && !hasDot {
			hasDot = true
			continue
		}
		return false
	}
	return hasDigit
}

func validRFQNonEmptyString(value *string) bool {
	return value == nil || *value != ""
}

func validRFQPublicEvent(event *RFQPublicEvent) bool {
	if event.EventType != "requestForQuote" || event.EventTime < 0 || event.RFQID == "" ||
		!validRFQLifecycleState(event.State) || !validRFQNonEmptyString(event.Symbol) ||
		!validRFQPlainDecimal(event.Notional) || !validRFQPlainDecimal(event.Quantity) ||
		!validRFQPlainDecimal(event.ExecutionQty) || (event.Notional != nil && event.Quantity != nil) {
		return false
	}
	for _, leg := range event.Legs {
		if leg.ContractID == "" || (leg.Outcome != "YES" && leg.Outcome != "NO") || !validRFQNonEmptyString(leg.InstrumentSymbol) {
			return false
		}
	}
	for _, timestamp := range []*int64{event.QuoteDeadline, event.ExpiryTime, event.CreatedAt} {
		if timestamp != nil && *timestamp < 0 {
			return false
		}
	}
	return true
}

func validRFQPrivateDelivery(delivery *RFQPrivateDelivery) bool {
	if delivery.EventType != "requestForQuote" || delivery.DeliveryID == "" ||
		delivery.EventTime < 0 || delivery.RFQID == "" || !validRFQLifecycleState(delivery.State) {
		return false
	}
	if !validRFQNonEmptyString(delivery.QuoteID) || !validRFQPlainDecimal(delivery.Price) ||
		!validRFQPlainDecimal(delivery.Quantity) || (delivery.QuoteStatus != nil && !validRFQQuoteStatus(*delivery.QuoteStatus)) ||
		(delivery.ValidUntil != nil && *delivery.ValidUntil < 0) {
		return false
	}
	switch delivery.Transition {
	case RFQTransitionClosed, RFQTransitionAccepted, RFQTransitionConfirmed,
		RFQTransitionDeclined, RFQTransitionFinalized, RFQTransitionFailed:
		return true
	default:
		return false
	}
}
