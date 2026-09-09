package services_test

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"reflect"
	"testing"

	"github.com/gemini/developer-platform/packages/sdk-go/auth"
	"github.com/gemini/developer-platform/packages/sdk-go/generated/predictions"
	"github.com/gemini/developer-platform/packages/sdk-go/services"
	"github.com/gemini/developer-platform/packages/sdk-go/transport"
)

func TestPredictionsService_TermsGating(t *testing.T) {
	termsAccepted := false
	server := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		switch r.URL.Path {
		case "/v1/prediction-markets/terms/accept":
			if r.ContentLength != 0 {
				t.Errorf("expected bodyless terms acceptance request, got content length %d", r.ContentLength)
			}
			w.WriteHeader(http.StatusOK)
			termsAccepted = true
			_, _ = w.Write([]byte(`{"success":true}`))
		case "/v1/prediction-markets/order", "/v1/prediction-markets/order/new":
			if !termsAccepted {
				w.WriteHeader(http.StatusBadRequest)
				_, _ = w.Write([]byte(`{"result":"error","reason":"MustAcceptTerms","message":"terms must be accepted"}`))
				return
			}
			w.WriteHeader(http.StatusOK)
			var orderID int64 = 123456789
			_ = json.NewEncoder(w).Encode(predictions.OrderResponse{OrderId: &orderID})
		default:
			http.NotFound(w, r)
		}
	}))
	defer server.Close()

	transportClient := transport.NewClient(
		transport.WithHTTPClient(server.Client()),
		transport.WithAuth(auth.NewBearer("test-token")),
	)

	service := services.NewPredictionsService(transportClient, server.URL)
	ctx := context.Background()

	req := &predictions.OrderRequest{
		Symbol:    "GEMI-FEDJAN26-DN25",
		Side:      predictions.OrderSideBuy,
		Outcome:   predictions.Yes,
		OrderType: predictions.OrderTypeLimit,
		Quantity:  "100",
		Price:     "0.65",
	}

	// 1. The first order reaches the backend and is rejected there.
	_, err := service.NewOrder(ctx, req)
	if err == nil {
		t.Fatal("expected error before terms accepted, got nil")
	}
	if !errors.Is(err, transport.ErrAcceptTermsRequired) {
		t.Fatalf("expected ErrAcceptTermsRequired, got %v", err)
	}

	// 2. Accept terms
	if _, err := service.AcceptPredictionMarketsTerms(ctx); err != nil {
		t.Fatalf("failed accepting terms: %v", err)
	}

	// 3. Place order again -> MUST SUCCEED
	res, err := service.NewOrder(ctx, req)
	if err != nil {
		t.Fatalf("expected order success after terms accepted, got %v", err)
	}

	if res.OrderId == nil || *res.OrderId != 123456789 {
		t.Fatalf("unexpected order result: %v", res)
	}
}

func TestPredictionsService_TermsGatingDoesNotAcceptFailedResponse(t *testing.T) {
	server := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		switch r.URL.Path {
		case "/v1/prediction-markets/terms/accept":
			_, _ = w.Write([]byte(`{"success":false}`))
		case "/v1/prediction-markets/order":
			w.WriteHeader(http.StatusBadRequest)
			_, _ = w.Write([]byte(`{"result":"error","reason":"MustAcceptTerms"}`))
		default:
			http.NotFound(w, r)
		}
	}))
	defer server.Close()

	service := services.NewPredictionsService(
		transport.NewClient(transport.WithHTTPClient(server.Client())),
		server.URL,
	)

	if _, err := service.AcceptTerms(context.Background()); !errors.Is(err, transport.ErrAcceptTermsRequired) {
		t.Fatalf("expected failed terms response to return ErrAcceptTermsRequired, got %v", err)
	}
	if _, err := service.NewOrder(context.Background(), &predictions.OrderRequest{}); !errors.Is(err, transport.ErrAcceptTermsRequired) {
		t.Fatalf("expected backend terms error to be returned after failed acceptance, got %v", err)
	}
}

