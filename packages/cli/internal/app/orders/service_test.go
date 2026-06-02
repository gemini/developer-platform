package orders

import (
	"context"
	"errors"
	"testing"

	"github.com/gemini/developer-platform/packages/cli/internal/api"
	"github.com/gemini/developer-platform/packages/cli/internal/contracts"
	"github.com/gemini/developer-platform/packages/cli/internal/ws"
)

type stubAPIClient struct {
	notionalVolumeResp *api.NotionalVolumeResponse
	notionalVolumeErr  error
	predictOrderResp   *api.PredictOrderResponse
	predictOrderErr    error
	spotOrderResp      *api.SpotOrderResponse
	spotOrderErr       error
	cancelPredictResp  *api.PredictOrderResponse
	cancelPredictErr   error
	cancelSpotResp     *api.SpotOrderResponse
	cancelSpotErr      error
	predictOrdersResp  *api.PredictOrdersResponse
	predictOrdersErr   error
	spotOrdersResp     []api.SpotOrderResponse
	spotOrdersErr      error
	cancelAllResp      *api.CancelAllResult
	cancelAllErr       error
	cancelAllSpotResp  *api.CancelAllResult
	cancelAllSpotErr   error
	placePredictCalls  int
	placeSpotCalls     int
}

func (s *stubAPIClient) GetNotionalVolume(context.Context) (*api.NotionalVolumeResponse, error) {
	return s.notionalVolumeResp, s.notionalVolumeErr
}

func (s *stubAPIClient) PlacePredictOrder(context.Context, *api.PredictOrderRequest) (*api.PredictOrderResponse, error) {
	s.placePredictCalls++
	return s.predictOrderResp, s.predictOrderErr
}

func (s *stubAPIClient) PlaceSpotOrder(context.Context, *api.SpotOrderRequest) (*api.SpotOrderResponse, error) {
	s.placeSpotCalls++
	return s.spotOrderResp, s.spotOrderErr
}

func (s *stubAPIClient) CancelPredictOrder(context.Context, string) (*api.PredictOrderResponse, error) {
	return s.cancelPredictResp, s.cancelPredictErr
}

func (s *stubAPIClient) CancelSpotOrder(context.Context, string) (*api.SpotOrderResponse, error) {
	return s.cancelSpotResp, s.cancelSpotErr
}

func (s *stubAPIClient) ListOpenPredictOrders(context.Context, api.ListPredictOrdersParams) (*api.PredictOrdersResponse, error) {
	return s.predictOrdersResp, s.predictOrdersErr
}

func (s *stubAPIClient) ListSpotOrders(context.Context, api.ListSpotOrdersParams) ([]api.SpotOrderResponse, error) {
	return s.spotOrdersResp, s.spotOrdersErr
}

func (s *stubAPIClient) CancelAllOrders(context.Context) (*api.CancelAllResult, error) {
	return s.cancelAllResp, s.cancelAllErr
}

func (s *stubAPIClient) CancelAllSpotOrders(context.Context, string) (*api.CancelAllResult, error) {
	return s.cancelAllSpotResp, s.cancelAllSpotErr
}

type stubWSManager struct {
	depthResp       *api.OrderBook
	depthErr        error
	depthSymbol     string
	depthLevels     int
	placeOrderResp  *ws.OrderResult
	placeOrderErr   error
	cancelOrderResp *ws.OrderResult
	cancelOrderErr  error
	cancelAllResp   *ws.CancelAllResult
	cancelAllErr    error
}

func (s *stubWSManager) DepthSnapshot(_ context.Context, symbol string, levels int) (*api.OrderBook, error) {
	s.depthSymbol = symbol
	s.depthLevels = levels
	return s.depthResp, s.depthErr
}

func (s *stubWSManager) PlaceOrder(context.Context, *ws.OrderParams) (*ws.OrderResult, error) {
	return s.placeOrderResp, s.placeOrderErr
}

