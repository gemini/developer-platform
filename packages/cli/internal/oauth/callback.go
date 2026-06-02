package oauth

import (
	"context"
	"fmt"
	"html/template"
	"net"
	"net/http"
	"os"
	"runtime"
	"time"

	"github.com/gemini/developer-platform/packages/cli/internal/config"
	"github.com/gemini/developer-platform/packages/cli/internal/debug"
)

// CallbackResult holds the result from the OAuth callback.
type CallbackResult struct {
	Code  string
	State string
	Error string
}

// StartCallbackServer starts a local HTTP server to receive the OAuth callback.
func StartCallbackServer() (int, <-chan CallbackResult, func(), error) {
	return StartCallbackServerOnPort(0)
}

// StartCallbackServerOnPort starts a local HTTP server on a requested port.
// Pass 0 to let the OS choose an ephemeral port.
func StartCallbackServerOnPort(port int) (int, <-chan CallbackResult, func(), error) {
	addr := "127.0.0.1:0"
	if port > 0 {
		addr = fmt.Sprintf("127.0.0.1:%d", port)
	}

	listener, err := net.Listen("tcp", addr)
	if err != nil {
		return 0, nil, nil, fmt.Errorf("start callback server: %w", err)
	}

	actualPort := listener.Addr().(*net.TCPAddr).Port
	resultCh := make(chan CallbackResult, 1)

	mux := http.NewServeMux()
	mux.HandleFunc(CallbackPath, func(w http.ResponseWriter, r *http.Request) {
		result := CallbackResult{
			Code:  r.URL.Query().Get("code"),
			State: r.URL.Query().Get("state"),
			Error: r.URL.Query().Get("error"),
		}

		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		if result.Error != "" {
			tmpl := template.Must(template.New("").Parse(`<html><body><h2>Authentication Failed</h2><p>{{.}}</p><p>You can close this tab.</p></body></html>`))
			_ = tmpl.Execute(w, result.Error)
		} else {
			tmpl := template.Must(template.New("").Parse(`<html><body><h2>Authentication Successful</h2><p>You can close this tab and return to the terminal.</p></body></html>`))
			_ = tmpl.Execute(w, nil)
		}

		select {
		case resultCh <- result:
		default:
		}
	})

	server := &http.Server{
		Handler:           mux,
		ReadHeaderTimeout: 5 * time.Second,
	}
	go func() {
		if err := server.Serve(listener); err != nil && err != http.ErrServerClosed {
			debug.Log("callback server error: %v", err)
		}
	}()

	shutdown := func() {
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
		defer cancel()
		_ = server.Shutdown(shutdownCtx)
	}

	return actualPort, resultCh, shutdown, nil
}

// IsHeadless returns true if the environment appears to be headless (SSH, no display).
func IsHeadless() bool {
	if os.Getenv("SSH_TTY") != "" || os.Getenv("SSH_CLIENT") != "" {
		return true
	}
	if runtime.GOOS == "linux" && os.Getenv("DISPLAY") == "" && os.Getenv("WAYLAND_DISPLAY") == "" {
		return true
	}
	return false
}

// OpenBrowser opens a URL in the user's default browser.
func OpenBrowser(url string) error {
	return config.OpenURL(url)
}
