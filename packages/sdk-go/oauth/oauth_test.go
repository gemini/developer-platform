package oauth

import (
	"context"
	"crypto/sha256"
	"encoding/base64"
	"errors"
	"fmt"
	"net"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

const testVerifier = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-._~"

func TestGeneratePKCE(t *testing.T) {
	verifier, challenge, err := GeneratePKCE()
	if err != nil {
		t.Fatalf("GeneratePKCE() error = %v", err)
	}
	if err := validateVerifier(verifier); err != nil {
		t.Fatalf("generated verifier is invalid: %v", err)
	}
	want := sha256.Sum256([]byte(verifier))
	if got := base64.RawURLEncoding.EncodeToString(want[:]); got != challenge {
		t.Fatalf("challenge = %q, want %q", challenge, got)
	}
	secondVerifier, _, err := GeneratePKCE()
	if err != nil {
		t.Fatalf("second GeneratePKCE() error = %v", err)
	}
	if verifier == secondVerifier {
		t.Fatal("GeneratePKCE returned the same verifier twice")
	}
}

func TestTokenFormattingDoesNotExposeCredentials(t *testing.T) {
	token := Token{
		AccessToken:  "access-token-secret",
		RefreshToken: "refresh-token-secret",
		TokenType:    "Bearer",
		ExpiresAt:    time.Unix(123, 0),
		Scope:        "account:read",
	}
	formatted := fmt.Sprintf("%v %#v", token, token)
	if strings.Contains(formatted, "access-token-secret") || strings.Contains(formatted, "refresh-token-secret") {
		t.Fatalf("token formatting exposed credentials: %s", formatted)
	}
	if !strings.Contains(formatted, "<redacted>") {
		t.Fatalf("token formatting omitted redaction marker: %s", formatted)
	}
}

func TestConfigFormattingDoesNotExposeClientSecret(t *testing.T) {
	cfg := Config{
		ClientID:     "client-id",
		ClientSecret: "client-secret",
		Endpoint:     Endpoint{AuthURL: "https://exchange.example/auth", TokenURL: "https://exchange.example/token"},
		RedirectURL:  "http://localhost:8787/callback",
		Scopes:       []string{"account:read"},
	}
	formatted := fmt.Sprintf("%v %#v", cfg, cfg)
	if strings.Contains(formatted, cfg.ClientSecret) {
		t.Fatalf("OAuth config formatting exposed client secret: %s", formatted)
	}
	if !strings.Contains(formatted, "<redacted>") {
		t.Fatalf("OAuth config formatting omitted redaction marker: %s", formatted)
	}
}

func TestAuthCodeURLIncludesPKCEWithoutSecrets(t *testing.T) {
	cfg := Config{
		ClientID:     "cli-client-id",
		ClientSecret: "do-not-put-this-in-a-url",
		Endpoint:     Endpoint{AuthURL: "https://exchange.example/auth", TokenURL: "https://exchange.example/auth/token"},
		RedirectURL:  "http://localhost:8787/callback",
		Scopes:       []string{"account:read", "orders:create"},
	}
	got, err := cfg.AuthCodeURL("state-value", testVerifier)
	if err != nil {
		t.Fatalf("AuthCodeURL() error = %v", err)
	}
	parsed, err := url.Parse(got)
	if err != nil {
		t.Fatalf("parse AuthCodeURL() result: %v", err)
	}
	query := parsed.Query()
	if query.Get("client_id") != cfg.ClientID || query.Get("response_type") != "code" || query.Get("redirect_uri") != cfg.RedirectURL {
		t.Fatalf("unexpected authorization query: %v", query)
	}
	if query.Get("code_challenge_method") != "S256" || query.Get("code_challenge") != pkceChallenge(testVerifier) {
		t.Fatalf("unexpected PKCE query: %v", query)
	}
	if query.Get("scope") != "account:read,orders:create" {
		t.Fatalf("scope = %q", query.Get("scope"))
	}
	if strings.Contains(got, cfg.ClientSecret) || strings.Contains(got, "code_verifier") {
		t.Fatalf("authorization URL contains sensitive PKCE/client-secret data: %s", got)
	}
}

func TestConfigRejectsInsecureEndpointsAndRedirects(t *testing.T) {
	cfg := validConfig("https://exchange.example")
	cfg.Endpoint.TokenURL = "http://exchange.example/token"
	if _, err := cfg.AuthCodeURL("state", testVerifier); !errors.Is(err, ErrInvalidConfig) {
		t.Fatalf("AuthCodeURL() error = %v, want ErrInvalidConfig", err)
	}

	cfg = validConfig("https://exchange.example")
	cfg.RedirectURL = "http://example.com/callback"
	if _, err := cfg.AuthCodeURL("state", testVerifier); !errors.Is(err, ErrInvalidRedirectURL) {
		t.Fatalf("AuthCodeURL() error = %v, want ErrInvalidRedirectURL", err)
	}

	cfg = validConfig("https://exchange.example")
	cfg.RedirectURL = "https://example.com/callback?secret=not-allowed"
	if _, err := cfg.AuthCodeURL("state", testVerifier); !errors.Is(err, ErrInvalidRedirectURL) {
		t.Fatalf("AuthCodeURL() error = %v, want ErrInvalidRedirectURL", err)
	}
}

func TestAuthorizeExchangesCodeWithPKCE(t *testing.T) {
	var authorizationQuery url.Values
	server := httptest.NewTLSServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		if request.URL.Path != "/token" {
			http.NotFound(writer, request)
			return
		}
		if request.Method != http.MethodPost || request.Header.Get("Authorization") != "" {
			t.Errorf("unexpected token request: method=%s authorization=%q", request.Method, request.Header.Get("Authorization"))
		}
		if err := request.ParseForm(); err != nil {
			t.Errorf("ParseForm() error = %v", err)
		}
		if request.Form.Get("grant_type") != "authorization_code" || request.Form.Get("client_id") != "client-id" || request.Form.Get("code") != "auth-code" {
			t.Errorf("unexpected token form: %v", request.Form)
		}
		if request.Form.Get("redirect_uri") != "http://localhost:8787/callback" {
			t.Errorf("redirect_uri = %q", request.Form.Get("redirect_uri"))
		}
		if authorizationQuery.Get("code_challenge") != pkceChallenge(request.Form.Get("code_verifier")) {
			t.Errorf("code verifier did not match authorization challenge")
		}
		writer.Header().Set("Content-Type", "application/json")
		_, _ = writer.Write([]byte(`{"access_token":"access-token","refresh_token":"refresh-token","token_type":"Bearer","expires_in":3600,"scope":"account:read"}`))
	}))
	defer server.Close()

	cfg := validConfig(server.URL)
	cfg.HTTPClient = server.Client()
	token, err := cfg.Authorize(context.Background(), func(_ context.Context, authURL string) (string, string, error) {
		parsed, parseErr := url.Parse(authURL)
		if parseErr != nil {
			return "", "", parseErr
		}
		authorizationQuery = parsed.Query()
		return "auth-code", authorizationQuery.Get("state"), nil
	})
	if err != nil {
		t.Fatalf("Authorize() error = %v", err)
	}
	if token.AccessToken != "access-token" || token.RefreshToken != "refresh-token" || token.TokenType != "Bearer" || token.Scope != "account:read" {
		t.Fatalf("unexpected token: %+v", token)
	}
	if token.ExpiresAt.IsZero() {
		t.Fatal("expected token expiry")
	}
}

