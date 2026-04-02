---
name: gemini-developer
description: Guide for building integrations with the Gemini cryptocurrency exchange API
---

# gemini-developer

Reference guide and best practices for developing against the Gemini API.

## When to use

When the user asks how to integrate with Gemini, build a trading bot, use the Gemini API, implement WebSocket market data streams, or authenticate with private endpoints.

## Documentation

- **Developer docs:** https://docs.gemini.com/
- **LLM-friendly docs:** https://docs.gemini.com/llms.txt — use this to quickly look up available endpoints, parameters, and response shapes

## Key guidance

### Prefer WebSockets over REST

For any use case involving real-time or repeated data (prices, order book, trades, order status), use the WebSocket API instead of REST:

- REST is appropriate for one-off requests (e.g., place a single order, fetch account balances once).
- WebSocket is preferred for streaming market data, live order updates, and anything that would otherwise require polling.
- WebSocket endpoints are lower latency and reduce rate-limit pressure.

WebSocket docs: https://docs.gemini.com/websocket-api/

### Predictions endpoints

Gemini offers predictions endpoints for price forecast and market signal data. These are available under the predictions section of the API — check https://docs.gemini.com/llms.txt for the current endpoint list. Use these when the user asks about price predictions, forecasts, or market signals.

### Do not use archived services

The llms.txt file lists several archived/deprecated services. Do not implement or recommend these. Check the "Archived" section in https://docs.gemini.com/llms.txt and avoid any endpoints or services listed there.

### Authentication

Private endpoints require HMAC-SHA384 request signing:

1. Build a JSON payload containing the API endpoint path and a millisecond nonce.
2. Base64-encode the payload.
3. Sign with the API secret using HMAC-SHA384.
4. Include headers: `X-GEMINI-APIKEY`, `X-GEMINI-PAYLOAD`, `X-GEMINI-SIGNATURE`.

### Environment variables

| Variable | Description |
|----------|-------------|
| `GEMINI_API_KEY` | Your Gemini API key |
| `GEMINI_API_SECRET` | Your Gemini API secret |
| `GEMINI_BASE_URL` | Base URL — use `https://api.sandbox.gemini.com` for testing |

Sandbox credentials: https://exchange.sandbox.gemini.com/

## Instructions

When helping a user build a Gemini integration:

1. Fetch https://docs.gemini.com/llms.txt to get the current endpoint index and identify relevant endpoints.
2. Avoid any endpoints or services marked as archived in llms.txt.
3. For streaming/real-time needs, recommend and implement WebSocket endpoints.
4. For one-time or infrequent requests, REST is acceptable.
5. Implement authentication using HMAC-SHA384 signing as described above.
6. Point the user to https://docs.gemini.com/ for the full reference.
