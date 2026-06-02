package cmd

import (
	"encoding/json"
	"slices"
	"testing"
)

func TestBuildMCPTools(t *testing.T) {
	tools := buildMCPTools()

	if len(tools) == 0 {
		t.Fatal("expected at least one tool")
	}

	// Verify critical tools exist
	toolNames := make(map[string]bool)
	for _, tool := range tools {
		toolNames[tool.Name] = true
	}

	requiredTools := []string{
		"gemini_predict_order_place",
		"gemini_predict_order_cancel",
		"gemini_predict_order_cancel_all",
		"gemini_predict_order_list",
		"gemini_balance",
		"gemini_book",
	}

	for _, required := range requiredTools {
		if !toolNames[required] {
			t.Errorf("missing required tool: %s", required)
		}
	}
}

func TestMCPToolSchema(t *testing.T) {
	tools := buildMCPTools()

	// Find predict order place tool
	var placeOrderTool *MCPTool
	for i := range tools {
		if tools[i].Name == "gemini_predict_order_place" {
			placeOrderTool = &tools[i]
			break
		}
	}

	if placeOrderTool == nil {
		t.Fatal("gemini_predict_order_place tool not found")
	}

	// Verify required fields
	if placeOrderTool.InputSchema.Type != "object" {
		t.Errorf("expected type 'object', got %s", placeOrderTool.InputSchema.Type)
	}

	// Verify required params include client_order_id (critical for agents)
	if !slices.Contains(placeOrderTool.InputSchema.Required, "client_order_id") {
		t.Error("client_order_id should be required for predict order place")
	}

	// Verify properties exist
	requiredProps := []string{"symbol", "side", "outcome", "quantity", "client_order_id"}
	for _, prop := range requiredProps {
		if _, exists := placeOrderTool.InputSchema.Properties[prop]; !exists {
			t.Errorf("missing property: %s", prop)
		}
	}
}

func TestMCPOutputFormat(t *testing.T) {
	tools := MCPToolsOutput{
		Schema:  "https://modelcontextprotocol.io/schemas/tools.json",
		Name:    "gemini-markets",
		Version: "test",
		Tools:   buildMCPTools(),
	}

	// Verify it serializes to valid JSON
	data, err := json.Marshal(tools)
	if err != nil {
		t.Fatalf("failed to marshal MCP tools: %v", err)
	}

	// Verify we can unmarshal it back
	var parsed MCPToolsOutput
	if err := json.Unmarshal(data, &parsed); err != nil {
		t.Fatalf("failed to unmarshal MCP tools: %v", err)
	}

	if parsed.Name != "gemini-markets" {
		t.Errorf("expected name 'gemini-markets', got %s", parsed.Name)
	}
}

func TestOpenAIFormat(t *testing.T) {
	mcpTools := buildMCPTools()
	functions := make([]OpenAIFunction, 0, len(mcpTools))

	for _, tool := range mcpTools {
		properties := make(map[string]any)
		for name, param := range tool.InputSchema.Properties {
			prop := map[string]any{
				"type":        param.Type,
				"description": param.Description,
			}
			if len(param.Enum) > 0 {
				prop["enum"] = param.Enum
			}
			properties[name] = prop
		}

		functions = append(functions, OpenAIFunction{
			Name:        tool.Name,
			Description: tool.Description,
			Parameters: map[string]any{
				"type":       "object",
				"properties": properties,
				"required":   tool.InputSchema.Required,
			},
		})
	}

	output := OpenAIFunctionsOutput{Functions: functions}

	// Verify it serializes to valid JSON
	data, err := json.Marshal(output)
	if err != nil {
		t.Fatalf("failed to marshal OpenAI functions: %v", err)
	}

	// Verify we can unmarshal it back
	var parsed OpenAIFunctionsOutput
	if err := json.Unmarshal(data, &parsed); err != nil {
		t.Fatalf("failed to unmarshal OpenAI functions: %v", err)
	}

	if len(parsed.Functions) != len(mcpTools) {
		t.Errorf("expected %d functions, got %d", len(mcpTools), len(parsed.Functions))
	}
}

func TestAnthropicFormat(t *testing.T) {
	mcpTools := buildMCPTools()
	tools := make([]AnthropicTool, 0, len(mcpTools))

	for _, tool := range mcpTools {
		properties := make(map[string]any)
		for name, param := range tool.InputSchema.Properties {
			prop := map[string]any{
				"type":        param.Type,
				"description": param.Description,
			}
			if len(param.Enum) > 0 {
				prop["enum"] = param.Enum
			}
			properties[name] = prop
		}

		tools = append(tools, AnthropicTool{
			Name:        tool.Name,
			Description: tool.Description,
			InputSchema: map[string]any{
				"type":       "object",
				"properties": properties,
				"required":   tool.InputSchema.Required,
			},
		})
	}

	output := AnthropicToolsOutput{Tools: tools}

	// Verify it serializes to valid JSON
	data, err := json.Marshal(output)
	if err != nil {
		t.Fatalf("failed to marshal Anthropic tools: %v", err)
	}

	// Verify we can unmarshal it back
	var parsed AnthropicToolsOutput
	if err := json.Unmarshal(data, &parsed); err != nil {
		t.Fatalf("failed to unmarshal Anthropic tools: %v", err)
	}

	if len(parsed.Tools) != len(mcpTools) {
		t.Errorf("expected %d tools, got %d", len(mcpTools), len(parsed.Tools))
	}
}
