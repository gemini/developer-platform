package debug

import (
	"bytes"
	"os"
	"strings"
	"testing"
)

func TestLog_Enabled(t *testing.T) {
	SetEnabled(true)
	SetQuiet(false)
	defer func() {
		SetEnabled(false)
		SetQuiet(false)
	}()

	old := os.Stderr
	r, w, _ := os.Pipe()
	os.Stderr = w

	Log("test message %d", 42)

	w.Close()
	os.Stderr = old

	var buf bytes.Buffer
	buf.ReadFrom(r)
	output := buf.String()

	if !strings.Contains(output, "[DEBUG]") {
		t.Error("Log should include [DEBUG] prefix when enabled")
	}
	if !strings.Contains(output, "test message 42") {
		t.Error("Log should include formatted message")
	}
}

func TestLog_Disabled(t *testing.T) {
	SetEnabled(false)
	SetQuiet(false)

	old := os.Stderr
	r, w, _ := os.Pipe()
	os.Stderr = w

	Log("should not appear")

	w.Close()
	os.Stderr = old

	var buf bytes.Buffer
	buf.ReadFrom(r)
	output := buf.String()

	if output != "" {
		t.Errorf("Log should not output when disabled, got: %s", output)
	}
}

func TestLog_Quiet(t *testing.T) {
	SetEnabled(true)
	SetQuiet(true)
	defer func() {
		SetEnabled(false)
		SetQuiet(false)
	}()

	old := os.Stderr
	r, w, _ := os.Pipe()
	os.Stderr = w

	Log("should not appear")

	w.Close()
	os.Stderr = old

	var buf bytes.Buffer
	buf.ReadFrom(r)
	output := buf.String()

	if output != "" {
		t.Errorf("Log should not output when quiet, got: %s", output)
	}
}

func TestWarn_Normal(t *testing.T) {
	SetQuiet(false)
	defer func() { SetQuiet(false) }()

	old := os.Stderr
	r, w, _ := os.Pipe()
	os.Stderr = w

	Warn("warning message")

	w.Close()
	os.Stderr = old

	var buf bytes.Buffer
	buf.ReadFrom(r)
	output := buf.String()

	if !strings.Contains(output, "[WARN]") {
		t.Error("Warn should include [WARN] prefix")
	}
	if !strings.Contains(output, "warning message") {
		t.Error("Warn should include message")
	}
}

func TestWarn_Quiet(t *testing.T) {
	SetQuiet(true)
	defer func() { SetQuiet(false) }()

	old := os.Stderr
	r, w, _ := os.Pipe()
	os.Stderr = w

	Warn("should not appear")

	w.Close()
	os.Stderr = old

	var buf bytes.Buffer
	buf.ReadFrom(r)
	output := buf.String()

	if output != "" {
		t.Errorf("Warn should not output when quiet, got: %s", output)
	}
}

func TestSanitize(t *testing.T) {
	tests := []struct {
		name     string
		input    string
		expected string
	}{
		{
			name:     "api_key in url",
			input:    "request to url?api_key=abc123secretkey",
			expected: "request to url?api_key[REDACTED]",
		},
		{
			name:     "bearer token",
			input:    "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9",
			expected: "Authorization: Bearer [REDACTED]",
		},
		{
			name:     "no sensitive data",
			input:    "GET /v1/symbols returned 200",
			expected: "GET /v1/symbols returned 200",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := sanitize(tt.input)
			if result != tt.expected {
				t.Errorf("sanitize(%q) = %q, want %q", tt.input, result, tt.expected)
			}
		})
	}
}
