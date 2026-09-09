package cli

import (
	"bytes"
	"io"
	"strings"
	"testing"

	"github.com/gemini/developer-platform/packages/gemini-markets-cli/internal/output"
)

func TestRootCommandShowsDiscoverableHelp(t *testing.T) {
	var out bytes.Buffer
	command := NewRootCommand(&out, &out)
	command.SetArgs(nil)
	if err := command.Execute(); err != nil {
		t.Fatalf("Execute() error = %v", err)
	}
	for _, want := range []string{"Usage:", "Available Commands:", "gemini-markets markets ticker BTCUSD"} {
		if !strings.Contains(out.String(), want) {
			t.Fatalf("output = %q, want %q", out.String(), want)
		}
	}
}

func TestRootCommandParsesJSONOutput(t *testing.T) {
	command := NewRootCommand(io.Discard, io.Discard)
	command.SetArgs([]string{"--output", "json", "version"})
	if err := command.Execute(); err != nil {
		t.Fatalf("Execute() error = %v", err)
	}
	if got := Options(command).Format; got != output.JSON {
		t.Fatalf("Options().Format = %q, want json", got)
	}
}

func TestRootCommandVersionSubcommand(t *testing.T) {
	var out bytes.Buffer
	command := NewRootCommand(&out, &out)
	command.SetArgs([]string{"version"})
	if err := command.Execute(); err != nil {
		t.Fatalf("Execute() error = %v", err)
	}
	if got, want := out.String(), Version+"\n"; got != want {
		t.Fatalf("output = %q, want %q", got, want)
	}
}

func TestRootCommandRegistersCommandGroups(t *testing.T) {
	command := NewRootCommand(nil, nil)
	want := []string{"markets", "prediction-markets", "account", "orders", "stream", "auth"}
	for _, name := range want {
		found := false
		for _, child := range command.Commands() {
			if child.Name() == name {
				found = true
				break
			}
		}
		if !found {
			t.Errorf("root command is missing %q", name)
		}
	}
}

func TestRootCommandRejectsUnknownEnvironment(t *testing.T) {
	var out bytes.Buffer
	command := NewRootCommand(&out, &out)
	command.SetArgs([]string{"--environment", "staging"})
	if err := command.Execute(); err == nil || !strings.Contains(err.Error(), "invalid environment") {
		t.Fatalf("Execute() error = %v, want invalid environment", err)
	}
}
