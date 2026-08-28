package auth_test

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/gemini/gemini-go/auth"
)

func TestBearer_StaticToken(t *testing.T) {
	token := auth.BearerToken("oauth-access-token-abc-123")
	strategy := auth.NewBearer(token)

	req, err := http.NewRequestWithContext(context.Background(), http.MethodGet, "https://api.gemini.com/v1/balances", nil)
	if err != nil {
		t.Fatalf("failed creating request: %v", err)
	}

	if err := strategy.Authenticate(context.Background(), req, nil); err != nil {
		t.Fatalf("failed authenticating request: %v", err)
	}

	authHeader := req.Header.Get("Authorization")
	if authHeader != "Bearer oauth-access-token-abc-123" {
		t.Fatalf("expected 'Bearer oauth-access-token-abc-123', got %s", authHeader)
	}
}

func TestBearer_AuthenticateEncodesPayloadInHeader(t *testing.T) {
	strategy := auth.NewBearer(auth.BearerToken("oauth-access-token"))
	req, err := http.NewRequest(http.MethodPost, "https://api.gemini.com/v1/mytrades", nil)
	if err != nil {
		t.Fatalf("failed creating request: %v", err)
	}
	payload := []byte(`{"request":"ignored","nonce":null,"symbol":"btcusd"}`)
	if err := strategy.Authenticate(context.Background(), req, payload); err != nil {
		t.Fatalf("failed authenticating request: %v", err)
	}
	encoded := req.Header.Get("X-GEMINI-PAYLOAD")
	decoded, err := base64.StdEncoding.DecodeString(encoded)
	if err != nil {
		t.Fatalf("decoding payload header: %v", err)
	}
	var got map[string]any
	if err := json.Unmarshal(decoded, &got); err != nil {
		t.Fatalf("decoding payload JSON: %v", err)
	}
	if got["request"] != "/v1/mytrades" {
		t.Fatalf("expected request path in payload, got %v", got["request"])
	}
	if got["symbol"] != "btcusd" {
		t.Fatalf("expected endpoint parameter in payload, got %v", got["symbol"])
	}
	if _, ok := got["nonce"]; ok {
		t.Fatal("OAuth payload must not contain a nonce")
	}
	if req.ContentLength != 0 || req.Body == nil {
		t.Fatalf("expected bodyless OAuth request, content length %d", req.ContentLength)
	}
	body, err := io.ReadAll(req.Body)
	if err != nil {
		t.Fatalf("reading request body: %v", err)
	}
	if len(body) != 0 {
		t.Fatalf("expected empty request body, got %q", body)
	}
}

func TestBearer_AuthenticateEncodesPayloadForEmptyRequest(t *testing.T) {
	strategy := auth.NewBearer(auth.BearerToken("oauth-access-token"))
	req, err := http.NewRequest(http.MethodGet, "https://api.gemini.com/v1/prediction-markets/terms/status", nil)
	if err != nil {
		t.Fatalf("failed creating request: %v", err)
	}
	if err := strategy.Authenticate(context.Background(), req, nil); err != nil {
		t.Fatalf("failed authenticating request: %v", err)
	}

	encoded := req.Header.Get("X-GEMINI-PAYLOAD")
	if encoded == "" {
		t.Fatal("expected X-GEMINI-PAYLOAD for an empty OAuth request")
	}
	decoded, err := base64.StdEncoding.DecodeString(encoded)
	if err != nil {
		t.Fatalf("decoding payload header: %v", err)
	}
	var got map[string]any
	if err := json.Unmarshal(decoded, &got); err != nil {
		t.Fatalf("decoding payload JSON: %v", err)
	}
	if got["request"] != "/v1/prediction-markets/terms/status" {
		t.Fatalf("expected request path in payload, got %v", got["request"])
	}
}

