package types_test

import (
	"encoding/json"
	"errors"
	"testing"

	"github.com/gemini/gemini-go/types"
)

func TestDecimal_Arithmetic(t *testing.T) {
	d1, err := types.ParseDecimal("0.1")
	if err != nil {
		t.Fatalf("unexpected parse err: %v", err)
	}

	d2 := types.MustParseDecimal("0.2")

	// In IEEE-754 float64, 0.1 + 0.2 != 0.3
	// In types.Decimal, 0.1 + 0.2 must exactly equal 0.3!
	sum := d1.Add(d2)
	if sum.String() != "0.3" {
		t.Fatalf("expected 0.3, got %s", sum.String())
	}

	diff := sum.Sub(d1)
	if diff.String() != "0.2" {
		t.Fatalf("expected 0.2, got %s", diff.String())
	}

	prod := d1.Mul(d2)
	if prod.String() != "0.02" {
		t.Fatalf("expected 0.02, got %s", prod.String())
	}

	quo, err := d2.Div(d1)
	if err != nil {
		t.Fatalf("div error: %v", err)
	}
	if quo.String() != "2" {
		t.Fatalf("expected 2, got %s", quo.String())
	}
}

func TestDecimal_RoundToTick(t *testing.T) {
	price := types.MustParseDecimal("64500.12845")
	tickSize := types.MustParseDecimal("0.01")

	rounded := price.RoundToTick(tickSize)
	if rounded.String() != "64500.12" {
		t.Fatalf("expected rounded 64500.12, got %s", rounded.String())
	}
}

func TestDecimal_JSON(t *testing.T) {
	type Order struct {
		Price types.Decimal `json:"price"`
	}

	raw := `{"price":"65432.10"}`
	var o Order
	if err := json.Unmarshal([]byte(raw), &o); err != nil {
		t.Fatalf("failed unmarshaling decimal json: %v", err)
	}
	if o.Price.String() != "65432.1" {
		t.Fatalf("expected 65432.1, got %s", o.Price.String())
	}

	out, err := json.Marshal(o)
	if err != nil {
		t.Fatalf("failed marshaling decimal json: %v", err)
	}
	if string(out) != `{"price":"65432.1"}` {
		t.Fatalf("unexpected json output: %s", string(out))
	}

	var scientific struct {
		Price types.Decimal `json:"price"`
	}
	if err := json.Unmarshal([]byte(`{"price":1e-8}`), &scientific); err != nil {
		t.Fatalf("failed unmarshaling scientific decimal json: %v", err)
	}
	if scientific.Price.String() != "0.00000001" {
		t.Fatalf("expected exact scientific decimal, got %s", scientific.Price.String())
	}
}

func TestDecimalNumber_JSONPreservesNumericWireShape(t *testing.T) {
	type Response struct {
		TickSize types.DecimalNumber `json:"tick_size"`
	}

	var response Response
	if err := json.Unmarshal([]byte(`{"tick_size":0.00000001}`), &response); err != nil {
		t.Fatalf("failed unmarshaling numeric decimal: %v", err)
	}
	if response.TickSize.String() != "0.00000001" {
		t.Fatalf("unexpected decimal value: %s", response.TickSize)
	}

	out, err := json.Marshal(response)
	if err != nil {
		t.Fatalf("failed marshaling numeric decimal: %v", err)
	}
	if string(out) != `{"tick_size":0.00000001}` {
		t.Fatalf("numeric decimal was not preserved: %s", out)
	}

	if err := json.Unmarshal([]byte(`{"tick_size":"1.25"}`), &response); err != nil {
		t.Fatalf("failed accepting legacy quoted decimal: %v", err)
	}
	out, err = json.Marshal(response)
	if err != nil {
		t.Fatalf("failed marshaling legacy quoted decimal: %v", err)
	}
	if string(out) != `{"tick_size":1.25}` {
		t.Fatalf("quoted input was not normalized to numeric output: %s", out)
	}
}

func TestDecimal_DivisionByZero(t *testing.T) {
	d := types.MustParseDecimal("100.5")
	_, err := d.Div(types.Zero())
	if err == nil || !errors.Is(err, types.ErrDivisionByZero) {
		t.Fatalf("expected ErrDivisionByZero, got %v", err)
	}
}

func TestDecimal_DivisionRejectsUnsafePrecision(t *testing.T) {
	d := types.MustParseDecimal("1")
	for _, precision := range []int32{1_001, int32(1<<31 - 1)} {
		_, err := d.Div(types.MustParseDecimal("3"), precision)
		if !errors.Is(err, types.ErrInvalidDecimalPrecision) {
			t.Fatalf("Div precision %d error = %v, want ErrInvalidDecimalPrecision", precision, err)
		}
	}
}