func TestAuthorizeRejectsStateMismatchBeforeTokenExchange(t *testing.T) {
	var exchanges atomic.Int32
	server := httptest.NewTLSServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		exchanges.Add(1)
		writer.WriteHeader(http.StatusInternalServerError)
	}))
	defer server.Close()

	cfg := validConfig(server.URL)
	cfg.HTTPClient = server.Client()
	_, err := cfg.Authorize(context.Background(), func(context.Context, string) (string, string, error) {
		return "auth-code", "wrong-state", nil
	})
	if !errors.Is(err, ErrStateMismatch) {
		t.Fatalf("Authorize() error = %v, want ErrStateMismatch", err)
	}
	if exchanges.Load() != 0 {
		t.Fatalf("token endpoint called %d times after state mismatch", exchanges.Load())
	}
}

func TestLoginRejectsInvalidCallbackStateAndThenAcceptsValidCallback(t *testing.T) {
	server := httptest.NewTLSServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		writer.Header().Set("Content-Type", "application/json")
		_, _ = writer.Write([]byte(`{"access_token":"access-token","refresh_token":"refresh-token","token_type":"Bearer"}`))
	}))
	defer server.Close()

	port := freeLoopbackPort(t)
	cfg := validConfig(server.URL)
	cfg.RedirectURL = fmt.Sprintf("http://127.0.0.1:%d/callback", port)
	cfg.HTTPClient = server.Client()

	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	token, err := cfg.Login(ctx, func(authURL string) error {
		parsed, parseErr := url.Parse(authURL)
		if parseErr != nil {
			return parseErr
		}
		callback := cfg.RedirectURL + "?code=wrong-code&state=wrong-state"
		response, requestErr := http.Get(callback)
		if requestErr != nil {
			return requestErr
		}
		_ = response.Body.Close()
		if response.StatusCode != http.StatusBadRequest {
			return fmt.Errorf("wrong-state callback status = %d", response.StatusCode)
		}
		callback = cfg.RedirectURL + "?code=auth-code&state=" + url.QueryEscape(parsed.Query().Get("state"))
		response, requestErr = http.Get(callback)
		if requestErr != nil {
			return requestErr
		}
		_ = response.Body.Close()
		if response.StatusCode != http.StatusOK {
			return fmt.Errorf("valid callback status = %d", response.StatusCode)
		}
		return nil
	})
	if err != nil {
		t.Fatalf("Login() error = %v", err)
	}
	if token.AccessToken != "access-token" {
		t.Fatalf("unexpected token: %+v", token)
	}
}

