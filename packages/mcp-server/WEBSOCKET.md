# WebSocket Support for Gemini MCP Server

The Gemini MCP server now includes real-time WebSocket support for live market data streaming.

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    MCP Server                           │
│                                                         │
│  ┌──────────────────────────────────────────────────┐ │
│  │         WebSocket Manager                        │ │
│  │  • Connection lifecycle                          │ │
│  │  • Subscription management                       │ │
│  │  • Reconnection with exponential backoff         │ │
│  └──────────────┬───────────────────────────────────┘ │
│                 │                                       │
│                 ▼                                       │
│  ┌──────────────────────────────────────────────────┐ │
│  │         In-Memory Store                          │ │
│  │  • Real-time prices (symbol → price data)        │ │
│  │  • Order books (symbol → bids/asks)              │ │
│  │  • Recent trades (symbol → trade[])              │ │
│  │  • Book tickers (symbol → best bid/ask)          │ │
│  └──────────────┬───────────────────────────────────┘ │
│                 │                                       │
│                 ▼                                       │
│  ┌──────────────────────────────────────────────────┐ │
│  │         10 New MCP Tools                         │ │
│  │  • gemini_ws_subscribe                           │ │
│  │  • gemini_ws_subscribe_multiple                  │ │
│  │  • gemini_ws_unsubscribe                         │ │
│  │  • gemini_ws_unsubscribe_symbol                  │ │
│  │  • gemini_ws_get_price                           │ │
│  │  • gemini_ws_get_orderbook                       │ │
│  │  • gemini_ws_get_trades                          │ │
│  │  • gemini_ws_get_book_ticker                     │ │
│  │  • gemini_ws_get_snapshot                        │ │
│  │  • gemini_ws_status                              │ │
│  └──────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
                          │
                          ▼
                 wss://ws.gemini.com
```

## Features

### ✅ Real-time Data Streaming
- **Trade updates** - Live trade execution data
- **Order book** - Real-time bid/ask depth
- **Book ticker** - Best bid/ask updates
- **24h ticker** - Rolling window statistics

### ✅ Automatic Connection Management
- Auto-connect on server startup
- Reconnection with exponential backoff (1s → 60s max)
- Ping/pong heartbeat to keep connection alive
- Automatic resubscription after reconnect

### ✅ In-Memory Caching
- Instant data access (no HTTP requests)
- Circular buffer for trades (default: 100 per symbol)
- Data freshness tracking
- Memory-efficient storage

### ✅ Flexible Subscription Model
- Subscribe to individual symbols or multiple at once
- Per-channel subscriptions (trade, depth, bookTicker, ticker)
- Unsubscribe to free up memory
- Query subscription status

## WebSocket Channels

| Channel | Description | Data Updated |
|---------|-------------|--------------|
| `trade` | Real-time trade execution | Price, Trades |
| `depth` | Order book snapshots/updates | Order Book |
| `bookTicker` | Best bid/ask updates | Book Ticker, Price |
| `ticker` | 24h rolling window stats | Price |

## Configuration

The WebSocket URL is configurable via environment variable:

```bash
GEMINI_WS_URL=wss://ws.gemini.com  # Production (default)
GEMINI_WS_URL=wss://ws.sandbox.gemini.com  # Sandbox
```

Add to your MCP client config:

```json
{
  "mcpServers": {
    "gemini": {
      "command": "node",
      "args": ["/path/to/packages/mcp-server/dist/index.js"],
      "env": {
        "GEMINI_API_KEY": "account-xxxxxxxxxxxxxx",
        "GEMINI_API_SECRET": "xxxxxxxxxxxxxx",
        "GEMINI_WS_URL": "wss://ws.gemini.com"
      }
    }
  }
}
```

## Usage Examples

### 1. Subscribe to Real-time Trades

```typescript
// Subscribe to BTC/USD trades
gemini_ws_subscribe({
  symbol: "btcusd",
  channel: "trade"
})

// Get latest price (instant, from cache)
gemini_ws_get_price({ symbol: "btcusd" })
// Returns: { price: "50000.00", source: "trade", ageMs: 123, isFresh: true }
```

### 2. Monitor Multiple Symbols

```typescript
// Subscribe to multiple symbols at once
gemini_ws_subscribe_multiple({
  symbols: ["btcusd", "ethusd", "solusd"],
  channel: "trade"
})

// Check status
gemini_ws_status()
// Returns: connection status, subscriptions, cache stats
```

### 3. Watch Order Book

```typescript
// Subscribe to order book updates
gemini_ws_subscribe({
  symbol: "btcusd",
  channel: "depth"
})

// Get live order book (instant)
gemini_ws_get_orderbook({
  symbol: "btcusd",
  limit: 10  // Top 10 bids and asks
})
```

### 4. Track Best Bid/Ask

```typescript
// Subscribe to book ticker
gemini_ws_subscribe({
  symbol: "ethusd",
  channel: "bookTicker"
})

// Get best bid/ask
gemini_ws_get_book_ticker({ symbol: "ethusd" })
// Returns: bestBid, bestAsk, spread, midPrice
```

### 5. Get Complete Snapshot

```typescript
// Subscribe to all channels
gemini_ws_subscribe({ symbol: "btcusd", channel: "trade" })
gemini_ws_subscribe({ symbol: "btcusd", channel: "depth" })
gemini_ws_subscribe({ symbol: "btcusd", channel: "bookTicker" })

