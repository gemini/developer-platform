package cli

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"testing"

	"github.com/gemini/developer-platform/packages/sdk-go/generated/predictions"
	"github.com/gemini/developer-platform/packages/sdk-go/generated/trading"
	sdkservices "github.com/gemini/developer-platform/packages/sdk-go/services"
)

type privateSpotFake struct {
	newRequest    *trading.NewOrderRequest
	activeRequest *trading.ListActiveOrdersJSONBody
	statusRequest *trading.OrderStatusRequest
	cancelRequest *trading.CancelOrderRequest
}

func (f *privateSpotFake) NewOrder(_ context.Context, request *trading.NewOrderRequest) (*trading.LimitOrderResponse, error) {
	f.newRequest = request
	id := "123"
	return &trading.LimitOrderResponse{OrderId: &id}, nil
}

func (f *privateSpotFake) GetActiveOrders(_ context.Context, request *trading.ListActiveOrdersJSONBody) ([]trading.LimitOrderResponse, error) {
	f.activeRequest = request
	return nil, nil
}

func (f *privateSpotFake) GetOrderStatus(_ context.Context, request *trading.OrderStatusRequest) (*trading.LimitOrderResponse, error) {
	f.statusRequest = request
	return &trading.LimitOrderResponse{}, nil
}

func (f *privateSpotFake) CancelOrder(_ context.Context, request *trading.CancelOrderRequest) (*trading.CancelOrderResponse, error) {
	f.cancelRequest = request
	return &trading.CancelOrderResponse{}, nil
}

type privatePredictionFake struct {
	newRequest     *predictions.OrderRequest
	activeRequest  *predictions.GetActiveOrdersJSONRequestBody
	historyRequest *predictions.GetOrderHistoryJSONRequestBody
	statusID       int64
	cancelRequest  *predictions.CancelOrderJSONRequestBody
}

func (f *privatePredictionFake) NewOrder(_ context.Context, request *predictions.OrderRequest) (*predictions.OrderResponse, error) {
	f.newRequest = request
	return &predictions.OrderResponse{}, nil
}

func (f *privatePredictionFake) GetActiveOrders(_ context.Context, request *predictions.GetActiveOrdersJSONRequestBody) (*predictions.OrdersResponse, error) {
	f.activeRequest = request
	return &predictions.OrdersResponse{}, nil
}

func (f *privatePredictionFake) GetOrderHistory(_ context.Context, request *predictions.GetOrderHistoryJSONRequestBody) (*predictions.OrdersResponse, error) {
	f.historyRequest = request
	return &predictions.OrdersResponse{}, nil
}

func (f *privatePredictionFake) GetOrderStatus(_ context.Context, orderID int64) (*predictions.OrderResponse, error) {
	f.statusID = orderID
	return &predictions.OrderResponse{}, nil
}

func (f *privatePredictionFake) CancelOrder(_ context.Context, request *predictions.CancelOrderJSONRequestBody) (*sdkservices.PredictionOrderOperationResponse, error) {
	f.cancelRequest = request
	return &sdkservices.PredictionOrderOperationResponse{Result: "ok"}, nil
}

func spotFactory(fake *privateSpotFake) SpotOrdersFactory {
	return func(context.Context, GlobalOptions) (SpotOrdersClient, io.Closer, error) { return fake, nil, nil }
}

func predictionFactory(fake *privatePredictionFake) PredictionOrdersFactory {
	return func(context.Context, GlobalOptions) (PredictionOrdersClient, io.Closer, error) { return fake, nil, nil }
}

func TestSpotPlaceDryRunDoesNotCreateClient(t *testing.T) {
	var out bytes.Buffer
	called := false
	root := NewRootCommand(&out, &out)
	root.AddCommand(NewOrdersCommandWithFactories(func(context.Context, GlobalOptions) (SpotOrdersClient, io.Closer, error) {
		called = true
		return nil, nil, errors.New("must not be called")
	}, nil))
	root.SetArgs([]string{"--output", "json", "orders", "spot", "place", "--symbol", "BTCUSD", "--side", "buy", "--amount", "0.1", "--price", "65000", "--client-order-id", "cli-1", "--dry-run"})
	if err := root.Execute(); err != nil {
		t.Fatalf("Execute() error = %v", err)
	}
	if called {
		t.Fatal("spot factory called during dry run")
	}
	var request trading.NewOrderRequest
	if err := json.Unmarshal(out.Bytes(), &request); err != nil {
		t.Fatalf("output JSON = %q: %v", out.String(), err)
	}
	if request.Symbol != "BTCUSD" || request.Side != trading.NewOrderRequestSideBuy || request.Amount != "0.1" || request.ClientOrderId == nil || *request.ClientOrderId != "cli-1" {
		t.Fatalf("request = %#v", request)
	}
}