func TestListenLoopbackBindsOnlyLoopbackAddresses(t *testing.T) {
	listeners, err := listenLoopback("localhost", fmt.Sprintf("%d", freeLoopbackPort(t)))
	if err != nil {
		t.Fatalf("listenLoopback() error = %v", err)
	}
	for _, listener := range listeners {
		listener := listener
		t.Cleanup(func() { _ = listener.Close() })
		host, _, err := net.SplitHostPort(listener.Addr().String())
		if err != nil {
			t.Fatalf("split listener address %q: %v", listener.Addr(), err)
		}
		ip := net.ParseIP(host)
		if ip == nil || !ip.IsLoopback() {
			t.Fatalf("listener bound to non-loopback address %q", listener.Addr())
		}
	}
}

func TestWriteCallbackResponseEscapesBody(t *testing.T) {
	recorder := httptest.NewRecorder()
	writeCallbackResponse(recorder, http.StatusOK, "<script>alert(1)</script>")

	if strings.Contains(recorder.Body.String(), "<script>") {
		t.Fatalf("callback response was not escaped: %q", recorder.Body.String())
	}
	if !strings.Contains(recorder.Body.String(), "&lt;script&gt;") {
		t.Fatalf("callback response lost escaped content: %q", recorder.Body.String())
	}
}

func TestLoginRequiresLoopbackCallbackAndBrowserOpener(t *testing.T) {
	cfg := validConfig("https://exchange.example")
	if _, err := cfg.Login(context.Background(), nil); !errors.Is(err, ErrBrowserOpenerRequired) {
		t.Fatalf("Login() error = %v, want ErrBrowserOpenerRequired", err)
	}

	cfg.RedirectURL = "http://example.com/callback"
	if _, err := cfg.Login(context.Background(), func(string) error { return nil }); !errors.Is(err, ErrInvalidRedirectURL) {
		t.Fatalf("Login() error = %v, want ErrInvalidRedirectURL", err)
	}
}

