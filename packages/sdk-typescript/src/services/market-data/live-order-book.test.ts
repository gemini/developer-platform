import test from "node:test";
import assert from "node:assert/strict";

import { OrderBook as LiveOrderBook } from "./orderbook.js";
import { SdkError } from "../../errors.js";
import type { BookDelta } from "../../types/client.js";
import type { DepthUpdate } from "../../websocket/types.js";

// A depth frame. The facade routes the fresh snapshot (first frame after a (re)subscribe ack) to
// applySnapshot(), and every other frame to ingest(). A snapshot may cover a U..u range; a diff
// need not have equal endpoints either.
function frame(over: Partial<DepthUpdate>): DepthUpdate {
  return { e: "depthUpdate", E: 0, s: "btcusd", U: 0, u: 0, b: [], a: [], ...over };
}

test("applySnapshot builds the book, goes live, and 'update' passes the book + full-book delta", () => {
  const book = new LiveOrderBook("btcusd");
  const updates: Array<{ b: unknown; delta: BookDelta }> = [];
  book.on("update", (b, delta) => updates.push({ b, delta }));

  book.applySnapshot(frame({ U: 100, u: 100, b: [["0.60", "5"], ["0.59", "3"]], a: [["0.61", "2"]] }));

  assert.equal(updates.length, 1);
  assert.equal(updates[0].b, book, "'update' passes the emitting LiveOrderBook (public contract)");
  assert.deepEqual(book.bestBid(), { price: "0.6", qty: "5" });
  assert.deepEqual(book.bestAsk(), { price: "0.61", qty: "2" });
  assert.deepEqual(updates[0].delta, {
    bids: [{ price: "0.6", qty: "5" }, { price: "0.59", qty: "3" }],
    asks: [{ price: "0.61", qty: "2" }],
  });
});

test("a diff after the snapshot applies and 'update' carries only the changed levels", () => {
  const book = new LiveOrderBook("btcusd");
  book.applySnapshot(frame({ U: 100, u: 100, b: [["0.60", "5"]], a: [["0.61", "2"]] }));

  const deltas: BookDelta[] = [];
  book.on("update", (_b, d) => deltas.push(d));
  book.ingest(frame({ U: 100, u: 101, b: [["0.60", "7"]], a: [] }));

  assert.equal(deltas.length, 1);
  assert.deepEqual(deltas[0], { bids: [{ price: "0.6", qty: "7" }], asks: [] });
  assert.deepEqual(book.bestBid(), { price: "0.6", qty: "7" });
});

test("an ask-only diff updates the ask side and the delta carries the changed asks", () => {
  const book = new LiveOrderBook("btcusd");
  book.applySnapshot(frame({ U: 100, u: 100, b: [["0.60", "5"]], a: [["0.61", "2"], ["0.62", "9"]] }));

  const deltas: BookDelta[] = [];
  book.on("update", (_b, d) => deltas.push(d));
  book.ingest(frame({ U: 100, u: 101, b: [], a: [["0.61", "4"], ["0.62", "0"]] })); // reprice + remove

  assert.equal(deltas.length, 1);
  assert.deepEqual(
    deltas[0],
    { bids: [], asks: [{ price: "0.61", qty: "4" }, { price: "0.62", qty: "0" }] },
    "ask deltas canonicalized, removal (qty 0) preserved",
  );
  assert.deepEqual(book.bestAsk(), { price: "0.61", qty: "4" });
  assert.deepEqual(book.topN("asks", 5), [{ price: "0.61", qty: "4" }], "0.62 removed from the book");
});

test("a sequence gap emits 'resync', goes stale, drops stray frames, and rebuilds via applySnapshot", () => {
  const book = new LiveOrderBook("btcusd");
  book.applySnapshot(frame({ U: 100, u: 100, b: [["0.60", "5"]], a: [["0.61", "2"]] }));

  let resyncs = 0;
  const updates: BookDelta[] = [];
  book.on("resync", () => resyncs++);
  book.on("update", (_b, d) => updates.push(d));

  book.ingest(frame({ U: 105, u: 105, b: [["0.60", "9"]], a: [] })); // U skips ahead → gap
  assert.equal(resyncs, 1);
  assert.equal(updates.length, 0);
  assert.equal(book.bestBid(), undefined, "stale");

  // A stray queued diff — even one with U == u — arriving while stale is dropped by ingest (not live),
  // so it can never be mistaken for the recovery snapshot.
  book.ingest(frame({ U: 106, u: 106, b: [["9.99", "1"]], a: [] }));
  assert.equal(updates.length, 0, "stray frame discarded");
  assert.equal(book.bestBid(), undefined, "still stale");

  // The facade (post-resubscribe-ack) designates the fresh snapshot; it REPLACES the old book.
  book.applySnapshot(frame({ U: 200, u: 200, b: [["0.70", "1"]], a: [["0.71", "1"]] }));
  assert.equal(updates.length, 1);
  const recovered = { bids: [{ price: "0.7", qty: "1" }], asks: [{ price: "0.71", qty: "1" }] };
  assert.deepEqual(book.snapshot(), recovered, "recovered book is the new snapshot only — no stale levels");
  assert.deepEqual(updates[0], recovered, "recovery 'update' carries the full new book, not a merge");
});

