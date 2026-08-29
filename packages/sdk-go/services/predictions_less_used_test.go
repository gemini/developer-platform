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
)

func TestPredictionsServiceLessUsedMethods(t *testing.T) {
	server := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		switch r.URL.Path {
		case "/v1/prediction-markets/events/EVENT-1/strike":
			_, _ = w.Write([]byte(`{"value":"0.55","type":"above"}`))
		case "/v1/prediction-markets/events/newly-listed", "/v1/prediction-markets/events/recently-settled", "/v1/prediction-markets/events/upcoming":
			query := r.URL.Query()
			if !reflect.DeepEqual(query["category"], []string{"sports", "crypto"}) || query.Get("limit") != "2" || query.Get("offset") != "1" {
				t.Errorf("unexpected event-list query for %s: %s", r.URL.Path, r.URL.RawQuery)
			}
			_, _ = w.Write([]byte(`{"data":[],"pagination":{"limit":2,"offset":1,"total":0}}`))
		case "/v1/prediction-markets/volume/2026-08-20":
			_, _ = w.Write([]byte(`[{"categoryPath":["Sports","Soccer"],"volume":"12.345"}]`))
		case "/v1/prediction-markets/volume/2026-08-20/hourly":
			_, _ = w.Write([]byte(`[{"categoryPath":["Sports"],"periodStart":"2026-08-20T14:00:00Z","volume":"1.25"}]`))
		case "/v1/prediction-markets/orders/history":
			if r.Method != http.MethodPost {
				t.Errorf("order history method = %s, want POST", r.Method)
			}
			var body predictions.GetOrderHistoryJSONBody
			if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
				t.Errorf("decode order history body: %v", err)
			} else if body.Limit == nil || *body.Limit != 2 || body.Offset == nil || *body.Offset != 1 || body.Symbol == nil || *body.Symbol != "EVENT-1" || body.Status == nil || *body.Status != predictions.GetOrderHistoryJSONBodyStatusFilled {
				t.Errorf("unexpected order history body: %+v", body)
			}
			_, _ = w.Write([]byte(`{"orders":[{"orderId":7,"symbol":"EVENT-1","status":"filled"}],"pagination":{"count":1,"limit":2,"offset":1}}`))
		default:
			http.NotFound(w, r)
		}
	}))
	defer server.Close()

	service := services.NewPredictionsService(
		transport.NewClient(transport.WithHTTPClient(server.Client())),
		server.URL,
	)
	ctx := context.Background()

	strike, err := service.GetEventStrike(ctx, "EVENT-1")
	if err != nil || strike.Value == nil || *strike.Value != "0.55" || strike.Type == nil || *strike.Type != predictions.Above {
		t.Fatalf("GetEventStrike = %+v, %v", strike, err)
	}

	categories := []string{"sports", "crypto"}
	limit, offset := 2, 1
	params := func() (*predictions.ListNewlyListedEventsParams, *predictions.ListRecentlySettledEventsParams, *predictions.ListUpcomingEventsParams) {
		return &predictions.ListNewlyListedEventsParams{Category: &categories, Limit: &limit, Offset: &offset},
			&predictions.ListRecentlySettledEventsParams{Category: &categories, Limit: &limit, Offset: &offset},
			&predictions.ListUpcomingEventsParams{Category: &categories, Limit: &limit, Offset: &offset}
	}
	newly, recently, upcoming := params()
	if _, err := service.ListNewlyListedEvents(ctx, newly); err != nil {
		t.Fatalf("ListNewlyListedEvents failed: %v", err)
	}
	if _, err := service.ListRecentlySettledEvents(ctx, recently); err != nil {
		t.Fatalf("ListRecentlySettledEvents failed: %v", err)
	}
	if _, err := service.ListUpcomingEvents(ctx, upcoming); err != nil {
		t.Fatalf("ListUpcomingEvents failed: %v", err)
	}

	daily, err := service.GetDailyVolume(ctx, "2026-08-20")
	if err != nil || len(daily) != 1 || !reflect.DeepEqual(daily[0].CategoryPath, []string{"Sports", "Soccer"}) || daily[0].Volume != "12.345" {
		t.Fatalf("GetDailyVolume = %+v, %v", daily, err)
	}
	hourly, err := service.GetHourlyVolume(ctx, "2026-08-20")
	if err != nil || len(hourly) != 1 || hourly[0].Volume != "1.25" || !hourly[0].PeriodStart.Equal(time.Date(2026, 8, 20, 14, 0, 0, 0, time.UTC)) {
		t.Fatalf("GetHourlyVolume = %+v, %v", hourly, err)
	}

	symbol := "EVENT-1"
	status := predictions.GetOrderHistoryJSONBodyStatusFilled
	history, err := service.GetOrderHistory(ctx, &predictions.GetOrderHistoryJSONRequestBody{Limit: &limit, Offset: &offset, Symbol: &symbol, Status: &status})
	if err != nil || history.Orders == nil || len(*history.Orders) != 1 || (*history.Orders)[0].OrderId == nil || *(*history.Orders)[0].OrderId != 7 {
		t.Fatalf("GetOrderHistory = %+v, %v", history, err)
	}
}

func TestPredictionsServiceOrderHistoryIterator(t *testing.T) {
	var offsets []int
	server := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var body predictions.GetOrderHistoryJSONBody
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			t.Errorf("decode order history body: %v", err)
			return
		}
		if body.Offset == nil || body.Limit == nil {
			t.Errorf("iterator omitted pagination fields: %+v", body)
			return
		}
		offsets = append(offsets, *body.Offset)
		if *body.Offset == 0 {
			_, _ = w.Write([]byte(`{"orders":[{"orderId":1,"symbol":"EVENT-1"},{"orderId":2,"symbol":"EVENT-2"}]}`))
			return
		}
		if *body.Offset == 2 {
			_, _ = w.Write([]byte(`{"orders":[{"orderId":3,"symbol":"EVENT-3"}]}`))
			return
		}
		t.Errorf("unexpected iterator offset %d", *body.Offset)
		_, _ = w.Write([]byte(`{"orders":[]}`))
	}))
	defer server.Close()

	service := services.NewPredictionsService(transport.NewClient(transport.WithHTTPClient(server.Client())), server.URL)
	limit := 2
	var orderIDs []int64
	for order, err := range service.IterateOrderHistory(context.Background(), &predictions.GetOrderHistoryJSONRequestBody{Limit: &limit}) {
		if err != nil {
			t.Fatalf("IterateOrderHistory failed: %v", err)
		}
		if order.OrderId != nil {
			orderIDs = append(orderIDs, *order.OrderId)
		}
	}
	if !reflect.DeepEqual(offsets, []int{0, 2}) || !reflect.DeepEqual(orderIDs, []int64{1, 2, 3}) {
		t.Fatalf("unexpected order-history iteration offsets=%v orderIDs=%v", offsets, orderIDs)
	}
}
