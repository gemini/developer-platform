---
name: integrate-gemini
description: Instantly integrate with Gemini Exchange using REST (OpenAPI 3.0), modern WebSocket at wss://ws.gemini.com (AsyncAPI), and FIX Protocol 4.4. Use when asked to integrate with Gemini, build a Gemini trading bot, stream real-time market data, or place/cancel orders via WebSocket or REST.
disable-model-invocation: false
argument-hint: "[environment: sandbox|production] [protocol: rest|websocket|fix] [language: python|typescript|rust]"
allowed-tools: Read, Grep, Glob, Edit, Write, Bash
---

# Integrate with Gemini Exchange (REST, Modern WebSocket ws.gemini.com, & FIX)

This skill provides step-by-step instructions, canonical API specifications (OpenAPI 3.0, AsyncAPI 3.0, FIX 4.4), and production-grade boilerplate for AI agents and developers to integrate with **Gemini** across REST, the modern WebSocket API (`wss://ws.gemini.com`), and FIX Protocol 4.4.

---

## Capabilities & Objectives

1. **Environment Configuration**: Set up credentials and target REST/WebSocket endpoints for **Sandbox** (`https://api.sandbox.gemini.com`, `wss://ws.sandbox.gemini.com`) or **Production** (`https://api.gemini.com`, `wss://ws.gemini.com`). FIX endpoints are provisioned after Gemini connectivity onboarding; do not infer a host or port.
2. **Gemini HMAC-SHA384 Authentication**:
   - **REST**: Base64-encoded JSON payload in `X-GEMINI-PAYLOAD`, with `X-GEMINI-APIKEY` and `X-GEMINI-SIGNATURE`.
   - **WebSocket (`wss://ws.gemini.com`)**: Authentication headers on connection upgrade (`X-GEMINI-APIKEY`, `X-GEMINI-NONCE`, `X-GEMINI-PAYLOAD`, `X-GEMINI-SIGNATURE`) or `Authorization: Bearer <token>`. API-key sessions require an account-scoped key with a time-based nonce; `Trader` is required for trading methods.
3. **REST API Order Execution**: Keep product payloads separate. Spot uses the documented `/v1/order/new` and `/v1/order/cancel` payloads; Prediction Markets uses `/v1/prediction-markets/order` and its corresponding order-management endpoints.
4. **Modern `ws.gemini.com` Data & Order Event Streaming**: Subscribe to streams (`{symbol}@bookTicker`, `{symbol}@depth5`, `{symbol}@depth`, `{symbol}@trade`, `orders@account`, `balances@account`).
5. **WebSocket Direct Order Execution**: Execute `order.place` and `order.cancel` methods directly over the `wss://ws.gemini.com` socket.
6. **FIX 4.4 Session Setup**: Establish FIX 4.4 sessions for high-frequency order placement and drop copy tracking.
7. **End-to-End Verification Loop**: Run an automated paper-trading test loop in Sandbox mode to verify signature generation, order placement, WebSocket event callbacks, and order cancellation.

---

## Workflow Steps

### Step 0: Project Architecture Discovery & Smart Hooking

Before writing code, inspect the user's workspace to determine where and how to integrate Gemini:

1. **Scan Workspace Structure**:
   - Check directory layout and file extensions (`.py`, `.ts`, `.rs`, `.go`, `.cpp`).
   - Search for existing exchange connectors or order manager abstractions (e.g., `ExchangeClient`, `OrderBookAdapter`, `ExecutionEngine`).
2. **Identify Runtime & Network Dependencies**:
   - Detect async runtimes (`asyncio`, `tokio`, Node.js `async/await`) and HTTP/WS libraries (`requests`, `httpx`, `aiohttp`, `websockets`, `ws`, `tokio-tungstenite`, `fetch`).
3. **Determine Integration Strategy**:
   - **Existing Multi-Venue Architecture**: Implement the user's abstract exchange interface so Gemini hooks cleanly into their order routing and data pipelines without breaking existing models.
   - **Standalone Bot / App**: Generate an idiomatic, modular `GeminiClient` and `GeminiWebSocketClient` module.
   - **Secrets Management**: Detect where API keys are loaded (`.env`, `process.env`, `os.environ`, AWS Secrets Manager) and configure `GEMINI_API_KEY` / `GEMINI_API_SECRET` safely.
   - **Unclear Fit**: If the scan doesn't clearly match one of the above (ambiguous multi-venue interface shape, no obvious secrets convention, ORM/framework-specific order model), stop and ask the user how they want Gemini wired in rather than guessing a structure.

