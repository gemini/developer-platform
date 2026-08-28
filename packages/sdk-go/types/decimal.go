package types

import (
	"bytes"
	"encoding/json"
	"errors"
	"math/big"
	"strconv"
	"strings"
)

var (
	// ErrDivisionByZero is returned when a decimal division has a zero divisor.
	ErrDivisionByZero = errors.New("gemini types: division by zero")
	// ErrInvalidDecimal is returned when input is not a supported decimal value.
	ErrInvalidDecimal = errors.New("gemini types: invalid decimal string")
	// ErrInvalidDecimalScale is returned when a decimal scale is outside the
	// bounded range supported by the SDK.
	ErrInvalidDecimalScale = errors.New("gemini types: invalid decimal scale")
	// ErrInvalidDecimalPrecision is returned when an arithmetic operation asks
	// for an unsafe amount of decimal precision.
	ErrInvalidDecimalPrecision = errors.New("gemini types: invalid decimal precision")
)

// Decimal represents an exact fixed-precision decimal number for financial calculations.
type Decimal struct {
	val   *big.Int
	scale int32
}

// DecimalNumber represents an exact decimal that is encoded as a JSON number.
// It is used by generated models for OpenAPI fields declared as
// type:number, format:decimal. Decimal remains the string-encoded type for
// fields declared as type:string, format:decimal.
//
// Decimal methods are promoted through the embedded value. Use DecimalValue
// when a Decimal value is required by an API that accepts the string-encoded
// representation.
type DecimalNumber struct {
	Decimal
}

var (
	bigZero     = big.NewInt(0)
	bigTen      = big.NewInt(10)
	pow10BigInt [19]*big.Int
)

// maxDecimalDigits bounds parser work for untrusted JSON numbers while still
// allowing the precision used by exchange prices, quantities, and fees.
const maxDecimalDigits = 1_000_000

const maxDecimalScale = int32(maxDecimalDigits)

// maxDecimalOperationDigits is intentionally much smaller than the parser
// bound. Arithmetic can allocate powers of ten, so accepting million-digit
// precision would still allow avoidable local resource exhaustion.
const maxDecimalOperationDigits = int32(1_000)

func init() {
	var current int64 = 1
	for i := 0; i <= 18; i++ {
		pow10BigInt[i] = big.NewInt(current)
		if i < 18 {
			current *= 10
		}
	}
}

// Zero returns a Decimal representing 0.
func Zero() Decimal {
	return Decimal{val: bigZero, scale: 0}
}

// NewDecimal creates a Decimal from an integer value and scale (e.g. 150 with
// scale 2 is 1.50). It panics when scale is outside the bounded range accepted
// by ParseDecimal; use NewDecimalChecked when input is not trusted.
func NewDecimal(value int64, scale int32) Decimal {
	decimal, err := NewDecimalChecked(value, scale)
	if err != nil {
		panic(err)
	}
	return decimal
}

// NewDecimalChecked creates a Decimal from an integer value and scale and
// returns an error for an unsafe scale.
func NewDecimalChecked(value int64, scale int32) (Decimal, error) {
	if scale < -maxDecimalScale || scale > maxDecimalScale {
		return Decimal{}, ErrInvalidDecimalScale
	}
	return Decimal{val: big.NewInt(value), scale: scale}, nil
}

// NewDecimalNumber creates a JSON-number decimal from an integer value and
// scale (e.g. 150 with scale 2 is 1.50).
func NewDecimalNumber(value int64, scale int32) DecimalNumber {
	return DecimalNumber{Decimal: NewDecimal(value, scale)}
}

// NewDecimalNumberChecked creates a JSON-number decimal and returns an error
// for an unsafe scale.
func NewDecimalNumberChecked(value int64, scale int32) (DecimalNumber, error) {
	decimal, err := NewDecimalChecked(value, scale)
	if err != nil {
		return DecimalNumber{}, err
	}
	return DecimalNumber{Decimal: decimal}, nil
}

// MustParseDecimal parses a decimal string or panics on error.
func MustParseDecimal(s string) Decimal {
	d, err := ParseDecimal(s)
	if err != nil {
		panic(err)
	}
	return d
}

