import test from 'node:test';
import assert from 'node:assert/strict';
import { MarketDataStore, type MarketUpdateEvent } from './index.js';

test('onUpdate fires for updatePrice with kind="price"', () => {
  const store = new MarketDataStore();
  const events: MarketUpdateEvent[] = [];
  store.onUpdate('btcusd', (e) => events.push(e));

  store.updatePrice('btcusd', '50000');

  assert.strictEqual(events.length, 1);
  assert.strictEqual(events[0].symbol, 'BTCUSD');
  assert.strictEqual(events[0].kind, 'price');
});

test('onUpdate fires for each update method exactly once', () => {
  const store = new MarketDataStore();
  const kinds: string[] = [];
  store.onUpdate('ETHUSD', (e) => kinds.push(e.kind));

  store.updatePrice('ETHUSD', '3000');
  store.updateOrderBook('ETHUSD', [['2999', '1']], [['3001', '1']]);
  store.addTrade('ETHUSD', '3000', '0.1', false, 1);
  store.updateBookTicker('ETHUSD', '2999', '1', '3001', '1');
  store.updateContractStatus('ETHUSD', 'EVT', 'ETHUSD', '1', 'active', 'settled', undefined, 1);

  assert.deepStrictEqual(kinds, ['price', 'orderBook', 'trade', 'bookTicker', 'contractStatus']);
});

test('updateContractStatus stores the latest event, keyed by symbol', () => {
  const store = new MarketDataStore();
  store.updateContractStatus(
    'gemi-pres2028-vance',
    'PRES2028',
    'GEMI-PRES2028-VANCE',
    '145828833218573125',
    'active',
    'settled',
    '0.50',
    1_700_000_000_000
  );

  const status = store.getContractStatus('GEMI-PRES2028-VANCE');
  assert.strictEqual(status?.symbol, 'GEMI-PRES2028-VANCE');
  assert.strictEqual(status?.contractId, '145828833218573125');
  assert.strictEqual(status?.newStatus, 'settled');
  assert.strictEqual(status?.eventTimeMs, 1_700_000_000_000);
});

test('updateContractStatus replaces the cached event for a symbol on a second transition', () => {
  const store = new MarketDataStore();
  store.updateContractStatus(
    'GEMI-PRES2028-VANCE',
    'PRES2028',
    'GEMI-PRES2028-VANCE',
    '1',
    'approved',
    'active',
    undefined,
    1_700_000_000_000
  );
  store.updateContractStatus(
    'GEMI-PRES2028-VANCE',
    'PRES2028',
    'GEMI-PRES2028-VANCE',
    '1',
    'active',
    'settled',
    '0.50',
    1_700_000_300_000
  );

  const status = store.getContractStatus('GEMI-PRES2028-VANCE');
  assert.strictEqual(status?.previousStatus, 'active');
  assert.strictEqual(status?.newStatus, 'settled');
  assert.strictEqual(status?.eventTimeMs, 1_700_000_300_000);
});

test('getContractStatus returns undefined for a symbol with no events yet', () => {
  const store = new MarketDataStore();
  assert.strictEqual(store.getContractStatus('GEMI-UNKNOWN'), undefined);
});

test('clear() removes contract status data for a symbol', () => {
  const store = new MarketDataStore();
  store.updateContractStatus('GEMI-X', 'X', 'GEMI-X', '1', 'active', 'settled', undefined, 1);
  store.clear('GEMI-X');
  assert.strictEqual(store.getContractStatus('GEMI-X'), undefined);
});

test('getStats() counts contract statuses', () => {
  const store = new MarketDataStore();
  store.updateContractStatus('GEMI-X', 'X', 'GEMI-X', '1', 'active', 'settled', undefined, 1);
  store.updateContractStatus('GEMI-Y', 'Y', 'GEMI-Y', '2', 'active', 'settled', undefined, 1);
  assert.strictEqual(store.getStats().contractStatusCount, 2);
});

test('onUpdate is symbol-scoped — other symbols do not fire', () => {
  const store = new MarketDataStore();
  const btc: MarketUpdateEvent[] = [];
  store.onUpdate('BTCUSD', (e) => btc.push(e));

  store.updatePrice('ETHUSD', '3000');

  assert.strictEqual(btc.length, 0);
});

test('onUpdate normalizes symbol case at registration and emit', () => {
  const store = new MarketDataStore();
  const events: MarketUpdateEvent[] = [];
  store.onUpdate('btcusd', (e) => events.push(e));
  store.updatePrice('BTCUSD', '50000');
  assert.strictEqual(events.length, 1);
});

test('onUpdate returns an unsubscribe that stops further callbacks', () => {
  const store = new MarketDataStore();
  let count = 0;
  const stop = store.onUpdate('BTCUSD', () => {
    count++;
  });

  store.updatePrice('BTCUSD', '50000');
  stop();
  store.updatePrice('BTCUSD', '50001');

  assert.strictEqual(count, 1);
});

test('onUpdate supports multiple listeners per symbol', () => {
  const store = new MarketDataStore();
  let a = 0;
  let b = 0;
  store.onUpdate('BTCUSD', () => a++);
  store.onUpdate('BTCUSD', () => b++);
  store.updatePrice('BTCUSD', '50000');
  assert.strictEqual(a, 1);
  assert.strictEqual(b, 1);
});

test('a throwing listener does not break ingestion or other listeners', (t) => {
  const store = new MarketDataStore();
  // Suppress the console.error noise emitted by emit() so test output stays clean.
  const orig = console.error;
  t.after(() => {
    console.error = orig;
  });
  console.error = () => undefined;

  let goodFired = 0;
  store.onUpdate('BTCUSD', () => {
    throw new Error('boom');
  });
  store.onUpdate('BTCUSD', () => {
    goodFired++;
  });

  store.updatePrice('BTCUSD', '50000');
  // Subsequent updates still work — store state should be intact.
  store.updatePrice('BTCUSD', '50001');

  assert.strictEqual(goodFired, 2);
  assert.strictEqual(store.getPrice('BTCUSD')?.price, '50001');
});

