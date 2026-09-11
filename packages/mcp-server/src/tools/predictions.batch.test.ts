import test from 'node:test';
import assert from 'node:assert/strict';
import JSONBig from 'json-bigint';
import type { GeminiHttpClient } from '../client/http.js';
import { createPredictionTools } from './predictions.js';

// Requests never leave this test — every batch call in these tests is
// intercepted by the fake client before it reaches GeminiHttpClient's real
// networking code.
function fakeClient(response: unknown = {}) {
  return {
    publicGet: async () => response,
    authenticatedGet: async () => response,
    authenticatedPost: async () => response,
  } as unknown as GeminiHttpClient;
}

function toolNamed(client: GeminiHttpClient, name: string) {
  const tool = createPredictionTools(client).find((t) => t.name === name);
  if (!tool) throw new Error(`tool not found: ${name}`);
  return tool;
}

function textOf(result: { content: { type: string; text?: string }[] }): string {
  const block = result.content[0];
  if (!block || block.type !== 'text' || block.text === undefined) {
    throw new Error('expected a text content block');
  }
  return block.text;
}

// Same precision-preserving parser the real GeminiHttpClient uses
// (src/client/http.ts). Used here to turn hand-written raw JSON text — with
// an 18-digit orderId as a bare JSON number, exactly as the API sends it —
// into the object a real client call would hand to the datasource layer.
// Building the fixture via JSON.stringify of a JS object literal would not
// prove anything: an 18-digit numeric literal in JS source is already
// truncated by the time any parser sees it.
const jsonParse = JSONBig({ storeAsString: true });

function order(overrides: Record<string, unknown> = {}) {
  return {
    symbol: 'GEMI-PRES2028-VANCE',
    side: 'buy' as const,
    outcome: 'yes' as const,
    quantity: '10',
    price: '0.42',
    ...overrides,
  };
}

// ----------------------------------------------------------------------------
// Schema bounds — 1..20 entries, enforced client-side
// ----------------------------------------------------------------------------

test('gemini_place_prediction_order_batch accepts a 1-order and a 20-order batch', () => {
  const tool = toolNamed(fakeClient(), 'gemini_place_prediction_order_batch');
  assert.strictEqual(
    tool.inputSchema.safeParse({ orders: [order()], confirm: true }).success,
    true
  );
  assert.strictEqual(
    tool.inputSchema.safeParse({ orders: Array.from({ length: 20 }, () => order()), confirm: true })
      .success,
    true
  );
});

test('gemini_place_prediction_order_batch rejects a 0-order and a 21-order batch', () => {
  const tool = toolNamed(fakeClient(), 'gemini_place_prediction_order_batch');
  assert.strictEqual(tool.inputSchema.safeParse({ orders: [], confirm: true }).success, false);
  assert.strictEqual(
    tool.inputSchema.safeParse({ orders: Array.from({ length: 21 }, () => order()), confirm: true })
      .success,
    false
  );
});

test('gemini_cancel_prediction_order_batch accepts a 1-id and a 20-id batch', () => {
  const tool = toolNamed(fakeClient(), 'gemini_cancel_prediction_order_batch');
  assert.strictEqual(tool.inputSchema.safeParse({ orderIds: ['1'], confirm: true }).success, true);
  assert.strictEqual(
    tool.inputSchema.safeParse({
      orderIds: Array.from({ length: 20 }, (_, i) => String(i)),
      confirm: true,
    }).success,
    true
  );
});

test('gemini_cancel_prediction_order_batch rejects a 0-id and a 21-id batch', () => {
  const tool = toolNamed(fakeClient(), 'gemini_cancel_prediction_order_batch');
  assert.strictEqual(tool.inputSchema.safeParse({ orderIds: [] }).success, false);
  assert.strictEqual(
    tool.inputSchema.safeParse({ orderIds: Array.from({ length: 21 }, (_, i) => String(i)) }).success,
    false
  );
});

test('gemini_cancel_prediction_order_batch rejects duplicate order IDs', () => {
  const tool = toolNamed(fakeClient(), 'gemini_cancel_prediction_order_batch');
  assert.strictEqual(
    tool.inputSchema.safeParse({ orderIds: ['111', '222', '111'], confirm: true }).success,
    false
  );
  assert.strictEqual(
    tool.inputSchema.safeParse({ orderIds: ['111', '222', '333'], confirm: true }).success,
    true
  );
});

// ----------------------------------------------------------------------------
// Mutation gating — both place and cancel are destructive + confirm-gated.
//
// Cancel was originally left ungated here, mirroring the single
// gemini_cancel_prediction_order tool's then-ungated state. A PR review on
// PREDICT-8546 (the foundation this branch depends on) pointed out that the
// single tool's spot-market sibling (gemini_cancel_order) was already gated,
// making the ungated prediction-market cancel an inconsistency rather than a
// deliberate distinction. The single tool was gated to match; this batch
// version is gated here for the same reason, to avoid reintroducing the
// exact inconsistency that fix closed.
// ----------------------------------------------------------------------------

