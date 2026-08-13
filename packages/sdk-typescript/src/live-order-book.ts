import { TypedEmitter } from "./core/typed-emitter.js";

import { OrderBook, normalizePrice, toId, type Level } from "./orderbook.js";
import { ResyncRequiredError, SdkError, serializeError } from "./errors.js";
import type { DiagnosticListener } from "./diagnostics.js";
import { emitDiagnostic, type Logger, NOOP_LOGGER } from "./logging.js";
import type { BookDelta, BookEvent, LiveOrderBook as LiveOrderBookContract } from "./types/client.js";
import type { DepthUpdate } from "./websocket-types.js";

// Prices must use the same canonical keys as the book engine.
function toDelta(b: string[][], a: string[][]): BookDelta {
  const side = (levels: string[][]): Level[] =>
    levels.map(([price, qty]) => ({ price: normalizePrice(price), qty }));
  return { bids: side(b), asks: side(a) };
}

// Keep the TypedEmitter wrapper and AbortSignal handler together so both are removed.
interface Registration {
  event: keyof LiveOrderBookEvents;
  wrapper: (...args: unknown[]) => void;
  signal?: AbortSignal;
  onAbort?: () => void;
}

// The facade identifies snapshots after subscription acknowledgement; the book never guesses.
type LiveOrderBookEvents = {
  update: (book: LiveOrderBook, delta: BookDelta) => void;
  resync: () => void;
  error: (error: Error) => void;
};

export class LiveOrderBook extends TypedEmitter<LiveOrderBookEvents> implements LiveOrderBookContract {
  readonly symbol: string;
  private readonly logger: Logger;
  private readonly book = new OrderBook();
  private live = false;
  private resyncSignaled = false; // dedup: one 'resync' per stale period, until a snapshot recovers
  private closed = false; // close() is permanent — no later frame may revive a torn-down book
  private readonly registrations = new Map<(...args: never[]) => void, Registration[]>();
  private readonly onClose?: () => void;
  private readonly onDiagnostic?: DiagnosticListener;

  constructor(symbol: string, options?: { logger?: Logger; onDiagnostic?: DiagnosticListener; onClose?: () => void }) {
    super();
    this.symbol = symbol;
    this.logger = options?.logger ?? NOOP_LOGGER;
    this.onClose = options?.onClose;
    this.onDiagnostic = options?.onDiagnostic;
  }

  private emitDiagnosticEvent(level: "warn" | "error", name: string, error?: unknown): void {
    emitDiagnostic({
      level,
      component: "order_book",
      name,
      traffic: "stream",
      metadata: { symbol: this.symbol },
      ...(error ? { error: serializeError(error) } : {}),
    }, this.logger, this.onDiagnostic);
  }

  /**
   * Rebuild from a fresh full-book snapshot. The facade calls this with the frame it has identified
   * as the snapshot after correlating the SUBSCRIBE success, so a queued or stale diff is never
   * mistaken for it. Returns whether the snapshot was accepted; on success emits one 'update'
   * carrying the full book.
   */
  applySnapshot(frame: unknown): boolean {
    if (this.closed) return false;
    const update = this.asDepthUpdate(frame);
    if (!update) return false;
    let delta: BookDelta | undefined;
    try {
      if (toId(update.U) !== toId(update.u)) {
        throw new SdkError(`snapshot frame must have U == u, got U=${update.U} u=${update.u}`);
      }
      this.book.applySnapshot({ lastUpdateId: update.u, bids: update.b, asks: update.a });
      this.live = true;
      this.resyncSignaled = false;
      const snapshot = this.book.snapshot();
      delta = { bids: snapshot.bids, asks: snapshot.asks };
    } catch (error) {
      this.fail(error);
      return false;
    }
    this.emit("update", this, delta); // outside try: a throwing listener must not stale the book
    return true;
  }

  /**
   * Apply one incremental diff. Dropped unless the book is live (before the first snapshot, or
   * while stale awaiting the facade's re-snapshot) — so a stray/queued frame can't revive it.
   */
  ingest(frame: unknown): void {
    if (this.closed || !this.live) return;
    const update = this.asDepthUpdate(frame);
    if (!update) return;
    let delta: BookDelta | undefined;
    try {
      // Stale updates are dropped so delta consumers cannot roll back their local book.
      if (this.book.applyDiff(update)) delta = toDelta(update.b, update.a);
    } catch (error) {
      this.fail(error);
      return;
    }
    if (delta) this.emit("update", this, delta); // outside try (see applySnapshot)
  }

