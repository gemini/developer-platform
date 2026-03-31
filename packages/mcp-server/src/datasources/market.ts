import type { GeminiHttpClient } from '../client/http.js';
import type { TickerV2, Trade, OrderBook, PriceFeed, FundingAmount } from '../types/market.js';
import { CandleTimeFrame } from '../types/market.js';

export async function getSymbols(client: GeminiHttpClient): Promise<string[]> {
  return client.publicGet<string[]>('/v1/symbols');
}

export async function getSymbolDetails(client: GeminiHttpClient, symbol: string): Promise<Record<string, unknown>> {
  return client.publicGet<Record<string, unknown>>(`/v1/symbols/details/${symbol}`);
}

export async function getNetworkCodes(client: GeminiHttpClient, token: string): Promise<Record<string, unknown>> {
  return client.publicGet<Record<string, unknown>>(`/v1/network/${token}`);
}

export async function getTicker(client: GeminiHttpClient, symbol: string): Promise<TickerV2> {
  return client.publicGet<TickerV2>(`/v2/ticker/${symbol}`);
}

export async function getTickerV1(client: GeminiHttpClient, symbol: string): Promise<Record<string, unknown>> {
  return client.publicGet<Record<string, unknown>>(`/v1/pubticker/${symbol}`);
}

export async function getCandles(
  client: GeminiHttpClient,
  symbol: string,
  timeFrame: CandleTimeFrame
): Promise<number[][]> {
  return client.publicGet<number[][]>(`/v2/candles/${symbol}/${timeFrame}`);
}

export async function getDerivativeCandles(
  client: GeminiHttpClient,
  symbol: string,
  timeFrame: CandleTimeFrame
): Promise<number[][]> {
  return client.publicGet<number[][]>(`/v2/derivatives/candles/${symbol}/${timeFrame}`);
}

export async function getFeePromos(client: GeminiHttpClient): Promise<Record<string, unknown>> {
  return client.publicGet<Record<string, unknown>>('/v1/feepromos');
}

export async function getRecentTrades(
  client: GeminiHttpClient,
  symbol: string,
  limitTrades?: number,
  since?: number
): Promise<Trade[]> {
  const params: Record<string, string> = {};
  if (limitTrades !== undefined) params['limit_trades'] = String(limitTrades);
  if (since !== undefined) params['since'] = String(since);
  return client.publicGet<Trade[]>(`/v1/trades/${symbol}`, params);
}

export async function getOrderBook(
  client: GeminiHttpClient,
  symbol: string,
  limitBids?: number,
  limitAsks?: number
): Promise<OrderBook> {
  const params: Record<string, string> = {};
  if (limitBids !== undefined) params['limit_bids'] = String(limitBids);
  if (limitAsks !== undefined) params['limit_asks'] = String(limitAsks);
  return client.publicGet<OrderBook>(`/v1/book/${symbol}`, params);
}

export async function getAuctionHistory(
  client: GeminiHttpClient,
  symbol: string,
  limitAuctions?: number
): Promise<Record<string, unknown>> {
  const params: Record<string, string> = {};
  if (limitAuctions !== undefined) params['limit_auction_results'] = String(limitAuctions);
  return client.publicGet<Record<string, unknown>>(`/v1/auction/${symbol}/history`, params);
}

export async function getPriceFeed(client: GeminiHttpClient): Promise<PriceFeed[]> {
  return client.publicGet<PriceFeed[]>('/v1/pricefeed');
}

export async function getFundingAmounts(client: GeminiHttpClient): Promise<FundingAmount[]> {
  return client.publicGet<FundingAmount[]>('/v1/fundingamounts');
}

export async function getCurrentFundingRate(client: GeminiHttpClient, symbol: string): Promise<Record<string, unknown>> {
  return client.publicGet<Record<string, unknown>>(`/v1/perpetuals/fundingrates/${symbol}`);
}