test('gemini_place_prediction_order_batch is destructive and requires confirm: true', () => {
  const tool = toolNamed(fakeClient(), 'gemini_place_prediction_order_batch');
  assert.strictEqual(tool.mutates, 'destructive');
  assert.strictEqual(tool.inputSchema.safeParse({ orders: [order()] }).success, false);
  assert.strictEqual(
    tool.inputSchema.safeParse({ orders: [order()], confirm: false }).success,
    false
  );
  assert.strictEqual(tool.inputSchema.safeParse({ orders: [order()], confirm: true }).success, true);
});

test('gemini_cancel_prediction_order_batch is destructive and requires confirm: true', () => {
  const tool = toolNamed(fakeClient(), 'gemini_cancel_prediction_order_batch');
  assert.strictEqual(tool.mutates, 'destructive');
  assert.strictEqual(tool.inputSchema.safeParse({ orderIds: ['1'] }).success, false);
  assert.strictEqual(
    tool.inputSchema.safeParse({ orderIds: ['1'], confirm: false }).success,
    false
  );
  assert.strictEqual(tool.inputSchema.safeParse({ orderIds: ['1'], confirm: true }).success, true);
});

// ----------------------------------------------------------------------------
// Precision regression — 18-digit orderId must survive verbatim
// ----------------------------------------------------------------------------

test('gemini_place_prediction_order_batch preserves 18-digit orderId precision', async () => {
  const raw =
    '{"results":[{"order":{"orderId":145828833218573125,"hashOrderId":"h1","status":"open",' +
    '"symbol":"GEMI-A","side":"buy","outcome":"yes","orderType":"limit","quantity":"10",' +
    '"filledQuantity":"0","remainingQuantity":"10","price":"0.42","createdAt":"2026-01-01T00:00:00Z"}}]}';
  const response = jsonParse.parse(raw);

  const tool = toolNamed(fakeClient(response), 'gemini_place_prediction_order_batch');
  const result = await tool.handler(tool.inputSchema.parse({ orders: [order()], confirm: true }));
  const text = textOf(result);

  assert.ok(text.includes('145828833218573125'), 'orderId must survive as the exact string');
  assert.doesNotMatch(text, /145828833218573120/, 'must not silently round to a nearby value');
});

test('gemini_cancel_prediction_order_batch preserves 18-digit orderId precision', async () => {
  const raw = '{"results":[{"orderId":145828833218573125,"result":"cancelled"}]}';
  const response = jsonParse.parse(raw);

  const tool = toolNamed(fakeClient(response), 'gemini_cancel_prediction_order_batch');
  const result = await tool.handler(
    tool.inputSchema.parse({ orderIds: ['145828833218573125'], confirm: true })
  );
  const text = textOf(result);

  assert.ok(text.includes('145828833218573125'), 'orderId must survive as the exact string');
});

// ----------------------------------------------------------------------------
// Mixed results — a batch response can carry both successes and rejections
// ----------------------------------------------------------------------------

test('gemini_place_prediction_order_batch passes through a mix of accepted and rejected entries', async () => {
  const raw =
    '{"results":[' +
    '{"order":{"orderId":"1","hashOrderId":"h1","status":"open","symbol":"GEMI-A","side":"buy",' +
    '"outcome":"yes","orderType":"limit","quantity":"10","filledQuantity":"0",' +
    '"remainingQuantity":"10","price":"0.42","createdAt":"2026-01-01T00:00:00Z"}},' +
    '{"error":"InvalidPrice","message":"price must be between 0.01 and 0.99"}' +
    ']}';
  const response = jsonParse.parse(raw);

  const tool = toolNamed(fakeClient(response), 'gemini_place_prediction_order_batch');
  const result = await tool.handler(
    tool.inputSchema.parse({
      orders: [order(), order({ price: '5.00' })],
      confirm: true,
    })
  );
  const text = textOf(result);
  const parsed = JSON.parse(text.replace(/^<tool-output[^>]*>\n/, '').replace(/\n<\/tool-output>$/, ''));

  assert.strictEqual(parsed.results.length, 2);
  assert.ok('order' in parsed.results[0], 'first result is a successful order');
  assert.ok('error' in parsed.results[1], 'second result is a rejection');
  assert.strictEqual(parsed.results[1].error, 'InvalidPrice');
  assert.strictEqual(parsed.results[1].message, 'price must be between 0.01 and 0.99');
});

test('gemini_cancel_prediction_order_batch passes through a mix of successful and rejected cancels', async () => {
  const raw =
    '{"results":[' +
    '{"orderId":"111","result":"cancelled"},' +
    '{"orderId":"222","error":"OrderNotFound","message":"no open order with that ID"}' +
    ']}';
  const response = jsonParse.parse(raw);

  const tool = toolNamed(fakeClient(response), 'gemini_cancel_prediction_order_batch');
  const result = await tool.handler(
    tool.inputSchema.parse({ orderIds: ['111', '222'], confirm: true })
  );
  const text = textOf(result);
  const parsed = JSON.parse(text.replace(/^<tool-output[^>]*>\n/, '').replace(/\n<\/tool-output>$/, ''));

  assert.strictEqual(parsed.results.length, 2);
  assert.strictEqual(parsed.results[0].orderId, '111');
  assert.strictEqual(parsed.results[0].result, 'cancelled');
  assert.strictEqual(parsed.results[1].orderId, '222');
  assert.strictEqual(parsed.results[1].error, 'OrderNotFound');
  assert.strictEqual(parsed.results[1].message, 'no open order with that ID');
});
