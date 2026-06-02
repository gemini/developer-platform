# AI Agent Integration Guide

**Gemini Markets CLI is purpose-built for AI agent trading.** This guide covers everything you need to integrate autonomous trading agents.

## Quick Start (30 seconds)

```bash
# 1. Set credentials
gemini-markets auth login
gemini-markets auth status

# or API keys / CI env vars
export GEMINI_API_KEY="account-xxxxx"
export GEMINI_API_SECRET="xxxxx"

# 2. Get machine-readable specification
gemini-markets spec -q > spec.json

# 3. Validate auth and trading readiness
gemini-markets auth test -q
gemini-markets doctor -q

# 4. Start trading
gemini-markets predict markets list --status active -q
```

---

## Core Principles

### 1. JSON-First Design

**All commands output structured JSON by default.** No parsing required.

```bash
gemini-markets balance -q | jq '.[] | select(.currency == "USD")'
```

**Quiet mode (`-q`)**: Suppresses stderr for clean piping
**Raw mode (`--raw`)**: Compact JSON without pretty-printing

### 2. Idempotency

**Always use `--client-order-id` for safe retries:**

```bash
# Generate unique ID
ORDER_ID="bot-$(date +%s)-$(uuidgen | head -c 8)"

# Place order with idempotency key
gemini-markets predict order place \
  --symbol GEMI-OSCARBP26-OSBP26ONEB \
  --side buy --outcome yes \
  --quantity 100 --price 0.75 \
  --client-order-id "$ORDER_ID" \
  -q
```

**If the request fails, retry with the same `client-order-id`** - the exchange will not create duplicate orders.

### 3. Structured Error Handling

All errors follow this format:

```json
{
  "success": false,
  "error": {
    "code": "INSUFFICIENT_FUNDS",
    "message": "Not enough balance to place order",
    "retryable": false,
    "suggestion": "Deposit funds or reduce order size"
  }
}
```

**Check `error.retryable` to determine retry strategy.**

`gemini-markets auth status -q` is metadata only. Use `gemini-markets auth test -q` for a live authenticated probe, and use `gemini-markets doctor -q` as the final preflight before live execution. `doctor` reports `readyForTrading`, `readyForTradingReason`, and `blockingChecks`.

---

## Error Codes & Retry Logic

### Retryable Errors

| Code | Retry Strategy | Action |
|------|----------------|--------|
| `RATE_LIMITED` | ✅ Exponential backoff | Respect `Retry-After` header (check stderr in debug mode) |
| `NETWORK_ERROR` | ✅ Exponential backoff | Retry up to 3 times with 1s base delay |
| `SERVER_ERROR` | ✅ Exponential backoff | Backend issue, retry after delay |

### Non-Retryable Errors

| Code | Action |
|------|--------|
| `INSUFFICIENT_FUNDS` | Check balance, deposit funds, or reduce size |
| `INVALID_INPUT` | Fix command arguments |
| `AUTH_REQUIRED` | Run `gemini-markets auth status`, then refresh credentials with `gemini-markets auth login` or env vars |
| `AUTH_FAILED` | Verify OAuth token or API key/secret validity |
| `MARKET_CLOSED` | Check market status, wait for reopening |
| `ORDER_REJECTED` | Check order parameters (price, quantity) |
| `NOT_FOUND` | Verify symbol/order ID exists |

### Example Retry Logic

