//go:build integration

package cmd_test

import (
	"encoding/json"
	"os"
	"testing"
)

func TestSandboxSmokeSuite(t *testing.T) {
	if os.Getenv("GEMINI_SANDBOX_SMOKE") != "1" {
		t.Skip("set GEMINI_SANDBOX_SMOKE=1 to run sandbox smoke tests")
	}

	tests := [][]string{
		{"--sandbox", "status", "-q"},
		{"--sandbox", "auth", "status", "-q"},
		{"--sandbox", "predict", "markets", "list", "--status", "active", "--limit", "1", "-q"},
		{"--sandbox", "doctor", "-q"},
	}

	for _, args := range tests {
		stdout, stderr, err := runCLIProcess(t, args...)
		if err != nil {
			t.Fatalf("sandbox smoke failed for %v: %v\nstdout:\n%s\nstderr:\n%s", args, err, stdout, stderr)
		}
		if stderr != "" {
			t.Fatalf("sandbox smoke stderr for %v:\n%s", args, stderr)
		}
		if stdout == "" {
			t.Fatalf("sandbox smoke empty stdout for %v", args)
		}
		assertSandboxOutput(t, args, stdout)
	}
}

func assertSandboxOutput(t *testing.T, args []string, stdout string) {
	t.Helper()

	var parsed map[string]any
	if err := json.Unmarshal([]byte(stdout), &parsed); err != nil {
		return
	}

	if env, ok := parsed["environment"].(string); ok && env != "sandbox" {
		t.Fatalf("sandbox smoke environment for %v = %q, want sandbox", args, env)
	}
}