test("markStale() (reconnect) goes stale; applySnapshot rebuilds", () => {
  const book = new LiveOrderBook("btcusd");
  book.applySnapshot(
    frame({ U: 100, u: 100, b: [["0.60", "5"], ["0.59", "4"]], a: [["0.61", "3"]] }),
  );

  let resyncs = 0;
  const updates: BookDelta[] = [];
  book.on("resync", () => resyncs++);
  book.on("update", (_b, d) => updates.push(d));

  book.markStale();
  assert.equal(resyncs, 1);
  assert.equal(book.bestBid(), undefined, "stale after markStale");

  book.applySnapshot(frame({ U: 200, u: 200, b: [["0.70", "9"]], a: [["0.71", "2"]] }));
  assert.equal(updates.length, 1);
  assert.deepEqual(
    book.snapshot(),
    { bids: [{ price: "0.7", qty: "9" }], asks: [{ price: "0.71", qty: "2" }] },
    "the reconnect snapshot replaces every old level",
  );
});

test("a stale diff (u <= lastUpdateId) is dropped and emits no 'update'", () => {
  const book = new LiveOrderBook("btcusd");
  book.applySnapshot(frame({ U: 100, u: 100, b: [["0.60", "5"]], a: [] }));
  book.ingest(frame({ U: 100, u: 102, b: [["0.60", "9"]], a: [] })); // -> lastU 102

  const updates: BookDelta[] = [];
  book.on("update", (_b, d) => updates.push(d));
  book.ingest(frame({ U: 100, u: 101, b: [["0.60", "5"]], a: [] })); // stale duplicate

  assert.equal(updates.length, 0, "a stale, dropped diff must not emit a delta");
  assert.deepEqual(book.bestBid(), { price: "0.6", qty: "9" }, "book unchanged — still at the u=102 state");
});

test("a malformed level on a live book surfaces an 'error', goes stale, and recovers", () => {
  const book = new LiveOrderBook("btcusd");
  book.applySnapshot(frame({ U: 100, u: 100, b: [["0.60", "5"]], a: [["0.61", "2"]] }));

  const errors: unknown[] = [];
  let resyncs = 0;
  book.on("error", (e) => errors.push(e));
  book.on("resync", () => resyncs++);

  book.ingest(frame({ U: 100, u: 101, b: [["not-a-price", "1"]], a: [] }));

  assert.equal(errors.length, 1, "a malformed level surfaces exactly one 'error'");
  assert.ok(errors[0] instanceof SdkError);
  assert.equal(resyncs, 1, "a rejected diff marks the book stale");
  assert.equal(book.bestBid(), undefined, "stale until it rebuilds");

  book.applySnapshot(frame({ U: 200, u: 200, b: [["0.70", "9"]], a: [] }));
  assert.deepEqual(book.bestBid(), { price: "0.7", qty: "9" });
});

test("a malformed level does not crash when no 'error' listener is attached", () => {
  const book = new LiveOrderBook("btcusd");
  book.applySnapshot(frame({ U: 100, u: 100, b: [["0.60", "5"]], a: [] }));

  assert.doesNotThrow(() => book.ingest(frame({ U: 100, u: 101, b: [["x", "1"]], a: [] })));
  assert.equal(book.bestBid(), undefined, "went stale, not live-and-wrong");
});

test("a malformed snapshot surfaces 'error' + 'resync' and recovers on a valid one", () => {
  const book = new LiveOrderBook("btcusd");
  const errors: unknown[] = [];
  let resyncs = 0;
  const updates: BookDelta[] = [];
  book.on("error", (e) => errors.push(e));
  book.on("resync", () => resyncs++);
  book.on("update", (_b, d) => updates.push(d));

  book.applySnapshot(frame({ U: 100, u: 100, b: [["not-a-price", "1"]], a: [] })); // bad snapshot
  assert.equal(errors.length, 1);
  assert.ok(errors[0] instanceof SdkError);
  assert.equal(resyncs, 1, "a rejected snapshot signals resync so the facade resubscribes");
  assert.equal(updates.length, 0);
  assert.equal(book.bestBid(), undefined, "never went live");

  book.applySnapshot(frame({ U: 200, u: 200, b: [["0.70", "1"]], a: [["0.71", "2"]] }));
  assert.equal(updates.length, 1);
  assert.deepEqual(book.bestBid(), { price: "0.7", qty: "1" });
});

