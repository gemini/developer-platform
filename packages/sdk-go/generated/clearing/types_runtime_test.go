package clearing_test

import (
	"encoding/json"
	"testing"

	"github.com/gemini/developer-platform/packages/sdk-go/generated/clearing"
)

func TestClearingOrderTimestampDecodesAsWideInteger(t *testing.T) {
	var order clearing.ClearingOrder
	if err := json.Unmarshal([]byte(`{"timestampms":1775001600000}`), &order); err != nil {
		t.Fatalf("decoding clearing order: %v", err)
	}
	if order.Timestampms == nil || *order.Timestampms != 1775001600000 {
		t.Fatalf("unexpected timestampms: %v", order.Timestampms)
	}
}
