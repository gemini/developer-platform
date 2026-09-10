import { z } from 'zod';
import type { ToolDefinition } from './index.js';
import { wrapHandler } from './index.js';
import type { MarketDataStore } from '../store/index.js';
import type { CachedBookTicker } from '../types/websocket.js';

const DEFAULT_WAIT_MS = 2000;
const MAX_WAIT_MS = 5000;

/** The slice of WebSocketManager this tool needs — kept narrow so tests can inject a fake. */
export interface BookTickerSource {
  isConnected(): boolean;
  initialize(): Promise<void>;
  subscribe(symbol: string, channel: 'bookTicker'): Promise<void>;
  getStore(): MarketDataStore;
}

// Guards against concurrent tool calls racing GeminiWebSocketClient.connect(),
// which starts a fresh socket whenever the current one isn't already OPEN —
// including while a previous connect() is still CONNECTING.
let connecting: Promise<void> | null = null;

async function ensureConnected(manager: BookTickerSource): Promise<void> {
  if (manager.isConnected()) return;
  if (!connecting) {
    connecting = manager.initialize().finally(() => {
      connecting = null;
    });
  }
  await connecting;
}

function waitForBookTicker(
  store: MarketDataStore,
  symbol: string,
  waitMs: number
): Promise<CachedBookTicker | undefined> {
  const existing = store.getBookTicker(symbol);
  if (existing || waitMs <= 0) return Promise.resolve(existing);

  return new Promise((resolve) => {
    const stop = store.onUpdate(symbol, (event) => {
      if (event.kind !== 'bookTicker') return;
      clearTimeout(timer);
      stop();
      resolve(store.getBookTicker(symbol));
    });
    const timer = setTimeout(() => {
      stop();
      resolve(store.getBookTicker(symbol));
    }, waitMs);
  });
}

async function getBookTicker(manager: BookTickerSource, symbol: string, waitMs: number) {
  await ensureConnected(manager);
  await manager.subscribe(symbol, 'bookTicker');

  const store = manager.getStore();
  const ticker = await waitForBookTicker(store, symbol, waitMs);

  if (!ticker) {
    return {
      symbol: symbol.toUpperCase(),
      status: 'subscribed_no_data_yet',
      message: `Subscribed to ${symbol.toLowerCase()}@bookTicker but no tick has arrived yet. Call this tool again shortly.`,
    };
  }

  return {
    symbol: ticker.symbol,
    bestBid: ticker.bestBid,
    bestBidQty: ticker.bestBidQty,
    bestAsk: ticker.bestAsk,
    bestAskQty: ticker.bestAskQty,
    dataAgeMs: store.getDataAge(symbol),
  };
}

export function createMarketStreamTools(manager: BookTickerSource): ToolDefinition[] {
  return [
    {
      name: 'gemini_get_book_ticker',
      description:
        'Get the live best bid/ask (book ticker) for a symbol over the Gemini WebSocket feed, ' +
        'instead of polling REST. Works for spot symbols and prediction-market contract symbols ' +
        '(e.g. GEMI-PRES2028-VANCE). The first call for a symbol subscribes to the stream and waits ' +
        'briefly for the first tick; subsequent calls return the latest cached tick immediately. ' +
        'If no tick has arrived yet, call again shortly.',
      inputSchema: z.object({
        symbol: z.string().describe('Symbol to get the book ticker for (e.g. btcusd, GEMI-PRES2028-VANCE)'),
        waitMs: z
          .number()
          .min(0)
          .max(MAX_WAIT_MS)
          .optional()
          .describe(`Max time in ms to wait for a first tick if uncached (default ${DEFAULT_WAIT_MS}, max ${MAX_WAIT_MS})`),
      }),
      handler: wrapHandler(({ symbol, waitMs }) => getBookTicker(manager, symbol, waitMs ?? DEFAULT_WAIT_MS)),
    },
  ];
}