test("applySnapshot accepts a snapshot range and rejects a reversed range", () => {
  const book = new LiveOrderBook("btcusd");
  const errors: unknown[] = [];
  const updates: BookDelta[] = [];
  book.on("error", (e) => errors.push(e));
  book.on("update", (_b, d) => updates.push(d));

  book.applySnapshot(frame({ U: 10, u: 11, b: [["0.60", "5"]], a: [] }));
  assert.equal(errors.length, 0);
  assert.equal(updates.length, 1);
  assert.equal(book.lastUpdateId, 11n, "snapshot advances to the range's last update id");
  assert.deepEqual(book.bestBid(), { price: "0.6", qty: "5" });

  book.applySnapshot(frame({ U: 12, u: 11, b: [["0.70", "9"]], a: [] }));
  assert.equal(errors.length, 1);
  assert.ok(errors[0] instanceof SdkError);
  assert.equal(updates.length, 1, "reversed range does not emit an update");
  assert.equal(book.lastUpdateId, 11n, "reversed range does not advance the sequence");
  assert.equal(book.bestBid(), undefined, "reversed range marks the book stale");

  book.applySnapshot(frame({ U: 20, u: 20, b: [["0.60", "5"]], a: [["0.61", "2"]] }));
  assert.equal(updates.length, 2);
  assert.deepEqual(book.bestBid(), { price: "0.6", qty: "5" });
});

test("a diff removing a level (qty 0) updates the book and the delta preserves the removal", () => {
  const book = new LiveOrderBook("btcusd");
  book.applySnapshot(frame({ U: 100, u: 100, b: [["0.60", "5"], ["0.59", "3"]], a: [] }));

  const deltas: BookDelta[] = [];
  book.on("update", (_b, d) => deltas.push(d));
  book.ingest(frame({ U: 100, u: 101, b: [["0.60", "0"]], a: [] })); // remove the top bid

  assert.equal(deltas.length, 1);
  assert.deepEqual(deltas[0], { bids: [{ price: "0.6", qty: "0" }], asks: [] }, "delta preserves the qty:0 removal");
  assert.deepEqual(book.bestBid(), { price: "0.59", qty: "3" }, "removed level gone; next-best is now top");
});

test("all reads are empty until live, then reflect the book", () => {
  const book = new LiveOrderBook("btcusd");
  assert.deepEqual(book.topN("bids", 5), []);
  assert.equal(book.spread(), undefined);
  assert.equal(book.mid(), undefined);
  assert.deepEqual(book.snapshot(), { bids: [], asks: [] });

  book.applySnapshot(frame({ U: 1, u: 1, b: [["0.60", "5"]], a: [["0.62", "2"]] }));

  assert.deepEqual(book.topN("bids", 5), [{ price: "0.6", qty: "5" }]);
  assert.ok(Math.abs(book.spread()! - 0.02) < 1e-9);
  assert.ok(Math.abs(book.mid()! - 0.61) < 1e-9);
  assert.deepEqual(book.snapshot(), {
    bids: [{ price: "0.6", qty: "5" }],
    asks: [{ price: "0.62", qty: "2" }],
  });
});

test("off() removes exactly one registration; close() removes the rest", () => {
  const book = new LiveOrderBook("btcusd");
  let n = 0;
  const cb = (): void => {
    n++;
  };
  book.on("update", cb); // register the SAME cb twice
  book.on("update", cb);

  book.applySnapshot(frame({ U: 1, u: 1, b: [["0.6", "1"]], a: [] }));
  assert.equal(n, 2, "registered twice → fires twice");

  book.off("update", cb); // must remove exactly ONE (EventEmitter semantics)
  book.ingest(frame({ U: 1, u: 2, b: [["0.6", "1"]], a: [] }));
  assert.equal(n, 3, "one registration remains after a single off()");

  book.close();
  book.ingest(frame({ U: 2, u: 3, b: [["0.6", "1"]], a: [] }));
  assert.equal(n, 3, "close() removed the rest");
});

test("a listener bound with an AbortSignal is removed when the signal aborts", () => {
  const book = new LiveOrderBook("btcusd");
  const ac = new AbortController();
  let n = 0;
  book.on("update", () => n++, { signal: ac.signal });

  book.applySnapshot(frame({ U: 1, u: 1, b: [["0.6", "1"]], a: [] }));
  assert.equal(n, 1);

  ac.abort();
  book.ingest(frame({ U: 1, u: 2, b: [["0.6", "1"]], a: [] }));
  assert.equal(n, 1, "aborting the signal removed the listener");
});

test("a listener whose AbortSignal is already aborted is never registered", () => {
  const book = new LiveOrderBook("btcusd");
  const ac = new AbortController();
  ac.abort();

  let n = 0;
  book.on("update", () => n++, { signal: ac.signal });
  book.applySnapshot(frame({ U: 1, u: 1, b: [["0.6", "1"]], a: [] }));

  assert.equal(n, 0, "an already-aborted signal must not register the listener");
});

