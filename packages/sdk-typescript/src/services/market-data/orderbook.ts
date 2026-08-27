import { decimal, isPlainDecimal } from "../../utils/decimal.js";
import {
  isBoundaryBigInt,
  isBoundaryNumber,
  isBoundaryObject,
  isBoundaryString,
  type BoundaryValue,
} from "../../utils/boundary-value.js";
import { TypedEmitter } from "../../utils/typed-emitter.js";
import { ResyncRequiredError, SdkError, serializeError } from "../../errors.js";
import type { DiagnosticEvent, DiagnosticListener } from "../../observability/diagnostics.js";
import { emitDiagnostic, type Logger, NOOP_LOGGER } from "../../observability/logging.js";
import type { BookDelta, LiveOrderBook as LiveOrderBookContract } from "../../types/client.js";
import type { DepthUpdate } from "../../websocket/types.js";

const MAX_ORDER_BOOK_LEVELS_PER_SIDE = 100_000;

/**
 * Snapshot input for the order-book engine.
 * The exchange does not send a separate snapshot message.
 * The live order book builds this from the first `depthUpdate` frame after subscribe.
 * `U` and `u` define the update range. `b` contains bids. `a` contains asks.
 */
export interface L2Snapshot {
  lastUpdateId: number | bigint;
  bids: string[][];
  asks: string[][];
}

/** One price level with an exact decimal price and quantity. */
export type Level = { price: string; qty: string };

// Convert a wire ID to bigint.
// A bigint is already exact. A number must be a safe integer.
// Parse other numbers with parseLosslessJson before they reach the book.
export function toId(n: number | bigint): bigint {
  if (isBoundaryBigInt(n)) return n;
  if (!Number.isSafeInteger(n)) {
    throw new SdkError(`update id ${n} is not a safe integer; parse it losslessly upstream (parseLosslessJson)`);
  }
  return BigInt(n);
}

// Create one key for equal price values.
// Remove insignificant zeros without using floating-point arithmetic.
// For example, "0.260" and "0.26" use the same key.
export function normalizePrice(price: string): string {
  return decimal.normalize(price);
}

function isZeroDecimal(qty: string): boolean {
  for (let i = 0; i < qty.length; i++) {
    const code = qty.charCodeAt(i);
    if (code >= 49 && code <= 57) return false; // '1'..'9'
  }
  return true;
}

function isStringLevel(value: BoundaryValue): value is string[] {
  return Array.isArray(value) && value.every(isBoundaryString);
}

function isStringLevels(value: BoundaryValue): value is string[][] {
  return Array.isArray(value) && value.every(isStringLevel);
}

function isDepthUpdateFrame(frame: BoundaryValue): frame is DepthUpdate {
  return isBoundaryObject(frame) &&
    frame.e === "depthUpdate" &&
    (isBoundaryNumber(frame.E) || isBoundaryBigInt(frame.E)) &&
    isBoundaryString(frame.s) &&
    (isBoundaryNumber(frame.U) || isBoundaryBigInt(frame.U)) &&
    (isBoundaryNumber(frame.u) || isBoundaryBigInt(frame.u)) &&
    isStringLevels(frame.b) &&
    isStringLevels(frame.a);
}

// Reject a malformed level before changing the book.
// Do not skip a level and advance the sequence.
// That can leave stale state that a later gap cannot repair.
// Validate every level first. A bad diff then throws without advancing the sequence.
function assertDecimalLevels(changes: BoundaryValue): asserts changes is string[][] {
  if (!Array.isArray(changes)) {
    throw new SdkError("malformed depth side (expected an array)");
  }
  for (let i = 0; i < changes.length; i++) {
    const level = changes[i];
    if (
      !Array.isArray(level) ||
      level.length !== 2 ||
      !isPlainDecimal(level[0]) ||
      !isPlainDecimal(level[1])
    ) {
      throw new SdkError(
        `malformed depth level (price ${JSON.stringify(Array.isArray(level) ? level[0] : undefined)}, qty ${JSON.stringify(Array.isArray(level) ? level[1] : undefined)})`,
      );
    }
  }
}

// Apply validated changes to one side.
// A zero quantity removes the level. A non-zero quantity sets the level.
// The caller must run assertDecimalLevels first.
function applyLevels(side: Map<string, string>, changes: string[][]): void {
  for (let i = 0; i < changes.length; i++) {
    const level = changes[i]!;
    const price = level[0]!;
    const qty = level[1]!;
    const key = normalizePrice(price);
    if (isZeroDecimal(qty)) side.delete(key);
    else side.set(key, qty);
  }
}

function assertLevelCount(count: number): void {
  if (count > MAX_ORDER_BOOK_LEVELS_PER_SIDE) {
    throw new SdkError(
      `order-book side exceeded the ${MAX_ORDER_BOOK_LEVELS_PER_SIDE}-level limit`,
    );
  }
}

