import test from 'node:test';
import assert from 'node:assert/strict';
import JSONBig from 'json-bigint';

// Regression coverage for the precision-preserving JSON parser used by
// GeminiHttpClient. The Gemini API emits prediction-market `orderId` as
// a JSON number in the 17–18 digit range. Native JSON.parse truncates
// these to JS numbers (≤ 2^53 − 1, ≈ 16 digits), so the MCP would hand
// back a wrong ID. json-bigint with storeAsString:true keeps these
// values as strings.
const jsonParse = JSONBig({ storeAsString: true });

test('native JSON.parse truncates 18-digit orderId — confirms the bug exists', () => {
  // The literal `145828833218573125` cannot appear in a JS source comparison
  // because it's already truncated at parse time, which would be a tautology.
  // Compare via string serialization so the source-text expected value
  // bypasses JS number parsing.
  const truncated = JSON.parse('{"orderId": 145828833218573125}') as { orderId: number };
  assert.notStrictEqual(String(truncated.orderId), '145828833218573125');
  assert.strictEqual(String(truncated.orderId), '145828833218573120');
});

test('json-bigint storeAsString preserves an 18-digit orderId from prod', () => {
  const parsed = jsonParse.parse('{"orderId": 145828833218573125}') as { orderId: string };
  assert.strictEqual(parsed.orderId, '145828833218573125');
  assert.strictEqual(typeof parsed.orderId, 'string');
});

test('json-bigint preserves a 17-digit orderId from staging', () => {
  const parsed = jsonParse.parse('{"orderId": 73797746583641557}') as { orderId: string };
  assert.strictEqual(parsed.orderId, '73797746583641557');
});

test('json-bigint round-trips a full PredictionOrder fixture', () => {
  // Hand-crafted JSON text (NOT JSON.stringify of a JS object) so the
  // 18-digit orderId reaches the parser intact. Going through a JS number
  // literal would already truncate the value before the parser sees it —
  // which is precisely the bug under test.
  const apiResponse = `{
    "orderId": 145828833218573125,
    "hashOrderId": "q32bzGW6oEMA",
    "clientOrderId": "69ebd2e7-5cef-4e61-b21c-325b785a0aba",
    "globalOrderId": "145828833218573125",
    "status": "open",
    "symbol": "GEMI-NBA-2604242300-BOS-PHI-M-BOS",
    "side": "buy",
    "outcome": "yes",
    "orderType": "limit",
    "quantity": "30",
    "filledQuantity": "0",
    "remainingQuantity": "30",
    "price": "0.10",
    "createdAt": "2026-04-24T20:30:32.003Z"
  }`;
  const parsed = jsonParse.parse(apiResponse) as { orderId: string; quantity: string };
  assert.strictEqual(parsed.orderId, '145828833218573125');
  assert.strictEqual(parsed.quantity, '30'); // strings stay strings
});

test('json-bigint keeps small integers as JS numbers', () => {
  // Pagination, fees, timestamps, etc. are well within MAX_SAFE_INTEGER and
  // should NOT be coerced to strings — TypeScript types declare them as
  // `number` and the runtime must agree.
  const parsed = jsonParse.parse('{"limit": 50, "offset": 0, "total": 12345}') as {
    limit: number;
    offset: number;
    total: number;
  };
  assert.strictEqual(parsed.limit, 50);
  assert.strictEqual(typeof parsed.limit, 'number');
  assert.strictEqual(parsed.offset, 0);
  assert.strictEqual(parsed.total, 12345);
});

test('json-bigint keeps a 13-digit timestamp as a JS number', () => {
  // Epoch-millis timestamps are 13 digits today (≈ 1.7×10^12) — three
  // orders of magnitude below MAX_SAFE_INTEGER. They must stay as
  // numbers since types declare them as `number`.
  const parsed = jsonParse.parse('{"timestampms": 1777316231705}') as { timestampms: number };
  assert.strictEqual(parsed.timestampms, 1777316231705);
  assert.strictEqual(typeof parsed.timestampms, 'number');
});
