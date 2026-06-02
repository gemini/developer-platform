package oauth

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func TestGeneratePKCE(t *testing.T) {
	pkce, err := GeneratePKCE()
	if err != nil {
		t.Fatalf("GeneratePKCE() error = %v", err)
	}

	if pkce.Method != "S256" {
		t.Errorf("Method = %s, want S256", pkce.Method)
	}
	if len(pkce.CodeVerifier) == 0 {
		t.Error("CodeVerifier is empty")
	}
	if len(pkce.CodeChallenge) == 0 {
		t.Error("CodeChallenge is empty")
	}
	if pkce.CodeVerifier == pkce.CodeChallenge {
		t.Error("CodeVerifier and CodeChallenge should differ")
	}

	pkce2, err := GeneratePKCE()
	if err != nil {
		t.Fatalf("GeneratePKCE() second call error = %v", err)
	}
	if pkce.CodeVerifier == pkce2.CodeVerifier {
		t.Error("two calls produced same CodeVerifier")
	}
}

func TestGenerateState(t *testing.T) {
	state1, err := GenerateState()
	if err != nil {
		t.Fatalf("GenerateState() error = %v", err)
	}
	if len(state1) == 0 {
		t.Error("state is empty")
	}

	state2, err := GenerateState()
	if err != nil {
		t.Fatalf("GenerateState() second call error = %v", err)
	}
	if state1 == state2 {
		t.Error("two calls produced same state")
	}
}

func TestStartCallbackServer(t *testing.T) {
	port, resultCh, shutdown, err := StartCallbackServer()
	if err != nil {
		t.Fatalf("StartCallbackServer() error = %v", err)
	}
	defer shutdown()

	if port == 0 {
		t.Fatal("port should not be 0")
	}

	callbackURL := fmt.Sprintf("http://localhost:%d%s?code=test-code&state=test-state", port, CallbackPath)
	req, err := http.NewRequestWithContext(context.Background(), http.MethodGet, callbackURL, http.NoBody)
	if err != nil {
		t.Fatalf("callback request build error = %v", err)
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("callback request error = %v", err)
	}
	resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		t.Errorf("callback status = %d, want 200", resp.StatusCode)
	}

	select {
	case result := <-resultCh:
		if result.Code != "test-code" {
			t.Errorf("Code = %s, want test-code", result.Code)
		}
		if result.State != "test-state" {
			t.Errorf("State = %s, want test-state", result.State)
		}
		if result.Error != "" {
			t.Errorf("Error = %s, want empty", result.Error)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("timed out waiting for callback result")
	}
}

