package security

import (
	"testing"
)

func TestSecureString(t *testing.T) {
	secret := "my-secret-api-key"
	ss := NewSecureString(secret)

	if ss.String() != secret {
		t.Errorf("String() = %q, want %q", ss.String(), secret)
	}

	if ss.Len() != len(secret) {
		t.Errorf("Len() = %d, want %d", ss.Len(), len(secret))
	}

	bytes := ss.Bytes()
	if string(bytes) != secret {
		t.Errorf("Bytes() = %q, want %q", string(bytes), secret)
	}

	ss.Scrub()

	if ss.String() != "" {
		t.Error("String() should be empty after Scrub()")
	}
	if ss.Len() != 0 {
		t.Error("Len() should be 0 after Scrub()")
	}
}

func TestScrubBytes(t *testing.T) {
	data := []byte("sensitive-data")
	ScrubBytes(data)

	for i, b := range data {
		if b != 0 {
			t.Errorf("byte %d not zeroed: got %d", i, b)
		}
	}
}

func TestConstantTimeCompare(t *testing.T) {
	tests := []struct {
		a, b     string
		expected bool
	}{
		{"secret", "secret", true},
		{"secret", "different", false},
		{"", "", true},
		{"a", "b", false},
	}

	for _, tt := range tests {
		if got := ConstantTimeCompare(tt.a, tt.b); got != tt.expected {
			t.Errorf("ConstantTimeCompare(%q, %q) = %v, want %v", tt.a, tt.b, got, tt.expected)
		}
	}
}

func TestNilSecureString(t *testing.T) {
	var ss *SecureString

	if ss.String() != "" {
		t.Error("nil SecureString.String() should return empty string")
	}
	if ss.Len() != 0 {
		t.Error("nil SecureString.Len() should return 0")
	}
	if ss.Bytes() != nil {
		t.Error("nil SecureString.Bytes() should return nil")
	}

	ss.Scrub()
}
