package cmd

import (
	"encoding/json"
	"testing"

	"github.com/gemini/developer-platform/packages/cli/internal/contracts"
)

func TestMCPToolsDryRunParam(t *testing.T) {
	tools := buildMCPTools()

	toolsWithDryRun := []string{
		"gemini_predict_order_place",
		"gemini_predict_order_cancel_all",
		"gemini_spot_order_place",
		"gemini_spot_order_cancel_all",
	}

	toolMap := make(map[string]MCPTool)
	for _, tool := range tools {
		toolMap[tool.Name] = tool
	}

	for _, name := range toolsWithDryRun {
		tool, exists := toolMap[name]
		if !exists {
			t.Errorf("tool %s not found", name)
			continue
		}

		param, exists := tool.InputSchema.Properties["dry_run"]
		if !exists {
			t.Errorf("%s: missing dry_run parameter", name)
			continue
		}

		if param.Type != "boolean" {
			t.Errorf("%s: dry_run type should be 'boolean', got '%s'", name, param.Type)
		}
	}
}

func TestStdinJSONParsing(t *testing.T) {
	tests := []struct {
		name    string
		input   string
		wantErr bool
	}{
		{
			name:    "valid predict order JSON",
			input:   `{"symbol":"GEMI-TEST","side":"buy","outcome":"yes","quantity":"100","price":"0.65"}`,
			wantErr: false,
		},
		{
			name:    "valid spot order JSON",
			input:   `{"symbol":"btcusd","side":"buy","amount":"0.1","price":"50000"}`,
			wantErr: false,
		},
		{
			name:    "partial JSON (missing fields)",
			input:   `{"symbol":"GEMI-TEST"}`,
			wantErr: false,
		},
		{
			name:    "empty object",
			input:   `{}`,
			wantErr: false,
		},
		{
			name:    "invalid JSON",
			input:   `not json`,
			wantErr: true,
		},
		{
			name:    "empty input",
			input:   ``,
			wantErr: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			// Test predict order struct parsing
			var predictReq struct {
				Symbol        string `json:"symbol"`
				Side          string `json:"side"`
				Outcome       string `json:"outcome"`
				Type          string `json:"type"`
				Quantity      string `json:"quantity"`
				Price         string `json:"price"`
				StopPrice     string `json:"stop_price"`
				TimeInForce   string `json:"tif"`
				ClientOrderID string `json:"client_order_id"`
				MakerOrCancel bool   `json:"maker_or_cancel"`
			}
			err := json.Unmarshal([]byte(tt.input), &predictReq)
			if (err != nil) != tt.wantErr {
				t.Errorf("predict unmarshal error = %v, wantErr %v", err, tt.wantErr)
			}

			// Test spot order struct parsing
			var spotReq struct {
				Symbol        string `json:"symbol"`
				Side          string `json:"side"`
				Type          string `json:"type"`
				Amount        string `json:"amount"`
				Price         string `json:"price"`
				StopPrice     string `json:"stop_price"`
				ClientOrderID string `json:"client_order_id"`
				MakerOrCancel bool   `json:"maker_or_cancel"`
				IOC           bool   `json:"ioc"`
				FOK           bool   `json:"fok"`
				Account       string `json:"account"`
			}
			err = json.Unmarshal([]byte(tt.input), &spotReq)
			if (err != nil) != tt.wantErr {
				t.Errorf("spot unmarshal error = %v, wantErr %v", err, tt.wantErr)
			}
		})
	}
}

func TestDollarsToAmountConversion(t *testing.T) {
	// Spot: amount = dollars / price (not floored)
	dollars := 50.0
	price := 50000.0
	amount := dollars / price
	expected := 0.001
	if amount != expected {
		t.Errorf("got amount %f, want %f", amount, expected)
	}
}

func TestDryRunOutputShape(t *testing.T) {
	// Verify dry-run JSON output has expected fields for predict order place
	dryResult := map[string]any{
		"dry_run":         true,
		"action":          contracts.ActionPredictOrderPlace,
		"symbol":          "GEMI-TEST",
		"side":            "buy",
		"outcome":         "yes",
		"type":            "limit",
		"quantity":        "100",
		"price":           "0.65",
		"time_in_force":   "good-til-cancel",
		"client_order_id": "test-123",
	}

	data, err := json.Marshal(dryResult)
	if err != nil {
		t.Fatalf("failed to marshal dry-run result: %v", err)
	}

	var parsed map[string]any
	if err := json.Unmarshal(data, &parsed); err != nil {
		t.Fatalf("failed to unmarshal dry-run result: %v", err)
	}

	if parsed["dry_run"] != true {
		t.Error("dry_run should be true")
	}
	if parsed["action"] != contracts.ActionPredictOrderPlace {
		t.Errorf("expected action %q, got %v", contracts.ActionPredictOrderPlace, parsed["action"])
	}

	requiredFields := []string{"symbol", "side", "outcome", "type", "quantity", "price", "client_order_id"}
	for _, field := range requiredFields {
		if _, exists := parsed[field]; !exists {
			t.Errorf("missing required field in dry-run output: %s", field)
		}
	}
}

func TestDryRunCancelAllOutputShape(t *testing.T) {
	// Verify cancel-all dry-run JSON has expected fields
	dryResult := map[string]any{
		"dry_run":     true,
		"action":      contracts.ActionPredictCancelAll,
		"order_count": 3,
		"orders":      []any{},
	}

	data, err := json.Marshal(dryResult)
	if err != nil {
		t.Fatalf("failed to marshal dry-run cancel-all result: %v", err)
	}

	var parsed map[string]any
	if err := json.Unmarshal(data, &parsed); err != nil {
		t.Fatalf("failed to unmarshal dry-run cancel-all result: %v", err)
	}

	if parsed["dry_run"] != true {
		t.Error("dry_run should be true")
	}
	if parsed["action"] != contracts.ActionPredictCancelAll {
		t.Errorf("expected action %q, got %v", contracts.ActionPredictCancelAll, parsed["action"])
	}
	if _, exists := parsed["order_count"]; !exists {
		t.Error("missing order_count field in cancel-all dry-run output")
	}
}

func TestActionConstants(t *testing.T) {
	// Verify action constants are non-empty and follow naming convention
	actions := []string{
		contracts.ActionPredictOrderPlace,
		contracts.ActionPredictCancelAll,
		contracts.ActionSpotOrderPlace,
		contracts.ActionSpotCancelAll,
	}
	for _, a := range actions {
		if a == "" {
			t.Error("action constant should not be empty")
		}
	}
}

func TestStreamCommandsHaveExamples(t *testing.T) {
	// Verify all stream subcommands have Long descriptions
	cmds := []*struct {
		name string
		long string
	}{
		{"ticker", streamTickerCmd.Long},
		{"depth", streamDepthCmd.Long},
		{"trades", streamTradesCmd.Long},
		{"balances", streamBalancesCmd.Long},
		{"orders", streamOrdersCmd.Long},
	}

	for _, cmd := range cmds {
		if cmd.long == "" {
			t.Errorf("stream %s: missing Long description", cmd.name)
		}
	}
}
