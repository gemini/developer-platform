import test from "node:test";
import assert from "node:assert/strict";

import { OrderBook } from "../orderbook.js";
import { ResyncRequiredError, SdkError } from "../errors.js";
import type { DepthUpdate } from "../websocket-types.js";

// A depth diff with the boilerplate fields filled in; override what a test cares about.
function diff(over: Partial<DepthUpdate>): DepthUpdate {
  return { e: "depthUpdate", E: 0, s: "TEST", U: 0, u: 0, b: [], a: [], ...over };
}

// Book seeded with a known snapshot at lastUpdateId 42.
function seededBook(): OrderBook {
  const book = new OrderBook();
  book.applySnapshot({
    lastUpdateId: 42,
    bids: [["100.5", "2"], ["100.4", "1"]],
    asks: [["101.0", "3"]],
  });
  return book;
}

// Gemini's Fast WS depth updates overlap: a valid continuation has U == lastUpdateId.

test("applySnapshot populates the book from a snapshot", () => {
  const book = new OrderBook();
  book.applySnapshot({
    lastUpdateId: 42,
    bids: [
      ["100.5", "2"],
      ["100.4", "1"],
    ],
    asks: [["101.0", "3"]],
  });

  assert.equal(book.lastUpdateId, 42n, "lastUpdateId stored as bigint");
  assert.equal(book.bids.get("100.5"), "2");
  assert.equal(book.bids.get("100.4"), "1");
  assert.equal(book.asks.get("101"), "3", "'101.0' is stored under its canonical key '101'");
});

test("applyDiff applies changed levels and advances lastUpdateId", () => {
  const book = seededBook(); // lastUpdateId 42; a continuation shares that boundary (U == 42)
  book.applyDiff(
    diff({
      U: 42,
      u: 45,
      b: [["100.5", "5"], ["100.3", "1"]], // update existing + add new
      a: [["101.0", "4"]],
    }),
  );

  assert.equal(book.lastUpdateId, 45n);
  assert.equal(book.bids.get("100.5"), "5");
  assert.equal(book.bids.get("100.3"), "1");
  assert.equal(book.bids.get("100.4"), "1", "untouched level unchanged");
  assert.equal(book.asks.get("101"), "4", "canonical key");
});

test("applyDiff removes a level when quantity is zero, including \"0.00\"", () => {
  const book = seededBook();
  book.applyDiff(
    diff({
      U: 42,
      u: 44,
      b: [["100.4", "0"], ["100.5", "0.00"]], // both forms of zero remove
    }),
  );

  assert.equal(book.bids.has("100.4"), false, "\"0\" removes the level");
  assert.equal(book.bids.has("100.5"), false, "\"0.00\" also removes the level");
});

test("applyDiff throws ResyncRequiredError on a gap and leaves the book untouched", () => {
  const book = seededBook(); // lastUpdateId 42, so a valid continuation has U == 42
  const gapDiff = diff({ U: 45, u: 46, b: [["100.5", "999"]] }); // U skips past 42 → gap

  assert.throws(() => book.applyDiff(gapDiff), ResyncRequiredError);
  assert.equal(book.lastUpdateId, 42n, "id not advanced");
  assert.equal(book.bids.get("100.5"), "2", "changes not applied");
});

// Under the overlap convention, U == lastUpdateId + 1 already indicates a missed frame.
test("applyDiff treats U == lastUpdateId + 1 as a gap (overlap: valid next U == lastUpdateId)", () => {
  const book = seededBook(); // lastUpdateId 42; a valid continuation shares the boundary (U == 42)
  const boundaryGap = diff({ U: 43, u: 43, b: [["100.5", "999"]] }); // U one past last = a skipped frame
  assert.throws(() => book.applyDiff(boundaryGap), ResyncRequiredError);
  assert.equal(book.lastUpdateId, 42n, "a boundary gap must not advance the id");
  assert.equal(book.bids.get("100.5"), "2", "and must not mutate the book");
});

test("applyDiff accepts U == lastUpdateId as an in-sequence continuation (overlap)", () => {
  const book = seededBook(); // lastUpdateId 42
  book.applyDiff(diff({ U: 42, u: 43, b: [["100.5", "5"]] })); // shares boundary id 42
  assert.equal(book.lastUpdateId, 43n, "continuation advances to u");
  assert.equal(book.bids.get("100.5"), "5");
});

