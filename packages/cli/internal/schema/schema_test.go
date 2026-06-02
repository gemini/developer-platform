// Tests for schema-building utilities that do not depend on the cmd package's
// registered tools. MCP tool completeness tests live in cmd/mcp_schema_test.go,
// where the cmd package's init() functions populate the registry.

package schema

import "testing"

func TestBuildSchemasIncludesPublicContracts(t *testing.T) {
	schemas := BuildSchemas()

	requiredSchemas := []string{
		"PredictOrderResponse",
		"SpotOrderResponse",
		"Market",
		"ErrorResponse",
		"StreamMessage",
	}
	for _, name := range requiredSchemas {
		if _, ok := schemas[name]; !ok {
			t.Fatalf("missing required schema %q", name)
		}
	}

	statusField, ok := schemas["PredictOrderResponse"].Fields["status"]
	if !ok {
		t.Fatal("PredictOrderResponse missing status field")
	}
	if statusField.Type != "string" {
		t.Fatalf("PredictOrderResponse.status type = %q, want string", statusField.Type)
	}
}

func TestBuildWorkflowsIncludesCoreAgentFlows(t *testing.T) {
	workflows := BuildWorkflows()
	workflowMap := make(map[string]WorkflowSpec, len(workflows))
	for _, workflow := range workflows {
		workflowMap[workflow.Name] = workflow
	}

	requiredWorkflows := []string{
		"spot_trading",
		"predict_place_order",
		"emergency_exit",
		"active_trading_with_streams",
	}
	for _, name := range requiredWorkflows {
		workflow, ok := workflowMap[name]
		if !ok {
			t.Fatalf("missing workflow %q", name)
		}
		if len(workflow.Steps) == 0 {
			t.Fatalf("workflow %q has no steps", name)
		}
	}
}

func TestBuildErrorCodesAndRetryStrategyStayAligned(t *testing.T) {
	errorCodes := BuildErrorCodes()
	retryStrategy := BuildRetryStrategy()

	var sawRateLimited bool
	for _, code := range errorCodes {
		if code.Code == "RATE_LIMITED" {
			sawRateLimited = true
			if !code.Retryable {
				t.Fatal("RATE_LIMITED should be retryable")
			}
		}
	}
	if !sawRateLimited {
		t.Fatal("RATE_LIMITED error code not found")
	}

	strategy, ok := retryStrategy["RATE_LIMITED"]
	if !ok {
		t.Fatal("RATE_LIMITED retry strategy not found")
	}
	if !strategy.Retry || !strategy.RespectRetryAfter {
		t.Fatal("RATE_LIMITED strategy should retry and respect Retry-After")
	}
}
