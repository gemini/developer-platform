package services_test

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"reflect"
	"testing"
	"time"

	"github.com/gemini/developer-platform/packages/sdk-go/generated/predictions"
	"github.com/gemini/developer-platform/packages/sdk-go/services"
	"github.com/gemini/developer-platform/packages/sdk-go/transport"
	"github.com/gemini/developer-platform/packages/sdk-go/types"
)

func TestPredictionsServicePriorityEndpoints(t *testing.T) {
	server := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		switch r.URL.Path {
		case "/v1/prediction-markets/order/batch":
			var body predictions.PlaceOrderBatchRequest
			if err := json.NewDecoder(r.Body).Decode(&body); err != nil || len(body.Orders) != 1 {
				t.Errorf("unexpected batch order body: err=%v body=%+v", err, body)
			}
			_, _ = w.Write([]byte(`{"results":[{"order":{"orderId":123,"status":"open","symbol":"GEMI-FEDJAN26-DN25","side":"buy","outcome":"yes","orderType":"limit","quantity":"1","filledQuantity":"0","remainingQuantity":"1","price":"0.50","timeInForce":"good-til-cancel","createdAt":"2026-08-20T00:00:00Z","updatedAt":"2026-08-20T00:00:00Z"}}]}`))
		case "/v1/prediction-markets/order/cancel":
			var body predictions.CancelOrderJSONBody
			if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.OrderId != 123 {
				t.Errorf("unexpected cancel body: err=%v body=%+v", err, body)
			}
			_, _ = w.Write([]byte(`{"result":"ok","message":"cancelled"}`))
		case "/v1/prediction-markets/order/batch/cancel":
			var body predictions.CancelOrderBatchRequest
			if err := json.NewDecoder(r.Body).Decode(&body); err != nil || len(body.OrderIds) != 1 {
				t.Errorf("unexpected batch cancel body: err=%v body=%+v", err, body)
			}
			_, _ = w.Write([]byte(`{"results":[{"orderId":123,"result":"ok"}]}`))
		case "/v1/prediction-markets/orders/active":
			if got := r.URL.Query().Get("unused"); got != "" {
				t.Errorf("unexpected active-order query: %q", got)
			}
			var body predictions.GetActiveOrdersJSONBody
			if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.Limit == nil || *body.Limit != 2 || body.Symbol == nil || *body.Symbol != "GEMI-FEDJAN26-DN25" {
				t.Errorf("unexpected active-order body: err=%v body=%+v", err, body)
			}
			_, _ = w.Write([]byte(`{"orders":[{"orderId":123,"status":"open","symbol":"GEMI-FEDJAN26-DN25","side":"buy","outcome":"yes","orderType":"limit","quantity":"1","filledQuantity":"0","remainingQuantity":"1","price":"0.50","timeInForce":"good-til-cancel","createdAt":"2026-08-20T00:00:00Z","updatedAt":"2026-08-20T00:00:00Z"}],"pagination":{"count":1,"limit":2,"offset":0}}`))
		case "/v1/prediction-markets/positions":
			if r.Method != http.MethodPost || r.URL.Query().Get("eventTicker") != "FEDJAN26" || r.URL.Query().Get("sort") != "-positionValue" {
				t.Errorf("unexpected positions request: %s %s", r.Method, r.URL.String())
			}
			_, _ = w.Write([]byte(`{"positions":[{"symbol":"GEMI-FEDJAN26-DN25","totalQuantity":"2"}],"total":1}`))
		case "/v1/prediction-markets/positions/settled":
			if r.URL.Query().Get("withCashOuts") != "true" || r.URL.Query().Get("category") != "Sports" {
				t.Errorf("unexpected settled-position query: %s", r.URL.RawQuery)
			}
			_, _ = w.Write([]byte(`{"positions":[{"instrumentSymbol":"GEMI-FEDJAN26-DN25","payout":"2"}],"total":1,"cashOuts":[]}`))
		case "/v1/prediction-markets/metrics/volume":
			_, _ = w.Write([]byte(`{"eventTicker":"FEDJAN26","contracts":[{"symbol":"GEMI-FEDJAN26-DN25","totalQty":"10"}]}`))
		case "/v1/prediction-markets/combos":
			if r.Method == http.MethodGet {
				if r.URL.Query().Get("status") != "Active" || r.URL.Query().Get("contractId") != "42" || r.URL.Query().Get("instrumentRegistered") != "true" {
					t.Errorf("unexpected combo query: %s", r.URL.RawQuery)
				}
				_, _ = w.Write([]byte(`{"combos":[{"contract":{"contractTicker":"GEMI-CMB-1"},"legs":[]}],"pagination":{"limit":1,"offset":0,"total":1}}`))
				return
			}
			var body predictions.CreateComboRequest
			if err := json.NewDecoder(r.Body).Decode(&body); err != nil || len(body.Legs) != 2 {
				t.Errorf("unexpected create combo body: err=%v body=%+v", err, body)
			}
			_, _ = w.Write([]byte(`{"alreadyExisted":false,"combo":{"id":42,"canonicalLegKey":"1:Yes|2:No","legCount":2,"legs":[]}}`))
		case "/v1/prediction-markets/combos/GEMI-CMB-1":
			_, _ = w.Write([]byte(`{"contract":{"contractTicker":"GEMI-CMB-1"},"legs":[]}`))
		case "/v1/prediction-markets/maker-rebate/rates":
			if r.URL.Query().Get("category") != "Sports" {
				t.Errorf("unexpected rebate rate query: %s", r.URL.RawQuery)
			}
			_, _ = w.Write([]byte(`{"rate_rules":[]}`))
		case "/v1/prediction-markets/maker-rebate/payouts":
			if r.URL.Query().Get("limit") != "10" || r.URL.Query().Get("offset") != "20" {
				t.Errorf("unexpected rebate payout query: %s", r.URL.RawQuery)
			}
			_, _ = w.Write([]byte(`{"payouts":[]}`))
		case "/v1/prediction-markets/maker-rebate/summary/total":
			if r.URL.Query().Get("dateFrom") != "2026-08-01" || r.URL.Query().Get("dateTo") != "2026-08-20" {
				t.Errorf("unexpected rebate summary query: %s", r.URL.RawQuery)
			}
			_, _ = w.Write([]byte(`{"total_earned_usd":"1.00","payout_count":1}`))
		case "/v1/prediction-markets/liquidity-rewards/config":
			_, _ = w.Write([]byte(`{"enabled":true,"max_spread_cents":10}`))
		case "/v1/prediction-markets/liquidity-rewards/events":
			if r.URL.Query().Get("sort") != "ends_soonest" {
				t.Errorf("unexpected liquidity event query: %s", r.URL.RawQuery)
			}
			_, _ = w.Write([]byte(`{"events":[],"pagination":{"limit":1,"offset":0,"total":0},"last_score_date":null}`))
		case "/v1/prediction-markets/liquidity-rewards/summary/daily":
			if r.URL.Query().Get("dateFrom") != "2026-08-01" || r.URL.Query().Get("dateTo") != "2026-08-20" {
				t.Errorf("unexpected daily reward query: %s", r.URL.RawQuery)
			}
			_, _ = w.Write([]byte(`{"daily_summaries":[]}`))
		case "/v1/prediction-markets/liquidity-rewards/summary/total":
			_, _ = w.Write([]byte(`{"total_earned_usd":"2.00","payout_count":2}`))
		default:
			http.NotFound(w, r)
		}
	}))
	defer server.Close()

	service := services.NewPredictionsService(transport.NewClient(transport.WithHTTPClient(server.Client())), server.URL)
	ctx := context.Background()

	batch := &predictions.PlaceOrderBatchJSONRequestBody{Orders: []predictions.OrderRequest{{Symbol: "GEMI-FEDJAN26-DN25", Side: predictions.OrderSideBuy, Outcome: predictions.Yes, OrderType: predictions.OrderTypeLimit, Quantity: "1", Price: "0.50"}}}
	batchRes, err := service.PlaceOrderBatch(ctx, batch)
	if err != nil || len(batchRes.Results) != 1 {
		t.Fatalf("PlaceOrderBatch failed: %v %+v", err, batchRes)
	}

	cancelRes, err := service.CancelOrder(ctx, &predictions.CancelOrderJSONRequestBody{OrderId: 123})
	if err != nil || cancelRes.Result != "ok" {
		t.Fatalf("CancelOrder failed: %v %+v", err, cancelRes)
	}
	var cancelID predictions.CancelOrderBatchRequest_OrderIds_Item
	if err := cancelID.FromCancelOrderBatchRequestOrderIds0(123); err != nil {
		t.Fatal(err)
	}
	if _, err := service.CancelOrderBatch(ctx, &predictions.CancelOrderBatchJSONRequestBody{OrderIds: []predictions.CancelOrderBatchRequest_OrderIds_Item{cancelID}}); err != nil {
		t.Fatalf("CancelOrderBatch failed: %v", err)
	}

	limit, offset := 2, 0
	active, err := service.GetActiveOrders(ctx, &predictions.GetActiveOrdersJSONRequestBody{Limit: &limit, Offset: &offset, Symbol: stringPointer("GEMI-FEDJAN26-DN25")})
	if err != nil || active.Orders == nil || len(*active.Orders) != 1 {
		t.Fatalf("GetActiveOrders failed: %v %+v", err, active)
	}

	eventTicker := "FEDJAN26"
	sort := predictions.GetPositionsParamsSort("-positionValue")
	positions, err := service.GetPositions(ctx, &predictions.GetPositionsParams{EventTicker: &eventTicker, Sort: &sort})
	if err != nil || positions.Positions == nil || len(*positions.Positions) != 1 {
		t.Fatalf("GetPositions failed: %v %+v", err, positions)
	}
	withCashOuts := true
	category := "Sports"
	settled, err := service.GetSettledPositions(ctx, &predictions.GetSettledPositionsParams{WithCashOuts: &withCashOuts, Category: &category})
	if err != nil || settled.Positions == nil || len(*settled.Positions) != 1 {
		t.Fatalf("GetSettledPositions failed: %v %+v", err, settled)
	}

	volume, err := service.GetVolumeMetrics(ctx, &predictions.GetVolumeMetricsJSONRequestBody{EventTicker: "FEDJAN26"})
	if err != nil || volume.EventTicker == nil || *volume.EventTicker != "FEDJAN26" {
		t.Fatalf("GetVolumeMetrics failed: %v %+v", err, volume)
	}
	contractID := int64(42)
	registered := true
	combos, err := service.ListCombos(ctx, &predictions.ListCombosParams{Status: stringPointer("Active"), ContractId: &contractID, InstrumentRegistered: &registered})
	if err != nil || len(combos.Combos) != 1 {
		t.Fatalf("ListCombos failed: %v %+v", err, combos)
	}
	created, err := service.CreateCombo(ctx, &predictions.CreateComboJSONRequestBody{Legs: []predictions.CreateComboLeg{{ContractId: "1", RequiredOutcome: predictions.CreateComboLegRequiredOutcomeYes}, {ContractId: "2", RequiredOutcome: predictions.CreateComboLegRequiredOutcomeNo}}})
	if err != nil || created.Combo.Id != 42 {
		t.Fatalf("CreateCombo failed: %v %+v", err, created)
	}
	combo, err := service.GetCombo(ctx, "GEMI-CMB-1")
	if err != nil || combo.Contract.ContractTicker == nil || *combo.Contract.ContractTicker != "GEMI-CMB-1" {
		t.Fatalf("GetCombo failed: %v %+v", err, combo)
	}

	rebateCategory := "Sports"
	if _, err := service.GetMakerRebateRates(ctx, &predictions.GetMakerRebateRatesParams{Category: &rebateCategory}); err != nil {
		t.Fatalf("GetMakerRebateRates failed: %v", err)
	}
	pageLimit, pageOffset := 10, 20
	if _, err := service.ListMakerRebatePayouts(ctx, &predictions.ListMakerRebatePayoutsParams{Limit: &pageLimit, Offset: &pageOffset}); err != nil {
		t.Fatalf("ListMakerRebatePayouts failed: %v", err)
	}
	from := mustDate("2026-08-01")
	to := mustDate("2026-08-20")
	if _, err := service.GetMakerRebateLifetimeSummary(ctx, &predictions.GetMakerRebateLifetimeSummaryParams{DateFrom: &from, DateTo: &to}); err != nil {
		t.Fatalf("GetMakerRebateLifetimeSummary failed: %v", err)
	}
	if config, err := service.GetLiquidityRewardsConfig(ctx); err != nil || !config.Enabled {
		t.Fatalf("GetLiquidityRewardsConfig failed: %v %+v", err, config)
	}
	sortOrder := predictions.ListLiquidityRewardsEventsParamsSort("ends_soonest")
	if _, err := service.ListLiquidityRewardsEvents(ctx, &predictions.ListLiquidityRewardsEventsParams{Sort: &sortOrder}); err != nil {
		t.Fatalf("ListLiquidityRewardsEvents failed: %v", err)
	}
	dailyFrom, dailyTo := mustDate("2026-08-01"), mustDate("2026-08-20")
	if _, err := service.GetLiquidityRewardsDailySummary(ctx, &predictions.GetLiquidityRewardsDailySummaryParams{DateFrom: dailyFrom, DateTo: dailyTo}); err != nil {
		t.Fatalf("GetLiquidityRewardsDailySummary failed: %v", err)
	}
	if _, err := service.GetLiquidityRewardsLifetimeSummary(ctx, nil); err != nil {
		t.Fatalf("GetLiquidityRewardsLifetimeSummary failed: %v", err)
	}
}

