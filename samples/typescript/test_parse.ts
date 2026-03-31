#!/usr/bin/env ts-node
/**
 * Test parsing the Gemini balances response
 */

interface Balance {
  type: string;
  currency: string;
  amount: string;
  available: string;
  availableForWithdrawal: string;
  pendingWithdrawal?: string;
  pendingDeposit?: string;
}

// Sample response from Gemini API
const sampleResponse: Balance[] = [
  {
    type: "exchange",
    currency: "BTC",
    amount: "5.0",
    available: "4.5",
    availableForWithdrawal: "4.5",
    pendingWithdrawal: "0.25",
    pendingDeposit: "0.25"
  },
  {
    type: "exchange",
    currency: "USD",
    amount: "15000.00",
    available: "5000.00",
    availableForWithdrawal: "5000.00"
  },
  {
    type: "exchange",
    currency: "ETH",
    amount: "10.0",
    available: "10.0",
    availableForWithdrawal: "10.0"
  }
];

// Display the parsed data
console.log("✅ Successfully parsed balances response!");
console.log(`\nTotal currencies: ${sampleResponse.length}\n`);

sampleResponse.forEach(balance => {
  console.log(`Currency: ${balance.currency}`);
  console.log(`  Type: ${balance.type}`);
  console.log(`  Amount: ${balance.amount}`);
  console.log(`  Available: ${balance.available}`);
  console.log(`  Available for Withdrawal: ${balance.availableForWithdrawal}`);
  if (balance.pendingWithdrawal) {
    console.log(`  Pending Withdrawal: ${balance.pendingWithdrawal}`);
  }
  if (balance.pendingDeposit) {
    console.log(`  Pending Deposit: ${balance.pendingDeposit}`);
  }
  console.log();
});

// Pretty print the full response
console.log("Full JSON response:");
console.log(JSON.stringify(sampleResponse, null, 2));
