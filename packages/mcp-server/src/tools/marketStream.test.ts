import test from 'node:test';
import assert from 'node:assert/strict';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { MarketDataStore } from '../store/index.js';
import { createMarketStreamTools, type BookTickerSource } from './marketStream.js';

function textOf(result: CallToolResult): string {
  const block = result.content[0];
  if (!block || block.type !== 'text') {
    throw new Error(`expected a text content block, got: ${block?.type ?? 'none'}`);
  }
  return block.text;
}

function fakeSource(store: MarketDataStore, opts: { connected?: boolean } = {}): BookTickerSource {
  let connected = opts.connected ?? false;
  return {
    isConnected: () => connected,
    initialize: async () => {
      connected = true;
    },
    subscribe: async () => {
      store.addSubscription('btcusd@bookTicker');
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
