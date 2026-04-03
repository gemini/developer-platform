# Gemini Developer Platform

A suite of developer tools for integrating with the [Gemini](https://www.gemini.com/) cryptocurrency exchange API. Includes an MCP server for AI assistant integrations, multi-language SDK samples, and Claude Code skills.

## What's Included

| Package | Description |
|---------|-------------|
| [`packages/mcp-server`](packages/mcp-server/) | MCP server exposing Gemini API as tools for AI assistants |
| [`samples/`](samples/) | REST and WebSocket examples in TypeScript, Python, and Go |
| [`skills/`](skills/) | Claude Code skills (e.g., terminal candlestick charts) |

## Samples

Multi-language examples (TypeScript, Python, Go) demonstrating public and authenticated API usage. See [`samples/README.md`](samples/README.md) for the full guide.

### Quick Start

**No API key required:**
```bash
# Get ticker data
python3 samples/python/get_ticker.py btcusd
go run samples/go/get_ticker.go btcusd
npx ts-node samples/typescript/src/getTicker.ts btcusd

# Stream real-time trades (WebSocket)
python3 samples/python/ws_trades.py btcusd
go run samples/go/ws_trades.go btcusd
```

**With API credentials:**
```bash
# Copy and fill in your credentials
cp samples/.env.example samples/.env

# Get account balances
python3 samples/python/balances.py
go run samples/go/balances.go
npx ts-node samples/typescript/src/balances.ts
```

### Install Dependencies

```bash
# TypeScript
cd samples/typescript && npm install

# Python
cd samples/python && pip install -r requirements.txt

# Go
cd samples/go && go mod download
```

## Configuration

All components read credentials from environment variables:

| Variable | Description |
|----------|-------------|
| `GEMINI_BASE_URL` | API base URL (production or sandbox) |
| `GEMINI_API_KEY` | Your Gemini API key |
| `GEMINI_API_SECRET` | Your Gemini API secret |

For testing, use the sandbox environment:
```
GEMINI_BASE_URL=https://api.sandbox.gemini.com/v1
```

Get sandbox credentials at [exchange.sandbox.gemini.com](https://exchange.sandbox.gemini.com/).

## Authentication

Private endpoints use HMAC-SHA384 signing:

1. Build a JSON payload with the request path and a millisecond timestamp nonce
2. Base64-encode the payload
3. Sign it with your API secret using HMAC-SHA384
4. Send via headers: `X-GEMINI-APIKEY`, `X-GEMINI-PAYLOAD`, `X-GEMINI-SIGNATURE`

All samples and the MCP server handle this automatically.

## Installing Skills

Install all Claude Code skills using the [`skills`](https://www.npmjs.com/package/skills) CLI:

```bash
npx skills add gemini/developer-platform -a claude-code --all -y
```

See [`skills/README.md`](skills/README.md) for installing individual skills or other agents.


## MCP Server

The MCP server exposes the Gemini API as tools compatible with Claude and other MCP clients. It covers 40+ tools across six categories:

- **Market** — ticker, symbols, candles, price feeds, order books, trade history
- **Orders** — place/cancel orders, order status, trade volume
- **Funds** — balances, deposits, withdrawals, transfers, gas fee estimates
- **Account** — account info, sub-accounts, approved addresses
- **Margin** — margin account, preview orders, open positions, funding payments
- **Staking** — balances, rates, history, stake/unstake

### Setup

```bash
cd packages/mcp-server
npm install
npm run build
```

Configure your Claude client to use the server (example for Claude Desktop):

```json
{
  "mcpServers": {
    "gemini": {
      "command": "node",
      "args": ["/path/to/developer-platform/packages/mcp-server/dist/index.js"],
      "env": {
        "GEMINI_API_KEY": "account-xxxxxxxxxxxxxx",
        "GEMINI_API_SECRET": "xxxxxxxxxxxxxx"
      }
    }
  }
}
```

## API Documentation

- [Gemini REST API](https://docs.gemini.com/rest-api/)
- [Gemini WebSocket API](https://docs.gemini.com/websocket-api/)

## License

[Apache 2.0](LICENSE)
