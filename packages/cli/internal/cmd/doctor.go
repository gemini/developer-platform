package cmd

import (
	"context"
	"fmt"
	"time"

	"github.com/spf13/cobra"

	appdoctor "github.com/gemini/developer-platform/packages/cli/internal/app/doctor"
	"github.com/gemini/developer-platform/packages/cli/internal/config"
	"github.com/gemini/developer-platform/packages/cli/internal/output"
	appruntime "github.com/gemini/developer-platform/packages/cli/internal/runtime"
	"github.com/gemini/developer-platform/packages/cli/internal/ws"
)

var doctorCmd = &cobra.Command{
	Use:   "doctor",
	Short: "Run trading-readiness diagnostics",
	Example: `  gemini-markets doctor
  gemini-markets --sandbox doctor -q
  gemini-markets --no-websocket doctor -o table`,
	Long: `Run the CLI's full trading-readiness preflight.

Checks configuration sanity, sandbox posture, public REST connectivity,
WebSocket reachability, authenticated API access, and rate-limit posture.

Use this command as the final bot/operator preflight before live execution.
For auth metadata only, use 'gemini-markets auth status'. For a live
authenticated probe only, use 'gemini-markets auth test'.`,
	RunE: func(cmd *cobra.Command, args []string) error {
		rt, err := runtimeWithFallback(cmd)
		if err != nil {
			return handleCommandError(err)
		}
		cfg := rt.Config
		source := rt.CredentialSource

		ctx, cancel := context.WithTimeout(cmd.Context(), time.Duration(TimeoutSeconds())*time.Second)
		defer cancel()

		svc := appdoctor.NewService(rt.API, doctorWSProber{rt: rt})
		report := svc.Run(ctx, cfg, source, appdoctor.Options{
			WebSocketDisabled: IsWebSocketDisabled(),
		})

		if IsTableOutput() {
			printDoctorReport(report)
			return nil
		}
		return output.PrintJSON(report)
	},
}

type doctorWSProber struct {
	rt *appruntime.Runtime
}

func (p doctorWSProber) Probe(ctx context.Context, url string, cfg *config.Config) error {
	opts := []ws.ClientOption{}
	if p.rt != nil {
		opts = append(opts, p.rt.WSClientOptions()...)
	}

	client, err := ws.Connect(ctx, url, opts...)
	if err != nil {
		return err
	}
	defer client.Close()

	// For authenticated sessions, verify auth works on WS by subscribing to
	// the balances stream and confirming the server accepts the request.
	if cfg != nil && cfg.IsAuthenticated() {
		if err := client.Subscribe(ctx, ws.BalancesStream()); err != nil {
			return fmt.Errorf("authenticated WebSocket subscribe failed: %w", err)
		}
	}

	return nil
}

func printDoctorReport(report appdoctor.Report) {
	fmt.Printf("Status:             %s\n", report.Status)
	fmt.Printf("Ready For Trading:  %t\n", report.ReadyForTrading)
	fmt.Printf("Ready Reason:       %s\n", report.ReadyReason)
	fmt.Printf("Environment:        %s\n", report.Environment)
	fmt.Printf("Auth Type:          %s\n", report.AuthType)
	fmt.Printf("Authenticated:      %t\n", report.Authenticated)
	fmt.Printf("Credential Source:  %s\n", report.CredentialSource)
	fmt.Printf("WebSocket Enabled:  %t\n", report.WebSocketEnabled)
	if len(report.BlockingChecks) > 0 {
		fmt.Printf("Blocking Checks:    %v\n", report.BlockingChecks)
	}
	fmt.Println()

	table := output.NewTableWriter("CHECK", "STATUS", "MESSAGE")
	for _, check := range report.Checks {
		table.AddRow(check.Name, check.Status, check.Message)
	}
	table.Render()

	if len(report.Suggestions) > 0 {
		fmt.Println()
		fmt.Println("Suggestions:")
		for _, suggestion := range report.Suggestions {
			fmt.Printf("  - %s\n", suggestion)
		}
	}
}
