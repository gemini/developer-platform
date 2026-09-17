import type { GeminiHttpClient } from '../../client/http.js';
import type {
  OrdersResponse,
  PredictionOrder,
  CancelOrderResponse,
  TimeInForce,
  PlaceOrderBatchResponse,
  CancelOrderBatchResponse,
} from '../../types/predictions.js';

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
