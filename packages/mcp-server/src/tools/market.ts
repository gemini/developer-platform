import { z } from 'zod';
import type { GeminiHttpClient } from '../client/http.js';
import type { ToolDefinition } from './index.js';
import { wrapHandler } from './index.js';
import { CandleTimeFrame } from '../types/market.js';
import * as market from '../datasources/market.js';

export function createMarketTools(client: GeminiHttpClient): ToolDefinition[] {
  return [
    {
      name: 'gemini_get_symbols',
      description: 'Get all available trading symbols on Gemini',
      inputSchema: z.object({}),
      handler: wrapHandler(() => market.getSymbols(client)),
    },
    {
      name: 'gemini_get_symbol_details',
      description: 'Get details for a specific trading symbol',
      inputSchema: z.object({ symbol: z.string().describe('Trading symbol e.g. btcusd') }),
      handler: wrapHandler(({ symbol }: { symbol: string }) => market.getSymbolDetails(client, symbol)),
    },
    {
      name: 'gemini_get_ticker',
      description: 'Get ticker information for a symbol (v2)',
      inputSchema: z.object({ symbol: z.string().describe('Trading symbol e.g. btcusd') }),
      handler: wrapHandler(({ symbol }: { symbol: string }) => market.getTicker(client, symbol)),
    },
    {
      name: 'gemini_get_ticker_v1',
      description: 'Get ticker information for a symbol (v1)',
      inputSchema: z.object({ symbol: z.string().describe('Trading symbol e.g. btcusd') }),
      handler: wrapHandler(({ symbol }: { symbol: string }) => market.getTickerV1(client, symbol)),
    },
    {
      name: 'gemini_get_candles',
      description: 'Get OHLC candle data for a symbol',
      inputSchema: z.object({
        symbol: z.string().describe('Trading symbol e.g. btcusd'),
        timeFrame: z.nativeEnum(CandleTimeFrame).describe('Time frame for candles'),
      }),
      handler: wrapHandler(({ symbol, timeFrame }: { symbol: string; timeFrame: CandleTimeFrame }) =>
        market.getCandles(client, symbol, timeFrame)
      ),
    },
    {
      name: 'gemini_get_derivative_candles',
      description: 'Get OHLC candle data for a derivative symbol',
      inputSchema: z.object({
        symbol: z.string().describe('Derivative symbol'),
        timeFrame: z.nativeEnum(CandleTimeFrame).describe('Time frame for candles'),
      }),
      handler: wrapHandler(({ symbol, timeFrame }: { symbol: string; timeFrame: CandleTimeFrame }) =>
        market.getDerivativeCandles(client, symbol, timeFrame)
      ),
    },
    {
      name: 'gemini_get_fee_promos',
      description: 'Get current fee promotions',
      inputSchema: z.object({}),
      handler: wrapHandler(() => market.getFeePromos(client)),
    },
    {
      name: 'gemini_get_recent_trades',
      description: 'Get recent trades for a symbol',
      inputSchema: z.object({
        symbol: z.string().describe('Trading symbol'),
        limitTrades: z.number().optional().describe('Maximum number of trades to return'),
        since: z.number().optional().describe('Only return trades after this timestamp (ms)'),
      }),
      handler: wrapHandler(({ symbol, limitTrades, since }: { symbol: string; limitTrades?: number; since?: number }) =>
        market.getRecentTrades(client, symbol, limitTrades, since)
      ),
    },
    {
      name: 'gemini_get_order_book',
      description: 'Get current order book for a symbol',
      inputSchema: z.object({
        symbol: z.string().describe('Trading symbol'),
        limitBids: z.number().optional().describe('Maximum number of bids to return'),
        limitAsks: z.number().optional().describe('Maximum number of asks to return'),
      }),
      handler: wrapHandler(({ symbol, limitBids, limitAsks }: { symbol: string; limitBids?: number; limitAsks?: number }) =>
        market.getOrderBook(client, symbol, limitBids, limitAsks)
      ),
    },
    {
      name: 'gemini_get_auction_history',
      description: 'Get auction history for a symbol',
      inputSchema: z.object({
        symbol: z.string().describe('Trading symbol'),
        limitAuctions: z.number().optional().describe('Maximum number of auctions to return'),
      }),
      handler: wrapHandler(({ symbol, limitAuctions }: { symbol: string; limitAuctions?: number }) =>
        market.getAuctionHistory(client, symbol, limitAuctions)
      ),
    },
    {
      name: 'gemini_get_price_feed',
      description: 'Get price feed for all symbols',
      inputSchema: z.object({}),
      handler: wrapHandler(() => market.getPriceFeed(client)),
    },
    {
      name: 'gemini_get_funding_amounts',
      description: 'Get current funding amounts for perpetual contracts',
      inputSchema: z.object({}),
      handler: wrapHandler(() => market.getFundingAmounts(client)),
    },
    {
      name: 'gemini_get_current_funding_rate',
      description: 'Get the current funding rate for a perpetual symbol',
      inputSchema: z.object({ symbol: z.string().describe('Perpetual symbol') }),
      handler: wrapHandler(({ symbol }: { symbol: string }) => market.getCurrentFundingRate(client, symbol)),
    },
    {
      name: 'gemini_get_network_codes',
      description: 'Get network codes for token deposits',
      inputSchema: z.object({ token: z.string().describe('Token symbol e.g. gusd, usdc, btc') }),
      handler: wrapHandler(({ token }: { token: string }) => market.getNetworkCodes(client, token)),
    },
  ];
}