test("applyDiff ignores a stale diff already covered by the snapshot", () => {
  const book = seededBook(); // lastUpdateId 42
  book.applyDiff(diff({ U: 40, u: 41, b: [["100.5", "999"]] })); // u <= 42, fully stale

  assert.equal(book.lastUpdateId, 42n, "id not regressed");
  assert.equal(book.bids.get("100.5"), "2", "stale change not applied");
});

test("bestBid/bestAsk pick the numerically best price, not the lexical one", () => {
  const book = new OrderBook();
  book.applySnapshot({
    lastUpdateId: 1,
    bids: [["9", "1"], ["100", "2"], ["99", "3"]], // lexical max is "99"; numeric max is 100
    asks: [["101", "4"], ["9", "5"], ["20", "6"]], // lexical min is "101"; numeric min is 9
  });

  assert.deepEqual(book.bestBid(), { price: "100", qty: "2" });
  assert.deepEqual(book.bestAsk(), { price: "9", qty: "5" });
});

test("bestBid/bestAsk return undefined when a side is empty", () => {
  const book = new OrderBook();
  assert.equal(book.bestBid(), undefined);
  assert.equal(book.bestAsk(), undefined);
});

test("topN returns levels best-first, numerically sorted and capped at n", () => {
  const book = new OrderBook();
  book.applySnapshot({
    lastUpdateId: 1,
    bids: [["9", "1"], ["100", "2"], ["99", "3"], ["20", "4"]],
    asks: [["101", "5"], ["9", "6"], ["20", "7"]],
  });

  // bids: high→low, numeric (so 100 > 99 > 20 > 9, not lexical)
  assert.deepEqual(book.topN("bids", 3), [
    { price: "100", qty: "2" },
    { price: "99", qty: "3" },
    { price: "20", qty: "4" },
  ]);
  // asks: low→high
  assert.deepEqual(book.topN("asks", 2), [
    { price: "9", qty: "6" },
    { price: "20", qty: "7" },
  ]);
  // n larger than the book returns everything, no padding
  assert.equal(book.topN("asks", 99).length, 3);
});

test("spread and mid compute from best bid/ask", () => {
  const book = new OrderBook();
  book.applySnapshot({ lastUpdateId: 1, bids: [["100", "1"]], asks: [["101", "2"]] });

  assert.equal(book.spread(), 1);
  assert.equal(book.mid(), 100.5);
});

test("spread and mid are undefined when a side is empty", () => {
  const book = new OrderBook();
  book.applySnapshot({ lastUpdateId: 1, bids: [["100", "1"]], asks: [] });

  assert.equal(book.spread(), undefined);
  assert.equal(book.mid(), undefined);
});

test("snapshot returns both sides fully sorted, best-first", () => {
  const book = new OrderBook();
  book.applySnapshot({
    lastUpdateId: 1,
    bids: [["99", "1"], ["100", "2"]],
    asks: [["20", "3"], ["9", "4"]],
  });

  assert.deepEqual(book.snapshot(), {
    bids: [{ price: "100", qty: "2" }, { price: "99", qty: "1" }],
    asks: [{ price: "9", qty: "4" }, { price: "20", qty: "3" }],
  });
});

test("reads reflect the latest diff (no stale cached view)", () => {
  const book = seededBook(); // bids 100.5(2), 100.4(1); asks 101.0(3); lastUpdateId 42
  // prime the read path first, so a cache (if any) is populated
  assert.deepEqual(book.bestBid(), { price: "100.5", qty: "2" });
  assert.equal(book.topN("bids", 5).length, 2);

  // add a higher bid and remove the old best in one diff (continuation: U == 42)
  book.applyDiff(diff({ U: 42, u: 43, b: [["100.9", "7"], ["100.5", "0"]] }));

  assert.deepEqual(book.bestBid(), { price: "100.9", qty: "7" }, "best reflects the new level");
  assert.deepEqual(book.topN("bids", 5), [
    { price: "100.9", qty: "7" },
    { price: "100.4", qty: "1" },
  ]);
});

