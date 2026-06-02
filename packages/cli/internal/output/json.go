package output

import (
	"encoding/json"
	"fmt"
	"os"
)

// RawOutput controls whether JSON output is compacted (no indentation).
var RawOutput bool

// PrintJSON prints a value as pretty-printed JSON to stdout.
func PrintJSON(v any) error {
	if RawOutput {
		return PrintJSONCompact(v)
	}
	enc := json.NewEncoder(os.Stdout)
	enc.SetIndent("", "  ")
	return enc.Encode(v)
}

// PrintJSONCompact prints a value as compact JSON (single line) to stdout.
func PrintJSONCompact(v any) error {
	data, err := json.Marshal(v)
	if err != nil {
		return err
	}
	fmt.Println(string(data))
	return nil
}
