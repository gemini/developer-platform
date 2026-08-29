package gemini_test

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"

	"github.com/gemini/developer-platform/packages/sdk-go"
	"github.com/gemini/developer-platform/packages/sdk-go/auth"
	"github.com/gemini/developer-platform/packages/sdk-go/geminitest"
	"github.com/gemini/developer-platform/packages/sdk-go/generated/account"
	"github.com/gemini/developer-platform/packages/sdk-go/generated/predictions"
	"github.com/gemini/developer-platform/packages/sdk-go/generated/trading"
	"github.com/gemini/developer-platform/packages/sdk-go/transport"
	"github.com/gemini/developer-platform/packages/sdk-go/websocket"
)

type trackingRoundTripper struct {
	closeIdleCalls atomic.Int32
	roundTrips     atomic.Int32
}

func (t *trackingRoundTripper) RoundTrip(*http.Request) (*http.Response, error) {
	t.roundTrips.Add(1)
	return nil, errors.New("tracking transport: RoundTrip not expected")
}

func (t *trackingRoundTripper) CloseIdleConnections() {
	t.closeIdleCalls.Add(1)
}

func TestClient_InvalidEnvironmentFailsClosed(t *testing.T) {
	_, err := gemini.NewClientWithError(gemini.WithEnvironment(gemini.Environment("sandbxo")))
	if !errors.Is(err, gemini.ErrInvalidEnvironment) {
		t.Fatalf("expected invalid environment error, got %v", err)
	}

	client := gemini.NewClient(gemini.WithEnvironment(gemini.Environment("sandbxo")))
	defer client.Close()
	if _, err := client.MarketData.GetSymbols(context.Background()); !errors.Is(err, gemini.ErrInvalidEnvironment) {
		t.Fatalf("expected invalid environment request error, got %v", err)
	}

	validClient, err := gemini.NewClientWithError(
		gemini.WithEnvironment(gemini.Environment("sandbxo")),
		gemini.WithEnvironment(gemini.Sandbox),
	)
	if err != nil {
		t.Fatalf("expected a later valid environment option to recover configuration, got %v", err)
	}
	defer validClient.Close()
}

func TestClient_InvalidCustomEndpointsFailEarly(t *testing.T) {
	if _, err := gemini.NewClientWithError(gemini.WithCustomRESTURL("api.gemini.local")); !errors.Is(err, gemini.ErrInvalidEndpointURL) {
		t.Fatalf("expected invalid REST endpoint error, got %v", err)
	}
	if _, err := gemini.NewClientWithError(gemini.WithCustomWSURL("https://ws.gemini.local")); !errors.Is(err, gemini.ErrInvalidEndpointURL) {
		t.Fatalf("expected invalid WebSocket endpoint error, got %v", err)
	}

	for _, endpoint := range []string{
		"http://api.gemini.local",
		"https://api.gemini.local?tenant=sandbox",
		"https://api.gemini.local#fragment",
		"https://api.gemini.local?",
		"https://user:password@api.gemini.local",
	} {
		if _, err := gemini.NewClientWithError(gemini.WithCustomRESTURL(endpoint)); !errors.Is(err, gemini.ErrInvalidEndpointURL) {
			t.Errorf("REST endpoint %q error = %v, want ErrInvalidEndpointURL", endpoint, err)
		}
	}
	for _, endpoint := range []string{
		"ws://ws.gemini.local",
		"wss://ws.gemini.local?tenant=sandbox",
		"wss://ws.gemini.local#fragment",
		"wss://ws.gemini.local?",
		"wss://user:password@ws.gemini.local",
	} {
		if _, err := gemini.NewClientWithError(gemini.WithCustomWSURL(endpoint)); !errors.Is(err, gemini.ErrInvalidEndpointURL) {
			t.Errorf("WebSocket endpoint %q error = %v, want ErrInvalidEndpointURL", endpoint, err)
		}
	}
}

