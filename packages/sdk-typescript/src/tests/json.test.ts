import test from "node:test";
import assert from "node:assert/strict";

import { SdkError } from "../errors.js";
import {
  normalizeInt64Paths,
  parseLosslessJson,
  validateInt64RequestPaths,
  type Int64Path,
} from "../json.js";

const obj = (text: string): Record<string, unknown> =>
  parseLosslessJson(text) as Record<string, unknown>;

test("large integer beyond safe range becomes an exact bigint", () => {
  const r = obj('{"u":9007199254740993}');
  assert.equal(typeof r.u, "bigint");
  assert.equal(r.u, 9007199254740993n);
});

test("19-digit E-style timestamp is preserved exactly as bigint", () => {
  const r = obj('{"E":1700000000123456789}');
  assert.equal(typeof r.E, "bigint");
  assert.equal(r.E, 1700000000123456789n);
});

test("negative large integer becomes bigint", () => {
  const r = obj('{"n":-9007199254740993}');
  assert.equal(typeof r.n, "bigint");
  assert.equal(r.n, -9007199254740993n);
});

test("MAX_SAFE_INTEGER stays a number (boundary)", () => {
  const r = obj('{"n":9007199254740991}');
  assert.equal(typeof r.n, "number");
  assert.equal(r.n, 9007199254740991);
});

test("MAX_SAFE_INTEGER + 2 crosses to bigint (boundary)", () => {
  const r = obj('{"n":9007199254740993}');
  assert.equal(typeof r.n, "bigint");
});

test("small integers and zero stay numbers", () => {
  const r = obj('{"a":0,"b":42,"c":-7}');
  assert.equal(r.a, 0);
  assert.equal(r.b, 42);
  assert.equal(r.c, -7);
  assert.equal(typeof r.b, "number");
});

test("decimals stay numbers (not integers, never bigint)", () => {
  const r = obj('{"p":1.5,"q":0.0000001}');
  assert.equal(typeof r.p, "number");
  assert.equal(r.p, 1.5);
  assert.equal(typeof r.q, "number");
  assert.equal(r.q, 0.0000001);
});

test("exponent-form numbers stay numbers (not integer literals)", () => {
  const r = obj('{"n":1e21}');
  assert.equal(typeof r.n, "number");
  assert.equal(r.n, 1e21);
});

test("numeric-looking strings (prices) are left untouched", () => {
  const r = obj('{"price":"0.26","qty":"9007199254740993"}');
  assert.equal(r.price, "0.26");
  assert.equal(r.qty, "9007199254740993");
  assert.equal(typeof r.qty, "string");
});

test("a depth-frame shape: ids become bigint, prices stay strings", () => {
  // U/u here are deliberately above 2^53 to exercise preservation of large ids.
  const r = obj(
    '{"U":9007199254740993,"u":9007199254740999,"E":1700000000123456789,' +
      '"b":[["0.26","1500"],["0.25","0"]],"a":[["0.27","800"]]}',
  );
  assert.equal(typeof r.U, "bigint");
  assert.equal(typeof r.u, "bigint");
  assert.equal(typeof r.E, "bigint");
  assert.deepEqual(r.b, [
    ["0.26", "1500"],
    ["0.25", "0"],
  ]);
  assert.deepEqual(r.a, [["0.27", "800"]]);
});

test("large integer inside an array is preserved", () => {
  const r = parseLosslessJson("[1, 9007199254740993, 3]") as unknown[];
  assert.equal(r[0], 1);
  assert.equal(typeof r[1], "bigint");
  assert.equal(r[1], 9007199254740993n);
});

test("regression: plain JSON.parse loses precision where this does not", () => {
  const text = '{"u":9007199254740993}';
  // Plain parse silently rounds to 2^53 — the bug this exists to prevent.
  assert.equal((JSON.parse(text) as { u: number }).u, 9007199254740992);
  // Lossless parse keeps every digit.
  assert.equal(obj(text).u, 9007199254740993n);
});

test("normalizes only int64 leaves selected by schema paths", () => {
  const value = {
    orderId: 12345678,
    count: 4,
    unrealizedPct: 23.81,
    price: "0.65",
    results: [
      { order: { orderId: 9007199254740993n } },
      { orderId: 42 },
    ],
  };
  const paths: readonly Int64Path[] = [
    ["orderId"],
    ["results", "*", "order", "orderId"],
    ["results", "*", "orderId"],
  ];

  const normalized = normalizeInt64Paths(value, paths);

  assert.deepEqual(normalized, {
    orderId: 12345678n,
    count: 4,
    unrealizedPct: 23.81,
    price: "0.65",
    results: [
      { order: { orderId: 9007199254740993n } },
      { orderId: 42n },
    ],
  });
});

test("leaves missing optional paths and nullable ancestors unchanged", () => {
  const value = { missing: {}, nullable: null };

  assert.deepEqual(
    normalizeInt64Paths(value, [["missing", "orderId"], ["nullable", "orderId"]]),
    value,
  );
});

test("preserves null at an int64 response leaf", () => {
  assert.deepEqual(
    normalizeInt64Paths({ orderId: null }, [["orderId"]]),
    { orderId: null },
  );
});

test("rejects a fractional number at an int64 leaf with its path", () => {
  assert.throws(
    () =>
      normalizeInt64Paths(
        { results: [{ orderId: 4.2 }] },
        [["results", "*", "orderId"]],
      ),
    (error) =>
      error instanceof SdkError &&
      error.message === "expected int64 at results[0].orderId",
  );
});

test("normalizes numeric strings at int64 leaves", () => {
  assert.deepEqual(
    normalizeInt64Paths({ orderId: "42" }, [["orderId"]]),
    { orderId: 42n },
  );
});

test("accepts safe request numbers and schema-approved numeric strings", () => {
  const value = { orderId: Number.MAX_SAFE_INTEGER, legacyId: "9007199254740993" };
  assert.doesNotThrow(() => validateInt64RequestPaths(
    value,
    [
      { path: ["orderId"] },
      { path: ["legacyId"], allowString: true },
    ],
    "trading.getOrderStatus",
  ));
  assert.deepEqual(value, { orderId: Number.MAX_SAFE_INTEGER, legacyId: "9007199254740993" });
});

test("rejects unsafe request numbers with stable validation metadata", () => {
  assert.throws(
    () => validateInt64RequestPaths(
      { orderId: Number.MAX_SAFE_INTEGER + 1 },
      [{ path: ["orderId"] }],
      "trading.getOrderStatus",
    ),
    (error) =>
      error instanceof SdkError &&
      error.name === "ValidationError" &&
      "operation" in error &&
      error.operation === "trading.getOrderStatus" &&
      "field" in error &&
      error.field === "orderId" &&
      "rule" in error &&
      error.rule === "safe-integer",
  );
});

test("enforces the unsigned int64 request range", () => {
  const max = 18446744073709551615n;
  assert.doesNotThrow(() => validateInt64RequestPaths(
    { orderId: max },
    [{ path: ["orderId"], unsigned: true }],
    "trading.getOrderStatus",
  ));

  for (const orderId of [-1n, max + 1n, -1]) {
    assert.throws(
      () => validateInt64RequestPaths(
        { orderId },
        [{ path: ["orderId"], unsigned: true }],
        "trading.getOrderStatus",
      ),
      (error) =>
        error instanceof SdkError &&
        error.name === "ValidationError" &&
        "operation" in error &&
        error.operation === "trading.getOrderStatus" &&
        "field" in error &&
        error.field === "orderId" &&
        "rule" in error &&
        error.rule === "unsigned-integer",
    );
  }
});
