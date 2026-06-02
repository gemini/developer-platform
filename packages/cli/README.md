# Gemini Markets CLI

[![CI](https://github.com/gemini/gemini-markets-cli/actions/workflows/ci.yml/badge.svg)](https://github.com/gemini/gemini-markets-cli/actions/workflows/ci.yml)
[![Go Report Card](https://goreportcard.com/badge/github.com/gemini/gemini-markets-cli)](https://goreportcard.com/report/github.com/gemini/gemini-markets-cli)
[![codecov](https://codecov.io/gh/gemini/gemini-markets-cli/branch/main/graph/badge.svg)](https://codecov.io/gh/gemini/gemini-markets-cli)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Go Version](https://img.shields.io/github/go-mod/go-version/gemini/gemini-markets-cli)](go.mod)

A command-line interface for trading on Gemini - supporting both **spot trading** and **prediction markets**. **Designed for AI agents** with JSON output by default.

**📚 Documentation:** [AI Agent Guide](AGENTS.md) • [Architecture](ARCHITECTURE.md) • [Contributing](CONTRIBUTING.md) • [Changelog](CHANGELOG.md)

## Installation

### Quick Install (macOS/Linux)

```bash
curl -sSL https://raw.githubusercontent.com/gemini/gemini-markets-cli/main/install.sh | bash
```

### Download Binary

Download the latest release for your platform from [GitHub Releases](https://github.com/gemini/gemini-markets-cli/releases).

| Platform | Download |
|----------|----------|
| macOS (Apple Silicon) | `gemini-markets_VERSION_darwin_arm64.tar.gz` |
| macOS (Intel) | `gemini-markets_VERSION_darwin_amd64.tar.gz` |
| Linux (x64) | `gemini-markets_VERSION_linux_amd64.tar.gz` |
| Linux (ARM64) | `gemini-markets_VERSION_linux_arm64.tar.gz` |
| Windows | `gemini-markets_VERSION_windows_amd64.zip` |

### Go Install

```bash
go install github.com/gemini/gemini-markets-cli/cmd/gemini-markets@latest
```

### From Source

```bash
git clone https://github.com/gemini/gemini-markets-cli
cd gemini-markets-cli
go build -o gemini-markets ./cmd/gemini-markets
sudo mv gemini-markets /usr/local/bin/
```

### Updating

```bash
# Self-update (verifies SHA256 checksum)
gemini-markets update

# Check for updates without installing
gemini-markets update --check

# Or re-run the installer
curl -sSL https://raw.githubusercontent.com/gemini/gemini-markets-cli/main/install.sh | bash
```

---

## Security

### Credential Storage

Credentials are stored securely in your OS keychain:

| Platform | Backend |
|----------|---------|
| macOS | Keychain |
| Windows | Credential Manager |
| Linux | Secret Service (GNOME Keyring / KWallet) |
| Fallback | Encrypted file (~/.config/gemini/keyring) |

```bash
# Browser-based OAuth login
gemini-markets auth login

# Inspect the active auth mode and environment
gemini-markets auth status

# Store API credentials in keychain (interactive)
gemini-markets auth setup

# Or use environment variables (recommended for CI/containers)
export GEMINI_ACCESS_TOKEN="your-access-token"
# or
export GEMINI_API_KEY="your-key"
export GEMINI_API_SECRET="your-secret"
```

**macOS note:** If prompted for Keychain access each time, self-sign the binary:
```bash
codesign -s - /usr/local/bin/gemini-markets
```

### Update Verification

Self-updates verify SHA256 checksums before installing to prevent supply chain attacks.

### Transport Security

- TLS 1.2+ required for all API connections
- Strong cipher suites only (AES-GCM, ChaCha20-Poly1305)

---

## Quick Start

```bash
# 1. Configure credentials
gemini-markets auth login
gemini-markets auth status

# or API credentials / CI env vars
export GEMINI_API_KEY="your-api-key"
export GEMINI_API_SECRET="your-api-secret"

# 2. Validate execution readiness
gemini-markets auth test -q
gemini-markets doctor -q

# 3. Spot Trading
gemini-markets spot symbols                    # List tradeable pairs
gemini-markets spot order place --symbol BTCUSD --side buy \
  --type limit --amount 100 --price 50000      # Place order

# 4. Prediction Markets
gemini-markets predict markets list --status active
gemini-markets predict order place --symbol GEMI-OSCARBP26-OSBP26ONEB \
  --side buy --outcome yes --type limit \
  --quantity 100 --price 0.62

# 5. Shared commands work for both
gemini-markets book BTCUSD                     # Spot order book
gemini-markets book GEMI-OSCARBP26-OSBP26ONEB  # Prediction order book
gemini-markets balance                         # Account balance
```

---

## Agent Integration

**📖 [Read the complete AI Agent Integration Guide](AGENTS.md)** - Everything you need to build autonomous trading agents.

This CLI is built for AI agent integration. Run `gemini-markets spec` for a complete machine-readable specification including workflows, commands, and response schemas.

### API Documentation

For the complete Gemini API documentation, see: https://docs.gemini.com/llms.txt

### Key Design Principles

| Feature | Description |
|---------|-------------|
| **JSON by default** | All responses are structured JSON |
| **Quiet mode** | Use `-q` to suppress stderr for clean piping |
| **Idempotent orders** | Use `--client-order-id` for safe retries |
| **Structured errors** | Errors include codes, retryability hints |
| **Machine-readable spec** | `gemini-markets spec` outputs full API schema |

---

## Common Workflows

### 1. Market Discovery

Find markets and understand available contracts:

```bash
# List all active markets
gemini-markets predict markets list --status active -q

# Get detailed market info with contracts
gemini-markets predict markets get OSCARBP26 -q

# Search for specific markets
gemini-markets predict markets search "Bitcoin" -q
```

**Response structure:**
```json
{
  "ticker": "OSCARBP26",
  "title": "Oscar for Best Picture?",
  "status": "active",
  "contracts": [
    {
      "instrumentSymbol": "GEMI-OSCARBP26-OSBP26ONEB",
      "label": "One Best Picture",
      "prices": { "buy": "0.80", "sell": "0.75" }
    }
  ]
}
```

### 2. Pre-Trade Analysis

Before placing an order, analyze costs:

```bash
# Step 1: Check your balance
gemini-markets balance --currency USD -q

# Step 2: Get order book depth
gemini-markets book GEMI-OSCARBP26-OSBP26ONEB --limit 20 -q

# Step 3: Estimate fills
gemini-markets analyze GEMI-OSCARBP26-OSBP26ONEB --quantity 100 -q
```

**Order book response:**
```json
{
  "bids": [
    { "price": "0.75", "amount": "500.0" },
    { "price": "0.74", "amount": "1270.0" }
  ],
  "asks": [
    { "price": "0.80", "amount": "500.0" },
    { "price": "0.81", "amount": "2052.0" }
  ]
}
```

**Fee response:**
```json
{
  "makerFee": "0.75",
  "takerFee": "1.00",
  "makerFeeRate": "0.01",
  "takerFeeRate": "0.01"
}
```

### 3. Order Execution

Place orders with idempotency for safe retries:

```bash
# Place a limit order
gemini-markets predict order place \
  --symbol GEMI-OSCARBP26-OSBP26ONEB \
  --side buy \
  --outcome yes \
  --type limit \
  --quantity 100 \
  --price 0.75 \
  --client-order-id "bot-$(date +%s)-oscars" \
  -q

# Check order status
gemini-markets predict order list -q

# Cancel if needed
gemini-markets predict order cancel <order-id> -q
```

**Order response:**
```json
{
  "orderId": "12345678",
  "clientOrderId": "bot-1234567890-oscars",
  "symbol": "GEMI-OSCARBP26-OSBP26ONEB",
  "side": "buy",
  "outcome": "yes",
  "status": "open",
  "price": "0.75",
  "quantity": "100",
  "filledQuantity": "0"
}
```

### 4. Position Monitoring

Track your positions and order history:

```bash
# List open positions
gemini-markets predict positions list -q

# List settled positions
gemini-markets predict positions settled -q

# Order history
gemini-markets predict order history --limit 50 -q
```

### 5. Real-Time Streaming

Stream market data via WebSocket:

```bash
# Stream best bid/ask (public)
gemini-markets stream ticker GEMI-OSCARBP26-OSBP26ONEB -q

# Stream trades (public)
gemini-markets stream trades GEMI-OSCARBP26-OSBP26ONEB -q

# Stream contract lifecycle events (public)
gemini-markets stream contract-status -q
gemini-markets stream contract-status --symbol GEMI-NBA* -q

# Stream order updates (authenticated)
gemini-markets stream orders -q

# Stream balance updates (authenticated)
gemini-markets stream balances -q

# Stream position updates (authenticated)
gemini-markets stream positions -q
```

Private account streams authenticate at the WebSocket upgrade. The CLI supports
account-scoped HMAC API keys (`GEMINI_API_KEY` and `GEMINI_API_SECRET`) and
OAuth bearer tokens from `auth login` / `GEMINI_ACCESS_TOKEN`. OAuth sessions
must include the account, balance, history, and order scopes requested by this
CLI; those trading scopes currently cover prediction trading.

### 6. Historical Data

Get OHLCV candle data for analysis:

```bash
# Recent candles
gemini-markets candles GEMI-OSCARBP26-OSBP26ONEB --timeframe 1day --limit 30 -q

# Historical range
gemini-markets klines GEMI-OSCARBP26-OSBP26ONEB --interval 1hr --lookback 7d -q
```

### 7. Market Making

Provide liquidity on prediction markets using post-only orders:

```bash
# Post-only orders ensure you're always the maker (providing liquidity)
# If your order would cross the spread and fill immediately, it's rejected

# Example: Market make on a sports game (Houston vs Orlando)
# Current book: HOU 0.56/0.58, ORL 0.41/0.44

# Place buy orders 1¢ inside the spread on both outcomes
gemini-markets predict order place \
  --symbol GEMI-NBA-2602270030-HOU-ORL-M-HOU \
  --side buy --outcome yes \
  --quantity 100 --price 0.57 \
  --tif post-only -q

gemini-markets predict order place \
  --symbol GEMI-NBA-2602270030-HOU-ORL-M-ORL \
  --side buy --outcome yes \
  --quantity 100 --price 0.42 \
  --tif post-only -q

# If both fill: you pay $0.99, get $1.00 at settlement = $1 profit per 100 contracts
```

**Time-in-force options:**

| TIF | Description |
|-----|-------------|
| `good-til-cancel` | Default - order stays open until filled or cancelled |
| `post-only` | Maker-only - rejected if it would take liquidity |
| `immediate-or-cancel` | Fill what you can immediately, cancel the rest |
| `fill-or-kill` | Fill entire order immediately or cancel completely |

---

## Command Structure

```
gemini-markets
├── spot                          # Spot/crypto trading
│   ├── symbols                   # List tradeable pairs
│   ├── symbol <pair>             # Symbol details (tick size, min order)
│   ├── order place|get|list|cancel|cancel-all
│   ├── trades                    # Trade history
│   └── fees                      # Fee tier info
│
├── predict                       # Prediction markets
│   ├── markets list|get|search|categories|symbols
│   ├── order place|get|list|history|cancel|cancel-all
│   └── positions list|settled
│
├── book <symbol>                 # Order book (works for both)
├── stream ticker|trades|depth|contract-status  # WebSocket streams (public)
├── stream orders|balances|positions            # WebSocket streams (authenticated)
├── candles / klines              # OHLCV data
├── balance                       # Account balances
├── analyze <symbol>              # Spread analysis
│
└── config|status|spec|update     # Utilities
```

---

## Command Reference

### Spot Trading (`spot`)

| Command | Description |
|---------|-------------|
| `spot symbols` | List all tradeable pairs |
| `spot symbol <pair>` | Get symbol details (tick size, min order) |
| `spot order place` | Place a spot order |
| `spot order get <id>` | Get order status |
| `spot order list` | List open orders |
| `spot order cancel <id>` | Cancel an order |
| `spot order cancel-all` | Cancel all open orders |
| `spot trades` | List trade history |
| `spot fees` | Show fee tier info |

### Prediction Markets (`predict`)

| Command | Description |
|---------|-------------|
| `predict markets list` | List prediction markets |
| `predict markets get <ticker>` | Get market details with contracts |
| `predict markets search <query>` | Search markets by keyword |
| `predict markets categories` | List market categories |
| `predict markets symbols` | List all tradeable symbols |
| `predict order place` | Place a prediction order |
| `predict order get <id>` | Get order details |
| `predict order list` | List open orders |
| `predict order history` | List order history |
| `predict order cancel <id>` | Cancel an order |
| `predict order cancel-all` | Cancel all open orders |
| `predict positions list` | List open positions |
| `predict positions settled` | List settled positions |

### Shared Commands

| Command | Description |
|---------|-------------|
| `book <symbol>` | Get order book depth |
| `candles <symbol>` | Get recent OHLCV data |
| `klines <symbol>` | Get historical OHLCV with time range |
| `balance` | Get account balances |
| `analyze <symbol>` | Analyze spread and liquidity |

### Account (Authenticated)

| Command | Description |
|---------|-------------|
| `balance` | Get account balances |

### Streaming

| Command | Auth | Description |
|---------|------|-------------|
| `stream ticker <symbol>` | No | Stream best bid/ask |
| `stream trades <symbol>` | No | Stream executed trades |
| `stream depth <symbol>` | No | Stream order book updates |
| `stream contract-status` | No | Stream contract lifecycle events |
| `stream orders` | HMAC | Stream your order updates |
| `stream balances` | HMAC | Stream your balance updates |
| `stream positions` | HMAC | Stream your position updates |

### Utility

| Command | Description |
|---------|-------------|
| `auth login` | Browser-based OAuth login |
| `auth setup` | API key credential setup (stored in OS keychain) |
| `auth show` | Show stored credentials (secrets masked) |
| `auth status` | Show the active auth source, environment, and stored session metadata |
| `auth test` | Validate authenticated API access |
| `auth logout` | Clear the active stored authentication state |
| `doctor` | Run trading-readiness diagnostics and report blocking checks |
| `status` | Check public API reachability and latency |
| `spec` | Output machine-readable CLI specification |
| `completion <shell>` | Generate shell completions |
| `update` | Update to the latest version |
| `update --check` | Check for updates without installing |

---

## Response Schemas

### Market

```json
{
  "ticker": "string - unique market identifier",
  "title": "string - human-readable title",
  "status": "string - active|closed|settled",
  "category": "string - market category",
  "volume24h": "string - 24h volume in USD",
  "expiryDate": "string - expiration date",
  "contracts": "Contract[] - tradeable contracts"
}
```

### Contract

```json
{
  "id": "string - contract ID",
  "instrumentSymbol": "string - use this for orders",
  "label": "string - contract label",
  "status": "string - contract status",
  "prices": {
    "buy": "string - best ask price",
    "sell": "string - best bid price"
  }
}
```

### OrderBook

```json
{
  "bids": [{ "price": "string", "amount": "string" }],
  "asks": [{ "price": "string", "amount": "string" }]
}
```

### Balance

```json
{
  "currency": "string - e.g., USD",
  "amount": "string - total balance",
  "available": "string - available for trading",
  "availableForWithdrawal": "string"
}
```

### OrderResponse

```json
{
  "orderId": "string - server-assigned ID",
  "clientOrderId": "string - your idempotency key",
  "symbol": "string - contract symbol",
  "side": "string - buy|sell",
  "outcome": "string - yes|no",
  "type": "string - limit|market",
  "status": "string - open|filled|cancelled",
  "price": "string - limit price",
  "quantity": "string - order quantity",
  "filledQuantity": "string - filled so far",
  "createdAt": "string - timestamp"
}
```

---

## Error Handling

All errors are structured JSON:

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

### Error Codes

| Code | Retryable | Description |
|------|-----------|-------------|
| `INVALID_INPUT` | No | Invalid command arguments |
| `AUTH_REQUIRED` | No | Missing or expired authentication |
| `AUTH_FAILED` | No | Invalid token or API credentials |
| `INSUFFICIENT_FUNDS` | No | Not enough balance |
| `RATE_LIMITED` | Yes | Too many requests |
| `MARKET_CLOSED` | No | Market not accepting orders |
| `NETWORK_ERROR` | Yes | Connection failed |
| `ORDER_NOT_FOUND` | No | Order ID doesn't exist |

---

## Global Flags

| Flag | Default | Description |
|------|---------|-------------|
| `-o, --output` | `json` | Output format: `json`, `table`, or `csv` |
| `-q, --quiet` | `false` | Suppress stderr for clean JSON piping |
| `--raw` | `false` | Compact JSON (no pretty-printing) |
| `--timeout` | `30` | Request timeout in seconds |
| `--debug` | `false` | Enable debug logging |
| `--sandbox` | `false` | Use sandbox environment |

---

## Environment Variables

| Variable | Description |
|----------|-------------|
| `GEMINI_ACCESS_TOKEN` | OAuth Bearer token for agents/CI |
| `GEMINI_API_KEY` | API key from Gemini |
| `GEMINI_API_SECRET` | API secret from Gemini |
| `GEMINI_ENVIRONMENT` | `production` (default) or `sandbox` |
| `GEMINI_OAUTH_CLIENT_ID` | Optional OAuth public client ID override for `auth login` |
| `GEMINI_OAUTH_CLIENT_SECRET` | Optional OAuth secret for confidential-client token exchange/refresh |
| `GEMINI_OAUTH_CALLBACK_PORT` | OAuth localhost callback port (default `8787`) |

Use `gemini-markets auth login` for browser-based OAuth login, or get API credentials from [Gemini Exchange Settings](https://exchange.gemini.com/settings/api).

OAuth login uses OAuth 2.1 authorization code with PKCE as a public client by default, so no client secret is required. For custom OAuth app registration, use redirect URL `http://localhost:8787/callback` and request these permissions: account read, balances read, history read, orders read, and orders create. These trading scopes currently cover prediction trading.

Use `gemini-markets auth status` to inspect which auth mode is active, which environment it targets, and whether an OAuth session is expired or refreshable. This is metadata only; use `gemini-markets auth test` for a live authenticated probe and `gemini-markets doctor` for full trading readiness.

`gemini-markets doctor -q` is the bot/operator preflight. It reports `readyForTrading`, `readyForTradingReason`, and `blockingChecks` so an execution process can fail closed before sending orders.

---

## Shell Completions

```bash
# Bash
source <(gemini-markets completion bash)

# Zsh
source <(gemini-markets completion zsh)

# Fish
gemini-markets completion fish | source
```

## Manpages

Manpages for every command are generated into `docs/man/`.

```bash
go run ./cmd/gen-docs
```

---

## Agent Examples

Order placement uses WebSocket (wsapi) by default and fails closed if WebSocket
placement is unavailable. Use `--no-websocket` only when you intentionally want
to place through REST.

### 1. Find Markets

```bash
gemini-markets predict markets search "NBA" -q
gemini-markets predict markets get NBA-2602270030-HOU-ORL -q
```

### 2. Subscribe to Market Data

```bash
# Real-time order book depth
gemini-markets stream depth GEMI-NBA-2602270030-HOU-ORL-M-HOU -q
gemini-markets stream depth GEMI-NBA-2602270030-HOU-ORL-M-ORL -q
```

### 3. Place and Cancel Orders

```bash
# Place post-only orders (via WebSocket)
gemini-markets predict order place \
  --symbol GEMI-NBA-2602270030-HOU-ORL-M-HOU \
  --side buy --outcome yes --quantity 100 --price 0.57 \
  --tif post-only --client-order-id "$(uuidgen)" -q

# Cancel order (via WebSocket)
gemini-markets predict order cancel <order-id> -q

# Cancel all orders
gemini-markets predict order cancel-all -q
```

### 4. Monitor Fills, Balances, and Positions

```bash
# Stream order fills
gemini-markets stream orders --event-type fill -q

# Stream balance updates
gemini-markets stream balances -q

# Stream position updates (real-time deltas on fills)
gemini-markets stream positions -q
```

---

## License

MIT
