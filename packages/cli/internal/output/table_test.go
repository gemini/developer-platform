package output

import (
	"bytes"
	"strings"
	"testing"
)

func TestNewTableWriter(t *testing.T) {
	tw := NewTableWriter("Name", "Value", "Description")

	if len(tw.headers) != 3 {
		t.Errorf("headers count = %d, want 3", len(tw.headers))
	}

	if tw.headers[0] != "Name" {
		t.Errorf("headers[0] = %q, want %q", tw.headers[0], "Name")
	}
}

func TestTableWriter_AddRow(t *testing.T) {
	tw := NewTableWriter("Col1", "Col2")
	tw.AddRow("a", "b")
	tw.AddRow("longer", "values")

	if len(tw.rows) != 2 {
		t.Errorf("rows count = %d, want 2", len(tw.rows))
	}

	// Width should expand for longer values
	if tw.widths[0] < 6 {
		t.Errorf("widths[0] = %d, want >= 6", tw.widths[0])
	}
}

func TestTableWriter_AddRow_Partial(t *testing.T) {
	tw := NewTableWriter("Col1", "Col2", "Col3")
	tw.AddRow("only", "two")

	if len(tw.rows) != 1 {
		t.Fatalf("rows count = %d, want 1", len(tw.rows))
	}

	// Should pad to header count
	if len(tw.rows[0]) != 3 {
		t.Errorf("row length = %d, want 3", len(tw.rows[0]))
	}

	if tw.rows[0][2] != "" {
		t.Errorf("row[2] = %q, want empty", tw.rows[0][2])
	}
}

func TestTableWriter_Render(t *testing.T) {
	tw := NewTableWriter("Name", "Age")
	buf := &bytes.Buffer{}
	tw.out = buf

	tw.AddRow("Alice", "30")
	tw.AddRow("Bob", "25")
	tw.Render()

	output := buf.String()

	// Should contain headers
	if !strings.Contains(output, "Name") {
		t.Error("output should contain header 'Name'")
	}

	// Should contain separator
	if !strings.Contains(output, "----") {
		t.Error("output should contain separator")
	}

	// Should contain data
	if !strings.Contains(output, "Alice") {
		t.Error("output should contain 'Alice'")
	}
	if !strings.Contains(output, "Bob") {
		t.Error("output should contain 'Bob'")
	}
}

func TestTableWriter_Render_Empty(t *testing.T) {
	tw := NewTableWriter("Name", "Age")
	buf := &bytes.Buffer{}
	tw.out = buf

	tw.Render()

	output := buf.String()
	if !strings.Contains(output, "No results") {
		t.Errorf("empty table should show 'No results', got %q", output)
	}
}

func TestTableWriter_RenderCSV(t *testing.T) {
	tw := NewTableWriter("Name", "Age")
	buf := &bytes.Buffer{}
	tw.out = buf

	tw.AddRow("Alice", "30")
	tw.AddRow("Bob", "25")
	tw.RenderCSV()

	output := buf.String()
	lines := strings.Split(strings.TrimSpace(output), "\n")

	if len(lines) != 3 {
		t.Errorf("CSV should have 3 lines, got %d", len(lines))
	}

	// Header line
	if lines[0] != "Name,Age" {
		t.Errorf("CSV header = %q, want %q", lines[0], "Name,Age")
	}

	// Data lines
	if lines[1] != "Alice,30" {
		t.Errorf("CSV row 1 = %q, want %q", lines[1], "Alice,30")
	}
}

func TestTableWriter_PadRight(t *testing.T) {
	tw := NewTableWriter()

	tests := []struct {
		input  string
		width  int
		expect string
	}{
		{"abc", 5, "abc  "},
		{"abc", 3, "abc"},
		{"abc", 2, "abc"}, // doesn't truncate
		{"", 3, "   "},
	}

	for _, tt := range tests {
		got := tw.padRight(tt.input, tt.width)
		if got != tt.expect {
			t.Errorf("padRight(%q, %d) = %q, want %q", tt.input, tt.width, got, tt.expect)
		}
	}
}

func TestCSVOutput_Flag(t *testing.T) {
	// Save original
	origCSV := CSVOutput
	defer func() { CSVOutput = origCSV }()

	tw := NewTableWriter("A", "B")
	buf := &bytes.Buffer{}
	tw.out = buf
	tw.AddRow("1", "2")

	// Test table output
	CSVOutput = false
	tw.Render()
	tableOutput := buf.String()

	buf.Reset()

	// Test CSV output via flag
	CSVOutput = true
	tw.Render()
	csvOutput := buf.String()

	if tableOutput == csvOutput {
		t.Error("table and CSV output should differ")
	}

	if !strings.Contains(csvOutput, "1,2") {
		t.Errorf("CSV output should contain '1,2', got %q", csvOutput)
	}
}