// ParseDecimalNumber parses a decimal string into a JSON-number decimal.
func ParseDecimalNumber(s string) (DecimalNumber, error) {
	decimal, err := ParseDecimal(s)
	if err != nil {
		return DecimalNumber{}, err
	}
	return DecimalNumber{Decimal: decimal}, nil
}

// MustParseDecimalNumber parses a decimal string or panics on error.
func MustParseDecimalNumber(s string) DecimalNumber {
	decimal, err := ParseDecimalNumber(s)
	if err != nil {
		panic(err)
	}
	return decimal
}

// DecimalValue returns the underlying string-encoded Decimal value.
func (d DecimalNumber) DecimalValue() Decimal {
	return d.Decimal
}

// ParseDecimal parses a decimal string into an exact Decimal representation.
func ParseDecimal(s string) (Decimal, error) {
	s = strings.TrimSpace(s)
	if s == "" {
		return Decimal{}, ErrInvalidDecimal
	}

	sign := byte(0)
	if s[0] == '-' || s[0] == '+' {
		sign = s[0]
		s = s[1:]
	}
	if s == "" {
		return Decimal{}, ErrInvalidDecimal
	}

	mantissa := s
	exponent := int64(0)
	if exponentIdx := strings.IndexAny(s, "eE"); exponentIdx >= 0 {
		if strings.ContainsAny(s[exponentIdx+1:], "eE") {
			return Decimal{}, ErrInvalidDecimal
		}
		mantissa = s[:exponentIdx]
		exponentText := s[exponentIdx+1:]
		if exponentText == "" {
			return Decimal{}, ErrInvalidDecimal
		}
		parsedExponent, err := strconv.ParseInt(exponentText, 10, 32)
		if err != nil {
			return Decimal{}, ErrInvalidDecimal
		}
		exponent = parsedExponent
	}
	if mantissa == "" {
		return Decimal{}, ErrInvalidDecimal
	}

	dotIdx := strings.IndexByte(mantissa, '.')
	if dotIdx >= 0 && strings.IndexByte(mantissa[dotIdx+1:], '.') >= 0 {
		return Decimal{}, ErrInvalidDecimal
	}
	integer := mantissa
	fraction := ""
	if dotIdx >= 0 {
		integer = mantissa[:dotIdx]
		fraction = mantissa[dotIdx+1:]
		if integer == "" && fraction == "" {
			return Decimal{}, ErrInvalidDecimal
		}
	}
	if integer == "" {
		integer = "0"
	}

	// Construct the unscaled integer representation without the decimal dot.
	digits := integer + fraction
	if len(digits) > maxDecimalDigits {
		return Decimal{}, ErrInvalidDecimal
	}
	scale := int64(len(fraction)) - exponent
	if scale > int64(1<<31-1) || scale < -int64(1<<31-1)-1 {
		return Decimal{}, ErrInvalidDecimal
	}
	if scale < 0 {
		zeros := -scale
		if zeros > int64(maxDecimalDigits-len(digits)) {
			return Decimal{}, ErrInvalidDecimal
		}
		digits += strings.Repeat("0", int(zeros))
		scale = 0
	}
	if scale > int64(maxDecimalDigits) {
		return Decimal{}, ErrInvalidDecimal
	}
	if sign == '-' {
		digits = "-" + digits
	}

	val, ok := new(big.Int).SetString(digits, 10)
	if !ok {
		return Decimal{}, ErrInvalidDecimal
	}

	// scale is bounded by maxDecimalScale above before this conversion.
	safeScale := int32(scale) // #nosec G115 -- validated against the int32-compatible decimal scale bound
	return Decimal{val: val, scale: safeScale}.normalize(), nil
}

