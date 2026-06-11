package schema

import "sort"

// ParamType is the JSON Schema primitive type for an MCP tool parameter.
type ParamType string

const (
	ParamString  ParamType = "string"
	ParamNumber  ParamType = "number"
	ParamBoolean ParamType = "boolean"
	ParamInteger ParamType = "integer"
)

// ParamMeta describes one parameter of an MCP tool.
type ParamMeta struct {
	Type        ParamType
	Description string
	Enum        []string
	Required    bool
	Default     string
	Example     string
}

// OutputMeta describes the expected output shape of an MCP tool.
type OutputMeta struct {
	Type        string // "object" or "array"
	Description string
	Schema      string // "#/schemas/TypeName" reference
}

// CommandMeta holds the MCP metadata for a CLI command.
// Declare one per exported tool alongside its cobra.Command definition,
// then pass it to Register in the command file's init().
type CommandMeta struct {
	MCPName     string
	Description string
	Params      map[string]ParamMeta
	// AnyOf lists alternate required-field sets (JSON Schema anyOf). Each inner
	// slice is one valid combination. Use when at least one of several params
	// must be present (e.g. quantity OR dollars).
	AnyOf  [][]string
	Output *OutputMeta
}

var registry []*CommandMeta

// Register adds a command's MCP metadata to the schema registry.
// Call once per exported tool from the command file's init().
// Registration order determines the order of tools in BuildMCPTools output.
func Register(meta *CommandMeta) {
	registry = append(registry, meta)
}

// BuildMCPTools returns the full MCP tool list derived from registered metadata.
// The schema package itself has no registrations; the cmd package populates the
// registry via init() calls. Tests that need the full list must be in package cmd.
func BuildMCPTools() []MCPTool {
	tools := make([]MCPTool, 0, len(registry))
	for _, meta := range registry {
		tools = append(tools, mcpToolFromMeta(meta))
	}
	return tools
}

func mcpToolFromMeta(meta *CommandMeta) MCPTool {
	properties := make(map[string]MCPParam, len(meta.Params))
	var required []string

	for name, p := range meta.Params {
		properties[name] = MCPParam{
			Type:        string(p.Type),
			Description: p.Description,
			Enum:        p.Enum,
			Default:     p.Default,
			Example:     p.Example,
		}
		if p.Required {
			required = append(required, name)
		}
	}
	sort.Strings(required)

	var anyOf []MCPRequiredSet
	for _, set := range meta.AnyOf {
		anyOf = append(anyOf, MCPRequiredSet{Required: set})
	}

	tool := MCPTool{
		Name:        meta.MCPName,
		Description: meta.Description,
		InputSchema: MCPInputSchema{
			Type:       "object",
			Properties: properties,
			Required:   required,
			AnyOf:      anyOf,
		},
	}
	if meta.Output != nil {
		tool.OutputSchema = &MCPOutputSchema{
			Type:        meta.Output.Type,
			Description: meta.Output.Description,
			Schema:      meta.Output.Schema,
		}
	}
	return tool
}
