import type { GeminiHttpClient } from '../client/http.js';
import type { MarginAccount, MarginPreview, FundingPayment, ClearingOrder } from '../types/margin.js';

export async function getMarginAccount(client: GeminiHttpClient): Promise<MarginAccount[]> {
  return client.authenticatedPost<MarginAccount[]>('/v1/margin/account');
}

export async function getMarginPreview(
  client: GeminiHttpClient,
  symbol: string,
  side: string,
  quantity: string,
  price: string
): Promise<MarginPreview> {
  return client.authenticatedPost<MarginPreview>('/v1/margin/preview', { symbol, side, quantity, price });
}

export async function getOpenPositions(client: GeminiHttpClient): Promise<Record<string, unknown>[]> {
  return client.authenticatedPost<Record<string, unknown>[]>('/v1/positions');
}

export async function getFundingPayments(
  client: GeminiHttpClient,
  since?: number,
  until?: number
): Promise<FundingPayment[]> {
  const body: Record<string, unknown> = {};
  if (since !== undefined) body['since'] = since;
  if (until !== undefined) body['until'] = until;
  return client.authenticatedPost<FundingPayment[]>('/v1/fundingpayments', body);
}

export async function clearingNewOrder(
  client: GeminiHttpClient,
  body: Record<string, unknown>
): Promise<ClearingOrder> {
  return client.authenticatedPost<ClearingOrder>('/v1/clearing/new', body);
}

export async function clearingBrokerNewOrder(
  client: GeminiHttpClient,
  body: Record<string, unknown>
): Promise<ClearingOrder> {
  return client.authenticatedPost<ClearingOrder>('/v1/clearing/broker/new', body);
}

export async function clearingOrderStatus(
  client: GeminiHttpClient,
  clearingId: string
): Promise<ClearingOrder> {
  return client.authenticatedPost<ClearingOrder>('/v1/clearing/status', { clearing_id: clearingId });
}
