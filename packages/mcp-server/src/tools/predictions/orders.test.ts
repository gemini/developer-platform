import test from 'node:test';
import assert from 'node:assert/strict';
import type { SdkClient } from '../../client/sdk.js';
import { createPredictionOrderTools } from './orders.js';

// Requests never leave this test — every call is intercepted by this fake SDK client.
// Responses are shaped the way the SDK returns them: int64 orderIds already decoded to
// bigint, which the datasource layer must turn back into exact strings.
function fakeClient(response: unknown = {}) {
  const method = async () => response;
  return {
    predictions: {
      placeOrder: method,
      cancelOrder: method,
      placeOrderBatch: method,
      cancelOrderBatch: method,
      getActiveOrders: method,
      getOrderHistory: method,
    },
  } as unknown as SdkClient;
}

function toolNamed(client: SdkClient, name: string) {
  const tool = createPredictionOrderTools(client).find((t) => t.name === name);
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
  // confirm: true is included on both cases so the bounds check itself is
  // what's under test — without it, both would report success: false
  // purely because confirm is missing, and the test would still pass even
  // if .min(1).max(20) were removed entirely.
  assert.strictEqual(tool.inputSchema.safeParse({ orderIds: [], confirm: true }).success, false);
  assert.strictEqual(
    tool.inputSchema.safeParse({
      orderIds: Array.from({ length: 21 }, (_, i) => String(i)),
      confirm: true,
    }).success,
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

test('gemini_place_prediction_order and gemini_cancel_prediction_order are destructive and require confirm: true', () => {
  const place = toolNamed(fakeClient(), 'gemini_place_prediction_order');
  assert.strictEqual(place.mutates, 'destructive');
  assert.strictEqual(place.inputSchema.safeParse(order()).success, false);
  assert.strictEqual(place.inputSchema.safeParse({ ...order(), confirm: false }).success, false);
  assert.strictEqual(place.inputSchema.safeParse({ ...order(), confirm: true }).success, true);

  const cancel = toolNamed(fakeClient(), 'gemini_cancel_prediction_order');
  assert.strictEqual(cancel.mutates, 'destructive');
  assert.strictEqual(cancel.inputSchema.safeParse({ orderId: '1' }).success, false);
  assert.strictEqual(cancel.inputSchema.safeParse({ orderId: '1', confirm: true }).success, true);
});

test('the read-only order tools are not marked as mutating', () => {
  for (const name of ['gemini_get_prediction_active_orders', 'gemini_get_prediction_order_history']) {
    assert.strictEqual(toolNamed(fakeClient(), name).mutates, undefined, name);
  }
});

// ----------------------------------------------------------------------------
// Precision regression — 18-digit orderId must survive verbatim. The SDK hands back
// bigint (exact); the tool output must carry it as the exact string, not a rounded
// number and not a JSON.stringify crash.
// ----------------------------------------------------------------------------

function parsedOutput(result: { content: { type: string; text?: string }[] }) {
  return JSON.parse(textOf(result).replace(/^<tool-output[^>]*>\n/, '').replace(/\n<\/tool-output>$/, ''));
}

test('gemini_place_prediction_order returns an 18-digit orderId as the exact string', async () => {
  const tool = toolNamed(
    fakeClient({ orderId: 145828833218573125n, status: 'open', symbol: 'GEMI-A' }),
    'gemini_place_prediction_order'
  );
  const result = await tool.handler(tool.inputSchema.parse({ ...order(), confirm: true }));

  assert.strictEqual(result.isError, undefined);
  assert.strictEqual(parsedOutput(result).orderId, '145828833218573125');
});

test('gemini_place_prediction_order_batch preserves 18-digit orderId precision', async () => {
  const response = {
    results: [
      {
        order: {
          orderId: 145828833218573125n,
          hashOrderId: 'h1',
          status: 'open',
          symbol: 'GEMI-A',
          side: 'buy',
          outcome: 'yes',
          orderType: 'limit',
          quantity: '10',
          filledQuantity: '0',
          remainingQuantity: '10',
          price: '0.42',
          createdAt: '2026-01-01T00:00:00Z',
        },
      },
    ],
  };

  const tool = toolNamed(fakeClient(response), 'gemini_place_prediction_order_batch');
  const result = await tool.handler(tool.inputSchema.parse({ orders: [order()], confirm: true }));
  const text = textOf(result);

  assert.ok(text.includes('145828833218573125'), 'orderId must survive as the exact string');
  assert.doesNotMatch(text, /145828833218573120/, 'must not silently round to a nearby value');
});

test('gemini_cancel_prediction_order_batch preserves 18-digit orderId precision', async () => {
  const response = { results: [{ orderId: 145828833218573125n, result: 'ok' }] };

  const tool = toolNamed(fakeClient(response), 'gemini_cancel_prediction_order_batch');
  const result = await tool.handler(
    tool.inputSchema.parse({ orderIds: ['145828833218573125'], confirm: true })
  );

  assert.strictEqual(parsedOutput(result).results[0].orderId, '145828833218573125');
});

test('gemini_get_prediction_active_orders returns every orderId as the exact string', async () => {
  const response = {
    orders: [{ orderId: 145828833218573125n, symbol: 'GEMI-A' }],
    pagination: { limit: 50, offset: 0 },
  };

  const tool = toolNamed(fakeClient(response), 'gemini_get_prediction_active_orders');
  const result = await tool.handler(tool.inputSchema.parse({}));

  assert.strictEqual(parsedOutput(result).orders[0].orderId, '145828833218573125');
});

// ----------------------------------------------------------------------------
// Mixed results — a batch response can carry both successes and rejections
// ----------------------------------------------------------------------------

test('gemini_place_prediction_order_batch passes through a mix of accepted and rejected entries', async () => {
  const response = {
    results: [
      { order: { orderId: 1n, hashOrderId: 'h1', status: 'open', symbol: 'GEMI-A' } },
      { error: 'InvalidPrice', message: 'price must be between 0.01 and 0.99' },
    ],
  };

  const tool = toolNamed(fakeClient(response), 'gemini_place_prediction_order_batch');
  const result = await tool.handler(
    tool.inputSchema.parse({
      orders: [order(), order({ price: '0.43' })],
      confirm: true,
    })
  );
  const parsed = parsedOutput(result);

  assert.strictEqual(parsed.results.length, 2);
  assert.ok('order' in parsed.results[0], 'first result is a successful order');
  assert.strictEqual(parsed.results[0].order.orderId, '1');
  assert.ok('error' in parsed.results[1], 'second result is a rejection');
  assert.strictEqual(parsed.results[1].error, 'InvalidPrice');
  assert.strictEqual(parsed.results[1].message, 'price must be between 0.01 and 0.99');
});

test('gemini_cancel_prediction_order_batch passes through a mix of successful and rejected cancels', async () => {
  const response = {
    results: [
      { orderId: 111n, result: 'ok' },
      { orderId: 222n, error: 'OrderNotFound', message: 'no open order with that ID' },
    ],
  };

  const tool = toolNamed(fakeClient(response), 'gemini_cancel_prediction_order_batch');
  const result = await tool.handler(
    tool.inputSchema.parse({ orderIds: ['111', '222'], confirm: true })
  );
  const parsed = parsedOutput(result);

  assert.strictEqual(parsed.results.length, 2);
  assert.strictEqual(parsed.results[0].orderId, '111');
  assert.strictEqual(parsed.results[0].result, 'ok');
  assert.strictEqual(parsed.results[1].orderId, '222');
  assert.strictEqual(parsed.results[1].error, 'OrderNotFound');
  assert.strictEqual(parsed.results[1].message, 'no open order with that ID');
});

// ----------------------------------------------------------------------------
// Errors — an SDK ApiError surfaces with its reason/code detail
// ----------------------------------------------------------------------------

test('an SDK error surfaces as a tool error with its reason and code', async () => {
  const failing = {
    predictions: {
      cancelOrder: async () => {
        throw Object.assign(new Error('HTTP 404'), { reason: 'OrderNotFound', code: 'not_found' });
      },
    },
  } as unknown as SdkClient;

  const tool = toolNamed(failing, 'gemini_cancel_prediction_order');
  const result = await tool.handler(tool.inputSchema.parse({ orderId: '1', confirm: true }));

  assert.strictEqual(result.isError, true);
  assert.match(textOf(result), /HTTP 404 \(reason=OrderNotFound, code=not_found\)/);
});
