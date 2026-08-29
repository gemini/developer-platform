package websocket_test

import (
	"context"
	"encoding/json"
	"errors"
	"testing"
	"time"

	"github.com/gemini/developer-platform/packages/sdk-go/auth"
	"github.com/gemini/developer-platform/packages/sdk-go/websocket"
)

func TestPublicRFQEventsDecodeAndRejectMalformedShape(t *testing.T) {
	dialer := &mockDrainDialer{}
	client := websocket.NewPublicClient("wss://ws.gemini.com", websocket.WithDialer(dialer))
	defer client.Close()

	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()
	events, err := client.SubscribeRFQEvents(ctx)
	if err != nil {
		t.Fatalf("SubscribeRFQEvents failed: %v", err)
	}

	dialer.latestConn().feedServerMsg([]byte(`{"e":"requestForQuote","E":1780000000000,"r":"rfq-1","s":"GEMI-CMB-1","l":[{"c":"123","o":"YES","s":"GEMI-XRPUSD-260828"}],"n":"50000.00","S":"OPEN","w":1780000001000}`))
	select {
	case event := <-events:
		if event.RFQID != "rfq-1" || event.State != websocket.RFQStateOpen || event.Legs[0].Outcome != "YES" || event.Legs[0].InstrumentSymbol == nil || *event.Legs[0].InstrumentSymbol != "GEMI-XRPUSD-260828" {
			t.Fatalf("unexpected RFQ event: %+v", event)
		}
	case <-time.After(time.Second):
		t.Fatal("timed out waiting for RFQ event")
	}

	// Instrument symbols are optional in the deployed event contract. An
	// omitted field is valid, while an explicitly empty field is malformed.
	dialer.latestConn().feedServerMsg([]byte(`{"e":"requestForQuote","E":1780000000001,"r":"rfq-omitted-symbol","l":[{"c":"123","o":"NO"}],"S":"OPEN"}`))
	select {
	case event := <-events:
		if event.RFQID != "rfq-omitted-symbol" || event.Legs[0].InstrumentSymbol != nil {
			t.Fatalf("unexpected omitted instrument symbol event: %+v", event)
		}
	case <-time.After(time.Second):
		t.Fatal("timed out waiting for RFQ event without instrument symbol")
	}

	dialer.latestConn().feedServerMsg([]byte(`{"e":"requestForQuote","E":1780000000002,"r":"rfq-empty-symbol","l":[{"c":"123","o":"YES","s":""}],"S":"OPEN"}`))
	select {
	case event := <-events:
		t.Fatalf("received RFQ event with empty instrument symbol: %+v", event)
	case <-time.After(50 * time.Millisecond):
	}

	// A valid JSON frame with the wrong event shape must not be exposed as a
	// typed event; callers should only receive spec-conformant values.
	dialer.latestConn().feedServerMsg([]byte(`{"e":"requestForQuote","E":1,"r":"rfq-2","l":[],"S":"UNKNOWN"}`))
	select {
	case event := <-events:
		t.Fatalf("received malformed RFQ event: %+v", event)
	case <-time.After(50 * time.Millisecond):
	}
}

