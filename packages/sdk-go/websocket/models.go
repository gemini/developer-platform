package websocket

import (
	"bytes"
	"encoding/json"
	"fmt"
)

// RequestOp defines WebSocket JSON-RPC command operations.
type RequestOp string

const (
	OpSubscribe          RequestOp = "SUBSCRIBE"
	OpUnsubscribe        RequestOp = "UNSUBSCRIBE"
	OpOrderNew           RequestOp = "order.place"
	OpOrderCancel        RequestOp = "order.cancel"
	OpOrderCancelAll     RequestOp = "order.cancel_all"
	OpOrderCancelSession RequestOp = "order.cancel_session"
	OpConnInfo           RequestOp = "conninfo"
	OpTime               RequestOp = "time"
	OpListSubscriptions  RequestOp = "LIST_SUBSCRIPTIONS"
	OpPing               RequestOp = "ping"
)

// OpConninfo is retained for compatibility. Deprecated: use OpConnInfo.
const OpConninfo RequestOp = OpConnInfo

// subscriptionFrame is the internal replay representation for a stream
// subscription. General WebSocket requests can have object parameters and do
// not use this shape.
type subscriptionFrame struct {
	ID     int64    `json:"id,omitempty"`
	Method string   `json:"method"`
	Params []string `json:"params,omitempty"`
}

// RequestFrame is retained as a compatibility alias for older callers that
// used the subscription replay shape. New code should use typed request
// methods instead.
type RequestFrame = subscriptionFrame

// ResponseFrame represents a generic incoming JSON response frame.
type ResponseFrame struct {
	ID     string                `json:"id,omitempty"`
	Status int                   `json:"status,omitempty"`
	Result json.RawMessage       `json:"result,omitempty"`
	Error  *ResponseErrorPayload `json:"error,omitempty"`
}

// ResponseErrorPayload contains the exchange-provided details for a failed
// WebSocket request.
type ResponseErrorPayload struct {
	Code    int    `json:"code"`
	Message string `json:"message,omitempty"`
	Msg     string `json:"msg,omitempty"`
}

// UnmarshalJSON handles both string and numeric "id" fields from exchange responses.
func (r *ResponseFrame) UnmarshalJSON(data []byte) error {
	type alias ResponseFrame
	aux := struct {
		RawID json.RawMessage `json:"id,omitempty"`
		*alias
	}{
		alias: (*alias)(r),
	}
	if err := json.Unmarshal(data, &aux); err != nil {
		return err
	}
	if len(aux.RawID) > 0 && !bytes.Equal(aux.RawID, []byte("null")) {
		id, err := decodeResponseID(aux.RawID)
		if err != nil {
			return fmt.Errorf("gemini websocket: invalid response id: %w", err)
		}
		r.ID = id
	}
	if r.Error != nil {
		if r.Error.Message == "" && r.Error.Msg != "" {
			r.Error.Message = r.Error.Msg
		}
	}
	return nil
}

func decodeResponseID(raw json.RawMessage) (string, error) {
	var stringID string
	if err := json.Unmarshal(raw, &stringID); err == nil {
		return stringID, nil
	}

	var numberID json.Number
	decoder := json.NewDecoder(bytes.NewReader(raw))
	decoder.UseNumber()
	if err := decoder.Decode(&numberID); err != nil {
		return "", err
	}
	return numberID.String(), nil
}

// DecodeResult unmarshals the generic response result into target without
// converting JSON numbers through float64.
func (r ResponseFrame) DecodeResult(target any) error {
	if len(r.Result) == 0 {
		return nil
	}
	decoder := json.NewDecoder(bytes.NewReader(r.Result))
	decoder.UseNumber()
	return decoder.Decode(target)
}

// DepthUpdate represents an incremental L2 order book update.
type DepthUpdate struct {
	EventType     string     `json:"e"` // Event Type (e.g. "depthUpdate")
	EventTime     int64      `json:"E"` // Event Time in milliseconds/nanoseconds
	Symbol        string     `json:"s"` // Market Symbol (e.g. "BTCUSD")
	FirstUpdateID int64      `json:"U"` // First Update ID in this event
	LastUpdateID  int64      `json:"u"` // Last Update ID in this event
	Bids          [][]string `json:"b"` // Bids [[price, amount], ...]
	Asks          [][]string `json:"a"` // Asks [[price, amount], ...]
	// Snapshot is set by the client when this frame is the snapshot requested
	// on the WebSocket connection. It is intentionally not decoded from JSON:
	// Gemini uses the connection query, rather than a per-message marker, to
	// select the initial snapshot.
	Snapshot bool `json:"-"`
}

