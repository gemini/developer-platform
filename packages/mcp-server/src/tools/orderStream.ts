import { z } from 'zod';
import type { ToolDefinition } from './index.js';
import { wrapHandler } from './index.js';
import type { MarketDataStore } from '../store/index.js';
import type { CachedOrderUpdate } from '../types/websocket.js';

const DEFAULT_WAIT_MS = 2000;
const MAX_WAIT_MS = 5000;

/**
 * The slice of WebSocketManager this tool needs — kept narrow so tests can
 * inject a fake. Deliberately its own interface/file, not folded into
 * marketStream.ts's MarketStreamSource: orders@account is authenticated and
 * carries real account activity, a different risk class from the public
 * bookTicker/contractStatus streams.
 */
export interface OrderStreamSource {
  isConnected(): boolean;
  initialize(): Promise<void>;
  subscribeAccountOrders(): Promise<void>;
  getStore(): MarketDataStore;
}

// Guards against concurrent tool calls racing GeminiWebSocketClient.connect(),
// same reasoning as marketStream.ts's ensureConnected.
let connecting: Promise<void> | null = null;

async function ensureConnected(manager: OrderStreamSource): Promise<void> {
  if (manager.isConnected()) return;
  if (!connecting) {
    connecting = manager.initialize().finally(() => {
      connecting = null;
    });
  }
  await connecting;
}

function waitForOrderUpdate(
  store: MarketDataStore,
  orderId: string,
  waitMs: number
): Promise<CachedOrderUpdate | undefined> {
  const existing = store.getOrder(orderId);
  if (existing || waitMs <= 0) return Promise.resolve(existing);

  return new Promise((resolve) => {
    const stop = store.onOrderUpdate(orderId, (update) => {
      clearTimeout(timer);
      stop();
      resolve(update);
    });
    const timer = setTimeout(() => {
      stop();
      resolve(store.getOrder(orderId));
    }, waitMs);
  });
}

async function getOrderUpdates(manager: OrderStreamSource, orderId: string, waitMs: number) {
  await ensureConnected(manager);
  await manager.subscribeAccountOrders();

  const store = manager.getStore();
  const update = await waitForOrderUpdate(store, orderId, waitMs);

  if (!update) {
    return {
      orderId,
      status: 'subscribed_no_data_yet',
      message:
        `Subscribed to orders@account but no update for order ${orderId} has been observed yet. ` +
        'This only reflects activity since the feed subscribed — it has no replay/backfill, so an ' +
        'event that already happened before this tool was first called will not appear here. Call ' +
        'again shortly, or use gemini_get_prediction_active_orders / gemini_get_prediction_order_history ' +
        'for full history.',
    };
  }

  return {
    orderId: update.orderId,
    clientOrderId: update.clientOrderId,
    symbol: update.symbol,
    side: update.side,
    orderType: update.orderType,
    status: update.status,
    outcome: update.outcome,
    price: update.price,
    stopPrice: update.stopPrice,
    quantity: update.quantity,
    remainingQty: update.remainingQty,
    executedQty: update.executedQty,
    lastExecutedPrice: update.lastExecutedPrice,
    tradeId: update.tradeId,
    feeAmount: update.feeAmount,
    isMaker: update.isMaker,
    rejectReason: update.rejectReason,
    eventTimeMs: update.eventTimeMs,
    dataAgeMs: Date.now() - update.timestamp,
  };
}

export function createOrderStreamTools(manager: OrderStreamSource): ToolDefinition[] {
  return [
    {
      name: 'gemini_get_order_updates',
      description:
        'Get near-real-time fill/cancellation/rejection confirmation for a specific order over the ' +
        'Gemini WebSocket feed (orders@account), instead of polling gemini_get_prediction_active_orders ' +
        '/ gemini_get_prediction_order_history. Requires GEMINI_API_KEY and GEMINI_API_SECRET to be ' +
        'configured. Takes the exact order ID returned by gemini_place_prediction_order. The first call ' +
        'subscribes and waits briefly for the next event; subsequent calls return the latest cached ' +
        'event immediately. Only reflects activity observed since the feed was subscribed — for full ' +
        'order history use the REST tools instead.',
      inputSchema: z.object({
        orderId: z.string().describe('Order ID to watch (e.g. returned by gemini_place_prediction_order)'),
        waitMs: z
          .number()
          .min(0)
          .max(MAX_WAIT_MS)
          .optional()
          .describe(`Max time in ms to wait for an update if uncached (default ${DEFAULT_WAIT_MS}, max ${MAX_WAIT_MS})`),
      }),
      handler: wrapHandler(({ orderId, waitMs }) => getOrderUpdates(manager, orderId, waitMs ?? DEFAULT_WAIT_MS)),
    },
  ];
}
