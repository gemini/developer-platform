package cli

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"strings"
	"testing"

	"github.com/gemini/developer-platform/packages/sdk-go/generated/predictions"
	"github.com/gemini/developer-platform/packages/sdk-go/generated/trading"
	sdkservices "github.com/gemini/developer-platform/packages/sdk-go/services"
	"github.com/spf13/cobra"
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

type privateOrderCloser struct{ closed bool }

func (c *privateOrderCloser) Close() error {
	c.closed = true
	return nil
}

func TestCancelCommandsHandleNilClient(t *testing.T) {
	tests := []struct {
		name string
		args []string
		add  func(*cobra.Command, *privateOrderCloser)
	}{
		{
			name: "spot",
			args: []string{"orders", "spot", "cancel", "--order-id", "42"},
			add: func(root *cobra.Command, closer *privateOrderCloser) {
				root.AddCommand(NewOrdersCommandWithFactories(func(context.Context, GlobalOptions) (SpotOrdersClient, io.Closer, error) {
					return nil, closer, nil
				}, nil))
			},
		},
		{
			name: "prediction",
			args: []string{"orders", "prediction", "cancel", "--order-id", "88"},
			add: func(root *cobra.Command, closer *privateOrderCloser) {
				root.AddCommand(NewOrdersCommandWithFactories(nil, func(context.Context, GlobalOptions) (PredictionOrdersClient, io.Closer, error) {
					return nil, closer, nil
				}))
			},
		},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			var out bytes.Buffer
			closer := &privateOrderCloser{}
			root := newTestRootCommand(&out, &out)
			test.add(root, closer)
			root.SetArgs(test.args)
			err := root.Execute()
			if err == nil || !strings.Contains(err.Error(), "service is unavailable") {
				t.Fatalf("Execute() error = %v, want unavailable service error", err)
			}
			if !closer.closed {
				t.Fatal("order factory closer was not closed")
			}
		})
	}
}

func TestSpotPlaceDryRunDoesNotCreateClient(t *testing.T) {
	var out bytes.Buffer
	called := false
	root := newTestRootCommand(&out, &out)
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

func TestOrderDryRunTablesShowExecutionOptions(t *testing.T) {
	tests := []struct {
		name string
		args []string
		want []string
	}{
		{
			name: "spot execution option",
			args: []string{"orders", "spot", "place", "--symbol", "BTCUSD", "--side", "buy", "--amount", "0.1", "--price", "65000", "--option", "immediate-or-cancel", "--dry-run"},
			want: []string{"option", "immediate-or-cancel"},
		},
		{
			name: "prediction maker-only",
			args: []string{"orders", "prediction", "place", "--symbol", "GEMI", "--side", "buy", "--outcome", "yes", "--quantity", "10", "--price", "0.40", "--maker-or-cancel", "--dry-run"},
			want: []string{"maker-or-cancel", "true"},
		},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			var out bytes.Buffer
			root := newTestRootCommand(&out, &out)
			root.AddCommand(NewOrdersCommandWithFactories(nil, nil))
			root.SetArgs(test.args)
			if err := root.Execute(); err != nil {
				t.Fatalf("Execute() error = %v", err)
			}
			for _, want := range test.want {
				if !strings.Contains(out.String(), want) {
					t.Fatalf("output = %q, want %q", out.String(), want)
				}
			}
		})
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
			root := newTestRootCommand(&out, &out)
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
	root := newTestRootCommand(&out, &out)
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

func TestPredictionOrderCommandsMapListCancel(t *testing.T) {
	fake := &privatePredictionFake{}
	commands := [][]string{
		{"orders", "prediction", "list", "--history", "--symbol", "GEMI", "--status", "filled", "--limit", "5", "--offset", "2"},
		{"orders", "prediction", "cancel", "--order-id", "88"},
	}
	for _, args := range commands {
		var out bytes.Buffer
		root := newTestRootCommand(&out, &out)
		root.AddCommand(NewOrdersCommandWithFactories(nil, predictionFactory(fake)))
		root.SetArgs(append([]string{"--output", "json"}, args...))
		if err := root.Execute(); err != nil {
			t.Fatalf("Execute(%v) error = %v", args, err)
		}
	}
	if fake.historyRequest == nil || fake.historyRequest.Symbol == nil || *fake.historyRequest.Symbol != "GEMI" || fake.historyRequest.Status == nil || *fake.historyRequest.Status != predictions.GetOrderHistoryJSONBodyStatusFilled || fake.historyRequest.Limit == nil || *fake.historyRequest.Limit != 5 || fake.historyRequest.Offset == nil || *fake.historyRequest.Offset != 2 {
		t.Fatalf("history request = %#v", fake.historyRequest)
	}
	if fake.cancelRequest == nil || fake.cancelRequest.OrderId != 88 {
		t.Fatalf("cancel request = %#v", fake.cancelRequest)
	}
}

func TestPrivateRequestValidation(t *testing.T) {
	if _, err := buildSpotOrderRequest("BTCUSD", "buy", "1", "100", "exchange limit", "", "99", "", "primary"); err == nil {
		t.Fatal("expected stop-price validation error")
	}
	if _, err := buildPredictionOrderRequest("GEMI", "buy", "yes", "1", "0.5", "limit", "0.4", "", false); err == nil {
		t.Fatal("expected prediction stop-price validation error")
	}
	if _, err := buildSpotOrderRequest("BTCUSD", "buy", "0", "100", "exchange limit", "", "", "", "primary"); err == nil {
		t.Fatal("expected positive amount validation error")
	}
	if _, err := buildSpotOrderRequest("BTCUSD", "buy", "1", "100", "exchange market", "", "", "", "primary"); err == nil {
		t.Fatal("expected unsupported market order error")
	}
	if _, err := buildPredictionOrderRequest("GEMI", "buy", "yes", "0", "0.5", "limit", "", "", false); err == nil {
		t.Fatal("expected positive quantity validation error")
	}
	if _, err := buildPredictionOrderRequest("GEMI", "buy", "yes", "1", "0.005", "limit", "", "", false); err == nil {
		t.Fatal("expected prediction price range validation error")
	}
	if _, err := buildSpotOrderRequest("BTCUSD", "buy", "1", "100", "exchange stop limit", "", "101", "", "primary"); err == nil {
		t.Fatal("expected spot buy stop direction validation error")
	}
	if _, err := buildSpotOrderRequest("BTCUSD", "sell", "1", "100", "exchange stop limit", "", "99", "", "primary"); err == nil {
		t.Fatal("expected spot sell stop direction validation error")
	}
	if _, err := buildPredictionOrderRequest("GEMI", "buy", "yes", "1", "0.50", "stop-limit", "0.51", "", false); err == nil {
		t.Fatal("expected prediction buy stop direction validation error")
	}
	if _, err := buildPredictionOrderRequest("GEMI", "sell", "yes", "1", "0.50", "stop-limit", "0.49", "", false); err == nil {
		t.Fatal("expected prediction sell stop direction validation error")
	}
	if _, err := requiredInt64("-1", "order-id"); err == nil {
		t.Fatal("expected positive order ID validation error")
	}
}
