# Gemini MCP Server

An MCP (Model Context Protocol) server that exposes the [Gemini cryptocurrency exchange API](https://docs.gemini.com/rest-api/) as tools for AI assistants like Claude.

**Features:**
- 📊 Market data, trading, funds, account, margin, staking, and prediction-market tools
- 🔔 Persistent native-OS alerts via a long-running daemon (see [ALERTS.md](ALERTS.md))

## Setup

### 1. Get Gemini API credentials

Create an API key at [exchange.gemini.com/settings/api](https://exchange.gemini.com/settings/api). You'll need both the API key and secret.

> **Master API keys:** If your key starts with `master-`, it has access to multiple sub-accounts and you must also specify which account to target via `GEMINI_ACCOUNT` (e.g. `"primary"`). The server will exit with a clear error on startup if this is missing.

### 2. Install and build

```bash
git clone <repo-url> && cd packages/mcp-server
npm install
npm run build
```

### 3. Add to your MCP client

Credentials are passed as environment variables in your MCP client config — do not use `.env` files.

> **Note:** For public market data (prices, tickers, order books), API keys are optional. They're only required for authenticated operations (trading, balances, withdrawals).

**Claude Code** — add via the CLI:

```bash
claude mcp add gemini -s user -e GEMINI_API_KEY=your_key -e GEMINI_API_SECRET=your_secret -- node /absolute/path/to/mcp-server/dist/index.js
```

For a Master API key, also pass `GEMINI_ACCOUNT`:

```bash
claude mcp add gemini -s user -e GEMINI_API_KEY=master-xxxx -e GEMINI_API_SECRET=your_secret -e GEMINI_ACCOUNT=primary -- node /absolute/path/to/mcp-server/dist/index.js
```

The `-s user` flag registers the server globally across all your projects. Omit it to register only for the current project.

**Claude Desktop** — add to `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "gemini": {
      "command": "node",
      "args": ["/absolute/path/to/mcp-server/dist/index.js"],
      "env": {
        "GEMINI_API_KEY": "your_api_key_here",
        "GEMINI_API_SECRET": "your_api_secret_here",
        "GEMINI_ACCOUNT": "primary",
        "GEMINI_WS_URL": "wss://ws.gemini.com"
      }
    }
  }
}
```

**ChatGPT** — add to your ChatGPT desktop app's MCP config file at `~/.chatgpt/mcp.json`:

```json
{
  "servers": {
    "gemini": {
      "command": "node",
      "args": ["/absolute/path/to/mcp-server/dist/index.js"],
      "env": {
        "GEMINI_API_KEY": "your_api_key_here",
        "GEMINI_API_SECRET": "your_api_secret_here",
        "GEMINI_ACCOUNT": "primary",
        "GEMINI_WS_URL": "wss://ws.gemini.com"
      }
    }
  }
}
```

**Environment Variables:**
- `GEMINI_API_KEY` - Your API key (required for trading/account operations)
- `GEMINI_API_SECRET` - Your API secret (required for trading/account operations)
- `GEMINI_ACCOUNT` - Account name for Master API keys (e.g., "primary")
- `GEMINI_API_BASE_URL` - API base URL (default: `https://api.gemini.com`, sandbox: `https://api.sandbox.gemini.com`)
- `GEMINI_WS_URL` - WebSocket URL (default: `wss://ws.gemini.com`, sandbox: `wss://ws.sandbox.gemini.com`)

## Quick Start

## Examples

### Check prices and balances

> "What's the current price of BTC and ETH?"

Calls `gemini_get_ticker` for each symbol and returns the latest prices.

> "Show me my account balances."

Calls `gemini_get_balances` and returns your holdings across all currencies.

### Place and manage orders

> "Buy 0.01 BTC at $60,000."

The assistant calls `gemini_new_order` with symbol `btcusd`, side `buy`, amount `0.01`, and price `60000`.

> "Cancel all my open orders."

Calls `gemini_cancel_all_active_orders` to clear your order book.

### Market analysis

> "Show me the 1-hour candles for ETH/USD over the last day."

Calls `gemini_get_candles` with symbol `ethusd` and time frame `1hr`.

> "What's the order book depth for SOLUSD?"

Calls `gemini_get_order_book` with symbol `solusd`.

### Staking

> "What are my current staking positions and rewards?"

Calls `gemini_get_staking_balances` to show staked assets and accrued rewards.

> "Stake 1 ETH."

Calls `gemini_stake` with the specified currency and amount.

### Alerts

> "Set up native alerts on this machine."

The assistant runs `gemini_alert_setup` (probe + macOS sender install) followed by `gemini_alert_daemon_install` to register the daemon with the OS service supervisor.

> "Notify me when BTC drops below $50,000."

Calls `gemini_alert_create` with category `price.threshold` and params `{ symbol: "BTCUSD", direction: "below", threshold: "50000" }`.

> "Ping me if my USD balance falls by more than $1,000."

Calls `gemini_alert_create` with category `balance.change` and params `{ currency: "USD", direction: "below", delta: "1000" }`.

> "Show me my active alerts."

Calls `gemini_alert_list`. To remove one, the assistant follows up with `gemini_alert_delete` (or `gemini_alert_update` with `enabled: false`).

See [ALERTS.md](ALERTS.md) for the full example queries (category-by-category) and tool reference.

## Available Tools

### Market Data Tools

- `gemini_get_ticker` - Full ticker data (v2)
- `gemini_get_symbols` - List all trading pairs
- `gemini_get_candles` - OHLC candle data
- `gemini_get_order_book` - Order book via HTTP
- `gemini_get_recent_trades` - Recent trades via HTTP
- `gemini_get_price_feed` - All symbols price feed
- `gemini_get_funding_amounts` - Perpetual funding amounts

### Other Tools

| Category        | Tools                                                                     | Auth required |
|-----------------|---------------------------------------------------------------------------|---------------|
| **Orders**      | Place, cancel, status, active orders, trade history, volume               | Yes           |
| **Funds**       | Balances, transfers, deposit addresses, withdrawals, bank accounts        | Yes           |
| **Account**     | Account details, sub-accounts, roles, approved addresses                  | Yes           |
| **Margin**      | Margin account, preview, positions, funding payments                      | Yes           |
| **Staking**     | Balances, history, rates, stake, unstake                                  | Yes           |
| **Predictions** | Prediction market symbols, contracts, and prices                          | No            |

**Total: 50+ tools**

### Alerts

Persistent alert rules ("notify me when BTC drops 1%") that fire native OS
notifications via a long-running daemon — even when no chat session is active.
Cross-platform: launchd on macOS, systemd --user on Linux, Task Scheduler on
Windows.

Quick setup:

```text
gemini_alert_setup            # probe notifications, install macOS sender
gemini_alert_daemon_install   # register the daemon with the OS service supervisor
gemini_alert_categories       # discover rule shapes
gemini_alert_create           # create a rule
```

10 rule categories (price thresholds & moves, balance changes, order fills,
stop triggers, funding rates, deposit confirmations, liquidation risk,
prediction settlements). See [ALERTS.md](ALERTS.md) for the full tool
reference, rule schemas, and file locations.

## Documentation

- [ALERTS.md](ALERTS.md) — Alert subsystem setup, tool reference, and rule schemas

## Development

```bash
npm run dev    # Run with hot reload via tsx
npm run build  # Compile TypeScript
npm start      # Run compiled output
npm test       # Run unit tests
```

## Troubleshooting

### Tools not appearing in Claude

1. Verify the server builds: `npm run build`
2. Check MCP client config file location and syntax
3. Restart your MCP client (Claude Desktop, Claude Code, ChatGPT)
4. Check logs for connection errors

### API authentication errors

- Public market data works without API keys
- Trading and account operations require valid API credentials
- Master API keys need `GEMINI_ACCOUNT` specified