func TestPrivateRFQDeliveryAndQuoteMethodsUseDocumentedWireContract(t *testing.T) {
	dialer := &mockDrainDialer{
		responseResult: json.RawMessage(`{"rfqId":"rfq-1","quoteId":"quote-1","confirmed":true}`),
	}
	client := websocket.NewPrivateClient(
		"wss://ws.gemini.com",
		auth.NewTimeBasedHMAC("key", "secret"),
		websocket.WithDialer(dialer),
	)
	defer client.Close()

	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()
	deliveries, err := client.SubscribeRFQDeliveries(ctx, websocket.ScopeSession)
	if err != nil {
		t.Fatalf("SubscribeRFQDeliveries failed: %v", err)
	}
	dialer.latestConn().feedServerMsg([]byte(`{"e":"requestForQuote","i":"delivery-1","E":1780000001000,"r":"rfq-1","x":"ACCEPTED","S":"CONFIRMING","q":"quote-1","p":"0.55","sz":"100","qs":"ACTIVE","vu":1780000060000}`))
	select {
	case delivery := <-deliveries:
		if delivery.DeliveryID != "delivery-1" || delivery.Transition != websocket.RFQTransitionAccepted || delivery.QuoteID == nil || *delivery.QuoteID != "quote-1" {
			t.Fatalf("unexpected RFQ delivery: %+v", delivery)
		}
	case <-time.After(time.Second):
		t.Fatal("timed out waiting for RFQ delivery")
	}

	validUntil := int64(1780000060000)
	submitted, err := client.SubmitRFQQuote(ctx, websocket.RFQSubmitQuoteParams{
		RFQID: "rfq-1", Price: "0.55", Quantity: "100", ValidUntil: &validUntil,
	})
	if err != nil || submitted.RFQID != "rfq-1" || submitted.QuoteID != "quote-1" {
		t.Fatalf("SubmitRFQQuote = %+v, %v", submitted, err)
	}
	withdrawn, err := client.WithdrawRFQQuote(ctx, websocket.RFQWithdrawQuoteParams{RFQID: "rfq-1", QuoteID: "quote-1"})
	if err != nil || withdrawn.RFQID != "rfq-1" || withdrawn.QuoteID != "quote-1" {
		t.Fatalf("WithdrawRFQQuote = %+v, %v", withdrawn, err)
	}
	confirmed, err := client.ConfirmRFQQuote(ctx, websocket.RFQConfirmQuoteParams{RFQID: "rfq-1", QuoteID: "quote-1", Confirm: true})
	if err != nil || !confirmed.Confirmed {
		t.Fatalf("ConfirmRFQQuote = %+v, %v", confirmed, err)
	}

	writes := writtenFrames(dialer.latestConn())
	methods := make(map[string]json.RawMessage)
	for _, payload := range writes {
		var frame struct {
			Method string          `json:"method"`
			Params json.RawMessage `json:"params"`
		}
		if err := json.Unmarshal(payload, &frame); err == nil && frame.Method != "" {
			methods[frame.Method] = frame.Params
		}
	}
	for _, method := range []string{"SUBSCRIBE", "rfq.submit_quote", "rfq.withdraw_quote", "rfq.confirm_quote"} {
		if _, ok := methods[method]; !ok {
			t.Errorf("missing %s request in wire frames", method)
		}
	}
	var submitParams websocket.RFQSubmitQuoteParams
	if err := json.Unmarshal(methods["rfq.submit_quote"], &submitParams); err != nil {
		t.Fatalf("decode submit params: %v", err)
	}
	if submitParams.RFQID != "rfq-1" || submitParams.Price != "0.55" || submitParams.ValidUntil == nil || *submitParams.ValidUntil != 1780000060000 {
		t.Fatalf("unexpected submit params: %+v", submitParams)
	}
}

func TestRFQQuoteMethodsRequireAuthentication(t *testing.T) {
	client := websocket.NewPublicClient("wss://ws.gemini.com")
	defer client.Close()
	_, err := client.SubmitRFQQuote(context.Background(), websocket.RFQSubmitQuoteParams{})
	if !errors.Is(err, websocket.ErrAuthenticationRequired) {
		t.Fatalf("expected authentication error, got %v", err)
	}
}

