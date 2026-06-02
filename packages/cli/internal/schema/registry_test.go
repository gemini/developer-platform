package schema

import "testing"

// Tests here exercise the registry infrastructure with synthetic data.
// For tests covering the full registered tool set, see cmd/mcp_schema_test.go —
// that package's init() functions populate the registry.

func TestRegisterAndBuildMCPTool(t *testing.T) {
	saved := registry
	registry = nil
	defer func() { registry = saved }()

	Register(&CommandMeta{
		MCPName:     "test_tool",
		Description: "A test tool.",
		Params: map[string]ParamMeta{
			"alpha": {Type: ParamString, Required: true, Description: "First param", Example: "a"},
			"beta":  {Type: ParamNumber, Description: "Second param", Default: "1.0"},
			"gamma": {Type: ParamBoolean, Description: "Third param"},
			"delta": {Type: ParamString, Enum: []string{"x", "y", "z"}, Description: "Enum param"},
		},
		Output: &OutputMeta{Type: "object", Description: "Result", Schema: "#/schemas/Test"},
	})

	tools := BuildMCPTools()
	if len(tools) != 1 {
		t.Fatalf("expected 1 tool, got %d", len(tools))
	}

	tool := tools[0]
	if tool.Name != "test_tool" {
		t.Errorf("Name = %q, want test_tool", tool.Name)
	}
	if tool.Description != "A test tool." {
		t.Errorf("Description = %q, want 'A test tool.'", tool.Description)
	}
	if tool.InputSchema.Type != "object" {
		t.Errorf("InputSchema.Type = %q, want object", tool.InputSchema.Type)
	}
	if len(tool.InputSchema.Properties) != 4 {
		t.Errorf("Properties count = %d, want 4", len(tool.InputSchema.Properties))
	}

	// Required list must contain only "alpha" and be sorted.
	if len(tool.InputSchema.Required) != 1 || tool.InputSchema.Required[0] != "alpha" {
		t.Errorf("Required = %v, want [alpha]", tool.InputSchema.Required)
	}

	alpha := tool.InputSchema.Properties["alpha"]
	if alpha.Type != "string" || alpha.Example != "a" {
		t.Errorf("alpha = %+v, want type=string example=a", alpha)
	}

	beta := tool.InputSchema.Properties["beta"]
	if beta.Type != "number" || beta.Default != "1.0" {
		t.Errorf("beta = %+v, want type=number default=1.0", beta)
	}

	delta := tool.InputSchema.Properties["delta"]
	if len(delta.Enum) != 3 {
		t.Errorf("delta.Enum = %v, want [x y z]", delta.Enum)
	}

	if tool.OutputSchema == nil {
		t.Fatal("OutputSchema is nil")
	}
	if tool.OutputSchema.Type != "object" || tool.OutputSchema.Schema != "#/schemas/Test" {
		t.Errorf("OutputSchema = %+v", tool.OutputSchema)
	}
}

func TestBuildMCPToolNoOutput(t *testing.T) {
	saved := registry
	registry = nil
	defer func() { registry = saved }()

	Register(&CommandMeta{
		MCPName:     "no_output_tool",
		Description: "Tool without output schema.",
		Params:      map[string]ParamMeta{},
	})

	tools := BuildMCPTools()
	if len(tools) != 1 {
		t.Fatalf("expected 1 tool, got %d", len(tools))
	}
	if tools[0].OutputSchema != nil {
		t.Error("OutputSchema should be nil when Output is not set")
	}
}

func TestRequiredParamsSorted(t *testing.T) {
	saved := registry
	registry = nil
	defer func() { registry = saved }()

	Register(&CommandMeta{
		MCPName: "sort_test",
		Params: map[string]ParamMeta{
			"zebra":  {Type: ParamString, Required: true},
			"apple":  {Type: ParamString, Required: true},
			"mango":  {Type: ParamString, Required: true},
			"banana": {Type: ParamString, Required: false},
		},
	})

	tool := BuildMCPTools()[0]
	want := []string{"apple", "mango", "zebra"}
	if len(tool.InputSchema.Required) != len(want) {
		t.Fatalf("Required = %v, want %v", tool.InputSchema.Required, want)
	}
	for i, r := range tool.InputSchema.Required {
		if r != want[i] {
			t.Errorf("Required[%d] = %q, want %q", i, r, want[i])
		}
	}
}

func TestRegistrationOrder(t *testing.T) {
	saved := registry
	registry = nil
	defer func() { registry = saved }()

	Register(&CommandMeta{MCPName: "first", Params: map[string]ParamMeta{}})
	Register(&CommandMeta{MCPName: "second", Params: map[string]ParamMeta{}})
	Register(&CommandMeta{MCPName: "third", Params: map[string]ParamMeta{}})

	tools := BuildMCPTools()
	names := []string{tools[0].Name, tools[1].Name, tools[2].Name}
	want := []string{"first", "second", "third"}
	for i, n := range names {
		if n != want[i] {
			t.Errorf("tool[%d] = %q, want %q", i, n, want[i])
		}
	}
}

func TestBuildOpenAIFunctionsFromRegistry(t *testing.T) {
	saved := registry
	registry = nil
	defer func() { registry = saved }()

	Register(&CommandMeta{
		MCPName:     "my_tool",
		Description: "A tool.",
		Params: map[string]ParamMeta{
			"x": {Type: ParamString, Required: true, Enum: []string{"a", "b"}},
		},
	})

	mcp := BuildMCPTools()
	fns := BuildOpenAIFunctions(mcp)
	if len(fns) != 1 {
		t.Fatalf("expected 1 function, got %d", len(fns))
	}
	if fns[0].Name != "my_tool" {
		t.Errorf("function Name = %q", fns[0].Name)
	}

	tools := BuildAnthropicTools(mcp)
	if len(tools) != 1 || tools[0].Name != "my_tool" {
		t.Errorf("anthropic tool = %+v", tools)
	}
}
