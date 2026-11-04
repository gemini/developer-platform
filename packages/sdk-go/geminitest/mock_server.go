package geminitest

import (
	"crypto/hmac"
	"crypto/sha512"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"sync"
)

// MockServer provides an in-process Gemini REST test server verifying HMAC signatures and headers.
type MockServer struct {
	server        *httptest.Server
	mu            sync.Mutex
	lastNonce     int64
	apiKey        string
	apiSecret     string
	bearerToken   string
	termsAccepted bool
}

// NewMockServer creates and starts a new mock Gemini test server validating HMAC credentials.
func NewMockServer(apiKey, apiSecret string) *MockServer {
	return newMockServerInternal(apiKey, apiSecret, "")
}

// NewMockOAuthServer creates and starts a new mock Gemini test server validating OAuth Bearer tokens.
func NewMockOAuthServer(bearerToken string) *MockServer {
	return newMockServerInternal("", "", bearerToken)
}

func newMockServerInternal(apiKey, apiSecret, bearerToken string) *MockServer {
	ms := &MockServer{
		apiKey:      apiKey,
		apiSecret:   apiSecret,
		bearerToken: bearerToken,
	}

	mux := http.NewServeMux()

	// Public Market Data
	mux.HandleFunc("/v1/symbols", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			w.WriteHeader(http.StatusMethodNotAllowed)
			return
		}
		if r.Header.Get("X-GEMINI-APIKEY") != "" || r.Header.Get("Authorization") != "" {
			w.WriteHeader(http.StatusBadRequest)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode([]string{"btcusd", "ethusd", "solusd"})
	})

	mux.HandleFunc("/v1/pubticker/btcusd", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			w.WriteHeader(http.StatusMethodNotAllowed)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{
			"bid":    "65000.00",
			"ask":    "65001.00",
			"last":   "65000.50",
			"volume": map[string]any{"BTC": "1200.5", "USD": "78000000"},
		})
	})

	mux.HandleFunc("/v1/book/btcusd", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			w.WriteHeader(http.StatusMethodNotAllowed)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{
			"bids": []map[string]string{{"price": "65000.00", "amount": "1.0", "timestamp": "1700000000"}},
			"asks": []map[string]string{{"price": "65001.00", "amount": "1.5", "timestamp": "1700000000"}},
		})
	})

	// Private Authenticated Endpoints
	mux.HandleFunc("/v1/order/new", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			w.WriteHeader(http.StatusMethodNotAllowed)
			return
		}
		payload, err := ms.validateAuth(r)
		if err != nil {
			w.WriteHeader(http.StatusUnauthorized)
			_ = json.NewEncoder(w).Encode(map[string]any{"result": "error", "reason": "InvalidSignature", "message": err.Error()})
			return
		}

		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{
			"order_id":            "987654321",
			"id":                  "987654321",
			"symbol":              payload["symbol"],
			"side":                payload["side"],
			"type":                payload["type"],
			"price":               payload["price"],
			"original_amount":     payload["amount"],
			"executed_amount":     "0",
			"remaining_amount":    payload["amount"],
			"is_live":             true,
			"is_cancelled":        false,
			"is_hidden":           false,
			"avg_execution_price": "0.00",
		})
	})

	mux.HandleFunc("/v1/order/cancel", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			w.WriteHeader(http.StatusMethodNotAllowed)
			return
		}
		payload, err := ms.validateAuth(r)
		if err != nil {
			w.WriteHeader(http.StatusUnauthorized)
			_ = json.NewEncoder(w).Encode(map[string]any{"result": "error", "reason": "InvalidSignature", "message": err.Error()})
			return
		}

		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{
			"order_id":     payload["order_id"],
			"is_cancelled": true,
			"is_live":      false,
		})
	})

	mux.HandleFunc("/v1/balances", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			w.WriteHeader(http.StatusMethodNotAllowed)
			return
		}
		_, err := ms.validateAuth(r)
		if err != nil {
			w.WriteHeader(http.StatusUnauthorized)
			_ = json.NewEncoder(w).Encode(map[string]any{"result": "error", "reason": "InvalidSignature", "message": err.Error()})
			return
		}

		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode([]map[string]any{
			{"currency": "USD", "amount": 100000.00, "available": 95000.00, "type": "exchange"},
			{"currency": "BTC", "amount": 10.5, "available": 8.0, "type": "exchange"},
		})
	})

	mux.HandleFunc("/v1/oauth/revokeByToken", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			w.WriteHeader(http.StatusMethodNotAllowed)
			return
		}
		if _, err := ms.validateAuth(r); err != nil {
			w.WriteHeader(http.StatusUnauthorized)
			_ = json.NewEncoder(w).Encode(map[string]any{"result": "error", "reason": "Unauthorized", "message": err.Error()})
			return
		}

		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{"message": "token revoked"})
	})

	// Prediction Markets Terms Endpoints
	mux.HandleFunc("/v1/prediction-markets/terms/accept", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			w.WriteHeader(http.StatusMethodNotAllowed)
			return
		}
		_, err := ms.validateAuth(r)
		if err != nil {
			w.WriteHeader(http.StatusUnauthorized)
			_ = json.NewEncoder(w).Encode(map[string]any{"result": "error", "reason": "InvalidSignature", "message": err.Error()})
			return
		}
		w.Header().Set("Content-Type", "application/json")
		ms.mu.Lock()
		ms.termsAccepted = true
		ms.mu.Unlock()
		_ = json.NewEncoder(w).Encode(map[string]any{"success": true})
	})

	mux.HandleFunc("/v1/prediction-markets/order", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			w.WriteHeader(http.StatusMethodNotAllowed)
			return
		}
		_, err := ms.validateAuth(r)
		if err != nil {
			w.WriteHeader(http.StatusUnauthorized)
			_ = json.NewEncoder(w).Encode(map[string]any{"result": "error", "reason": "InvalidSignature", "message": err.Error()})
			return
		}
		ms.mu.Lock()
		termsAccepted := ms.termsAccepted
		ms.mu.Unlock()
		if !termsAccepted {
			w.WriteHeader(http.StatusBadRequest)
			_ = json.NewEncoder(w).Encode(map[string]any{"result": "error", "reason": "MustAcceptTerms", "message": "terms must be accepted"})
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{"orderId": 12345, "status": "open"})
	})

	// Staking Balances
	mux.HandleFunc("/v1/balances/staking", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			w.WriteHeader(http.StatusMethodNotAllowed)
			return
		}
		_, err := ms.validateAuth(r)
		if err != nil {
			w.WriteHeader(http.StatusUnauthorized)
			_ = json.NewEncoder(w).Encode(map[string]any{"result": "error", "reason": "InvalidSignature", "message": err.Error()})
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode([]map[string]any{
			{"currency": "ETH", "amount": 10.0, "amountAvailable": 8.0},
		})
	})

	// Transfers V2
	mux.HandleFunc("/v2/transfers", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			w.WriteHeader(http.StatusMethodNotAllowed)
			return
		}
		_, err := ms.validateAuth(r)
		if err != nil {
			w.WriteHeader(http.StatusUnauthorized)
			_ = json.NewEncoder(w).Encode(map[string]any{"result": "error", "reason": "InvalidSignature", "message": err.Error()})
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode([]map[string]any{
			{"type": "Deposit", "currency": "ETH", "amount": "10.0", "status": "Complete"},
		})
	})

	// Use TLS so the high-level SDK client exercises the same transport
	// security requirement as production endpoints.
	ms.server = httptest.NewTLSServer(mux)
	return ms
}