func TestCallbackServerError(t *testing.T) {
	port, resultCh, shutdown, err := StartCallbackServer()
	if err != nil {
		t.Fatalf("StartCallbackServer() error = %v", err)
	}
	defer shutdown()

	callbackURL := fmt.Sprintf("http://localhost:%d%s?error=access_denied", port, CallbackPath)
	req, err := http.NewRequestWithContext(context.Background(), http.MethodGet, callbackURL, http.NoBody)
	if err != nil {
		t.Fatalf("callback request build error = %v", err)
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("callback request error = %v", err)
	}
	resp.Body.Close()

	select {
	case result := <-resultCh:
		if result.Error != "access_denied" {
			t.Errorf("Error = %s, want access_denied", result.Error)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("timed out waiting for callback result")
	}
}

func TestBuildAuthorizationURL(t *testing.T) {
	endpoints := Endpoints{
		AuthorizationURL: "https://exchange.gemini.com/auth",
		TokenURL:         "https://exchange.gemini.com/auth/token",
	}

	pkce := &PKCEParams{
		CodeVerifier:  "verifier",
		CodeChallenge: "challenge",
		Method:        "S256",
	}

	url := BuildAuthorizationURL(endpoints, "test-client", pkce, "test-state", 12345)

	if url == "" {
		t.Fatal("URL is empty")
	}

	for _, want := range []string{
		"response_type=code",
		"client_id=test-client",
		"redirect_uri=",
		"state=test-state",
		"code_challenge=challenge",
		"code_challenge_method=S256",
		"scope=account%3Aread%2Cbalances%3Aread%2Corders%3Acreate%2Corders%3Aread%2Chistory%3Aread",
		"localhost%3A12345",
	} {
		if !strings.Contains(url, want) {
			t.Errorf("URL missing %q: %s", want, url)
		}
	}
}

func TestExchangeCode(t *testing.T) {
	expectedToken := &TokenResponse{
		TokenType:    "Bearer",
		ExpiresIn:    3600,
		AccessToken:  "test-access-token",
		RefreshToken: "test-refresh-token",
	}

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			t.Errorf("method = %s, want POST", r.Method)
		}
		if err := r.ParseForm(); err != nil {
			t.Fatalf("ParseForm() error = %v", err)
		}
		if r.FormValue("grant_type") != "authorization_code" {
			t.Errorf("grant_type = %s, want authorization_code", r.FormValue("grant_type"))
		}
		if r.FormValue("code") != "test-code" {
			t.Errorf("code = %s, want test-code", r.FormValue("code"))
		}
		if r.FormValue("code_verifier") != "test-verifier" {
			t.Errorf("code_verifier = %s, want test-verifier", r.FormValue("code_verifier"))
		}
		if _, ok := r.Form["client_secret"]; ok {
			t.Error("client_secret should be omitted for public clients")
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(expectedToken)
	}))
	defer server.Close()

	endpoints := Endpoints{TokenURL: server.URL}
	pkce := &PKCEParams{CodeVerifier: "test-verifier", CodeChallenge: "challenge", Method: "S256"}

	got, err := ExchangeCode(context.Background(), endpoints, "client-id", "", "test-code", pkce, 8080)
	if err != nil {
		t.Fatalf("ExchangeCode() error = %v", err)
	}

	if got.AccessToken != expectedToken.AccessToken {
		t.Errorf("AccessToken = %s, want %s", got.AccessToken, expectedToken.AccessToken)
	}
	if got.RefreshToken != expectedToken.RefreshToken {
		t.Errorf("RefreshToken = %s, want %s", got.RefreshToken, expectedToken.RefreshToken)
	}
	if got.ExpiresIn != expectedToken.ExpiresIn {
		t.Errorf("ExpiresIn = %d, want %d", got.ExpiresIn, expectedToken.ExpiresIn)
	}
}

func TestExchangeCodeWithClientSecret(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if err := r.ParseForm(); err != nil {
			t.Fatalf("ParseForm() error = %v", err)
		}
		if r.FormValue("client_secret") != "client-secret" {
			t.Errorf("client_secret = %s, want client-secret", r.FormValue("client_secret"))
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(&TokenResponse{
			TokenType:   "Bearer",
			ExpiresIn:   3600,
			AccessToken: "test-access-token",
		})
	}))
	defer server.Close()

	endpoints := Endpoints{TokenURL: server.URL}
	pkce := &PKCEParams{CodeVerifier: "test-verifier", CodeChallenge: "challenge", Method: "S256"}

	if _, err := ExchangeCode(context.Background(), endpoints, "client-id", "client-secret", "test-code", pkce, 8080); err != nil {
		t.Fatalf("ExchangeCode() error = %v", err)
	}
}