func TestDecimal_InvalidStrings(t *testing.T) {
	invalidInputs := []string{
		"",
		"abc",
		"12.34.56",
		"100e",
		"1e2e3",
		"--50",
		"12-34",
		".",
		"-.",
	}

	for _, input := range invalidInputs {
		_, err := types.ParseDecimal(input)
		if err == nil {
			t.Errorf("expected error for invalid input %q, got nil", input)
		}
	}
}

func TestDecimal_ScientificNotation(t *testing.T) {
	tests := map[string]string{
		"1e3":     "1000",
		"1.25e2":  "125",
		"-2.5e-2": "-0.025",
		".5e1":    "5",
	}
	for input, expected := range tests {
		t.Run(input, func(t *testing.T) {
			got, err := types.ParseDecimal(input)
			if err != nil {
				t.Fatalf("ParseDecimal(%q): %v", input, err)
			}
			if got.String() != expected {
				t.Fatalf("ParseDecimal(%q) = %q, want %q", input, got.String(), expected)
			}
		})
	}
}

func TestDecimal_AcceptsBoundaryDecimalSyntax(t *testing.T) {
	for input, expected := range map[string]string{
		".5":        "0.5",
		"1.":        "1",
		"  -0.25  ": "-0.25",
	} {
		got, err := types.ParseDecimal(input)
		if err != nil {
			t.Fatalf("ParseDecimal(%q) failed: %v", input, err)
		}
		if got.String() != expected {
			t.Errorf("ParseDecimal(%q) = %s, want %s", input, got, expected)
		}
	}
}

func TestDecimal_ComparisonsAndSigns(t *testing.T) {
	dPos := types.MustParseDecimal("10.5")
	dNeg := types.MustParseDecimal("-10.5")
	dZero := types.Zero()

	if !(dPos.Cmp(dNeg) > 0) {
		t.Errorf("expected %s > %s", dPos, dNeg)
	}
	if !(dNeg.Cmp(dPos) < 0) {
		t.Errorf("expected %s < %s", dNeg, dPos)
	}
	if dPos.Cmp(types.MustParseDecimal("10.500")) != 0 {
		t.Errorf("expected 10.5 == 10.500")
	}

	if !dNeg.IsNegative() {
		t.Errorf("expected %s to be negative", dNeg)
	}
	if dPos.IsNegative() {
		t.Errorf("expected %s to not be negative", dPos)
	}
	if !dZero.IsZero() {
		t.Errorf("expected dZero.IsZero() == true")
	}
}

func TestDecimal_NegativeNumbers(t *testing.T) {
	d1 := types.MustParseDecimal("-50.25")
	d2 := types.MustParseDecimal("20.10")

	sum := d1.Add(d2)
	if sum.String() != "-30.15" {
		t.Errorf("expected -30.15, got %s", sum.String())
	}

	prod := d1.Mul(types.MustParseDecimal("-2"))
	if prod.String() != "100.5" {
		t.Errorf("expected 100.5, got %s", prod.String())
	}
}

func TestDecimal_BpsMath(t *testing.T) {
	mid := types.MustParseDecimal("10000.00")

	// +10 bps = +0.10% = 10010.00
	plus10 := mid.AddBps(10.0)
	if plus10.Cmp(types.MustParseDecimal("10010")) != 0 {
		t.Errorf("expected 10010, got %s", plus10.String())
	}

	// -10 bps = -0.10% = 9990.00
	minus10 := mid.SubBps(10.0)
	if minus10.Cmp(types.MustParseDecimal("9990")) != 0 {
		t.Errorf("expected 9990, got %s", minus10.String())
	}

	// Bps diff between 10010 and 10000 should be exactly 10 bps
	diffBps := plus10.BpsDiff(mid)
	if diffBps < 9.99 || diffBps > 10.01 {
		t.Errorf("expected ~10.0 bps diff, got %f", diffBps)
	}
}

func TestDecimal_Quantize(t *testing.T) {
	price := types.MustParseDecimal("65123.4567")
	tick001 := types.MustParseDecimal("0.01")
	tick05 := types.MustParseDecimal("0.05")

	q001 := price.QuantizePrice(tick001)
	if q001.Cmp(types.MustParseDecimal("65123.45")) != 0 {
		t.Errorf("expected 65123.45, got %s", q001.String())
	}

	q05 := price.QuantizePrice(tick05)
	if q05.Cmp(types.MustParseDecimal("65123.45")) != 0 {
		t.Errorf("expected 65123.45, got %s", q05.String())
	}

	amount := types.MustParseDecimal("1.234567")
	lot0001 := types.MustParseDecimal("0.001")
	qLot := amount.QuantizeAmount(lot0001)
	if qLot.Cmp(types.MustParseDecimal("1.234")) != 0 {
		t.Errorf("expected 1.234, got %s", qLot.String())
	}
}

