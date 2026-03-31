package main

import (
	"crypto/hmac"
	"crypto/sha512"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"os/signal"
	"strconv"
	"time"

	"github.com/gorilla/websocket"
	"github.com/joho/godotenv"
)

type PmBookTickerMessage struct {
	S        string `json:"s"` // Symbol
	BidPrice string `json:"b"` // Best bid price
	BidQty   string `json:"B"` // Best bid quantity
	AskPrice string `json:"a"` // Best ask price
	AskQty   string `json:"A"` // Best ask quantity
}

func streamPredictionPrices(symbol string) error {
	// Load .env file
	_ = godotenv.Load()

	wsURL := os.Getenv("GEMINI_WS_URL")
	if wsURL == "" {
		wsURL = "wss://ws.gemini.com"
	}

	apiKey := os.Getenv("GEMINI_API_KEY")
	apiSecret := os.Getenv("GEMINI_API_SECRET")

	if apiKey == "" || apiSecret == "" {
		return fmt.Errorf("GEMINI_API_KEY and GEMINI_API_SECRET must be set in .env file")
	}

	// Authentication — signs a timestamp with your secret so Gemini
	// can verify your identity.
	nonce := strconv.FormatInt(time.Now().Unix(), 10)
	payload := base64.StdEncoding.EncodeToString([]byte(nonce))
	h := hmac.New(sha512.New384, []byte(apiSecret))
	h.Write([]byte(payload))
	sig := hex.EncodeToString(h.Sum(nil))

	headers := http.Header{}
	headers.Set("X-GEMINI-APIKEY", apiKey)
	headers.Set("X-GEMINI-NONCE", nonce)
	headers.Set("X-GEMINI-PAYLOAD", payload)
	headers.Set("X-GEMINI-SIGNATURE", sig)

	conn, _, err := websocket.DefaultDialer.Dial(wsURL, headers)
	if err != nil {
		return fmt.Errorf("error connecting: %w", err)
	}
	defer conn.Close()

	fmt.Printf("Connected to %s\n", wsURL)
	fmt.Printf("Subscribing to %s book ticker...\n\n", symbol)

	// Subscribe to book ticker stream
	sub := struct {
		ID     string   `json:"id"`
		Method string   `json:"method"`
		Params []string `json:"params"`
	}{
		ID:     "1",
		Method: "subscribe",
		Params: []string{fmt.Sprintf("%s@bookTicker", symbol)},
	}
	if err := conn.WriteJSON(sub); err != nil {
		return fmt.Errorf("error subscribing: %w", err)
	}

	// Graceful shutdown
	interrupt := make(chan os.Signal, 1)
	signal.Notify(interrupt, os.Interrupt)

	done := make(chan struct{})

	go func() {
		defer close(done)
		for {
			_, message, err := conn.ReadMessage()
			if err != nil {
				fmt.Println("Connection closed")
				return
			}

			var ticker PmBookTickerMessage
			if err := json.Unmarshal(message, &ticker); err != nil {
				continue
			}

			if ticker.BidPrice != "" && ticker.AskPrice != "" {
				fmt.Printf("%s  bid: $%s (%s contracts)  ask: $%s (%s contracts)\n",
					ticker.S, ticker.BidPrice, ticker.BidQty, ticker.AskPrice, ticker.AskQty)
			}
		}
	}()

	select {
	case <-done:
		return nil
	case <-interrupt:
		fmt.Println("\nClosing connection...")
		conn.WriteMessage(
			websocket.CloseMessage,
			websocket.FormatCloseMessage(websocket.CloseNormalClosure, ""),
		)
		<-done
		return nil
	}
}

func main() {
	args := os.Args[1:]

	// Show help message
	if len(args) > 0 && (args[0] == "--help" || args[0] == "-h") {
		fmt.Println("Usage: go run pm_prices.go [symbol]")
		fmt.Println("Example: go run pm_prices.go GEMI-PRES2028-VANCE")
		fmt.Println("Default symbol: GEMI-PRES2028-VANCE")
		os.Exit(0)
	}

	// Get symbol from command line or use default
	symbol := "GEMI-PRES2028-VANCE"
	if len(args) > 0 {
		symbol = args[0]
	}

	if err := streamPredictionPrices(symbol); err != nil {
		fmt.Println("Error:", err)
	}
}
