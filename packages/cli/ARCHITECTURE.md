# Architecture

This document describes the design decisions and architecture of the Gemini Markets CLI.

## Design Principles

### 1. Agent-First Design

The CLI is optimized for AI agent integration:
- **JSON by default** - All responses are structured JSON
- **Machine-readable spec** - `gemini-markets spec` outputs complete API schema
- **Quiet mode** - `-q` suppresses stderr for clean piping
- **Idempotent operations** - `--client-order-id` enables safe retries
- **Structured errors** - Error codes with retryability hints

### 2. WebSocket-First with REST Fallback

```
┌─────────────┐
│   CLI Tool  │
└──────┬──────┘
       │
       ├─────────────────────────────────┐
       │                                 │
       ▼                                 ▼
┌──────────────┐              ┌─────────────────┐
│  WebSocket   │◄─────────────┤ Circuit Breaker │
│   (wsapi)    │   Primary    └─────────────────┘
└──────┬───────┘
       │
       │ On failure
       │ or circuit open
       ▼
┌──────────────┐
│  REST API    │
│   Fallback   │
└──────────────┘
```

**Why WebSocket-first?**
- Lower latency for order placement (~50ms vs ~150ms)
- Persistent connection reduces TLS handshake overhead
- Real-time order updates without polling
- Single connection for all operations

**When REST is used:**
- Circuit breaker trips after 3 consecutive WebSocket failures
- 30-second cooldown before retry
- Historical data queries (always REST)
- Public market data (either works, WebSocket preferred)

**Fail-closed — no silent fallback:**
- Authentication failures (401/403) are hard errors; use `--no-websocket` to place via REST explicitly

## Core Components

### API Client (`internal/api/`)

RESTful HTTP client with production-grade reliability:

```go
type Client struct {
    baseURL        string           // https://api.gemini.com
    httpClient     *http.Client     // TLS 1.2+ enforced
    signer         *PayloadSigner   // HMAC-SHA512
    maxRetries     int              // Default: 3
    baseDelay      time.Duration    // 500ms
    maxDelay       time.Duration    // 30s
    circuitBreaker *circuitBreaker  // Rate limit protection
}
```

**Retry Logic:**
- Exponential backoff with jitter: `delay = baseDelay * 2^attempt * (1 ± 0.5 * random())`
- Honors `Retry-After` header
- Retries on: 429, 500, 502, 503, 504, network errors
- No retry on: 400, 401, 403, 404

**Circuit Breaker:**
- Opens after 3 consecutive rate limit errors (429)
- Prevents thundering herd when API is overloaded
- 30-second cooldown before half-open state

### WebSocket Client (`internal/ws/`)

Persistent WebSocket connection with auto-reconnection:

```go
type Client struct {
    url              string
    conn             *websocket.Conn
    auth             *AuthConfig
    reconnectEnabled bool
    maxReconnects    int              // Default: 5
    subscriptions    map[string]bool  // Restored on reconnect
    pendingRequests  map[string]chan  // Request-response pattern
    lastPongTime     time.Time        // Health check
}
```

**Connection Lifecycle:**
1. Connect → Authenticate (if credentials provided)
2. Send ping every 30s
3. Expect pong within 10s
4. If pong timeout → reconnect
5. On reconnect → restore all subscriptions

**Request-Response Pattern:**
```
Client                     Server
  │                          │
  ├─ PlaceOrder (id=123) ──→ │
  │                          │
  │  ← Order result (id=123)─┤
  │                          │
  └─ Resolve promise ────────┘
```

Pending requests tracked in map, matched by request ID.

### Connection Manager (`internal/ws/manager.go`)

Orchestrates WebSocket-first with fallback:

```
┌─────────────────────────────────────────┐
│         Connection Manager              │
│                                         │
│  ┌────────────────────────────────┐    │
│  │     Circuit Breaker            │    │
│  │                                │    │
│  │  consecutiveFailures: int      │    │
│  │  state: closed/open/half-open  │    │
│  │  lastFailureTime: timestamp    │    │
│  └────────────────────────────────┘    │
│                                         │
│  PlaceOrderWithFallback()               │
│    ├─ checkCircuit()                    │
│    ├─ Try WebSocket (5s timeout)        │
│    └─ Fallback to REST if needed        │
│                                         │
└─────────────────────────────────────────┘
```