function assertLevelCapacity(side: Map<string, string>, changes: string[][]): void {
  let count = side.size;
  const overlay = new Map<string, boolean>();
  for (const [price, qty] of changes) {
    const key = normalizePrice(price);
    const wasPresent = overlay.get(key) ?? side.has(key);
    const willBePresent = !isZeroDecimal(qty);
    if (wasPresent !== willBePresent) count += willBePresent ? 1 : -1;
    overlay.set(key, willBePresent);
  }
  assertLevelCount(count);
}

function buildSide(changes: string[][]): Map<string, string> {
  const side = new Map<string, string>();
  applyLevels(side, changes);
  assertLevelCount(side.size);
  return side;
}

function compareNormalizedPrices(a: string, b: string): number {
  if (a === b) return 0;
  const dotA = a.indexOf(".");
  const dotB = b.indexOf(".");
  const intLenA = dotA < 0 ? a.length : dotA;
  const intLenB = dotB < 0 ? b.length : dotB;

  const intDiff = intLenA - intLenB;
  if (intDiff !== 0) return intDiff;
  for (let i = 0; i < intLenA; i++) {
    const diff = a.charCodeAt(i) - b.charCodeAt(i);
    if (diff !== 0) return diff;
  }

  const fracStartA = dotA < 0 ? a.length : dotA + 1;
  const fracStartB = dotB < 0 ? b.length : dotB + 1;
  const fracLenA = a.length - fracStartA;
  const fracLenB = b.length - fracStartB;
  const maxLen = Math.max(fracLenA, fracLenB);
  for (let i = 0; i < maxLen; i++) {
    const chA = i < fracLenA ? a.charCodeAt(fracStartA + i) : 48;
    const chB = i < fracLenB ? b.charCodeAt(fracStartB + i) : 48;
    if (chA !== chB) return chA - chB;
  }
  return 0;
}

// Compare two non-negative decimal prices without floating-point arithmetic.
// Return a value less than, equal to, or greater than zero.
// Return a sorted, frozen view so callers cannot change the cache.
function buildView(side: Map<string, string>, dir: "desc" | "asc"): ReadonlyArray<Level> {
  const levels: Level[] = [];
  levels.length = side.size;
  let i = 0;
  side.forEach((qty, price) => {
    levels[i++] = Object.freeze({ price, qty });
  });
  levels.sort((a, b) => {
    const cmp = compareNormalizedPrices(a.price, b.price);
    return dir === "desc" ? -cmp : cmp;
  });
  return Object.freeze(levels);
}

/**
 * Local L2 order book.
 * Prices and quantities are exact decimal strings. IDs are bigint values.
 * Use applySnapshot and applyDiff to change the book.
 * bids and asks return read-only copies. Use the read methods in a per-tick loop.
 *
 * A level uses the canonical price key. Equal prices such as "0.50" and "0.5"
 * map to one level. A zero-quantity update cannot leave a duplicate level.
 */
export class OrderBook extends TypedEmitter<OrderBookEvents> implements LiveOrderBookContract {
  readonly symbol: string;
  readonly #bids = new Map<string, string>();
  readonly #asks = new Map<string, string>();
  #lastUpdateId = 0n;

  private readonly logger: Logger;
  private readonly onClose?: () => void;
  private readonly onDiagnostic?: DiagnosticListener;
  private readonly correlationId?: string;
  private live = false;
  private resyncSignaled = false;
  private closed = false;

  constructor(symbol?: string, options?: {
    logger?: Logger;
    onDiagnostic?: DiagnosticListener;
    onClose?: () => void;
    correlationId?: string;
  }) {
    super();
    this.symbol = symbol ?? "";
    this.logger = options?.logger ?? NOOP_LOGGER;
    this.onClose = options?.onClose;
    this.onDiagnostic = options?.onDiagnostic;
    this.correlationId = options?.correlationId;
  }