func TestDecimal_QuantizeRejectsInvalidTickAndRoundsNegativeDown(t *testing.T) {
	value := types.MustParseDecimal("1.23")
	if got := value.Quantize(types.Zero()); got.Cmp(value) != 0 {
		t.Fatalf("invalid zero tick changed value to %s", got)
	}
	negative := types.MustParseDecimal("-1.23")
	if got := negative.Quantize(types.MustParseDecimal("0.1")); got.Cmp(types.MustParseDecimal("-1.3")) != 0 {
		t.Fatalf("expected negative quantization to round down to -1.3, got %s", got)
	}
}

func TestDecimal_Float64CheckedReportsOverflow(t *testing.T) {
	value := types.NewDecimal(1, -1000)
	if _, err := value.Float64Checked(); err == nil {
		t.Fatal("expected Float64Checked to report overflow")
	}
}

func TestDecimal_NewDecimalCheckedRejectsUnsafeScale(t *testing.T) {
	if _, err := types.NewDecimalChecked(1, 1_000_001); !errors.Is(err, types.ErrInvalidDecimalScale) {
		t.Fatalf("expected ErrInvalidDecimalScale, got %v", err)
	}
	if _, err := types.NewDecimalChecked(1, -1_000_001); !errors.Is(err, types.ErrInvalidDecimalScale) {
		t.Fatalf("expected ErrInvalidDecimalScale, got %v", err)
	}
}

func TestDecimal_AbsNeg(t *testing.T) {
	pos := types.MustParseDecimal("42.50")
	neg := types.MustParseDecimal("-42.50")
	zero := types.Zero()

	if pos.Neg().Cmp(neg) != 0 {
		t.Errorf("expected -42.50, got %s", pos.Neg().String())
	}
	if neg.Abs().Cmp(pos) != 0 {
		t.Errorf("expected 42.50, got %s", neg.Abs().String())
	}
	if zero.Abs().Cmp(zero) != 0 {
		t.Errorf("expected 0, got %s", zero.Abs().String())
	}

	if pos.Sign() != 1 || neg.Sign() != -1 || zero.Sign() != 0 {
		t.Errorf("unexpected Sign results: pos=%d, neg=%d, zero=%d", pos.Sign(), neg.Sign(), zero.Sign())
	}

	if types.Min(pos, neg).Cmp(neg) != 0 {
		t.Errorf("expected Min to return neg")
	}
	if types.Max(pos, neg).Cmp(pos) != 0 {
		t.Errorf("expected Max to return pos")
	}
}

func TestDecimal_TextMarshal(t *testing.T) {
	d := types.MustParseDecimal("123.456")
	text, err := d.MarshalText()
	if err != nil {
		t.Fatalf("MarshalText failed: %v", err)
	}
	if string(text) != "123.456" {
		t.Fatalf("expected '123.456', got '%s'", string(text))
	}

	var d2 types.Decimal
	if err := d2.UnmarshalText(text); err != nil {
		t.Fatalf("UnmarshalText failed: %v", err)
	}
	if d2.Cmp(d) != 0 {
		t.Fatalf("expected %s, got %s", d.String(), d2.String())
	}

	var d3 types.Decimal
	if err := d3.UnmarshalText([]byte("null")); err != nil {
		t.Fatalf("UnmarshalText null failed: %v", err)
	}
	if !d3.IsZero() {
		t.Fatalf("expected zero for null, got %s", d3.String())
	}
}

func TestDecimal_UnmarshalJSONRejectsMalformedJSON(t *testing.T) {
	for _, input := range []string{`"1.25`, `1.25"`, `true`, `{"value":1}`} {
		var d types.Decimal
		if err := d.UnmarshalJSON([]byte(input)); err == nil {
			t.Errorf("expected malformed JSON %q to fail", input)
		}
	}

	var d types.Decimal
	if err := d.UnmarshalJSON([]byte(`"1.25"`)); err != nil || d.String() != "1.25" {
		t.Fatalf("expected quoted decimal to decode, got %s, %v", d.String(), err)
	}
}

func BenchmarkDecimal_Parse(b *testing.B) {
	b.ReportAllocs()
	for i := 0; i < b.N; i++ {
		_, _ = types.ParseDecimal("64500.12845")
	}
}

func BenchmarkDecimal_Add(b *testing.B) {
	d1 := types.MustParseDecimal("64500.12845")
	d2 := types.MustParseDecimal("123.456")
	b.ResetTimer()
	b.ReportAllocs()
	for i := 0; i < b.N; i++ {
		_ = d1.Add(d2)
	}
}

func BenchmarkDecimal_Mul(b *testing.B) {
	d1 := types.MustParseDecimal("64500.12845")
	d2 := types.MustParseDecimal("1.5")
	b.ResetTimer()
	b.ReportAllocs()
	for i := 0; i < b.N; i++ {
		_ = d1.Mul(d2)
	}
}

func BenchmarkDecimal_String(b *testing.B) {
	d := types.MustParseDecimal("64500.12845")
	b.ResetTimer()
	b.ReportAllocs()
	for i := 0; i < b.N; i++ {
		_ = d.String()
	}
}