func TestClient_InvalidBearerConfigurationFailsEarly(t *testing.T) {
	_, err := gemini.NewClientWithError(gemini.WithTokenSource(nil))
	if !errors.Is(err, gemini.ErrInvalidTokenSource) {
		t.Fatalf("expected ErrInvalidTokenSource, got %v", err)
	}

	client := gemini.NewClient(gemini.WithBearerToken(""))
	defer client.Close()
	if _, err := client.Account.GetAccount(context.Background(), nil); !errors.Is(err, gemini.ErrInvalidTokenSource) {
		t.Fatalf("expected invalid bearer configuration to fail requests, got %v", err)
	}

	if _, err := gemini.NewClientWithError(gemini.WithAPIKey("", "secret")); !errors.Is(err, gemini.ErrInvalidHMACCredentials) {
		t.Fatalf("expected empty HMAC key to fail early, got %v", err)
	}
	if _, err := gemini.NewClientWithError(gemini.WithAPIKey("key", "")); !errors.Is(err, gemini.ErrInvalidHMACCredentials) {
		t.Fatalf("expected empty HMAC secret to fail early, got %v", err)
	}
}

func TestClient_PrivateRESTRequiresAuthenticationBeforeNetwork(t *testing.T) {
	tracker := &trackingRoundTripper{}
	client := gemini.NewClient(
		gemini.WithCustomRESTURL("https://api.gemini.test"),
		gemini.WithHTTPClient(&http.Client{Transport: tracker}),
	)
	defer client.Close()

	_, err := client.Account.GetAccount(context.Background(), nil)
	if !errors.Is(err, gemini.ErrAuthenticationRequired) {
		t.Fatalf("expected ErrAuthenticationRequired, got %v", err)
	}
	if got := tracker.roundTrips.Load(); got != 0 {
		t.Fatalf("private REST request reached the network %d time(s)", got)
	}
}

func TestClient_PredictionsSplitsPublicAndPrivateREST(t *testing.T) {
	var privateHits atomic.Int32
	server := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/v1/prediction-markets/events":
			_, _ = w.Write([]byte(`{"data":[]}`))
		case "/v1/fundingamount/BTCUSD":
			_, _ = w.Write([]byte(`{}`))
		case "/v1/nextfundingtimestamp/BTCUSD":
			_, _ = w.Write([]byte(`0`))
		case "/v1/staking/rates":
			_, _ = w.Write([]byte(`{}`))
		default:
			privateHits.Add(1)
			http.NotFound(w, r)
		}
	}))
	defer server.Close()

	client := gemini.NewClient(
		gemini.WithCustomRESTURL(server.URL),
		gemini.WithHTTPClient(server.Client()),
	)
	defer client.Close()

	if _, err := client.Predictions.GetEvents(context.Background(), nil); err != nil {
		t.Fatalf("public prediction endpoint should work without auth: %v", err)
	}
	if _, err := client.Perpetuals.GetFundingAmount(context.Background(), "BTCUSD"); err != nil {
		t.Fatalf("public perpetual funding endpoint should work without auth: %v", err)
	}
	if _, err := client.Perpetuals.GetNextFundingTimestamp(context.Background(), "BTCUSD"); err != nil {
		t.Fatalf("public perpetual funding timestamp endpoint should work without auth: %v", err)
	}
	if _, err := client.Staking.GetStakingRates(context.Background()); err != nil {
		t.Fatalf("public staking rates endpoint should work without auth: %v", err)
	}
	if _, err := client.Predictions.NewOrder(context.Background(), &predictions.OrderRequest{}); !errors.Is(err, gemini.ErrAuthenticationRequired) {
		t.Fatalf("private prediction endpoint should fail closed without auth, got %v", err)
	}
	if got := privateHits.Load(); got != 0 {
		t.Fatalf("private prediction request reached the network %d time(s)", got)
	}
}

