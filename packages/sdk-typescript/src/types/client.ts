import type { SdkError } from "../errors.js";
import type { Logger } from "../logging.js";
import type { Level } from "../orderbook.js";
import type { AuthStrategy, FetchLike } from "../core/http.js";
import type { DiagnosticListener } from "../diagnostics.js";
import type { Environment } from "../core/environment.js";
import type { SocketFactory } from "../transport.js";

/** Client options. All optional — `new GeminiMarkets()` is valid. */
export interface GeminiMarketsOptions {
  /** Venue to connect to. Default "production". */
  env?: Environment;
  /** Where SDK logs go. Default: silent (NoopLogger). */
  logger?: Logger;
  /** Receives safe structured diagnostics from REST, OAuth, WebSocket, and order books. */
  onDiagnostic?: DiagnosticListener;
  /** Authentication used by private Prediction Markets REST methods. */
  auth?: AuthStrategy;
  /** End-to-end timeout for REST and WebSocket waits. Default 30 seconds. */
  timeoutMs?: number;
  /** Optional application-level WebSocket liveness checks. */
  webSocketLiveness?: { intervalMs?: number; timeoutMs?: number };
  /** Maximum accepted inbound WebSocket message size in UTF-8 bytes. */
  webSocketMaxMessageSizeBytes?: number;
  /** Retry count for generated safe REST reads only. Default 5. */
  maxRetries?: number;
  /** Backoff tuning for generated safe REST reads only. */
  backoff?: { baseMs?: number; capMs?: number; factor?: number };
  /** Custom fetch implementation for REST instrumentation or routing. */
  fetch?: FetchLike;
  /** Custom WebSocket factory for runtimes that need upgrade headers (e.g. ws for Node HMAC auth). */
  webSocketFactory?: SocketFactory;
}

export type BookEvent = "update" | "resync" | "error";

/**
 * Levels that changed on the last update (not the whole book); qty "0" = removed.
 * Exception: the first "update" after subscribe or a "resync" carries the FULL book
 * (a replacement, not an incremental patch) — mirror it as authoritative state.
 */
export interface BookDelta {
  bids: Level[];
  asks: Level[];
}

/**
 * Live, self-healing L2 book for one symbol, returned by orderBook(). Reads are
 * safe anytime; the SDK keeps it fresh and heals gaps in the background.
 */
export interface LiveOrderBook {
  readonly symbol: string;

  // Reads — current state, best-first.
  bestBid(): Level | undefined;
  bestAsk(): Level | undefined;
  topN(side: "bids" | "asks", n: number): Level[];
  spread(): number | undefined; // float, display-only
  mid(): number | undefined; // float, display-only
  snapshot(): { bids: Level[]; asks: Level[] };

  // Events. Pass { signal } to auto-remove on abort, or use off()/close().
  on(
    event: "update",
    cb: (book: LiveOrderBook, delta: BookDelta) => void,
    options?: { signal?: AbortSignal },
  ): void;
  /** resync = gap detected, book stale and rebuilding — protect yourself until the next "update". */
  on(event: "resync", cb: () => void, options?: { signal?: AbortSignal }): void;
  on(event: "error", cb: (err: SdkError) => void, options?: { signal?: AbortSignal }): void;

  /** Remove a listener — must be the same function reference passed to on(). */
  off(event: BookEvent, cb: (...args: never[]) => void): void;

  /** Stop this book: remove all listeners and release its stream. */
  close(): void;
}
