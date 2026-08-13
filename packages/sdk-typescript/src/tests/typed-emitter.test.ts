import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { TypedEmitter } from "../core/typed-emitter.js";

type Events = { x: (v: number) => void; y: () => void };

describe("TypedEmitter", () => {
  test("on() fires on every emit", () => {
    const ee = new TypedEmitter<Events>();
    const calls: number[] = [];
    ee.on("x", (v) => calls.push(v));
    ee.emit("x", 1);
    ee.emit("x", 2);
    assert.deepStrictEqual(calls, [1, 2]);
  });

  test("once() fires only on first emit", () => {
    const ee = new TypedEmitter<Events>();
    const calls: number[] = [];
    ee.once("x", (v) => calls.push(v));
    ee.emit("x", 1);
    ee.emit("x", 2);
    assert.deepStrictEqual(calls, [1]);
    assert.equal(ee.listenerCount("x"), 0);
  });

  test("off() removes the most recent registration (Node semantics)", () => {
    const ee = new TypedEmitter<Events>();
    const calls: number[] = [];
    const fn = (v: number) => calls.push(v);
    ee.on("x", fn);
    ee.on("x", fn);
    ee.off("x", fn); // removes the second (most recent)
    ee.emit("x", 1);
    assert.deepStrictEqual(calls, [1]); // first registration still fires
  });

  // The exact bug scenario: once("x", fn); on("x", fn)
  // The once wrapper must remove itself, not the later on() registration.
  test("once before on with same fn: once self-removes, on survives", () => {
    const ee = new TypedEmitter<Events>();
    const calls: number[] = [];
    const fn = (v: number) => calls.push(v);
    ee.once("x", fn); // registration 0: once wrapper
    ee.on("x", fn);   // registration 1: direct

    // First emit: both fire (once + on), once removes itself
    ee.emit("x", 1);
    assert.deepStrictEqual(calls, [1, 1]);
    assert.equal(ee.listenerCount("x"), 1); // only the on() remains

    // Second emit: only the on() fires
    calls.length = 0;
    ee.emit("x", 2);
    assert.deepStrictEqual(calls, [2]);
  });

  // Reverse order: on("x", fn); once("x", fn)
  test("on before once with same fn: once self-removes, on survives", () => {
    const ee = new TypedEmitter<Events>();
    const calls: number[] = [];
    const fn = (v: number) => calls.push(v);
    ee.on("x", fn);   // registration 0: direct
    ee.once("x", fn); // registration 1: once wrapper

    // First emit: both fire, once removes itself
    ee.emit("x", 1);
    assert.deepStrictEqual(calls, [1, 1]);
    assert.equal(ee.listenerCount("x"), 1);

    // Second emit: only the on() fires
    calls.length = 0;
    ee.emit("x", 2);
    assert.deepStrictEqual(calls, [2]);
  });

  // off() with mixed on/once: removes the most recent match by original fn
  test("on then once then off: off removes the once (most recent)", () => {
    const ee = new TypedEmitter<Events>();
    const calls: number[] = [];
    const fn = (v: number) => calls.push(v);
    ee.on("x", fn);
    ee.once("x", fn);
    ee.off("x", fn); // removes the once (most recent registration for fn)
    assert.equal(ee.listenerCount("x"), 1);

    ee.emit("x", 1);
    ee.emit("x", 2);
    assert.deepStrictEqual(calls, [1, 2]); // on() persists
  });

  test("once then on then off: off removes the on (most recent)", () => {
    const ee = new TypedEmitter<Events>();
    const calls: number[] = [];
    const fn = (v: number) => calls.push(v);
    ee.once("x", fn);
    ee.on("x", fn);
    ee.off("x", fn); // removes the on (most recent registration for fn)
    assert.equal(ee.listenerCount("x"), 1);

    // once fires and self-removes
    ee.emit("x", 1);
    assert.deepStrictEqual(calls, [1]);
    assert.equal(ee.listenerCount("x"), 0);
  });

  test("removeAllListeners clears a specific event", () => {
    const ee = new TypedEmitter<Events>();
    ee.on("x", () => {});
    ee.on("y", () => {});
    ee.removeAllListeners("x");
    assert.equal(ee.listenerCount("x"), 0);
    assert.equal(ee.listenerCount("y"), 1);
  });

  test("removeAllListeners with no arg clears all events", () => {
    const ee = new TypedEmitter<Events>();
    ee.on("x", () => {});
    ee.on("y", () => {});
    ee.removeAllListeners();
    assert.deepStrictEqual(ee.eventNames(), []);
  });

  test("eventNames returns only events with listeners", () => {
    const ee = new TypedEmitter<Events>();
    const fn = () => {};
    ee.on("x", fn);
    assert.deepStrictEqual(ee.eventNames(), ["x"]);
    ee.off("x", fn);
    assert.deepStrictEqual(ee.eventNames(), []);
  });

  test("addListener and removeListener are aliases", () => {
    const ee = new TypedEmitter<Events>();
    const calls: number[] = [];
    const fn = (v: number) => calls.push(v);
    ee.addListener("x", fn);
    ee.emit("x", 1);
    ee.removeListener("x", fn);
    ee.emit("x", 2);
    assert.deepStrictEqual(calls, [1]);
  });
});
