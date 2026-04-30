import { z } from 'zod';
import type { GeminiHttpClient } from '../client/http.js';
import type { ToolDefinition } from './index.js';
import { wrapHandler, confirmField } from './index.js';
import * as orders from '../datasources/orders.js';

export function createOrderTools(client: GeminiHttpClient): ToolDefinition[] {
  return [
    {
      name: 'gemini_new_order',
      description: 'Place a new order. Note: "exchange market" order type is not supported for all symbols (e.g. ETHUSD). If placing a market-style order, prefer "exchange limit" with the current ask price (for buys) or bid price (for sells) to achieve immediate fill. The handler will automatically fall back to a limit order at the current market price if a market order is rejected with InvalidOrderType.',
      inputSchema: z.object({
        symbol: z.string().describe('Trading symbol e.g. btcusd'),
        amount: z.string().describe('Amount to buy or sell'),
        price: z.string().describe('Price per unit'),
        side: z.enum(['buy', 'sell']).describe('Order side'),
        type: z.string().describe('Order type e.g. exchange limit'),
        options: z.array(z.string()).optional().describe('Order options'),
        clientOrderId: z.string().optional().describe('Client-specified order ID'),
        confirm: confirmField,
      }),
      handler: wrapHandler(({ symbol, amount, price, side, type, options, clientOrderId }: {
        symbol: string; amount: string; price: string; side: 'buy' | 'sell';
        type: string; options?: string[]; clientOrderId?: string;
      }) => orders.newOrder(client, symbol, amount, price, side, type, options, clientOrderId)),
      destructive: true,
    },
    {
      name: 'gemini_cancel_order',
      description: 'Cancel an active order',
      inputSchema: z.object({
        orderId: z.string().describe('Order ID to cancel'),
        confirm: confirmField,
      }),
      handler: wrapHandler(({ orderId }: { orderId: string }) => orders.cancelOrder(client, orderId)),
      destructive: true,
    },
    {
      name: 'gemini_cancel_all_session_orders',
      description: 'Cancel all orders in the current session',
      inputSchema: z.object({}),
      handler: wrapHandler(() => orders.cancelAllSessionOrders(client)),
    },
    {
      name: 'gemini_cancel_all_active_orders',
      description: 'Cancel all active orders',
      inputSchema: z.object({ confirm: confirmField }),
      handler: wrapHandler(() => orders.cancelAllActiveOrders(client)),
      destructive: true,
    },
    {
      name: 'gemini_get_order_status',
      description: 'Get the status of an order',
      inputSchema: z.object({ orderId: z.string().describe('Order ID') }),
      handler: wrapHandler(({ orderId }: { orderId: string }) => orders.getOrderStatus(client, orderId)),
    },
    {
      name: 'gemini_get_active_orders',
      description: 'Get all active orders',
      inputSchema: z.object({}),
      handler: wrapHandler(() => orders.getActiveOrders(client)),
    },
    {
      name: 'gemini_get_my_trades',
      description: 'Get trade history for a symbol',
      inputSchema: z.object({
        symbol: z.string().describe('Trading symbol'),
        limitTrades: z.number().optional().describe('Maximum number of trades to return'),
        timestamp: z.number().optional().describe('Only return trades after this timestamp'),
      }),
      handler: wrapHandler(({ symbol, limitTrades, timestamp }: { symbol: string; limitTrades?: number; timestamp?: number }) =>
        orders.getMyTrades(client, symbol, limitTrades, timestamp)
      ),
    },
    {
      name: 'gemini_get_trade_volume',
      description: 'Get trade volume statistics',
      inputSchema: z.object({}),
      handler: wrapHandler(() => orders.getTradeVolume(client)),
    },
    {
      name: 'gemini_get_notional_volume',
      description: 'Get notional volume and fee tier information',
      inputSchema: z.object({}),
      handler: wrapHandler(() => orders.getNotionalVolume(client)),
    },
  ];
}
