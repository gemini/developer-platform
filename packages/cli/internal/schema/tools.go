package schema

// BuildOpenAIFunctions converts MCP tools to OpenAI function-calling format.
func BuildOpenAIFunctions(mcpTools []MCPTool) []OpenAIFunction {
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
	return functions
}

// BuildAnthropicTools converts MCP tools to Anthropic tool-use format.
func BuildAnthropicTools(mcpTools []MCPTool) []AnthropicTool {
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
	return tools
}