func TestSpotOrderCommandsMapSDKRequests(t *testing.T) {
	tests := []struct {
		name  string
		args  []string
		check func(*testing.T, *privateSpotFake)
	}{
		{name: "list", args: []string{"orders", "spot", "list", "--account", "desk"}, check: func(t *testing.T, fake *privateSpotFake) {
			if fake.activeRequest == nil || fake.activeRequest.Account == nil || *fake.activeRequest.Account != "desk" {
				t.Fatalf("active request = %#v", fake.activeRequest)
			}
		}},
		{name: "get", args: []string{"orders", "spot", "get", "--client-order-id", "cli-2", "--include-trades"}, check: func(t *testing.T, fake *privateSpotFake) {
			if fake.statusRequest == nil || fake.statusRequest.ClientOrderId == nil || *fake.statusRequest.ClientOrderId != "cli-2" || fake.statusRequest.IncludeTrades == nil || !*fake.statusRequest.IncludeTrades {
				t.Fatalf("status request = %#v", fake.statusRequest)
			}
		}},
		{name: "cancel", args: []string{"orders", "spot", "cancel", "--order-id", "42"}, check: func(t *testing.T, fake *privateSpotFake) {
			if fake.cancelRequest == nil || fake.cancelRequest.OrderId != 42 {
				t.Fatalf("cancel request = %#v", fake.cancelRequest)
			}
		}},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			var out bytes.Buffer
			fake := &privateSpotFake{}
			root := NewRootCommand(&out, &out)
			root.AddCommand(NewOrdersCommandWithFactories(spotFactory(fake), nil))
			root.SetArgs(append([]string{"--output", "json"}, test.args...))
			if err := root.Execute(); err != nil {
				t.Fatalf("Execute() error = %v", err)
			}
			test.check(t, fake)
		})
	}
}

func TestPredictionPlaceDryRunMapsGeneratedRequest(t *testing.T) {
	var out bytes.Buffer
	root := NewRootCommand(&out, &out)
	root.AddCommand(NewOrdersCommandWithFactories(nil, func(context.Context, GlobalOptions) (PredictionOrdersClient, io.Closer, error) {
		return nil, nil, errors.New("must not be called")
	}))
	root.SetArgs([]string{"--output", "json", "orders", "prediction", "place", "--symbol", "GEMI-FEDJAN26-UP", "--side", "sell", "--outcome", "no", "--quantity", "10", "--price", "0.40", "--time-in-force", "fill-or-kill", "--maker-or-cancel", "--dry-run"})
	if err := root.Execute(); err != nil {
		t.Fatalf("Execute() error = %v", err)
	}
	var request predictions.OrderRequest
	if err := json.Unmarshal(out.Bytes(), &request); err != nil {
		t.Fatalf("output JSON = %q: %v", out.String(), err)
	}
	if request.Symbol == "" || request.Side != predictions.OrderSideSell || request.Outcome != predictions.No || request.Quantity != "10" || request.MakerOrCancel == nil || !*request.MakerOrCancel || request.TimeInForce == nil || *request.TimeInForce != predictions.TimeInForceFillOrKill {
		t.Fatalf("request = %#v", request)
	}
}

func TestPredictionOrderCommandsMapListGetCancel(t *testing.T) {
	fake := &privatePredictionFake{}
	commands := [][]string{
		{"orders", "prediction", "list", "--history", "--symbol", "GEMI", "--status", "filled", "--limit", "5", "--offset", "2"},
		{"orders", "prediction", "get", "--order-id", "77"},
		{"orders", "prediction", "cancel", "--order-id", "88"},
	}
	for _, args := range commands {
		var out bytes.Buffer
		root := NewRootCommand(&out, &out)
		root.AddCommand(NewOrdersCommandWithFactories(nil, predictionFactory(fake)))
		root.SetArgs(append([]string{"--output", "json"}, args...))
		if err := root.Execute(); err != nil {
			t.Fatalf("Execute(%v) error = %v", args, err)
		}
	}
	if fake.historyRequest == nil || fake.historyRequest.Symbol == nil || *fake.historyRequest.Symbol != "GEMI" || fake.historyRequest.Status == nil || *fake.historyRequest.Status != predictions.GetOrderHistoryJSONBodyStatusFilled || fake.historyRequest.Limit == nil || *fake.historyRequest.Limit != 5 || fake.historyRequest.Offset == nil || *fake.historyRequest.Offset != 2 {
		t.Fatalf("history request = %#v", fake.historyRequest)
	}
	if fake.statusID != 77 || fake.cancelRequest == nil || fake.cancelRequest.OrderId != 88 {
		t.Fatalf("status/cancel = %d, %#v", fake.statusID, fake.cancelRequest)
	}
}

func TestPrivateRequestValidation(t *testing.T) {
	if _, err := buildSpotOrderRequest("BTCUSD", "buy", "1", "100", "exchange limit", "", "99", "", "primary"); err == nil {
		t.Fatal("expected stop-price validation error")
	}
	if _, err := buildPredictionOrderRequest("GEMI", "buy", "yes", "1", "0.5", "limit", "0.4", "", false); err == nil {
		t.Fatal("expected prediction stop-price validation error")
	}
	if _, err := requiredInt64("-1", "order-id"); err == nil {
		t.Fatal("expected positive order ID validation error")
	}
}