  /** Discard the book (gap, malformed frame, or reconnect): go stale, emit 'resync' (deduped). */
  markStale(): void {
    this.live = false;
    if (!this.resyncSignaled) {
      this.resyncSignaled = true;
      this.emit("resync");
    }
  }

  private asDepthUpdate(frame: unknown): DepthUpdate | undefined {
    if (!frame || typeof frame !== "object") return undefined;
    const rec = frame as Record<string, unknown>;
    return rec.e === "depthUpdate" ? (rec as unknown as DepthUpdate) : undefined;
  }

  // A rejected frame (gap or malformed) means the book can't be trusted. Go stale BEFORE notifying
  // listeners — a throwing 'error'/'resync' listener must not bypass recovery.
  private fail(error: unknown): void {
    this.markStale();
    if (error instanceof ResyncRequiredError) {
      this.emitDiagnosticEvent("warn", "orderbook.resync", error);
    } else {
      // Wrap non-SDK errors (e.g. a level that isn't a [price, qty] string tuple -> TypeError) so
      // the emitted 'error' is always an SdkError, per the LiveOrderBook contract.
      this.emitDiagnosticEvent("error", "orderbook.frame.failure", error);
      if (this.listenerCount("error") > 0) {
        this.emit(
          "error",
          error instanceof SdkError ? error : new SdkError("malformed depth frame", { cause: error }),
        );
      }
    }
  }

  // Reads expose nothing while stale — a gapped book must never look tradeable.
  bestBid(): Level | undefined {
    return this.live ? this.book.bestBid() : undefined;
  }
  bestAsk(): Level | undefined {
    return this.live ? this.book.bestAsk() : undefined;
  }
  topN(side: "bids" | "asks", n: number): Level[] {
    return this.live ? this.book.topN(side, n) : [];
  }
  spread(): number | undefined {
    return this.live ? this.book.spread() : undefined;
  }
  mid(): number | undefined {
    return this.live ? this.book.mid() : undefined;
  }
  snapshot(): { bids: Level[]; asks: Level[] } {
    return this.live ? this.book.snapshot() : { bids: [], asks: [] };
  }

  on(event: keyof LiveOrderBookEvents, cb: (...args: never[]) => void, options?: { signal?: AbortSignal }): this {
    if (this.closed || options?.signal?.aborted) return this;
    const wrapper = (...args: unknown[]): void => (cb as (...a: unknown[]) => void)(...args);
    super.on(event, wrapper as LiveOrderBookEvents[typeof event]);
    const registration: Registration = { event, wrapper, signal: options?.signal };
    if (options?.signal) {
      registration.onAbort = () => this.remove(cb, registration);
      options.signal.addEventListener("abort", registration.onAbort, { once: true });
    }
    const list = this.registrations.get(cb) ?? [];
    list.push(registration);
    this.registrations.set(cb, list);
    return this;
  }

  off(event: BookEvent, cb: (...args: never[]) => void): this {
    const registration = this.registrations.get(cb)?.find((candidate) => candidate.event === event);
    if (registration) this.remove(cb, registration);
    return this;
  }

  // Remove the TypedEmitter listener and its AbortSignal handler together.
  private remove(cb: (...args: never[]) => void, registration: Registration): void {
    super.off(registration.event, registration.wrapper as LiveOrderBookEvents[keyof LiveOrderBookEvents]);
    if (registration.signal && registration.onAbort) {
      registration.signal.removeEventListener("abort", registration.onAbort);
    }
    const list = this.registrations.get(cb);
    if (!list) return;
    const index = list.indexOf(registration);
    if (index >= 0) list.splice(index, 1);
    if (list.length === 0) this.registrations.delete(cb);
  }

  /** True once close() has run. Lets an owner (the facade) avoid handing back a torn-down book. */
  isClosed(): boolean {
    return this.closed;
  }

  /** Stop this book permanently: go dark, drop listeners, and detach every abort handler. */
  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.live = false;
    this.onClose?.();
    for (const list of this.registrations.values()) {
      for (const reg of list) {
        if (reg.signal && reg.onAbort) reg.signal.removeEventListener("abort", reg.onAbort);
      }
    }
    this.registrations.clear();
    this.removeAllListeners();
  }
}