**Fallback Triggers:**
- WebSocket timeout (>5s)
- Circuit breaker open
- Connection unhealthy (no pong)
- Network error

**NOT Fallback:**
- Authentication errors (401/403) - fail fast
- Invalid parameters (400) - fail fast

### Credential Storage (`internal/config/`)

Priority order for credential loading:

```
1. Environment variables (GEMINI_API_KEY, GEMINI_API_SECRET)
   ↓ Not found
2. OS Keychain
   - macOS: Keychain
   - Windows: Credential Manager
   - Linux: Secret Service / KWallet
   ↓ Not found
3. Config file (~/.config/gemini/markets-cli.json)
   ↓ Not found
4. Error: No credentials configured
```

**Why this order?**
- Env vars first → CI/CD and containers
- Keychain second → secure local storage
- File third → backwards compatibility

### Output Formatting (`internal/output/`)

Three output formats:
- **JSON** (default) - Pretty-printed for readability
- **JSON compact** (`--raw`) - Minified for parsing
- **Table** (`-o table`) - Human-readable ASCII tables

```go
type Formatter interface {
    Format(data any) error
    FormatError(err error) error
}
```

Errors always structured, even in table mode:
```json
{
  "success": false,
  "error": {
    "code": "RATE_LIMITED",
    "message": "Too many requests",
    "retryable": true,
    "retryAfter": "5s"
  }
}
```

### Security (`internal/security/`, `internal/config/`)

**TLS Enforcement:**
```go
tlsConfig := &tls.Config{
    MinVersion: tls.VersionTLS12,
    CipherSuites: []uint16{
        tls.TLS_AES_128_GCM_SHA256,           // TLS 1.3
        tls.TLS_AES_256_GCM_SHA384,           // TLS 1.3
        tls.TLS_CHACHA20_POLY1305_SHA256,     // TLS 1.3
        tls.TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256,
        tls.TLS_ECDHE_RSA_WITH_AES_256_GCM_SHA384,
    },
}
```

**Request Signing (HMAC-SHA384):**
```
payload = base64(json({"request": "/v1/order", "nonce": 1234567890, ...}))
signature = hex(hmac_sha384(apiSecret, payload))

Headers (HMAC):
  X-GEMINI-APIKEY: account-abc123
  X-GEMINI-PAYLOAD: eyJyZXF1ZXN0Ij...
  X-GEMINI-SIGNATURE: 9a8b7c6d...

Headers (OAuth):
  Authorization: Bearer <access_token>
```

**SecureString:**
Memory scrubbing for secrets:
```go
type SecureString struct {
    data []byte
}

func (s *SecureString) Scrub() {
    for i := range s.data {
        s.data[i] = 0  // Zero out memory
    }
}
```

## Data Flow

### Order Placement Flow

```
┌─────────┐
│   CLI   │ gemini-markets predict order place --symbol GEMI-TEST ...
└────┬────┘
     │
     ▼
┌─────────────────┐
│  Cobra Command  │ Parse flags, validate params
└────┬────────────┘
     │
     ▼
┌──────────────────┐
│ Connection Mgr   │ Check circuit breaker
└────┬─────────────┘
     │
     ├─────────────────────────────────┐
     ▼                                 │
┌──────────────┐                       │ Fallback
│  WebSocket   │ PlaceOrder()          │ on error
│              │ ┌──────────────┐      │
│              │ │ Timeout: 5s  │      │
│              │ └──────────────┘      │
└──────┬───────┘                       │
       │                               │
       │ Success                       │ On failure/timeout
       │                               │
       │                               ▼
       │                        ┌──────────────┐
       │                        │  REST API    │
       │                        │              │
       │                        │ POST /v1/... │
       │                        └──────┬───────┘
       │                               │
       │◄──────────────────────────────┘
       │
       ▼
┌──────────────┐
│ JSON Output  │ {"orderId": "12345", "status": "open", ...}
└──────────────┘
```

### Real-Time Streaming Flow

