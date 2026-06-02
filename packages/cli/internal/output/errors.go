package output

import (
	"fmt"
	"os"
)

// Exit codes for programmatic error handling by agents.
const (
	ExitSuccess       = 0
	ExitGeneralError  = 1
	ExitInvalidInput  = 2
	ExitAuthError     = 3
	ExitRateLimited   = 4
	ExitServerError   = 5
	ExitNotFound      = 6
	ExitBusinessLogic = 7
)

const (
	// ErrCodeInvalidInput indicates invalid command input.
	ErrCodeInvalidInput = "INVALID_INPUT"
	// ErrCodeAuthRequired indicates authentication is required.
	ErrCodeAuthRequired = "AUTH_REQUIRED"
	// ErrCodeAuthFailed indicates authentication failed.
	ErrCodeAuthFailed = "AUTH_FAILED"
	// ErrCodeNotFound indicates a resource was not found.
	ErrCodeNotFound = "NOT_FOUND"
	// ErrCodeInsufficientFunds indicates insufficient funds.
	ErrCodeInsufficientFunds = "INSUFFICIENT_FUNDS"
	// ErrCodeRateLimited indicates rate limiting.
	ErrCodeRateLimited = "RATE_LIMITED"
	// ErrCodeMarketClosed indicates the market is closed.
	ErrCodeMarketClosed = "MARKET_CLOSED"
	// ErrCodeOrderRejected indicates an order was rejected.
	ErrCodeOrderRejected = "ORDER_REJECTED"
	// ErrCodeNetworkError indicates a network error.
	ErrCodeNetworkError = "NETWORK_ERROR"
	// ErrCodeServerError indicates a server error.
	ErrCodeServerError = "SERVER_ERROR"
	// ErrCodeUnknown indicates an unknown error.
	ErrCodeUnknown = "UNKNOWN_ERROR"
)

// CLIError represents a CLI-specific error with code and context.
type CLIError struct {
	Code           string         `json:"code"`
	Message        string         `json:"message"`
	Retryable      bool           `json:"retryable"`
	RetryAfterMs   int64          `json:"retryAfterMs,omitempty"`
	Suggestion     string         `json:"suggestion,omitempty"`
	RequestID      string         `json:"requestId,omitempty"`
	ReceivedParams map[string]any `json:"receivedParams,omitempty"`
	InvalidParams  []string       `json:"invalidParams,omitempty"`
	Example        string         `json:"example,omitempty"`
}

// Compile-time interface check.
var _ error = (*CLIError)(nil)

func (e *CLIError) Error() string {
	return fmt.Sprintf("%s: %s", e.Code, e.Message)
}

// ExitCode returns the appropriate exit code for this error.
func (e *CLIError) ExitCode() int {
	switch e.Code {
	case ErrCodeInvalidInput:
		return ExitInvalidInput
	case ErrCodeAuthRequired, ErrCodeAuthFailed:
		return ExitAuthError
	case ErrCodeRateLimited:
		return ExitRateLimited
	case ErrCodeServerError, ErrCodeNetworkError:
		return ExitServerError
	case ErrCodeNotFound:
		return ExitNotFound
	case ErrCodeInsufficientFunds, ErrCodeMarketClosed, ErrCodeOrderRejected:
		return ExitBusinessLogic
	default:
		return ExitGeneralError
	}
}

// ErrorResponse is the JSON structure for error output.
type ErrorResponse struct {
	Success bool      `json:"success"`
	Error   *CLIError `json:"error"`
}

// ExitWithError prints the error as JSON and exits with appropriate code.
func ExitWithError(err *CLIError) {
	resp := ErrorResponse{
		Success: false,
		Error:   err,
	}
	_ = PrintJSON(resp)
	os.Exit(err.ExitCode())
}

// FormatError prints the error as JSON and returns an error for cobra to handle.
// Use this instead of ExitWithError to allow proper error propagation.
func FormatError(err *CLIError) error {
	resp := ErrorResponse{
		Success: false,
		Error:   err,
	}
	_ = PrintJSON(resp)
	return err
}

// NewInputError creates a new input validation error.
func NewInputError(message string) *CLIError {
	return &CLIError{
		Code:      ErrCodeInvalidInput,
		Message:   message,
		Retryable: false,
	}
}

// NewInputErrorWithContext creates an input error with parameter context for agents.
func NewInputErrorWithContext(message string, received map[string]any, invalid []string, example string) *CLIError {
	return &CLIError{
		Code:           ErrCodeInvalidInput,
		Message:        message,
		Retryable:      false,
		ReceivedParams: received,
		InvalidParams:  invalid,
		Example:        example,
	}
}

// NewAuthError creates a new authentication error.
func NewAuthError(message string) *CLIError {
	return &CLIError{
		Code:       ErrCodeAuthRequired,
		Message:    message,
		Retryable:  false,
		Suggestion: "Run 'gemini-markets auth login' for browser login, 'gemini-markets auth setup' for API key setup, or set GEMINI_ACCESS_TOKEN / GEMINI_API_KEY environment variables",
	}
}

// NewNetworkError creates a new network error.
func NewNetworkError(err error) *CLIError {
	return &CLIError{
		Code:       ErrCodeNetworkError,
		Message:    err.Error(),
		Retryable:  true,
		Suggestion: "Check your network connection and try again",
	}
}

// ParseAPIError converts an API error to a CLI error.
func ParseAPIError(code, message, reason string) *CLIError {
	cliCode := mapAPIErrorCode(code)
	fullMessage := message
	if reason != "" {
		fullMessage = fmt.Sprintf("%s: %s", message, reason)
	}

	return &CLIError{
		Code:       cliCode,
		Message:    fullMessage,
		Retryable:  isRetryable(cliCode),
		Suggestion: getSuggestion(cliCode),
	}
}

// ParseAPIErrorWithRequestID converts an API error with request tracking.
func ParseAPIErrorWithRequestID(code, message, reason, requestID string) *CLIError {
	err := ParseAPIError(code, message, reason)
	err.RequestID = requestID
	return err
}

func mapAPIErrorCode(apiCode string) string {
	switch apiCode {
	case "InvalidSignature", "InvalidApiKey", "InvalidNonce":
		return ErrCodeAuthFailed
	case "InsufficientFunds":
		return ErrCodeInsufficientFunds
	case "RateLimitExceeded":
		return ErrCodeRateLimited
	case "MarketNotOpen", "MarketClosed":
		return ErrCodeMarketClosed
	case "OrderRejected":
		return ErrCodeOrderRejected
	case "NotFound":
		return ErrCodeNotFound
	default:
		return ErrCodeUnknown
	}
}

func isRetryable(code string) bool {
	switch code {
	case ErrCodeRateLimited, ErrCodeNetworkError, ErrCodeServerError:
		return true
	default:
		return false
	}
}

func getSuggestion(code string) string {
	switch code {
	case ErrCodeAuthFailed:
		return "Verify your token or API credentials are valid, or run 'gemini-markets auth login' to establish a fresh OAuth session"
	case ErrCodeInsufficientFunds:
		return "Deposit funds or reduce order size"
	case ErrCodeRateLimited:
		return "Wait and retry with exponential backoff"
	case ErrCodeMarketClosed:
		return "This market is not currently accepting orders"
	case ErrCodeOrderRejected:
		return "Check order parameters (price, quantity, etc.)"
	case ErrCodeNotFound:
		return "Verify the market/order ID is correct"
	default:
		return ""
	}
}
