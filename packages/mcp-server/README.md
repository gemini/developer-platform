# Gemini MCP Server

An MCP (Model Context Protocol) server that exposes the [Gemini cryptocurrency exchange API](https://docs.gemini.com/rest-api/) as tools for AI assistants like Claude.

**Features:**
- 🔄 **Real-time WebSocket streaming** - Live price updates, trades, and order books
- 🚀 **Smart hybrid tools** - Automatic fallback from WebSocket to REST
- ⚡ **< 1ms cached queries** - Instant market data access
- 📊 **40+ tools** - Market data, trading, funds, staking, and more

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

### Test Without MCP Client

```bash
cd packages/mcp-server
npm install
npm run build

# Test with real market data
npx tsx test-hybrid.ts
```

**Output:**
```
✅ BTC/USD Price: 76468.27
✅ Order Book (Top 5)
✅ Last 5 trades
✅ 419 trading pairs available
```

## Examples

### Check prices and balances

> "What's the current price of BTC and ETH?"

The assistant will call `gemini_get_realtime_price` (hybrid tool) for both symbols and return the latest prices. This automatically uses WebSocket cache if subscribed, or fetches via REST API.

> "Show me my account balances."

Calls `gemini_get_balances` and returns your holdings across all currencies.

### Place and manage orders

> "Buy 0.01 BTC at $60,000."

The assistant calls `gemini_new_order` with symbol `btcusd`, side `buy`, amount `0.01`, and price `60000`.

> "Cancel all my open orders."

Calls `gemini_cancel_all_active_orders` to clear your order book.

### Real-time monitoring

> "Subscribe to BTC real-time updates and monitor the price"

The assistant will:
1. Call `gemini_ws_subscribe({ symbol: "btcusd", channel: "trade" })`
2. Repeatedly call `gemini_ws_get_price({ symbol: "btcusd" })` for instant (< 1ms) updates

> "Show me the live order book for ETH"

After subscribing to the depth channel, queries return in < 1ms from WebSocket cache instead of making HTTP requests.

### Market analysis

> "Show me the 1-hour candles for ETH/USD over the last day."

Calls `gemini_get_candles` with symbol `ethusd` and time frame `1hr`.

> "What's the order book depth for SOLUSD?"

Calls `gemini_get_realtime_orderbook` which automatically uses WebSocket cache if subscribed, or fetches via REST.

### Staking

> "What are my current staking positions and rewards?"

Calls `gemini_get_staking_balances` to show staked assets and accrued rewards.

> "Stake 1 ETH."

Calls `gemini_stake` with the specified currency and amount.

## Available Tools

### Market Data Tools

| Tool Type | Latency | Auth Required | When to Use |
|-----------|---------|---------------|-------------|
| **Hybrid Tools** ⭐ | < 1ms (cached) or 200ms (REST) | No | **Default choice** - Auto-optimizes |
| **WebSocket Tools** | < 1ms | No | Real-time monitoring (requires subscription) |
| **REST Tools** | 200ms | No | One-off queries, guaranteed fresh data |

#### Hybrid Tools (Recommended)
- `gemini_get_realtime_price` - Get price (auto-fallback to REST)
- `gemini_get_realtime_orderbook` - Get order book
- `gemini_get_realtime_trades` - Get recent trades

#### WebSocket Tools (Real-time)
- `gemini_ws_subscribe` - Subscribe to real-time channel (trade, depth, bookTicker, ticker)
- `gemini_ws_subscribe_multiple` - Batch subscribe multiple symbols
- `gemini_ws_unsubscribe` - Unsubscribe from channel
- `gemini_ws_unsubscribe_symbol` - Unsubscribe all channels for symbol
- `gemini_ws_get_price` - Get cached price (< 1ms, requires subscription)
- `gemini_ws_get_orderbook` - Get cached order book
- `gemini_ws_get_trades` - Get cached recent trades
- `gemini_ws_get_book_ticker` - Get best bid/ask
- `gemini_ws_get_snapshot` - Get complete data snapshot
- `gemini_ws_status` - Check WebSocket status and subscriptions

#### REST Tools (Original)
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

## REST vs WebSocket vs Hybrid

### When to Use Each

| Use Case | Recommended Tool | Why |
|----------|------------------|-----|
| **Default/unknown** | Hybrid tools ⭐ | Just works, auto-optimizes |
| **One-off price check** | REST or Hybrid | Simple, no setup needed |
| **Monitor prices (100+ queries)** | WebSocket | Ultra-fast, real-time streaming |
| **Building dashboard** | WebSocket | Live updates with minimal latency |
| **Batch symbol analysis** | REST | Guaranteed fresh, simple |

### Performance Comparison

**Single price query:**
- REST: 200ms
- Hybrid (not subscribed): 200ms (falls back to REST)
- Hybrid (subscribed): < 1ms (uses WebSocket cache)
- WebSocket: < 1ms (requires subscription first)

**100 price queries (same symbol):**
- REST: ~20 seconds (100 HTTP requests)
- Hybrid or WebSocket: < 100ms (1 subscription + cache queries)

### Example Workflows

**Quick price check (no subscription):**
```
User: "What's the BTC price?"
→ gemini_get_realtime_price (hybrid)
→ Falls back to REST automatically
→ Returns in 200ms
```

**Real-time monitoring:**
```
User: "Monitor BTC price for 10 minutes"
→ gemini_ws_subscribe (once)
→ gemini_ws_get_price (repeatedly, < 1ms each)
→ Real-time updates with minimal latency
```

**Hybrid auto-optimization:**
```
User: "What's the BTC price?" (first call)
→ gemini_get_realtime_price
→ No subscription yet → Uses REST (200ms)

User: "Subscribe to BTC updates"
→ gemini_ws_subscribe

User: "What's the BTC price now?" (subsequent calls)
→ gemini_get_realtime_price
→ Subscription exists → Uses cache (< 1ms) ⚡
```

## Architecture

```
┌─────────────────────────────────────────┐
│          Gemini MCP Server              │
│                                         │
│  WebSocket Manager ←→ In-Memory Store  │
│         ↓                    ↓          │
│  50+ MCP Tools (REST + WebSocket)      │
└─────────────────────────────────────────┘
         ↓                    ↓
   wss://ws.gemini.com  api.gemini.com
   (Real-time data)     (REST API)
```

**Key Components:**
- **WebSocket Manager** - Handles connections, subscriptions, reconnection
- **In-Memory Store** - Caches real-time prices, trades, order books
- **Hybrid Tools** - Smart fallback: WebSocket cache → REST API
- **50+ MCP Tools** - Market data, trading, funds, staking, and more

## Documentation

- **WEBSOCKET.md** - Complete WebSocket guide with examples
- **TOOL_SELECTION_GUIDE.md** - Detailed comparison of REST vs WebSocket vs Hybrid
- **IMPLEMENTATION_SUMMARY.md** - Technical architecture overview

## Development

```bash
npm run dev    # Run with hot reload via tsx
npm run build  # Compile TypeScript
npm start      # Run compiled output

# Testing
npx tsx test-hybrid.ts      # Test REST + WebSocket with live data
npx tsx test-websocket.ts   # Test WebSocket-only functionality
```

## Troubleshooting

### WebSocket not receiving data

WebSocket subscriptions work, but trade data only arrives when actual trades occur. For low-volume trading pairs, updates may be sparse. The hybrid tools automatically fall back to REST if WebSocket data is stale.

### Tools not appearing in Claude

1. Verify the server builds: `npm run build`
2. Check MCP client config file location and syntax
3. Restart your MCP client (Claude Desktop, Claude Code, ChatGPT)
4. Check logs for connection errors

### API authentication errors

- Public market data works without API keys
- Trading and account operations require valid API credentials
- Master API keys need `GEMINI_ACCOUNT` specified