func TestRefreshTokens(t *testing.T) {
	expectedToken := &TokenResponse{
		TokenType:    "Bearer",
		ExpiresIn:    3600,
		AccessToken:  "new-access-token",
		RefreshToken: "new-refresh-token",
	}

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if err := r.ParseForm(); err != nil {
			t.Fatalf("ParseForm() error = %v", err)
		}
		if r.FormValue("grant_type") != "refresh_token" {
			t.Errorf("grant_type = %s, want refresh_token", r.FormValue("grant_type"))
		}
		if r.FormValue("refresh_token") != "old-refresh-token" {
			t.Errorf("refresh_token = %s, want old-refresh-token", r.FormValue("refresh_token"))
		}
		if _, ok := r.Form["client_secret"]; ok {
			t.Error("client_secret should be omitted for public clients")
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(expectedToken)
	}))
	defer server.Close()

	endpoints := Endpoints{TokenURL: server.URL}

	got, err := RefreshTokens(context.Background(), endpoints, "client-id", "", "old-refresh-token")
	if err != nil {
		t.Fatalf("RefreshTokens() error = %v", err)
	}

	if got.AccessToken != expectedToken.AccessToken {
		t.Errorf("AccessToken = %s, want %s", got.AccessToken, expectedToken.AccessToken)
	}
}

func TestRefreshTokensWithClientSecret(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if err := r.ParseForm(); err != nil {
			t.Fatalf("ParseForm() error = %v", err)
		}
		if r.FormValue("client_secret") != "client-secret" {
			t.Errorf("client_secret = %s, want client-secret", r.FormValue("client_secret"))
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(&TokenResponse{
			TokenType:   "Bearer",
			ExpiresIn:   3600,
			AccessToken: "new-access-token",
		})
	}))
	defer server.Close()

	endpoints := Endpoints{TokenURL: server.URL}
	if _, err := RefreshTokens(context.Background(), endpoints, "client-id", "client-secret", "old-refresh-token"); err != nil {
		t.Fatalf("RefreshTokens() error = %v", err)
	}
}

func TestTokenResponseError(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{
			"error":             "invalid_grant",
			"error_description": "authorization code expired",
		})
	}))
	defer server.Close()

	endpoints := Endpoints{TokenURL: server.URL}
	pkce := &PKCEParams{CodeVerifier: "v", CodeChallenge: "c", Method: "S256"}

	_, err := ExchangeCode(context.Background(), endpoints, "client-id", "client-secret", "bad-code", pkce, 8080)
	if err == nil {
		t.Fatal("expected error for invalid_grant response")
	}

	if !strings.Contains(err.Error(), "invalid_grant") {
		t.Errorf("error should contain 'invalid_grant': %v", err)
	}
}

func TestEndpointsForEnvironment(t *testing.T) {
	prod := EndpointsForEnvironment("production")
	if !strings.Contains(prod.AuthorizationURL, "exchange.gemini.com") {
		t.Errorf("production auth URL unexpected: %s", prod.AuthorizationURL)
	}

	sb := EndpointsForEnvironment("sandbox")
	if !strings.Contains(sb.AuthorizationURL, "sandbox") {
		t.Errorf("sandbox auth URL should contain 'sandbox': %s", sb.AuthorizationURL)
	}
}

func TestOAuthEnvironmentOverrides(t *testing.T) {
	t.Setenv(EnvOAuthClientID, "custom-client")
	t.Setenv(EnvOAuthClientSecret, "custom-secret")
	t.Setenv(EnvOAuthCallbackPort, "9009")

	if got := ClientID(); got != "custom-client" {
		t.Fatalf("ClientID() = %q, want custom-client", got)
	}
	if got := ClientSecret(); got != "custom-secret" {
		t.Fatalf("ClientSecret() = %q, want custom-secret", got)
	}
	port, err := CallbackPort()
	if err != nil {
		t.Fatalf("CallbackPort() error = %v", err)
	}
	if port != 9009 {
		t.Fatalf("CallbackPort() = %d, want 9009", port)
	}
}