// String formats the Decimal as an exact string without exponential notation.
func (d Decimal) String() string {
	if d.val == nil || d.val.Sign() == 0 {
		return "0"
	}

	var stackBuf [64]byte
	rawBytes := d.val.Append(stackBuf[:0], 10)
	isNeg := false
	if len(rawBytes) > 0 && rawBytes[0] == '-' {
		isNeg = true
		rawBytes = rawBytes[1:]
	}

	var res strings.Builder
	grow := len(rawBytes) + 4
	if d.scale > 0 {
		grow += int(d.scale)
	}
	res.Grow(grow)
	if isNeg {
		res.WriteByte('-')
	}

	scale := int(d.scale)
	if scale <= 0 {
		res.Write(rawBytes)
		if scale < 0 {
			for i := 0; i < -scale; i++ {
				res.WriteByte('0')
			}
		}
		return res.String()
	}

	if len(rawBytes) <= scale {
		res.WriteString("0.")
		for i := 0; i < scale-len(rawBytes); i++ {
			res.WriteByte('0')
		}
		res.Write(rawBytes)
	} else {
		splitIdx := len(rawBytes) - scale
		res.Write(rawBytes[:splitIdx])
		res.WriteByte('.')
		res.Write(rawBytes[splitIdx:])
	}

	return res.String()
}

// Float64 converts Decimal to float64. It returns zero when the value cannot
// be represented as a finite float; use Float64Checked when that distinction
// matters.
func (d Decimal) Float64() float64 {
	f, _ := d.Float64Checked()
	return f
}

// Float64Checked converts Decimal to float64 and reports overflow or malformed
// internal values instead of silently returning an inaccurate result.
func (d Decimal) Float64Checked() (float64, error) {
	f, err := strconv.ParseFloat(d.String(), 64)
	if err != nil {
		return 0, err
	}
	return f, nil
}

// IsZero returns true if the Decimal equals zero.
func (d Decimal) IsZero() bool {
	return d.val == nil || d.val.Sign() == 0
}

// IsNegative returns true if the Decimal is strictly negative.
func (d Decimal) IsNegative() bool {
	return d.val != nil && d.val.Sign() < 0
}

// IsPositive returns true if the Decimal is strictly greater than zero.
func (d Decimal) IsPositive() bool {
	return d.val != nil && d.val.Sign() > 0
}

// Sign returns -1 if d < 0, 0 if d == 0, and +1 if d > 0.
func (d Decimal) Sign() int {
	if d.val == nil {
		return 0
	}
	return d.val.Sign()
}

// Cmp compares two Decimals: returns -1 if d < other, 0 if d == other, 1 if d > other.
func (d Decimal) Cmp(other Decimal) int {
	a, b := alignScale(d, other)
	return a.val.Cmp(b.val)
}

// Equal returns true if d == other.
func (d Decimal) Equal(other Decimal) bool {
	return d.Cmp(other) == 0
}

// GreaterThan returns true if d > other.
func (d Decimal) GreaterThan(other Decimal) bool {
	return d.Cmp(other) > 0
}

// LessThan returns true if d < other.
func (d Decimal) LessThan(other Decimal) bool {
	return d.Cmp(other) < 0
}

// GreaterThanOrEqual returns true if d >= other.
func (d Decimal) GreaterThanOrEqual(other Decimal) bool {
	return d.Cmp(other) >= 0
}

// LessThanOrEqual returns true if d <= other.
func (d Decimal) LessThanOrEqual(other Decimal) bool {
	return d.Cmp(other) <= 0
}

// Min returns the smaller of a and b.
func Min(a, b Decimal) Decimal {
	if a.Cmp(b) <= 0 {
		return a
	}
	return b
}

// Max returns the larger of a and b.
func Max(a, b Decimal) Decimal {
	if a.Cmp(b) >= 0 {
		return a
	}
	return b
}

// Add returns d + other.
func (d Decimal) Add(other Decimal) Decimal {
	a, b := alignScale(d, other)
	res := new(big.Int).Add(a.val, b.val)
	return Decimal{val: res, scale: a.scale}.normalize()
}

// Sub returns d - other.
func (d Decimal) Sub(other Decimal) Decimal {
	a, b := alignScale(d, other)
	res := new(big.Int).Sub(a.val, b.val)
	return Decimal{val: res, scale: a.scale}.normalize()
}

// Mul returns d * other.
func (d Decimal) Mul(other Decimal) Decimal {
	d = d.ensureInit()
	other = other.ensureInit()
	res := new(big.Int).Mul(d.val, other.val)
	return Decimal{val: res, scale: d.scale + other.scale}.normalize()
}