---

### Step 1: Detect & Configure Environment

Determine or prompt for:
- **Target Environment**: `sandbox` (default) or `production`.
- **Target Protocol**: `rest`, `websocket`, or `fix`.
- **Target Language**: `python`, `typescript`, or `rust`.
- **API Credentials**: `GEMINI_API_KEY` and `GEMINI_API_SECRET`. If the key is a Master API key, also determine the target subaccount name (`account`) — REST calls need it, and it's hard-required on `/v1/balances` specifically (see [reference.md](reference.md#authentication--signing)).

Endpoint Mapping:
| Protocol | Sandbox Endpoint | Production Endpoint |
| :--- | :--- | :--- |
| **REST API** | `https://api.sandbox.gemini.com` | `https://api.gemini.com` |
| **WebSocket API** | `wss://ws.sandbox.gemini.com` | `wss://ws.gemini.com` |
| **FIX 4.4 Engine** | Provisioned after FIX sandbox onboarding | Provisioned after FIX production onboarding |

*Note: Always use `wss://ws.gemini.com` or `wss://ws.sandbox.gemini.com` for WebSockets. Do not use archived endpoints.*

---

### Step 2: Locate Canonical Specifications

Start at the human-readable **[API reference](https://developer.gemini.com/api-reference)** for narrative REST, WebSocket, FIX, and authentication documentation; append `.md` to any path (including this one) for a plain-markdown rendition per `llms.txt`.

Two page types render as empty component shells in the `.md` form, so route around them:
- **Category/landing pages** (e.g. `/rest-api/rest-api.md`, `/docs/docs.md`, `/trading/rest-api/orders.md`) render only a heading and a landing-section placeholder. Use the specific leaf page instead (e.g. `/trading/rest-api/orders/create-new-order.md`).
- **Leaf endpoint pages driven by the OpenAPI spec** (e.g. `/trading/rest-api/orders/create-new-order.md`) keep their prose but replace params/headers/responses/examples with `<Spec* operationId="..." />` placeholders — that structured data only exists in the OpenAPI/AsyncAPI spec files below, keyed by the same `operationId`.

Pages that aren't spec-driven (e.g. `/authentication/api-key.md`, `/websocket/authentication.md`) render fully and are safe to read directly.

For the structured request/response schemas, fetch the catalog first, then use its `url` fields:
- **Spec catalog**: `https://developer.gemini.com/specs/index.json`
- **REST OpenAPI Spec**: `https://developer.gemini.com/specs/openapi/rest.yaml`
- **WebSocket AsyncAPI Spec**: `https://developer.gemini.com/specs/asyncapi/websocket.yaml`
- **Prediction Markets OpenAPI Spec**: `https://developer.gemini.com/specs/openapi/prediction-markets.yaml`
- **Rendered API Specifications page**: `https://developer.gemini.com/api-specifications`

This repository does not commit the OpenAPI/AsyncAPI files locally — fetch the URLs above rather than assuming a local `apis/` directory. `scripts/generate-sdks.sh` downloads a REST-only copy to the gitignored `scripts/rest.yaml` for SDK generation; treat that script as SDK tooling, not a documentation source, and prefer the live spec URLs above when writing integration code.

If a fetched page or spec disagrees with this skill, trust the live source and tell the user what changed — don't silently paper over the discrepancy.

---

### Step 3: Implement Gemini HMAC-SHA384 Authentication

#### REST API Authentication
Authenticated REST requests send the base64-encoded JSON payload in the `X-GEMINI-PAYLOAD` header:
- `Content-Length`: `0`
- `Content-Type`: `text/plain`
- `X-GEMINI-APIKEY`: Your Gemini API key string.
- `X-GEMINI-PAYLOAD`: `base64(JSON_STRING)` (Must contain `"request"` path and `"nonce"`).
- `X-GEMINI-SIGNATURE`: `hex(HMAC_SHA384(X-GEMINI-PAYLOAD, key=api_secret))`

#### Modern WebSocket (`wss://ws.gemini.com`) Upgrade Handshake
Pass authentication headers on the initial connection upgrade when accessing private streams (`orders@account`, `balances@account`) or WebSocket trading methods. Only account-scoped API keys with time-based nonces are accepted for HMAC WebSocket sessions:
- `X-GEMINI-APIKEY`: API Key
- `X-GEMINI-NONCE`: Timestamp in seconds (integer string)
- `X-GEMINI-PAYLOAD`: `base64(X-GEMINI-NONCE)`
- `X-GEMINI-SIGNATURE`: `hex(HMAC_SHA384(base64(nonce), key=api_secret))`

Refer to [reference.md](reference.md#authentication--signing) for a complete Python implementation; use the repository schemas when producing TypeScript or Rust clients.

---

### Step 4: Implement Modern WebSocket Streaming & Methods (`wss://ws.gemini.com`)

#### Connection Parameters
Pass query parameters on connection for optimal behavior:
`wss://ws.sandbox.gemini.com?snapshot=-1&cancelOnDisconnect=true`
- `snapshot=-1`: Immediately receives full order book snapshot on depth subscription.
- `cancelOnDisconnect=true`: Automatically cancels open orders placed on this session if connection drops.

#### Stream Subscription Format
Send JSON subscription messages over `wss://ws.gemini.com`:
```json
{
  "method": "SUBSCRIBE",
  "params": [
    "btcusd@bookTicker",
    "btcusd@depth5@100ms",
    "btcusd@trade",
    "orders@account",
    "balances@account"
  ],
  "id": 1
}
```

#### Executing Orders over WebSocket (`order.place`)
```json
{
  "id": 2,
  "method": "order.place",
  "params": {
    "symbol": "btcusd",
    "side": "BUY",
    "type": "LIMIT",
    "timeInForce": "GTC",
    "price": "10000.00",
    "quantity": "0.001",
    "clientOrderId": "ws_bot_001"
  }
}
```

---

### Step 5: Implement FIX Protocol 4.4 Integration

For institutional trading, complete Gemini FIX connectivity onboarding and IP allowlisting first. Gemini supplies the endpoint, SenderCompID, and TargetCompID:
1. Connect to the provisioned FIX 4.4 session over TLS.
2. Send `Logon (MsgType 35=A)` with the standard header plus Tag 98 (`EncryptMethod=0`) and Tag 108 (`HeartBtInt=30`). Tag 141 may be set to `Y` when resetting sequence numbers; Tag 9001 controls cancel-on-disconnect for Order Entry.
3. Submit `New Order Single (MsgType 35=D)` using the exact fields and requirements in the FIX Order Entry specification.

---

### Step 6: End-to-End Sandbox Verification Loop

Run a self-contained test script in Sandbox mode only after the user explicitly approves the external order actions:

1. Connect to `wss://ws.sandbox.gemini.com?snapshot=-1&cancelOnDisconnect=true` with HMAC upgrade headers.
2. Send `"method": "SUBSCRIBE"` for `"params": ["btcusd@bookTicker", "orders@account"]`.
3. Prefer a maker-only (`MOC`) WebSocket order for a smoke test; otherwise use a deliberately non-marketable price and a unique client order ID.
4. Confirm receipt of the order update on the `orders@account` WebSocket stream. Stream events are flat messages; use `X` for status, `i` for order ID, and `Z` for executed quantity.
5. Cancel the order via WebSocket `order.cancel` or the product-specific REST endpoint.
6. In a `finally`/cleanup path, cancel the session or query and cancel any remaining test order, including after errors or reconnects.

Never run this workflow against production by default. Do not place production orders, withdraw funds, or change account configuration without explicit user confirmation.

### Step 7: MCP Server

The repository's MCP server is a local package named `gemini-mcp`; it currently authenticates with `GEMINI_API_KEY` and `GEMINI_API_SECRET` (and optionally `GEMINI_ACCOUNT` for master keys). Build it from `packages/mcp-server` and point the client at its generated `dist/index.js`. Do not document `npx @gemini/mcp-server` or `GEMINI_OAUTH_TOKEN` unless that package and OAuth support are implemented and published.

---

## Reference Material

See [reference.md](reference.md) for a copy-paste Python template, AsyncAPI 3.0 stream guidance, FIX 4.4 session requirements, and troubleshooting steps.
