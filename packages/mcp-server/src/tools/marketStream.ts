import { z } from 'zod';
import type { ToolDefinition } from './index.js';
import { wrapHandler } from './index.js';
import type { MarketDataStore } from '../store/index.js';
import type { CachedBookTicker, CachedContractStatus } from '../types/websocket.js';

const DEFAULT_WAIT_MS = 2000;
const MAX_WAIT_MS = 5000;

/** The slice of WebSocketManager these tools need — kept narrow so tests can inject a fake. */
export interface MarketStreamSource {
  isConnected(): boolean;
  initialize(): Promise<void>;
  subscribe(symbol: string, channel: 'bookTicker'): Promise<void>;
  subscribeContractStatus(): Promise<void>;
  getStore(): MarketDataStore;
}

// Guards against concurrent tool calls racing GeminiWebSocketClient.connect(),
// which starts a fresh socket whenever the current one isn't already OPEN —
// including while a previous connect() is still CONNECTING.
let connecting: Promise<void> | null = null;

async function ensureConnected(manager: MarketStreamSource): Promise<void> {
  if (manager.isConnected()) return;
  if (!connecting) {
    connecting = manager.initialize().finally(() => {
      connecting = null;
    });
  }
  await connecting;
}

function waitForUpdate<T>(
  store: MarketDataStore,
  symbol: string,
  kind: 'bookTicker' | 'contractStatus',
  getExisting: () => T | undefined,
  waitMs: number
): Promise<T | undefined> {
  const existing = getExisting();
  if (existing || waitMs <= 0) return Promise.resolve(existing);

  return new Promise((resolve) => {
    const stop = store.onUpdate(symbol, (event) => {
      if (event.kind !== kind) return;
      clearTimeout(timer);
      stop();
      resolve(getExisting());
    });
    const timer = setTimeout(() => {
      stop();
      resolve(getExisting());
    }, waitMs);
  });
}

async function getBookTicker(manager: MarketStreamSource, symbol: string, waitMs: number) {
  await ensureConnected(manager);
  await manager.subscribe(symbol, 'bookTicker');

  const store = manager.getStore();
  const ticker = await waitForUpdate<CachedBookTicker>(
    store,
    symbol,
    'bookTicker',
    () => store.getBookTicker(symbol),
    waitMs
  );

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

async function getContractStatus(manager: MarketStreamSource, symbol: string, waitMs: number) {
  await ensureConnected(manager);
  await manager.subscribeContractStatus();

  const store = manager.getStore();
  const status = await waitForUpdate<CachedContractStatus>(
    store,
    symbol,
    'contractStatus',
    () => store.getContractStatus(symbol),
    waitMs
  );

  if (!status) {
    return {
      symbol: symbol.toUpperCase(),
      status: 'subscribed_no_data_yet',
      message:
        `Subscribed to the contractStatus feed for ${symbol.toUpperCase()} but no lifecycle event ` +
        '(strike set, market opened, settled, etc) has been observed yet since subscribing. ' +
        'This is expected if nothing has changed for this contract recently — call again later, ' +
        'or after an event you expect (e.g. near a strike-setting or settlement time).',
    };
  }

  return {
    symbol: status.symbol,
    eventTicker: status.eventTicker,
    contractTicker: status.contractTicker,
    contractId: status.contractId,
    previousStatus: status.previousStatus,
    newStatus: status.newStatus,
    strikePrice: status.strikePrice,
    eventTimeMs: status.eventTimeMs,
    dataAgeMs: store.getDataAge(symbol),
  };
}

export function createMarketStreamTools(manager: MarketStreamSource): ToolDefinition[] {
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
    {
      name: 'gemini_get_contract_status',
      description:
        'React to a prediction-market contract lifecycle event (strike set, market opened, settled, etc) ' +
        'over the Gemini WebSocket feed, instead of polling event endpoints. Takes a contract instrument ' +
        'symbol (e.g. GEMI-PRES2028-VANCE). The first call subscribes and waits briefly for the next event; ' +
        'subsequent calls return the latest cached event immediately. A "subscribed_no_data_yet" result ' +
        'just means nothing has changed for this contract yet — that is expected most of the time.',
      inputSchema: z.object({
        symbol: z.string().describe('Contract instrument symbol (e.g. GEMI-PRES2028-VANCE)'),
        waitMs: z
          .number()
          .min(0)
          .max(MAX_WAIT_MS)
          .optional()
          .describe(`Max time in ms to wait for a first event if uncached (default ${DEFAULT_WAIT_MS}, max ${MAX_WAIT_MS})`),
      }),
      handler: wrapHandler(({ symbol, waitMs }) => getContractStatus(manager, symbol, waitMs ?? DEFAULT_WAIT_MS)),
    },
  ];
}
