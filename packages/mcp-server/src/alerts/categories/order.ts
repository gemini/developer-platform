import { z } from 'zod';
import type { CategoryDef } from './spec.js';

const filledParams = z
  .object({
    orderId: z.string().optional(),
    clientOrderId: z.string().optional(),
    symbol: z.string().optional(),
  })
  .strict()
  .refine((p) => p.orderId || p.clientOrderId || p.symbol, {
    message: 'order.filled requires one of: orderId, clientOrderId, symbol',
  });

export type OrderFilledParams = z.infer<typeof filledParams>;

export interface OrderRecord {
  order_id: string;
  client_order_id?: string;
  symbol: string;
  is_live: boolean;
  is_cancelled: boolean;
  executed_amount: string;
  remaining_amount: string;
  original_amount: string;
  stop_price?: string;
}

export interface OrderSnapshot {
  orders: OrderRecord[];
}

function matches(p: { orderId?: string; clientOrderId?: string; symbol?: string }, o: OrderRecord) {
  if (p.orderId && o.order_id !== p.orderId) return false;
  if (p.clientOrderId && o.client_order_id !== p.clientOrderId) return false;
  if (p.symbol && o.symbol.toLowerCase() !== p.symbol.toLowerCase()) return false;
  return p.orderId !== undefined || p.clientOrderId !== undefined || p.symbol !== undefined;
}

function isFilled(o: OrderRecord): boolean {
  return (
    !o.is_live &&
    !o.is_cancelled &&
    Number(o.remaining_amount) === 0 &&
    Number(o.executed_amount) > 0
  );
}

export const orderFilled: CategoryDef<OrderFilledParams, OrderSnapshot> = {
  category: 'order.filled',
  schema: filledParams,
  datasource: 'rest.orders',
  defaultPollMs: 10_000,
  evaluate(p, snap, prev) {
    const newlyFilled = snap.orders.find((o) => {
      if (!matches(p, o) || !isFilled(o)) return false;
      if (!prev) return true;
      const prior = prev.orders.find((x) => x.order_id === o.order_id);
      return !prior || !isFilled(prior);
    });
    if (!newlyFilled) return { triggered: false };
    return {
      triggered: true,
      reason: `Order ${newlyFilled.order_id} (${newlyFilled.symbol}) filled ${newlyFilled.executed_amount}/${newlyFilled.original_amount}`,
      details: { order_id: newlyFilled.order_id, symbol: newlyFilled.symbol },
    };
  },
};

const stopParams = z
  .object({
    orderId: z.string().optional(),
    symbol: z.string().optional(),
  })
  .strict()
  .refine((p) => p.orderId || p.symbol, {
    message: 'order.stop_triggered requires orderId or symbol',
  });

export type OrderStopTriggeredParams = z.infer<typeof stopParams>;

export const orderStopTriggered: CategoryDef<OrderStopTriggeredParams, OrderSnapshot> = {
  category: 'order.stop_triggered',
  schema: stopParams,
  datasource: 'rest.orders',
  defaultPollMs: 10_000,
  evaluate(p, snap, prev) {
    const tripped = snap.orders.find((o) => {
      if (!o.stop_price) return false;
      if (!matches({ ...p }, o)) return false;
      const triggered = !o.is_live && Number(o.executed_amount) > 0;
      if (!triggered) return false;
      if (!prev) return true;
      const prior = prev.orders.find((x) => x.order_id === o.order_id);
      const wasTriggered = prior && !prior.is_live && Number(prior.executed_amount) > 0;
      return !wasTriggered;
    });
    if (!tripped) return { triggered: false };
    return {
      triggered: true,
      reason: `Stop order ${tripped.order_id} (${tripped.symbol}) triggered at stop=${tripped.stop_price}`,
      details: { order_id: tripped.order_id, symbol: tripped.symbol, stop_price: tripped.stop_price },
    };
  },
};
