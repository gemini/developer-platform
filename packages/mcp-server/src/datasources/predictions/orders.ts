import type { SdkClient } from '../../client/sdk.js';
import { withAccountScope } from '../../client/sdk.js';
import type {
  OrdersResponse,
  PredictionOrder,
  CancelOrderResponse,
  TimeInForce,
  PlaceOrderBatchResponse,
  CancelOrderBatchResponse,
  BatchOrderResult,
} from '../../types/predictions.js';

type PredictionsService = SdkClient['predictions'];
type SdkPlaceOrderInput = Parameters<PredictionsService['placeOrder']>[0];
type SdkOrdersResult = Awaited<ReturnType<PredictionsService['getActiveOrders']>>;
type SdkOrder = NonNullable<SdkOrdersResult['orders']>[number];
type SdkPlaceBatchResult = Awaited<ReturnType<PredictionsService['placeOrderBatch']>>['results'][number];
type SdkCancelBatchResult = Awaited<ReturnType<PredictionsService['cancelOrderBatch']>>['results'][number];
type SdkBatchOrder = Extract<SdkPlaceBatchResult, { order: unknown }>['order'];

export interface OrderInput {
  symbol: string;
  side: 'buy' | 'sell';
  outcome: 'yes' | 'no';
  quantity: string;
  price: string;
  timeInForce?: TimeInForce;
}

// The tool keeps offering timeInForce: 'maker-or-cancel', but the SDK's TimeInForce enum
// has no such value — maker-or-cancel is its own makerOrCancel flag, and the SDK's request
// validation rejects the old value before anything is sent. Map it onto the flag (leaving
// timeInForce at the API's good-til-cancel default) so the tool contract is unchanged.
function toSdkOrder(order: OrderInput): SdkPlaceOrderInput {
  const makerOrCancel = order.timeInForce === 'maker-or-cancel';
  return {
    symbol: order.symbol,
    orderType: 'limit',
    side: order.side,
    outcome: order.outcome,
    quantity: order.quantity,
    price: order.price,
    ...(order.timeInForce && order.timeInForce !== 'maker-or-cancel' ? { timeInForce: order.timeInForce } : {}),
    makerOrCancel,
  };
}

// The legacy client passed every order response through unmapped, so tool output carried
// every field the API sent. Keep that: spread the SDK's object and only stringify orderId,
// the one int64 field the SDK decodes to bigint — never Number(), which loses precision on
// these 17–18 digit IDs, and bigint isn't serializable by wrapHandler's JSON.stringify.
function mapOrder(o: SdkOrder): PredictionOrder {
  return { ...o, orderId: o.orderId?.toString() } as PredictionOrder;
}

function mapBatchOrder(o: SdkBatchOrder): BatchOrderResult {
  return { ...o, orderId: o.orderId.toString() } as BatchOrderResult;
}

// Results stay positional and keep rejected entries verbatim — callers must be able to
// report each order's own outcome, not assume a 200 means the whole batch succeeded.
function mapPlaceBatchResult(r: SdkPlaceBatchResult): PlaceOrderBatchResponse['results'][number] {
  return 'order' in r ? { ...r, order: mapBatchOrder(r.order) } : r;
}

function mapCancelBatchResult(r: SdkCancelBatchResult): CancelOrderBatchResponse['results'][number] {
  return { ...r, orderId: r.orderId.toString() };
}

function mapOrdersResult(result: SdkOrdersResult): OrdersResponse {
  return { ...result, orders: result.orders?.map(mapOrder) } as OrdersResponse;
}

export async function placeOrder(client: SdkClient, order: OrderInput): Promise<PredictionOrder> {
  const result = await client.predictions.placeOrder(withAccountScope(toSdkOrder(order)));
  return mapOrder(result);
}

export async function cancelOrder(client: SdkClient, orderId: string): Promise<CancelOrderResponse> {
  // The SDK types orderId as bigint here (no string form accepted); BigInt() keeps all
  // 17–18 digits exact.
  const result = await client.predictions.cancelOrder(withAccountScope({ orderId: BigInt(orderId) }));
  return result as CancelOrderResponse;
}

export async function placeOrderBatch(
  client: SdkClient,
  orders: OrderInput[]
): Promise<PlaceOrderBatchResponse> {
  const result = await client.predictions.placeOrderBatch(
    withAccountScope({ orders: orders.map(toSdkOrder) })
  );
  return { ...result, results: result.results.map(mapPlaceBatchResult) };
}

export async function cancelOrderBatch(
  client: SdkClient,
  orderIds: string[]
): Promise<CancelOrderBatchResponse> {
  // Unlike the single cancel, the batch cancel accepts numeric strings as-is.
  const result = await client.predictions.cancelOrderBatch(withAccountScope({ orderIds }));
  return { ...result, results: result.results.map(mapCancelBatchResult) };
}

// Same filter semantics as the legacy client: an empty symbol/status is not sent at all.
export async function getActiveOrders(
  client: SdkClient,
  opts: { symbol?: string; limit?: number; offset?: number } = {}
): Promise<OrdersResponse> {
  const input: NonNullable<Parameters<PredictionsService['getActiveOrders']>[0]> = {};
  if (opts.symbol) input.symbol = opts.symbol;
  if (opts.limit !== undefined) input.limit = opts.limit;
  if (opts.offset !== undefined) input.offset = opts.offset;
  return mapOrdersResult(await client.predictions.getActiveOrders(withAccountScope(input)));
}

export async function getOrderHistory(
  client: SdkClient,
  opts: { status?: 'filled' | 'cancelled'; symbol?: string; limit?: number; offset?: number } = {}
): Promise<OrdersResponse> {
  const input: NonNullable<Parameters<PredictionsService['getOrderHistory']>[0]> = {};
  if (opts.status) input.status = opts.status;
  if (opts.symbol) input.symbol = opts.symbol;
  if (opts.limit !== undefined) input.limit = opts.limit;
  if (opts.offset !== undefined) input.offset = opts.offset;
  return mapOrdersResult(await client.predictions.getOrderHistory(withAccountScope(input)));
}