```
┌─────────┐
│   CLI   │ gemini-markets stream orders -q
└────┬────┘
     │
     ▼
┌──────────────────┐
│  WebSocket Open  │ wss://ws.gemini.com
└────┬─────────────┘
     │
     ▼
┌──────────────────┐
│   Authenticate   │ Authorization: Bearer <token>  (OAuth)
│                  │ X-GEMINI-APIKEY / PAYLOAD / SIGNATURE  (HMAC)
└────┬─────────────┘
     │
     ▼
┌──────────────────┐
│   Subscribe      │ {"type": "subscribe", "stream": "orders@account"}
└────┬─────────────┘
     │
     │ Infinite loop
     ├───────────────────────┐
     │                       │
     ▼                       │
┌──────────────┐             │
│ Receive msg  │             │
└────┬─────────┘             │
     │                       │
     ▼                       │
┌──────────────┐             │
│ Print JSON   │             │
└────┬─────────┘             │
     │                       │
     └───────────────────────┘
```

## Performance Characteristics

### Latency

| Operation | WebSocket | REST |
|-----------|-----------|------|
| Place order | ~50ms | ~150ms |
| Cancel order | ~40ms | ~140ms |
| Get balance | ~100ms | ~120ms |
| Order book (public) | ~30ms | ~80ms |

**Why WebSocket is faster:**
- No TLS handshake per request
- Persistent connection eliminates TCP setup
- Binary framing vs HTTP headers

### Memory

- Idle: ~8 MB
- Active WebSocket: ~12 MB
- Large order list (1000 orders): ~18 MB

### Concurrency

- Thread-safe client design (mutex-protected state)
- Context cancellation propagated through all operations
- Goroutines for WebSocket read/write loops
- No goroutine leaks (verified with race detector)

## Testing Strategy

### Unit Tests
- Mock HTTP servers (`httptest.NewServer`)
- Table-driven tests for edge cases
- Coverage target: >70% for core packages

### Integration Tests
- Sandbox environment (api.sandbox.gemini.com)
- End-to-end workflows
- WebSocket reconnection scenarios

### Security Testing
- `gosec` - Static security analysis
- `govulncheck` - Known vulnerability scanning
- TLS configuration validation

## Deployment

### Multi-Platform Builds

GoReleaser configuration for:
- darwin/amd64, darwin/arm64
- linux/amd64, linux/arm64
- windows/amd64

Binary size optimization:
```bash
go build -ldflags="-s -w" -o gemini-markets ./cmd
```
- `-s` - Omit symbol table
- `-w` - Omit DWARF debug info
- Result: ~12 MB → ~8 MB

### Release Process

1. Tag version: `git tag v1.0.0`
2. Push tag: `git push origin v1.0.0`
3. GitHub Actions:
   - Run tests (3 OS × 2 Go versions)
   - Run linters (golangci-lint)
   - Run security checks (gosec, govulncheck)
   - Build binaries (6 platforms)
   - Generate SHA256 checksums
   - Create GitHub Release with assets
4. Self-update: `gemini-markets update` verifies checksums

## Failure Modes & Recovery

### WebSocket Connection Lost

1. Detect via pong timeout (10s)
2. Attempt reconnect (exponential backoff: 1s, 2s, 4s, 8s, 16s)
3. Max 5 reconnect attempts
4. On reconnect: restore all subscriptions
5. If reconnect fails: return error, user can retry

### API Rate Limit

1. Receive 429 response
2. Parse `Retry-After` header (e.g., "5")
3. Circuit breaker increments failure count
4. After 3 consecutive 429s: circuit opens
5. All requests fail fast with `ErrCircuitOpen` for 30s
6. After 30s: half-open state (allow one test request)
7. If test succeeds: close circuit
8. If test fails: reopen for another 30s

### Corrupted Config File

1. Attempt to load from file
2. JSON parse fails
3. Return error: "invalid config file: %w"
4. User runs `gemini-markets auth setup`
5. New config written with validation

### Network Partition

1. Context timeout (default 30s)
2. HTTP client returns `context.DeadlineExceeded`
3. Retry logic attempts (max 3 retries)
4. If all retries fail: return error to user
5. User can increase timeout: `--timeout 60`

## Future Considerations

### Potential Enhancements

1. **Connection Pooling** - Multiple WebSocket connections for higher throughput
2. **Request Batching** - Combine multiple orders into single request
3. **Local Order Book** - Maintain full order book in memory
4. **Metrics Export** - Prometheus metrics for observability
5. **Distributed Tracing** - OpenTelemetry integration

### Scalability

Current design handles:
- 100 requests/second (WebSocket)
- 10 concurrent streams
- 1000+ orders in memory

For higher loads, consider:
- Separate process per symbol (horizontal scaling)
- gRPC API for inter-process communication
- Shared state via Redis
