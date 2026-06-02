package cmd_test

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"

	appcmd "github.com/gemini/developer-platform/packages/cli/internal/cmd"
	"github.com/gemini/developer-platform/packages/cli/internal/output"
)

func TestCLIHelperProcess(t *testing.T) {
	if os.Getenv("GO_WANT_HELPER_PROCESS") != "1" {
		return
	}

	sep := -1
	for i, arg := range os.Args {
		if arg == "--" {
			sep = i
			break
		}
	}
	if sep == -1 {
		fmt.Fprintln(os.Stderr, "missing argument separator")
		os.Exit(2)
	}

	root := appcmd.RootCommand()
	root.SetArgs(os.Args[sep+1:])
	if err := root.Execute(); err != nil {
		var cliErr *output.CLIError
		if errors.As(err, &cliErr) {
			os.Exit(cliErr.ExitCode())
		}
		fmt.Fprintf(os.Stderr, "Error: %v\n", err)
		os.Exit(1)
	}
	os.Exit(0)
}

func TestCLIProcessSpecErrorsGolden(t *testing.T) {
	stdout, stderr, err := runCLIProcess(t, "spec", "--section", "errors", "-q")
	if err != nil {
		t.Fatalf("runCLIProcess() error = %v\nstderr:\n%s", err, stderr)
	}
	if stderr != "" {
		t.Fatalf("stderr = %q, want empty", stderr)
	}

	assertGoldenFile(t, "spec-errors.golden", []byte(stdout))
}

func TestCLIProcessAgentMCP(t *testing.T) {
	stdout, stderr, err := runCLIProcess(t, "agent", "--format", "mcp", "-q")
	if err != nil {
		t.Fatalf("runCLIProcess() error = %v\nstderr:\n%s", err, stderr)
	}
	if stderr != "" {
		t.Fatalf("stderr = %q, want empty", stderr)
	}

	var parsed map[string]any
	if err := json.Unmarshal([]byte(stdout), &parsed); err != nil {
		t.Fatalf("json.Unmarshal() error = %v", err)
	}
	if parsed["name"] != "gemini-markets" {
		t.Fatalf("name = %v, want gemini-markets", parsed["name"])
	}
	if parsed["toolCount"] == nil {
		t.Fatal("toolCount missing from agent mcp output")
	}
}

func TestCLIProcessAuthStatusBearerEnv(t *testing.T) {
	stdout, stderr, err := runCLIProcessWithEnv(t, []string{
		"GEMINI_ACCESS_TOKEN=test-access-token",
		"GEMINI_ENVIRONMENT=sandbox",
	}, "auth", "status", "-q")
	if err != nil {
		t.Fatalf("runCLIProcessWithEnv() error = %v\nstderr:\n%s", err, stderr)
	}
	if stderr != "" {
		t.Fatalf("stderr = %q, want empty", stderr)
	}

	var parsed map[string]any
	if err := json.Unmarshal([]byte(stdout), &parsed); err != nil {
		t.Fatalf("json.Unmarshal() error = %v", err)
	}
	if parsed["auth_type"] != "bearer_env" {
		t.Fatalf("auth_type = %v, want bearer_env", parsed["auth_type"])
	}
	if parsed["environment"] != "sandbox" {
		t.Fatalf("environment = %v, want sandbox", parsed["environment"])
	}
	if parsed["authenticated"] != true {
		t.Fatalf("authenticated = %v, want true", parsed["authenticated"])
	}
	if parsed["status_scope"] != "metadata" {
		t.Fatalf("status_scope = %v, want metadata", parsed["status_scope"])
	}
	if parsed["validation_command"] != "gemini-markets auth test" {
		t.Fatalf("validation_command = %v, want gemini-markets auth test", parsed["validation_command"])
	}
}

func TestCLIProcessAuthStatusNoCredentials(t *testing.T) {
	setTempConfigDir(t)
	stdout, stderr, err := runCLIProcessWithEnv(t, []string{
		"GEMINI_NO_KEYRING=1",
		"GEMINI_ACCESS_TOKEN=",
		"GEMINI_API_KEY=",
		"GEMINI_API_SECRET=",
	}, "auth", "status", "-q")
	if err != nil {
		t.Fatalf("runCLIProcessWithEnv() error = %v\nstderr:\n%s", err, stderr)
	}
	if stderr != "" {
		t.Fatalf("stderr = %q, want empty", stderr)
	}

	var parsed map[string]any
	if err := json.Unmarshal([]byte(stdout), &parsed); err != nil {
		t.Fatalf("json.Unmarshal() error = %v", err)
	}
	if parsed["authenticated"] != false {
		t.Fatalf("authenticated = %v, want false", parsed["authenticated"])
	}
	if parsed["auth_type"] != "none" {
		t.Fatalf("auth_type = %v, want none", parsed["auth_type"])
	}
}

