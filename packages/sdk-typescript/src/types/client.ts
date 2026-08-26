import type { SdkError } from "../errors.js";
import type { Logger } from "../observability/logging.js";
import type { Level } from "../services/market-data/orderbook.js";
import type { AuthStrategy, FetchLike } from "../transport/http.js";
import type { DiagnosticListener } from "../observability/diagnostics.js";
import type { SocketFactory, WebSocketReconnectOptions } from "../websocket/session.js";

export type Environment = "production" | "sandbox";

/** Client options. The environment must always be selected explicitly. */
export interface GeminiMarketsOptions {
  /** Environment to connect to. This is required to prevent accidental live requests. */
  env: Environment;
  /** Logger for SDK logs. Default: silent (`NOOP_LOGGER`). */
  logger?: Logger;
  /** Receives safe diagnostics from REST, OAuth, WebSocket, and order-book operations. */
  onDiagnostic?: DiagnosticListener;
  /** Authentication for private Prediction Markets REST methods. */
  auth?: AuthStrategy;
  /** End-to-end timeout for REST and WebSocket waits. Default: 30 seconds. */
  timeoutMs?: number;
  /** Optional application-level WebSocket liveness checks. */
  webSocketLiveness?: { intervalMs?: number; timeoutMs?: number };
  /** Maximum inbound WebSocket message size in UTF-8 bytes. */
  webSocketMaxMessageSizeBytes?: number;
  /** Exponential WebSocket reconnect backoff. */
  webSocketBackoff?: { baseMs?: number; capMs?: number; factor?: number };
  /** Automatic WebSocket reconnect policy. Defaults to ten attempts. */
  webSocketReconnect?: WebSocketReconnectOptions;
  /** WebSocket handshake timeout forwarded through the replaceable socket factory. */
  webSocketHandshakeTimeoutMs?: number;
  /** Negotiate per-message compression when the runtime transport supports it. Default: false. */
  webSocketPerMessageDeflate?: boolean;
  /** Retry count for generated safe REST reads only. Default: 5. */
  maxRetries?: number;
  /** Maximum REST response body size. Default: 16 MiB. */
  maxResponseSizeBytes?: number;
  /** Backoff settings for generated safe REST reads only. */
  backoff?: { baseMs?: number; capMs?: number; factor?: number };
  /** Custom fetch implementation for REST instrumentation or routing. */
  fetch?: FetchLike;
  /** Custom WebSocket factory for runtimes that need upgrade headers, such as `ws` for Node.js HMAC auth. */
  webSocketFactory?: SocketFactory;
  /** Optional hook for request tracing and metrics. */
  onRequest?: (payload: import("../transport/http.js").RequestHookPayload) => void;
  /** Optional hook for response tracing and metrics. */
  onResponse?: (payload: import("../transport/http.js").ResponseHookPayload) => void;
}

export type BookEvent = "update" | "resync" | "error";

/**
 * Levels that changed in the last update. This is not the full book.
 * A quantity of "0" means that the level was removed.
 * The first "update" after subscribe or resync contains the full book.
 * Use that update as the new book state.
 */
export interface BookDelta {
  bids: Level[];
  asks: Level[];
}

/**
 * Live L2 book for one symbol, returned by orderBook().
 * Reads are safe at any time. The SDK rebuilds the book after a sequence gap.
 */
export interface LiveOrderBook {
  readonly symbol: string;

  // Read the current state in best-first order.
  bestBid(): Level | undefined;
  bestAsk(): Level | undefined;
  topN(side: "bids" | "asks", n: number): Level[];
  spread(): number | undefined; // Number for display only.
  mid(): number | undefined; // Number for display only.
  spreadDecimal(): string | undefined; // Exact decimal string.
  midDecimal(): string | undefined; // Exact decimal string.
  snapshot(): { bids: Level[]; asks: Level[] };

  // Events. Pass { signal } to remove the listener on abort.
  // You can also use off() or close().
  on(
    event: "update",
    cb: (book: LiveOrderBook, delta: BookDelta) => void,
    options?: { signal?: AbortSignal },
  ): void;
  /** A gap was detected. The book is rebuilding. Wait for the next "update". */
  on(event: "resync", cb: () => void, options?: { signal?: AbortSignal }): void;
  on(event: "error", cb: (err: SdkError) => void, options?: { signal?: AbortSignal }): void;

  /** Remove a listener. Use the same function reference passed to on(). */
  off(event: BookEvent, cb: (...args: never[]) => void): void;

  /** Stop this book. Remove all listeners and release its stream. */
  close(): void;

  [Symbol.dispose]?(): void;
  [Symbol.asyncDispose]?(): Promise<void>;
}
