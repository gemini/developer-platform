package schema

import "testing"

func TestToolBuildersStayInSync(t *testing.T) {
	mcpTools := BuildMCPTools()
	openAITools := BuildOpenAIFunctions(mcpTools)
	anthropicTools := BuildAnthropicTools(mcpTools)

	if len(mcpTools) < 30 {
		t.Fatalf("expected at least 30 MCP tools, got %d", len(mcpTools))
	}
	if len(openAITools) != len(mcpTools) {
		t.Fatalf("OpenAI tool count = %d, want %d", len(openAITools), len(mcpTools))
	}
	if len(anthropicTools) != len(mcpTools) {
		t.Fatalf("Anthropic tool count = %d, want %d", len(anthropicTools), len(mcpTools))
	}
}

func TestBuildMCPToolsIncludesAgentCriticalTools(t *testing.T) {
	tools := BuildMCPTools()
	toolMap := make(map[string]MCPTool, len(tools))
	for _, tool := range tools {
		toolMap[tool.Name] = tool
	}

	requiredTools := []string{
		"gemini_predict_order_place",
		"gemini_predict_order_cancel_all",
		"gemini_spot_order_place",
		"gemini_balance",
		"gemini_book",
	}
	for _, name := range requiredTools {
		if _, ok := toolMap[name]; !ok {
			t.Fatalf("missing required tool %q", name)
		}
	}

	placeTool := toolMap["gemini_predict_order_place"]
	if placeTool.InputSchema.Type != "object" {
		t.Fatalf("predict place input schema type = %q, want object", placeTool.InputSchema.Type)
	}
	if _, ok := placeTool.InputSchema.Properties["client_order_id"]; !ok {
		t.Fatal("predict place tool missing client_order_id property")
	}
}

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