func TestTokenSourceRefreshesOnceForConcurrentCallers(t *testing.T) {
	var refreshes atomic.Int32
	updates := make(chan Token, 1)
	server := httptest.NewTLSServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		refreshes.Add(1)
		if err := request.ParseForm(); err != nil {
			t.Errorf("ParseForm() error = %v", err)
		}
		if request.Form.Get("grant_type") != "refresh_token" || request.Form.Get("refresh_token") != "refresh-token" {
			t.Errorf("unexpected refresh form: %v", request.Form)
		}
		writer.Header().Set("Content-Type", "application/json")
		_, _ = writer.Write([]byte(`{"access_token":"refreshed-token","refresh_token":"rotated-token","token_type":"Bearer","expires_in":3600}`))
	}))
	defer server.Close()

	cfg := validConfig(server.URL)
	cfg.HTTPClient = server.Client()
	source, err := NewTokenSource(cfg, Token{
		AccessToken:  "expired-token",
		RefreshToken: "refresh-token",
		ExpiresAt:    time.Now().Add(-time.Hour),
	}, WithEarlyExpiry(0), WithTokenUpdate(func(_ context.Context, token Token) error {
		updates <- token
		return nil
	}))
	if err != nil {
		t.Fatalf("NewTokenSource() error = %v", err)
	}

	const callers = 16
	results := make(chan string, callers)
	errorsCh := make(chan error, callers)
	var wg sync.WaitGroup
	wg.Add(callers)
	for i := 0; i < callers; i++ {
		go func() {
			defer wg.Done()
			value, callErr := source.Token(context.Background())
			results <- value
			errorsCh <- callErr
		}()
	}
	wg.Wait()
	close(results)
	close(errorsCh)
	for callErr := range errorsCh {
		if callErr != nil {
			t.Fatalf("Token() error = %v", callErr)
		}
	}
	for value := range results {
		if value != "refreshed-token" {
			t.Fatalf("Token() = %q, want refreshed-token", value)
		}
	}
	if refreshes.Load() != 1 {
		t.Fatalf("refresh endpoint called %d times, want 1", refreshes.Load())
	}
	select {
	case updated := <-updates:
		if updated.AccessToken != "refreshed-token" || updated.RefreshToken != "rotated-token" || updated.ExpiresAt.IsZero() {
			t.Fatalf("updated token = %+v, want complete rotated token", updated)
		}
	default:
		t.Fatal("token update callback was not called")
	}
}

func TestTokenSourceUpdateFailureIsSanitizedAndLeavesTokenUnchanged(t *testing.T) {
	var refreshes atomic.Int32
	server := httptest.NewTLSServer(http.HandlerFunc(func(writer http.ResponseWriter, _ *http.Request) {
		refreshes.Add(1)
		writer.Header().Set("Content-Type", "application/json")
		_, _ = writer.Write([]byte(`{"access_token":"refreshed-token","refresh_token":"rotated-token","token_type":"Bearer","expires_in":3600}`))
	}))
	defer server.Close()

	cfg := validConfig(server.URL)
	cfg.HTTPClient = server.Client()
	persistenceErr := errors.New("keyring failure containing secret-token-material")
	var failUpdate atomic.Bool
	failUpdate.Store(true)
	source, err := NewTokenSource(cfg, Token{
		AccessToken:  "expired-token",
		RefreshToken: "refresh-token",
		ExpiresAt:    time.Now().Add(-time.Hour),
	}, WithEarlyExpiry(0), WithTokenUpdate(func(_ context.Context, _ Token) error {
		if failUpdate.Load() {
			return persistenceErr
		}
		return nil
	}))
	if err != nil {
		t.Fatalf("NewTokenSource() error = %v", err)
	}

	_, err = source.Token(context.Background())
	if !errors.Is(err, ErrTokenRefresh) || !errors.Is(err, ErrTokenUpdate) || !errors.Is(err, persistenceErr) {
		t.Fatalf("Token() error = %v, want refresh, update, and persistence errors", err)
	}
	if strings.Contains(err.Error(), "secret-token-material") {
		t.Fatalf("Token() error exposed callback details: %v", err)
	}

	failUpdate.Store(false)
	got, err := source.Token(context.Background())
	if err != nil || got != "refreshed-token" {
		t.Fatalf("retry Token() = %q, %v; want refreshed-token, nil", got, err)
	}
	if refreshes.Load() != 2 {
		t.Fatalf("refresh endpoint called %d times, want 2 after failed persistence", refreshes.Load())
	}
}

