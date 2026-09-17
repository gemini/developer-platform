import type { GeminiHttpClient } from '../../client/http.js';
import type { PositionsResponse, SettledPositionsResponse } from '../../types/predictions.js';

export async function getPositions(
  client: GeminiHttpClient,
  opts: { eventTicker?: string; limit?: number; offset?: number; sort?: string } = {}
): Promise<PositionsResponse> {
  const params: Record<string, string> = {};
  if (opts.eventTicker) params['eventTicker'] = opts.eventTicker;
  if (opts.limit !== undefined) params['limit'] = String(opts.limit);
  if (opts.offset !== undefined) params['offset'] = String(opts.offset);
  if (opts.sort) params['sort'] = opts.sort;
  return client.authenticatedPost<PositionsResponse>(
    '/v1/prediction-markets/positions',
    undefined,
    params
  );
}

export async function getSettledPositions(
  client: GeminiHttpClient,
  opts: {
    eventTicker?: string;
    limit?: number;
    offset?: number;
    sort?: string;
    search?: string;
    category?: string;
    withCashOuts?: boolean;
  } = {}
): Promise<SettledPositionsResponse> {
  const params: Record<string, string> = {};
  if (opts.eventTicker) params['eventTicker'] = opts.eventTicker;
  if (opts.limit !== undefined) params['limit'] = String(opts.limit);
  if (opts.offset !== undefined) params['offset'] = String(opts.offset);
  if (opts.sort) params['sort'] = opts.sort;
  if (opts.search) params['search'] = opts.search;
  if (opts.category) params['category'] = opts.category;
  if (opts.withCashOuts !== undefined) params['withCashOuts'] = String(opts.withCashOuts);
  return client.authenticatedPost<SettledPositionsResponse>(
    '/v1/prediction-markets/positions/settled',
    undefined,
    params
  );
}