func (s *stubWSManager) CancelOrder(context.Context, ws.CancelParams) (*ws.OrderResult, error) {
	return s.cancelOrderResp, s.cancelOrderErr
}

func (s *stubWSManager) CancelAllOrders(context.Context, *ws.CancelAllParams) (*ws.CancelAllResult, error) {
	return s.cancelAllResp, s.cancelAllErr
}

func TestPredictionFeeCentsMatchesPublishedExamples(t *testing.T) {
	tests := []struct {
		name       string
		feeRate    predictionFeeRate
		priceCents int
		contracts  int
		wantCents  int64
	}{
		{name: "maker 10c 100 contracts", feeRate: predictionMakerFeeRate, priceCents: 10, contracts: 100, wantCents: 16},
		{name: "maker 50c 100 contracts", feeRate: predictionMakerFeeRate, priceCents: 50, contracts: 100, wantCents: 44},
		{name: "taker 40c 100 contracts", feeRate: predictionTakerFeeRate, priceCents: 40, contracts: 100, wantCents: 168},
		{name: "taker 90c 100 contracts", feeRate: predictionTakerFeeRate, priceCents: 90, contracts: 100, wantCents: 63},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := predictionFeeCents(tt.feeRate, tt.contracts, tt.priceCents)
			if got != tt.wantCents {
				t.Fatalf("predictionFeeCents() = %d, want %d", got, tt.wantCents)
			}
		})
	}
}

func TestPreparePredictPlaceLimitBuyDollarsIncludesTakerFees(t *testing.T) {
	wsMgr := &stubWSManager{
		depthResp: &api.OrderBook{
			Asks: []api.OrderBookEntry{
				{Price: "0.70", Amount: "100"},
				{Price: "0.60", Amount: "10"},
				{Price: "0.65", Amount: "100"},
			},
			Bids: []api.OrderBookEntry{
				{Price: "0.55", Amount: "100"},
			},
		},
	}
	svc := NewService(&stubAPIClient{}, wsMgr, false)

	req, dryRun, err := svc.PreparePredictPlace(context.Background(), PredictPlaceInput{
		Symbol:      "GEMI-TEST",
		Side:        "buy",
		Outcome:     "yes",
		Type:        "limit",
		Dollars:     "50",
		Price:       "0.65",
		TimeInForce: "good-til-cancel",
	})
	if err != nil {
		t.Fatalf("PreparePredictPlace() error = %v", err)
	}
	if wsMgr.depthSymbol != "" {
		t.Fatalf("depth symbol = %s, want no depth snapshot for limit sizing", wsMgr.depthSymbol)
	}
	if req.Quantity != "75" {
		t.Fatalf("Quantity = %s, want 75", req.Quantity)
	}
	if req.Price != "0.65" {
		t.Fatalf("Price = %s, want 0.65", req.Price)
	}
	if dryRun.Action != contracts.ActionPredictOrderPlace {
		t.Fatalf("Action = %s, want %s", dryRun.Action, contracts.ActionPredictOrderPlace)
	}
	if dryRun.EstimatedNotional != "48.75" || dryRun.EstimatedFee != "1.20" || dryRun.EstimatedTotal != "49.95" {
		t.Fatalf("dry-run estimates = notional %s fee %s total %s, want 48.75/1.20/49.95", dryRun.EstimatedNotional, dryRun.EstimatedFee, dryRun.EstimatedTotal)
	}
}

