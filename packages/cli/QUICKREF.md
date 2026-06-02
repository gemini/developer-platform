# Quick Reference

## Core Commands

```bash
# Account
gemini-markets balance -q
gemini-markets balance --currency USD -q

# Order Book
gemini-markets book <symbol> -q
gemini-markets book GEMI-OSCARBP26-OSBP26ONEB --limit 20 -q

# Prediction Markets
gemini-markets predict markets list --status active -q
gemini-markets predict markets get <ticker> -q

gemini-markets predict order place \
  --symbol <SYM> --side buy|sell --outcome yes|no \
  --quantity <N> --price <P> --client-order-id <ID> -q

# Or by dollar amount (buy includes estimated prediction fees)
gemini-markets predict order place \
  --symbol <SYM> --side buy --outcome yes \
  --dollars 50 --price 0.65 -q

gemini-markets predict order list -q
gemini-markets predict order get <order-id> -q
gemini-markets predict order cancel <order-id> -q
gemini-markets predict order cancel-all --yes -q

gemini-markets predict positions list -q

# Spot Trading
gemini-markets spot symbols -q
gemini-markets spot symbol <pair> -q

gemini-markets spot order place \
  --symbol <PAIR> --side buy|sell \
  --amount <N> --price <P> --client-order-id <ID> -q

gemini-markets spot order list -q
gemini-markets spot order cancel <order-id> -q

# Streaming
gemini-markets stream ticker <symbol> -q
gemini-markets stream trades <symbol> -q
gemini-markets stream depth <symbol> -q
gemini-markets stream contract-status -q
gemini-markets stream contract-status --symbol GEMI-NBA* -q
gemini-markets stream orders -q
gemini-markets stream balances -q
gemini-markets stream positions -q

# Historical
gemini-markets candles <symbol> --timeframe 1day -q
gemini-markets klines <symbol> --interval 1hr --lookback 7d -q
```

## Safety Flags

```bash
--dry-run            # Preview action without executing (order place, cancel-all)
--yes, -y            # Skip confirmation prompt (cancel-all)
--stdin              # Read order params from stdin as JSON (order place)
--dollars <N>        # Order by dollar amount; prediction buys include estimated fees
```

## Output Flags

```bash
-q, --quiet          # Suppress stderr (clean JSON piping)
--raw                # Compact JSON (no pretty-print)
-o table             # Human-readable table
-o csv               # CSV format
--verbose            # Full field names (default: abbreviated)
```

## Field Name Abbreviations

Default JSON uses abbreviated field names for token efficiency:

```
id = orderId
cid = clientOrderId
sym = symbol/instrumentSymbol
px = price
qty = quantity
filled = filledQuantity
remain = remainingQuantity
ts = timestamp/createdAt
cur = currency
amt = amount
avail = available
availWd = availableForWithdrawal
out = outcome
```

Use `--verbose` for full field names.

## Error Handling

### Retryable Errors (use exponential backoff)
- `RATE_LIMITED` - Wait for Retry-After header duration
- `NETWORK_ERROR` - Retry max 3 times, 1s base delay
- `SERVER_ERROR` - Backend issue, retry max 3 times

### Fix & Retry
- `INSUFFICIENT_FUNDS` - Deposit funds or reduce size
- `AUTH_FAILED` - Check API credentials
- `INVALID_INPUT` - Fix command arguments
- `MARKET_CLOSED` - Check market status
- `ORDER_REJECTED` - Verify price/quantity parameters
- `NOT_FOUND` - Check symbol/order ID exists

### Check Error Response
```json
{
  "success": false,
  "error": {
    "code": "RATE_LIMITED",
    "retry": true,
    "msg": "Rate limit exceeded"
  }
}
```

## Rate Limits

- **REST API**: 600 requests/minute (all endpoints)
- **WebSocket**: 5 concurrent connections per account
- **Circuit Breaker**: Opens after 3x 429 errors, closes after 30s
- **Recommended**: Max 10 requests/second

## API Constraints

### Prediction Markets
- Min quantity: 1 contract
- Max quantity: 10,000 contracts per order
- Price increment: 0.01 (1 cent)
- Price range: 0.01 to 0.99
- Outcome values: `yes` or `no`

### Spot Trading
- Min order size: Varies by symbol (use `spot symbol <pair>`)
- Tick size: Varies by symbol (use `spot symbol <pair>`)
- Price precision: Varies by symbol

## Idempotency Pattern

Always use `--client-order-id` for safe retries:

```bash
ORDER_ID="bot-$(date +%s)-$(uuidgen | head -c 8)"

gemini-markets predict order place \
  --symbol GEMI-OSCARBP26-OSBP26ONEB \
  --side buy --outcome yes \
  --quantity 100 --price 0.75 \
  --client-order-id "$ORDER_ID" \
  -q
```

If request fails, retry with **same** `client-order-id` - no duplicate orders.

## Discovery

```bash
# Get CLI capabilities
gemini-markets discover -q

# Get detailed spec
gemini-markets spec -q

# Get specific spec section
gemini-markets spec --section errors -q
gemini-markets spec --section schemas -q
gemini-markets spec --section workflows -q
gemini-markets spec --section limits -q
```

## Testing

```bash
# Use sandbox environment
export GEMINI_API_KEY="sandbox-key"
export GEMINI_API_SECRET="sandbox-secret"

gemini-markets --sandbox <command>
```

## Help

```bash
gemini-markets --help
gemini-markets predict order place --help
```
