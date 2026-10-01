package conformance

import (
	"encoding/json"
	"strconv"
	"strings"
	"testing"

	"github.com/gemini/developer-platform/packages/sdk-go/types"
)


func TestJSONDecodingConformance(t *testing.T) {
	manifest := LoadManifest(t)
	found := false
	for _, suite := range manifest.Suites {
		if suite.Kind != "jsonDecoding" {
			continue
		}
		found = true
		for _, caseID := range suite.Cases {
			t.Run(caseID, func(t *testing.T) {
				var fixture FixtureJSON
				if err := json.Unmarshal(LoadCase(t, suite.ID, caseID), &fixture); err != nil {
					t.Fatalf("decode fixture: %v", err)
				}
				if fixture.Kind != "jsonDecoding" {
					t.Fatalf("fixture kind = %q, want jsonDecoding", fixture.Kind)
				}
				if fixture.Field != "v" {
					t.Fatalf("unsupported fixture field %q", fixture.Field)
				}

				decoder := json.NewDecoder(strings.NewReader(fixture.Raw))
				decoder.UseNumber()
				switch fixture.Expect.ValueKind {
				case "integer":
					var value struct {
						V int64 `json:"v"`
					}
					if err := decoder.Decode(&value); err != nil {
						t.Fatalf("decode integer: %v", err)
					}
					if got := strconv.FormatInt(value.V, 10); got != fixture.Expect.Text {
						t.Fatalf("decoded integer = %q, want %q", got, fixture.Expect.Text)
					}
				case "decimal":
					var value struct {
						V types.Decimal `json:"v"`
					}
					if err := decoder.Decode(&value); err != nil {
						t.Fatalf("decode decimal: %v", err)
					}
					if got := value.V.String(); got != fixture.Expect.Text {
						t.Fatalf("decoded decimal = %q, want %q", got, fixture.Expect.Text)
					}
				default:
					t.Fatalf("unsupported value kind %q", fixture.Expect.ValueKind)
				}
			})
		}
	}
	if !found {
		t.Fatal("manifest has no jsonDecoding suite")
	}
}
