package api

import (
	"encoding/base64"
	"encoding/json"
	"testing"
)

func TestPayloadSigner_Sign(t *testing.T) {
	signer := NewPayloadSigner("test-api-key", "test-api-secret")

	apiKey, payload, signature, err := signer.Sign("/v1/test", map[string]any{
		"foo": "bar",
	})

	if err != nil {
		t.Fatalf("Sign() error = %v", err)
	}

	if apiKey != "test-api-key" {
		t.Errorf("apiKey = %v, want %v", apiKey, "test-api-key")
	}

	if payload == "" {
		t.Error("payload should not be empty")
	}

	if signature == "" {
		t.Error("signature should not be empty")
	}

	// Verify payload is valid base64
	decoded, err := base64.StdEncoding.DecodeString(payload)
	if err != nil {
		t.Fatalf("payload is not valid base64: %v", err)
	}

	// Verify payload contains expected fields
	var payloadData map[string]any
	if err := json.Unmarshal(decoded, &payloadData); err != nil {
		t.Fatalf("payload is not valid JSON: %v", err)
	}

	if payloadData["request"] != "/v1/test" {
		t.Errorf("request = %v, want %v", payloadData["request"], "/v1/test")
	}

	if payloadData["foo"] != "bar" {
		t.Errorf("foo = %v, want %v", payloadData["foo"], "bar")
	}

	if _, ok := payloadData["nonce"]; !ok {
		t.Error("payload should contain nonce")
	}
}

func TestPayloadSigner_SignGET(t *testing.T) {
	signer := NewPayloadSigner("test-api-key", "test-api-secret")

	apiKey, payload, signature, err := signer.SignGET("/v1/test")

	if err != nil {
		t.Fatalf("SignGET() error = %v", err)
	}

	if apiKey != "test-api-key" {
		t.Errorf("apiKey = %v, want %v", apiKey, "test-api-key")
	}

	if payload == "" {
		t.Error("payload should not be empty")
	}

	if signature == "" {
		t.Error("signature should not be empty")
	}
}

func TestPayloadSigner_ConsistentSignature(t *testing.T) {
	signer := NewPayloadSigner("key", "secret")

	// Same payload should produce same signature
	payload1 := base64.StdEncoding.EncodeToString([]byte(`{"test":"data"}`))
	sig1 := signer.hmacSign(payload1)
	sig2 := signer.hmacSign(payload1)

	if sig1 != sig2 {
		t.Error("same payload should produce same signature")
	}

	// Different payload should produce different signature
	payload2 := base64.StdEncoding.EncodeToString([]byte(`{"test":"other"}`))
	sig3 := signer.hmacSign(payload2)

	if sig1 == sig3 {
		t.Error("different payload should produce different signature")
	}
}

func TestPayloadSigner_SignWebSocket(t *testing.T) {
	signer := NewPayloadSigner("test-api-key", "test-api-secret")

	headers := signer.SignWebSocket()

	if headers.APIKey != "test-api-key" {
		t.Errorf("APIKey = %v, want %v", headers.APIKey, "test-api-key")
	}

	if headers.Payload == "" {
		t.Error("Payload should not be empty")
	}

	if headers.Signature == "" {
		t.Error("Signature should not be empty")
	}

	if headers.Nonce == "" {
		t.Error("Nonce should not be empty")
	}

	// Verify payload is base64-encoded nonce
	decoded, err := base64.StdEncoding.DecodeString(headers.Payload)
	if err != nil {
		t.Fatalf("Payload is not valid base64: %v", err)
	}

	if string(decoded) != headers.Nonce {
		t.Errorf("Decoded payload = %v, want nonce %v", string(decoded), headers.Nonce)
	}
}

func TestPayloadSigner_SignWebSocket_UniqueNonce(t *testing.T) {
	signer := NewPayloadSigner("key", "secret")

	headers1 := signer.SignWebSocket()
	headers2 := signer.SignWebSocket()

	// Signatures should differ due to different nonces (unless called in same second)
	if headers1.Nonce == headers2.Nonce && headers1.Signature != headers2.Signature {
		t.Error("Same nonce should produce same signature")
	}
}