func TestTokenSourceWaitingCallHonorsCancellation(t *testing.T) {
	refreshStarted := make(chan struct{})
	releaseRefresh := make(chan struct{})
	var refreshes atomic.Int32
	server := httptest.NewTLSServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		refreshes.Add(1)
		close(refreshStarted)
		<-releaseRefresh
		writer.Header().Set("Content-Type", "application/json")
		_, _ = writer.Write([]byte(`{"access_token":"refreshed-token","token_type":"Bearer","expires_in":3600}`))
	}))
	defer server.Close()

	cfg := validConfig(server.URL)
	cfg.HTTPClient = server.Client()
	source, err := NewTokenSource(cfg, Token{AccessToken: "expired", RefreshToken: "refresh", ExpiresAt: time.Now().Add(-time.Hour)}, WithEarlyExpiry(0))
	if err != nil {
		t.Fatalf("NewTokenSource() error = %v", err)
	}

	firstResult := make(chan error, 1)
	go func() {
		_, callErr := source.Token(context.Background())
		firstResult <- callErr
	}()
	select {
	case <-refreshStarted:
	case <-time.After(time.Second):
		t.Fatal("timed out waiting for refresh to start")
	}

	ctx, cancel := context.WithCancel(context.Background())
	canceledResult := make(chan error, 1)
	go func() {
		_, callErr := source.Token(ctx)
		canceledResult <- callErr
	}()
	cancel()
	select {
	case callErr := <-canceledResult:
		if !errors.Is(callErr, context.Canceled) {
			t.Fatalf("waiting Token() error = %v, want context.Canceled", callErr)
		}
	case <-time.After(time.Second):
		t.Fatal("canceled Token() did not return")
	}
	close(releaseRefresh)
	if callErr := <-firstResult; callErr != nil {
		t.Fatalf("first Token() error = %v", callErr)
	}
	if refreshes.Load() != 1 {
		t.Fatalf("refresh endpoint called %d times, want 1", refreshes.Load())
	}
}

func TestTokenSourceLeaderCancellationDoesNotCancelSharedRefresh(t *testing.T) {
	refreshStarted := make(chan struct{})
	releaseRefresh := make(chan struct{})
	var refreshes atomic.Int32
	server := httptest.NewTLSServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		refreshes.Add(1)
		close(refreshStarted)
		<-releaseRefresh
		writer.Header().Set("Content-Type", "application/json")
		_, _ = writer.Write([]byte(`{"access_token":"refreshed-token","token_type":"Bearer","expires_in":3600}`))
	}))
	defer server.Close()

	cfg := validConfig(server.URL)
	cfg.HTTPClient = server.Client()
	source, err := NewTokenSource(cfg, Token{AccessToken: "expired", RefreshToken: "refresh", ExpiresAt: time.Now().Add(-time.Hour)}, WithEarlyExpiry(0))
	if err != nil {
		t.Fatalf("NewTokenSource() error = %v", err)
	}

	leaderCtx, cancelLeader := context.WithCancel(context.Background())
	leaderResult := make(chan error, 1)
	go func() {
		_, callErr := source.Token(leaderCtx)
		leaderResult <- callErr
	}()
	select {
	case <-refreshStarted:
	case <-time.After(time.Second):
		t.Fatal("timed out waiting for refresh to start")
	}

	waiterResult := make(chan struct {
		token string
		err   error
	}, 1)
	go func() {
		token, callErr := source.Token(context.Background())
		waiterResult <- struct {
			token string
			err   error
		}{token: token, err: callErr}
	}()
	cancelLeader()

	select {
	case callErr := <-leaderResult:
		if !errors.Is(callErr, context.Canceled) {
			t.Fatalf("leader Token() error = %v, want context.Canceled", callErr)
		}
	case <-time.After(time.Second):
		t.Fatal("canceled leader Token() did not return")
	}

	close(releaseRefresh)
	select {
	case result := <-waiterResult:
		if result.err != nil || result.token != "refreshed-token" {
			t.Fatalf("waiting Token() = %q, %v; want refreshed-token, nil", result.token, result.err)
		}
	case <-time.After(time.Second):
		t.Fatal("waiting Token() did not receive the shared refresh result")
	}
	if refreshes.Load() != 1 {
		t.Fatalf("refresh endpoint called %d times, want 1", refreshes.Load())
	}
}