func TestTokenResponseToStoredIncludesOAuthClientMetadata(t *testing.T) {
	resp := &TokenResponse{
		AccessToken:  "access",
		RefreshToken: "refresh",
		ExpiresIn:    3600,
		TokenType:    "Bearer",
		Scope:        "account:read,predictions:orders:write",
	}

	publicTokens := TokenResponseToStored(resp, "sandbox", "public-client", "")
	if publicTokens.ClientID != "public-client" {
		t.Fatalf("ClientID = %q, want public-client", publicTokens.ClientID)
	}
	if publicTokens.ClientType != ClientTypePublic {
		t.Fatalf("ClientType = %q, want %q", publicTokens.ClientType, ClientTypePublic)
	}
	if publicTokens.Scope != resp.Scope {
		t.Fatalf("Scope = %q, want %q", publicTokens.Scope, resp.Scope)
	}

	confidentialTokens := TokenResponseToStored(resp, "production", "confidential-client", "secret")
	if confidentialTokens.ClientID != "confidential-client" {
		t.Fatalf("ClientID = %q, want confidential-client", confidentialTokens.ClientID)
	}
	if confidentialTokens.ClientType != ClientTypeConfidential {
		t.Fatalf("ClientType = %q, want %q", confidentialTokens.ClientType, ClientTypeConfidential)
	}
}

func TestCallbackPortDefaultAndValidation(t *testing.T) {
	port, err := CallbackPort()
	if err != nil {
		t.Fatalf("CallbackPort() default error = %v", err)
	}
	if port != DefaultCallbackPort {
		t.Fatalf("CallbackPort() default = %d, want %d", port, DefaultCallbackPort)
	}

	t.Setenv(EnvOAuthCallbackPort, "not-a-port")
	if _, err := CallbackPort(); err == nil {
		t.Fatal("expected invalid callback port to fail")
	}
}

func TestSaveLoadDeleteTokensScopedByEnvironment(t *testing.T) {
	origSave := saveOAuthTokensFn
	origLoad := loadOAuthTokensFn
	origDelete := deleteOAuthTokensFn
	t.Cleanup(func() {
		saveOAuthTokensFn = origSave
		loadOAuthTokensFn = origLoad
		deleteOAuthTokensFn = origDelete
	})

	store := map[string][]byte{}
	saveOAuthTokensFn = func(env string, data []byte) error {
		store[env] = append([]byte(nil), data...)
		return nil
	}
	loadOAuthTokensFn = func(env string) ([]byte, error) {
		return append([]byte(nil), store[env]...), nil
	}
	deleteOAuthTokensFn = func(env string) error {
		delete(store, env)
		return nil
	}

	prod := &StoredTokens{
		AccessToken:  "prod-access",
		RefreshToken: "prod-refresh",
		ExpiresAt:    time.Now().Add(time.Hour),
		TokenType:    "Bearer",
		Environment:  "production",
	}
	sandbox := &StoredTokens{
		AccessToken:  "sandbox-access",
		RefreshToken: "sandbox-refresh",
		ExpiresAt:    time.Now().Add(time.Hour),
		TokenType:    "Bearer",
		Environment:  "sandbox",
	}

	if err := SaveTokens(prod); err != nil {
		t.Fatalf("SaveTokens(prod) error = %v", err)
	}
	if err := SaveTokens(sandbox); err != nil {
		t.Fatalf("SaveTokens(sandbox) error = %v", err)
	}

	gotProd, err := LoadTokens("production")
	if err != nil {
		t.Fatalf("LoadTokens(production) error = %v", err)
	}
	if gotProd.AccessToken != "prod-access" {
		t.Fatalf("production AccessToken = %q, want prod-access", gotProd.AccessToken)
	}

	gotSandbox, err := LoadTokens("sandbox")
	if err != nil {
		t.Fatalf("LoadTokens(sandbox) error = %v", err)
	}
	if gotSandbox.AccessToken != "sandbox-access" {
		t.Fatalf("sandbox AccessToken = %q, want sandbox-access", gotSandbox.AccessToken)
	}

	if err := DeleteTokens("sandbox"); err != nil {
		t.Fatalf("DeleteTokens(sandbox) error = %v", err)
	}
	if _, ok := store["production"]; !ok {
		t.Fatal("DeleteTokens(sandbox) removed production tokens")
	}
	if _, ok := store["sandbox"]; ok {
		t.Fatal("DeleteTokens(sandbox) did not remove sandbox tokens")
	}
}

