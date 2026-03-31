package main

import (
	"bytes"
	"crypto/hmac"
	"crypto/sha512"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"strconv"
	"time"

	"github.com/joho/godotenv"
)

type OrderParams struct {
	Symbol   string `json:"symbol"`
	Side     string `json:"side"`
	Type     string `json:"type"`
	Quantity string `json:"quantity"`
	Price    string `json:"price,omitempty"`
}

type OrderPayload struct {
	Request  string `json:"request"`
	Nonce    string `json:"nonce"`
	Symbol   string `json:"symbol"`
	Amount   string `json:"amount"`
	Price    string `json:"price,omitempty"`
	Side     string `json:"side"`
	Type     string `json:"type"`
}

type OrderResponse struct {
	OrderID        string `json:"order_id"`
	Symbol         string `json:"symbol"`
	Side           string `json:"side"`
	Type           string `json:"type"`
	Price          string `json:"price"`
	OriginalAmount string `json:"original_amount"`
}

func placeOrder(params OrderParams) error {
	// Load .env file
	_ = godotenv.Load()

	baseURL := os.Getenv("GEMINI_BASE_URL")
	if baseURL == "" {
		baseURL = "https://api.gemini.com/v1"
	}

	apiKey := os.Getenv("GEMINI_API_KEY")
	apiSecret := os.Getenv("GEMINI_API_SECRET")

	if apiKey == "" || apiSecret == "" {
		return fmt.Errorf("GEMINI_API_KEY and GEMINI_API_SECRET must be set in .env file")
	}

	// Create the payload
	payload := OrderPayload{
		Request: "/v1/order/new",
		Nonce:   strconv.FormatInt(time.Now().UnixMilli(), 10),
		Symbol:  params.Symbol,
		Amount:  params.Quantity,
		Price:   params.Price,
		Side:    params.Side,
		Type:    params.Type,
	}

	payloadJSON, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("error marshaling payload: %w", err)
	}

	// Base64 encode the payload
	encodedPayload := base64.StdEncoding.EncodeToString(payloadJSON)

	// Create the signature
	h := hmac.New(sha512.New384, []byte(apiSecret))
	h.Write([]byte(encodedPayload))
	signature := hex.EncodeToString(h.Sum(nil))

	// Make the request
	url := fmt.Sprintf("%s/order/new", baseURL)
	req, err := http.NewRequest("POST", url, bytes.NewBuffer(payloadJSON))
	if err != nil {
		return fmt.Errorf("error creating request: %w", err)
	}

	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-GEMINI-APIKEY", apiKey)
	req.Header.Set("X-GEMINI-PAYLOAD", encodedPayload)
	req.Header.Set("X-GEMINI-SIGNATURE", signature)

	client := &http.Client{}
	resp, err := client.Do(req)
	if err != nil {
		return fmt.Errorf("error making request: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return fmt.Errorf("error reading response: %w", err)
	}

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("API error (status %d): %s", resp.StatusCode, string(body))
	}

	var result OrderResponse
	if err := json.Unmarshal(body, &result); err != nil {
		return fmt.Errorf("error parsing JSON: %w", err)
	}

	fmt.Printf("Order placed: %s %s %s @ %s (order_id: %s, type: %s)\n",
		result.Side, result.OriginalAmount, result.Symbol, result.Price, result.OrderID, result.Type)
	return nil
}

func main() {
	order := OrderParams{
		Symbol:   "BTCUSD",
		Side:     "buy",
		Type:     "limit",
		Quantity: "0.01",
		Price:    "50000",
	}

	if err := placeOrder(order); err != nil {
		fmt.Println("Error:", err)
	}
}
