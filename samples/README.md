# Gemini API Samples

Multi-language examples demonstrating how to use the Gemini cryptocurrency exchange API.

## Project Structure

```
├── .env.example              # Environment variables template
├── typescript/               # TypeScript examples
│   ├── src/
│   │   ├── getTicker.ts      # Get ticker data (public, REST)
│   │   ├── priceFeed.ts      # Get prices for all pairs (public, REST)
│   │   ├── orderBook.ts      # Get order book bids/asks (public, REST)
│   │   ├── tradeHistory.ts   # Get recent trades (public, REST)
│   │   ├── wsBookTicker.ts   # Stream best bid/ask updates (public, WebSocket)
│   │   ├── wsTrades.ts       # Stream real-time trades (public, WebSocket)
│   │   ├── wsContractStatus.ts # Stream prediction-market contract status changes (public, WebSocket)
│   │   ├── placeOrder.ts     # Place an order (private, REST)
│   │   ├── balances.ts       # Get account balances (private, REST)
│   │   ├── pmPrices.ts       # Stream prediction market prices (private, WebSocket)
│   │   ├── pmOrder.ts        # Place prediction market order (private, WebSocket)
│   │   └── test_parse.ts     # Test parsing of API responses (utility)
├── python/                   # Python examples
│   ├── get_ticker.py         # Get ticker data (public, REST)
│   ├── price_feed.py         # Get prices for all pairs (public, REST)
│   ├── order_book.py         # Get order book bids/asks (public, REST)
│   ├── trade_history.py      # Get recent trades (public, REST)
│   ├── ws_book_ticker.py     # Stream best bid/ask updates (public, WebSocket)
│   ├── ws_trades.py          # Stream real-time trades (public, WebSocket)
│   ├── ws_contract_status.py # Stream prediction-market contract status changes (public, WebSocket)
│   ├── place_order.py        # Place an order (private, REST)
│   ├── balances.py           # Get account balances (private, REST)
│   ├── pm_prices.py          # Stream prediction market prices (private, WebSocket)
│   ├── pm_order.py           # Place prediction market order (private, WebSocket)
│   └── test_parse.py         # Test parsing of API responses (utility)
└── go/                       # Go examples
    ├── get_ticker.go         # Get ticker data (public, REST)
    ├── price_feed.go         # Get prices for all pairs (public, REST)
    ├── order_book.go         # Get order book bids/asks (public, REST)
    ├── trade_history.go      # Get recent trades (public, REST)
    ├── ws_book_ticker.go     # Stream best bid/ask updates (public, WebSocket)
    ├── ws_trades.go          # Stream real-time trades (public, WebSocket)
    ├── ws_contract_status.go # Stream prediction-market contract status changes (public, WebSocket)
    ├── place_order.go        # Place an order (private, REST)
    ├── balances.go           # Get account balances (private, REST)
    ├── pm_prices.go          # Stream prediction market prices (private, WebSocket)
    ├── pm_order.go           # Place prediction market order (private, WebSocket)
    └── test_parse.go         # Test parsing of API responses (utility)
```

## Quick Start

### Public REST Endpoints (No API Key Required)
```bash
# Get ticker data for a symbol
python3 python/get_ticker.py btcusd
npx ts-node typescript/src/getTicker.ts ethusd
go run go/get_ticker.go dogeusd

# Get prices for all trading pairs
python3 python/price_feed.py
npx ts-node typescript/src/priceFeed.ts
go run go/price_feed.go

# Get order book (bids/asks)
python3 python/order_book.py btcusd
npx ts-node typescript/src/orderBook.ts ethusd
go run go/order_book.go btcusd

# Get recent trade history
python3 python/trade_history.py btcusd
npx ts-node typescript/src/tradeHistory.ts btcusd
go run go/trade_history.go btcusd
```

### Public WebSocket Streams (No API Key Required)
```bash
# Stream real-time trades
python3 python/ws_trades.py btcusd
npx ts-node typescript/src/wsTrades.ts btcusd
go run go/ws_trades.go btcusd

# Stream best bid/ask updates
python3 python/ws_book_ticker.py btcusd
npx ts-node typescript/src/wsBookTicker.ts btcusd
go run go/ws_book_ticker.go btcusd

# Stream prediction-market contract status changes
python3 python/ws_contract_status.py
npx ts-node typescript/src/wsContractStatus.ts
go run go/ws_contract_status.go
```

### Private Endpoints (API Key Required)

1. **Add your API credentials to `.env`:**
   ```bash
   cp .env.example .env
   # Edit .env and add your real GEMINI_API_KEY and GEMINI_API_SECRET
   ```

2. **Run examples:**
   ```bash
   # Get account balances
   python3 python/balances.py
   npx ts-node typescript/src/balances.ts
   go run go/balances.go

   # Place an order
   python3 python/place_order.py
   npx ts-node typescript/src/placeOrder.ts
   go run go/place_order.go

   # Stream prediction market prices (WebSocket)
   python3 python/pm_prices.py
   npx ts-node typescript/src/pmPrices.ts
   go run go/pm_prices.go

   # Place prediction market order (WebSocket)
   python3 python/pm_order.py
   npx ts-node typescript/src/pmOrder.ts
   go run go/pm_order.go
   ```

## Getting Started

### Configuration