func TestCLIProcessAuthTestRequiresCredentials(t *testing.T) {
	setTempConfigDir(t)
	stdout, stderr, err := runCLIProcessWithEnv(t, []string{
		"GEMINI_NO_KEYRING=1",
		"GEMINI_ACCESS_TOKEN=",
		"GEMINI_API_KEY=",
		"GEMINI_API_SECRET=",
	}, "auth", "test", "-q")
	if err == nil {
		t.Fatal("expected auth test to fail without credentials")
	}
	if stderr != "" {
		t.Fatalf("stderr = %q, want empty", stderr)
	}

	var parsed map[string]any
	if err := json.Unmarshal([]byte(stdout), &parsed); err != nil {
		t.Fatalf("json.Unmarshal() error = %v", err)
	}
	errPayload, _ := parsed["error"].(map[string]any)
	if errPayload == nil {
		t.Fatalf("missing error payload: %s", stdout)
	}
	if errPayload["code"] != "AUTH_REQUIRED" {
		t.Fatalf("error.code = %v, want AUTH_REQUIRED", errPayload["code"])
	}
}

func TestCLIProcessFeaturedMarketsRemoved(t *testing.T) {
	stdout, stderr, err := runCLIProcessWithEnv(t, []string{
		"GEMINI_NO_KEYRING=1",
		"GEMINI_ACCESS_TOKEN=",
		"GEMINI_API_KEY=",
		"GEMINI_API_SECRET=",
	}, "predict", "markets", "featured", "-q")
	if err == nil {
		t.Fatal("expected removed featured command to fail")
	}
	if stderr != "" {
		t.Fatalf("stderr = %q, want empty", stderr)
	}

	var parsed map[string]any
	if err := json.Unmarshal([]byte(stdout), &parsed); err != nil {
		t.Fatalf("json.Unmarshal() error = %v", err)
	}
	errPayload, _ := parsed["error"].(map[string]any)
	if errPayload == nil {
		t.Fatalf("missing error payload: %s", stdout)
	}
	if errPayload["code"] != "INVALID_INPUT" {
		t.Fatalf("error.code = %v, want INVALID_INPUT", errPayload["code"])
	}
	if !strings.Contains(errPayload["message"].(string), "featured") {
		t.Fatalf("error.message missing featured text: %s", stdout)
	}
}

func TestCLIProcessAuthLogoutBearerEnv(t *testing.T) {
	stdout, stderr, err := runCLIProcessWithEnv(t, []string{
		"GEMINI_ACCESS_TOKEN=test-access-token",
	}, "auth", "logout", "-q")
	if err == nil {
		t.Fatal("expected auth logout to fail for env-backed bearer auth")
	}
	if stderr != "" {
		t.Fatalf("stderr = %q, want empty", stderr)
	}

	var parsed map[string]any
	if err := json.Unmarshal([]byte(stdout), &parsed); err != nil {
		t.Fatalf("json.Unmarshal() error = %v", err)
	}
	errPayload, _ := parsed["error"].(map[string]any)
	if errPayload == nil {
		t.Fatalf("missing error payload: %s", stdout)
	}
	if errPayload["code"] != "AUTH_REQUIRED" {
		t.Fatalf("error.code = %v, want AUTH_REQUIRED", errPayload["code"])
	}
	if !strings.Contains(errPayload["suggestion"].(string), "GEMINI_ACCESS_TOKEN") {
		t.Fatalf("suggestion missing GEMINI_ACCESS_TOKEN guidance: %s", stdout)
	}
}

func TestCLIProcessAuthLogoutHMACEnv(t *testing.T) {
	stdout, stderr, err := runCLIProcessWithEnv(t, []string{
		"GEMINI_API_KEY=account-test-key-123456",
		"GEMINI_API_SECRET=test-secret-123456",
	}, "auth", "logout", "-q")
	if err == nil {
		t.Fatal("expected auth logout to fail for env-backed HMAC auth")
	}
	if stderr != "" {
		t.Fatalf("stderr = %q, want empty", stderr)
	}

	var parsed map[string]any
	if err := json.Unmarshal([]byte(stdout), &parsed); err != nil {
		t.Fatalf("json.Unmarshal() error = %v", err)
	}
	errPayload, _ := parsed["error"].(map[string]any)
	if errPayload == nil {
		t.Fatalf("missing error payload: %s", stdout)
	}
	if errPayload["code"] != "AUTH_REQUIRED" {
		t.Fatalf("error.code = %v, want AUTH_REQUIRED", errPayload["code"])
	}
	if !strings.Contains(errPayload["suggestion"].(string), "GEMINI_API_KEY") {
		t.Fatalf("suggestion missing GEMINI_API_KEY guidance: %s", stdout)
	}
}

func TestCLIProcessAgentOpenAI(t *testing.T) {
	stdout, stderr, err := runCLIProcess(t, "agent", "--format", "openai", "-q")
	if err != nil {
		t.Fatalf("runCLIProcess() error = %v\nstderr:\n%s", err, stderr)
	}
	if stderr != "" {
		t.Fatalf("stderr = %q, want empty", stderr)
	}

	var parsed map[string]any
	if err := json.Unmarshal([]byte(stdout), &parsed); err != nil {
		t.Fatalf("json.Unmarshal() error = %v", err)
	}
	funcs, _ := parsed["functions"].([]any)
	if len(funcs) == 0 {
		t.Fatal("expected at least one OpenAI function definition")
	}
}