// Div returns d / other up to precision decimal places (default 8).
func (d Decimal) Div(other Decimal, precision ...int32) (Decimal, error) {
	d = d.ensureInit()
	other = other.ensureInit()

	if other.IsZero() {
		return Decimal{}, ErrDivisionByZero
	}

	prec := int32(8)
	if len(precision) > 0 && precision[0] >= 0 {
		prec = precision[0]
	}
	if prec > maxDecimalOperationDigits {
		return Decimal{}, ErrInvalidDecimalPrecision
	}
	if d.scale < -maxDecimalScale || d.scale > maxDecimalScale || other.scale < -maxDecimalScale || other.scale > maxDecimalScale {
		return Decimal{}, ErrInvalidDecimalScale
	}

	scaleDiff64 := int64(prec) + int64(other.scale) - int64(d.scale)
	if scaleDiff64 < -int64(maxDecimalOperationDigits) || scaleDiff64 > int64(maxDecimalOperationDigits) {
		return Decimal{}, ErrInvalidDecimalScale
	}
	scaleDiff := int32(scaleDiff64)
	var quotient *big.Int
	if scaleDiff >= 0 {
		num := new(big.Int).Mul(d.val, bigExp10(scaleDiff))
		quotient = new(big.Int).Quo(num, other.val)
	} else {
		denom := new(big.Int).Mul(other.val, bigExp10(-scaleDiff))
		quotient = new(big.Int).Quo(d.val, denom)
	}

	return Decimal{val: quotient, scale: prec}.normalize(), nil
}

// RoundToTick rounds d down toward negative infinity to the nearest multiple
// of a positive tickSize. This is the exchange-safe behavior for prices and
// quantities, which must never be rounded up.
func (d Decimal) RoundToTick(tickSize Decimal) Decimal {
	if !tickSize.IsPositive() {
		return d
	}
	div, err := d.Div(tickSize, 0)
	if err != nil {
		return d
	}
	result := div.Mul(tickSize)
	if d.IsNegative() && !d.Equal(result) {
		result = div.Sub(NewDecimal(1, 0)).Mul(tickSize)
	}
	return result
}

// Quantize rounds d down to the nearest multiple of tickSize.
func (d Decimal) Quantize(tickSize Decimal) Decimal {
	return d.RoundToTick(tickSize)
}

// QuantizePrice aligns a price to the exchange's minimum tick size.
func (d Decimal) QuantizePrice(tickSize Decimal) Decimal {
	return d.RoundToTick(tickSize)
}

// QuantizeAmount aligns an order quantity to the exchange's minimum lot size.
func (d Decimal) QuantizeAmount(lotSize Decimal) Decimal {
	return d.RoundToTick(lotSize)
}

// AddBps adds basis points (1 bps = 0.01% = 0.0001) to d using exact decimal arithmetic.
func (d Decimal) AddBps(bps float64) Decimal {
	if bps == 0 {
		return d
	}
	bpsDec, err := ParseDecimal(strconv.FormatFloat(bps, 'f', -1, 64))
	if err != nil {
		return d
	}
	tenThousand := NewDecimal(10000, 0)
	prec := d.scale + 4
	if prec < 8 {
		prec = 8
	}
	adjustment, err := d.Mul(bpsDec).Div(tenThousand, prec)
	if err != nil {
		return d
	}
	return d.Add(adjustment)
}

// SubBps subtracts basis points (1 bps = 0.01% = 0.0001) from d.
func (d Decimal) SubBps(bps float64) Decimal {
	return d.AddBps(-bps)
}

// BpsDiff calculates the spread/difference between two prices in basis points: ((d - other) / other) * 10000.
func (d Decimal) BpsDiff(other Decimal) float64 {
	result, err := d.BpsDiffChecked(other)
	if err != nil {
		return 0
	}
	return result
}

// BpsDiffChecked calculates the basis-point difference without converting the
// input decimals to float until the final result.
func (d Decimal) BpsDiffChecked(other Decimal) (float64, error) {
	if other.IsZero() {
		return 0, ErrDivisionByZero
	}
	diff, err := d.Sub(other).Div(other, 18)
	if err != nil {
		return 0, err
	}
	return diff.Mul(NewDecimal(10000, 0)).Float64Checked()
}

