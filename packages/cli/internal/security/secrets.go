package security

import (
	"crypto/subtle"
	"runtime"
)

// SecureString holds sensitive data that should be scrubbed from memory when done.
type SecureString struct {
	data []byte
}

// NewSecureString creates a SecureString from a regular string.
// The original string cannot be scrubbed as Go strings are immutable,
// so avoid passing string literals with secrets directly.
func NewSecureString(s string) *SecureString {
	data := make([]byte, len(s))
	copy(data, s)
	return &SecureString{data: data}
}

// String returns the secret as a string.
// Use sparingly - the returned string cannot be scrubbed.
func (s *SecureString) String() string {
	if s == nil || s.data == nil {
		return ""
	}
	return string(s.data)
}

// Bytes returns a copy of the secret bytes.
func (s *SecureString) Bytes() []byte {
	if s == nil || s.data == nil {
		return nil
	}
	result := make([]byte, len(s.data))
	copy(result, s.data)
	return result
}

// Len returns the length of the secret.
func (s *SecureString) Len() int {
	if s == nil || s.data == nil {
		return 0
	}
	return len(s.data)
}

// Scrub overwrites the secret data with zeros.
// Call this when done with the secret to minimize exposure window.
func (s *SecureString) Scrub() {
	if s == nil || s.data == nil {
		return
	}
	ScrubBytes(s.data)
	s.data = nil
}

// ScrubBytes overwrites a byte slice with zeros.
// Uses compiler barriers to prevent optimization from removing the scrub.
func ScrubBytes(b []byte) {
	if len(b) == 0 {
		return
	}

	// Use volatile-like write pattern to prevent compiler optimization
	for i := range b {
		b[i] = 0
	}

	// Memory barrier to ensure writes complete
	runtime.KeepAlive(b)
}

// ConstantTimeCompare compares two strings in constant time.
// Prevents timing attacks when comparing secrets.
func ConstantTimeCompare(a, b string) bool {
	return subtle.ConstantTimeCompare([]byte(a), []byte(b)) == 1
}

// ConstantTimeCompareBytes compares two byte slices in constant time.
func ConstantTimeCompareBytes(a, b []byte) bool {
	return subtle.ConstantTimeCompare(a, b) == 1
}