func TestPreparePredictPlacePostOnlyBuyDollarsUsesMakerFees(t *testing.T) {
	svc := NewService(&stubAPIClient{}, nil, true)

	req, dryRun, err := svc.PreparePredictPlace(context.Background(), PredictPlaceInput{
		Symbol:      "GEMI-TEST",
		Side:        "buy",
		Outcome:     "yes",
		Type:        "limit",
		Dollars:     "50",
		Price:       "0.65",
		TimeInForce: "post-only",
	})
	if err != nil {
		t.Fatalf("PreparePredictPlace() error = %v", err)
	}
	if req.Quantity != "76" {
		t.Fatalf("Quantity = %s, want 76", req.Quantity)
	}
	if dryRun.FeeType != "maker" || dryRun.EstimatedFee != "0.31" || dryRun.EstimatedTotal != "49.71" {
		t.Fatalf("fee type/fee/total = %s/%s/%s, want maker/0.31/49.71", dryRun.FeeType, dryRun.EstimatedFee, dryRun.EstimatedTotal)
	}
}

func TestPreparePredictPlaceLimitSellDollarsTargetsNotional(t *testing.T) {
	svc := NewService(&stubAPIClient{}, nil, true)

	req, dryRun, err := svc.PreparePredictPlace(context.Background(), PredictPlaceInput{
		Symbol:      "GEMI-TEST",
		Side:        "sell",
		Outcome:     "yes",
		Type:        "limit",
		Dollars:     "50",
		Price:       "0.65",
		TimeInForce: "good-til-cancel",
	})
	if err != nil {
		t.Fatalf("PreparePredictPlace() error = %v", err)
	}
	if req.Quantity != "76" {
		t.Fatalf("Quantity = %s, want 76", req.Quantity)
	}
	if dryRun.EstimatedNotional != "49.40" || dryRun.EstimatedFee != "1.22" || dryRun.EstimatedNet != "48.18" {
		t.Fatalf("dry-run estimates = notional %s fee %s net %s, want 49.40/1.22/48.18", dryRun.EstimatedNotional, dryRun.EstimatedFee, dryRun.EstimatedNet)
	}
}

func TestPreparePredictPlaceMarketSellDollarsUsesBidDepth(t *testing.T) {
	wsMgr := &stubWSManager{
		depthResp: &api.OrderBook{
			Bids: []api.OrderBookEntry{
				{Price: "0.60", Amount: "100"},
				{Price: "0.70", Amount: "20"},
				{Price: "0.65", Amount: "100"},
				{Price: "0.55", Amount: "100"},
			},
		},
	}
	svc := NewService(&stubAPIClient{}, wsMgr, false)

	req, dryRun, err := svc.PreparePredictPlace(context.Background(), PredictPlaceInput{
		Symbol:      "GEMI-TEST",
		Side:        "sell",
		Outcome:     "yes",
		Type:        "market",
		Dollars:     "50",
		TimeInForce: "good-til-cancel",
	})
	if err != nil {
		t.Fatalf("PreparePredictPlace() error = %v", err)
	}
	if req.Quantity != "75" {
		t.Fatalf("Quantity = %s, want 75", req.Quantity)
	}
	if wsMgr.depthSymbol != "GEMI-TEST" {
		t.Fatalf("depth symbol = %s, want GEMI-TEST", wsMgr.depthSymbol)
	}
	if dryRun.EstimatedNotional != "49.75" || dryRun.EstimatedFee != "1.17" || dryRun.EstimatedNet != "48.58" {
		t.Fatalf("dry-run estimates = notional %s fee %s net %s, want 49.75/1.17/48.58", dryRun.EstimatedNotional, dryRun.EstimatedFee, dryRun.EstimatedNet)
	}
}

func TestPreparePredictPlaceDollarSizingRejectsSubCentPrice(t *testing.T) {
	svc := NewService(&stubAPIClient{}, nil, true)

	_, _, err := svc.PreparePredictPlace(context.Background(), PredictPlaceInput{
		Symbol:      "GEMI-TEST",
		Side:        "buy",
		Outcome:     "yes",
		Type:        "limit",
		Dollars:     "50",
		Price:       "0.655",
		TimeInForce: "good-til-cancel",
	})
	if err == nil {
		t.Fatal("PreparePredictPlace() error = nil, want sub-cent price error")
	}
}