func TestClient_EndToEnd(t *testing.T) {
	apiKey := "test-key-123"
	apiSecret := "test-secret-456"

	server := geminitest.NewMockServer(apiKey, apiSecret)
	defer server.Close()

	client := gemini.NewClient(
		gemini.WithCustomRESTURL(server.URL()),
		gemini.WithHTTPClient(server.HTTPClient()),
		gemini.WithAPIKey(apiKey, apiSecret),
	)

	ctx := context.Background()

	// 1. Public Market Data
	symbols, err := client.MarketData.GetSymbols(ctx)
	if err != nil {
		t.Fatalf("failed getting symbols: %v", err)
	}
	if len(symbols) != 3 || symbols[0] != "btcusd" {
		t.Fatalf("unexpected symbols response: %v", symbols)
	}

	ticker, err := client.MarketData.GetTicker(ctx, "btcusd")
	if err != nil {
		t.Fatalf("failed getting ticker: %v", err)
	}
	if ticker.Bid == nil || *ticker.Bid != "65000.00" {
		t.Fatalf("unexpected ticker response: %+v", ticker)
	}

	book, err := client.MarketData.GetOrderBook(ctx, "btcusd", 10, 10)
	if err != nil {
		t.Fatalf("failed getting order book: %v", err)
	}
	if book.Bids == nil || len(*book.Bids) == 0 || (*book.Bids)[0].Price == nil || *(*book.Bids)[0].Price != "65000.00" {
		t.Fatalf("unexpected book response: %+v", book)
	}

	// 2. Private Authenticated Trading
	newOrderReq := &trading.NewOrderRequest{
		Symbol: "btcusd",
		Amount: "1.5",
		Price:  "65000.00",
		Side:   trading.NewOrderRequestSideBuy,
		Type:   trading.NewOrderRequestTypeExchangeLimit,
	}

	orderRes, err := client.Trading.NewOrder(ctx, newOrderReq)
	if err != nil {
		t.Fatalf("failed placing new order: %v", err)
	}
	if orderRes.Symbol == nil || *orderRes.Symbol != "btcusd" || orderRes.RemainingAmount == nil || *orderRes.RemainingAmount != "1.5" {
		t.Fatalf("unexpected order result: %+v", orderRes)
	}

	// 3. Private Account Balances
	balances, err := client.Account.GetBalances(ctx, &account.GetAvailableBalancesJSONBody{Account: "primary"})
	if err != nil {
		t.Fatalf("failed getting balances: %v", err)
	}
	if len(balances) != 2 || balances[0].Currency == nil || *balances[0].Currency != "USD" {
		t.Fatalf("unexpected balances: %+v", balances)
	}

	// 4. Prediction Markets Terms Gating
	predReq := &predictions.OrderRequest{
		OrderType: predictions.OrderTypeLimit,
		Outcome:   predictions.Yes,
		Price:     "0.50",
		Quantity:  "100",
		Side:      predictions.OrderSideBuy,
		Symbol:    "presidential-2028",
	}
	_, err = client.Predictions.NewOrder(ctx, predReq)
	if !errors.Is(err, transport.ErrAcceptTermsRequired) {
		t.Fatalf("expected ErrAcceptTermsRequired, got %v", err)
	}

	// Accept terms and retry
	if _, err := client.Predictions.AcceptTerms(ctx); err != nil {
		t.Fatalf("failed accepting terms: %v", err)
	}

	// Post-accept gating: order submission must succeed now
	predOrder, err := client.Predictions.NewOrder(ctx, predReq)
	if err != nil {
		t.Fatalf("failed placing prediction order after terms accepted: %v", err)
	}
	if predOrder.OrderId == nil || *predOrder.OrderId != 12345 {
		t.Fatalf("unexpected prediction order result: %+v", predOrder)
	}

	// 5. Staking Service
	stkBalances, err := client.Staking.GetStakingBalances(ctx, nil)
	if err != nil || len(stkBalances) != 1 {
		t.Fatalf("failed getting staking balances: %v", err)
	}

	// 6. Transfers Service
	transfers, err := client.Transfers.GetTransfers(ctx, nil)
	if err != nil || len(transfers) != 1 {
		t.Fatalf("failed getting transfers: %v", err)
	}

	// 7. WebSocket missing dialer returns actionable ErrNoDialerConfigured
	ws := client.PublicWebSocket()
	_, wsErr := ws.SubscribeDepth(ctx, "btcusd")
	if !errors.Is(wsErr, websocket.ErrNoDialerConfigured) {
		t.Fatalf("expected ErrNoDialerConfigured when no dialer is set, got %v", wsErr)
	}
}

