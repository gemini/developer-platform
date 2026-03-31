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

type BalancePayload struct {
	Request string `json:"request"`
	Nonce   string `json:"nonce"`
}

type Balance struct {
	Type                   string `json:"type"`
	Currency               string `json:"currency"`
	Amount                 string `json:"amount"`
	Available              string `json:"available"`
	AvailableForWithdrawal string `json:"availableForWithdrawal"`
	PendingWithdrawal      string `json:"pendingWithdrawal,omitempty"`
	PendingDeposit         string `json:"pendingDeposit,omitempty"`
}

func getBalances() error {
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
	payload := BalancePayload{
		Request: "/v1/balances",
		Nonce:   strconv.FormatInt(time.Now().UnixMilli(), 10),
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
	url := fmt.Sprintf("%s/balances", baseURL)
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

	var balances []Balance
	if err := json.Unmarshal(body, &balances); err != nil {
		return fmt.Errorf("error parsing JSON: %w", err)
	}

	prettyJSON, _ := json.MarshalIndent(balances, "", "  ")
	fmt.Println("Account balances:")
	fmt.Println(string(prettyJSON))

	// Summary
	fmt.Printf("\nTotal currencies: %d\n", len(balances))
	for _, balance := range balances {
		fmt.Printf("%s: %s available (%s total)\n", balance.Currency, balance.Available, balance.Amount)
	}

	return nil
}

func main() {
	if err := getBalances(); err != nil {
		fmt.Println("Error:", err)
	}
}
