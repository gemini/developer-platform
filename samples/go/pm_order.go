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

type PmOrderMessage struct {
	X string `json:"X"` // Status
	S string `json:"S"` // Side
	O string `json:"O"` // Outcome
	P string `json:"p"` // Price
	Q string `json:"q"` // Quantity
}

type PmTickerMessage struct {
	S        string `json:"s"` // Symbol
	BidPrice string `json:"b"` // Best bid price
	AskPrice string `json:"a"` // Best ask price
}

func placePredictionOrder(symbol, side, price, quantity, outcome string) error {
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
	fmt.Printf("Subscribing to %s prices and order updates...\n\n", symbol)

	// Subscribe to book ticker and order updates
	sub := struct {
		ID     string   `json:"id"`
		Method string   `json:"method"`
		Params []string `json:"params"`
	}{
		ID:     "1",
		Method: "subscribe",
		Params: []string{
			fmt.Sprintf("%s@bookTicker", symbol),
			"orders@account",
		},
	}
	if err := conn.WriteJSON(sub); err != nil {
		return fmt.Errorf("error subscribing: %w", err)
	}

	// Graceful shutdown
	interrupt := make(chan os.Signal, 1)
	signal.Notify(interrupt, os.Interrupt)

	done := make(chan struct{})
	orderPlaced := false

	go func() {
		defer close(done)
		for {
			_, message, err := conn.ReadMessage()
			if err != nil {
				fmt.Println("Connection closed")
				return
			}

			// Check for ticker data to trigger order placement
			var ticker PmTickerMessage
			if err := json.Unmarshal(message, &ticker); err == nil {
				if !orderPlaced && ticker.BidPrice != "" && ticker.AskPrice != "" && ticker.S == symbol {
					fmt.Printf("Best bid: $%s  Best ask: $%s\n", ticker.BidPrice, ticker.AskPrice)
					fmt.Println("Placing order...")
					orderPlaced = true

					order := struct {
						ID     string      `json:"id"`
						Method string      `json:"method"`
						Params interface{} `json:"params"`
					}{
						ID:     "2",
						Method: "order.place",
						Params: map[string]string{
							"symbol":        symbol,
							"side":          side,
							"type":          "LIMIT",
							"timeInForce":   "GTC",
							"price":         price,
							"quantity":       quantity,
							"eventOutcome":  outcome,
						},
					}
					conn.WriteJSON(order)
				}
			}

			// Check for order lifecycle updates
			var orderMsg PmOrderMessage
			if err := json.Unmarshal(message, &orderMsg); err == nil {
				switch orderMsg.X {
				case "NEW", "OPEN", "FILLED", "PARTIALLY_FILLED":
					fmt.Printf("Order %s: side=%s outcome=%s price=$%s qty=%s\n",
						orderMsg.X, orderMsg.S, orderMsg.O, orderMsg.P, orderMsg.Q)
				}
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
		fmt.Println("Usage: go run pm_order.go [symbol]")
		fmt.Println("Example: go run pm_order.go GEMI-PRES2028-VANCE")
		fmt.Println("Default symbol: GEMI-PRES2028-VANCE")
		fmt.Println("\nPlaces a BUY LIMIT order for 100 YES contracts at $0.27.")
		fmt.Println("Edit the script to change side, price, quantity, or outcome.")
		os.Exit(0)
	}

	// Get symbol from command line or use default
	symbol := "GEMI-PRES2028-VANCE"
	if len(args) > 0 {
		symbol = args[0]
	}

	if err := placePredictionOrder(symbol, "BUY", "0.27", "100", "YES"); err != nil {
		fmt.Println("Error:", err)
	}
}
