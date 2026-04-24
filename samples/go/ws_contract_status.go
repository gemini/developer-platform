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

type ContractStatusSubscribeMessage struct {
	ID     string   `json:"id"`
	Method string   `json:"method"`
	Params []string `json:"params"`
}

// ContractStatusMessage is the shape of a `contractStatus` WebSocket event.
// StrikePrice (`p`) is parsed from strike-based contract tickers (e.g. HI78999D63).
// Up/Down contracts publish `p` only once the strike is set, so it is omitted
// with `omitempty` for the outbound test fixtures and may be absent on the wire.
type ContractStatusMessage struct {
	EventType      string `json:"e"`
	EventTime      int64  `json:"E"` // Unix milliseconds
	Symbol         string `json:"s"`
	EventTicker    string `json:"k"`
	ContractTicker string `json:"c"`
	ContractID     int64  `json:"i"`
	StrikePrice    string `json:"p,omitempty"`
	OldStatus      string `json:"o"`
	NewStatus      string `json:"n"`
}

func streamContractStatus() error {
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
	fmt.Println("Subscribing to contractStatus...")
	fmt.Println()

	sub := ContractStatusSubscribeMessage{
		ID:     "1",
		Method: "subscribe",
		Params: []string{"contractStatus"},
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

			var event ContractStatusMessage
			if err := json.Unmarshal(message, &event); err != nil {
				continue
			}

			t := time.UnixMilli(event.EventTime).UTC().Format(time.RFC3339)
			strike := ""
			if event.StrikePrice != "" {
				strike = fmt.Sprintf(" strike=%s", event.StrikePrice)
			}
			fmt.Printf("[%s] %s [%s] %s -> %s%s\n",
				t, event.Symbol, event.ContractTicker, event.OldStatus, event.NewStatus, strike)
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
		fmt.Println("Usage: go run ws_contract_status.go")
		fmt.Println("Streams prediction-market contract lifecycle events (status transitions and strike-populated moments).")
		os.Exit(0)
	}

	if err := streamContractStatus(); err != nil {
		fmt.Println("Error:", err)
	}
}
