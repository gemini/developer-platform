package websocket

import (
	"bytes"
	"encoding/json"
	"fmt"
	"strings"
)

var (
	bDepthUpdate     = []byte(`"depthUpdate"`)
	bLastUpdateID    = []byte(`"lastUpdateId"`)
	bids             = []byte(`"bids"`)
	bAsks            = []byte(`"asks"`)
	bU               = []byte(`"U"`)
	bTrade           = []byte(`"trade"`)
	bT               = []byte(`"t"`)
	bBookTicker      = []byte(`"bookTicker"`)
	bB               = []byte(`"b"`)
	bA               = []byte(`"a"`)
	bContract        = []byte(`"contractStatus"`)
	bBalance         = []byte(`"balanceUpdate"`)
	bPosition        = []byte(`"positionReport"`)
	bSettlement      = []byte(`"settlements"`)
	bOrderUpdate     = []byte(`"orderUpdate"`)
	bOrder           = []byte(`"order"`)
	bRequestForQuote = []byte(`"requestForQuote"`)
)

type inboundFrame struct {
	payload    []byte
	generation uint64
}

func (c *Client) dispatchFrame(stop <-chan struct{}, payload []byte, generation uint64) error {
	if c.State() == StateClosed {
		return nil
	}
	if handled, err := c.dispatchResponse(payload); handled {
		return err
	}
	if !json.Valid(payload) {
		return fmt.Errorf("%w: invalid JSON", ErrMalformedFrame)
	}

	tables := c.subTables.Load()
	if tables == nil {
		return nil
	}

	// The private order stream can include a top-level trade ID (`t`). Check
	// the explicit event discriminator before the heuristic market-data probes
	// below; otherwise an order update can be silently delivered as a trade.
	if bytes.Contains(payload, bOrder) || bytes.Contains(payload, bOrderUpdate) {
		var eventEnvelope map[string]json.RawMessage
		if err := json.Unmarshal(payload, &eventEnvelope); err == nil {
			var explicitType string
			if rawType, ok := eventEnvelope["e"]; ok {
				_ = json.Unmarshal(rawType, &explicitType)
			}
			if explicitType == "order" || explicitType == "orderUpdate" {
				var order OrderEvent
				if err := json.Unmarshal(payload, &order); err == nil {
					for _, subs := range tables.orderSubs {
						for _, sub := range subs {
							sub.send(stop, &order)
						}
					}
				}
				return nil
			}
		}
	}

	if bytes.Contains(payload, bRequestForQuote) {
		var envelope struct {
			EventType  string `json:"e"`
			EventTime  int64  `json:"E"`
			DeliveryID string `json:"i"`
		}
		if err := json.Unmarshal(payload, &envelope); err == nil && envelope.EventType == "requestForQuote" {
			if envelope.DeliveryID != "" {
				var delivery RFQPrivateDelivery
				if err := json.Unmarshal(payload, &delivery); err == nil && validRFQPrivateDelivery(&delivery) {
					for _, subs := range tables.rfqPrivateSubs {
						for _, sub := range subs {
							sub.send(stop, &delivery)
						}
					}
				}
			} else {
				var event RFQPublicEvent
				if err := json.Unmarshal(payload, &event); err == nil && validRFQPublicEvent(&event) {
					for _, sub := range tables.rfqPublicSubs["requestForQuote"] {
						sub.send(stop, &event)
					}
				}
			}
			return nil
		}
	}

	if bytes.Contains(payload, bLastUpdateID) && bytes.Contains(payload, bids) && bytes.Contains(payload, bAsks) {
		handled, err := c.dispatchOrderBookSnapshot(stop, payload, generation, tables)
		if handled {
			return err
		}
	}

	// Fast single-pass dispatching to avoid redundant JSON unmarshaling
	if bytes.Contains(payload, bDepthUpdate) || bytes.Contains(payload, bU) {
		var update DepthUpdate
		if err := json.Unmarshal(payload, &update); err == nil && (update.EventType == "depthUpdate" || update.FirstUpdateID > 0) {
			symbol := strings.ToUpper(update.Symbol)
			update.Symbol = symbol
			if c.consumeSnapshotPending(symbol, generation) {
				update.Snapshot = true
			}
			for _, sub := range tables.depthSubs[symbol] {
				sub.send(stop, &update)
			}
			return nil
		}
	}

	if bytes.Contains(payload, bTrade) || bytes.Contains(payload, bT) {
		var trade TradeEvent
		if err := json.Unmarshal(payload, &trade); err == nil && (trade.EventType == "trade" || trade.TradeID > 0) {
			symbol := strings.ToUpper(trade.Symbol)
			trade.Symbol = symbol
			for _, sub := range tables.tradeSubs[symbol] {
				sub.send(stop, &trade)
			}
			return nil
		}
	}

	if bytes.Contains(payload, bBookTicker) || (bytes.Contains(payload, bB) && bytes.Contains(payload, bA)) {
		var ticker BookTicker
		if err := json.Unmarshal(payload, &ticker); err == nil && ticker.BidPrice != "" {
			symbol := strings.ToUpper(ticker.Symbol)
			ticker.Symbol = symbol
			for _, sub := range tables.tickerSubs[symbol] {
				sub.send(stop, &ticker)
			}
			return nil
		}
	}

	if bytes.Contains(payload, bContract) {
		var contract ContractStatusEvent
		if err := json.Unmarshal(payload, &contract); err == nil && (contract.EventType == "contractStatus" || contract.ContractID > 0) {
			symbol := strings.ToUpper(contract.Symbol)
			contract.Symbol = symbol
			if len(tables.contractSubs) > 0 {
				if symbol != "" {
					for _, sub := range tables.contractSubs[symbol] {
						sub.send(stop, &contract)
					}
				}
				for _, sub := range tables.contractSubs[""] {
					sub.send(stop, &contract)
				}
				for _, sub := range tables.contractSubs["*"] {
					sub.send(stop, &contract)
				}
			}
			return nil
		}
	}

	if bytes.Contains(payload, bBalance) {
		var balance BalanceUpdate
		if err := json.Unmarshal(payload, &balance); err == nil && balance.EventType == "balanceUpdate" {
			for _, subs := range tables.balanceSubs {
				for _, sub := range subs {
					sub.send(stop, &balance)
				}
			}
			return nil
		}
	}

	if bytes.Contains(payload, bPosition) {
		var position PositionReport
		if err := json.Unmarshal(payload, &position); err == nil && position.EventType == "positionReport" {
			for _, subs := range tables.positionSubs {
				for _, sub := range subs {
					sub.send(stop, &position)
				}
			}
			return nil
		}
	}

	if bytes.Contains(payload, bSettlement) {
		var settle SettlementUpdate
		if err := json.Unmarshal(payload, &settle); err == nil && (settle.Type == "settlements" || len(settle.Settlements) > 0) {
			for _, subs := range tables.settleSubs {
				for _, sub := range subs {
					sub.send(stop, &settle)
				}
			}
			return nil
		}
	}

	// Fallback probe for order events and other event types
	var probe struct {
		EventType string `json:"e"`
		Type      string `json:"type"`
		EventTime int64  `json:"E"`
		Symbol    string `json:"s"`
	}
	if err := json.Unmarshal(payload, &probe); err != nil {
		return fmt.Errorf("%w: invalid JSON", ErrMalformedFrame)
	}

	switch probe.EventType {
	case "order", "orderUpdate":
		var order OrderEvent
		if err := json.Unmarshal(payload, &order); err == nil {
			for _, subs := range tables.orderSubs {
				for _, sub := range subs {
					sub.send(stop, &order)
				}
			}
		}
	case "balanceUpdate":
		var balance BalanceUpdate
		if err := json.Unmarshal(payload, &balance); err == nil {
			for _, subs := range tables.balanceSubs {
				for _, sub := range subs {
					sub.send(stop, &balance)
				}
			}
		}
	case "positionReport":
		var pos PositionReport
		if err := json.Unmarshal(payload, &pos); err == nil {
			for _, subs := range tables.positionSubs {
				for _, sub := range subs {
					sub.send(stop, &pos)
				}
			}
		}
	}

	if probe.Type == "settlements" {
		var settle SettlementUpdate
		if err := json.Unmarshal(payload, &settle); err == nil {
			for _, subs := range tables.settleSubs {
				for _, sub := range subs {
					sub.send(stop, &settle)
				}
			}
		}
	}
	return nil
}
