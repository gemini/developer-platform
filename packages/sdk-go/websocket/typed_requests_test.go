package websocket_test

import (
	"context"
	"encoding/json"
	"math"
	"testing"
	"time"

	"github.com/gemini/gemini-go/auth"
	"github.com/gemini/gemini-go/websocket"
)

func TestTypedUtilityAndSubscriptionRequests(t *testing.T) {
	dialer := &mockDrainDialer{responseResult: json.RawMessage(`{"serverTime":123}`)}
	client := websocket.NewPrivateClient(
		"wss://ws.gemini.com",
		auth.NewHMAC("key", "secret"),
		websocket.WithDialer(dialer),
	)
	defer client.Close()

	info, err := client.ConnInfo(context.Background())
	if err != nil || info["serverTime"] != json.Number("123") {
		t.Fatalf("ConnInfo failed: %v %#v", err, info)
	}
	if _, err := client.Time(context.Background()); err != nil {
		t.Fatalf("Time failed: %v", err)
	}
	if err := client.SubscribeStreams(context.Background(), "orders@account"); err != nil {
		t.Fatalf("SubscribeStreams failed: %v", err)
	}
	if err := client.UnsubscribeStreams(context.Background(), "orders@account"); err != nil {
		t.Fatalf("UnsubscribeStreams failed: %v", err)
	}

	listDialer := &mockDrainDialer{responseResult: json.RawMessage(`["orders@account"]`)}
	listClient := websocket.NewPublicClient("wss://ws.gemini.com", websocket.WithDialer(listDialer))
	defer listClient.Close()
	streams, err := listClient.ListSubscriptions(context.Background())
	if err != nil || len(streams) != 1 || streams[0] != "orders@account" {
		t.Fatalf("ListSubscriptions failed: %v %v", err, streams)
	}
}

func TestTypedOrderRequestsRequireAuthAndConfirmation(t *testing.T) {
	public := websocket.NewPublicClient("wss://ws.gemini.com")
	defer public.Close()
	if _, err := public.PlaceOrder(context.Background(), websocket.OrderPlaceParams{}); err == nil {
		t.Fatal("expected invalid public order request to fail")
	}

	privateDialer := &mockDrainDialer{responseResult: json.RawMessage(`{"orderId":7}`)}
	private := websocket.NewPrivateClient(
		"wss://ws.gemini.com",
		auth.NewHMAC("key", "secret"),
		websocket.WithDialer(privateDialer),
	)
	defer private.Close()

	if _, err := private.CancelAllOrders(context.Background(), websocket.CancelAllOptions{}); err != websocket.ErrCancelConfirmationRequired {
		t.Fatalf("expected cancel confirmation error, got %v", err)
	}

	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()
	if _, err := private.PlaceOrder(ctx, websocket.OrderPlaceParams{
		Symbol:      "GEMI-TEST",
		Side:        "BUY",
		Type:        "LIMIT",
		TimeInForce: "GTC",
		Quantity:    "1.25",
		Price:       "0.50",
	}); err != nil {
		t.Fatalf("PlaceOrder failed: %v", err)
	}
	if _, err := private.PlaceOrder(ctx, websocket.OrderPlaceParams{
		Symbol:      "GEMI-TEST",
		Side:        "SELL",
		Type:        "LIMIT",
		TimeInForce: "GTC",
		Quantity:    "1.25",
		Price:       "0.45",
		StopPrice:   "0.48",
	}); err != nil {
		t.Fatalf("STOP_LIMIT PlaceOrder failed: %v", err)
	}
	if _, err := private.CancelOrder(ctx, websocket.OrderCancelParams{OrderID: "7"}); err != nil {
		t.Fatalf("CancelOrder failed: %v", err)
	}
	if _, err := private.CancelAllOrders(ctx, websocket.CancelAllOptions{Confirm: true}); err != nil {
		t.Fatalf("CancelAllOrders failed: %v", err)
	}
	if _, err := private.CancelSessionOrders(ctx, websocket.CancelAllOptions{Confirm: true}); err != nil {
		t.Fatalf("CancelSessionOrders failed: %v", err)
	}

	type typedOrderFrame struct {
		Method string `json:"method"`
		Params struct {
			Type      string `json:"type"`
			Price     string `json:"price"`
			StopPrice string `json:"stopPrice"`
		} `json:"params"`
	}
	var frames []typedOrderFrame
	for _, payload := range writtenFrames(privateDialer.latestConn()) {
		var frame typedOrderFrame
		if err := json.Unmarshal(payload, &frame); err == nil {
			frames = append(frames, frame)
		}
	}
	var foundStopLimit bool
	for _, frame := range frames {
		if frame.Method == "order.place" && frame.Params.Type == "LIMIT" && frame.Params.StopPrice != "" {
			foundStopLimit = frame.Params.Price == "0.45" && frame.Params.StopPrice == "0.48"
		}
	}
	if !foundStopLimit {
		t.Fatal("LIMIT stop-limit request did not preserve both price and stopPrice")
	}
}

