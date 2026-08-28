package transport_test

import (
	"bytes"
	"context"
	"errors"
	"log/slog"
	"net/http"
	"testing"
	"time"

	"github.com/gemini/gemini-go/transport"
)

func TestSlogHook_RedactsQueryStrings(t *testing.T) {
	var logs bytes.Buffer
	hook := transport.NewSlogHook(slog.New(slog.NewTextHandler(&logs, &slog.HandlerOptions{Level: slog.LevelDebug})))
	req, err := http.NewRequestWithContext(context.Background(), http.MethodGet, "https://api.gemini.com/v1/orders?token=caller-secret&account=primary", nil)
	if err != nil {
		t.Fatalf("creating request: %v", err)
	}

	hook.OnRequestEnd(context.Background(), req, nil, time.Second, errors.New("request failed"))
	output := logs.String()
	if bytes.Contains(logs.Bytes(), []byte("caller-secret")) || bytes.Contains(logs.Bytes(), []byte("token=")) {
		t.Fatalf("slog output contains query data: %s", output)
	}
	if !bytes.Contains(logs.Bytes(), []byte("/v1/orders")) {
		t.Fatalf("slog output omitted the request path: %s", output)
	}
}
