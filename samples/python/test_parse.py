#!/usr/bin/env python3
"""Test parsing the Gemini balances response"""
import json

# Sample response from Gemini API
sample_response = """[
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
]"""

# Parse the JSON
balances = json.loads(sample_response)

# Display the parsed data
print("✅ Successfully parsed balances response!")
print(f"\nTotal currencies: {len(balances)}\n")

for balance in balances:
    print(f"Currency: {balance['currency']}")
    print(f"  Type: {balance['type']}")
    print(f"  Amount: {balance['amount']}")
    print(f"  Available: {balance['available']}")
    print(f"  Available for Withdrawal: {balance['availableForWithdrawal']}")
    if 'pendingWithdrawal' in balance:
        print(f"  Pending Withdrawal: {balance['pendingWithdrawal']}")
    if 'pendingDeposit' in balance:
        print(f"  Pending Deposit: {balance['pendingDeposit']}")
    print()

# Pretty print the full response
print("Full JSON response:")
print(json.dumps(balances, indent=2))
