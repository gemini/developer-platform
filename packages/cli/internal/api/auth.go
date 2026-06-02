package api

import (
	"crypto/hmac"
	"crypto/sha512"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"time"
)

// PayloadSigner handles HMAC-SHA512 signing of API requests.
type PayloadSigner struct {
	apiKey    string
	apiSecret string
}

// NewPayloadSigner creates a new payload signer with the given credentials.
func NewPayloadSigner(apiKey, apiSecret string) *PayloadSigner {
	return &PayloadSigner{
		apiKey:    apiKey,
		apiSecret: apiSecret,
	}
}

// Sign creates an HMAC-SHA512 signature for a REST API request.
func (s *PayloadSigner) Sign(endpoint string, params map[string]any) (apiKey, payload, signature string, err error) {
	if params == nil {
		params = make(map[string]any)
	}

	params["request"] = endpoint
	params["nonce"] = time.Now().UnixNano()

	jsonPayload, err := json.Marshal(params)
	if err != nil {
		return "", "", "", err
	}

	payload = base64.StdEncoding.EncodeToString(jsonPayload)
	signature = s.hmacSign(payload)

	return s.apiKey, payload, signature, nil
}

// SignGET creates an HMAC-SHA512 signature for a GET request.
func (s *PayloadSigner) SignGET(endpoint string) (apiKey, payload, signature string, err error) {
	params := map[string]any{
		"request": endpoint,
		"nonce":   time.Now().UnixNano(),
	}

	jsonPayload, err := json.Marshal(params)
	if err != nil {
		return "", "", "", err
	}

	payload = base64.StdEncoding.EncodeToString(jsonPayload)
	signature = s.hmacSign(payload)

	return s.apiKey, payload, signature, nil
}

func (s *PayloadSigner) hmacSign(payload string) string {
	mac := hmac.New(sha512.New384, []byte(s.apiSecret))
	mac.Write([]byte(payload))
	return hex.EncodeToString(mac.Sum(nil))
}

// WSAuthHeaders contains authentication headers for WebSocket connections.
type WSAuthHeaders struct {
	APIKey    string
	Payload   string
	Signature string
	Nonce     string
}

// SignWebSocket creates authentication headers for WebSocket connections.
func (s *PayloadSigner) SignWebSocket() *WSAuthHeaders {
	nonce := time.Now().Unix()
	nonceStr := fmt.Sprintf("%d", nonce)
	payload := base64.StdEncoding.EncodeToString([]byte(nonceStr))
	signature := s.hmacSign(payload)

	return &WSAuthHeaders{
		APIKey:    s.apiKey,
		Payload:   payload,
		Signature: signature,
		Nonce:     nonceStr,
	}
}