func TestBearer_DynamicTokenSource(t *testing.T) {
	currentVal := "initial-token"
	source := auth.TokenFunc(func(ctx context.Context) (string, error) {
		return currentVal, nil
	})

	strategy := auth.NewBearerWithSource(source)
	ctx := context.Background()

	req, _ := http.NewRequestWithContext(ctx, http.MethodGet, "https://api.gemini.com/v1/balances", nil)
	if err := strategy.Authenticate(ctx, req, nil); err != nil {
		t.Fatalf("expected nil auth error, got: %v", err)
	}
	if req.Header.Get("Authorization") != "Bearer initial-token" {
		t.Fatalf("expected initial-token, got %s", req.Header.Get("Authorization"))
	}

	// Token refresh simulation
	currentVal = "refreshed-token-xyz"
	req2, _ := http.NewRequestWithContext(ctx, http.MethodGet, "https://api.gemini.com/v1/balances", nil)
	if err := strategy.Authenticate(ctx, req2, nil); err != nil {
		t.Fatalf("expected nil auth error, got: %v", err)
	}
	if req2.Header.Get("Authorization") != "Bearer refreshed-token-xyz" {
		t.Fatalf("expected refreshed-token-xyz, got %s", req2.Header.Get("Authorization"))
	}

	// Token source failure simulation
	errSource := auth.TokenFunc(func(ctx context.Context) (string, error) {
		return "", fmt.Errorf("token provider unavailable")
	})
	failingStrategy := auth.NewBearerWithSource(errSource)
	req3, _ := http.NewRequestWithContext(ctx, http.MethodGet, "https://api.gemini.com/v1/balances", nil)
	if err := failingStrategy.Authenticate(ctx, req3, nil); err == nil {
		t.Fatal("expected error from failing TokenSource, got nil")
	} else if !errors.Is(err, auth.ErrTokenSourceFailure) {
		t.Fatalf("expected ErrTokenSourceFailure, got %v", err)
	}
}

func TestBearer_TokenSourceHonorsCancellation(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	cancel()

	strategy := auth.NewBearerWithSource(auth.TokenFunc(func(ctx context.Context) (string, error) {
		<-ctx.Done()
		return "", ctx.Err()
	}))
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, "https://api.gemini.com/v1/balances", nil)
	if err != nil {
		t.Fatalf("failed creating request: %v", err)
	}

	err = strategy.Authenticate(ctx, req, nil)
	if !errors.Is(err, context.Canceled) {
		t.Fatalf("Authenticate() error = %v, want context.Canceled", err)
	}
}

func TestBearer_TokenSourceSupportsConcurrentCalls(t *testing.T) {
	const callers = 8
	entered := make(chan struct{}, callers)
	release := make(chan struct{})
	var calls atomic.Int32
	var active atomic.Int32
	var maxActive atomic.Int32

	source := auth.TokenFunc(func(ctx context.Context) (string, error) {
		calls.Add(1)
		current := active.Add(1)
		for {
			previous := maxActive.Load()
			if current <= previous || maxActive.CompareAndSwap(previous, current) {
				break
			}
		}
		defer active.Add(-1)
		entered <- struct{}{}
		select {
		case <-release:
			return "concurrent-token", nil
		case <-ctx.Done():
			return "", ctx.Err()
		}
	})
	strategy := auth.NewBearerWithSource(source)

	var wg sync.WaitGroup
	errs := make(chan error, callers)
	wg.Add(callers)
	for i := 0; i < callers; i++ {
		go func() {
			defer wg.Done()
			req, err := http.NewRequest(http.MethodGet, "https://api.gemini.com/v1/balances", nil)
			if err != nil {
				errs <- err
				return
			}
			errs <- strategy.Authenticate(context.Background(), req, nil)
		}()
	}

	deadline := time.After(time.Second)
	for i := 0; i < callers; i++ {
		select {
		case <-entered:
		case <-deadline:
			close(release)
			wg.Wait()
			t.Fatalf("only %d token-source calls entered concurrently", i)
		}
	}
	close(release)
	wg.Wait()
	close(errs)
	for err := range errs {
		if err != nil {
			t.Fatalf("concurrent Authenticate() failed: %v", err)
		}
	}
	if got := calls.Load(); got != callers {
		t.Fatalf("token source calls = %d, want %d", got, callers)
	}
	if got := maxActive.Load(); got < 2 {
		t.Fatalf("token source max concurrency = %d, want concurrent calls", got)
	}
}

