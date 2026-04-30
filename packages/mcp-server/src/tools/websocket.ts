import { z } from 'zod';
import type { WebSocketManager } from '../websocket/manager.js';
import type { ToolDefinition } from './index.js';
import { wrapHandler } from './index.js';
import type { WSChannel } from '../types/websocket.js';

/**
 * Create WebSocket-aware tools
 */
export function createWebSocketTools(wsManager: WebSocketManager): ToolDefinition[] {
  return [
    {
      name: 'gemini_ws_subscribe',
      description:
        'Subscribe to a real-time WebSocket channel for a symbol. ' +
        'Available channels: trade (real-time trades), depth (order book updates), ' +
        'bookTicker (best bid/ask), ticker (24h stats). ' +
        'Data will be cached in memory for instant access.',
      inputSchema: z.object({
        symbol: z.string().describe('Trading symbol e.g. btcusd'),
        channel: z
          .enum(['trade', 'depth', 'bookTicker', 'ticker'])
          .describe('WebSocket channel to subscribe to'),
      }),
      handler: wrapHandler(async ({ symbol, channel }: { symbol: string; channel: WSChannel }) => {
        if (!wsManager.isConnected()) {
          return { error: 'WebSocket is not connected. Please wait for connection to establish.' };
        }

        await wsManager.subscribe(symbol, channel);
        return {
          success: true,
          message: `Subscribed to ${symbol}@${channel}`,
          subscription: `${symbol.toLowerCase()}@${channel}`,
        };
      }),
    },

    {
      name: 'gemini_ws_subscribe_multiple',
      description:
        'Subscribe to a WebSocket channel for multiple symbols at once. ' +
        'More efficient than calling gemini_ws_subscribe multiple times.',
      inputSchema: z.object({
        symbols: z.array(z.string()).describe('Array of trading symbols e.g. ["btcusd", "ethusd"]'),
        channel: z
          .enum(['trade', 'depth', 'bookTicker', 'ticker'])
          .describe('WebSocket channel to subscribe to'),
      }),
      handler: wrapHandler(async ({ symbols, channel }: { symbols: string[]; channel: WSChannel }) => {
        if (!wsManager.isConnected()) {
          return { error: 'WebSocket is not connected. Please wait for connection to establish.' };
        }

        await wsManager.subscribeMultiple(symbols, channel);
        return {
          success: true,
          message: `Subscribed to ${symbols.length} symbols on ${channel} channel`,
          subscriptions: symbols.map((s) => `${s.toLowerCase()}@${channel}`),
        };
      }),
    },

    {
      name: 'gemini_ws_unsubscribe',
      description: 'Unsubscribe from a WebSocket channel for a symbol',
      inputSchema: z.object({
        symbol: z.string().describe('Trading symbol e.g. btcusd'),
        channel: z
          .enum(['trade', 'depth', 'bookTicker', 'ticker'])
          .describe('WebSocket channel to unsubscribe from'),
      }),
      handler: wrapHandler(async ({ symbol, channel }: { symbol: string; channel: WSChannel }) => {
        await wsManager.unsubscribe(symbol, channel);
        return {
          success: true,
          message: `Unsubscribed from ${symbol}@${channel}`,
        };
      }),
    },

    {
      name: 'gemini_ws_unsubscribe_symbol',
      description: 'Unsubscribe from all WebSocket channels for a symbol and clear its cached data',
      inputSchema: z.object({
        symbol: z.string().describe('Trading symbol e.g. btcusd'),
      }),
      handler: wrapHandler(async ({ symbol }: { symbol: string }) => {
        await wsManager.unsubscribeSymbol(symbol);
        return {
          success: true,
          message: `Unsubscribed from all channels for ${symbol}`,
        };
      }),
    },

    {
      name: 'gemini_ws_get_price',
      description:
        'Get the latest cached price for a symbol from WebSocket feed. ' +
        'Instant response (no HTTP request). Returns the most recent price from trade or ticker updates. ' +
        'Requires active subscription to trade or ticker channel for the symbol.',
      inputSchema: z.object({
        symbol: z.string().describe('Trading symbol e.g. btcusd'),
      }),
      handler: wrapHandler(async ({ symbol }: { symbol: string }) => {
        const store = wsManager.getStore();
        const price = store.getPrice(symbol);

        if (!price) {
          return {
            error: `No cached price data for ${symbol}. Subscribe to ${symbol}@trade or ${symbol}@ticker first.`,
          };
        }

        const age = store.getDataAge(symbol);
        return {
          symbol: price.symbol,
          price: price.price,
          source: price.source,
          timestamp: price.timestamp,
          ageMs: age,
          isFresh: store.isFresh(symbol, 5000),
        };
      }),
    },

    {
      name: 'gemini_ws_get_orderbook',
      description:
        'Get the latest cached order book for a symbol from WebSocket feed. ' +
        'Instant response (no HTTP request). Shows bids and asks with prices and quantities. ' +
        'Requires active subscription to depth channel for the symbol.',
      inputSchema: z.object({
        symbol: z.string().describe('Trading symbol e.g. btcusd'),
        limit: z
          .number()
          .optional()
          .describe('Limit number of bids and asks to return (default: all)'),
      }),
      handler: wrapHandler(async ({ symbol, limit }: { symbol: string; limit?: number }) => {
        const store = wsManager.getStore();
        const orderBook = store.getOrderBook(symbol);

        if (!orderBook) {
          return {
            error: `No cached order book for ${symbol}. Subscribe to ${symbol}@depth first.`,
          };
        }

        const bids = limit ? orderBook.bids.slice(0, limit) : orderBook.bids;
        const asks = limit ? orderBook.asks.slice(0, limit) : orderBook.asks;

        const age = store.getDataAge(symbol);
        return {
          symbol: orderBook.symbol,
          bids,
          asks,
          timestamp: orderBook.timestamp,
          ageMs: age,
          isFresh: store.isFresh(symbol, 5000),
        };
      }),
    },

    {
      name: 'gemini_ws_get_trades',
      description:
        'Get recent cached trades for a symbol from WebSocket feed. ' +
        'Instant response (no HTTP request). Shows the most recent trades with price, quantity, and side. ' +
        'Requires active subscription to trade channel for the symbol.',
      inputSchema: z.object({
        symbol: z.string().describe('Trading symbol e.g. btcusd'),
        limit: z.number().optional().describe('Limit number of trades to return (default: 20)'),
      }),
      handler: wrapHandler(async ({ symbol, limit }: { symbol: string; limit?: number }) => {
        const store = wsManager.getStore();
        const trades = store.getTrades(symbol, limit || 20);

        if (trades.length === 0) {
          return {
            error: `No cached trades for ${symbol}. Subscribe to ${symbol}@trade first.`,
          };
        }

        const age = store.getDataAge(symbol);
        return {
          symbol: symbol.toUpperCase(),
          trades: trades.map((t) => ({
            price: t.price,
            quantity: t.quantity,
            side: t.isMaker ? 'sell' : 'buy',
            timestamp: t.timestamp,
            tradeId: t.tradeId,
          })),
          count: trades.length,
          ageMs: age,
          isFresh: store.isFresh(symbol, 5000),
        };
      }),
    },

    {
      name: 'gemini_ws_get_book_ticker',
      description:
        'Get the latest best bid and ask for a symbol from WebSocket feed. ' +
        'Instant response (no HTTP request). Shows the top of the order book. ' +
        'Requires active subscription to bookTicker channel for the symbol.',
      inputSchema: z.object({
        symbol: z.string().describe('Trading symbol e.g. btcusd'),
      }),
      handler: wrapHandler(async ({ symbol }: { symbol: string }) => {
        const store = wsManager.getStore();
        const bookTicker = store.getBookTicker(symbol);

        if (!bookTicker) {
          return {
            error: `No cached book ticker for ${symbol}. Subscribe to ${symbol}@bookTicker first.`,
          };
        }

        const age = store.getDataAge(symbol);
        const spread = parseFloat(bookTicker.bestAsk) - parseFloat(bookTicker.bestBid);
        const midPrice = (parseFloat(bookTicker.bestBid) + parseFloat(bookTicker.bestAsk)) / 2;

        return {
          symbol: bookTicker.symbol,
          bestBid: bookTicker.bestBid,
          bestBidQty: bookTicker.bestBidQty,
          bestAsk: bookTicker.bestAsk,
          bestAskQty: bookTicker.bestAskQty,
          spread: spread.toString(),
          midPrice: midPrice.toString(),
          timestamp: bookTicker.timestamp,
          ageMs: age,
          isFresh: store.isFresh(symbol, 5000),
        };
      }),
    },

    {
      name: 'gemini_ws_get_snapshot',
      description:
        'Get a complete snapshot of all cached data for a symbol. ' +
        'Returns price, order book, recent trades, and book ticker if available. ' +
        'Useful to see all real-time data for a symbol at once.',
      inputSchema: z.object({
        symbol: z.string().describe('Trading symbol e.g. btcusd'),
      }),
      handler: wrapHandler(async ({ symbol }: { symbol: string }) => {
        const store = wsManager.getStore();
        const snapshot = store.getSnapshot(symbol);

        if (!snapshot.lastUpdate) {
          return {
            error: `No cached data for ${symbol}. Subscribe to channels first.`,
          };
        }

        const age = store.getDataAge(symbol);
        return {
          symbol: symbol.toUpperCase(),
          price: snapshot.price,
          orderBook: snapshot.orderBook
            ? {
                bids: snapshot.orderBook.bids.slice(0, 5),
                asks: snapshot.orderBook.asks.slice(0, 5),
              }
            : null,
          recentTrades: snapshot.trades.slice(-5).map((t) => ({
            price: t.price,
            quantity: t.quantity,
            side: t.isMaker ? 'sell' : 'buy',
            timestamp: t.timestamp,
          })),
          bookTicker: snapshot.bookTicker,
          lastUpdate: snapshot.lastUpdate,
          ageMs: age,
          isFresh: store.isFresh(symbol, 5000),
        };
      }),
    },

    {
      name: 'gemini_ws_status',
      description:
        'Get WebSocket connection status and statistics. ' +
        'Shows connection state, active subscriptions, cached symbols, and memory usage.',
      inputSchema: z.object({}),
      handler: wrapHandler(async () => {
        const state = wsManager.getState();
        const stats = wsManager.getStats();
        const store = wsManager.getStore();
        const symbols = store.getSymbols();

        return {
          connection: {
            status: state.status,
            isConnected: wsManager.isConnected(),
            lastConnected: state.lastConnected,
            lastError: state.lastError,
            reconnectAttempts: state.reconnectAttempts,
          },
          subscriptions: {
            active: state.subscriptions,
            count: state.subscriptions.length,
          },
          cache: {
            symbols: symbols,
            symbolCount: stats.symbolCount,
            prices: stats.priceCount,
            orderBooks: stats.orderBookCount,
            trades: {
              symbols: stats.tradeSymbolCount,
              total: stats.totalTradeCount,
            },
            bookTickers: stats.bookTickerCount,
          },
          dataFreshness: symbols.map((symbol) => ({
            symbol,
            ageMs: store.getDataAge(symbol),
            isFresh: store.isFresh(symbol, 5000),
          })),
        };
      }),
    },
  ];
}
