import { ResyncRequiredError, SdkError } from "./errors.js";
import type { DepthUpdate } from "./websocket-types.js";

/**
 * Engine snapshot input: a full book at a known update id. NOT a wire type — the exchange
 * sends no distinct snapshot message. The sequencer (LiveOrderBook) builds this from the
 * first `depthUpdate` frame after subscribe (u -> lastUpdateId, b -> bids, a -> asks).
 */
export interface L2Snapshot {
  lastUpdateId: number | bigint;
  bids: string[][];
  asks: string[][];
}

/** One price level: aggregated quantity at a price, both exact decimal strings. */
export type Level = { price: string; qty: string };

// Wire id → bigint. A bigint (from lossless parsing) passes through — it's already exact.
// A number must be a safe integer; otherwise JSON.parse already rounded it, so it has to be
// parsed losslessly upstream (parseLosslessJson) before it reaches the book.
export function toId(n: number | bigint): bigint {
  if (typeof n === "bigint") return n;
  if (!Number.isSafeInteger(n)) {
    throw new SdkError(`update id ${n} is not a safe integer; parse it losslessly upstream (parseLosslessJson)`);
  }
  return BigInt(n);
}

// Canonical key for a price string: strip insignificant zeros so equal values map to one
// key ("0.260" → "0.26", ".50" → "0.5", "0100.0" → "100"). Pure string transform — no float,
// the numeric value is preserved. Map keys are therefore canonical, so one price can't become
// two levels under different spellings.
export function normalizePrice(price: string): string {
  if (!price.includes(".")) return price.replace(/^0+(?=\d)/, "");
  const dot = price.indexOf(".");
  const int = price.slice(0, dot).replace(/^0+(?=\d)/, "") || "0";
  const frac = price.slice(dot + 1).replace(/0+$/, "");
  return frac === "" ? int : `${int}.${frac}`;
}

// A well-formed non-negative decimal, for validating both prices and quantities ("0", "12",
// "0.50", ".5", "12."). No float: Number() could underflow a tiny value to 0 and accepts
// non-decimal spellings.
const DECIMAL = /^(?:\d+\.?\d*|\.\d+)$/;

// Reject a malformed level up front. A corrupt frame must NOT be silently skipped: skipping a
// level while still advancing the sequence leaves a stale level that no later gap can repair
// (silent divergence). Validate every level before mutating anything, so a bad diff throws
// without advancing — the next diff then gaps and triggers a resync.
function assertDecimalLevels(changes: string[][]): void {
  for (const level of changes) {
    const [price, qty] = level;
    // Frames are untrusted (cast from `unknown`), so guard the runtime shape, not just the type:
    // each level must be a [price, qty] pair of decimal STRINGS. A non-string (e.g. a JSON number)
    // would coerce through the regex but then throw mid-mutation in normalizePrice — breaking the
    // "validate before mutating" atomicity and leaving a partially-changed book.
    if (
      !Array.isArray(level) || // a string is iterable with a .length too — require a real array
      level.length !== 2 ||
      typeof price !== "string" ||
      typeof qty !== "string" ||
      !DECIMAL.test(price) ||
      !DECIMAL.test(qty)
    ) {
      throw new SdkError(
        `malformed depth level (price ${JSON.stringify(price)}, qty ${JSON.stringify(qty)})`,
      );
    }
  }
}

// Apply validated changes to one side: a decimal-zero quantity removes the level, a nonzero sets
// it, under a canonical price key. Assumes assertDecimalLevels has already passed.
function applyLevels(side: Map<string, string>, changes: string[][]): void {
  for (const [price, qty] of changes) {
    const key = normalizePrice(price);
    if (!/[1-9]/.test(qty)) side.delete(key); // valid decimal with no nonzero digit = zero
    else side.set(key, qty);
  }
}

// Compare two non-negative decimal-string prices by exact numeric value — no float, so ordering
// stays correct past ~15 sig figs where Number() would collapse distinct prices together.
// Returns <0 / 0 / >0 like a sort comparator. Prices are order-book prices (non-negative).
function compareDecimal(a: string, b: string): number {
  const [aInt, aFrac = ""] = a.split(".");
  const [bInt, bFrac = ""] = b.split(".");
  const ai = aInt.replace(/^0+(?=\d)/, "");
  const bi = bInt.replace(/^0+(?=\d)/, "");
  // Integer part: more digits = larger; same length compares lexically (digits only).
  if (ai.length !== bi.length) return ai.length - bi.length;
  if (ai !== bi) return ai < bi ? -1 : 1;
  // Fractional part: pad to equal length with trailing zeros, then compare lexically.
  const len = Math.max(aFrac.length, bFrac.length);
  const af = aFrac.padEnd(len, "0");
  const bf = bFrac.padEnd(len, "0");
  if (af !== bf) return af < bf ? -1 : 1;
  return 0;
}

// Sorted, frozen best-first view of a side. Frozen so callers can't corrupt the cache.
function buildView(side: Map<string, string>, dir: "desc" | "asc"): Level[] {
  const levels = [...side.entries()].map(([price, qty]) => Object.freeze({ price, qty }));
  levels.sort((a, b) =>
    dir === "desc" ? compareDecimal(b.price, a.price) : compareDecimal(a.price, b.price),
  );
  return Object.freeze(levels) as Level[];
}