```bash
#!/bin/bash
MAX_RETRIES=3
RETRY_COUNT=0
BASE_DELAY=1

while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
  RESULT=$(gemini-markets predict order place \
    --symbol "$SYMBOL" \
    --side buy --outcome yes \
    --quantity 100 --price 0.75 \
    --client-order-id "$ORDER_ID" \
    -q 2>&1)

  if echo "$RESULT" | jq -e '.success == false' > /dev/null 2>&1; then
    ERROR_CODE=$(echo "$RESULT" | jq -r '.error.code')
    RETRYABLE=$(echo "$RESULT" | jq -r '.error.retryable')

    if [ "$RETRYABLE" = "false" ]; then
      echo "Non-retryable error: $ERROR_CODE" >&2
      exit 1
    fi

    # Exponential backoff with jitter
    DELAY=$((BASE_DELAY * (2 ** RETRY_COUNT)))
    JITTER=$((RANDOM % 1000))
    sleep $((DELAY + JITTER / 1000))
    RETRY_COUNT=$((RETRY_COUNT + 1))
  else
    echo "$RESULT"
    exit 0
  fi
done

echo "Max retries exceeded" >&2
exit 1
```

---

## Rate Limits

### API Rate Limits

| Endpoint | Limit | Notes |
|----------|-------|-------|
| REST API | 600 requests/minute | Shared across all REST endpoints |
| WebSocket | 5 concurrent connections | Per account |
| Order Placement | 1 order per 100ms recommended | Avoid triggering circuit breaker |

### Rate Limit Handling

**The CLI has built-in circuit breaker protection:**

1. After **3 consecutive 429 responses**, circuit opens
2. All requests fail fast for **30 seconds**
3. After cooldown, one test request allowed (half-open)
4. If successful → circuit closes, if failed → reopens for 30s

**Agent best practices:**
- Track your request rate (stay under 10 req/sec for safety)
- If you receive `RATE_LIMITED` error, back off exponentially
- Use WebSocket for high-frequency data (order updates, market data)
- Batch operations when possible (e.g., `order cancel-all` vs individual cancels)

### Rate Limit Response

```json
{
  "success": false,
  "error": {
    "code": "RATE_LIMITED",
    "message": "Rate limit exceeded. Retry after 5 seconds",
    "retryable": true,
    "suggestion": "Wait before retrying"
  }
}
```

---

## API Constraints

### Prediction Markets

| Constraint | Value |
|------------|-------|
| Minimum quantity | 1 contract |
| Maximum quantity | 10,000 contracts per order |
| Price increment | 0.01 (1 cent) |
| Price range | 0.01 to 0.99 |
| Outcome values | "yes" or "no" |

### Spot Trading

| Constraint | Value |
|------------|-------|
| Minimum order size | Varies by symbol (check `spot symbol <pair>`) |
| Tick size | Varies by symbol (check `spot symbol <pair>`) |
| Price precision | Varies by symbol |

**Get symbol-specific constraints:**
```bash
gemini-markets spot symbol BTCUSD -q | jq '{
  minOrderSize: .min_order_size,
  tickSize: .tick_size,
  quoteCurrency: .quote_currency
}'
```

---

## State Management

### Reconciliation Pattern

Agents should periodically reconcile state to handle network failures, missed updates, or API issues.

```bash
#!/bin/bash
# State reconciliation loop

while true; do
  # 1. Check current balances
  BALANCES=$(gemini-markets balance -q)

  # 2. List open orders
  SPOT_ORDERS=$(gemini-markets spot order list -q)
  PREDICT_ORDERS=$(gemini-markets predict order list -q)

  # 3. Check positions
  POSITIONS=$(gemini-markets predict positions list -q)

  # 4. Reconcile against expected state
  # ... your reconciliation logic ...

  # Sleep before next reconciliation (every 30s)
  sleep 30
done
```

### Tracking Order Lifecycle

```bash
# 1. Place order with client-order-id
ORDER_ID="bot-$(date +%s)"
gemini-markets predict order place \
  --symbol GEMI-OSCARBP26-OSBP26ONEB \
  --side buy --outcome yes \
  --quantity 100 --price 0.75 \
  --client-order-id "$ORDER_ID" \
  -q > /tmp/order_response.json

# 2. Extract server order ID
SERVER_ID=$(jq -r '.orderId' /tmp/order_response.json)

# 3. Poll for order status
while true; do
  STATUS=$(gemini-markets predict order get "$SERVER_ID" -q | jq -r '.status')

  case "$STATUS" in
    "filled")
      echo "Order filled"
      break
      ;;
    "cancelled")
      echo "Order cancelled"
      break
      ;;
    "open")
      echo "Still open, waiting..."
      sleep 1
      ;;
  esac
done
```

