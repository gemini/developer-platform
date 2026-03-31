package main

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"

	"github.com/joho/godotenv"
)

type PriceFeedEntry struct {
	Pair             string `json:"pair"`
	Price            string `json:"price"`
	PercentChange24h string `json:"percentChange24h"`
}

func getPriceFeed() error {
	// Load .env file
	_ = godotenv.Load()

	baseURL := os.Getenv("GEMINI_BASE_URL")
	if baseURL == "" {
		baseURL = "https://api.gemini.com/v1"
	}

	url := fmt.Sprintf("%s/pricefeed", baseURL)

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

	var pairs []PriceFeedEntry
	if err := json.Unmarshal(body, &pairs); err != nil {
		return fmt.Errorf("error parsing JSON: %w", err)
	}

	fmt.Printf("Price feed (%d pairs):\n\n", len(pairs))

	for _, entry := range pairs {
		sign := ""
		if len(entry.PercentChange24h) > 0 && entry.PercentChange24h[0] != '-' {
			sign = "+"
		}
		fmt.Printf("%-12s %12s (%s%s%%)\n", entry.Pair, entry.Price, sign, entry.PercentChange24h)
	}

	return nil
}

func main() {
	args := os.Args[1:]

	// Show help message
	if len(args) > 0 && (args[0] == "--help" || args[0] == "-h") {
		fmt.Println("Usage: go run price_feed.go")
		fmt.Println("Fetches current prices for all trading pairs.")
		os.Exit(0)
	}

	if err := getPriceFeed(); err != nil {
		fmt.Println("Error:", err)
	}
}