// OrderBookSnapshot represents a full L2 snapshot frame.
type OrderBookSnapshot struct {
	EventType    string     `json:"e"` // "depthSnapshot" or initial frame
	EventTime    int64      `json:"E"`
	Symbol       string     `json:"s"`
	LastUpdateID int64      `json:"lastUpdateId"`
	Bids         [][]string `json:"bids"`
	Asks         [][]string `json:"asks"`
}

// BookTicker represents the top-of-book best bid and offer (BBO).
type BookTicker struct {
	EventType      string `json:"e"` // "bookTicker"
	EventTime      int64  `json:"E"`
	UpdateID       int64  `json:"u"`
	Symbol         string `json:"s"`
	BidPrice       string `json:"b"`
	BidQty         string `json:"B"`
	AskPrice       string `json:"a"`
	AskQty         string `json:"A"`
	LastTradePrice string `json:"c,omitempty"`
	LastTradeQty   string `json:"C,omitempty"`
}

// TradeEvent represents a public trade execution frame.
type TradeEvent struct {
	EventType    string `json:"e"` // "trade"
	EventTime    int64  `json:"E"`
	Symbol       string `json:"s"`
	TradeID      int64  `json:"t"`
	Price        string `json:"p"`
	Quantity     string `json:"q"`
	BuyerIsMaker bool   `json:"m"`
}

// OrderEvent represents a private order lifecycle update.
type OrderEvent struct {
	EventType         string `json:"e"` // "order" or "orderUpdate"
	EventTime         int64  `json:"E"`
	Symbol            string `json:"s"`
	ClientOrderID     string `json:"c"`
	Side              string `json:"S"`
	OrderType         string `json:"o"`
	TimeInForce       string `json:"f"`
	Quantity          string `json:"q"`
	Price             string `json:"p"`
	StopPrice         string `json:"P,omitempty"`
	EventOutcome      string `json:"O,omitempty"`
	ExecutionType     string `json:"x"`
	OrderStatus       string `json:"X"`
	OrderRejectReason string `json:"r,omitempty"`
	OrderID           int64  `json:"i"`
	RemainingQty      string `json:"z"`
	ExecutedQty       string `json:"Z"`
	LastExecutedPrice string `json:"L,omitempty"`
	LastExecutedQty   string `json:"l,omitempty"`
	FeeAmount         string `json:"n,omitempty"`
	FeeAsset          string `json:"N,omitempty"`
	TradeTime         int64  `json:"T,omitempty"`
	TradeID           int64  `json:"t,omitempty"`
	IsMaker           bool   `json:"m,omitempty"`
}

// BalanceItem represents an asset balance entry within a BalanceUpdate.
type BalanceItem struct {
	Asset      string `json:"a"` // Asset code (e.g. "USD", "BTC")
	Available  string `json:"f"` // Available free balance
	Cumulative string `json:"c"` // Total cumulative balance
}

// BalanceUpdate represents an authenticated account balance event.
type BalanceUpdate struct {
	EventType  string        `json:"e"` // "balanceUpdate"
	EventTime  int64         `json:"E"`
	UpdateTime int64         `json:"u"`
	Balances   []BalanceItem `json:"B"`
}

// NamedAmount represents a labelled numeric quantity in a position row.
type NamedAmount struct {
	Type  string `json:"t"` // e.g. "position"
	Value string `json:"v"`
	Asset string `json:"c,omitempty"`
}

// PositionRow represents an individual instrument position within a PositionReport.
type PositionRow struct {
	ProductType string        `json:"t"` // e.g. "ec"
	Symbol      string        `json:"s"`
	Amounts     []NamedAmount `json:"a"`
}

// PositionReport represents an authenticated account position update.
type PositionReport struct {
	EventType  string        `json:"e"` // "positionReport"
	EventTime  int64         `json:"E"`
	UpdateTime int64         `json:"u"`
	AccountID  int64         `json:"A"`
	Positions  []PositionRow `json:"P"`
}

// SettlementItem represents an instrument settlement entry within a SettlementUpdate.
type SettlementItem struct {
	Symbol   string `json:"symbol"`
	Position string `json:"position"`
	Payout   string `json:"payout,omitempty"`
	Outcome  string `json:"outcome"`
}

// SettlementUpdate represents an authenticated contract settlement event.
type SettlementUpdate struct {
	Type        string           `json:"type"` // "settlements"
	Settlements []SettlementItem `json:"settlements"`
}

// ContractStatusEvent represents a public prediction contract lifecycle event.
type ContractStatusEvent struct {
	EventType      string `json:"e"` // "contractStatus"
	EventTime      int64  `json:"E"`
	Symbol         string `json:"s"`
	EventTicker    string `json:"k"`
	ContractTicker string `json:"c"`
	ContractID     int64  `json:"i"`
	StrikePrice    string `json:"p,omitempty"`
	PreviousStatus string `json:"o,omitempty"`
	NewStatus      string `json:"n,omitempty"`
}