func TestTypedOrderRequestsMatchStopLimitWireFormat(t *testing.T) {
	client := websocket.NewPrivateClient("wss://ws.gemini.com", auth.NewHMAC("key", "secret"))
	defer client.Close()

	err := func() error {
		_, err := client.PlaceOrder(context.Background(), websocket.OrderPlaceParams{
			Symbol: "GEMI-TEST", Side: "BUY", Type: "STOP_LIMIT", TimeInForce: "GTC",
			Quantity: "1", Price: "0.50", StopPrice: "0.49",
		})
		return err
	}()
	if err == nil {
		t.Fatal("expected STOP_LIMIT request type to be rejected; use LIMIT with stopPrice")
	}
}

func TestTypedOrderRequestsRejectInvalidValuesBeforeSending(t *testing.T) {
	client := websocket.NewPublicClient("wss://ws.gemini.com")
	defer client.Close()

	base := websocket.OrderPlaceParams{
		Symbol:      "GEMI-TEST",
		Side:        websocket.OrderSideBuy,
		Type:        websocket.OrderTypeLimit,
		TimeInForce: websocket.TimeInForceGTC,
		Quantity:    "1",
		Price:       "0.50",
	}
	for name, params := range map[string]websocket.OrderPlaceParams{
		"zero quantity": func() websocket.OrderPlaceParams {
			p := base
			p.Quantity = "0"
			return p
		}(),
		"invalid price": func() websocket.OrderPlaceParams {
			p := base
			p.Price = "not-a-decimal"
			return p
		}(),
		"invalid outcome": func() websocket.OrderPlaceParams {
			p := base
			p.EventOutcome = "MAYBE"
			return p
		}(),
		"buy stop trigger exceeds limit": func() websocket.OrderPlaceParams {
			p := base
			p.StopPrice = "0.51"
			return p
		}(),
		"sell stop trigger is below limit": func() websocket.OrderPlaceParams {
			p := base
			p.Side = websocket.OrderSideSell
			p.StopPrice = "0.49"
			return p
		}(),
		"whitespace stop price": func() websocket.OrderPlaceParams {
			p := base
			p.StopPrice = " \t"
			return p
		}(),
	} {
		t.Run(name, func(t *testing.T) {
			if _, err := client.PlaceOrder(context.Background(), params); err == nil {
				t.Fatal("expected invalid order to fail validation")
			}
		})
	}

	for name, orderID := range map[string]any{
		"zero integer":       json.Number("0"),
		"negative integer":   json.Number("-1"),
		"fractional number":  json.Number("1.5"),
		"non-numeric number": json.Number("not-a-number"),
	} {
		t.Run(name, func(t *testing.T) {
			if _, err := client.CancelOrder(context.Background(), websocket.OrderCancelParams{OrderID: orderID}); err == nil {
				t.Fatal("expected invalid order ID to fail validation")
			}
		})
	}
}

func TestTypedOrderRequestsAcceptFloat64OrderID(t *testing.T) {
	// encoding/json decodes JSON numbers into interface{} as float64, so an
	// order ID that has round-tripped through generic JSON decoding elsewhere
	// in a caller's application must still pass validation here.
	dialer := &mockDrainDialer{responseResult: json.RawMessage(`{"orderId":7}`)}
	client := websocket.NewPrivateClient(
		"wss://ws.gemini.com",
		auth.NewHMAC("key", "secret"),
		websocket.WithDialer(dialer),
	)
	defer client.Close()

	if _, err := client.CancelOrder(context.Background(), websocket.OrderCancelParams{OrderID: float64(7)}); err != nil {
		t.Fatalf("expected float64 order ID to pass validation, got: %v", err)
	}
}

func TestTypedOrderRequestsRejectUnsafeFloat64OrderIDs(t *testing.T) {
	client := websocket.NewPrivateClient(
		"wss://ws.gemini.com",
		auth.NewHMAC("key", "secret"),
		websocket.WithDialer(&mockDrainDialer{}),
	)
	defer client.Close()

	for _, orderID := range []float64{0, -1, 1.5, math.NaN(), math.Inf(1), float64(1 << 53)} {
		if _, err := client.CancelOrder(context.Background(), websocket.OrderCancelParams{OrderID: orderID}); err == nil {
			t.Fatalf("expected float64 order ID %v to fail validation", orderID)
		}
	}
}

func TestTypedOrderRequestsAllowEqualStopAndLimitPrices(t *testing.T) {
	client := websocket.NewPrivateClient(
		"wss://ws.gemini.com",
		auth.NewHMAC("key", "secret"),
		websocket.WithDialer(&mockDrainDialer{}),
	)
	defer client.Close()

	for _, params := range []websocket.OrderPlaceParams{
		{Symbol: "GEMI-TEST", Side: websocket.OrderSideBuy, Type: websocket.OrderTypeLimit, TimeInForce: websocket.TimeInForceGTC, Quantity: "1", Price: "0.50", StopPrice: "0.50"},
		{Symbol: "GEMI-TEST", Side: websocket.OrderSideSell, Type: websocket.OrderTypeLimit, TimeInForce: websocket.TimeInForceGTC, Quantity: "1", Price: "0.50", StopPrice: "0.50"},
	} {
		if _, err := client.PlaceOrder(context.Background(), params); err != nil {
			t.Fatalf("equal stop/limit prices should be accepted: %v", err)
		}
	}
}
