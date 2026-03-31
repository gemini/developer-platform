package main

import (
	"encoding/json"
	"fmt"
	"os"
	"os/signal"
	"time"

	"github.com/gorilla/websocket"
	"github.com/joho/godotenv"
)

type BookTickerSubscribeMessage struct {
	ID     string   `json:"id"`
	Method string   `json:"method"`
	Params []string `json:"params"`
}

type BookTickerMessage struct {
	U        int64  `json:"u"` // Update ID
	E        int64  `json:"E"` // Event time (nanoseconds)
	S        string `json:"s"` // Symbol
	BidPrice string `json:"b"` // Best bid price
	BidQty   string `json:"B"` // Best bid quantity
	AskPrice string `json:"a"` // Best ask price
	AskQty   string `json:"A"` // Best ask quantity
}

func streamBookTicker(symbol string) error {
	// Load .env file
	_ = godotenv.Load()

	wsURL := os.Getenv("GEMINI_WS_URL")
	if wsURL == "" {
		wsURL = "wss://ws.gemini.com"
	}

	conn, _, err := websocket.DefaultDialer.Dial(wsURL, nil)
	if err != nil {
		return fmt.Errorf("error connecting: %w", err)
	}
	defer conn.Close()

	fmt.Printf("Connected to %s\n", wsURL)
	fmt.Printf("Subscribing to %s book ticker...\n\n", symbol)

	// Subscribe to book ticker stream
	sub := BookTickerSubscribeMessage{
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

			// Check if this is a subscription confirmation
			var raw map[string]json.RawMessage
			if err := json.Unmarshal(message, &raw); err != nil {
				continue
			}
			if _, ok := raw["result"]; ok {
				continue
			}
			if _, ok := raw["id"]; ok {
				continue
			}

			var ticker BookTickerMessage
			if err := json.Unmarshal(message, &ticker); err != nil {
				continue
			}

			t := time.Unix(0, ticker.E).UTC().Format(time.RFC3339)
			fmt.Printf("[%s] %s bid %s x %s | ask %s x %s\n",
				t, ticker.S, ticker.BidPrice, ticker.BidQty, ticker.AskPrice, ticker.AskQty)
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
		fmt.Println("Usage: go run ws_book_ticker.go [symbol]")
		fmt.Println("Example: go run ws_book_ticker.go ethusd")
		fmt.Println("Default symbol: btcusd")
		os.Exit(0)
	}

	// Get symbol from command line or use default
	symbol := "btcusd"
	if len(args) > 0 {
		symbol = args[0]
	}

	if err := streamBookTicker(symbol); err != nil {
		fmt.Println("Error:", err)
	}
}
