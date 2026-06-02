package cmd_test

import (
	"bytes"
	"os"
	"path/filepath"
	"strings"
	"testing"

	appcmd "github.com/gemini/developer-platform/packages/cli/internal/cmd"
)

func TestBashCompletionGeneration(t *testing.T) {
	var buf bytes.Buffer
	if err := appcmd.RootCommand().GenBashCompletion(&buf); err != nil {
		t.Fatalf("GenBashCompletion() error = %v", err)
	}

	out := buf.String()
	for _, expected := range []string{"gemini-markets", "predict", "spot", "completion"} {
		if !strings.Contains(out, expected) {
			t.Fatalf("bash completion output missing %q", expected)
		}
	}
	for _, removed := range []string{" login ", " logout "} {
		if strings.Contains(out, removed) {
			t.Fatalf("bash completion output should not expose removed root alias %q", removed)
		}
	}
}

func TestManpageGeneration(t *testing.T) {
	dir := t.TempDir()
	if err := appcmd.GenerateManpages(dir); err != nil {
		t.Fatalf("GenerateManpages() error = %v", err)
	}

	path := filepath.Join(dir, "gemini-markets.1")
	if _, err := os.Stat(path); err != nil {
		t.Fatalf("expected manpage %s: %v", path, err)
	}

	for _, removed := range []string{
		"gemini-markets-login.1",
		"gemini-markets-logout.1",
		"gemini-markets-config-test.1",
		"gemini-markets-config.1",
	} {
		if _, err := os.Stat(filepath.Join(dir, removed)); !os.IsNotExist(err) {
			t.Fatalf("manpage for removed command %s should not be generated", removed)
		}
	}
}
