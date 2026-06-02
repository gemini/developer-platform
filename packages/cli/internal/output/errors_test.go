package output

import "testing"

func TestCLIError_Error(t *testing.T) {
	err := &CLIError{
		Code:    "TEST_ERROR",
		Message: "test message",
	}

	expected := "TEST_ERROR: test message"
	if err.Error() != expected {
		t.Errorf("Error() = %v, want %v", err.Error(), expected)
	}
}

func TestNewInputError(t *testing.T) {
	err := NewInputError("invalid input")

	if err.Code != ErrCodeInvalidInput {
		t.Errorf("Code = %v, want %v", err.Code, ErrCodeInvalidInput)
	}

	if err.Retryable {
		t.Error("Input errors should not be retryable")
	}
}

func TestNewAuthError(t *testing.T) {
	err := NewAuthError("auth failed")

	if err.Code != ErrCodeAuthRequired {
		t.Errorf("Code = %v, want %v", err.Code, ErrCodeAuthRequired)
	}

	if err.Suggestion == "" {
		t.Error("Auth errors should have a suggestion")
	}
}

func TestNewNetworkError(t *testing.T) {
	origErr := &testError{msg: "connection refused"}
	err := NewNetworkError(origErr)

	if err.Code != ErrCodeNetworkError {
		t.Errorf("Code = %v, want %v", err.Code, ErrCodeNetworkError)
	}

	if !err.Retryable {
		t.Error("Network errors should be retryable")
	}
}

func TestParseAPIError(t *testing.T) {
	tests := []struct {
		name         string
		code         string
		expectedCode string
		retryable    bool
	}{
		{"invalid signature", "InvalidSignature", ErrCodeAuthFailed, false},
		{"rate limited", "RateLimitExceeded", ErrCodeRateLimited, true},
		{"insufficient funds", "InsufficientFunds", ErrCodeInsufficientFunds, false},
		{"unknown error", "SomeRandomError", ErrCodeUnknown, false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := ParseAPIError(tt.code, "message", "reason")

			if err.Code != tt.expectedCode {
				t.Errorf("Code = %v, want %v", err.Code, tt.expectedCode)
			}

			if err.Retryable != tt.retryable {
				t.Errorf("Retryable = %v, want %v", err.Retryable, tt.retryable)
			}
		})
	}
}

func TestIsRetryable(t *testing.T) {
	retryableCodes := []string{ErrCodeRateLimited, ErrCodeNetworkError, ErrCodeServerError}
	nonRetryableCodes := []string{ErrCodeInvalidInput, ErrCodeAuthFailed, ErrCodeInsufficientFunds}

	for _, code := range retryableCodes {
		if !isRetryable(code) {
			t.Errorf("%s should be retryable", code)
		}
	}

	for _, code := range nonRetryableCodes {
		if isRetryable(code) {
			t.Errorf("%s should not be retryable", code)
		}
	}
}

type testError struct {
	msg string
}

func (e *testError) Error() string {
	return e.msg
}

func TestExitCode(t *testing.T) {
	tests := []struct {
		code         string
		expectedExit int
	}{
		{ErrCodeInvalidInput, ExitInvalidInput},
		{ErrCodeAuthRequired, ExitAuthError},
		{ErrCodeAuthFailed, ExitAuthError},
		{ErrCodeRateLimited, ExitRateLimited},
		{ErrCodeServerError, ExitServerError},
		{ErrCodeNetworkError, ExitServerError},
		{ErrCodeNotFound, ExitNotFound},
		{ErrCodeInsufficientFunds, ExitBusinessLogic},
		{ErrCodeMarketClosed, ExitBusinessLogic},
		{ErrCodeOrderRejected, ExitBusinessLogic},
		{ErrCodeUnknown, ExitGeneralError},
	}

	for _, tt := range tests {
		t.Run(tt.code, func(t *testing.T) {
			err := &CLIError{Code: tt.code}
			if err.ExitCode() != tt.expectedExit {
				t.Errorf("ExitCode() = %v, want %v", err.ExitCode(), tt.expectedExit)
			}
		})
	}
}

func TestNewInputErrorWithContext(t *testing.T) {
	received := map[string]any{
		"symbol": "BTCUSD",
		"side":   "",
	}
	invalid := []string{"side", "quantity"}
	example := "gemini-markets spot order place --symbol BTCUSD --side buy"

	err := NewInputErrorWithContext("missing params", received, invalid, example)

	if err.Code != ErrCodeInvalidInput {
		t.Errorf("Code = %v, want %v", err.Code, ErrCodeInvalidInput)
	}

	if len(err.ReceivedParams) != 2 {
		t.Errorf("ReceivedParams length = %v, want 2", len(err.ReceivedParams))
	}

	if len(err.InvalidParams) != 2 {
		t.Errorf("InvalidParams length = %v, want 2", len(err.InvalidParams))
	}

	if err.Example != example {
		t.Errorf("Example = %v, want %v", err.Example, example)
	}
}

func TestParseAPIErrorWithRequestID(t *testing.T) {
	requestID := "req-12345"
	err := ParseAPIErrorWithRequestID("RateLimitExceeded", "too many requests", "", requestID)

	if err.RequestID != requestID {
		t.Errorf("RequestID = %v, want %v", err.RequestID, requestID)
	}

	if err.Code != ErrCodeRateLimited {
		t.Errorf("Code = %v, want %v", err.Code, ErrCodeRateLimited)
	}
}
