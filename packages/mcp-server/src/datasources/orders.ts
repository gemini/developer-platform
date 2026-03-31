import type { GeminiHttpClient } from '../client/http.js';
import type { Order, MyTrade, TradeVolume, NotionalVolume } from '../types/orders.js';
import { getTicker } from './market.js';

export async function newOrder(
  client: GeminiHttpClient,
  symbol: string,
  amount: string,
  price: string,
  side: string,
  type: string,
  options?: string[],
  clientOrderId?: string
): Promise<Order> {
  const body: Record<string, unknown> = { symbol, amount, price, side, type };
  if (options) body['options'] = options;
  if (clientOrderId) body['client_order_id'] = clientOrderId;

  try {
    return await client.authenticatedPost<Order>('/v1/order/new', body);
  } catch (err: unknown) {
    const isInvalidOrderType =
      err instanceof Error && err.message.includes('InvalidOrderType');
    const isMarketOrder =
      typeof type === 'string' && type.toLowerCase().includes('market');

    if (isInvalidOrderType && isMarketOrder) {
      const ticker = await getTicker(client, symbol);
      const fallbackPrice = side === 'buy' ? ticker.ask : ticker.bid;
      const fallbackBody: Record<string, unknown> = {
        symbol,
        amount,
        price: fallbackPrice,
        side,
        type: 'exchange limit',
      };
      if (clientOrderId) fallbackBody['client_order_id'] = clientOrderId;
      return client.authenticatedPost<Order>('/v1/order/new', fallbackBody);
    }

    throw err;
  }
}

export async function cancelOrder(client: GeminiHttpClient, orderId: string): Promise<Order> {
  return client.authenticatedPost<Order>('/v1/order/cancel', { order_id: orderId });
}

export async function cancelAllSessionOrders(client: GeminiHttpClient): Promise<Record<string, unknown>> {
  return client.authenticatedPost<Record<string, unknown>>('/v1/order/cancel/session');
}

export async function cancelAllActiveOrders(client: GeminiHttpClient): Promise<Record<string, unknown>> {
  return client.authenticatedPost<Record<string, unknown>>('/v1/order/cancel/all');
}

export async function getOrderStatus(client: GeminiHttpClient, orderId: string): Promise<Order> {
  return client.authenticatedPost<Order>('/v1/order/status', { order_id: orderId });
}

export async function getActiveOrders(client: GeminiHttpClient): Promise<Order[]> {
  return client.authenticatedPost<Order[]>('/v1/orders');
}

export async function getMyTrades(
  client: GeminiHttpClient,
  symbol: string,
  limitTrades?: number,
  timestamp?: number
): Promise<MyTrade[]> {
  const body: Record<string, unknown> = { symbol };
  if (limitTrades !== undefined) body['limit_trades'] = limitTrades;
  if (timestamp !== undefined) body['timestamp'] = timestamp;
  return client.authenticatedPost<MyTrade[]>('/v1/mytrades', body);
}

export async function getTradeVolume(client: GeminiHttpClient): Promise<TradeVolume[][]> {
  return client.authenticatedPost<TradeVolume[][]>('/v1/tradevolume');
}

export async function getNotionalVolume(client: GeminiHttpClient): Promise<NotionalVolume> {
  return client.authenticatedPost<NotionalVolume>('/v1/notionalvolume');
}