---

## WebSocket vs REST

**Use WebSocket for:**
- ✅ Real-time market data (ticker, trades, depth)
- ✅ Order updates (fills, cancellations)
- ✅ Balance updates
- ✅ High-frequency order placement (lower latency)

**Use REST for:**
- ✅ Historical data queries (candles, klines)
- ✅ One-time operations (get balance, list markets)
- ✅ Batch operations

**Order placement uses WebSocket by default and fails closed if WebSocket
placement is unavailable.** Use REST-only mode explicitly when you intend to
place over REST:

```bash
gemini-markets --no-websocket <command>
```

**Private account streams authenticate at the WebSocket upgrade.**
The CLI supports account-scoped HMAC headers
(`X-GEMINI-APIKEY`, `X-GEMINI-NONCE`, `X-GEMINI-PAYLOAD`, and
`X-GEMINI-SIGNATURE`) and OAuth bearer headers from `auth login` or
`GEMINI_ACCESS_TOKEN`. OAuth sessions must include the account, balance,
history, and order scopes requested by this CLI; those trading scopes currently
cover prediction trading.

### Real-Time Trading with Streams (Recommended for Active Trading)

**If your agent is placing multiple orders, use streaming instead of polling.** This gives you:
- Instant fill notifications (no polling delay)
- Real-time balance updates (know when funds are available)
- Lower API usage (streams don't count against rate limits)

```bash
#!/bin/bash
# Start streams in background
gemini-markets stream orders -q > /tmp/order_events.jsonl &
ORDER_STREAM_PID=$!

gemini-markets stream balances -q > /tmp/balance_events.jsonl &
BALANCE_STREAM_PID=$!

# Place orders - fills appear in /tmp/order_events.jsonl
gemini-markets predict order place \
  --symbol "$SYMBOL" \
  --side buy --outcome yes \
  --quantity 100 --price 0.65 \
  --client-order-id "bot-$(date +%s)" \
  -q

# Read fill events (instead of polling order status)
tail -f /tmp/order_events.jsonl | while read -r event; do
  ORDER_ID=$(echo "$event" | jq -r '.orderId')
  STATUS=$(echo "$event" | jq -r '.status')

  if [ "$STATUS" = "filled" ]; then
    echo "Order $ORDER_ID filled!"
    # Place next order, update state, etc.
  fi
done

# Cleanup on exit
trap "kill $ORDER_STREAM_PID $BALANCE_STREAM_PID 2>/dev/null" EXIT
```

**Stream event types:**
- `stream orders` → order accepted, partially filled, filled, cancelled
- `stream balances` → balance changes after fills, deposits, withdrawals
- `stream positions` → position deltas on fills (replaces polling `predict positions list`)
- `stream contract-status` → contract lifecycle transitions and strike-price availability

---

## Testing Without Risk

### Sandbox Environment

```bash
# All commands support sandbox mode
export GEMINI_API_KEY="sandbox-key"
export GEMINI_API_SECRET="sandbox-secret"

gemini-markets --sandbox predict markets list -q
gemini-markets --sandbox balance -q
gemini-markets --sandbox predict order place \
  --symbol GEMI-TEST-SYMBOL \
  --side buy --outcome yes \
  --quantity 10 --price 0.50 \
  --client-order-id "test-$(date +%s)" \
  -q
```

### Dry Run

```bash
# Preview an order without placing it
gemini-markets predict order place \
  --symbol GEMI-OSCARBP26-OSBP26ONEB \
  --side buy --outcome yes \
  --quantity 100 --price 0.65 \
  --client-order-id "bot-123" \
  --dry-run -q

# Preview which orders would be cancelled
gemini-markets predict order cancel-all --dry-run -q

```

### Dollar-Based Orders

```bash
# Buy up to $50 worth of YES contracts including estimated prediction fees
gemini-markets predict order place --symbol GEMI-OSCARBP26-OSBP26ONEB \
  --side buy --outcome yes --dollars 50 --price 0.65 \
  --client-order-id "bot-$(date +%s)" -q

# Buy $50 worth of BTC (fee-adjusted via your fee tier)
gemini-markets spot order place --symbol btcusd --side buy \
  --dollars 50 --price 50000 --client-order-id "bot-$(date +%s)" -q
```

Prediction-market buy dollar sizing caps total spend including estimated fees.
Limit orders size from the limit price; market, IOC, and FOK orders size from a
WebSocket depth snapshot. Prediction-market sell dollar sizing targets gross
notional and reports estimated fees/net proceeds in dry-run output. Spot
dollar-based orders use your fee tier to keep total spend including fees within
the dollar budget.

### Stdin Input

```bash
# Pipe order parameters as JSON (flags override stdin values)
echo '{"symbol":"GEMI-OSCARBP26-OSBP26ONEB","side":"buy","outcome":"yes","quantity":"100","price":"0.65","client_order_id":"bot-123"}' \
  | gemini-markets predict order place --stdin -q

# Combine with dry-run for validation
echo '{"symbol":"GEMI-TEST","side":"buy","outcome":"yes","quantity":"100","price":"0.65"}' \
  | gemini-markets predict order place --stdin --dry-run -q
```

---

## Common Workflows

### 1. Market Discovery → Analysis → Order

```bash
# Step 1: Find markets
MARKETS=$(gemini-markets predict markets search "NBA" -q)
SYMBOL=$(echo "$MARKETS" | jq -r '.[0].contracts[0].instrumentSymbol')

# Step 2: Analyze spread
gemini-markets analyze "$SYMBOL" --quantity 100 -q

# Step 3: Place order
gemini-markets predict order place \
  --symbol "$SYMBOL" \
  --side buy --outcome yes \
  --quantity 100 --price 0.60 \
  --client-order-id "bot-$(date +%s)" \
  -q
```

### 2. Market Making

```bash
# Get current book
BOOK=$(gemini-markets book "$SYMBOL" -q)
BEST_BID=$(echo "$BOOK" | jq -r '.bids[0].price')
BEST_ASK=$(echo "$BOOK" | jq -r '.asks[0].price')

# Place post-only orders inside spread
BUY_PRICE=$(echo "$BEST_BID + 0.01" | bc)
SELL_PRICE=$(echo "$BEST_ASK - 0.01" | bc)

# Buy order (post-only ensures you're maker)
gemini-markets predict order place \
  --symbol "$SYMBOL" \
  --side buy --outcome yes \
  --quantity 100 --price "$BUY_PRICE" \
  --tif post-only \
  --client-order-id "mm-buy-$(date +%s)" \
  -q

# Sell order
gemini-markets predict order place \
  --symbol "$SYMBOL" \
  --side sell --outcome yes \
  --quantity 100 --price "$SELL_PRICE" \
  --tif post-only \
  --client-order-id "mm-sell-$(date +%s)" \
  -q
```

### 3. Risk Management (Kill Switch)

```bash
#!/bin/bash
# Emergency exit - cancel everything

echo "Cancelling all orders..." >&2

# Cancel all spot orders (--yes skips confirmation prompt)
gemini-markets spot order cancel-all --yes -q

# Cancel all prediction orders
gemini-markets predict order cancel-all --yes -q

# Verify no open orders remain
SPOT_OPEN=$(gemini-markets spot order list -q | jq 'length')
PREDICT_OPEN=$(gemini-markets predict order list -q | jq 'length')

if [ "$SPOT_OPEN" -eq 0 ] && [ "$PREDICT_OPEN" -eq 0 ]; then
  echo "All orders cancelled successfully" >&2
  exit 0
else
  echo "Warning: Some orders may still be open" >&2
  exit 1
fi
```

---

## Machine-Readable Specification

```bash
gemini-markets spec -q > spec.json
```

**Spec sections:** commands, workflows, schemas, errors, limits, retry

```bash
gemini-markets spec --section workflows -q  # Just workflows
gemini-markets spec --section errors -q     # Just error codes
```

---

## Native Tool Schemas (MCP, OpenAI, Anthropic)

Generate tool schemas for your agent framework:

```bash
# Model Context Protocol (Claude, etc.)
gemini-markets agent --format mcp -q > tools.json

# OpenAI function calling
gemini-markets agent --format openai -q > functions.json

# Anthropic tool use
gemini-markets agent --format anthropic -q > tools.json
```

**Tool schemas include:** order placement, market discovery, positions, balances, book, candles, and more.

---

## Market Discovery Commands

```bash
# Find markets
gemini-markets predict markets list --status active -q
gemini-markets predict markets search "NBA" -q

# Time-based discovery
gemini-markets predict markets newly-listed -q      # Created last 24h
gemini-markets predict markets recently-settled -q  # Settled last 24h
gemini-markets predict markets upcoming -q          # Pre-launch approved

# Filter by category
gemini-markets predict markets newly-listed --category Sports --limit 10 -q
```

---

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `GEMINI_ACCESS_TOKEN` | No | OAuth Bearer token for CI/agents |
| `GEMINI_API_KEY` | No | API key from Gemini Exchange |
| `GEMINI_API_SECRET` | No | API secret (stored securely) |
| `GEMINI_ENVIRONMENT` | No | `production` (default) or `sandbox` |
| `GEMINI_OAUTH_CLIENT_ID` | No | Optional OAuth public client ID override for `auth login` |
| `GEMINI_OAUTH_CLIENT_SECRET` | No | Optional OAuth secret for confidential-client token exchange/refresh |
| `GEMINI_OAUTH_CALLBACK_PORT` | No | OAuth localhost callback port (default `8787`) |

**Secure credential storage:**

```bash
# Browser-based OAuth login
export GEMINI_OAUTH_CLIENT_ID="your-client-id"
gemini-markets auth login

# Inspect the active auth mode and environment
gemini-markets auth status

# Interactive setup (stores in OS keychain)
gemini-markets auth setup

# Verify the active auth session
gemini-markets auth status -q

# Validate that the active credentials can reach authenticated APIs
gemini-markets auth test -q
```

OAuth login uses OAuth 2.1 authorization code with PKCE as a public client by
default, so no client secret is required. Register custom OAuth applications
with redirect URL `http://localhost:8787/callback` unless
`GEMINI_OAUTH_CALLBACK_PORT` is set to a different port. Request account read,
balances read, history read, orders read, and orders create. These scopes cover
prediction and spot trading, as well as private WebSocket streams
(`stream orders`, `stream balances`, `stream positions`).

Credentials stored in:
- **macOS**: Keychain
- **Windows**: Credential Manager
- **Linux**: Secret Service (GNOME Keyring / KWallet)
- **Fallback**: Encrypted file (~/.config/gemini/keyring)

---

## Debugging

### Enable Debug Logging

```bash
gemini-markets --debug <command>
```

Debug output goes to **stderr**, so it won't interfere with JSON piping:

```bash
gemini-markets --debug balance -q 2>/tmp/debug.log | jq '.'
```

### Common Debug Checks

```bash
# Check public API connectivity
gemini-markets status -q

# Inspect auth mode and stored session metadata
gemini-markets auth status -q

# Test authenticated API access
gemini-markets auth test -q

# Run final trading-readiness preflight
gemini-markets doctor -q

# Verify WebSocket connection
gemini-markets --debug stream ticker BTCUSD -q 2>&1 | grep -i "websocket"
```

---

## Performance Optimization

### 1. Use WebSocket for High-Frequency Operations

**Before (REST - 600 req/min limit):**
```bash
for i in {1..100}; do
  gemini-markets predict order list -q > /dev/null
done
# Risk hitting rate limit
```

**After (WebSocket - unlimited):**
```bash
gemini-markets stream orders -q | while read -r line; do
  echo "$line" | jq '.'
done
```

### 2. Batch Cancel Operations

**Before (individual cancels):**
```bash
for order_id in $(jq -r '.[].orderId' orders.json); do
  gemini-markets predict order cancel "$order_id" -q
done
```

**After (atomic batch cancel):**
```bash
gemini-markets predict order cancel-all --yes -q
```

### 3. Use Raw Output for Processing

```bash
# Pretty-printed (slower, more bytes)
gemini-markets balance -q | jq '.'

# Compact (faster, less bytes)
gemini-markets balance --raw -q | jq -c '.'
```

---

## Language-Agnostic Integration

The CLI is designed for any language via subprocess execution:

### Python Example

```python
import subprocess
import json

def get_balance(currency):
    result = subprocess.run(
        ["gemini-markets", "balance", "-q"],
        capture_output=True,
        text=True,
        check=True
    )
    balances = json.loads(result.stdout)
    return next((b for b in balances if b["currency"] == currency), None)

def place_order(symbol, side, outcome, quantity, price):
    client_order_id = f"bot-{int(time.time())}"

    result = subprocess.run([
        "gemini-markets", "predict", "order", "place",
        "--symbol", symbol,
        "--side", side,
        "--outcome", outcome,
        "--quantity", str(quantity),
        "--price", str(price),
        "--client-order-id", client_order_id,
        "-q"
    ], capture_output=True, text=True)

    response = json.loads(result.stdout)

    if not response.get("success", True):
        error = response["error"]
        if error["retryable"]:
            # Retry logic here
            pass
        else:
            raise Exception(f"Order failed: {error['code']}")

    return response
```

### Node.js Example

```javascript
const { execSync } = require('child_process');

function getBalance(currency) {
  const output = execSync('gemini-markets balance -q', { encoding: 'utf-8' });
  const balances = JSON.parse(output);
  return balances.find(b => b.currency === currency);
}

function placeOrder({ symbol, side, outcome, quantity, price }) {
  const clientOrderId = `bot-${Date.now()}`;

  const cmd = [
    'gemini-markets', 'predict', 'order', 'place',
    '--symbol', symbol,
    '--side', side,
    '--outcome', outcome,
    '--quantity', quantity.toString(),
    '--price', price.toString(),
    '--client-order-id', clientOrderId,
    '-q'
  ].join(' ');

  const output = execSync(cmd, { encoding: 'utf-8' });
  const response = JSON.parse(output);

  if (!response.success) {
    const { code, retryable, message } = response.error;
    if (!retryable) {
      throw new Error(`Order failed: ${code} - ${message}`);
    }
    // Retry logic here
  }

  return response;
}
```

---

## Getting Help

### CLI Help

```bash
# General help
gemini-markets --help

# Command-specific help
gemini-markets predict order place --help

# Get full spec
gemini-markets spec -q > spec.json
```

### API Documentation

Complete Gemini API documentation: https://docs.gemini.com/llms.txt

### GitHub Issues

Report issues or request features: https://github.com/gemini/gemini-markets-cli/issues

---

## Checklist for Production Agents

- [ ] Credentials stored securely (not in code)
- [ ] Using `--client-order-id` for all orders
- [ ] Error handling checks `error.retryable`
- [ ] Rate limit handling with exponential backoff
- [ ] State reconciliation loop (every 30-60s)
- [ ] Kill switch implemented (cancel-all)
- [ ] Testing done in sandbox first
- [ ] Monitoring/logging order fills and errors
- [ ] Position limits enforced
- [ ] Circuit breaker logic respects cooldown periods

---

**You're ready to build autonomous trading agents on Gemini!** 🚀
