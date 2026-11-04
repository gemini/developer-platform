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
    side: 'BUY',
    orderType: 'LIMIT',
    price: '0.27',
    quantity: '100',
    remainingQty: '0',
    executedQty: '100',
    lastExecutedPrice: '0.27',
    tradeId: '298374652910473625',
    feeAmount: '0.01',
    isMaker: true,
    eventTimeMs: 1_700_000_000_000,
  });
  const source = fakeSource(store, { connected: true });
  const [tool] = createOrderStreamTools(source);

  const result = await tool!.handler({ orderId: '145828833218573125', waitMs: 0 });
  const text = textOf(result);

  assert.match(text, /"status": "FILLED"/);
  assert.match(text, /"outcome": "YES"/);
  // 17-18 digit order/trade IDs exceed Number.MAX_SAFE_INTEGER — must survive as exact strings.
  assert.match(text, /"orderId": "145828833218573125"/);
  assert.match(text, /"tradeId": "298374652910473625"/);
  assert.match(text, /"remainingQty": "0"/);
  assert.match(text, /"executedQty": "100"/);
  assert.match(text, /"lastExecutedPrice": "0.27"/);
  assert.match(text, /"eventTimeMs": 1700000000000/);
  assert.match(text, /"dataAgeMs": \d+/);
  assert.doesNotMatch(text, /subscribed_no_data_yet/);
  assert.strictEqual(source.calls.subscribeAccountOrders, 1);
});

test('gemini_get_order_updates uses the documented 2000ms default when waitMs is omitted', async () => {
  const store = new MarketDataStore();
  const source = fakeSource(store, { connected: true });
  const [tool] = createOrderStreamTools(source);

  // No waitMs at all — must fall back to DEFAULT_WAIT_MS. If that fallback
  // were dropped and `undefined` reached waitForOrderUpdate directly,
  // setTimeout(fn, undefined) fires at 0ms in Node, so this update
  // (delivered after a short delay) would be missed and the call would
  // wrongly return subscribed_no_data_yet instead of catching it.
  const pending = tool!.handler({ orderId: 'default-wait-order' });
  await new Promise((resolve) => setTimeout(resolve, 10));
  store.updateOrder({ orderId: 'default-wait-order', symbol: 'GEMI-X', status: 'FILLED', eventTimeMs: 1 });
  const result = await pending;

  assert.match(textOf(result), /"status": "FILLED"/);
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
