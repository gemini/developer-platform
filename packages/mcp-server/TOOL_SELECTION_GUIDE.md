# Tool Selection Guide: REST vs WebSocket vs Hybrid

## Overview

The MCP server now offers **3 types of tools** for accessing market data:

| Tool Type | Latency | Data Freshness | Subscription Needed? | Use Case |
|-----------|---------|----------------|---------------------|----------|
| **REST** | 100-500ms | On-demand snapshot | ❌ No | One-off queries, guaranteed fresh |
| **WebSocket** | < 1ms | Real-time stream | ✅ Yes | Monitoring, repeated queries |
| **Hybrid** | Smart | Auto-fallback | 🟡 Optional | Best of both worlds |

## Tool Comparison

### 1. REST Tools (Original)

**Tools:** `gemini_get_ticker`, `gemini_get_order_book`, `gemini_get_recent_trades`

**Characteristics:**
- ✅ Always works (no setup needed)
- ✅ Guaranteed fresh data
- ❌ Slower (HTTP round-trip)
- ❌ Each call = new request

**When to use:**
- One-off price checks
- Infrequent queries
- When you need guaranteed fresh data
- User doesn't want to manage subscriptions

**Example:**
```typescript
// Quick price check - no subscription needed
gemini_get_ticker({ symbol: "btcusd" })
// → 200ms HTTP request, returns fresh data
```

### 2. WebSocket Tools (New)

**Tools:** `gemini_ws_get_price`, `gemini_ws_get_orderbook`, `gemini_ws_get_trades`

**Characteristics:**
- ✅ Ultra-fast (< 1ms from cache)
- ✅ Real-time updates
- ❌ Requires subscription first
- ❌ Returns error if not subscribed

**When to use:**
- Real-time monitoring
- Repeated queries for same symbol
- Building live dashboards
- Trading algorithms

**Example:**
```typescript
// Step 1: Subscribe (once)
gemini_ws_subscribe({ symbol: "btcusd", channel: "trade" })

// Step 2: Query repeatedly (instant)
gemini_ws_get_price({ symbol: "btcusd" })  // < 1ms
gemini_ws_get_price({ symbol: "btcusd" })  // < 1ms
gemini_ws_get_price({ symbol: "btcusd" })  // < 1ms
```

### 3. Hybrid Tools (Recommended)

**Tools:** `gemini_get_realtime_price`, `gemini_get_realtime_orderbook`, `gemini_get_realtime_trades`

**Characteristics:**
- ✅ Smart: Uses WebSocket if available, REST otherwise
- ✅ No errors: Always returns data
- ✅ Transparent: Response indicates source
- ✅ Best UX: Just works

**When to use:**
- **Default choice** for most use cases
- When you want speed but need reliability
- Users who don't want to think about subscriptions
- Mixed workloads (sometimes monitoring, sometimes ad-hoc)

**Example:**
```typescript
// First call - no subscription yet
gemini_get_realtime_price({ symbol: "btcusd" })
// → Falls back to REST (200ms)
// → Returns: { price: "50000", source: "rest-api", hint: "For real-time, subscribe..." }

// User sees hint and subscribes
gemini_ws_subscribe({ symbol: "btcusd", channel: "trade" })

// Subsequent calls - now uses WebSocket
gemini_get_realtime_price({ symbol: "btcusd" })
// → Uses cache (< 1ms)
// → Returns: { price: "50001", source: "websocket-cache", cached: true }
```

## Decision Tree

```
Need market data?
│
├─ One-off query?
│  └─ Use REST tools (e.g., gemini_get_ticker)
│
├─ Real-time monitoring with multiple queries?
│  └─ Use WebSocket tools
│     1. gemini_ws_subscribe once
│     2. gemini_ws_get_price repeatedly
│
└─ Want automatic optimization?
   └─ Use Hybrid tools (recommended)
      • gemini_get_realtime_price
      • Optionally subscribe for speed boost
```

## Response Format Differences

### REST Tool Response
```json
{
  "open": "49000.00",
  "high": "51000.00",
  "low": "48500.00",
  "close": "50000.00",
  "changes": ["49000.00", "50000.00"],
  "bid": "49999.00",
  "ask": "50001.00"
}
```

### WebSocket Tool Response
```json
{
  "symbol": "BTCUSD",
  "price": "50000.00",
  "source": "trade",
  "timestamp": 1234567890,
  "ageMs": 234,
  "isFresh": true
}
```

### Hybrid Tool Response
```json
{
  "symbol": "BTCUSD",
  "price": "50000.00",
  "source": "websocket-cache",  // or "rest-api"
  "cached": true,               // true if from WebSocket
  "timestamp": 1234567890,
  "ageMs": 234,                 // only if cached
  "hint": "..."                 // only if REST fallback
}
```

## Performance Comparison

### Scenario 1: Single Price Query

| Tool Type | Time | Requests |
|-----------|------|----------|
| REST | 200ms | 1 HTTP |
| WebSocket | Error | N/A (not subscribed) |
| **Hybrid** | **200ms** | **1 HTTP (auto-fallback)** |

**Winner:** Hybrid (just works)

### Scenario 2: 100 Price Queries (Same Symbol)

| Tool Type | Time | Requests |
|-----------|------|----------|
| REST | 20 seconds | 100 HTTP |
| **WebSocket** | **< 100ms** | **0 HTTP (cached)** |
| Hybrid | < 100ms* | 1 HTTP (first) + cache |

**Winner:** WebSocket or Hybrid (after first query)