func (ms *MockServer) URL() string {
	return ms.server.URL
}

// HTTPClient returns an HTTP client configured to trust this test server's
// ephemeral certificate. It must be passed to the high-level SDK client when
// using URL so tests do not disable TLS verification globally.
func (ms *MockServer) HTTPClient() *http.Client {
	return ms.server.Client()
}

func (ms *MockServer) Close() {
	ms.server.Close()
}

func (ms *MockServer) validateAuth(r *http.Request) (map[string]any, error) {
	// 1. Check OAuth 2.0 Bearer Authorization header
	authHeader := r.Header.Get("Authorization")
	if strings.HasPrefix(authHeader, "Bearer ") {
		token := strings.TrimPrefix(authHeader, "Bearer ")
		if ms.bearerToken == "" || token != ms.bearerToken {
			return nil, http.ErrNotSupported
		}

		payloadB64 := r.Header.Get("X-GEMINI-PAYLOAD")
		if payloadB64 == "" {
			return nil, http.ErrNotSupported
		}
		rawJSON, err := base64.StdEncoding.DecodeString(payloadB64)
		if err != nil {
			return nil, err
		}
		var payload map[string]any
		if err := json.Unmarshal(rawJSON, &payload); err != nil {
			return nil, err
		}
		if payload["request"] != r.URL.Path {
			return nil, http.ErrNotSupported
		}
		if _, hasNonce := payload["nonce"]; hasNonce {
			return nil, http.ErrNotSupported
		}
		return payload, nil
	}

	// 2. Check HMAC-SHA384 API Key + Signature
	apiKey := r.Header.Get("X-GEMINI-APIKEY")
	payloadB64 := r.Header.Get("X-GEMINI-PAYLOAD")
	sig := r.Header.Get("X-GEMINI-SIGNATURE")

	if apiKey != ms.apiKey || ms.apiKey == "" {
		return nil, http.ErrNotSupported
	}

	mac := hmac.New(sha512.New384, []byte(ms.apiSecret))
	mac.Write([]byte(payloadB64))
	expectedSig := hex.EncodeToString(mac.Sum(nil))

	if sig != expectedSig {
		return nil, http.ErrNotSupported
	}

	rawJSON, err := base64.StdEncoding.DecodeString(payloadB64)
	if err != nil {
		return nil, err
	}

	var payload map[string]any
	if err := json.Unmarshal(rawJSON, &payload); err != nil {
		return nil, err
	}

	nonceStr, _ := payload["nonce"].(string)
	nonceVal, _ := strconv.ParseInt(nonceStr, 10, 64)

	ms.mu.Lock()
	defer ms.mu.Unlock()
	if nonceVal <= ms.lastNonce {
		return nil, http.ErrNotSupported
	}
	ms.lastNonce = nonceVal

	return payload, nil
}