func TestTokenManagerLoadsAndRefreshesPerEnvironment(t *testing.T) {
	origLoad := loadOAuthTokensFn
	origSave := saveOAuthTokensFn
	origDelete := deleteOAuthTokensFn
	origRefresh := refreshTokensFn
	t.Cleanup(func() {
		loadOAuthTokensFn = origLoad
		saveOAuthTokensFn = origSave
		deleteOAuthTokensFn = origDelete
		refreshTokensFn = origRefresh
	})
	t.Setenv(EnvOAuthClientID, "runtime-client")
	t.Setenv(EnvOAuthClientSecret, "runtime-secret")

	store := map[string][]byte{
		"production": []byte(`{"access_token":"prod-access","refresh_token":"prod-refresh","expires_at":"2000-01-01T00:00:00Z","token_type":"Bearer","environment":"production"}`),
		"sandbox":    []byte(`{"access_token":"sandbox-access","refresh_token":"sandbox-refresh","scope":"account:read,predictions:orders:write","expires_at":"2000-01-01T00:00:00Z","token_type":"Bearer","environment":"sandbox","client_id":"sandbox-client","client_type":"public"}`),
	}
	loadOAuthTokensFn = func(env string) ([]byte, error) {
		return append([]byte(nil), store[env]...), nil
	}
	saveOAuthTokensFn = func(env string, data []byte) error {
		store[env] = append([]byte(nil), data...)
		return nil
	}
	deleteOAuthTokensFn = func(env string) error {
		delete(store, env)
		return nil
	}
	refreshCalls := []string{}
	refreshTokensFn = func(ctx context.Context, endpoints Endpoints, clientID, clientSecret, refreshToken string) (*TokenResponse, error) {
		refreshCalls = append(refreshCalls, refreshToken)
		if clientID != "sandbox-client" {
			return nil, fmt.Errorf("clientID = %q, want sandbox-client", clientID)
		}
		if clientSecret != "" {
			return nil, fmt.Errorf("clientSecret = %q, want empty", clientSecret)
		}
		if refreshToken == "sandbox-refresh" {
			return &TokenResponse{
				AccessToken:  "sandbox-new-access",
				RefreshToken: "sandbox-new-refresh",
				ExpiresIn:    3600,
				TokenType:    "Bearer",
			}, nil
		}
		return nil, errors.New("unexpected refresh token")
	}

	tm := NewTokenManager("sandbox")
	got, err := tm.GetValidAccessToken(context.Background())
	if err != nil {
		t.Fatalf("GetValidAccessToken() error = %v", err)
	}
	if got != "sandbox-new-access" {
		t.Fatalf("GetValidAccessToken() = %q, want sandbox-new-access", got)
	}
	if len(refreshCalls) != 1 || refreshCalls[0] != "sandbox-refresh" {
		t.Fatalf("refreshCalls = %v, want [sandbox-refresh]", refreshCalls)
	}
	refreshedSandbox, err := LoadTokens("sandbox")
	if err != nil {
		t.Fatalf("LoadTokens(sandbox) error = %v", err)
	}
	if refreshedSandbox.ClientID != "sandbox-client" {
		t.Fatalf("refreshed sandbox ClientID = %q, want sandbox-client", refreshedSandbox.ClientID)
	}
	if refreshedSandbox.ClientType != ClientTypePublic {
		t.Fatalf("refreshed sandbox ClientType = %q, want %q", refreshedSandbox.ClientType, ClientTypePublic)
	}
	if refreshedSandbox.Scope != "account:read,predictions:orders:write" {
		t.Fatalf("refreshed sandbox Scope = %q, want previous scope", refreshedSandbox.Scope)
	}

	prodTokens, err := LoadTokens("production")
	if err != nil {
		t.Fatalf("LoadTokens(production) error = %v", err)
	}
	if prodTokens.AccessToken != "prod-access" {
		t.Fatalf("production token mutated to %q", prodTokens.AccessToken)
	}
}