  // Return a copy so callers cannot change book state or bypass cache invalidation.
  // Each call copies the full side. Use the read methods in a per-tick loop.
  get bids(): ReadonlyMap<string, string> {
    return new Map(this.#bids);
  }

  get asks(): ReadonlyMap<string, string> {
    return new Map(this.#asks);
  }

  /** ID of the last applied update. Read-only. */
  get lastUpdateId(): bigint {
    return this.#lastUpdateId;
  }

  // Cached sorted views in best-first order. null means that the cache is dirty.
  #sortedBids: ReadonlyArray<Level> | null = null;
  #sortedAsks: ReadonlyArray<Level> | null = null;

  /** Replace the book state with a new snapshot. */
  private replaceSnapshot(snapshot: BoundaryValue): void {
    if (!isBoundaryObject(snapshot) ||
      !(isBoundaryNumber(snapshot.lastUpdateId) || isBoundaryBigInt(snapshot.lastUpdateId))) {
      throw new SdkError("malformed depth snapshot");
    }
    const bids = snapshot.bids;
    const asks = snapshot.asks;
    assertDecimalLevels(bids); // Validate before clearing the current book.
    assertDecimalLevels(asks); // Do not erase a valid book before an error.
    const bidLevels = buildSide(bids);
    const askLevels = buildSide(asks);
    this.#bids.clear();
    this.#asks.clear();
    this.#lastUpdateId = toId(snapshot.lastUpdateId);
    for (const [price, qty] of bidLevels) this.#bids.set(price, qty);
    for (const [price, qty] of askLevels) this.#asks.set(price, qty);
    this.#sortedBids = null;
    this.#sortedAsks = null;
  }

  /**
   * Apply a designated wire snapshot.
   * A no-symbol instance accepts the internal L2Snapshot shape.
   * A symbol-bearing instance is the live public book.
   */
  applySnapshot(snapshot: L2Snapshot | BoundaryValue): boolean {
    if (!this.symbol) {
      this.replaceSnapshot(snapshot);
      return true;
    }
    if (this.closed) return false;
    const update = this.asDepthUpdate(snapshot);
    if (!update) return false;
    let delta: BookDelta | undefined;
    try {
      const firstUpdateId = toId(update.U);
      const lastUpdateId = toId(update.u);
      if (firstUpdateId > lastUpdateId) {
        throw new SdkError(`snapshot frame must have U <= u, got U=${update.U} u=${update.u}`);
      }
      this.replaceSnapshot({ lastUpdateId, bids: update.b, asks: update.a });
      this.live = true;
      this.resyncSignaled = false;
      const snapshotView = this.currentSnapshot();
      delta = { bids: snapshotView.bids, asks: snapshotView.asks };
    } catch (error) {
      this.fail(error instanceof Error ? error : new SdkError("malformed depth snapshot", { cause: error }));
      return false;
    }
    this.emit("update", this, delta);
    return true;
  }

  /**
   * Apply one differential update and enforce sequence order.
   * Return `true` when the diff is applied.
   * Return `false` when the diff is stale (`u <= lastUpdateId`).
   * Throw ResyncRequiredError when a gap exists.
   */
  applyDiff(diff: DepthUpdate): boolean {
    const u = toId(diff.u);
    if (u <= this.#lastUpdateId) return false; // stale: already covered
    const U = toId(diff.U);
    // The Gemini Fast WS depth stream can overlap at U == lastUpdateId.
    // A value of U > lastUpdateId indicates a missed frame.
    if (U > this.#lastUpdateId) {
      throw new ResyncRequiredError(this.#lastUpdateId, U); // gap: resync
    }
    assertDecimalLevels(diff.b); // Validate both sides before changing the book.
    assertDecimalLevels(diff.a); // A bad diff throws without advancing the sequence.
    assertLevelCapacity(this.#bids, diff.b);
    assertLevelCapacity(this.#asks, diff.a);
    applyLevels(this.#bids, diff.b);
    applyLevels(this.#asks, diff.a);
    this.#lastUpdateId = u;
    if (diff.b.length) this.#sortedBids = null;
    if (diff.a.length) this.#sortedAsks = null;
    return true;
  }

  /** Apply a wire diff while the book is healthy. */
  ingest(frame: BoundaryValue): void {
    if (this.closed || !this.live) return;
    const update = this.asDepthUpdate(frame);
    if (!update) {
      if (isBoundaryObject(frame) && frame.e === "depthUpdate") {
        this.fail(new SdkError("malformed depth update"));
      }
      return;
    }
    let delta: BookDelta | undefined;
    try {
      if (this.applyDiff(update)) delta = toDelta(update.b, update.a);
    } catch (error) {
      this.fail(error instanceof Error ? error : new SdkError("malformed depth update", { cause: error }));
      return;
    }
    if (delta) this.emit("update", this, delta);
  }

  /** Discard the live state until the caller supplies a new snapshot. */
  markStale(): void {
    this.live = false;
    if (!this.resyncSignaled) {
      this.resyncSignaled = true;
      this.emit("resync");
    }
  }

  #bidView(): ReadonlyArray<Level> {
    return (this.#sortedBids ??= buildView(this.#bids, "desc"));
  }

  #askView(): ReadonlyArray<Level> {
    return (this.#sortedAsks ??= buildView(this.#asks, "asc"));
  }

  /** Return the highest bid, or `undefined` when there are no bids. */
  bestBid(): Level | undefined {
    return this.isReadable() ? this.#bidView()[0] : undefined;
  }

  /** Return the lowest ask, or `undefined` when there are no asks. */
  bestAsk(): Level | undefined {
    return this.isReadable() ? this.#askView()[0] : undefined;
  }

  /** Return the top `n` levels in best-first order. */
  topN(side: "bids" | "asks", n: number): Level[] {
    if (!this.isReadable() || n <= 0) return [];
    return (side === "bids" ? this.#bidView() : this.#askView()).slice(0, n);
  }

  /** Return the spread as a number, or `undefined` when a side is empty. Use for display only. */
  spread(): number | undefined {
    if (!this.isReadable()) return undefined;
    const bid = this.bestBid();
    const ask = this.bestAsk();
    if (!bid || !ask) return undefined;
    return Number(ask.price) - Number(bid.price);
  }

  /** Return the spread as an exact decimal string. */
  spreadDecimal(): string | undefined {
    if (!this.isReadable()) return undefined;
    const bid = this.bestBid();
    const ask = this.bestAsk();
    if (!bid || !ask) return undefined;
    return decimal.subtract(ask.price, bid.price);
  }

  /** Return the midpoint as a number, or `undefined` when a side is empty. Use for display only. */
  mid(): number | undefined {
    if (!this.isReadable()) return undefined;
    const bid = this.bestBid();
    const ask = this.bestAsk();
    if (!bid || !ask) return undefined;
    return (Number(ask.price) + Number(bid.price)) / 2;
  }

  /** Return the midpoint as an exact decimal string. */
  midDecimal(): string | undefined {
    if (!this.isReadable()) return undefined;
    const bid = this.bestBid();
    const ask = this.bestAsk();
    if (!bid || !ask) return undefined;
    const sum = decimal.add(ask.price, bid.price);
    const decimalPoint = sum.indexOf(".");
    const fractionalDigits = decimalPoint === -1 ? 0 : sum.length - decimalPoint - 1;
    return decimal.divide(sum, "2", fractionalDigits + 1);
  }

  /** Return the full book as sorted bid and ask arrays. */
  snapshot(): { bids: Level[]; asks: Level[] } {
    return this.live || !this.symbol ? this.currentSnapshot() : { bids: [], asks: [] };
  }

  private currentSnapshot() {
    return { bids: this.#bidView().slice(), asks: this.#askView().slice() } satisfies { bids: Level[]; asks: Level[] };
  }

  private isReadable(): boolean {
    return this.live || !this.symbol;
  }

  private asDepthUpdate(frame: BoundaryValue): DepthUpdate | undefined {
    return isDepthUpdateFrame(frame) ? frame : undefined;
  }

  private emitDiagnosticEvent(level: "warn" | "error", name: string, cause?: unknown): void {
    const event: DiagnosticEvent = {
      level,
      component: "order_book",
      name,
      traffic: "stream",
      correlationId: this.correlationId,
      metadata: { symbol: this.symbol },
    };
    if (cause) event.error = serializeError(cause);
    emitDiagnostic(event, this.logger, this.onDiagnostic);
  }

  private fail(error: BoundaryValue): void {
    this.markStale();
    if (error instanceof ResyncRequiredError) {
      this.emitDiagnosticEvent("warn", "orderbook.resync", error);
      return;
    }
    this.emitDiagnosticEvent("error", "orderbook.frame.failure", error);
    if (this.listenerCount("error") > 0) {
      this.emit(
        "error",
        error instanceof SdkError ? error : new SdkError("malformed depth frame", { cause: error }),
      );
    }
  }

  on<E extends keyof OrderBookEvents>(event: E, cb: OrderBookEvents[E], options?: { signal?: AbortSignal }): this {
    if (this.closed) return this;
    super.on(event, cb, options);
    return this;
  }

  off<E extends keyof OrderBookEvents>(event: E, cb: OrderBookEvents[E]): this {
    super.off(event, cb);
    return this;
  }

  isClosed(): boolean {
    return this.closed;
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.live = false;
    this.onClose?.();
    this.removeAllListeners();
  }

  [Symbol.dispose](): void {
    this.close();
  }

  async [Symbol.asyncDispose](): Promise<void> {
    this.close();
  }
}

type OrderBookEvents = {
  update: (book: OrderBook, delta: BookDelta) => void;
  resync: () => void;
  error: (error: Error) => void;
};

function mapDeltaSide(levels: string[][]): Level[] {
  const count = levels.length;
  const out: Level[] = [];
  out.length = count;
  for (let i = 0; i < count; i++) {
    const level = levels[i]!;
    out[i] = { price: normalizePrice(level[0]!), qty: level[1]! };
  }
  return out;
}

function toDelta(b: string[][], a: string[][]): BookDelta {
  return { bids: mapDeltaSide(b), asks: mapDeltaSide(a) };
}