func TestCLIProcessAgentAnthropic(t *testing.T) {
	stdout, stderr, err := runCLIProcess(t, "agent", "--format", "anthropic", "-q")
	if err != nil {
		t.Fatalf("runCLIProcess() error = %v\nstderr:\n%s", err, stderr)
	}
	if stderr != "" {
		t.Fatalf("stderr = %q, want empty", stderr)
	}

	var parsed map[string]any
	if err := json.Unmarshal([]byte(stdout), &parsed); err != nil {
		t.Fatalf("json.Unmarshal() error = %v", err)
	}
	tools, _ := parsed["tools"].([]any)
	if len(tools) == 0 {
		t.Fatal("expected at least one Anthropic tool definition")
	}
}

func TestCLIProcessCompletionBash(t *testing.T) {
	stdout, stderr, err := runCLIProcess(t, "completion", "bash")
	if err != nil {
		t.Fatalf("runCLIProcess() error = %v\nstderr:\n%s", err, stderr)
	}
	if stderr != "" {
		t.Fatalf("stderr = %q, want empty", stderr)
	}

	for _, expected := range []string{"gemini-markets", "predict", "doctor"} {
		if !strings.Contains(stdout, expected) {
			t.Fatalf("completion output missing %q", expected)
		}
	}
}

func TestCLIProcessInvalidSpecSection(t *testing.T) {
	stdout, stderr, err := runCLIProcess(t, "spec", "--section", "not-a-section")
	if err == nil {
		t.Fatal("expected error for invalid spec section")
	}
	if stderr != "" {
		t.Fatalf("stderr = %q, want empty", stderr)
	}

	var parsed map[string]any
	if err := json.Unmarshal([]byte(stdout), &parsed); err != nil {
		t.Fatalf("json.Unmarshal() error = %v", err)
	}

	success, _ := parsed["success"].(bool)
	if success {
		t.Fatalf("success = true, want false: %s", stdout)
	}

	errPayload, _ := parsed["error"].(map[string]any)
	if errPayload == nil {
		t.Fatalf("missing error payload: %s", stdout)
	}
	if errPayload["code"] != "INVALID_INPUT" {
		t.Fatalf("error.code = %v, want INVALID_INPUT", errPayload["code"])
	}
	if !strings.Contains(errPayload["message"].(string), "invalid section") {
		t.Fatalf("error.message missing invalid section text: %s", stdout)
	}
}

func runCLIProcess(t *testing.T, args ...string) (stdout string, stderr string, err error) {
	t.Helper()
	return runCLIProcessWithEnv(t, nil, args...)
}

func runCLIProcessWithEnv(t *testing.T, extraEnv []string, args ...string) (stdout string, stderr string, err error) {
	t.Helper()

	cmdArgs := append([]string{"-test.run=^TestCLIHelperProcess$", "--"}, args...)
	cmd := exec.Command(os.Args[0], cmdArgs...)
	cmd.Env = append(os.Environ(),
		"GO_WANT_HELPER_PROCESS=1",
		"GEMINI_SKIP_UPDATE_CHECK=1",
	)
	cmd.Env = append(cmd.Env, extraEnv...)

	out, runErr := cmd.Output()
	stdout = string(out)
	if runErr == nil {
		return stdout, "", nil
	}

	var exitErr *exec.ExitError
	if errors.As(runErr, &exitErr) {
		return stdout, string(exitErr.Stderr), runErr
	}

	return stdout, "", runErr
}

func TestCLIProcessGoldenFixturesExist(t *testing.T) {
	for _, name := range []string{"spec-errors.golden", "doctor-help.golden"} {
		path := filepath.Join("testdata", name)
		if _, err := os.Stat(path); err != nil {
			t.Fatalf("expected golden fixture %s: %v", path, err)
		}
	}
}

func setTempConfigDir(t *testing.T) {
	t.Helper()
	tmpDir := t.TempDir()
	t.Setenv("HOME", tmpDir)
	t.Setenv("USERPROFILE", tmpDir)
	t.Setenv("APPDATA", filepath.Join(tmpDir, "AppData", "Roaming"))
	t.Setenv("XDG_CONFIG_HOME", filepath.Join(tmpDir, ".config"))
}

func assertGoldenFile(t *testing.T, filename string, got []byte) {
	t.Helper()

	path := filepath.Join("testdata", filename)
	want, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("ReadFile(%s) error = %v", path, err)
	}
	// Normalize CRLF to LF so Windows runners match Unix golden files.
	normalize := func(b []byte) []byte { return bytes.ReplaceAll(b, []byte("\r\n"), []byte("\n")) }
	if !bytes.Equal(normalize(got), normalize(want)) {
		t.Fatalf("golden mismatch for %s\n\nwant:\n%s\n\ngot:\n%s", filename, string(want), string(got))
	}
}