test("the same callback under two signals: aborting one removes only that registration", () => {
  const book = new LiveOrderBook("btcusd");
  const a = new AbortController();
  const b = new AbortController();
  let n = 0;
  const cb = (): void => {
    n++;
  };
  book.on("update", cb, { signal: a.signal });
  book.on("update", cb, { signal: b.signal });

  book.applySnapshot(frame({ U: 1, u: 1, b: [["0.6", "1"]], a: [] }));
  assert.equal(n, 2, "registered twice → fires twice");

  a.abort(); // removes exactly A's registration, leaving B
  book.ingest(frame({ U: 1, u: 2, b: [["0.6", "1"]], a: [] }));
  assert.equal(n, 3, "aborting A leaves B active (not the other way around)");

  b.abort();
  book.ingest(frame({ U: 2, u: 3, b: [["0.6", "1"]], a: [] }));
  assert.equal(n, 3, "aborting B removes the last registration");
});

test("resync is emitted once per stale period and re-arms after a recovery", () => {
  const book = new LiveOrderBook("btcusd");
  book.applySnapshot(frame({ U: 100, u: 100, b: [["0.60", "5"]], a: [] }));
  let resyncs = 0;
  book.on("resync", () => resyncs++);

  book.ingest(frame({ U: 105, u: 105, b: [["0.60", "9"]], a: [] })); // gap → resync #1
  assert.equal(resyncs, 1);
  book.markStale(); // a second stale trigger in the same period must NOT re-emit
  assert.equal(resyncs, 1, "no duplicate resync within one stale period");

  book.applySnapshot(frame({ U: 200, u: 200, b: [["0.70", "1"]], a: [] })); // recover
  book.ingest(frame({ U: 205, u: 205, b: [["0.70", "9"]], a: [] })); // later gap → resync #2
  assert.equal(resyncs, 2, "resync re-arms after a successful snapshot");
});

test("a throwing 'update' listener propagates and does not stale the book", () => {
  const book = new LiveOrderBook("btcusd");
  let resyncs = 0;
  book.on("resync", () => resyncs++);
  book.on("update", () => {
    throw new Error("consumer boom");
  });

  // The 'update' emit is outside the protocol try/catch, so a throwing consumer listener must
  // propagate to the caller — not be swallowed as a malformed frame (which would falsely resync).
  assert.throws(() => book.applySnapshot(frame({ U: 1, u: 1, b: [["0.6", "1"]], a: [] })), /consumer boom/);
  assert.equal(resyncs, 0, "a throwing update listener must not trigger resync");
  assert.deepEqual(book.bestBid(), { price: "0.6", qty: "1" }, "book stayed live");
});

test("close() is permanent — a queued snapshot/diff after teardown can't revive the book", () => {
  const book = new LiveOrderBook("btcusd");
  book.close();

  book.applySnapshot(frame({ U: 1, u: 1, b: [["0.6", "1"]], a: [] })); // queued snapshot after close
  assert.equal(book.bestBid(), undefined, "closed book stays dark");
  assert.deepEqual(book.snapshot(), { bids: [], asks: [] });

  book.ingest(frame({ U: 2, u: 3, b: [["0.7", "1"]], a: [] }));
  assert.equal(book.bestBid(), undefined, "still dark");
});

test("a frame missing b/a surfaces an SdkError, not a raw TypeError", () => {
  const book = new LiveOrderBook("btcusd");
  book.applySnapshot(frame({ U: 1, u: 1, b: [["0.6", "1"]], a: [] }));

  const errors: unknown[] = [];
  book.on("error", (e) => errors.push(e));
  book.ingest({ e: "depthUpdate", E: 1, s: "btcusd", U: 1, u: 2 }); // no b/a

  assert.equal(errors.length, 1);
  assert.ok(errors[0] instanceof SdkError, "raw errors are wrapped as SdkError");
});

test("bigint sequence ids (past 2^53) drive gap detection", () => {
  const book = new LiveOrderBook("btcusd");
  const big = 9007199254740993n; // > Number.MAX_SAFE_INTEGER
  book.applySnapshot(frame({ U: big, u: big, b: [["0.6", "1"]], a: [] }));

  const updates: BookDelta[] = [];
  let resyncs = 0;
  book.on("update", (_b, d) => updates.push(d));
  book.on("resync", () => resyncs++);

  book.ingest(frame({ U: big, u: big + 1n, b: [["0.6", "2"]], a: [] }));
  assert.equal(updates.length, 1);
  assert.equal(resyncs, 0);

  book.ingest(frame({ U: big + 5n, u: big + 5n, b: [["0.6", "3"]], a: [] })); // gap
  assert.equal(resyncs, 1);
});
