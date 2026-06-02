package api

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestPlacePredictOrder(t *testing.T) {
	tests := []struct {
		name    string
		request PredictOrderRequest
		want    *PredictOrderResponse
	}{
		{
			name: "limit order with all fields",
			request: PredictOrderRequest{
				Symbol:        "GEMI-TEST-SYMBOL",
				Side:          "buy",
				Outcome:       "yes",
				OrderType:     "limit",
				Quantity:      "100",
				Price:         "0.75",
				TimeInForce:   "post-only",
				ClientOrderID: "test-order-123",
				MakerOrCancel: true,
			},
			want: &PredictOrderResponse{
				OrderID:        "12345",
				ClientOrderID:  "test-order-123",
				Symbol:         "GEMI-TEST-SYMBOL",
				Side:           "buy",
				Outcome:        "yes",
				Status:         "open",
				Price:          "0.75",
				Quantity:       "100",
				FilledQuantity: "0",
			},
		},
		{
			name: "market order minimal fields",
			request: PredictOrderRequest{
				Symbol:    "GEMI-TEST-SYMBOL2",
				Side:      "sell",
				Outcome:   "no",
				OrderType: "market",
				Quantity:  "50",
			},
			want: &PredictOrderResponse{
				OrderID:        "67890",
				Symbol:         "GEMI-TEST-SYMBOL2",
				Side:           "sell",
				Outcome:        "no",
				Status:         "filled",
				Quantity:       "50",
				FilledQuantity: "50",
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				if r.URL.Path != "/v1/prediction-markets/order" {
					t.Errorf("unexpected path: %s", r.URL.Path)
				}
				if r.Method != http.MethodPost {
					t.Errorf("unexpected method: %s", r.Method)
				}

				var body map[string]any
				if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
					t.Fatalf("decode request body: %v", err)
				}
				if got := body["orderType"]; got != tt.request.OrderType {
					t.Errorf("orderType = %v, want %s", got, tt.request.OrderType)
				}
				if _, ok := body["type"]; ok {
					t.Error("request body included legacy type field, want orderType only")
				}

				w.Header().Set("Content-Type", "application/json")
				json.NewEncoder(w).Encode(tt.want)
			}))
			defer server.Close()

			client := &Client{
				baseURL:        server.URL,
				httpClient:     server.Client(),
				auth:           NewHMACAuthenticator("test-key", "test-secret"),
				circuitBreaker: newCircuitBreaker(),
			}

			got, err := client.PlacePredictOrder(context.Background(), &tt.request)
			if err != nil {
				t.Fatalf("PlacePredictOrder() error = %v", err)
			}

			if got.OrderID != tt.want.OrderID {
				t.Errorf("OrderID = %s, want %s", got.OrderID, tt.want.OrderID)
			}
			if got.Symbol != tt.want.Symbol {
				t.Errorf("Symbol = %s, want %s", got.Symbol, tt.want.Symbol)
			}
			if got.Status != tt.want.Status {
				t.Errorf("Status = %s, want %s", got.Status, tt.want.Status)
			}
		})
	}
}

func TestPredictOrderResponseUnmarshalNumbers(t *testing.T) {
	data := []byte(`{
		"orderId": 12345,
		"clientOrderId": "client-123",
		"symbol": "GEMI-TEST",
		"side": "buy",
		"outcome": "yes",
		"orderType": "limit",
		"status": "open",
		"price": 0.16,
		"quantity": 6,
		"filledQuantity": 0
	}`)

	var got PredictOrderResponse
	if err := json.Unmarshal(data, &got); err != nil {
		t.Fatalf("Unmarshal() error = %v", err)
	}
	if got.OrderID != "12345" {
		t.Fatalf("OrderID = %s, want 12345", got.OrderID)
	}
	if got.Price != "0.16" || got.Quantity != "6" || got.FilledQuantity != "0" {
		t.Fatalf("price/quantity/filled = %s/%s/%s, want 0.16/6/0", got.Price, got.Quantity, got.FilledQuantity)
	}
}

func TestListOpenPredictOrders(t *testing.T) {
	expectedResp := &PredictOrdersResponse{
		Data: []PredictOrderResponse{
			{
				OrderID: "123",
				Symbol:  "GEMI-TEST",
				Status:  "open",
			},
			{
				OrderID: "456",
				Symbol:  "GEMI-TEST2",
				Status:  "open",
			},
		},
		Pagination: Pagination{
			Limit:  10,
			Offset: 0,
		},
	}

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v1/prediction-markets/orders/active" {
			t.Errorf("unexpected path: %s", r.URL.Path)
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(expectedResp)
	}))
	defer server.Close()

	client := &Client{
		baseURL:        server.URL,
		httpClient:     server.Client(),
		auth:           NewHMACAuthenticator("test-key", "test-secret"),
		circuitBreaker: newCircuitBreaker(),
	}

	got, err := client.ListOpenPredictOrders(context.Background(), ListPredictOrdersParams{
		Limit:  10,
		Offset: 0,
	})
	if err != nil {
		t.Fatalf("ListOpenPredictOrders() error = %v", err)
	}

	if len(got.Data) != len(expectedResp.Data) {
		t.Errorf("len(Data) = %d, want %d", len(got.Data), len(expectedResp.Data))
	}
}

