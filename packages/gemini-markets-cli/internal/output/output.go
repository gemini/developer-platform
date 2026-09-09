// Package output contains the deliberately small rendering seam shared by
// CLI commands. Commands can keep their service results typed and choose JSON
// or table output only at the boundary.
package output

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"strings"
	"text/tabwriter"
)

// Format is a supported CLI output format.
type Format string

const (
	JSON  Format = "json"
	Table Format = "table"
)

var (
	ErrInvalidFormat = errors.New("invalid output format")
	ErrInvalidTable  = errors.New("invalid table output")
)

// ParseFormat validates a user-provided output format. An empty value uses the
// human-readable table format used by the root command.
func ParseFormat(value string) (Format, error) {
	switch Format(strings.ToLower(strings.TrimSpace(value))) {
	case "", Table:
		return Table, nil
	case JSON:
		return JSON, nil
	default:
		return "", fmt.Errorf("%w %q (want json or table)", ErrInvalidFormat, value)
	}
}

// TableData is the format-independent representation used for table output.
type TableData struct {
	Headers []string
	Rows    [][]string
}

// Write renders value using format. JSON values are indented for terminal
// readability and always end in a newline. Table values must be TableData (or
// *TableData), which keeps command-specific row formatting explicit.
func Write(w io.Writer, value any, format Format) error {
	if w == nil {
		return errors.New("output writer is nil")
	}
	switch format {
	case JSON:
		encoder := json.NewEncoder(w)
		encoder.SetIndent("", "  ")
		return encoder.Encode(value)
	case Table:
		switch table := value.(type) {
		case TableData:
			return RenderTable(w, table)
		case *TableData:
			if table == nil {
				return fmt.Errorf("%w: table is nil", ErrInvalidTable)
			}
			return RenderTable(w, *table)
		default:
			return fmt.Errorf("%w: got %T, want output.TableData", ErrInvalidTable, value)
		}
	default:
		return fmt.Errorf("%w %q", ErrInvalidFormat, format)
	}
}

// RenderTable writes a compact, aligned table. Rows shorter than the header
// are padded; extra cells are rejected because silently hiding a value is a
// poor terminal failure mode.
func RenderTable(w io.Writer, table TableData) error {
	if w == nil {
		return errors.New("output writer is nil")
	}
	if len(table.Headers) == 0 {
		return fmt.Errorf("%w: at least one header is required", ErrInvalidTable)
	}
	for i, row := range table.Rows {
		if len(row) > len(table.Headers) {
			return fmt.Errorf("%w: row %d has %d cells, want at most %d", ErrInvalidTable, i, len(row), len(table.Headers))
		}
	}
	tw := tabwriter.NewWriter(w, 0, 4, 2, ' ', 0)
	if _, err := fmt.Fprintln(tw, strings.Join(table.Headers, "\t")); err != nil {
		return err
	}
	for _, row := range table.Rows {
		cells := make([]string, len(table.Headers))
		copy(cells, row)
		if _, err := fmt.Fprintln(tw, strings.Join(cells, "\t")); err != nil {
			return err
		}
	}
	return tw.Flush()
}

// WriteError emits a stable, secret-free error envelope. The underlying
// error is intentionally represented only by its message; commands should
// wrap errors with operation context before they reach this boundary.
func WriteError(w io.Writer, err error, format Format) error {
	if err == nil {
		err = errors.New("unknown error")
	}
	if format == JSON {
		return Write(w, struct {
			Error string `json:"error"`
		}{Error: err.Error()}, JSON)
	}
	if format != Table {
		return fmt.Errorf("%w %q", ErrInvalidFormat, format)
	}
	_, writeErr := fmt.Fprintf(w, "Error: %s\n", err)
	return writeErr
}