### Scenario 3: Mixed Symbols, Infrequent Queries

| Tool Type | Time | Complexity |
|-----------|------|------------|
| **REST** | **200ms each** | **Simple** |
| WebSocket | < 1ms | Subscribe to all first |
| Hybrid | 200ms each | Simple |

**Winner:** REST or Hybrid (simpler than managing subscriptions)

## Claude's Perspective

How Claude (the AI assistant) chooses tools:

### Tool Descriptions Guide Claude

**REST tools say:**
> "Get ticker information for a symbol (v2)"
→ Claude uses for simple, one-off queries

**WebSocket tools say:**
> "Get latest cached price. Requires subscription to trade or ticker channel."
→ Claude understands subscription is prerequisite

**Hybrid tools say:**
> "Get latest price. Automatically uses WebSocket cache if subscribed (<1ms), otherwise fetches via REST API."
→ Claude sees this as the "smart default"

### Typical Claude Behavior

**User asks:** "What's the BTC price?"
- Claude calls: `gemini_get_realtime_price` (hybrid)
- Works immediately, no subscription needed

**User asks:** "Monitor BTC price for the next 10 minutes"
- Claude calls: `gemini_ws_subscribe` first
- Then repeatedly calls: `gemini_ws_get_price`
- Gets real-time updates with minimal latency

**User asks:** "Compare prices of BTC, ETH, SOL"
- Claude calls: `gemini_get_ticker` for each (REST)
- One-off queries, no need for subscriptions

## Migration Guide

### If You're Using REST Tools Only

**No changes needed!** REST tools still work exactly as before.

**Optional upgrade path:**
```typescript
// Old way (still works)
gemini_get_ticker({ symbol: "btcusd" })

// New way (automatic optimization)
gemini_get_realtime_price({ symbol: "btcusd" })
// Same result, but faster if subscribed
```

### If You Want Real-time Performance

**Before (REST only):**
```typescript
// Query 100 times = 100 HTTP requests
for (i = 0; i < 100; i++) {
  gemini_get_ticker({ symbol: "btcusd" })  // 200ms each
}
// Total: 20 seconds
```

**After (WebSocket):**
```typescript
// Subscribe once
gemini_ws_subscribe({ symbol: "btcusd", channel: "trade" })

// Query 100 times from cache
for (i = 0; i < 100; i++) {
  gemini_ws_get_price({ symbol: "btcusd" })  // < 1ms each
}
// Total: < 100ms
```

**After (Hybrid - recommended):**
```typescript
// Subscribe once (optional but recommended for performance)
gemini_ws_subscribe({ symbol: "btcusd", channel: "trade" })

// Query 100 times - auto-uses cache
for (i = 0; i < 100; i++) {
  gemini_get_realtime_price({ symbol: "btcusd" })  // < 1ms each
}
// Total: < 100ms (same as WebSocket, but works without subscription too)
```

## Best Practices

### ✅ Do This

1. **Use hybrid tools by default** - Best of both worlds
2. **Subscribe for monitoring** - When making repeated queries
3. **Check `source` field** - Know if you're getting cached or fresh data
4. **Monitor `ageMs`** - Ensure data isn't stale
5. **Use `gemini_ws_status`** - Check subscription health

### ❌ Don't Do This

1. **Don't mix REST and WS for same query** - Pick one pattern
2. **Don't forget to unsubscribe** - Frees memory and bandwidth
3. **Don't ignore `isFresh: false`** - Data might be stale
4. **Don't subscribe to hundreds of symbols** - Memory limits

## Tool List Summary

### Market Data Tools (13 total)

#### REST (Original - 3 tools)
- `gemini_get_ticker` - Full ticker data
- `gemini_get_order_book` - Order book via HTTP
- `gemini_get_recent_trades` - Recent trades via HTTP

#### WebSocket (New - 10 tools)
- `gemini_ws_subscribe` - Subscribe to channel
- `gemini_ws_subscribe_multiple` - Batch subscribe
- `gemini_ws_unsubscribe` - Unsubscribe
- `gemini_ws_unsubscribe_symbol` - Unsubscribe all
- `gemini_ws_get_price` - Cached price
- `gemini_ws_get_orderbook` - Cached order book
- `gemini_ws_get_trades` - Cached trades
- `gemini_ws_get_book_ticker` - Best bid/ask
- `gemini_ws_get_snapshot` - Complete snapshot
- `gemini_ws_status` - Connection status

#### Hybrid (New - 3 tools)
- `gemini_get_realtime_price` - Smart price query ⭐ **Recommended**
- `gemini_get_realtime_orderbook` - Smart order book query ⭐ **Recommended**
- `gemini_get_realtime_trades` - Smart trades query ⭐ **Recommended**

## Recommendation

### For Most Use Cases
**Use the hybrid tools** (`gemini_get_realtime_*`):
- Automatically optimizes for speed
- No errors if not subscribed
- Progressive enhancement (subscribe later for speed)
- Clean, simple API

### For Real-time Trading/Monitoring
**Use WebSocket tools** directly:
1. Subscribe once: `gemini_ws_subscribe`
2. Query repeatedly: `gemini_ws_get_price`
3. Check health: `gemini_ws_status`
4. Unsubscribe when done: `gemini_ws_unsubscribe_symbol`

### For Simple Scripts/One-offs
**Use REST tools** (original):
- No setup required
- Guaranteed fresh data
- Simple and reliable

---

**Summary:** The hybrid tools give you the best developer experience - they "just work" and automatically optimize for performance when possible. Use them as your default choice!
