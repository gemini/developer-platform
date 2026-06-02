package cmd

import (
	"errors"
	"io"
	"os"
	"testing"

	"github.com/gemini/developer-platform/packages/cli/internal/oauth"
	"github.com/gemini/developer-platform/packages/cli/internal/output"
	"github.com/gemini/developer-platform/packages/cli/internal/ws"
)

func TestHandleAPIError_ReauthRequiredMapsToAuthError(t *testing.T) {
	oldStdout := os.Stdout
	r, w, err := os.Pipe()
	if err != nil {
		t.Fatalf("os.Pipe() error = %v", err)
	}
	os.Stdout = w
	t.Cleanup(func() {
		os.Stdout = oldStdout
		_ = r.Close()
	})

	err = handleAPIError(oauth.ErrReauthRequired)
	_ = w.Close()
	_, _ = io.ReadAll(r)
	if err == nil {
		t.Fatal("handleAPIError() error = nil, want auth error")
	}

	var cliErr *output.CLIError
	if !errors.As(err, &cliErr) {
		t.Fatalf("handleAPIError() returned %T, want *output.CLIError", err)
	}
	if cliErr.Code != output.ErrCodeAuthRequired {
		t.Fatalf("CLIError.Code = %q, want %q", cliErr.Code, output.ErrCodeAuthRequired)
	}
	if cliErr.Retryable {
		t.Fatal("reauth errors should not be retryable")
	}
}

func TestSplitOAuthScopes(t *testing.T) {
	got := splitOAuthScopes("account:read predictions:orders:read,predictions:orders:write\nhistory:read")
	want := []string{"account:read", "predictions:orders:read", "predictions:orders:write", "history:read"}
	if len(got) != len(want) {
		t.Fatalf("splitOAuthScopes() = %#v, want %#v", got, want)
	}
	for i := range want {
		if got[i] != want[i] {
			t.Fatalf("splitOAuthScopes()[%d] = %q, want %q", i, got[i], want[i])
		}
	}
}

func TestHandleAPIError_WebSocketAuthErrorMapsToAuthRequired(t *testing.T) {
	oldStdout := os.Stdout
	r, w, err := os.Pipe()
	if err != nil {
		t.Fatalf("os.Pipe() error = %v", err)
	}
	os.Stdout = w
	t.Cleanup(func() {
		os.Stdout = oldStdout
		_ = r.Close()
	})

	err = handleAPIError(&ws.Error{Code: -1002, Msg: "Authentication required for stream: orders@account"})
	_ = w.Close()
	_, _ = io.ReadAll(r)
	if err == nil {
		t.Fatal("handleAPIError() error = nil, want auth error")
	}

	var cliErr *output.CLIError
	if !errors.As(err, &cliErr) {
		t.Fatalf("handleAPIError() returned %T, want *output.CLIError", err)
	}
	if cliErr.Code != output.ErrCodeAuthRequired {
		t.Fatalf("CLIError.Code = %q, want %q", cliErr.Code, output.ErrCodeAuthRequired)
	}
	if cliErr.Retryable {
		t.Fatal("WebSocket auth errors should not be retryable")
	}
}

func TestHandleAPIError_WebSocketForbiddenMapsToAuthFailed(t *testing.T) {
	oldStdout := os.Stdout
	r, w, err := os.Pipe()
	if err != nil {
		t.Fatalf("os.Pipe() error = %v", err)
	}
	os.Stdout = w
	t.Cleanup(func() {
		os.Stdout = oldStdout
		_ = r.Close()
	})

	err = handleAPIError(&ws.Error{Code: -1004, Msg: "Missing capability view_orders for stream orders@account"})
	_ = w.Close()
	_, _ = io.ReadAll(r)
	if err == nil {
		t.Fatal("handleAPIError() error = nil, want auth error")
	}

	var cliErr *output.CLIError
	if !errors.As(err, &cliErr) {
		t.Fatalf("handleAPIError() returned %T, want *output.CLIError", err)
	}
	if cliErr.Code != output.ErrCodeAuthFailed {
		t.Fatalf("CLIError.Code = %q, want %q", cliErr.Code, output.ErrCodeAuthFailed)
	}
	if cliErr.Retryable {
		t.Fatal("WebSocket forbidden errors should not be retryable")
	}
}

func TestHandleAPIError_WebSocketHTTPUnauthorizedMapsToAuthRequired(t *testing.T) {
	oldStdout := os.Stdout
	r, w, err := os.Pipe()
	if err != nil {
		t.Fatalf("os.Pipe() error = %v", err)
	}
	os.Stdout = w
	t.Cleanup(func() {
		os.Stdout = oldStdout
		_ = r.Close()
	})

	err = handleAPIError(&ws.HTTPError{StatusCode: 401, Status: "401 Unauthorized"})
	_ = w.Close()
	_, _ = io.ReadAll(r)
	if err == nil {
		t.Fatal("handleAPIError() error = nil, want auth error")
	}

	var cliErr *output.CLIError
	if !errors.As(err, &cliErr) {
		t.Fatalf("handleAPIError() returned %T, want *output.CLIError", err)
	}
	if cliErr.Code != output.ErrCodeAuthRequired {
		t.Fatalf("CLIError.Code = %q, want %q", cliErr.Code, output.ErrCodeAuthRequired)
	}
}
