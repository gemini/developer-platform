import test from 'node:test';
import assert from 'node:assert/strict';

import type { GeminiHttpClient } from '../client/http.js';
import { createOrderTools } from './orders.js';

function fakeClient() {
  return {
    authenticatedPost: async () => ({}),
  } as unknown as GeminiHttpClient;
}

function statusTool() {
  const tool = createOrderTools(fakeClient()).find(
    (candidate) => candidate.name === 'gemini_get_order_status'
  );
  if (!tool) throw new Error('gemini_get_order_status tool not found');
  return tool;
}

test('gemini_get_order_status accepts exactly one order identifier', () => {
  const schema = statusTool().inputSchema;

  assert.strictEqual(schema.safeParse({ orderId: '123' }).success, true);
  assert.strictEqual(schema.safeParse({ clientOrderId: 'agent-order-42' }).success, true);

  assert.strictEqual(
    schema.safeParse({}).success,
    false,
    'an order identifier is required'
  );

  assert.strictEqual(
    schema.safeParse({
      orderId: '123',
      clientOrderId: 'agent-order-42',
    }).success,
    false,
    'orderId and clientOrderId must be mutually exclusive'
  );
});
