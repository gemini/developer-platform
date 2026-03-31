package main

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/joho/godotenv"
)

type Trade struct {
	Timestamp    int64  `json:"timestamp"`
	TimestampMs  int64  `json:"timestampms"`
	TID          int64  `json:"tid"`
	Price        string `json:"price"`
	Amount       string `json:"amount"`
	Exchange     string `json:"exchange"`
	Type         string `json:"type"`
}

func getTradeHistory(symbol string) error {
	// Load .env file
	_ = godotenv.Load()

	baseURL := os.Getenv("GEMINI_BASE_URL")
	if baseURL == "" {
		baseURL = "https://api.gemini.com/v1"
	}

	symbolLower := strings.ToLower(symbol)
	url := fmt.Sprintf("%s/trades/%s", baseURL, symbolLower)

	resp, err := http.Get(url)
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

	var trades []Trade
	if err := json.Unmarshal(body, &trades); err != nil {
		return fmt.Errorf("error parsing JSON: %w", err)
	}

	fmt.Printf("Recent trades for %s (%d trades):\n\n", symbol, len(trades))

	for _, trade := range trades {
		t := time.UnixMilli(trade.TimestampMs).UTC().Format(time.RFC3339)
		fmt.Printf("[%s] %-4s %s @ %s (tid: %d)\n", t, trade.Type, trade.Amount, trade.Price, trade.TID)
	}

	return nil
}

func main() {
	args := os.Args[1:]

	// Show help message
	if len(args) > 0 && (args[0] == "--help" || args[0] == "-h") {
		fmt.Println("Usage: go run trade_history.go [symbol]")
		fmt.Println("Example: go run trade_history.go ethusd")
		fmt.Println("Default symbol: btcusd")
		os.Exit(0)
	}

	// Get symbol from command line or use default
	symbol := "btcusd"
	if len(args) > 0 {
		symbol = args[0]
	}

	if err := getTradeHistory(symbol); err != nil {
		fmt.Println("Error:", err)
	}
}
