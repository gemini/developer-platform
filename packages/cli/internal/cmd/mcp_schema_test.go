// Tests in this file verify the MCP schema derived from the registered command
// metadata. They must live in package cmd so that all init() functions run and
// populate the schema registry before the tests execute.
package cmd

import (
	"strings"
	"testing"

	internalschema "github.com/gemini/developer-platform/packages/cli/internal/schema"
)

// agentCriticalTools lists tools that must always be present.
// If you remove one, update this list and document why.
var agentCriticalTools = []string{
	"gemini_predict_order_place",
	"gemini_predict_order_cancel",
	"gemini_predict_order_cancel_all",
	"gemini_predict_order_list",
	"gemini_predict_order_get",
	"gemini_predict_order_history",
	"gemini_predict_markets_list",
	"gemini_predict_markets_get",
	"gemini_predict_markets_search",
	"gemini_predict_markets_newly_listed",
	"gemini_predict_markets_recently_settled",
	"gemini_predict_markets_upcoming",
	"gemini_predict_markets_categories",
	"gemini_predict_positions_list",
	"gemini_predict_positions_settled",
	"gemini_spot_order_place",
	"gemini_spot_order_cancel",
	"gemini_spot_order_cancel_all",
	"gemini_spot_order_get",
	"gemini_spot_order_list",
	"gemini_spot_trades",
	"gemini_spot_fees",
	"gemini_spot_symbols",
	"gemini_spot_symbol",
	"gemini_balance",
	"gemini_book",
	"gemini_analyze",
	"gemini_status",
	"gemini_candles",
	"gemini_klines",
}

func TestMCPSchema_AllToolsRegistered(t *testing.T) {
	tools := internalschema.BuildMCPTools()
	toolMap := make(map[string]internalschema.MCPTool, len(tools))
	for _, tool := range tools {
		toolMap[tool.Name] = tool
	}

	for _, name := range agentCriticalTools {
		if _, ok := toolMap[name]; !ok {
			t.Errorf("missing tool %q — add internalschema.Register() to its command file's init()", name)
		}
	}

	if len(tools) < len(agentCriticalTools) {
		t.Errorf("registered %d tools, expected at least %d", len(tools), len(agentCriticalTools))
	}
}

func TestMCPSchema_NoToolNameCollisions(t *testing.T) {
	tools := internalschema.BuildMCPTools()
	seen := make(map[string]bool, len(tools))
	for _, tool := range tools {
		if seen[tool.Name] {
			t.Errorf("duplicate tool name %q", tool.Name)
		}
		seen[tool.Name] = true
	}
}

func TestMCPSchema_AllToolsHaveDescriptions(t *testing.T) {
	for _, tool := range internalschema.BuildMCPTools() {
		if strings.TrimSpace(tool.Description) == "" {
			t.Errorf("tool %q has empty description", tool.Name)
		}
		if tool.InputSchema.Type != "object" {
			t.Errorf("tool %q InputSchema.Type = %q, want object", tool.Name, tool.InputSchema.Type)
		}
		for paramName, param := range tool.InputSchema.Properties {
			if strings.TrimSpace(param.Description) == "" {
				t.Errorf("tool %q param %q has empty description", tool.Name, paramName)
			}
			if param.Type == "" {
				t.Errorf("tool %q param %q has empty type", tool.Name, paramName)
			}
		}
	}
}

func TestMCPSchema_RequiredParamsExistInProperties(t *testing.T) {
	for _, tool := range internalschema.BuildMCPTools() {
		for _, req := range tool.InputSchema.Required {
			if _, ok := tool.InputSchema.Properties[req]; !ok {
				t.Errorf("tool %q: required param %q not in properties", tool.Name, req)
			}
		}
	}
}

func TestMCPSchema_OrderPlacementHasClientOrderID(t *testing.T) {
	tools := internalschema.BuildMCPTools()
	toolMap := make(map[string]internalschema.MCPTool, len(tools))
	for _, tool := range tools {
		toolMap[tool.Name] = tool
	}

	orderTools := []string{"gemini_predict_order_place", "gemini_spot_order_place"}
	for _, name := range orderTools {
		tool, ok := toolMap[name]
		if !ok {
			t.Fatalf("missing tool %q", name)
		}
		if _, ok := tool.InputSchema.Properties["client_order_id"]; !ok {
			t.Errorf("tool %q missing client_order_id param", name)
		}
		var hasClientOrderID bool
		for _, r := range tool.InputSchema.Required {
			if r == "client_order_id" {
				hasClientOrderID = true
			}
		}
		if !hasClientOrderID {
			t.Errorf("tool %q: client_order_id must be required", name)
		}
	}
}

func TestMCPSchema_FormatConvertersStayInSync(t *testing.T) {
	mcp := internalschema.BuildMCPTools()
	openai := internalschema.BuildOpenAIFunctions(mcp)
	anthropic := internalschema.BuildAnthropicTools(mcp)

	if len(openai) != len(mcp) {
		t.Errorf("OpenAI function count = %d, want %d", len(openai), len(mcp))
	}
	if len(anthropic) != len(mcp) {
		t.Errorf("Anthropic tool count = %d, want %d", len(anthropic), len(mcp))
	}
}
