package cmd

import (
	"bytes"
	"strings"
	"testing"

	"github.com/spf13/cobra"
)

func TestCoreCommandsIncludeExamples(t *testing.T) {
	tests := []struct {
		name     string
		command  *cobra.Command
		expected []string
	}{
		{
			name:    "predict order place",
			command: predictOrderPlaceCmd,
			expected: []string{
				"--client-order-id agent-123",
				"--dry-run -q",
				"--stdin -q",
			},
		},
		{
			name:    "spot order place",
			command: spotOrderPlaceCmd,
			expected: []string{
				"--client-order-id agent-123",
				"--dry-run -q",
				"--stdin -q",
			},
		},
		{
			name:    "predict markets list",
			command: predictMarketsListCmd,
			expected: []string{
				`--search "NBA Finals"`,
				"--category Sports",
			},
		},
		{
			name:    "stream orders",
			command: streamOrdersCmd,
			expected: []string{
				"--event-type fill",
				"--session-only -q",
			},
		},
		{
			name:    "auth status",
			command: authStatusCmd,
			expected: []string{
				"gemini-markets auth status",
				"--sandbox auth status -q",
			},
		},
		{
			name:    "auth login",
			command: authLoginCmd,
			expected: []string{
				"gemini-markets auth login",
				"--sandbox auth login",
			},
		},
		{
			name:    "auth test",
			command: authTestCmd,
			expected: []string{
				"gemini-markets auth test",
				"--sandbox auth test -q",
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			help := renderHelp(t, tt.command)
			for _, expected := range tt.expected {
				if !strings.Contains(help, expected) {
					t.Fatalf("help output missing %q\n\n%s", expected, help)
				}
			}
		})
	}
}

func TestFilterCompletionValues(t *testing.T) {
	values := []string{"BTCUSD", "btcusd", "ETHUSD", "BTCUSD"}
	got := filterCompletionValues(values, "btc")
	if len(got) != 2 {
		t.Fatalf("len(filterCompletionValues) = %d, want 2", len(got))
	}
	if got[0] != "BTCUSD" || got[1] != "btcusd" {
		t.Fatalf("filterCompletionValues = %#v, want [BTCUSD btcusd]", got)
	}
}

func renderHelp(t *testing.T, cmd *cobra.Command) string {
	t.Helper()

	var buf bytes.Buffer
	cmd.SetOut(&buf)
	cmd.SetErr(&buf)
	if err := cmd.Help(); err != nil {
		t.Fatalf("Help() error = %v", err)
	}
	return buf.String()
}