func TestPrepareSpotPlaceAdjustsForFees(t *testing.T) {
	svc := NewService(&stubAPIClient{
		notionalVolumeResp: &api.NotionalVolumeResponse{APITakerFeeBps: 10},
	}, nil, true)

	req, dryRun, err := svc.PrepareSpotPlace(context.Background(), SpotPlaceInput{
		Symbol:  "btcusd",
		Side:    "buy",
		Type:    "exchange limit",
		Dollars: "50",
		Price:   "50000",
	})
	if err != nil {
		t.Fatalf("PrepareSpotPlace() error = %v", err)
	}
	if req.Amount == "" || req.Amount == "0" {
		t.Fatalf("Amount = %s, want non-zero", req.Amount)
	}
	if dryRun.Action != contracts.ActionSpotOrderPlace {
		t.Fatalf("Action = %s, want %s", dryRun.Action, contracts.ActionSpotOrderPlace)
	}
}

func TestExecutePredictPlaceFailsClosedWhenWebSocketFails(t *testing.T) {
	apiClient := &stubAPIClient{
		predictOrderResp: &api.PredictOrderResponse{OrderID: "REST1"},
	}
	svc := NewService(apiClient, &stubWSManager{
		placeOrderErr: errors.New("ws unavailable"),
	}, false)

	resp, err := svc.ExecutePredictPlace(context.Background(), &api.PredictOrderRequest{
		Symbol:      "GEMI-TEST",
		Side:        "buy",
		Outcome:     "yes",
		OrderType:   "limit",
		Quantity:    "1",
		Price:       "0.50",
		TimeInForce: "good-til-cancel",
	})
	if err == nil {
		t.Fatal("ExecutePredictPlace() error = nil, want WebSocket error")
	}
	if resp != nil {
		t.Fatalf("ExecutePredictPlace() response = %#v, want nil", resp)
	}
	if apiClient.placePredictCalls != 0 {
		t.Fatalf("PlacePredictOrder calls = %d, want 0", apiClient.placePredictCalls)
	}
}

func TestExecutePredictPlaceUsesRESTWhenWebSocketDisabled(t *testing.T) {
	apiClient := &stubAPIClient{
		predictOrderResp: &api.PredictOrderResponse{OrderID: "REST1"},
	}
	svc := NewService(apiClient, nil, true)

	resp, err := svc.ExecutePredictPlace(context.Background(), &api.PredictOrderRequest{
		Symbol:      "GEMI-TEST",
		Side:        "buy",
		Outcome:     "yes",
		OrderType:   "limit",
		Quantity:    "1",
		Price:       "0.50",
		TimeInForce: "good-til-cancel",
	})
	if err != nil {
		t.Fatalf("ExecutePredictPlace() error = %v", err)
	}
	if resp == nil || resp.OrderID != "REST1" {
		t.Fatalf("ExecutePredictPlace() response = %#v, want REST1", resp)
	}
	if apiClient.placePredictCalls != 1 {
		t.Fatalf("PlacePredictOrder calls = %d, want 1", apiClient.placePredictCalls)
	}
}

func TestExecuteSpotPlaceFailsClosedWhenWebSocketFails(t *testing.T) {
	apiClient := &stubAPIClient{
		spotOrderResp: &api.SpotOrderResponse{OrderID: "REST1"},
	}
	svc := NewService(apiClient, &stubWSManager{
		placeOrderErr: errors.New("ws unavailable"),
	}, false)

	resp, err := svc.ExecuteSpotPlace(context.Background(), &api.SpotOrderRequest{
		Symbol: "btcusd",
		Side:   "buy",
		Type:   "exchange limit",
		Amount: "0.01",
		Price:  "50000",
	})
	if err == nil {
		t.Fatal("ExecuteSpotPlace() error = nil, want WebSocket error")
	}
	if resp != nil {
		t.Fatalf("ExecuteSpotPlace() response = %#v, want nil", resp)
	}
	if apiClient.placeSpotCalls != 0 {
		t.Fatalf("PlaceSpotOrder calls = %d, want 0", apiClient.placeSpotCalls)
	}
}

