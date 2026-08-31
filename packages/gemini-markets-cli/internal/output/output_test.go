package output

import (
	"bytes"
	"errors"
	"strings"
	"testing"
)

func TestWriteJSON(t *testing.T) {
	var out bytes.Buffer
	if err := Write(&out, map[string]string{"status": "ok"}, JSON); err != nil {
		t.Fatalf("Write() error = %v", err)
	}
	if got, want := out.String(), "{\n  \"status\": \"ok\"\n}\n"; got != want {
		t.Fatalf("Write() = %q, want %q", got, want)
	}
}

func TestWriteTableAndError(t *testing.T) {
	var out bytes.Buffer
	table := TableData{Headers: []string{"SYMBOL", "PRICE"}, Rows: [][]string{{"BTCUSD", "100"}}}
	if err := Write(&out, table, Table); err != nil {
		t.Fatalf("Write() error = %v", err)
	}
	if !strings.Contains(out.String(), "SYMBOL  PRICE") || !strings.Contains(out.String(), "BTCUSD  100") {
		t.Fatalf("Write() = %q, want aligned table", out.String())
	}
	out.Reset()
	if err := WriteError(&out, errors.New("request failed"), JSON); err != nil {
		t.Fatalf("WriteError() error = %v", err)
	}
	if got, want := out.String(), "{\n  \"error\": \"request failed\"\n}\n"; got != want {
		t.Fatalf("WriteError() = %q, want %q", got, want)
	}
}

func TestParseFormat(t *testing.T) {
	for _, test := range []struct {
		input string
		want  Format
	}{
		{"", Table}, {" TABLE ", Table}, {"Json", JSON},
	} {
		got, err := ParseFormat(test.input)
		if err != nil || got != test.want {
			t.Fatalf("ParseFormat(%q) = %q, %v; want %q", test.input, got, err, test.want)
		}
	}
	if _, err := ParseFormat("yaml"); !errors.Is(err, ErrInvalidFormat) {
		t.Fatalf("ParseFormat(yaml) error = %v, want ErrInvalidFormat", err)
	}
}