/**
 * Local L2 order book. Prices/quantities are exact decimal strings (money path); ids are bigint.
 * Mutate only via applySnapshot/applyDiff — they invalidate the cached sorted views.
 * bids/asks return read-only defensive copies of each side (each call copies the side, so it's
 * fine for occasional lookups but not a per-tick hot path — use the read methods for that).
 *
 * Level identity is the CANONICAL price key (see normalizePrice): equal prices written
 * differently ("0.50" vs "0.5") map to one level, so a "0" removal can't leave a stale twin.
 */
export class OrderBook {
  readonly #bids = new Map<string, string>();
  readonly #asks = new Map<string, string>();
  #lastUpdateId = 0n;

  // Defensive copies: a caller can't corrupt book state or bypass cache invalidation. Each call
  // copies the whole side (O(n)) — fine for occasional lookups, not a per-tick hot loop.
  get bids(): ReadonlyMap<string, string> {
    return new Map(this.#bids);
  }

  get asks(): ReadonlyMap<string, string> {
    return new Map(this.#asks);
  }

  /** Sequence id of the last update applied. Read-only; advanced only by applySnapshot/applyDiff. */
  get lastUpdateId(): bigint {
    return this.#lastUpdateId;
  }

  // Cached sorted views, best-first. null = dirty; rebuilt on read, cleared on write.
  #sortedBids: Level[] | null = null;
  #sortedAsks: Level[] | null = null;

  /** Replace the entire book with a fresh snapshot. */
  applySnapshot(snapshot: L2Snapshot): void {
    assertDecimalLevels(snapshot.bids); // validate before clearing — a malformed snapshot must not
    assertDecimalLevels(snapshot.asks); // wipe a good book and then throw
    this.#bids.clear();
    this.#asks.clear();
    this.#lastUpdateId = toId(snapshot.lastUpdateId);
    // A snapshot "0" means "no level" — applyLevels drops it, same as the diff path.
    applyLevels(this.#bids, snapshot.bids);
    applyLevels(this.#asks, snapshot.asks);
    this.#sortedBids = null;
    this.#sortedAsks = null;
  }

  /**
   * Apply one differential update, enforcing sequence order.
   * Returns true if the diff was applied, false if it was dropped as stale
   * (`u <= lastUpdateId`) — callers must not surface a delta for a dropped frame.
   * Throws ResyncRequiredError on a gap.
   */
  applyDiff(diff: DepthUpdate): boolean {
    const u = toId(diff.u);
    if (u <= this.#lastUpdateId) return false; // stale: already covered
    const U = toId(diff.U);
    // Gemini's Fast WS depth stream overlaps at U == lastUpdateId. Unlike Binance's
    // contiguous stream, U > lastUpdateId already indicates a missed frame.
    if (U > this.#lastUpdateId) {
      throw new ResyncRequiredError(this.#lastUpdateId, U); // gap: resync
    }
    assertDecimalLevels(diff.b); // validate both sides before mutating — atomic; a bad diff throws
    assertDecimalLevels(diff.a); // without advancing, so the next diff gaps → resync
    applyLevels(this.#bids, diff.b);
    applyLevels(this.#asks, diff.a);
    this.#lastUpdateId = u;
    if (diff.b.length) this.#sortedBids = null;
    if (diff.a.length) this.#sortedAsks = null;
    return true;
  }

  #bidView(): Level[] {
    return (this.#sortedBids ??= buildView(this.#bids, "desc"));
  }

  #askView(): Level[] {
    return (this.#sortedAsks ??= buildView(this.#asks, "asc"));
  }

  /** Highest-price bid level, or undefined if there are no bids. */
  bestBid(): Level | undefined {
    return this.#bidView()[0];
  }

  /** Lowest-price ask level, or undefined if there are no asks. */
  bestAsk(): Level | undefined {
    return this.#askView()[0];
  }

  /** Top `n` levels of a side, best-first (bids high→low, asks low→high). */
  topN(side: "bids" | "asks", n: number): Level[] {
    if (n <= 0) return [];
    return (side === "bids" ? this.#bidView() : this.#askView()).slice(0, n);
  }

  /** Best ask price minus best bid, or undefined if a side is empty. Float — for display, not exact math. */
  spread(): number | undefined {
    const bid = this.bestBid();
    const ask = this.bestAsk();
    if (!bid || !ask) return undefined;
    return Number(ask.price) - Number(bid.price);
  }

  /** Midpoint of best bid and best ask, or undefined if a side is empty. Float (see spread). */
  mid(): number | undefined {
    const bid = this.bestBid();
    const ask = this.bestAsk();
    if (!bid || !ask) return undefined;
    return (Number(ask.price) + Number(bid.price)) / 2;
  }

  /** The whole book as sorted arrays (bids high→low, asks low→high). */
  snapshot(): { bids: Level[]; asks: Level[] } {
    return { bids: this.#bidView().slice(), asks: this.#askView().slice() };
  }
}
