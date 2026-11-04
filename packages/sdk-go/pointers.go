package gemini

// Ptr returns a pointer to the passed value. Useful for constructing request structs with optional fields.
func Ptr[T any](v T) *T { return &v }

// Val returns the value behind the pointer or the type's zero value if the pointer is nil.
func Val[T any](v *T) T {
	if v == nil {
		var zero T
		return zero
	}
	return *v
}

// Convenience typed pointer constructors and dereferencers.
func String(v string) *string         { return Ptr(v) }
func StringValue(v *string) string    { return Val(v) }
func Int(v int) *int                  { return Ptr(v) }
func IntValue(v *int) int             { return Val(v) }
func Int32(v int32) *int32            { return Ptr(v) }
func Int32Value(v *int32) int32       { return Val(v) }
func Int64(v int64) *int64            { return Ptr(v) }
func Int64Value(v *int64) int64       { return Val(v) }
func Bool(v bool) *bool               { return Ptr(v) }
func BoolValue(v *bool) bool          { return Val(v) }
func Float64(v float64) *float64      { return Ptr(v) }
func Float64Value(v *float64) float64 { return Val(v) }
