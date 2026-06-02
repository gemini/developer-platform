package cmd

import (
	"context"
	"fmt"
	"net/http"
	"time"

	"github.com/spf13/cobra"

	"github.com/gemini/developer-platform/packages/cli/internal/output"
	internalschema "github.com/gemini/developer-platform/packages/cli/internal/schema"
)

var statusCmd = &cobra.Command{
	Use:   "status",
	Short: "Check public API reachability",
	Long: `Check public Gemini API reachability and latency.

This command does not validate credentials or trading readiness.
Use 'gemini-markets auth test' for an authenticated probe and
'gemini-markets doctor' for full execution readiness.`,
	Example: `  gemini-markets status
	  gemini-markets --sandbox status -q`,
	RunE: func(cmd *cobra.Command, args []string) error {
		cfg, err := loadConfigWithFallback(cmd)
		if err != nil {
			return handleCommandError(err)
		}

		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()

		baseURL := cfg.GetBaseURL()
		req, err := http.NewRequestWithContext(ctx, http.MethodGet, baseURL+"/v1/prediction-markets/events?limit=1", http.NoBody)
		if err != nil {
			return err
		}

		start := time.Now()
		resp, err := http.DefaultClient.Do(req)
		latency := time.Since(start)

		if err != nil {
			result := map[string]any{
				"status":  "error",
				"message": err.Error(),
			}
			if IsTableOutput() {
				fmt.Println("Status: ERROR")
				fmt.Printf("Error:  %s\n", err.Error())
				return nil
			}
			return output.PrintJSON(result)
		}
		defer resp.Body.Close()

		status := "healthy"
		if resp.StatusCode >= 400 {
			status = "unhealthy"
		}

		result := map[string]any{
			"status":     status,
			"statusCode": resp.StatusCode,
			"latencyMs":  latency.Milliseconds(),
			"endpoint":   baseURL,
		}

		if IsTableOutput() {
			fmt.Printf("Status:     %s\n", status)
			fmt.Printf("Endpoint:   %s\n", baseURL)
			fmt.Printf("Latency:    %dms\n", latency.Milliseconds())
			return nil
		}
		return output.PrintJSON(result)
	},
}

func init() {
	internalschema.Register(&internalschema.CommandMeta{
		MCPName:     "gemini_status",
		Description: "Check API health and connectivity.",
		Params:      map[string]internalschema.ParamMeta{},
		Output:      &internalschema.OutputMeta{Type: "object", Description: "API status"},
	})
}