func TestPredictionsService_ReadEndpoints(t *testing.T) {
	var categoryStatus []string
	server := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		switch r.URL.Path {
		case "/v1/prediction-markets/terms":
			_, _ = w.Write([]byte(`{"content":"terms","termsType":"prediction","version":3,"updatedAt":"2026-08-20T00:00:00Z"}`))
		case "/v1/prediction-markets/terms/status":
			_, _ = w.Write([]byte(`{"acceptedVersion":2,"hasAcceptedLatest":false,"latestVersion":3}`))
		case "/v1/prediction-markets/categories":
			categoryStatus = append([]string(nil), r.URL.Query()["status"]...)
			_, _ = w.Write([]byte(`{"categories":["crypto","sports"]}`))
		case "/v1/prediction-markets/events":
			query := r.URL.Query()
			want := map[string][]string{
				"status":                {"active"},
				"category":              {"crypto", "sports"},
				"sport":                 {"soccer", "basketball"},
				"sports_market_type":    {"moneyline", "spread"},
				"sports_market_subject": {"player"},
				"sports_market_scope":   {"game"},
				"sports_market_metric":  {"goals"},
				"search":                {"bitcoin"},
				"limit":                 {"2"},
				"offset":                {"10"},
			}
			for key, expected := range want {
				if got := query[key]; !reflect.DeepEqual(got, expected) {
					t.Errorf("expected %s query to be %v, got %v", key, expected, got)
				}
			}
			_, _ = w.Write([]byte(`{"data":[{"ticker":"SOCCERPLAYERGOAL","title":"Player goals","sportsMarket":{"sport":"soccer","type":"moneyline","subject":"player","scope":{"type":"game","ordinal":1},"metric":"goals"}}]}`))
		case "/v1/prediction-markets/events/BTCUSD":
			_, _ = w.Write([]byte(`{"ticker":"BTCUSD","title":"Bitcoin"}`))
		default:
			http.NotFound(w, r)
		}
	}))
	t.Cleanup(server.Close)

	service := services.NewPredictionsService(
		transport.NewClient(transport.WithHTTPClient(server.Client())),
		server.URL,
	)

	terms, err := service.GetTerms(context.Background())
	if err != nil {
		t.Fatalf("GetTerms failed: %v", err)
	}
	if terms.Content != "terms" || terms.Version != 3 {
		t.Fatalf("unexpected terms response: %+v", terms)
	}

	status, err := service.GetTermsStatus(context.Background())
	if err != nil {
		t.Fatalf("GetTermsStatus failed: %v", err)
	}
	if status.HasAcceptedLatest || status.AcceptedVersion == nil || *status.AcceptedVersion != 2 {
		t.Fatalf("unexpected terms status: %+v", status)
	}

	categories, err := service.GetCategories(context.Background())
	if err != nil {
		t.Fatalf("GetCategories failed: %v", err)
	}
	if len(categories) != 2 || categories[0] != "crypto" || categories[1] != "sports" {
		t.Fatalf("unexpected categories: %v", categories)
	}

	statusFilter := predictions.MarketStatusActive
	if _, err := service.GetCategoriesWithParams(context.Background(), &predictions.GetCategoriesParams{
		Status: &[]predictions.MarketStatus{statusFilter},
	}); err != nil {
		t.Fatalf("GetCategoriesWithParams failed: %v", err)
	}
	if !reflect.DeepEqual(categoryStatus, []string{"active"}) {
		t.Fatalf("expected category status filter to be forwarded, got %v", categoryStatus)
	}

	eventStatus := predictions.MarketStatusActive
	queryCategories := []string{"crypto", "sports"}
	sports := predictions.SportFilter{predictions.Soccer, predictions.Basketball}
	marketTypes := predictions.SportsMarketTypeFilter{predictions.SportsMarketTypeMoneyline, predictions.SportsMarketTypeSpread}
	subjects := predictions.SportsMarketSubjectFilter{predictions.SportsMarketSubjectPlayer}
	scopes := predictions.SportsMarketScopeFilter{predictions.SportsMarketScopeTypeGame}
	metrics := predictions.SportsMarketMetricFilter{predictions.SportsMarketMetricGoals}
	search := "bitcoin"
	limit := predictions.Limit(2)
	offset := predictions.Offset(10)
	events, err := service.GetEvents(context.Background(), &predictions.ListEventsParams{
		Status:              &[]predictions.MarketStatus{eventStatus},
		Category:            &queryCategories,
		Sport:               &sports,
		SportsMarketType:    &marketTypes,
		SportsMarketSubject: &subjects,
		SportsMarketScope:   &scopes,
		SportsMarketMetric:  &metrics,
		Search:              &search,
		Limit:               &limit,
		Offset:              &offset,
	})
	if err != nil {
		t.Fatalf("GetEvents failed: %v", err)
	}
	if events.Data == nil || len(*events.Data) != 1 || (*events.Data)[0].Ticker == nil || *(*events.Data)[0].Ticker != "SOCCERPLAYERGOAL" {
		t.Fatalf("unexpected events response: %+v", events)
	}
	sportsMarket := (*events.Data)[0].SportsMarket
	if sportsMarket == nil || sportsMarket.Sport != predictions.Soccer ||
		sportsMarket.Type != predictions.SportsMarketTypeMoneyline ||
		sportsMarket.Subject != predictions.SportsMarketSubjectPlayer ||
		sportsMarket.Scope.Type != predictions.SportsMarketScopeTypeGame ||
		sportsMarket.Scope.Ordinal == nil || *sportsMarket.Scope.Ordinal != 1 ||
		sportsMarket.Metric == nil || *sportsMarket.Metric != predictions.SportsMarketMetricGoals {
		t.Fatalf("sports metadata was not preserved: %+v", sportsMarket)
	}

	event, err := service.GetEvent(context.Background(), "BTCUSD")
	if err != nil {
		t.Fatalf("GetEvent failed: %v", err)
	}
	if event.Ticker == nil || *event.Ticker != "BTCUSD" || event.Title == nil || *event.Title != "Bitcoin" {
		t.Fatalf("unexpected event response: %+v", event)
	}
}
