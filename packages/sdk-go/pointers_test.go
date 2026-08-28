package gemini_test

import (
	"testing"

	"github.com/gemini/gemini-go"
)

func TestPointerHelpers(t *testing.T) {
	// String
	s := gemini.String("hello")
	if *s != "hello" || gemini.StringValue(s) != "hello" {
		t.Errorf("unexpected string pointer result")
	}
	if gemini.StringValue(nil) != "" {
		t.Errorf("expected empty string for nil")
	}

	// Int
	i := gemini.Int(42)
	if *i != 42 || gemini.IntValue(i) != 42 {
		t.Errorf("unexpected int pointer result")
	}
	if gemini.IntValue(nil) != 0 {
		t.Errorf("expected 0 for nil int")
	}

	// Int32
	i32 := gemini.Int32(100)
	if *i32 != 100 || gemini.Int32Value(i32) != 100 {
		t.Errorf("unexpected int32 pointer result")
	}
	if gemini.Int32Value(nil) != 0 {
		t.Errorf("expected 0 for nil int32")
	}

	// Int64
	i64 := gemini.Int64(1000)
	if *i64 != 1000 || gemini.Int64Value(i64) != 1000 {
		t.Errorf("unexpected int64 pointer result")
	}
	if gemini.Int64Value(nil) != 0 {
		t.Errorf("expected 0 for nil int64")
	}

	// Bool
	b := gemini.Bool(true)
	if *b != true || gemini.BoolValue(b) != true {
		t.Errorf("unexpected bool pointer result")
	}
	if gemini.BoolValue(nil) != false {
		t.Errorf("expected false for nil bool")
	}

	// Float64
	f := gemini.Float64(3.14159)
	if *f != 3.14159 || gemini.Float64Value(f) != 3.14159 {
		t.Errorf("unexpected float64 pointer result")
	}
	if gemini.Float64Value(nil) != 0.0 {
		t.Errorf("expected 0.0 for nil float64")
	}
}
