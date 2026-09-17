import type { GeminiHttpClient } from '../client/http.js';
import type {
  EventStatus,
  EventsResponse,
  PredictionEvent,
  EventStrike,
  OrdersResponse,
  PositionsResponse,
  PredictionOrder,
  CancelOrderResponse,
  VolumeMetrics,
  TimeInForce,
  PlaceOrderBatchResponse,
  CancelOrderBatchResponse,
  SettledPositionsResponse,
  ListCombosResponse,
  ComboResponse,
  CreateComboResponse,
} from '../types/predictions.js';

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

export async function placeOrder(
  client: GeminiHttpClient,
  order: {
    symbol: string;
    side: 'buy' | 'sell';
    outcome: 'yes' | 'no';
    quantity: string;
    price: string;
    timeInForce?: TimeInForce;
  }
): Promise<PredictionOrder> {
  return client.authenticatedPost<PredictionOrder>('/v1/prediction-markets/order', {
    symbol: order.symbol,
    orderType: 'limit',
    side: order.side,
    outcome: order.outcome,
    quantity: order.quantity,
    price: order.price,
    ...(order.timeInForce ? { timeInForce: order.timeInForce } : {}),
  });
}

export async function cancelOrder(
  client: GeminiHttpClient,
  orderId: string
): Promise<CancelOrderResponse> {
  return client.authenticatedPost<CancelOrderResponse>('/v1/prediction-markets/order/cancel', {
    orderId,
  });
}

export async function placeOrderBatch(
  client: GeminiHttpClient,
  orders: Array<{
    symbol: string;
    side: 'buy' | 'sell';
    outcome: 'yes' | 'no';
    quantity: string;
    price: string;
    timeInForce?: TimeInForce;
  }>
): Promise<PlaceOrderBatchResponse> {
  return client.authenticatedPost<PlaceOrderBatchResponse>('/v1/prediction-markets/order/batch', {
    orders: orders.map((order) => ({
      symbol: order.symbol,
      orderType: 'limit',
      side: order.side,
      outcome: order.outcome,
      quantity: order.quantity,
      price: order.price,
      ...(order.timeInForce ? { timeInForce: order.timeInForce } : {}),
    })),
  });
}

export async function cancelOrderBatch(
  client: GeminiHttpClient,
  orderIds: string[]
): Promise<CancelOrderBatchResponse> {
  return client.authenticatedPost<CancelOrderBatchResponse>(
    '/v1/prediction-markets/order/batch/cancel',
    { orderIds }
  );
}

export async function getActiveOrders(
  client: GeminiHttpClient,
  opts: { symbol?: string; limit?: number; offset?: number } = {}
): Promise<OrdersResponse> {
  const body: Record<string, unknown> = {};
  if (opts.symbol) body['symbol'] = opts.symbol;
  if (opts.limit !== undefined) body['limit'] = opts.limit;
  if (opts.offset !== undefined) body['offset'] = opts.offset;
  return client.authenticatedPost<OrdersResponse>('/v1/prediction-markets/orders/active', body);
}

export async function getOrderHistory(
  client: GeminiHttpClient,
  opts: { status?: 'filled' | 'cancelled'; symbol?: string; limit?: number; offset?: number } = {}
): Promise<OrdersResponse> {
  const body: Record<string, unknown> = {};
  if (opts.status) body['status'] = opts.status;
  if (opts.symbol) body['symbol'] = opts.symbol;
  if (opts.limit !== undefined) body['limit'] = opts.limit;
  if (opts.offset !== undefined) body['offset'] = opts.offset;
  return client.authenticatedPost<OrdersResponse>('/v1/prediction-markets/orders/history', body);
}

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

export async function listCombos(
  client: GeminiHttpClient,
  opts: { status?: string; contractId?: string; instrumentRegistered?: boolean; limit?: number; offset?: number } = {}
): Promise<ListCombosResponse> {
  const params: Record<string, string> = {};
  if (opts.status) params['status'] = opts.status;
  if (opts.contractId) params['contractId'] = opts.contractId;
  if (opts.instrumentRegistered !== undefined) params['instrumentRegistered'] = String(opts.instrumentRegistered);
  if (opts.limit !== undefined) params['limit'] = String(opts.limit);
  if (opts.offset !== undefined) params['offset'] = String(opts.offset);
  return client.publicGet<ListCombosResponse>('/v1/prediction-markets/combos', params);
}

export async function getCombo(
  client: GeminiHttpClient,
  instrumentSymbol: string
): Promise<ComboResponse> {
  return client.publicGet<ComboResponse>(`/v1/prediction-markets/combos/${instrumentSymbol}`);
}

export async function createCombo(
  client: GeminiHttpClient,
  legs: Array<{ contractId: string; requiredOutcome: 'Yes' | 'No' }>
): Promise<CreateComboResponse> {
  return client.authenticatedPost<CreateComboResponse>('/v1/prediction-markets/combos', { legs });
}
