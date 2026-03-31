package main

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"

	"github.com/joho/godotenv"
)

type TickerData struct {
	Bid    string                 `json:"bid"`
	Ask    string                 `json:"ask"`
	Last   string                 `json:"last"`
	Volume map[string]interface{} `json:"volume"`
}

func getTicker(symbol string) error {
	// Load .env file
	_ = godotenv.Load()

	baseURL := os.Getenv("GEMINI_BASE_URL")
	if baseURL == "" {
		baseURL = "https://api.gemini.com/v1"
	}

	// Symbol should be lowercase for Gemini API
	symbolLower := strings.ToLower(symbol)
	url := fmt.Sprintf("%s/pubticker/%s", baseURL, symbolLower)

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

	var ticker TickerData
	if err := json.Unmarshal(body, &ticker); err != nil {
		return fmt.Errorf("error parsing JSON: %w", err)
	}

	fmt.Printf("Ticker data for %s:\n", symbol)
	fmt.Printf("  Bid:  %s\n", ticker.Bid)
	fmt.Printf("  Ask:  %s\n", ticker.Ask)
	fmt.Printf("  Last: %s\n", ticker.Last)
	return nil
}

func main() {
	args := os.Args[1:]

	// Show help message
	if len(args) > 0 && (args[0] == "--help" || args[0] == "-h") {
		fmt.Println("Usage: go run get_ticker.go [symbol]")
		fmt.Println("Example: go run get_ticker.go ethusd")
		fmt.Println("Default symbol: btcusd")
		os.Exit(0)
	}

	// Get symbol from command line or use default
	symbol := "btcusd"
	if len(args) > 0 {
		symbol = args[0]
	}

	if err := getTicker(symbol); err != nil {
		fmt.Println("Error:", err)
	}
}
