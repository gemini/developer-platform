package output

import (
	"bytes"
	"os"
	"strings"
	"testing"
)

func TestPrintJSON_Pretty(t *testing.T) {
	RawOutput = false
	defer func() { RawOutput = false }()

	old := os.Stdout
	r, w, _ := os.Pipe()
	os.Stdout = w

	data := map[string]string{"key": "value"}
	err := PrintJSON(data)

	w.Close()
	os.Stdout = old

	if err != nil {
		t.Fatalf("PrintJSON error: %v", err)
	}

	var buf bytes.Buffer
	buf.ReadFrom(r)
	output := buf.String()

	// Pretty print should have indentation
	if !strings.Contains(output, "  ") {
		t.Error("Pretty JSON should have indentation")
	}
	if !strings.Contains(output, "\"key\"") {
		t.Error("JSON should contain key")
	}
}

func TestPrintJSON_Raw(t *testing.T) {
	RawOutput = true
	defer func() { RawOutput = false }()

	old := os.Stdout
	r, w, _ := os.Pipe()
	os.Stdout = w

	data := map[string]string{"key": "value"}
	err := PrintJSON(data)

	w.Close()
	os.Stdout = old

	if err != nil {
		t.Fatalf("PrintJSON error: %v", err)
	}

	var buf bytes.Buffer
	buf.ReadFrom(r)
	output := strings.TrimSpace(buf.String())

	// Raw output should be compact (no newlines within JSON)
	expected := `{"key":"value"}`
	if output != expected {
		t.Errorf("Raw JSON = %v, want %v", output, expected)
	}
}

func TestPrintJSONCompact(t *testing.T) {
	old := os.Stdout
	r, w, _ := os.Pipe()
	os.Stdout = w

	data := map[string]any{"number": 42, "text": "hello"}
	err := PrintJSONCompact(data)

	w.Close()
	os.Stdout = old

	if err != nil {
		t.Fatalf("PrintJSONCompact error: %v", err)
	}

	var buf bytes.Buffer
	buf.ReadFrom(r)
	output := strings.TrimSpace(buf.String())

	// Should be compact, single line
	if strings.Contains(output, "\n") {
		t.Error("Compact JSON should not contain newlines")
	}
	if !strings.Contains(output, "\"number\":42") {
		t.Error("JSON should contain number field")
	}
}