test('updateOrder stores the latest state, keyed by order ID', () => {
  const store = new MarketDataStore();
  store.updateOrder({
    orderId: '145828833218573125',
    symbol: 'GEMI-PRES2028-VANCE',
    status: 'NEW',
    eventTimeMs: 1_700_000_000_000,
  });

  const order = store.getOrder('145828833218573125');
  assert.strictEqual(order?.symbol, 'GEMI-PRES2028-VANCE');
  assert.strictEqual(order?.status, 'NEW');
  assert.strictEqual(order?.eventTimeMs, 1_700_000_000_000);
});

test('updateOrder replaces the cached state for an order on a second transition', () => {
  const store = new MarketDataStore();
  store.updateOrder({ orderId: '1', symbol: 'GEMI-X', status: 'NEW', eventTimeMs: 1 });
  store.updateOrder({ orderId: '1', symbol: 'GEMI-X', status: 'FILLED', executedQty: '100', eventTimeMs: 2 });

  const order = store.getOrder('1');
  assert.strictEqual(order?.status, 'FILLED');
  assert.strictEqual(order?.executedQty, '100');
});

test('getOrder returns undefined for an order ID with no updates yet', () => {
  const store = new MarketDataStore();
  assert.strictEqual(store.getOrder('unknown'), undefined);
});

test('onOrderUpdate fires with the update, and is scoped to a single order ID', () => {
  const store = new MarketDataStore();
  const orderOneUpdates: string[] = [];
  const orderTwoUpdates: string[] = [];
  store.onOrderUpdate('1', (update) => orderOneUpdates.push(update.status));
  store.onOrderUpdate('2', (update) => orderTwoUpdates.push(update.status));

  store.updateOrder({ orderId: '1', symbol: 'GEMI-X', status: 'NEW', eventTimeMs: 1 });

  assert.deepStrictEqual(orderOneUpdates, ['NEW']);
  assert.deepStrictEqual(orderTwoUpdates, []);
});

test('onOrderUpdate returns an unsubscribe that stops further callbacks', () => {
  const store = new MarketDataStore();
  let count = 0;
  const stop = store.onOrderUpdate('1', () => count++);

  store.updateOrder({ orderId: '1', symbol: 'GEMI-X', status: 'NEW', eventTimeMs: 1 });
  stop();
  store.updateOrder({ orderId: '1', symbol: 'GEMI-X', status: 'FILLED', eventTimeMs: 2 });

  assert.strictEqual(count, 1);
});

test('a throwing order listener does not break ingestion or other listeners', (t) => {
  const store = new MarketDataStore();
  const orig = console.error;
  t.after(() => {
    console.error = orig;
  });
  console.error = () => undefined;

  let goodFired = 0;
  store.onOrderUpdate('1', () => {
    throw new Error('boom');
  });
  store.onOrderUpdate('1', () => goodFired++);

  store.updateOrder({ orderId: '1', symbol: 'GEMI-X', status: 'NEW', eventTimeMs: 1 });

  assert.strictEqual(goodFired, 1);
  assert.strictEqual(store.getOrder('1')?.status, 'NEW');
});

test('getStats() counts orders, and clearAll() clears them', () => {
  const store = new MarketDataStore();
  store.updateOrder({ orderId: '1', symbol: 'GEMI-X', status: 'NEW', eventTimeMs: 1 });
  store.updateOrder({ orderId: '2', symbol: 'GEMI-Y', status: 'NEW', eventTimeMs: 1 });
  assert.strictEqual(store.getStats().orderCount, 2);

  store.clearAll();
  assert.strictEqual(store.getStats().orderCount, 0);
  assert.strictEqual(store.getOrder('1'), undefined);
});

test('the order cache is bounded — the oldest order is evicted once maxOrders is reached', () => {
  const store = new MarketDataStore(100, 3);
  store.updateOrder({ orderId: '1', symbol: 'GEMI-X', status: 'NEW', eventTimeMs: 1 });
  store.updateOrder({ orderId: '2', symbol: 'GEMI-X', status: 'NEW', eventTimeMs: 1 });
  store.updateOrder({ orderId: '3', symbol: 'GEMI-X', status: 'NEW', eventTimeMs: 1 });
  assert.strictEqual(store.getStats().orderCount, 3);

  store.updateOrder({ orderId: '4', symbol: 'GEMI-X', status: 'NEW', eventTimeMs: 1 });

  assert.strictEqual(store.getStats().orderCount, 3);
  assert.strictEqual(store.getOrder('1'), undefined, 'the oldest order should have been evicted');
  assert.ok(store.getOrder('2'));
  assert.ok(store.getOrder('3'));
  assert.ok(store.getOrder('4'));
});

test('updating an existing order never triggers eviction, even at the cache limit', () => {
  const store = new MarketDataStore(100, 2);
  store.updateOrder({ orderId: '1', symbol: 'GEMI-X', status: 'NEW', eventTimeMs: 1 });
  store.updateOrder({ orderId: '2', symbol: 'GEMI-X', status: 'NEW', eventTimeMs: 1 });

  // At the limit, but this is an update to an existing key, not a new
  // insertion — must not evict order '1'.
  store.updateOrder({ orderId: '2', symbol: 'GEMI-X', status: 'FILLED', eventTimeMs: 2 });

  assert.strictEqual(store.getStats().orderCount, 2);
  assert.ok(store.getOrder('1'));
  assert.strictEqual(store.getOrder('2')?.status, 'FILLED');
});