func TestClient_OAuthStaticBearer(t *testing.T) {
	bearerToken := "oauth-bearer-token-12345"
	server := geminitest.NewMockOAuthServer(bearerToken)
	defer server.Close()

	client := gemini.NewClient(
		gemini.WithCustomRESTURL(server.URL()),
		gemini.WithHTTPClient(server.HTTPClient()),
		gemini.WithBearerToken(bearerToken),
	)

	ctx := context.Background()

	// 1. Authenticated Account Balances via Bearer Token
	balances, err := client.Account.GetBalances(ctx, &account.GetAvailableBalancesJSONBody{Account: "primary"})
	if err != nil {
		t.Fatalf("failed getting balances via OAuth: %v", err)
	}
	if len(balances) != 2 || balances[0].Currency == nil || *balances[0].Currency != "USD" {
		t.Fatalf("unexpected balances: %+v", balances)
	}

	// 2. Authenticated Order Placement via Bearer Token
	order, err := client.Trading.NewOrder(ctx, &trading.NewOrderRequest{
		Symbol: "btcusd",
		Amount: "2.0",
		Price:  "64000.00",
		Side:   trading.NewOrderRequestSideBuy,
		Type:   trading.NewOrderRequestTypeExchangeLimit,
	})
	if err != nil {
		t.Fatalf("failed placing order via OAuth: %v", err)
	}
	if order.Symbol == nil || *order.Symbol != "btcusd" {
		t.Fatalf("unexpected order: %+v", order)
	}

	// 3. OAuth token revocation uses the bearer token making the request.
	revoked, err := client.Account.RevokeOAuthToken(ctx)
	if err != nil || revoked == nil || revoked.Message != "token revoked" {
		t.Fatalf("failed revoking OAuth token: %v", err)
	}
}

func TestClient_OAuthDynamicTokenSource(t *testing.T) {
	currentOAuthToken := "token-gen-1"
	server := geminitest.NewMockOAuthServer("token-gen-2") // server expects token-gen-2
	defer server.Close()

	tokenFetcher := auth.TokenFunc(func(ctx context.Context) (string, error) {
		return currentOAuthToken, nil
	})

	client := gemini.NewClient(
		gemini.WithCustomRESTURL(server.URL()),
		gemini.WithHTTPClient(server.HTTPClient()),
		gemini.WithTokenSource(tokenFetcher),
	)

	ctx := context.Background()

	// Initial call with token-gen-1 must fail with 401 Unauthorized
	_, err := client.Account.GetBalances(ctx, &account.GetAvailableBalancesJSONBody{Account: "primary"})
	if err == nil {
		t.Fatal("expected unauthorized error with stale token, got nil")
	}

	// Dynamic token renewal
	currentOAuthToken = "token-gen-2"

	// Subsequent call automatically uses renewed token and succeeds
	balances, err := client.Account.GetBalances(ctx, &account.GetAvailableBalancesJSONBody{Account: "primary"})
	if err != nil {
		t.Fatalf("expected success with refreshed token, got %v", err)
	}
	if len(balances) != 2 {
		t.Fatalf("unexpected balances length: %d", len(balances))
	}
}

func TestClient_ErrorPredicates(t *testing.T) {
	if !gemini.IsRateLimit(gemini.ErrRateLimited) {
		t.Error("expected IsRateLimit(ErrRateLimited) to be true")
	}
	if !gemini.IsInsufficientFunds(gemini.ErrInsufficientFunds) {
		t.Error("expected IsInsufficientFunds(ErrInsufficientFunds) to be true")
	}
	if !gemini.IsAuthError(gemini.ErrInvalidSignature) || !gemini.IsAuthError(gemini.ErrInvalidNonce) || !gemini.IsAuthError(gemini.ErrUnauthorized) {
		t.Error("expected IsAuthError to be true for auth errors")
	}
	if !gemini.IsNotFound(gemini.ErrOrderNotFound) || !gemini.IsNotFound(gemini.ErrNotFound) {
		t.Error("expected IsNotFound to be true for not found errors")
	}
	if !gemini.IsBadRequest(gemini.ErrBadRequest) {
		t.Error("expected IsBadRequest(ErrBadRequest) to be true")
	}
	if !gemini.IsPermissionDenied(gemini.ErrPermissionDenied) || !gemini.IsPermissionDenied(gemini.ErrMissingRole) {
		t.Error("expected IsPermissionDenied to be true")
	}
	if !gemini.IsConflict(gemini.ErrConflict) {
		t.Error("expected IsConflict(ErrConflict) to be true")
	}
	if !gemini.IsInternalServerError(gemini.ErrInternalServer) {
		t.Error("expected IsInternalServerError(ErrInternalServer) to be true")
	}
	if gemini.IsRateLimit(gemini.ErrOrderNotFound) {
		t.Error("expected IsRateLimit(ErrOrderNotFound) to be false")
	}
}