The base URL is configured via environment variables. Copy the example file:

```bash
cp .env.example .env
```

The default configuration uses the production Gemini API. For testing, you can change `GEMINI_BASE_URL` to the sandbox environment:

```bash
GEMINI_BASE_URL=https://api.sandbox.gemini.com/v1
```

### Public REST Endpoints (No Authentication Required)

These examples use public API endpoints and don't require any API keys.

| Example | Description | Endpoint |
|---------|-------------|----------|
| `getTicker` / `get_ticker` | Ticker data for a symbol | `/v1/pubticker/{symbol}` |
| `priceFeed` / `price_feed` | Prices for all trading pairs | `/v1/pricefeed` |
| `orderBook` / `order_book` | Order book (bids/asks) for a symbol | `/v1/book/{symbol}` |
| `tradeHistory` / `trade_history` | Recent trades for a symbol | `/v1/trades/{symbol}` |

```bash
# Install dependencies first
cd typescript && npm install    # TypeScript
cd python && pip install -r requirements.txt  # Python
cd go && go mod download        # Go

# Then run any example with an optional symbol argument (defaults to btcusd)
python3 python/get_ticker.py ethusd
npx ts-node typescript/src/getTicker.ts ethusd
go run go/get_ticker.go ethusd
```

### Public WebSocket Streams (No Authentication Required)

| Example | Description | Stream |
|---------|-------------|--------|
| `wsTrades` / `ws_trades` | Real-time trade stream | `@trade` |
| `wsBookTicker` / `ws_book_ticker` | Best bid/ask updates | `@bookTicker` |
| `wsContractStatus` / `ws_contract_status` | Prediction-market contract status changes (incl. strike price `p`) | `contractStatus` |

```bash
# Stream real-time trades (Ctrl+C to stop)
python3 python/ws_trades.py btcusd
npx ts-node typescript/src/wsTrades.ts btcusd
go run go/ws_trades.go btcusd
```

### Private Endpoints (Authentication Required)

The authenticated examples require Gemini API credentials.

| Example | Description | Protocol |
|---------|-------------|----------|
| `balances` | Get account balances | REST |
| `placeOrder` / `place_order` | Place an order | REST |
| `pmPrices` / `pm_prices` | Stream prediction market prices | WebSocket |
| `pmOrder` / `pm_order` | Place prediction market order | WebSocket |

1. **Get API Credentials:**
   - Sign up at [Gemini](https://www.gemini.com/)
   - Create API keys in your account settings
   - Use the sandbox environment for testing: https://exchange.sandbox.gemini.com/

2. **Configure Environment:**
   ```bash
   cp .env.example .env
   # Edit .env and add your GEMINI_API_KEY and GEMINI_API_SECRET
   ```

   Your `.env` file should look like:
   ```
   GEMINI_BASE_URL=https://api.gemini.com/v1
   GEMINI_API_KEY=account-xxxxxxxxxxxxxx
   GEMINI_API_SECRET=xxxxxxxxxxxxxx
   ```

   **For testing, use the sandbox:**
   ```
   GEMINI_BASE_URL=https://api.sandbox.gemini.com/v1
   GEMINI_API_KEY=your-sandbox-api-key
   GEMINI_API_SECRET=your-sandbox-api-secret
   ```

3. **Run Examples:**
   ```bash
   # Get balances
   python3 python/balances.py
   npx ts-node typescript/src/balances.ts
   go run go/balances.go

   # Place an order
   python3 python/place_order.py
   npx ts-node typescript/src/placeOrder.ts
   go run go/place_order.go

   # Stream prediction market prices (Ctrl+C to stop)
   python3 python/pm_prices.py
   npx ts-node typescript/src/pmPrices.ts
   go run go/pm_prices.go
   ```

## API Documentation

- [Gemini API Documentation](https://docs.gemini.com/rest-api/)
- [Public Ticker API](https://docs.gemini.com/rest-api/#ticker)
- [Order Book API](https://docs.gemini.com/rest-api/#current-order-book)
- [Trade History API](https://docs.gemini.com/rest-api/#trade-history)
- [Price Feed API](https://docs.gemini.com/rest-api/#price-feed)
- [WebSocket Market Data](https://docs.gemini.com/websocket-api/#market-data-v2)
- [Private Endpoints](https://docs.gemini.com/rest-api/#authenticated-api-invocation)

## Authentication

The Gemini API uses a specific authentication method for private endpoints:

1. **Payload**: Create a JSON object with `request` path and `nonce` (current timestamp in milliseconds)
2. **Base64 Encode**: Encode the payload to base64
3. **HMAC Signature**: Create an HMAC-SHA384 signature of the base64 payload using your API secret
4. **Headers**: Send the request with:
   - `X-GEMINI-APIKEY`: Your API key
   - `X-GEMINI-PAYLOAD`: Base64 encoded payload
   - `X-GEMINI-SIGNATURE`: Hex-encoded HMAC signature

All implementations handle this authentication automatically.

## Notes

- Public endpoints can be called without authentication
- Private endpoints require valid API credentials
- Use the sandbox environment for testing to avoid real trades
- All examples use lowercase symbols (e.g., `btcusd` not `BTCUSD`)
- WebSocket streams run continuously — press Ctrl+C to stop
- Each example is available in all three languages (TypeScript, Python, Go)