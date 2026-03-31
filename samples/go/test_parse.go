package main

import (
	"encoding/json"
	"fmt"
	"log"
)

type Balance struct {
	Type                    string `json:"type"`
	Currency                string `json:"currency"`
	Amount                  string `json:"amount"`
	Available               string `json:"available"`
	AvailableForWithdrawal  string `json:"availableForWithdrawal"`
	PendingWithdrawal       string `json:"pendingWithdrawal,omitempty"`
	PendingDeposit          string `json:"pendingDeposit,omitempty"`
}

func main() {
	// Sample response from Gemini API
	sampleResponse := `[
  {
    "type": "exchange",
    "currency": "BTC",
    "amount": "5.0",
    "available": "4.5",
    "availableForWithdrawal": "4.5",
    "pendingWithdrawal": "0.25",
    "pendingDeposit": "0.25"
  },
  {
    "type": "exchange",
    "currency": "USD",
    "amount": "15000.00",
    "available": "5000.00",
    "availableForWithdrawal": "5000.00"
  },
  {
    "type": "exchange",
    "currency": "ETH",
    "amount": "10.0",
    "available": "10.0",
    "availableForWithdrawal": "10.0"
  }
]`

	// Parse the JSON
	var balances []Balance
	if err := json.Unmarshal([]byte(sampleResponse), &balances); err != nil {
		log.Fatal("Error parsing JSON:", err)
	}

	// Display the parsed data
	fmt.Println("✅ Successfully parsed balances response!")
	fmt.Printf("\nTotal currencies: %d\n\n", len(balances))

	for _, balance := range balances {
		fmt.Printf("Currency: %s\n", balance.Currency)
		fmt.Printf("  Type: %s\n", balance.Type)
		fmt.Printf("  Amount: %s\n", balance.Amount)
		fmt.Printf("  Available: %s\n", balance.Available)
		fmt.Printf("  Available for Withdrawal: %s\n", balance.AvailableForWithdrawal)
		if balance.PendingWithdrawal != "" {
			fmt.Printf("  Pending Withdrawal: %s\n", balance.PendingWithdrawal)
		}
		if balance.PendingDeposit != "" {
			fmt.Printf("  Pending Deposit: %s\n", balance.PendingDeposit)
		}
		fmt.Println()
	}

	// Pretty print the full response
	prettyJSON, _ := json.MarshalIndent(balances, "", "  ")
	fmt.Println("Full JSON response:")
	fmt.Println(string(prettyJSON))
}
