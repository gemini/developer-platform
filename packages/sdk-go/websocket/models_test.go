package websocket

import (
	"encoding/json"
	"errors"
	"testing"
)

func TestResponseFrame_PreservesNumericIDAndResultNumbers(t *testing.T) {
	var frame ResponseFrame
	if err := json.Unmarshal([]byte(`{"id":9007199254740993,"result":{"value":9007199254740993}}`), &frame); err != nil {
		t.Fatalf("failed to decode response frame: %v", err)
	}
	if frame.ID != "9007199254740993" {
		t.Fatalf("expected exact response ID, got %q", frame.ID)
	}

	var result struct {
		Value json.Number `json:"value"`
	}
	if err := frame.DecodeResult(&result); err != nil {
		t.Fatalf("failed to decode result: %v", err)
	}
	if result.Value.String() != "9007199254740993" {
		t.Fatalf("expected exact result number, got %q", result.Value)
	}

	var generic map[string]any
	if err := frame.DecodeResult(&generic); err != nil {
		t.Fatalf("failed to decode generic result: %v", err)
	}
	value, ok := generic["value"].(json.Number)
	if !ok || value.String() != "9007199254740993" {
		t.Fatalf("expected generic result to preserve exact number, got %#v", generic["value"])
	}
}

func TestResponseFrame_DecodesStringID(t *testing.T) {
	var frame ResponseFrame
	if err := json.Unmarshal([]byte(`{"id":"request-1","result":null}`), &frame); err != nil {
		t.Fatalf("failed to decode response frame: %v", err)
	}
	if frame.ID != "request-1" {
		t.Fatalf("expected string response ID, got %q", frame.ID)
	}
}

func TestResponseFrame_DecodingSparseFrameClearsPreviousState(t *testing.T) {
	frame := ResponseFrame{
		ID:     "old-request",
		Status: 500,
		Result: json.RawMessage(`{"value":1}`),
		Error:  &ResponseErrorPayload{Code: 1001, Message: "old error"},
	}
	if err := json.Unmarshal([]byte(`{"status":200,"id":null}`), &frame); err != nil {
		t.Fatalf("failed to decode sparse response frame: %v", err)
	}
	if frame.ID != "" || frame.Status != 200 || frame.Result != nil || frame.Error != nil {
		t.Fatalf("sparse response retained stale state: %+v", frame)
	}
}

func TestResponseFrame_InvalidIDDoesNotPartiallyMutateReceiver(t *testing.T) {
	frame := ResponseFrame{ID: "old-request", Status: 200, Result: json.RawMessage(`null`)}
	if err := json.Unmarshal([]byte(`{"id":true}`), &frame); err == nil {
		t.Fatal("expected invalid response ID to fail")
	}
	if frame.ID != "old-request" || frame.Status != 200 || string(frame.Result) != "null" {
		t.Fatalf("invalid response mutated receiver: %+v", frame)
	}
}

func TestRequestErrorAndConnectionStateFormatting(t *testing.T) {
	withMessage := &RequestError{ID: "7", Status: 400, Code: 1001, Message: "invalid request"}
	if got := withMessage.Error(); got == "" {
		t.Fatal("expected request error message")
	}
	if !errors.Is(withMessage, ErrRequestFailed) {
		t.Fatal("expected RequestError to unwrap to ErrRequestFailed")
	}
	if got := (&RequestError{ID: "8", Status: 500}).Error(); got == "" {
		t.Fatal("expected request error without message to be formatted")
	}
	if got := ConnectionState(999).String(); got != "Unknown" {
		t.Fatalf("expected unknown connection state, got %q", got)
	}
}

func TestOrderOperationConstantsMatchWireMethods(t *testing.T) {
	if OpOrderNew != "order.place" {
		t.Fatalf("expected order.place, got %q", OpOrderNew)
	}
	if OpOrderCancel != "order.cancel" {
		t.Fatalf("expected order.cancel, got %q", OpOrderCancel)
	}
}
