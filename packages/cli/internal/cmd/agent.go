package cmd

import (
	"fmt"
	"strings"

	"github.com/spf13/cobra"

	"github.com/gemini/developer-platform/packages/cli/internal/output"
	internalschema "github.com/gemini/developer-platform/packages/cli/internal/schema"
)

type (
	MCPTool               = internalschema.MCPTool
	MCPInputSchema        = internalschema.MCPInputSchema
	MCPOutputSchema       = internalschema.MCPOutputSchema
	MCPParam              = internalschema.MCPParam
	MCPToolsOutput        = internalschema.MCPToolsOutput
	OpenAIFunction        = internalschema.OpenAIFunction
	OpenAIFunctionsOutput = internalschema.OpenAIFunctionsOutput
	AnthropicTool         = internalschema.AnthropicTool
	AnthropicToolsOutput  = internalschema.AnthropicToolsOutput
)

var agentFormat string

var agentCmd = &cobra.Command{
	Use:   "agent",
	Short: "Output tool schemas for AI agent frameworks",
	Long: `Output tool schemas in formats native to AI agent frameworks.

Supported formats:
  mcp        - Model Context Protocol (Claude, etc.)
  openai     - OpenAI function calling format
  anthropic  - Anthropic tool use format
  generic    - Generic JSON spec (same as 'spec' command)

Examples:
  # Generate MCP tools for Claude
  gemini-markets agent --format mcp -q > tools.json

  # Generate OpenAI functions
  gemini-markets agent --format openai -q > functions.json

  # Generate Anthropic tools
  gemini-markets agent --format anthropic -q > tools.json`,
	RunE: func(cmd *cobra.Command, args []string) error {
		switch strings.ToLower(agentFormat) {
		case "mcp":
			return outputMCPTools()
		case "openai":
			return outputOpenAIFunctions()
		case "anthropic":
			return outputAnthropicTools()
		case "generic", "":
			spec := buildSpec(rootCmd)
			return output.PrintJSON(spec)
		default:
			return output.FormatError(output.NewInputError(
				fmt.Sprintf("unknown format: %s (must be mcp, openai, anthropic, or generic)", agentFormat),
			))
		}
	},
}

func init() {
	agentCmd.Flags().StringVar(&agentFormat, "format", "generic", "output format: mcp, openai, anthropic, generic")
	rootCmd.AddCommand(agentCmd)
}

func buildMCPTools() []MCPTool {
	return internalschema.BuildMCPTools()
}

func outputMCPTools() error {
	mcpTools := buildMCPTools()
	return output.PrintJSON(MCPToolsOutput{
		Schema:    "https://modelcontextprotocol.io/schemas/tools.json",
		Name:      "gemini-markets",
		Version:   Version,
		ToolCount: len(mcpTools),
		Tools:     mcpTools,
	})
}

func outputOpenAIFunctions() error {
	return output.PrintJSON(OpenAIFunctionsOutput{
		Functions: internalschema.BuildOpenAIFunctions(buildMCPTools()),
	})
}

func outputAnthropicTools() error {
	return output.PrintJSON(AnthropicToolsOutput{
		Tools: internalschema.BuildAnthropicTools(buildMCPTools()),
	})
}