func TestCancelAllPredictOrdersAlwaysReturnsContractShape(t *testing.T) {
	svc := NewService(&stubAPIClient{
		cancelAllResp: &api.CancelAllResult{
			Details: api.CancelAllDetails{
				CancelledOrders: []api.CancelledOrderDetail{{OrderID: "ORD1"}, {OrderID: "ORD2"}},
			},
		},
	}, nil, true)

	resp, err := svc.CancelAllPredictOrders(context.Background())
	if err != nil {
		t.Fatalf("CancelAllPredictOrders() error = %v", err)
	}
	if len(resp.CanceledOrders) != 2 {
		t.Fatalf("len(CanceledOrders) = %d, want 2", len(resp.CanceledOrders))
	}
}

func TestCancelAllPredictOrdersFallsBackToREST(t *testing.T) {
	svc := NewService(&stubAPIClient{
		cancelAllResp: &api.CancelAllResult{
			Details: api.CancelAllDetails{
				CancelledOrders: []api.CancelledOrderDetail{{OrderID: "REST1"}},
			},
		},
	}, &stubWSManager{
		cancelAllErr: errors.New("ws unavailable"),
	}, false)

	resp, err := svc.CancelAllPredictOrders(context.Background())
	if err != nil {
		t.Fatalf("CancelAllPredictOrders() error = %v", err)
	}
	if len(resp.CanceledOrders) != 1 || resp.CanceledOrders[0] != "REST1" {
		t.Fatalf("CabeledOrders = %#v, want [REST1]", resp.CanceledOrders)
	}
}

func TestCancelPredictOrderFallsBackToREST(t *testing.T) {
	svc := NewService(&stubAPIClient{
		cancelPredictResp: &api.PredictOrderResponse{OrderID: "REST1", Status: "cancelled"},
	}, &stubWSManager{
		cancelOrderErr: errors.New("ws unavailable"),
	}, false)

	resp, err := svc.CancelPredictOrder(context.Background(), "REST1")
	if err != nil {
		t.Fatalf("CancelPredictOrder() error = %v", err)
	}
	if resp.OrderID != "REST1" {
		t.Fatalf("OrderID = %s, want REST1", resp.OrderID)
	}
}

func TestCancelPredictOrderNormalizesAcceptedEmptyResponse(t *testing.T) {
	svc := NewService(&stubAPIClient{}, &stubWSManager{
		cancelOrderResp: &ws.OrderResult{},
	}, false)

	resp, err := svc.CancelPredictOrder(context.Background(), "ORD1")
	if err != nil {
		t.Fatalf("CancelPredictOrder() error = %v", err)
	}
	if resp.OrderID != "ORD1" || resp.Status != "cancelled" {
		t.Fatalf("cancel response = orderID %q status %q, want ORD1/cancelled", resp.OrderID, resp.Status)
	}
}

func TestCancelSpotOrderPrefersWebSocket(t *testing.T) {
	svc := NewService(&stubAPIClient{
		cancelSpotResp: &api.SpotOrderResponse{OrderID: "REST1"},
	}, &stubWSManager{
		cancelOrderResp: &ws.OrderResult{
			OrderID:     "WS1",
			Symbol:      "btcusd",
			Side:        "buy",
			Type:        "LIMIT",
			Price:       "50000",
			OrigQty:     "0.1",
			ExecutedQty: "0",
			Status:      "CANCELED",
		},
	}, false)

	resp, err := svc.CancelSpotOrder(context.Background(), "WS1")
	if err != nil {
		t.Fatalf("CancelSpotOrder() error = %v", err)
	}
	if resp.OrderID != "WS1" {
		t.Fatalf("OrderID = %s, want WS1", resp.OrderID)
	}
	if !resp.IsCancelled {
		t.Fatal("IsCancelled = false, want true")
	}
}