func TestBearer_Validate(t *testing.T) {
	tests := []struct {
		name     string
		strategy *auth.Bearer
		wantErr  bool
	}{
		{name: "nil source", strategy: auth.NewBearerWithSource(nil), wantErr: true},
		{name: "empty static token", strategy: auth.NewBearer(""), wantErr: true},
		{name: "dynamic source", strategy: auth.NewBearerWithSource(auth.TokenFunc(func(context.Context) (string, error) {
			return "token", nil
		})), wantErr: false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := tt.strategy.Validate()
			if (err != nil) != tt.wantErr {
				t.Fatalf("Validate() error = %v, wantErr %v", err, tt.wantErr)
			}
			if tt.wantErr && !errors.Is(err, auth.ErrInvalidTokenSource) {
				t.Fatalf("Validate() error = %v, want ErrInvalidTokenSource", err)
			}
		})
	}
}

func TestBearerToken_Redaction(t *testing.T) {
	token := auth.BearerToken("secret-oauth-bearer-token")
	if token.String() != "[REDACTED_TOKEN]" {
		t.Fatalf("expected [REDACTED_TOKEN], got %s", token.String())
	}
	if token.LogValue().String() != "[REDACTED_TOKEN]" {
		t.Fatalf("expected [REDACTED_TOKEN], got %s", token.LogValue().String())
	}
	if goStr := token.GoString(); goStr != `auth.BearerToken("[REDACTED_TOKEN]")` {
		t.Fatalf("expected GoString redaction, got %s", goStr)
	}

	data, err := token.MarshalJSON()
	if err != nil || string(data) != `"[REDACTED_TOKEN]"` {
		t.Fatalf("expected JSON redaction, got %s (err: %v)", string(data), err)
	}
}

func TestCredentials_FullRedactionCoverage(t *testing.T) {
	key := auth.APIKey("my-long-test-api-key-12345")
	secret := auth.APISecret("super-secret-hmac-key")

	if key.String() != "my-l...2345" {
		t.Fatalf("expected masked key, got %s", key.String())
	}
	if key.GoString() != `auth.APIKey("my-l...2345")` {
		t.Fatalf("expected GoString masked key, got %s", key.GoString())
	}

	keyJSON, _ := key.MarshalJSON()
	if string(keyJSON) != `"my-l...2345"` {
		t.Fatalf("expected JSON masked key, got %s", string(keyJSON))
	}

	if secret.String() != "[REDACTED_SECRET]" {
		t.Fatalf("expected [REDACTED_SECRET], got %s", secret.String())
	}
	if secret.GoString() != `auth.APISecret("[REDACTED_SECRET]")` {
		t.Fatalf("expected GoString [REDACTED_SECRET], got %s", secret.GoString())
	}

	secretJSON, _ := secret.MarshalJSON()
	if string(secretJSON) != `"[REDACTED_SECRET]"` {
		t.Fatalf("expected JSON [REDACTED_SECRET], got %s", string(secretJSON))
	}
}

func TestBearer_ErrorPropagation(t *testing.T) {
	ctx := context.Background()
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, "https://api.gemini.com/v1/balances", nil)
	if err != nil {
		t.Fatalf("failed creating request: %v", err)
	}

	// 1. NewBearerWithSource(nil) must return error on Authenticate
	nilStrategy := auth.NewBearerWithSource(nil)
	if err := nilStrategy.Authenticate(ctx, req, nil); err == nil {
		t.Fatal("expected error with nil TokenSource, got nil")
	}

	// 2. TokenSource error must propagate wrapped
	sourceErr := fmt.Errorf("oauth token renewal failure")
	failingSource := auth.TokenFunc(func(ctx context.Context) (string, error) {
		return "", sourceErr
	})

	failingStrategy := auth.NewBearerWithSource(failingSource)
	if err := failingStrategy.Authenticate(ctx, req, nil); err == nil {
		t.Fatal("expected error from failing TokenSource, got nil")
	}

	if key := failingStrategy.Key(); key != "[BEARER_AUTH]" {
		t.Fatalf("expected key [BEARER_AUTH], got %s", key)
	}
}
