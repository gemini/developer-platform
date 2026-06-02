package ws

import (
	"encoding/json"
	"testing"
)

func TestOrderParamsJSON(t *testing.T) {
	params := OrderParams{
		Symbol:        "btcusd",
		Side:          "BUY",
		Type:          "LIMIT",
		TimeInForce:   "GTC",
		Price:         "50000.00",
		Quantity:      "0.1",
		ClientOrderID: "test-123",
		EventOutcome:  "YES",
	}

	data, err := json.Marshal(params)
	if err != nil {
		t.Fatalf("failed to marshal OrderParams: %v", err)
	}

	var decoded map[string]any
	if err := json.Unmarshal(data, &decoded); err != nil {
		t.Fatalf("failed to unmarshal JSON: %v", err)
	}

	expected := map[string]any{
		"symbol":        "btcusd",
		"side":          "BUY",
		"type":          "LIMIT",
		"timeInForce":   "GTC",
		"price":         "50000.00",
		"quantity":      "0.1",
		"clientOrderId": "test-123",
		"eventOutcome":  "YES",
	}

	for key, want := range expected {
		if got := decoded[key]; got != want {
			t.Errorf("decoded[%q] = %v, want %v", key, got, want)
		}
	}
}

func TestOrderParamsOmitEmpty(t *testing.T) {
	params := OrderParams{
		Symbol:   "btcusd",
		Side:     "BUY",
		Type:     "MARKET",
		Quantity: "0.1",
	}

	data, err := json.Marshal(params)
	if err != nil {
		t.Fatalf("failed to marshal OrderParams: %v", err)
	}

	var decoded map[string]any
	if err := json.Unmarshal(data, &decoded); err != nil {
		t.Fatalf("failed to unmarshal JSON: %v", err)
	}

	optionalFields := []string{"timeInForce", "price", "clientOrderId", "eventOutcome"}
	for _, field := range optionalFields {
		if _, exists := decoded[field]; exists {
			t.Errorf("optional field %q should be omitted when empty", field)
		}
	}
}

func TestCancelParamsJSON(t *testing.T) {
	t.Run("by order ID", func(t *testing.T) {
		params := CancelParams{OrderID: "12345"}
		data, err := json.Marshal(params)
		if err != nil {
			t.Fatalf("failed to marshal: %v", err)
		}

		var decoded map[string]any
		json.Unmarshal(data, &decoded)

		if decoded["orderId"] != "12345" {
			t.Errorf("orderId = %v, want 12345", decoded["orderId"])
		}
	})

	t.Run("by client order ID", func(t *testing.T) {
		params := CancelParams{ClientOrderID: "client-123"}
		data, err := json.Marshal(params)
		if err != nil {
			t.Fatalf("failed to marshal: %v", err)
		}

		var decoded map[string]any
		json.Unmarshal(data, &decoded)

		if decoded["clientOrderId"] != "client-123" {
			t.Errorf("clientOrderId = %v, want client-123", decoded["clientOrderId"])
		}
	})
}

func TestOrderResultParsing(t *testing.T) {
	jsonData := `{
		"orderId": "ORD123",
		"clientOrderId": "client-456",
		"symbol": "btcusd",
		"side": "BUY",
		"type": "LIMIT",
		"timeInForce": "GTC",
		"price": "50000.00",
		"origQty": "0.1",
		"executedQty": "0.05",
		"status": "PARTIALLY_FILLED",
		"eventOutcome": "YES"
	}`

	var result OrderResult
	if err := json.Unmarshal([]byte(jsonData), &result); err != nil {
		t.Fatalf("failed to unmarshal: %v", err)
	}

	if result.OrderID != "ORD123" {
		t.Errorf("OrderID = %v, want ORD123", result.OrderID)
	}
	if result.ClientOrderID != "client-456" {
		t.Errorf("ClientOrderID = %v, want client-456", result.ClientOrderID)
	}
	if result.Status != "PARTIALLY_FILLED" {
		t.Errorf("Status = %v, want PARTIALLY_FILLED", result.Status)
	}
	if result.OrigQty != "0.1" {
		t.Errorf("OrigQty = %v, want 0.1", result.OrigQty)
	}
	if result.ExecutedQty != "0.05" {
		t.Errorf("ExecutedQty = %v, want 0.05", result.ExecutedQty)
	}
}

func TestCancelAllResultParsing(t *testing.T) {
	jsonData := `{
		"cancelledOrders": ["ORD1", "ORD2", "ORD3"]
	}`

	var result CancelAllResult
	if err := json.Unmarshal([]byte(jsonData), &result); err != nil {
		t.Fatalf("failed to unmarshal: %v", err)
	}

	if len(result.CancelledOrders) != 3 {
		t.Errorf("len(CancelledOrders) = %d, want 3", len(result.CancelledOrders))
	}

	expected := []string{"ORD1", "ORD2", "ORD3"}
	for i, want := range expected {
		if result.CancelledOrders[i] != want {
			t.Errorf("CancelledOrders[%d] = %v, want %v", i, result.CancelledOrders[i], want)
		}
	}
}