func TestClient_RootAliases(t *testing.T) {
	d := gemini.MustDecimal("65000.50")
	if d.String() != "65000.5" {
		t.Errorf("unexpected decimal: %s", d.String())
	}

	q := gemini.DesiredQuote{
		Side:   "buy",
		Price:  d,
		Amount: gemini.MustDecimal("1.0"),
	}
	if q.Side != "buy" || q.Price.String() != "65000.5" {
		t.Errorf("unexpected quote alias struct: %+v", q)
	}

	secret := gemini.APISecret("test-secret-root-alias")
	b64Payload := "eyJyZXF1ZXN0IjoiL3YxL29yZGVycyIsIm5vbmNlIjoiOTg3NjU0MzIxIn0="
	sig := auth.NewHMAC("key", secret).Sign([]byte(b64Payload))
	if !gemini.VerifySignature(secret, b64Payload, sig) {
		t.Error("expected VerifySignature root alias to verify successfully")
	}
}

func TestClient_WithOptionsAndClose(t *testing.T) {
	baseClient := gemini.NewClient(
		gemini.WithEnvironment(gemini.Sandbox),
		gemini.WithAPIKey("base-key-12345", "base-secret-12345"),
	)

	// Clone client with new URL and sandbox options
	scopedClient := baseClient.WithOptions(
		gemini.WithCustomRESTURL("https://custom.gemini.local"),
	)

	if scopedClient == baseClient {
		t.Fatal("expected WithOptions to return a new client instance")
	}
	if scopedClient.MarketData == nil || scopedClient.Trading == nil {
		t.Fatal("expected services to be initialized on cloned client")
	}

	if err := baseClient.Close(); err != nil {
		t.Fatalf("unexpected error closing base client: %v", err)
	}
	if err := scopedClient.Close(); err != nil {
		t.Fatalf("unexpected error closing scoped client: %v", err)
	}
}

func TestClient_DoesNotCloseCallerOwnedHTTPClient(t *testing.T) {
	transport := &trackingRoundTripper{}
	httpClient := &http.Client{Transport: transport}
	client := gemini.NewClient(gemini.WithHTTPClient(httpClient))

	if err := client.Close(); err != nil {
		t.Fatalf("unexpected error closing client: %v", err)
	}
	if got := transport.closeIdleCalls.Load(); got != 0 {
		t.Fatalf("expected caller-owned transport to remain open, got %d CloseIdleConnections calls", got)
	}
}

func TestClient_PublicAndPrivateWebSocketConnections(t *testing.T) {
	client := gemini.NewClient(
		gemini.WithAPIKey("key-123", "secret-456"),
	)
	defer client.Close()

	pubWS := client.PublicWebSocket()
	privWS := client.PrivateWebSocket()

	if pubWS == nil {
		t.Fatal("expected PublicWebSocket to be non-nil")
	}
	if privWS == nil {
		t.Fatal("expected PrivateWebSocket to be non-nil")
	}
	if pubWS == privWS {
		t.Fatal("expected PublicWebSocket and PrivateWebSocket to be distinct connection instances")
	}
	// Unauthenticated client
	anonClient := gemini.NewClient()
	defer anonClient.Close()

	if _, err := anonClient.PrivateWebSocket().SubscribeOrderEvents(context.Background()); !errors.Is(err, gemini.ErrAuthenticationRequired) {
		t.Fatalf("expected ErrAuthenticationRequired on anonymous private client, got %v", err)
	}
}
