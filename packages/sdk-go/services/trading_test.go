package services_test

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gemini/gemini-go/generated/trading"
	"github.com/gemini/gemini-go/services"
	"github.com/gemini/gemini-go/transport"
	"github.com/gemini/gemini-go/types"
)

func TestTradingService_FluentOrderHelpers(t *testing.T) {
	var capturedBody []byte
	var capturedPath string

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		capturedPath = r.URL.Path
		buf := make([]byte, r.ContentLength)
		_, _ = r.Body.Read(buf)
		capturedBody = buf

		w.Header().Set("Content-Type", "application/json")
		orderID := "998877"
		symbol := "BTCUSD"
		side := trading.LimitOrderResponseSideBuy
		price := "65000.00"
		origAmt := "0.05"
		res := trading.LimitOrderResponse{
			OrderId:        &orderID,
			Symbol:         &symbol,
			Side:           &side,
			Price:          &price,
			OriginalAmount: &origAmt,
		}
		_ = json.NewEncoder(w).Encode(res)
	}))
	defer server.Close()

	trans := transport.NewClient(transport.WithHTTPClient(server.Client()))
	svc := services.NewTradingService(trans, server.URL)

	ctx := context.Background()
	amount := types.MustParseDecimal("0.05")
	price := types.MustParseDecimal("65000.00")

	// 1. PostOnlyBid
	res, err := svc.PostOnlyBid(ctx, "BTCUSD", amount, price)
	if err != nil {
		t.Fatalf("PostOnlyBid failed: %v", err)
	}
	if res.OrderId == nil || *res.OrderId != "998877" || capturedPath != "/v1/order/new" {
		t.Errorf("unexpected response: %+v", res)
	}

	var req trading.NewOrderRequest
	if err := json.Unmarshal(capturedBody, &req); err != nil {
		t.Fatalf("unmarshaling captured body: %v", err)
	}
	if req.Side != trading.NewOrderRequestSideBuy || req.Amount != "0.05" || req.Price != "65000" {
		t.Errorf("unexpected request payload: %+v", req)
	}
	if req.Options == nil || len(*req.Options) == 0 || (*req.Options)[0] != trading.MakerOrCancel {
		t.Errorf("expected maker-or-cancel option, got: %+v", req.Options)
	}

	// 2. PostOnlyAsk
	_, err = svc.PostOnlyAsk(ctx, "BTCUSD", amount, price)
	if err != nil {
		t.Fatalf("PostOnlyAsk failed: %v", err)
	}

	// 3. LimitBuy & LimitSell
	_, err = svc.LimitBuy(ctx, "BTCUSD", amount, price)
	if err != nil {
		t.Fatalf("LimitBuy failed: %v", err)
	}
	_, err = svc.LimitSell(ctx, "BTCUSD", amount, price)
	if err != nil {
		t.Fatalf("LimitSell failed: %v", err)
	}

	// 4. ImmediateOrCancelBuy & ImmediateOrCancelSell
	_, err = svc.ImmediateOrCancelBuy(ctx, "BTCUSD", amount, price)
	if err != nil {
		t.Fatalf("ImmediateOrCancelBuy failed: %v", err)
	}
	_, err = svc.ImmediateOrCancelSell(ctx, "BTCUSD", amount, price)
	if err != nil {
		t.Fatalf("ImmediateOrCancelSell failed: %v", err)
	}

	// 5. Fluent order placement with OrderOption (ClientOrderID, StopPrice)
	_, err = svc.PostOnlyBid(ctx, "BTCUSD", amount, price,
		services.WithClientOrderID("custom-client-id-1234"),
		services.WithStopPrice(types.MustParseDecimal("64000.00")),
	)
	if err != nil {
		t.Fatalf("PostOnlyBid with options failed: %v", err)
	}

	var optReq trading.NewOrderRequest
	if err := json.Unmarshal(capturedBody, &optReq); err != nil {
		t.Fatalf("unmarshaling captured body: %v", err)
	}
	if optReq.ClientOrderId == nil || *optReq.ClientOrderId != "custom-client-id-1234" {
		t.Errorf("expected ClientOrderId custom-client-id-1234, got: %v", optReq.ClientOrderId)
	}
	if optReq.StopPrice == nil || *optReq.StopPrice != "64000" {
		t.Errorf("expected StopPrice 64000, got: %v", optReq.StopPrice)
	}
	if optReq.Options != nil {
		t.Errorf("expected stop-limit order to omit execution options, got: %v", optReq.Options)
	}
}

