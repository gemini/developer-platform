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

  assert.deepStrictEqual(kinds, ['price', 'orderBook', 'trade', 'bookTicker']);
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
