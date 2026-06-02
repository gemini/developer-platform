package cmd

import (
	"encoding/json"
	"strings"
	"testing"
)

func TestBuildSpec(t *testing.T) {
	spec := buildSpec(rootCmd)

	if spec.Name != "gemini-markets" {
		t.Errorf("Name = %q, want %q", spec.Name, "gemini-markets")
	}

	if spec.Version == "" {
		t.Error("Version should not be empty")
	}

	if len(spec.Commands) == 0 {
		t.Error("Commands should not be empty")
	}

	if len(spec.Workflows) == 0 {
		t.Error("Workflows should not be empty")
	}

	if len(spec.Schemas) == 0 {
		t.Error("Schemas should not be empty")
	}
}

func TestGenerateSpec_RequiredCommands(t *testing.T) {
	spec := buildSpec(rootCmd)

	requiredCommands := []string{
		"spot", "predict", "book", "balance", "stream",
		"candles", "klines", "auth", "status", "spec", "update",
	}

	commandMap := make(map[string]bool)
	for _, cmd := range spec.Commands {
		commandMap[cmd.Name] = true
	}

	for _, required := range requiredCommands {
		if !commandMap[required] {
			t.Errorf("Missing required command: %s", required)
		}
	}
}

func TestGenerateSpec_NoDuplicateTopLevelCommands(t *testing.T) {
	spec := buildSpec(rootCmd)
	seen := make(map[string]bool, len(spec.Commands))

	for _, cmd := range spec.Commands {
		if seen[cmd.Name] {
			t.Fatalf("duplicate top-level command in spec: %s", cmd.Name)
		}
		seen[cmd.Name] = true
	}
}

func TestGenerateSpec_RequiresAuthMetadata(t *testing.T) {
	spec := buildSpec(rootCmd)

	tests := []struct {
		path string
		want bool
	}{
		{path: "auth test", want: true},
		{path: "stream trades", want: false},
		{path: "stream orders", want: true},
		{path: "predict order place", want: true},
		{path: "predict markets list", want: false},
		{path: "spot trades", want: true},
	}

	for _, tt := range tests {
		t.Run(tt.path, func(t *testing.T) {
			cmd := findCommandSpec(t, spec.Commands, tt.path)
			if cmd.RequiresAuth != tt.want {
				t.Fatalf("%s RequiresAuth = %t, want %t", tt.path, cmd.RequiresAuth, tt.want)
			}
		})
	}
}

func TestGenerateSpec_SpotSubcommands(t *testing.T) {
	spec := buildSpec(rootCmd)

	var spotCmd *CommandSpec
	for i := range spec.Commands {
		if spec.Commands[i].Name == "spot" {
			spotCmd = &spec.Commands[i]
			break
		}
	}

	if spotCmd == nil {
		t.Fatal("spot command not found")
	}

	requiredSubcommands := []string{"symbols", "symbol", "order", "trades", "fees"}
	subcommandMap := make(map[string]bool)
	for _, sub := range spotCmd.Subcommands {
		subcommandMap[sub.Name] = true
	}

	for _, required := range requiredSubcommands {
		if !subcommandMap[required] {
			t.Errorf("spot missing subcommand: %s", required)
		}
	}
}

func TestGenerateSpec_PredictSubcommands(t *testing.T) {
	spec := buildSpec(rootCmd)

	var predictCmd *CommandSpec
	for i := range spec.Commands {
		if spec.Commands[i].Name == "predict" {
			predictCmd = &spec.Commands[i]
			break
		}
	}

	if predictCmd == nil {
		t.Fatal("predict command not found")
	}

	requiredSubcommands := []string{"markets", "order", "positions"}
	subcommandMap := make(map[string]bool)
	for _, sub := range predictCmd.Subcommands {
		subcommandMap[sub.Name] = true
	}

	for _, required := range requiredSubcommands {
		if !subcommandMap[required] {
			t.Errorf("predict missing subcommand: %s", required)
		}
	}
}

func TestGenerateSpec_JSONSerializable(t *testing.T) {
	spec := buildSpec(rootCmd)

	data, err := json.Marshal(spec)
	if err != nil {
		t.Fatalf("Failed to marshal spec to JSON: %v", err)
	}

	if len(data) == 0 {
		t.Error("Serialized JSON should not be empty")
	}

	// Verify it can be unmarshaled back
	var parsed CLISpec
	if err := json.Unmarshal(data, &parsed); err != nil {
		t.Fatalf("Failed to unmarshal spec: %v", err)
	}

	if parsed.Name != spec.Name {
		t.Errorf("Round-trip Name = %q, want %q", parsed.Name, spec.Name)
	}
}

func TestGenerateSpec_WorkflowsHaveSteps(t *testing.T) {
	spec := buildSpec(rootCmd)

	for _, workflow := range spec.Workflows {
		if workflow.Name == "" {
			t.Error("Workflow name should not be empty")
		}
		if len(workflow.Steps) == 0 {
			t.Errorf("Workflow %q should have steps", workflow.Name)
		}
		for i, step := range workflow.Steps {
			if step.Command == "" {
				t.Errorf("Workflow %q step %d missing command", workflow.Name, i+1)
			}
		}
	}
}

func TestGenerateSpec_SchemasHaveFields(t *testing.T) {
	spec := buildSpec(rootCmd)

	requiredSchemas := []string{"Market", "Position", "Balance", "PredictOrderResponse", "SpotOrderResponse"}

	for _, schemaName := range requiredSchemas {
		schema, ok := spec.Schemas[schemaName]
		if !ok {
			t.Errorf("Missing required schema: %s", schemaName)
			continue
		}
		if len(schema.Fields) == 0 {
			t.Errorf("Schema %q should have fields", schemaName)
		}
	}
}

func TestGenerateSpec_CommandsHaveDescriptions(t *testing.T) {
	spec := buildSpec(rootCmd)

	for _, cmd := range spec.Commands {
		if cmd.Description == "" {
			t.Errorf("Command %q missing description", cmd.Name)
		}
	}
}

func TestGenerateSpec_FlagsHaveTypes(t *testing.T) {
	spec := buildSpec(rootCmd)

	for _, cmd := range spec.Commands {
		for _, flag := range cmd.Flags {
			if flag.Type == "" {
				t.Errorf("Command %q flag %q missing type", cmd.Name, flag.Name)
			}
		}
		for _, sub := range cmd.Subcommands {
			for _, flag := range sub.Flags {
				if flag.Type == "" {
					t.Errorf("Command %q subcommand %q flag %q missing type", cmd.Name, sub.Name, flag.Name)
				}
			}
		}
	}
}

func findCommandSpec(t *testing.T, commands []CommandSpec, path string) CommandSpec {
	t.Helper()

	parts := splitCommandPath(path)
	current := commands
	var found CommandSpec
	for _, part := range parts {
		ok := false
		for _, cmd := range current {
			if cmd.Name == part {
				found = cmd
				current = cmd.Subcommands
				ok = true
				break
			}
		}
		if !ok {
			t.Fatalf("command %q not found in spec", path)
		}
	}
	return found
}

func splitCommandPath(path string) []string {
	return strings.Fields(path)
}