test("applyDiff applies an overlapping diff (U < lastUpdateId < u)", () => {
  const book = seededBook(); // lastUpdateId 42
  book.applyDiff(diff({ U: 40, u: 44, b: [["100.5", "9"]] })); // overlaps 40..42, extends to 44
  assert.equal(book.lastUpdateId, 44n);
  assert.equal(book.bids.get("100.5"), "9");
});

test("applyDiff applies consecutive in-sequence diffs", () => {
  const book = seededBook(); // lastUpdateId 42
  book.applyDiff(diff({ U: 42, u: 45, b: [["100.6", "1"]] })); // continuation from 42, advances to 45
  book.applyDiff(diff({ U: 45, u: 47, a: [["101.5", "2"]] })); // continuation from 45, advances to 47
  assert.equal(book.lastUpdateId, 47n);
  assert.equal(book.bids.get("100.6"), "1");
  assert.equal(book.asks.get("101.5"), "2");
});

test("applySnapshot/applyDiff throw on ids beyond safe-integer range", () => {
  const book = new OrderBook();
  assert.throws(
    () => book.applySnapshot({ lastUpdateId: Number.MAX_SAFE_INTEGER + 1, bids: [], asks: [] }),
    SdkError,
  );
  book.applySnapshot({ lastUpdateId: 1, bids: [], asks: [] });
  assert.throws(() => book.applyDiff(diff({ U: 1, u: Number.MAX_SAFE_INTEGER + 1 })), SdkError);
});

test("topN returns [] for n <= 0", () => {
  const book = new OrderBook();
  book.applySnapshot({ lastUpdateId: 1, bids: [["100", "1"], ["99", "2"]], asks: [] });
  assert.deepEqual(book.topN("bids", 0), []);
  assert.deepEqual(book.topN("bids", -1), []);
});

test("canonicalizes price keys so one price can't split into two levels", () => {
  const book = new OrderBook();
  book.applySnapshot({ lastUpdateId: 1, bids: [["0.50", "2"]], asks: [] });
  book.applyDiff(diff({ U: 1, u: 2, b: [["0.5", "9"]] })); // same level as "0.50", different spelling

  assert.equal(book.topN("bids", 5).length, 1, "no duplicate level from a different spelling");
  assert.equal(book.bids.get("0.5"), "9", "exposed key is canonical, quantity updated in place");

  // A "0" in yet another spelling must clear that single level — the divergence bug this prevents.
  book.applyDiff(diff({ U: 2, u: 3, b: [["0.500", "0"]] }));
  assert.equal(book.topN("bids", 5).length, 0, '"0" removal clears the level regardless of spelling');
});

test("accepts bigint ids beyond safe-integer range (lossless-parse path)", () => {
  const book = new OrderBook();
  const big = BigInt(Number.MAX_SAFE_INTEGER) + 10n; // past 2^53 — a number can't hold this exactly
  book.applySnapshot({ lastUpdateId: big, bids: [["1", "1"]], asks: [] });
  assert.equal(book.lastUpdateId, big, "bigint snapshot id preserved");

  book.applyDiff(diff({ U: big, u: big + 2n, b: [["1", "2"]] })); // continuation shares boundary id
  assert.equal(book.lastUpdateId, big + 2n, "bigint diff ids applied without rounding");
  assert.equal(book.bids.get("1"), "2");
});

test("orders prices beyond float precision exactly (not via Number)", () => {
  const book = new OrderBook();
  // 17 significant digits: two distinct prices that collapse to the SAME double, so a
  // Number()-based comparator can't tell them apart, let alone order them.
  const lo = "1.00000000000000001";
  const hi = "1.00000000000000002";
  book.applySnapshot({ lastUpdateId: 1, bids: [[lo, "1"], [hi, "2"]], asks: [] });

  assert.deepEqual(book.bestBid(), { price: hi, qty: "2" }, "higher price is best bid");
  assert.deepEqual(book.topN("bids", 2), [
    { price: hi, qty: "2" },
    { price: lo, qty: "1" },
  ]);
});

test("a malformed quantity throws and leaves the book untouched", () => {
  const book = seededBook(); // 100.4 -> "1", lastUpdateId 42
  assert.throws(() => book.applyDiff(diff({ U: 42, u: 43, b: [["100.4", "NaN"]] })), SdkError);
  assert.equal(book.bids.get("100.4"), "1", "level unchanged — validated before mutating");
  assert.equal(book.lastUpdateId, 42n, "sequence not advanced past a bad diff");
});