func (d Decimal) ensureInit() Decimal {
	if d.val == nil {
		return Decimal{val: bigZero, scale: 0}
	}
	return d
}

func (d Decimal) normalize() Decimal {
	d = d.ensureInit()
	if d.val.Sign() == 0 {
		return Zero()
	}
	if d.scale == 0 {
		return d
	}
	// Strip trailing zeros from scale
	rem := new(big.Int)
	val := new(big.Int).Set(d.val)
	scale := d.scale

	for scale > 0 {
		q, r := new(big.Int).QuoRem(val, bigTen, rem)
		if r.Sign() == 0 {
			val = q
			scale--
		} else {
			break
		}
	}
	return Decimal{val: val, scale: scale}
}

func alignScale(a, b Decimal) (Decimal, Decimal) {
	a = a.ensureInit()
	b = b.ensureInit()

	if a.scale == b.scale {
		return a, b
	}

	if a.scale < b.scale {
		diff := b.scale - a.scale
		aVal := new(big.Int).Mul(a.val, bigExp10(diff))
		return Decimal{val: aVal, scale: b.scale}, b
	}

	diff := a.scale - b.scale
	bVal := new(big.Int).Mul(b.val, bigExp10(diff))
	return a, Decimal{val: bVal, scale: a.scale}
}

func bigExp10(n int32) *big.Int {
	if n <= 0 {
		return pow10BigInt[0]
	}
	if n <= 18 {
		return pow10BigInt[n]
	}
	res := new(big.Int).SetInt64(10)
	return res.Exp(res, big.NewInt(int64(n)), nil)
}

// Abs returns the absolute value of d.
func (d Decimal) Abs() Decimal {
	d = d.ensureInit()
	if d.IsNegative() {
		return Decimal{val: new(big.Int).Abs(d.val), scale: d.scale}
	}
	return d
}

// Neg returns the negated value -d.
func (d Decimal) Neg() Decimal {
	d = d.ensureInit()
	return Decimal{val: new(big.Int).Neg(d.val), scale: d.scale}
}

// MarshalJSON marshals Decimal as a JSON string.
func (d Decimal) MarshalJSON() ([]byte, error) {
	return []byte(`"` + d.String() + `"`), nil
}

// MarshalJSON marshals DecimalNumber as a JSON number without converting
// through float64.
func (d DecimalNumber) MarshalJSON() ([]byte, error) {
	return []byte(d.String()), nil
}

// UnmarshalJSON unmarshals DecimalNumber from a JSON string or number. Both
// forms are accepted because the exchange has historically returned both
// representations for some endpoints.
func (d *DecimalNumber) UnmarshalJSON(b []byte) error {
	var decimal Decimal
	if err := decimal.UnmarshalJSON(b); err != nil {
		return err
	}
	d.Decimal = decimal
	return nil
}

// UnmarshalJSON unmarshals Decimal from JSON string or number.
func (d *Decimal) UnmarshalJSON(b []byte) error {
	b = bytes.TrimSpace(b)
	if bytes.Equal(b, []byte("null")) {
		*d = Zero()
		return nil
	}
	var value string
	if len(b) > 0 && b[0] == '"' {
		if err := json.Unmarshal(b, &value); err != nil {
			return ErrInvalidDecimal
		}
	} else {
		var number json.Number
		if err := json.Unmarshal(b, &number); err != nil {
			return ErrInvalidDecimal
		}
		value = number.String()
	}
	parsed, err := ParseDecimal(value)
	if err != nil {
		return err
	}
	*d = parsed
	return nil
}

// MarshalText implements encoding.TextMarshaler.
func (d Decimal) MarshalText() ([]byte, error) {
	return []byte(d.String()), nil
}

// UnmarshalText implements encoding.TextUnmarshaler.
func (d *Decimal) UnmarshalText(text []byte) error {
	if len(text) == 0 || bytes.Equal(text, []byte("null")) {
		*d = Zero()
		return nil
	}
	parsed, err := ParseDecimal(string(text))
	if err != nil {
		return err
	}
	*d = parsed
	return nil
}
