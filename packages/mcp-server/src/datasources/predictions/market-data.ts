import type { SdkClient } from '../../client/sdk.js';
import { config } from '../../config.js';
import type {
  EventStatus,
  EventsResponse,
  PredictionEvent,
  EventStrike,
  VolumeMetrics,
} from '../../types/predictions.js';

// The SDK's generated response types are derived from the full OpenAPI spec and
// carry many more optional fields than these hand-verified-against-production
// shapes (see types/predictions.ts) need. Cast through `unknown` rather than
// widening the exported return types, so every other call site in this package
// keeps the same contract it had against the legacy GeminiHttpClient.
type SdkInput<M extends (...args: never[]) => unknown> = Parameters<M>[0];

export async function listEvents(
  client: SdkClient,
  opts: {
    status?: EventStatus[];
    category?: string[];
    search?: string;
    limit?: number;
    offset?: number;
  } = {}
): Promise<EventsResponse> {
  const input: Record<string, unknown> = {};
  if (opts.status?.length) input['status'] = opts.status;
  if (opts.category?.length) input['category'] = opts.category;
  if (opts.search) input['search'] = opts.search;
  if (opts.limit !== undefined) input['limit'] = opts.limit;
  if (opts.offset !== undefined) input['offset'] = opts.offset;
  const response = await client.predictions.listEvents(
    input as SdkInput<typeof client.predictions.listEvents>
  );
  return response as unknown as EventsResponse;
}

export async function getEvent(client: SdkClient, eventTicker: string): Promise<PredictionEvent> {
  const response = await client.predictions.getEvent({ eventTicker });
  return response as unknown as PredictionEvent;
}

export async function getEventStrike(client: SdkClient, eventTicker: string): Promise<EventStrike> {
  const response = await client.predictions.getEventStrike({ eventTicker });
  return response as unknown as EventStrike;
}

export async function listNewlyListed(
  client: SdkClient,
  opts: { category?: string[]; limit?: number; offset?: number } = {}
): Promise<EventsResponse> {
  const input: Record<string, unknown> = {};
  if (opts.category?.length) input['category'] = opts.category;
  if (opts.limit !== undefined) input['limit'] = opts.limit;
  if (opts.offset !== undefined) input['offset'] = opts.offset;
  const response = await client.predictions.listNewlyListedEvents(
    input as SdkInput<typeof client.predictions.listNewlyListedEvents>
  );
  return response as unknown as EventsResponse;
}

export async function listRecentlySettled(
  client: SdkClient,
  opts: { category?: string[]; limit?: number; offset?: number } = {}
): Promise<EventsResponse> {
  const input: Record<string, unknown> = {};
  if (opts.category?.length) input['category'] = opts.category;
  if (opts.limit !== undefined) input['limit'] = opts.limit;
  if (opts.offset !== undefined) input['offset'] = opts.offset;
  const response = await client.predictions.listRecentlySettledEvents(
    input as SdkInput<typeof client.predictions.listRecentlySettledEvents>
  );
  return response as unknown as EventsResponse;
}

export async function listUpcoming(
  client: SdkClient,
  opts: { category?: string[]; limit?: number; offset?: number } = {}
): Promise<EventsResponse> {
  const input: Record<string, unknown> = {};
  if (opts.category?.length) input['category'] = opts.category;
  if (opts.limit !== undefined) input['limit'] = opts.limit;
  if (opts.offset !== undefined) input['offset'] = opts.offset;
  const response = await client.predictions.listUpcomingEvents(
    input as SdkInput<typeof client.predictions.listUpcomingEvents>
  );
  return response as unknown as EventsResponse;
}

export async function listCategories(
  client: SdkClient,
  status?: EventStatus[]
): Promise<{ categories: string[] }> {
  const input: Record<string, unknown> = {};
  if (status?.length) input['status'] = status;
  const response = await client.predictions.getCategories(
    input as SdkInput<typeof client.predictions.getCategories>
  );
  return response as unknown as { categories: string[] };
}

export async function getVolumeMetrics(
  client: SdkClient,
  eventTicker: string,
  opts: { startTime?: number; endTime?: number } = {}
): Promise<VolumeMetrics> {
  const input: Record<string, unknown> = { eventTicker };
  if (opts.startTime !== undefined) input['startTime'] = opts.startTime;
  if (opts.endTime !== undefined) input['endTime'] = opts.endTime;
  // getVolumeMetrics is authenticated (the one exception among these 8 endpoints).
  // The legacy GeminiHttpClient.authenticatedPost injected config.account into every
  // authenticated body; the SDK has no first-class account-scope field, but its body
  // builder forwards any extra input key straight through, so replicate the same
  // sub-account scoping here rather than silently dropping it.
  if (config.account) input['account'] = config.account;
  const response = await client.predictions.getVolumeMetrics(
    input as SdkInput<typeof client.predictions.getVolumeMetrics>
  );
  return response as unknown as VolumeMetrics;
}
