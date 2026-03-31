# Gemini MCP Server

An MCP (Model Context Protocol) server that exposes the [Gemini cryptocurrency exchange API](https://docs.gemini.com/rest-api/) as tools for AI assistants like Claude.

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
        "GEMINI_ACCOUNT": "primary"
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
        "GEMINI_ACCOUNT": "primary"
      }
    }
  }
}
```

> **Sandbox testing:** Set `GEMINI_API_BASE_URL=https://api.sandbox.gemini.com` to use Gemini's sandbox environment.

## Examples

### Check prices and balances

> "What's the current price of BTC and ETH?"

The assistant will call `gemini_get_ticker` for both symbols and return the latest bid/ask/last prices.

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

Calls `gemini_get_order_book` and returns current bids and asks.

### Staking

> "What are my current staking positions and rewards?"

Calls `gemini_get_staking_balances` to show staked assets and accrued rewards.

> "Stake 1 ETH."

Calls `gemini_stake` with the specified currency and amount.

## Available tools

| Category        | Tools                                                                     | Auth required |
|-----------------|---------------------------------------------------------------------------|---------------|
| **Market Data** | Tickers, candles, order book, trades, auctions, price feed, funding rates | No            |
| **Orders**      | Place, cancel, status, active orders, trade history, volume               | Yes           |
| **Funds**       | Balances, transfers, deposit addresses, withdrawals, bank accounts        | Yes           |
| **Account**     | Account details, sub-accounts, roles, approved addresses                  | Yes           |
| **Margin**      | Margin account, preview, positions, funding payments                      | Yes           |
| **Staking**     | Balances, history, rates, stake, unstake                                  | Yes           |

## Development

```bash
npm run dev    # Run with hot reload via tsx
npm run build  # Compile TypeScript
npm start      # Run compiled output
```