func TestPredictionsServiceIteratePositions(t *testing.T) {
	var offsets []string
	server := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		offsets = append(offsets, r.URL.Query().Get("offset"))
		w.Header().Set("Content-Type", "application/json")
		switch r.URL.Query().Get("offset") {
		case "0":
			_, _ = w.Write([]byte(`{"positions":[{"symbol":"A"},{"symbol":"B"}],"total":3}`))
		case "2":
			_, _ = w.Write([]byte(`{"positions":[{"symbol":"C"}],"total":3}`))
		default:
			t.Errorf("unexpected iterator offset: %s", r.URL.Query().Get("offset"))
		}
	}))
	defer server.Close()

	service := services.NewPredictionsService(transport.NewClient(transport.WithHTTPClient(server.Client())), server.URL)
	limit := 2
	var symbols []string
	for position, err := range service.IteratePositions(context.Background(), &predictions.GetPositionsParams{Limit: &limit}) {
		if err != nil {
			t.Fatalf("iterator failed: %v", err)
		}
		if position.Symbol != nil {
			symbols = append(symbols, *position.Symbol)
		}
	}
	if !reflect.DeepEqual(symbols, []string{"A", "B", "C"}) || !reflect.DeepEqual(offsets, []string{"0", "2"}) {
		t.Fatalf("unexpected iterator output symbols=%v offsets=%v", symbols, offsets)
	}
}

func stringPointer(value string) *string { return &value }

func mustDate(value string) types.Date {
	parsed, err := time.Parse("2006-01-02", value)
	if err != nil {
		panic(err)
	}
	return types.NewDate(parsed)
}
