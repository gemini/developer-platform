package streams

import (
	"testing"

	"github.com/gemini/developer-platform/packages/cli/internal/ws"
)

func TestNormalizeEventTypeHandlesAliases(t *testing.T) {
	tests := []struct {
		input string
		want  string
	}{
		{input: "canceled", want: "canceled"},
		{input: "cancelled", want: "canceled"},
		{input: "CANCELLED", want: "canceled"},
		{input: "fill", want: "fill"},
		{input: "unknown", want: "unknown"},
	}

	for _, tt := range tests {
		if got := NormalizeEventType(tt.input); got != tt.want {
			t.Fatalf("NormalizeEventType(%q) = %q, want %q", tt.input, got, tt.want)
		}
	}
}

func TestMatchSymbolSupportsWildcards(t *testing.T) {
	if !MatchSymbol("GEMI-BTC260318", "GEMI-BTC*") {
		t.Fatal("expected wildcard symbol match")
	}
	if MatchSymbol("GEMI-ETH260318", "GEMI-BTC*") {
		t.Fatal("unexpected wildcard symbol match")
	}
}

func TestShouldFilterOrderMessageByEventAlias(t *testing.T) {
	msg := ws.StreamMessage{
		Stream: "orders",
		Data:   []byte(`{"symbol":"GEMI-BTC260318","type":"cancelled"}`),
	}

	if ShouldFilterOrderMessage(msg, nil, []string{"canceled"}) {
		t.Fatal("expected canceled alias to match cancelled event")
	}
	if !ShouldFilterOrderMessage(msg, nil, []string{"fill"}) {
		t.Fatal("expected mismatched event filter to reject message")
	}
}

func TestShouldFilterOrderMessageByStatusField(t *testing.T) {
	msg := ws.StreamMessage{
		Stream: "orders",
		Data:   []byte(`{"s":"GEMI-BTC260318","X":"BOOKED"}`),
	}

	if ShouldFilterOrderMessage(msg, []string{"GEMI-BTC*"}, []string{"booked"}) {
		t.Fatal("expected symbol and status filters to pass")
	}
}
