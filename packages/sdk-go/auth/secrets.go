package auth

import (
	"fmt"
	"log/slog"
)

// APIKey represents a Gemini API Key identifier.
type APIKey string

// String masks the API key for safe terminal/log output.
func (k APIKey) String() string {
	raw := string(k)
	if len(raw) <= 8 {
		return "[REDACTED_KEY]"
	}
	return fmt.Sprintf("%s...%s", raw[:4], raw[len(raw)-4:])
}

// GoString masks the API key in %#v debug representations.
func (k APIKey) GoString() string {
	return fmt.Sprintf("auth.APIKey(%q)", k.String())
}

// MarshalJSON redacts the API key during JSON serialization.
func (k APIKey) MarshalJSON() ([]byte, error) {
	return []byte(fmt.Sprintf("%q", k.String())), nil
}

// LogValue implements slog.LogValuer to prevent accidental leaking in structured logs.
func (k APIKey) LogValue() slog.Value {
	return slog.StringValue(k.String())
}

// APISecret represents a Gemini API secret used for HMAC-SHA384 signatures.
type APISecret string

// String completely redacts the API secret.
func (s APISecret) String() string {
	return "[REDACTED_SECRET]"
}

// GoString completely redacts the API secret in %#v debug representations.
func (s APISecret) GoString() string {
	return `auth.APISecret("[REDACTED_SECRET]")`
}

// MarshalJSON redacts the API secret during JSON serialization.
func (s APISecret) MarshalJSON() ([]byte, error) {
	return []byte(`"[REDACTED_SECRET]"`), nil
}

// LogValue implements slog.LogValuer.
func (s APISecret) LogValue() slog.Value {
	return slog.StringValue("[REDACTED_SECRET]")
}

// BearerToken represents an OAuth2 bearer access token.
type BearerToken string

// String completely redacts the bearer token.
func (t BearerToken) String() string {
	return "[REDACTED_TOKEN]"
}

// GoString completely redacts the bearer token in %#v debug representations.
func (t BearerToken) GoString() string {
	return `auth.BearerToken("[REDACTED_TOKEN]")`
}

// MarshalJSON redacts the bearer token during JSON serialization.
func (t BearerToken) MarshalJSON() ([]byte, error) {
	return []byte(`"[REDACTED_TOKEN]"`), nil
}

// LogValue implements slog.LogValuer.
func (t BearerToken) LogValue() slog.Value {
	return slog.StringValue("[REDACTED_TOKEN]")
}
