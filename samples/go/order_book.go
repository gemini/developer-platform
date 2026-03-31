package main

import (
	"encoding/json"
	"fmt"
	"io"
	"math"
	"net/http"
	"os"
	"strconv"
	"strings"

	"github.com/joho/godotenv"
)

type OrderBookEntry struct {
	Price  string `json:"price"`
	Amount string `json:"amount"`
}

type OrderBook struct {
	Bids []OrderBookEntry `json:"bids"`
	Asks []OrderBookEntry `json:"asks"`
}

func getOrderBook(symbol string) error {
	// Load .env file
	_ = godotenv.Load()

	baseURL := os.Getenv("GEMINI_BASE_URL")
	if baseURL == "" {
		baseURL = "https://api.gemini.com/v1"
	}

	symbolLower := strings.ToLower(symbol)
	url := fmt.Sprintf("%s/book/%s", baseURL, symbolLower)

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

	var book OrderBook
	if err := json.Unmarshal(body, &book); err != nil {
		return fmt.Errorf("error parsing JSON: %w", err)
	}

	fmt.Printf("Order book for %s:\n\n", symbol)

	// Show top 5 asks in reverse order
	fmt.Println("Asks (top 5):")
	limit := int(math.Min(5, float64(len(book.Asks))))
	for i := limit - 1; i >= 0; i-- {
		fmt.Printf("  %12s | %s\n", book.Asks[i].Price, book.Asks[i].Amount)
	}

	fmt.Println("  ------------|------------")

	// Show top 5 bids
	fmt.Println("Bids (top 5):")
	limit = int(math.Min(5, float64(len(book.Bids))))
	for i := 0; i < limit; i++ {
		fmt.Printf("  %12s | %s\n", book.Bids[i].Price, book.Bids[i].Amount)
	}

	// Calculate spread
	if len(book.Asks) > 0 && len(book.Bids) > 0 {
		askPrice, err := strconv.ParseFloat(book.Asks[0].Price, 64)
		if err != nil {
			return fmt.Errorf("error parsing ask price: %w", err)
		}
		bidPrice, err := strconv.ParseFloat(book.Bids[0].Price, 64)
		if err != nil {
			return fmt.Errorf("error parsing bid price: %w", err)
		}
		fmt.Printf("\nSpread: %.2f\n", askPrice-bidPrice)
	}

	return nil
}

func main() {
	args := os.Args[1:]

	// Show help message
	if len(args) > 0 && (args[0] == "--help" || args[0] == "-h") {
		fmt.Println("Usage: go run order_book.go [symbol]")
		fmt.Println("Example: go run order_book.go ethusd")
		fmt.Println("Default symbol: btcusd")
		os.Exit(0)
	}

	// Get symbol from command line or use default
	symbol := "btcusd"
	if len(args) > 0 {
		symbol = args[0]
	}

	if err := getOrderBook(symbol); err != nil {
		fmt.Println("Error:", err)
	}
}
