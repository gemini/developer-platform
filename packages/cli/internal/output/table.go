package output

import (
	"encoding/csv"
	"fmt"
	"io"
	"os"
	"strings"
)

// CSVOutput controls whether tables are rendered as CSV.
var CSVOutput bool

// TableWriter formats data as aligned text tables or CSV.
type TableWriter struct {
	out     io.Writer
	headers []string
	rows    [][]string
	widths  []int
}

// NewTableWriter creates a new table writer with the given column headers.
func NewTableWriter(headers ...string) *TableWriter {
	widths := make([]int, len(headers))
	for i, h := range headers {
		widths[i] = len(h)
	}
	return &TableWriter{
		out:     os.Stdout,
		headers: headers,
		widths:  widths,
	}
}

// AddRow adds a data row to the table.
func (t *TableWriter) AddRow(values ...string) {
	row := make([]string, len(t.headers))
	for i := range row {
		if i < len(values) {
			row[i] = values[i]
		}
		if len(row[i]) > t.widths[i] {
			t.widths[i] = len(row[i])
		}
	}
	t.rows = append(t.rows, row)
}

// Render outputs the table to stdout.
func (t *TableWriter) Render() {
	if CSVOutput {
		t.RenderCSV()
		return
	}

	if len(t.rows) == 0 {
		fmt.Fprintln(t.out, "No results")
		return
	}

	t.printRow(t.headers)
	t.printSeparator()

	for _, row := range t.rows {
		t.printRow(row)
	}
}

// RenderCSV outputs the table as CSV format.
func (t *TableWriter) RenderCSV() {
	w := csv.NewWriter(t.out)
	defer w.Flush()

	_ = w.Write(t.headers)
	for _, row := range t.rows {
		_ = w.Write(row)
	}
}

func (t *TableWriter) printRow(values []string) {
	parts := make([]string, len(values))
	for i, v := range values {
		parts[i] = t.padRight(v, t.widths[i])
	}
	fmt.Fprintln(t.out, strings.Join(parts, "  "))
}

func (t *TableWriter) printSeparator() {
	parts := make([]string, len(t.widths))
	for i, w := range t.widths {
		parts[i] = strings.Repeat("-", w)
	}
	fmt.Fprintln(t.out, strings.Join(parts, "  "))
}

func (t *TableWriter) padRight(s string, width int) string {
	if len(s) >= width {
		return s
	}
	return s + strings.Repeat(" ", width-len(s))
}
