import test from 'node:test';
import assert from 'node:assert/strict';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { MarketDataStore } from '../store/index.js';
import { createOrderStreamTools, type OrderStreamSource } from './orderStream.js';

function textOf(result: CallToolResult): string {
  const block = result.content[0];
  if (!block || block.type !== 'text') {
    throw new Error(`expected a text content block, got: ${block?.type ?? 'none'}`);
  }
  return block.text;
}

function fakeSource(
  store: MarketDataStore,
  opts: { connected?: boolean } = {}
): OrderStreamSource & { calls: { subscribeAccountOrders: number } } {
  let connected = opts.connected ?? false;
  const calls = { subscribeAccountOrders: 0 };
  return {
    isConnected: () => connected,
    initialize: async () => {
      connected = true;
    },
    subscribeAccountOrders: async () => {
      calls.subscribeAccountOrders++;
      store.addSubscription('orders@account');
    },
    getStore: () => store,
    calls,
  };
}

test('gemini_get_order_updates returns a cached update immediately', async () => {
  const store = new MarketDataStore();
  store.updateOrder({
    orderId: '145828833218573125',
    symbol: 'GEMI-PRES2028-VANCE',
    status: 'FILLED',
    outcome: 'YES',
    eventTimeMs: 1_700_000_000_000,
  });
  const source = fakeSource(store, { connected: true });
  const [tool] = createOrderStreamTools(source);

  const result = await tool!.handler({ orderId: '145828833218573125', waitMs: 0 });
  const text = textOf(result);

  assert.match(text, /"status": "FILLED"/);
  assert.match(text, /"outcome": "YES"/);
  // 17-18 digit order IDs exceed Number.MAX_SAFE_INTEGER — must survive as a string, exact.
  assert.match(text, /"orderId": "145828833218573125"/);
  assert.doesNotMatch(text, /subscribed_no_data_yet/);
  assert.strictEqual(source.calls.subscribeAccountOrders, 1);
});

test('gemini_get_order_updates connects lazily on first call', async () => {
  const store = new MarketDataStore();
  store.updateOrder({ orderId: '1', symbol: 'GEMI-X', status: 'NEW', eventTimeMs: 1 });
  const source = fakeSource(store, { connected: false });
  const [tool] = createOrderStreamTools(source);

  assert.strictEqual(source.isConnected(), false);
  const result = await tool!.handler({ orderId: '1', waitMs: 0 });

  assert.strictEqual(source.isConnected(), true);
  assert.match(textOf(result), /"orderId": "1"/);
});

test('gemini_get_order_updates reports no data yet, then returns it once an update arrives', async () => {
  const store = new MarketDataStore();
  const source = fakeSource(store, { connected: true });
  const [tool] = createOrderStreamTools(source);

  const empty = await tool!.handler({ orderId: '1', waitMs: 0 });
  assert.match(textOf(empty), /subscribed_no_data_yet/);

  const pending = tool!.handler({ orderId: '1', waitMs: 1000 });
  // Let the handler's own awaits (ensureConnected, subscribeAccountOrders)
  // drain before firing the update — same reasoning as the analogous
  // book-ticker/contract-status tests: otherwise this could land before
  // waitForOrderUpdate registers its listener, silently testing the
  // already-cached fast path instead of the wait path.
  await new Promise((resolve) => setTimeout(resolve, 10));
  store.updateOrder({ orderId: '1', symbol: 'GEMI-X', status: 'FILLED', eventTimeMs: 1 });
  const result = await pending;

  assert.match(textOf(result), /"status": "FILLED"/);
  assert.strictEqual(source.calls.subscribeAccountOrders, 2);
});

test('gemini_get_order_updates times out cleanly when no update ever arrives', async () => {
  const store = new MarketDataStore();
  const source = fakeSource(store, { connected: true });
  const [tool] = createOrderStreamTools(source);

  const result = await tool!.handler({ orderId: 'doesnotexist', waitMs: 20 });
  assert.match(textOf(result), /subscribed_no_data_yet/);
});

test('gemini_get_order_updates is unaffected by updates for other order IDs', async () => {
  const store = new MarketDataStore();
  const source = fakeSource(store, { connected: true });
  const [tool] = createOrderStreamTools(source);

  store.updateOrder({ orderId: 'other-order', symbol: 'GEMI-X', status: 'FILLED', eventTimeMs: 1 });

  const result = await tool!.handler({ orderId: 'my-order', waitMs: 20 });
  assert.match(textOf(result), /subscribed_no_data_yet/);
});
