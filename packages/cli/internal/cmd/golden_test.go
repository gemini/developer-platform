package cmd

import (
	"bytes"
	"encoding/json"
	"os"
	"path/filepath"
	"testing"

	"github.com/spf13/cobra"

	appdoctor "github.com/gemini/developer-platform/packages/cli/internal/app/doctor"
	"github.com/gemini/developer-platform/packages/cli/internal/contracts"
)

func TestHelpGoldenSnapshots(t *testing.T) {
	tests := []struct {
		name string
		cmd  *cobra.Command
	}{
		{name: "doctor-help", cmd: doctorCmd},
		{name: "predict-order-place-help", cmd: predictOrderPlaceCmd},
		{name: "spot-order-place-help", cmd: spotOrderPlaceCmd},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			assertGoldenFile(t, tt.name+".golden", []byte(renderHelp(t, tt.cmd)))
		})
	}
}

func TestJSONGoldenSnapshots(t *testing.T) {
	tests := []struct {
		name  string
		value any
	}{
		{
			name: "predict-place-dry-run",
			value: contracts.PredictPlaceDryRun{
				DryRun:        true,
				Action:        contracts.ActionPredictOrderPlace,
				Symbol:        "GEMI-OSCARBP26-OSBP26ONEB",
				Side:          "buy",
				Outcome:       "yes",
				Type:          "limit",
				Quantity:      "100",
				Price:         "0.65",
				TimeInForce:   "good-til-cancel",
				ClientOrderID: "agent-123",
			},
		},
		{
			name: "predict-cancel-all-dry-run",
			value: contracts.CancelAllDryRun{
				DryRun:     true,
				Action:     contracts.ActionPredictCancelAll,
				OrderCount: 2,
				Orders: []map[string]any{
					{"orderId": "1", "symbol": "GEMI-OSCARBP26-OSBP26ONEB", "side": "buy"},
					{"orderId": "2", "symbol": "GEMI-BTC2603052200-HI70500", "side": "sell"},
				},
			},
		},
		{
			name: "doctor-report",
			value: appdoctor.Report{
				Status:           appdoctor.StatusWarn,
				Environment:      "production",
				AuthType:         "hmac",
				Authenticated:    true,
				CredentialSource: "environment variables",
				WebSocketEnabled: true,
				ReadyForTrading:  true,
				ReadyReason:      "All required trading checks passed.",
				Checks: []appdoctor.Check{
					{Name: "config", Status: appdoctor.StatusOK, Message: "Configuration looks sane."},
					{Name: "sandbox", Status: appdoctor.StatusWarn, Message: "Production environment is active; use --sandbox for safer testing."},
					{Name: "rest_api", Status: appdoctor.StatusOK, Message: "Public REST API is reachable.", Details: map[string]any{"latencyMs": int64(12)}},
					{Name: "auth", Status: appdoctor.StatusOK, Message: "Authenticated API request succeeded.", Details: map[string]any{"authType": "hmac", "currencies": 2, "latencyMs": int64(8)}},
					{Name: "websocket", Status: appdoctor.StatusOK, Message: "Authenticated WebSocket endpoint is reachable.", Details: map[string]any{"latencyMs": int64(5)}},
				},
				Summary: appdoctor.Summary{OK: 4, Warn: 1},
				Suggestions: []string{
					"Use --sandbox while testing new workflows.",
				},
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			data, err := json.MarshalIndent(tt.value, "", "  ")
			if err != nil {
				t.Fatalf("MarshalIndent() error = %v", err)
			}
			data = append(data, '\n')
			assertGoldenFile(t, tt.name+".golden", data)
		})
	}
}

func assertGoldenFile(t *testing.T, filename string, got []byte) {
	t.Helper()

	path := filepath.Join("testdata", filename)
	want, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("ReadFile(%s) error = %v", path, err)
	}

	// Normalize CRLF to LF so Windows runners match Unix golden files.
	normalize := func(b []byte) []byte { return bytes.ReplaceAll(b, []byte("\r\n"), []byte("\n")) }
	if !bytes.Equal(normalize(got), normalize(want)) {
		t.Fatalf("golden mismatch for %s\n\nwant:\n%s\n\ngot:\n%s", filename, string(want), string(got))
	}
}