// Get everything at once
gemini_ws_get_snapshot({ symbol: "btcusd" })
// Returns: price, orderBook, recentTrades, bookTicker
```

## New MCP Tools

### Subscription Management

#### `gemini_ws_subscribe`
Subscribe to a WebSocket channel for a symbol.
- **Params:** `symbol` (string), `channel` (enum: trade, depth, bookTicker, ticker)
- **Returns:** Success confirmation and subscription ID

#### `gemini_ws_subscribe_multiple`
Subscribe multiple symbols to a channel at once.
- **Params:** `symbols` (string[]), `channel` (enum)
- **Returns:** Success confirmation and subscription list

#### `gemini_ws_unsubscribe`
Unsubscribe from a channel.
- **Params:** `symbol` (string), `channel` (enum)
- **Returns:** Success confirmation

#### `gemini_ws_unsubscribe_symbol`
Unsubscribe from all channels for a symbol and clear cached data.
- **Params:** `symbol` (string)
- **Returns:** Success confirmation

### Data Access (Instant, from Cache)

#### `gemini_ws_get_price`
Get latest price for a symbol.
- **Params:** `symbol` (string)
- **Returns:** price, source, timestamp, ageMs, isFresh

#### `gemini_ws_get_orderbook`
Get current order book.
- **Params:** `symbol` (string), `limit` (number, optional)
- **Returns:** bids, asks, timestamp, ageMs, isFresh

#### `gemini_ws_get_trades`
Get recent trades.
- **Params:** `symbol` (string), `limit` (number, optional, default: 20)
- **Returns:** array of trades with price, quantity, side, timestamp

#### `gemini_ws_get_book_ticker`
Get best bid and ask.
- **Params:** `symbol` (string)
- **Returns:** bestBid, bestAsk, spread, midPrice, timestamp

#### `gemini_ws_get_snapshot`
Get complete snapshot of all data for a symbol.
- **Params:** `symbol` (string)
- **Returns:** price, orderBook (top 5), recentTrades (last 5), bookTicker

### Monitoring

#### `gemini_ws_status`
Get WebSocket connection status and cache statistics.
- **Params:** none
- **Returns:** connection state, subscriptions, cache stats, data freshness

## Data Freshness

All cached data includes:
- `timestamp` - When data was last updated
- `ageMs` - Milliseconds since last update
- `isFresh` - Boolean indicating if data is < 5 seconds old

If data is stale, consider:
1. Checking WebSocket connection status
2. Resubscribing to the channel
3. Falling back to REST API tools

## Benefits vs REST API

| Feature | WebSocket | REST API |
|---------|-----------|----------|
| Latency | **< 1ms** (cached) | ~100-500ms (network) |
| Updates | **Real-time push** | Poll on demand |
| Efficiency | **1 connection** | HTTP per request |
| Data freshness | **Live** | Snapshot in time |
| Use case | Monitoring, streaming | One-time queries |

## Implementation Details

### Files Created
- `src/types/websocket.ts` - TypeScript types for WS messages
- `src/store/index.ts` - In-memory data store
- `src/client/websocket.ts` - WebSocket client with reconnection
- `src/websocket/manager.ts` - Manager integrating client + store
- `src/tools/websocket.ts` - 10 new MCP tools

### Files Modified
- `src/config.ts` - Added `wsUrl` configuration
- `src/server.ts` - Initialize WebSocket manager on startup
- `src/tools/index.ts` - Export WebSocket tools
- `package.json` - Added `ws` and `@types/ws` dependencies

## Memory Management

The store automatically manages memory:
- **Trades:** Circular buffer (default: 100 per symbol)
- **Order books:** Latest snapshot only
- **Prices:** Latest value only
- **Book tickers:** Latest value only

To free memory:
```typescript
gemini_ws_unsubscribe_symbol({ symbol: "btcusd" })
```

## Error Handling

The WebSocket manager handles:
- **Connection failures:** Auto-reconnect with backoff
- **Subscription errors:** Return error message to caller
- **Stale data:** Track age and warn users
- **Network issues:** Automatic recovery

Check connection status:
```typescript
gemini_ws_status()
```

## Troubleshooting

### "WebSocket is not connected"
The WebSocket connection is still initializing or failed. Check:
```typescript
gemini_ws_status()
```

Wait a few seconds and retry, or check server logs for errors.

### "No cached data for symbol"
You need to subscribe first:
```typescript
gemini_ws_subscribe({ symbol: "btcusd", channel: "trade" })
```

### Data is stale (isFresh: false)
Possible causes:
- Low trading activity for the symbol
- WebSocket connection interrupted
- Subscription accidentally removed

Check status and resubscribe if needed.

## Best Practices

1. **Subscribe once, query many times**
   - WebSocket subscriptions persist
   - Use `gemini_ws_get_*` tools repeatedly without re-subscribing

2. **Batch subscriptions**
   - Use `gemini_ws_subscribe_multiple` for multiple symbols
   - More efficient than individual subscriptions

3. **Monitor data freshness**
   - Check `isFresh` and `ageMs` fields
   - Fall back to REST API if data is stale

4. **Unsubscribe when done**
   - Free up memory and WebSocket bandwidth
   - Use `gemini_ws_unsubscribe_symbol` to clean up

5. **Check status periodically**
   - Use `gemini_ws_status` to monitor health
   - Watch for connection issues or stale data

## Development

### Build
```bash
cd packages/mcp-server
npm install
npm run build
```

### Test WebSocket
```bash
npm run dev
```

Check server logs for:
```
[WS] Connected to wss://ws.gemini.com
[WSManager] Subscribed to btcusd@trade
```

## Future Enhancements

Potential improvements:
- [ ] Authenticated WebSocket channels (order updates, balances)
- [ ] Delta updates for order books (currently full snapshots)
- [ ] Historical data replay from cache
- [ ] Configurable trade buffer size per symbol
- [ ] WebSocket connection pooling for high-volume scenarios
- [ ] Metrics and observability (message rates, latency)