func TestTradingService_ValidatesStopLimitOrders(t *testing.T) {
	var requests int
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		requests++
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{}`))
	}))
	defer server.Close()

	service := services.NewTradingService(transport.NewClient(transport.WithHTTPClient(server.Client())), server.URL)
	valid := func(side trading.NewOrderRequestSide, price, stopPrice string) *trading.NewOrderRequest {
		return &trading.NewOrderRequest{
			Symbol:    "BTCUSD",
			Amount:    "1",
			Price:     price,
			Side:      side,
			StopPrice: &stopPrice,
			Type:      trading.NewOrderRequestTypeExchangeStopLimit,
		}
	}

	tests := map[string]*trading.NewOrderRequest{
		"missing stop price": {
			Symbol: "BTCUSD", Amount: "1", Price: "100", Side: trading.NewOrderRequestSideBuy,
			Type: trading.NewOrderRequestTypeExchangeStopLimit,
		},
		"buy trigger is not below limit":  valid(trading.NewOrderRequestSideBuy, "100", "100"),
		"sell trigger is not above limit": valid(trading.NewOrderRequestSideSell, "100", "99"),
		"zero stop price":                 valid(trading.NewOrderRequestSideBuy, "100", "0"),
		"execution option": func() *trading.NewOrderRequest {
			req := valid(trading.NewOrderRequestSideBuy, "100", "99")
			options := []trading.NewOrderRequestOptions{trading.MakerOrCancel}
			req.Options = &options
			return req
		}(),
		"stop price on limit order": func() *trading.NewOrderRequest {
			stopPrice := "99"
			return &trading.NewOrderRequest{
				Symbol: "BTCUSD", Amount: "1", Price: "100", Side: trading.NewOrderRequestSideBuy,
				StopPrice: &stopPrice, Type: trading.NewOrderRequestTypeExchangeLimit,
			}
		}(),
		"whitespace stop price": func() *trading.NewOrderRequest {
			stopPrice := " \t"
			return &trading.NewOrderRequest{
				Symbol: "BTCUSD", Amount: "1", Price: "100", Side: trading.NewOrderRequestSideBuy,
				StopPrice: &stopPrice, Type: trading.NewOrderRequestTypeExchangeLimit,
			}
		}(),
	}

	for name, req := range tests {
		t.Run(name, func(t *testing.T) {
			if _, err := service.NewOrder(context.Background(), req); err == nil {
				t.Fatal("expected stop-limit validation error")
			}
		})
	}
	if requests != 0 {
		t.Fatalf("invalid stop-limit requests reached the server: %d", requests)
	}

	if _, err := service.NewOrder(context.Background(), valid(trading.NewOrderRequestSideBuy, "100", "99")); err != nil {
		t.Fatalf("valid stop-limit order failed validation: %v", err)
	}
	if requests != 1 {
		t.Fatalf("expected one valid request, got %d", requests)
	}
}

func TestTradingService_Methods(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		orderID := "123456"
		symbol := "btcusd"
		switch r.URL.Path {
		case "/v1/order/status":
			_ = json.NewEncoder(w).Encode(trading.LimitOrderResponse{
				OrderId: &orderID,
				Symbol:  &symbol,
			})
		case "/v1/orders":
			_ = json.NewEncoder(w).Encode([]trading.LimitOrderResponse{
				{OrderId: &orderID, Symbol: &symbol},
			})
		case "/v1/mytrades":
			var tradeID int64 = 1001
			_ = json.NewEncoder(w).Encode([]trading.MyTrade{
				{Tid: &tradeID},
			})
		case "/v1/order/cancel":
			_ = json.NewEncoder(w).Encode(trading.CancelOrderResponse{
				OrderId: &orderID,
			})
		case "/v1/order/cancel/all":
			canceled := []int{123456}
			_ = json.NewEncoder(w).Encode(trading.CancelAllResult{
				Details: &struct {
					CancelRejects   *[]int `json:"cancelRejects,omitempty"`
					CancelledOrders *[]int `json:"cancelledOrders,omitempty"`
				}{
					CancelledOrders: &canceled,
				},
			})
		default:
			http.NotFound(w, r)
		}
	}))
	defer server.Close()

	trans := transport.NewClient(transport.WithHTTPClient(server.Client()))
	svc := services.NewTradingService(trans, server.URL)
	ctx := context.Background()

	// 1. GetOrderStatusByID
	st, err := svc.GetOrderStatusByID(ctx, 123456)
	if err != nil || st.OrderId == nil || *st.OrderId != "123456" {
		t.Fatalf("GetOrderStatusByID failed: %v, %+v", err, st)
	}

	// 2. GetActiveOrders
	active, err := svc.GetActiveOrders(ctx, nil)
	if err != nil || len(active) != 1 {
		t.Fatalf("GetActiveOrders failed: %v, %+v", err, active)
	}

	// 3. GetPastTradesBySymbol
	trades, err := svc.GetPastTradesBySymbol(ctx, "btcusd", 10)
	if err != nil || len(trades) != 1 {
		t.Fatalf("GetPastTradesBySymbol failed: %v, %+v", err, trades)
	}

	// 4. CancelOrder
	cancelRes, err := svc.CancelOrder(ctx, &trading.CancelOrderRequest{
		OrderId: 123456,
	})
	if err != nil || cancelRes.OrderId == nil || *cancelRes.OrderId != "123456" {
		t.Fatalf("CancelOrder failed: %v, %+v", err, cancelRes)
	}

	// 5. CancelAllOrders
	cancelAllRes, err := svc.CancelAllOrders(ctx, nil, services.CancelAllOrdersOptions{Confirm: true})
	if err != nil || cancelAllRes.Details == nil {
		t.Fatalf("CancelAllOrders failed: %v, %+v", err, cancelAllRes)
	}
}

func TestTradingService_CancelAllRequiresExplicitConfirmation(t *testing.T) {
	var requests int
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		requests++
		w.WriteHeader(http.StatusInternalServerError)
	}))
	defer server.Close()

	svc := services.NewTradingService(transport.NewClient(transport.WithHTTPClient(server.Client())), server.URL)
	if _, err := svc.CancelAllOrders(context.Background(), nil); !errors.Is(err, transport.ErrCancelConfirmationRequired) {
		t.Fatalf("unconfirmed CancelAllOrders error = %v, want ErrCancelConfirmationRequired", err)
	}
	if requests != 0 {
		t.Fatalf("unconfirmed CancelAllOrders reached the server %d times", requests)
	}
}
