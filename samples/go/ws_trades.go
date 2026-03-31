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

type TradeMessage struct {
	E int64  `json:"E"` // Event time (nanoseconds)
	S string `json:"s"` // Symbol
	T int64  `json:"t"` // Trade ID
	P string `json:"p"` // Price
	Q string `json:"q"` // Quantity
	M bool   `json:"m"` // Buyer is maker
}

type SubscribeMessage struct {
	ID     string   `json:"id"`
	Method string   `json:"method"`
	Params []string `json:"params"`
}

func streamTrades(symbol string) error {
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
	fmt.Printf("Subscribing to %s trades...\n\n", symbol)

	// Subscribe to trade stream
	sub := SubscribeMessage{
		ID:     "1",
		Method: "subscribe",
		Params: []string{fmt.Sprintf("%s@trade", symbol)},
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

			var trade TradeMessage
			if err := json.Unmarshal(message, &trade); err != nil {
				continue
			}

			side := "buy "
			if trade.M {
				side = "sell"
			}
			t := time.Unix(0, trade.E).UTC().Format(time.RFC3339)
			fmt.Printf("[%s] %s %s %s @ %s\n", t, trade.S, side, trade.Q, trade.P)
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
		fmt.Println("Usage: go run ws_trades.go [symbol]")
		fmt.Println("Example: go run ws_trades.go ethusd")
		fmt.Println("Default symbol: btcusd")
		os.Exit(0)
	}

	// Get symbol from command line or use default
	symbol := "btcusd"
	if len(args) > 0 {
		symbol = args[0]
	}

	if err := streamTrades(symbol); err != nil {
		fmt.Println("Error:", err)
	}
}
