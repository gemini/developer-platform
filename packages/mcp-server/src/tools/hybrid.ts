import { z } from 'zod';
import type { GeminiHttpClient } from '../client/http.js';
import type { WebSocketManager } from '../websocket/manager.js';
import type { ToolDefinition } from './index.js';
import { wrapHandler } from './index.js';
import * as market from '../datasources/market.js';

/**
 * Create hybrid tools that use WebSocket cache when available,
 * fall back to REST API otherwise
 */
export function createHybridTools(
  httpClient: GeminiHttpClient,
  wsManager: WebSocketManager
): ToolDefinition[] {
  return [
    {
      name: 'gemini_get_realtime_price',
      description:
        'Get the latest price for a symbol. Automatically uses WebSocket cache if subscribed ' +
        '(< 1ms, real-time), otherwise fetches via REST API (slower but always works). ' +
        'To enable real-time mode, first call gemini_ws_subscribe.',
      inputSchema: z.object({
        symbol: z.string().describe('Trading symbol e.g. btcusd'),
      }),
      handler: wrapHandler(async ({ symbol }: { symbol: string }) => {
        const store = wsManager.getStore();
        const cachedPrice = store.getPrice(symbol);

        // Use WebSocket cache if available and fresh
        if (cachedPrice && store.isFresh(symbol, 5000)) {
          return {
            symbol: cachedPrice.symbol,
            price: cachedPrice.price,
            source: 'websocket-cache',
            cached: true,
            timestamp: cachedPrice.timestamp,
            ageMs: store.getDataAge(symbol),
          };
        }

        // Fall back to REST API
        const ticker = await market.getTicker(httpClient, symbol);
        return {
          symbol: symbol.toUpperCase(),
          price: ticker.close,
          source: 'rest-api',
          cached: false,
          timestamp: Date.now(),
          hint: `For real-time prices, subscribe first: gemini_ws_subscribe({symbol: "${symbol}", channel: "trade"})`,
        };
      }),
    },

    {
      name: 'gemini_get_realtime_orderbook',
      description:
        'Get the order book for a symbol. Automatically uses WebSocket cache if subscribed ' +
        '(< 1ms, live updates), otherwise fetches via REST API.',
      inputSchema: z.object({
        symbol: z.string().describe('Trading symbol e.g. btcusd'),
        limit: z.number().optional().describe('Limit number of bids/asks to return'),
      }),
      handler: wrapHandler(async ({ symbol, limit }: { symbol: string; limit?: number }) => {
        const store = wsManager.getStore();
        const cachedBook = store.getOrderBook(symbol);

        // Use WebSocket cache if available and fresh
        if (cachedBook && store.isFresh(symbol, 5000)) {
          const bids = limit ? cachedBook.bids.slice(0, limit) : cachedBook.bids;
          const asks = limit ? cachedBook.asks.slice(0, limit) : cachedBook.asks;

          return {
            symbol: cachedBook.symbol,
            bids,
            asks,
            source: 'websocket-cache',
            cached: true,
            timestamp: cachedBook.timestamp,
            ageMs: store.getDataAge(symbol),
          };
        }

        // Fall back to REST API
        const orderBook = await market.getOrderBook(
          httpClient,
          symbol,
          limit,
          limit
        );

        return {
          symbol: symbol.toUpperCase(),
          bids: orderBook.bids,
          asks: orderBook.asks,
          source: 'rest-api',
          cached: false,
          timestamp: Date.now(),
          hint: `For real-time order book, subscribe first: gemini_ws_subscribe({symbol: "${symbol}", channel: "depth"})`,
        };
      }),
    },

    {
      name: 'gemini_get_realtime_trades',
      description:
        'Get recent trades for a symbol. Automatically uses WebSocket cache if subscribed ' +
        '(< 1ms, live stream), otherwise fetches via REST API.',
      inputSchema: z.object({
        symbol: z.string().describe('Trading symbol e.g. btcusd'),
        limit: z.number().optional().describe('Number of trades to return (default: 20)'),
      }),
      handler: wrapHandler(async ({ symbol, limit }: { symbol: string; limit?: number }) => {
        const store = wsManager.getStore();
        const cachedTrades = store.getTrades(symbol, limit || 20);

        // Use WebSocket cache if available and fresh
        if (cachedTrades.length > 0 && store.isFresh(symbol, 5000)) {
          return {
            symbol: symbol.toUpperCase(),
            trades: cachedTrades.map((t) => ({
              price: t.price,
              quantity: t.quantity,
              side: t.isMaker ? 'sell' : 'buy',
              timestamp: t.timestamp,
              tradeId: t.tradeId,
            })),
            count: cachedTrades.length,
            source: 'websocket-cache',
            cached: true,
            ageMs: store.getDataAge(symbol),
          };
        }

        // Fall back to REST API
        const trades = await market.getRecentTrades(
          httpClient,
          symbol,
          limit,
          undefined
        );

        return {
          symbol: symbol.toUpperCase(),
          trades: trades.map((t) => ({
            price: t.price,
            quantity: t.amount,
            timestamp: t.timestamp,
            tradeId: t.tid,
            type: t.type,
          })),
          count: trades.length,
          source: 'rest-api',
          cached: false,
          timestamp: Date.now(),
          hint: `For real-time trades, subscribe first: gemini_ws_subscribe({symbol: "${symbol}", channel: "trade"})`,
        };
      }),
    },
  ];
}
