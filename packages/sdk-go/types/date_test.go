package types_test

import (
	"testing"
	"time"

	"github.com/gemini/developer-platform/packages/sdk-go/types"
)

func TestDateJSONRoundTripAndValidation(t *testing.T) {
	date := types.NewDate(time.Date(2026, time.August, 20, 12, 30, 0, 0, time.UTC))
	encoded, err := date.MarshalJSON()
	if err != nil || string(encoded) != `"2026-08-20"` {
		t.Fatalf("unexpected date encoding: %s, %v", encoded, err)
	}

	var decoded types.Date
	if err := decoded.UnmarshalJSON(encoded); err != nil || decoded.String() != "2026-08-20" {
		t.Fatalf("unexpected date decoding: %s, %v", decoded, err)
	}

	for _, input := range []string{`"2026-08-20`, `2026-08-20`, `true`} {
		if err := decoded.UnmarshalJSON([]byte(input)); err == nil {
			t.Errorf("expected malformed date JSON %q to fail", input)
		}
	}

	if err := decoded.UnmarshalJSON([]byte("null")); err != nil || !decoded.IsZero() {
		t.Fatalf("expected null date to clear value: %s, %v", decoded, err)
	}
}