func TestRFQQuoteMethodsRejectInvalidParametersBeforeWriting(t *testing.T) {
	dialer := &mockDrainDialer{}
	client := websocket.NewPrivateClient(
		"wss://ws.gemini.com",
		auth.NewTimeBasedHMAC("key", "secret"),
		websocket.WithDialer(dialer),
	)
	defer client.Close()

	negativeExpiry := int64(-1)
	tests := []struct {
		name string
		call func() error
	}{
		{
			name: "submit missing RFQ ID",
			call: func() error {
				_, err := client.SubmitRFQQuote(context.Background(), websocket.RFQSubmitQuoteParams{Price: "0.55", Quantity: "1"})
				return err
			},
		},
		{
			name: "submit invalid price",
			call: func() error {
				_, err := client.SubmitRFQQuote(context.Background(), websocket.RFQSubmitQuoteParams{RFQID: "rfq-1", Price: "not-a-decimal", Quantity: "1"})
				return err
			},
		},
		{
			name: "submit zero price",
			call: func() error {
				_, err := client.SubmitRFQQuote(context.Background(), websocket.RFQSubmitQuoteParams{RFQID: "rfq-1", Price: "0", Quantity: "1"})
				return err
			},
		},
		{
			name: "submit zero quantity",
			call: func() error {
				_, err := client.SubmitRFQQuote(context.Background(), websocket.RFQSubmitQuoteParams{RFQID: "rfq-1", Price: "0.55", Quantity: "0.000"})
				return err
			},
		},
		{
			name: "submit invalid expiry",
			call: func() error {
				_, err := client.SubmitRFQQuote(context.Background(), websocket.RFQSubmitQuoteParams{RFQID: "rfq-1", Price: "0.55", Quantity: "1", ValidUntil: &negativeExpiry})
				return err
			},
		},
		{
			name: "withdraw missing quote ID",
			call: func() error {
				_, err := client.WithdrawRFQQuote(context.Background(), websocket.RFQWithdrawQuoteParams{RFQID: "rfq-1"})
				return err
			},
		},
		{
			name: "confirm missing RFQ ID",
			call: func() error {
				_, err := client.ConfirmRFQQuote(context.Background(), websocket.RFQConfirmQuoteParams{QuoteID: "quote-1", Confirm: false})
				return err
			},
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			if err := test.call(); !errors.Is(err, websocket.ErrInvalidRFQParams) {
				t.Fatalf("error = %v, want ErrInvalidRFQParams", err)
			}
		})
	}
	if got := dialer.connCount(); got != 0 {
		t.Fatalf("invalid RFQ requests opened %d WebSocket connections", got)
	}
}

func TestRFQQuoteMethodsUseBearerAuthentication(t *testing.T) {
	dialer := &mockDrainDialer{
		responseResult: json.RawMessage(`{"rfqId":"rfq-1","quoteId":"quote-1","confirmed":true}`),
	}
	client := websocket.NewPrivateClient(
		"wss://ws.gemini.com",
		auth.NewBearer(auth.BearerToken("rfq-oauth-token")),
		websocket.WithDialer(dialer),
	)
	defer client.Close()

	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()
	if _, err := client.SubmitRFQQuote(ctx, websocket.RFQSubmitQuoteParams{RFQID: "rfq-1", Price: "0.55", Quantity: "1"}); err != nil {
		t.Fatalf("SubmitRFQQuote with bearer auth failed: %v", err)
	}
	if _, err := client.WithdrawRFQQuote(ctx, websocket.RFQWithdrawQuoteParams{RFQID: "rfq-1", QuoteID: "quote-1"}); err != nil {
		t.Fatalf("WithdrawRFQQuote with bearer auth failed: %v", err)
	}
	if _, err := client.ConfirmRFQQuote(ctx, websocket.RFQConfirmQuoteParams{RFQID: "rfq-1", QuoteID: "quote-1", Confirm: false}); err != nil {
		t.Fatalf("ConfirmRFQQuote with bearer auth failed: %v", err)
	}
	if got := dialer.latestHeaders().Get("Authorization"); got != "Bearer rfq-oauth-token" {
		t.Fatalf("RFQ WebSocket Authorization = %q, want Bearer rfq-oauth-token", got)
	}
}

func TestRFQDeliveryScopesAreMutuallyExclusive(t *testing.T) {
	client := websocket.NewPrivateClient(
		"wss://ws.gemini.com",
		auth.NewTimeBasedHMAC("key", "secret"),
		websocket.WithDialer(&mockDrainDialer{}),
	)
	defer client.Close()

	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()
	if _, err := client.SubscribeRFQDeliveries(ctx, websocket.ScopeAccount); err != nil {
		t.Fatalf("account RFQ subscription failed: %v", err)
	}
	if _, err := client.SubscribeRFQDeliveries(ctx, websocket.ScopeSession); !errors.Is(err, websocket.ErrRFQScopeConflict) {
		t.Fatalf("session RFQ subscription error = %v, want ErrRFQScopeConflict", err)
	}
}
