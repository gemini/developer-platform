package auth_test

import (
	"encoding/base64"
	"encoding/json"
	"testing"
	"unicode/utf8"

	"github.com/gemini/gemini-go/auth"
)

func FuzzHMAC_BuildPayload(f *testing.F) {
	f.Add("/v1/order/new", []byte(`{"symbol":"btcusd","amount":"1.0","price":"65000.00","side":"buy"}`))
	f.Add("/v1/order/cancel", []byte(`{"order_id":"123456"}`))
	f.Add("/v1/balances", []byte(`{}`))
	f.Add("/v1/heartbeat", []byte(``))

	signer := auth.NewHMAC(auth.APIKey("my-key"), auth.APISecret("my-secret"))

	f.Fuzz(func(t *testing.T, path string, customParams []byte) {
		if !utf8.ValidString(path) {
			return
		}
		payload, err := signer.BuildPayload(path, customParams)
		if err != nil {
			return
		}
		var envelope map[string]json.RawMessage
		if err := json.Unmarshal(payload, &envelope); err != nil {
			t.Fatalf("BuildPayload returned invalid JSON: %v", err)
		}
		var gotPath, gotNonce string
		if err := json.Unmarshal(envelope["request"], &gotPath); err != nil || gotPath != path {
			t.Fatalf("BuildPayload did not preserve request path %q", path)
		}
		if err := json.Unmarshal(envelope["nonce"], &gotNonce); err != nil || gotNonce == "" {
			t.Fatal("BuildPayload did not inject a valid nonce")
		}
		b64Payload := base64.StdEncoding.EncodeToString(payload)
		if !auth.VerifySignature(auth.APISecret("my-secret"), b64Payload, signer.Sign([]byte(b64Payload))) {
			t.Fatal("generated signature did not verify against generated payload")
		}
	})
}
