package conformance

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
)

// FixtureManifest is the language-neutral conformance manifest.
type FixtureManifest struct {
	Version    int             `json:"version"`
	Suites     []FixtureSuite  `json:"suites"`
	Exceptions []string        `json:"exceptions"`
}

// FixtureSuite enumerates the fixture files for one runner kind.
type FixtureSuite struct {
	ID    string   `json:"id"`
	Kind  string   `json:"kind"`
	Cases []string `json:"cases"`
}

type FixtureCredentials struct {
	APIKey    string `json:"apiKey"`
	APISecret string `json:"apiSecret"`
}

type FixtureNonce struct {
	Mode  string `json:"mode"`
	Value string `json:"value,omitempty"`
}

type FixtureHMACRequest struct {
	Method string          `json:"method"`
	Path   string          `json:"path"`
	Body   json.RawMessage `json:"body"`
}

type FixtureHMACPayload struct {
	Request string                     `json:"request,omitempty"`
	Nonce   string                     `json:"nonce,omitempty"`
	Fields  map[string]json.RawMessage `json:"fields,omitempty"`
}

type FixtureSignature struct {
	Algorithm string `json:"algorithm"`
	Over      string `json:"over"`
	Encoding  string `json:"encoding"`
}

type FixtureHMACExpect struct {
	Headers     []string          `json:"headers"`
	APIKeyHeader string            `json:"apiKeyHeader"`
	Payload      FixtureHMACPayload `json:"payload"`
	Signature    FixtureSignature  `json:"signature"`
}

type FixtureHMAC struct {
	ID          string             `json:"id"`
	Kind        string             `json:"kind"`
	Credentials FixtureCredentials `json:"credentials"`
	Nonce       FixtureNonce       `json:"nonce"`
	Request     FixtureHMACRequest  `json:"request"`
	Expect      FixtureHMACExpect   `json:"expect"`
	Exceptions  []string            `json:"exceptions,omitempty"`
}

type FixtureUnsignedExpect struct {
	Method      string              `json:"method"`
	Path        string              `json:"path"`
	Query       map[string][]string `json:"query"`
	AuthHeaders []string            `json:"authHeaders"`
}

type FixtureUnsigned struct {
	ID       string                     `json:"id"`
	Kind     string                     `json:"kind"`
	Operation string                   `json:"operation"`
	Input    map[string]json.RawMessage `json:"input"`
	Expect   FixtureUnsignedExpect      `json:"expect"`
}

type FixtureErrorResponse struct {
	Status  int               `json:"status"`
	Headers map[string]string `json:"headers"`
	Body    string            `json:"body"`
}

type FixtureErrorExpect struct {
	Kind              string `json:"kind"`
	Reason            string `json:"reason,omitempty"`
	RetryAfterSeconds *int   `json:"retryAfterSeconds,omitempty"`
}

type FixtureError struct {
	ID       string             `json:"id"`
	Kind     string             `json:"kind"`
	Response FixtureErrorResponse `json:"response"`
	Expect   FixtureErrorExpect  `json:"expect"`
}

type FixtureJSONExpect struct {
	ValueKind string `json:"valueKind"`
	Text      string `json:"text"`
}

type FixtureJSON struct {
	ID     string            `json:"id"`
	Kind   string            `json:"kind"`
	Raw    string            `json:"raw"`
	Field  string            `json:"field"`
	Expect FixtureJSONExpect `json:"expect"`
}

type FixtureWSSubscriptionExpect struct {
	Method string   `json:"method"`
	Params []string `json:"params"`
}

type FixtureWSSubscription struct {
	ID         string                     `json:"id"`
	Kind       string                     `json:"kind"`
	Stream     string                     `json:"stream"`
	Symbol     string                     `json:"symbol,omitempty"`
	Options    map[string]json.RawMessage `json:"options,omitempty"`
	Expect     FixtureWSSubscriptionExpect `json:"expect"`
	Exceptions []string                   `json:"exceptions,omitempty"`
}

type FixtureWSEventField struct {
	Text    string `json:"text"`
	Compare string `json:"compare,omitempty"`
}

type FixtureWSEventExpect struct {
	Fields map[string]FixtureWSEventField `json:"fields"`
}

type FixtureWSEvent struct {
	ID       string                `json:"id"`
	Kind     string                `json:"kind"`
	Stream   string                `json:"stream"`
	Symbol   string                `json:"symbol,omitempty"`
	Frame    string                `json:"frame"`
	Expect   FixtureWSEventExpect  `json:"expect"`
	Exceptions []string            `json:"exceptions,omitempty"`
}

// ConformanceRoot locates the repository root by walking upward from the
// process working directory until conformance/manifest.json is present.
func ConformanceRoot(t *testing.T) string {
	t.Helper()
	startDir, err := os.Getwd()
	if err != nil {
		t.Fatalf("getting working directory: %v", err)
	}
	for dir := startDir; ; dir = filepath.Dir(dir) {
		if _, err := os.Stat(filepath.Join(dir, "conformance", "manifest.json")); err == nil {
			return dir
		}
		parent := filepath.Dir(dir)
		if parent == dir {
			break
		}
	}
	t.Fatalf("conformance/manifest.json not found above %s", startDir)
	return ""
}

// LoadManifest reads and decodes the checked-in conformance manifest.
func LoadManifest(t *testing.T) FixtureManifest {
	t.Helper()
	root := ConformanceRoot(t)
	data, err := os.ReadFile(filepath.Join(root, "conformance", "manifest.json"))
	if err != nil {
		t.Fatalf("reading conformance/manifest.json: %v", err)
	}
	var manifest FixtureManifest
	if err := json.Unmarshal(data, &manifest); err != nil {
		t.Fatalf("decoding conformance/manifest.json: %v", err)
	}
	return manifest
}

// LoadCase reads one fixture named by its suite and case identifiers.
func LoadCase(t *testing.T, suiteID, caseID string) []byte {
	t.Helper()
	root := ConformanceRoot(t)
	path := filepath.Join(root, "conformance", filepath.FromSlash(suiteID), caseID+".json")
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("reading conformance case %s/%s: %v", suiteID, caseID, err)
	}
	return data
}
