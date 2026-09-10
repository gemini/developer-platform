import test from 'node:test';
import assert from 'node:assert/strict';
import { MarketDataStore } from '../store/index.js';
import { createMarketStreamTools, type MarketStreamSource } from './marketStream.js';

function textOf(result: { content: { type: string; text: string }[] }): string {
  return result.content[0]!.text;
}

function fakeSource(store: MarketDataStore, opts: { connected?: boolean } = {}): MarketStreamSource {
  let connected = opts.connected ?? false;
  return {
    isConnected: () => connected,
    initialize: async () => {
      connected = true;
    },
    subscribe: async () => {
      store.addSubscription('btcusd@bookTicker');
    },
    subscribeContractStatus: async () => {
      store.addSubscription('contractStatus');
    },
    getStore: () => store,
  };
}

test('gemini_get_book_ticker returns a cached tick immediately', async () => {
  const store = new MarketDataStore();
  store.updateBookTicker('BTCUSD', '99', '1', '101', '2');
  const source = fakeSource(store, { connected: true });
  const [tool] = createMarketStreamTools(source);

  const result = await tool!.handler({ symbol: 'btcusd', waitMs: 0 });
  const text = textOf(result);

  assert.match(text, /"symbol": "BTCUSD"/);
  assert.match(text, /"bestBid": "99"/);
  assert.match(text, /"bestAsk": "101"/);
  assert.doesNotMatch(text, /subscribed_no_data_yet/);
});

test('gemini_get_book_ticker connects lazily on first call', async () => {
  const store = new MarketDataStore();
  store.updateBookTicker('ETHUSD', '10', '1', '11', '1');
  const source = fakeSource(store, { connected: false });
  const [tool] = createMarketStreamTools(source);

  assert.strictEqual(source.isConnected(), false);
  const result = await tool!.handler({ symbol: 'ethusd', waitMs: 0 });

  assert.strictEqual(source.isConnected(), true);
  assert.match(textOf(result), /"symbol": "ETHUSD"/);
});

test('gemini_get_book_ticker reports no data yet, then returns it once a tick arrives', async () => {
  const store = new MarketDataStore();
  const source = fakeSource(store, { connected: true });
  const [tool] = createMarketStreamTools(source);

  const empty = await tool!.handler({ symbol: 'solusd', waitMs: 0 });
  assert.match(textOf(empty), /subscribed_no_data_yet/);

  const pending = tool!.handler({ symbol: 'solusd', waitMs: 1000 });
  store.updateBookTicker('SOLUSD', '20', '5', '21', '5');
  const result = await pending;

  assert.match(textOf(result), /"bestBid": "20"/);
});

test('gemini_get_book_ticker times out cleanly when no tick ever arrives', async () => {
  const store = new MarketDataStore();
  const source = fakeSource(store, { connected: true });
  const [tool] = createMarketStreamTools(source);

  const result = await tool!.handler({ symbol: 'doesnotexist', waitMs: 20 });
  assert.match(textOf(result), /subscribed_no_data_yet/);
});

test('gemini_get_contract_status returns a cached event immediately', async () => {
  const store = new MarketDataStore();
  store.updateContractStatus(
    'GEMI-PRES2028-VANCE',
    'PRES2028',
    'GEMI-PRES2028-VANCE',
    '145828833218573125',
    'active',
    'settled',
    '0.50',
    1_700_000_000_000
  );
  const source = fakeSource(store, { connected: true });
  const [, tool] = createMarketStreamTools(source);

  const result = await tool!.handler({ symbol: 'GEMI-PRES2028-VANCE', waitMs: 0 });
  const text = textOf(result);

  assert.match(text, /"symbol": "GEMI-PRES2028-VANCE"/);
  assert.match(text, /"newStatus": "settled"/);
  // 17-18 digit contract IDs exceed Number.MAX_SAFE_INTEGER — must survive as a string, exact.
  assert.match(text, /"contractId": "145828833218573125"/);
  assert.doesNotMatch(text, /subscribed_no_data_yet/);
});

test('gemini_get_contract_status reports no data yet, then returns it once an event arrives', async () => {
  const store = new MarketDataStore();
  const source = fakeSource(store, { connected: true });
  const [, tool] = createMarketStreamTools(source);

  const empty = await tool!.handler({ symbol: 'GEMI-PRES2028-VANCE', waitMs: 0 });
  assert.match(textOf(empty), /subscribed_no_data_yet/);

  const pending = tool!.handler({ symbol: 'GEMI-PRES2028-VANCE', waitMs: 1000 });
  store.updateContractStatus(
    'GEMI-PRES2028-VANCE',
    'PRES2028',
    'GEMI-PRES2028-VANCE',
    '145828833218573125',
    'approved',
    'active',
    undefined,
    1_700_000_000_000
  );
  const result = await pending;

  assert.match(textOf(result), /"newStatus": "active"/);
});

test('gemini_get_contract_status is unaffected by unrelated symbols', async () => {
  const store = new MarketDataStore();
  const source = fakeSource(store, { connected: true });
  const [, tool] = createMarketStreamTools(source);

  store.updateContractStatus('GEMI-OTHER', 'OTHER', 'GEMI-OTHER', '1', 'active', 'settled', undefined, 1);

  const result = await tool!.handler({ symbol: 'GEMI-PRES2028-VANCE', waitMs: 20 });
  assert.match(textOf(result), /subscribed_no_data_yet/);
});