test("a malformed price throws and does not enter the book", () => {
  const book = new OrderBook();
  book.applySnapshot({ lastUpdateId: 1, bids: [["100", "2"]], asks: [] });
  assert.throws(() => book.applyDiff(diff({ U: 1, u: 2, b: [["abc", "5"]] })), SdkError);
  assert.deepEqual(book.bestBid(), { price: "100", qty: "2" });
  assert.equal(book.lastUpdateId, 1n);
});

test("a non-string level element is rejected before any mutation (atomic)", () => {
  const book = new OrderBook();
  book.applySnapshot({ lastUpdateId: 1, bids: [["100.5", "2"]], asks: [] });
  // Frames are untrusted: a level of JSON numbers (not strings) would coerce through the regex
  // and then throw mid-mutation in normalizePrice. Validation must reject it before the good
  // first level is applied — otherwise the book is left partially changed.
  const bad = diff({ U: 2, u: 2, b: [["100.5", "9"], [1, 2]] as unknown as string[][] });
  assert.throws(() => book.applyDiff(bad), SdkError);
  assert.equal(book.bids.get("100.5"), "2", "first level not applied — validation is atomic");
  assert.equal(book.lastUpdateId, 1n, "sequence not advanced");
});

test("a string masquerading as a level is rejected (not read as [char, char])", () => {
  const book = new OrderBook();
  book.applySnapshot({ lastUpdateId: 1, bids: [["100.5", "2"]], asks: [] });
  // "12" is iterable with .length === 2, so a length/destructure-only check would read it as
  // price "1", qty "2". It must be rejected — a level has to be a real array.
  const bad = diff({ U: 2, u: 2, b: ["12"] as unknown as string[][] });
  assert.throws(() => book.applyDiff(bad), SdkError);
  assert.equal(book.bids.get("100.5"), "2", "book untouched");
});

test("applySnapshot rejects a non-string level atomically (prior book left intact)", () => {
  const book = new OrderBook();
  book.applySnapshot({ lastUpdateId: 1, bids: [["100", "2"]], asks: [] });
  // A replacement snapshot with a good level then numeric elements must be rejected BEFORE the
  // book is cleared — otherwise it wipes a good book and applies part of a bad one, then throws.
  assert.throws(
    () => book.applySnapshot({ lastUpdateId: 2, bids: [["99", "5"], [1, 2]] as unknown as string[][], asks: [] }),
    SdkError,
  );
  assert.deepEqual(book.bestBid(), { price: "100", qty: "2" }, "prior book intact — validated before clearing");
  assert.equal(book.lastUpdateId, 1n, "id not advanced");
});

test("a malformed diff does not advance the sequence, so the next diff resyncs", () => {
  const book = seededBook(); // lastUpdateId 42
  assert.throws(() => book.applyDiff(diff({ U: 42, u: 43, b: [["100.5", "NaN"]] })), SdkError);
  assert.equal(book.lastUpdateId, 42n, "bad diff rejected, id unchanged");
  // The bad diff never advanced past 42; the next frame's U (43) now skips the boundary → gap,
  // so a dropped update can't persist silently.
  assert.throws(() => book.applyDiff(diff({ U: 43, u: 43, b: [["100.5", "9"]] })), ResyncRequiredError);
});

test("applySnapshot drops zero levels", () => {
  const book = new OrderBook();
  book.applySnapshot({ lastUpdateId: 1, bids: [["100", "0"], ["98", "5"]], asks: [] });
  assert.equal(book.topN("bids", 5).length, 1, "zero level dropped");
  assert.deepEqual(book.bestBid(), { price: "98", qty: "5" });
});

test("applySnapshot throws on a malformed level and leaves the prior book intact", () => {
  const book = new OrderBook();
  book.applySnapshot({ lastUpdateId: 1, bids: [["100", "2"]], asks: [] });
  assert.throws(
    () => book.applySnapshot({ lastUpdateId: 2, bids: [["99", "NaN"]], asks: [] }),
    SdkError,
  );
  assert.deepEqual(book.bestBid(), { price: "100", qty: "2" }, "prior book intact — validated before clearing");
});