func TestTokenRequestsDoNotRetryOrFollowRedirects(t *testing.T) {
	var redirected atomic.Int32
	target := httptest.NewTLSServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		redirected.Add(1)
		writer.WriteHeader(http.StatusOK)
	}))
	defer target.Close()

	var requests atomic.Int32
	server := httptest.NewTLSServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		requests.Add(1)
		http.Redirect(writer, request, target.URL, http.StatusFound)
	}))
	defer server.Close()

	cfg := validConfig(server.URL)
	cfg.HTTPClient = server.Client()
	_, err := cfg.Refresh(context.Background(), "refresh-token")
	if !errors.Is(err, ErrRedirectNotAllowed) {
		t.Fatalf("Refresh() error = %v, want ErrRedirectNotAllowed", err)
	}
	if requests.Load() != 1 || redirected.Load() != 0 {
		t.Fatalf("token endpoint requests=%d redirected requests=%d, want 1 and 0", requests.Load(), redirected.Load())
	}
}

func TestTokenEndpointErrorsDoNotExposeRequestSecrets(t *testing.T) {
	server := httptest.NewTLSServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		writer.Header().Set("Content-Type", "application/json")
		_, _ = writer.Write([]byte(`{"error":"invalid_grant","error_description":"refresh-token-should-not-appear"}`))
	}))
	defer server.Close()

	cfg := validConfig(server.URL)
	cfg.HTTPClient = server.Client()
	_, err := cfg.Refresh(context.Background(), "refresh-token")
	if !errors.Is(err, ErrTokenEndpoint) {
		t.Fatalf("Refresh() error = %v, want ErrTokenEndpoint", err)
	}
	if strings.Contains(err.Error(), "refresh-token") {
		t.Fatalf("Refresh() error exposed a request secret: %v", err)
	}
}

func TestNewTokenSourceRejectsInvalidInitialToken(t *testing.T) {
	cfg := validConfig("https://exchange.example")
	if _, err := NewTokenSource(cfg, Token{}); !errors.Is(err, ErrInvalidToken) {
		t.Fatalf("NewTokenSource() error = %v, want ErrInvalidToken", err)
	}
	if _, err := NewTokenSource(cfg, Token{AccessToken: "token", TokenType: "MAC"}); !errors.Is(err, ErrInvalidToken) {
		t.Fatalf("NewTokenSource() error = %v, want ErrInvalidToken", err)
	}
	if _, err := NewTokenSource(cfg, Token{AccessToken: "token"}, WithEarlyExpiry(-time.Second)); !errors.Is(err, ErrInvalidConfig) {
		t.Fatalf("NewTokenSource() error = %v, want ErrInvalidConfig", err)
	}
}

func validConfig(baseURL string) Config {
	return Config{
		ClientID:    "client-id",
		Endpoint:    Endpoint{AuthURL: baseURL + "/authorize", TokenURL: baseURL + "/token"},
		RedirectURL: "http://localhost:8787/callback",
		Scopes:      []string{"account:read"},
	}
}

func freeLoopbackPort(t *testing.T) int {
	t.Helper()
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("listen for free port: %v", err)
	}
	port := listener.Addr().(*net.TCPAddr).Port
	if err := listener.Close(); err != nil {
		t.Fatalf("close free port listener: %v", err)
	}
	return port
}
