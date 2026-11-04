package runtime

import (
	"encoding/json"
	"testing"
)

func TestJSONMergePreservesLargeNumbers(t *testing.T) {
	merged, err := JSONMerge(
		[]byte(`{"nonce":9007199254740993,"nested":{"value":1}}`),
		[]byte(`{"nested":{"value":9007199254740995}}`),
	)
	if err != nil {
		t.Fatalf("JSONMerge returned error: %v", err)
	}
	var fields map[string]json.RawMessage
	if err := json.Unmarshal(merged, &fields); err != nil {
		t.Fatalf("merged JSON is invalid: %v", err)
	}
	if string(fields["nonce"]) != "9007199254740993" {
		t.Fatalf("JSONMerge changed nonce precision: %s", fields["nonce"])
	}
	if string(fields["nested"]) != `{"value":9007199254740995}` {
		t.Fatalf("JSONMerge changed nested precision: %s", fields["nested"])
	}
}

func TestJSONMergeRejectsMultipleValues(t *testing.T) {
	if _, err := JSONMerge([]byte(`{} {}`), []byte(`{}`)); err == nil {
		t.Fatal("expected multiple JSON values to be rejected")
	}
}