func TestCancelPredictOrder(t *testing.T) {
	orderID := "12345"
	expectedResp := &PredictOrderResponse{
		OrderID: orderID,
		Status:  "cancelled", //nolint:misspell // API response value
	}

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v1/prediction-markets/order/cancel" {
			t.Errorf("unexpected path: %s", r.URL.Path)
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(expectedResp)
	}))
	defer server.Close()

	client := &Client{
		baseURL:        server.URL,
		httpClient:     server.Client(),
		auth:           NewHMACAuthenticator("test-key", "test-secret"),
		circuitBreaker: newCircuitBreaker(),
	}

	got, err := client.CancelPredictOrder(context.Background(), orderID)
	if err != nil {
		t.Fatalf("CancelPredictOrder() error = %v", err)
	}

	if got.OrderID != orderID {
		t.Errorf("OrderID = %s, want %s", got.OrderID, orderID)
	}
	if got.Status != "cancelled" { //nolint:misspell // API response value
		t.Errorf("Status = %s, want cancelled", got.Status) //nolint:misspell // API response value
	}
}

func TestGetPredictOrder(t *testing.T) {
	orderID := "12345"
	expectedResp := &PredictOrderResponse{
		OrderID:        orderID,
		Symbol:         "GEMI-TEST",
		Status:         "filled",
		FilledQuantity: "100",
	}

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v1/prediction-markets/order/status" {
			t.Errorf("unexpected path: %s", r.URL.Path)
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(expectedResp)
	}))
	defer server.Close()

	client := &Client{
		baseURL:        server.URL,
		httpClient:     server.Client(),
		auth:           NewHMACAuthenticator("test-key", "test-secret"),
		circuitBreaker: newCircuitBreaker(),
	}

	got, err := client.GetPredictOrder(context.Background(), orderID)
	if err != nil {
		t.Fatalf("GetPredictOrder() error = %v", err)
	}

	if got.OrderID != orderID {
		t.Errorf("OrderID = %s, want %s", got.OrderID, orderID)
	}
	if got.Status != "filled" {
		t.Errorf("Status = %s, want filled", got.Status)
	}
}

func TestCancelAllOrders(t *testing.T) {
	expectedResp := &CancelAllResult{
		Result: "ok",
		Details: CancelAllDetails{
			CancelledOrders: []CancelledOrderDetail{
				{OrderID: "123"},
				{OrderID: "456"},
			},
		},
	}

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v1/order/cancel/all" {
			t.Errorf("unexpected path: %s", r.URL.Path)
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(expectedResp)
	}))
	defer server.Close()

	client := &Client{
		baseURL:        server.URL,
		httpClient:     server.Client(),
		auth:           NewHMACAuthenticator("test-key", "test-secret"),
		circuitBreaker: newCircuitBreaker(),
	}

	got, err := client.CancelAllOrders(context.Background())
	if err != nil {
		t.Fatalf("CancelAllOrders() error = %v", err)
	}

	if got.Result != "ok" {
		t.Errorf("Result = %s, want ok", got.Result)
	}
	if len(got.Details.CancelledOrders) != 2 {
		t.Errorf("len(CancelledOrders) = %d, want 2", len(got.Details.CancelledOrders))
	}
}

func TestCancelAllOrdersUnmarshalNumericIDs(t *testing.T) {
	data := []byte(`{
		"result": "ok",
		"details": {
			"cancelledOrders": [123, "456", {"orderId": 789}, {"order_id": "101"}]
		}
	}`)

	var got CancelAllResult
	if err := json.Unmarshal(data, &got); err != nil {
		t.Fatalf("Unmarshal() error = %v", err)
	}

	want := []string{"123", "456", "789", "101"}
	if len(got.Details.CancelledOrders) != len(want) {
		t.Fatalf("len(CancelledOrders) = %d, want %d", len(got.Details.CancelledOrders), len(want))
	}
	for i, order := range got.Details.CancelledOrders {
		if order.OrderID != want[i] {
			t.Fatalf("CancelledOrders[%d].OrderID = %s, want %s", i, order.OrderID, want[i])
		}
	}
}
