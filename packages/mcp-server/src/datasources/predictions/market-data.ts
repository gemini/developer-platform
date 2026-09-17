import type { GeminiHttpClient } from '../../client/http.js';
import type {
  EventStatus,
  EventsResponse,
  PredictionEvent,
  EventStrike,
  VolumeMetrics,
} from '../../types/predictions.js';

export async function listEvents(
  client: GeminiHttpClient,
  opts: {
    status?: EventStatus[];
    category?: string[];
    search?: string;
    limit?: number;
    offset?: number;
  } = {}
): Promise<EventsResponse> {
  const params: Record<string, string | string[]> = {};
  if (opts.status?.length) params['status'] = opts.status;
  if (opts.category?.length) params['category'] = opts.category;
  if (opts.search) params['search'] = opts.search;
  if (opts.limit !== undefined) params['limit'] = String(opts.limit);
  if (opts.offset !== undefined) params['offset'] = String(opts.offset);
  return client.publicGet<EventsResponse>('/v1/prediction-markets/events', params);
}

export async function getEvent(
  client: GeminiHttpClient,
  eventTicker: string
): Promise<PredictionEvent> {
  return client.publicGet<PredictionEvent>(`/v1/prediction-markets/events/${eventTicker}`);
}

export async function getEventStrike(
  client: GeminiHttpClient,
  eventTicker: string
): Promise<EventStrike> {
  return client.publicGet<EventStrike>(`/v1/prediction-markets/events/${eventTicker}/strike`);
}

export async function listNewlyListed(
  client: GeminiHttpClient,
  opts: { category?: string[]; limit?: number; offset?: number } = {}
): Promise<EventsResponse> {
  const params: Record<string, string | string[]> = {};
  if (opts.category?.length) params['category'] = opts.category;
  if (opts.limit !== undefined) params['limit'] = String(opts.limit);
  if (opts.offset !== undefined) params['offset'] = String(opts.offset);
  return client.publicGet<EventsResponse>('/v1/prediction-markets/events/newly-listed', params);
}

export async function listRecentlySettled(
  client: GeminiHttpClient,
  opts: { category?: string[]; limit?: number; offset?: number } = {}
): Promise<EventsResponse> {
  const params: Record<string, string | string[]> = {};
  if (opts.category?.length) params['category'] = opts.category;
  if (opts.limit !== undefined) params['limit'] = String(opts.limit);
  if (opts.offset !== undefined) params['offset'] = String(opts.offset);
  return client.publicGet<EventsResponse>('/v1/prediction-markets/events/recently-settled', params);
}

export async function listUpcoming(
  client: GeminiHttpClient,
  opts: { category?: string[]; limit?: number; offset?: number } = {}
): Promise<EventsResponse> {
  const params: Record<string, string | string[]> = {};
  if (opts.category?.length) params['category'] = opts.category;
  if (opts.limit !== undefined) params['limit'] = String(opts.limit);
  if (opts.offset !== undefined) params['offset'] = String(opts.offset);
  return client.publicGet<EventsResponse>('/v1/prediction-markets/events/upcoming', params);
}

export async function listCategories(
  client: GeminiHttpClient,
  status?: EventStatus[]
): Promise<{ categories: string[] }> {
  const params: Record<string, string | string[]> = {};
  if (status?.length) params['status'] = status;
  return client.publicGet<{ categories: string[] }>('/v1/prediction-markets/categories', params);
}

export async function getVolumeMetrics(
  client: GeminiHttpClient,
  eventTicker: string,
  opts: { startTime?: number; endTime?: number } = {}
): Promise<VolumeMetrics> {
  const body: Record<string, unknown> = { eventTicker };
  if (opts.startTime !== undefined) body['startTime'] = opts.startTime;
  if (opts.endTime !== undefined) body['endTime'] = opts.endTime;
  return client.authenticatedPost<VolumeMetrics>('/v1/prediction-markets/metrics/volume', body);
}
