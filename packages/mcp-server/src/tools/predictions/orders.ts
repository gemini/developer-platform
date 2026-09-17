import { z } from 'zod';
import type { GeminiHttpClient } from '../../client/http.js';
import type { ToolDefinition } from '../index.js';
import { wrapHandler, confirmField } from '../index.js';
import * as predictions from '../../datasources/predictions/orders.js';

const TimeInForceEnum = z.enum(['good-til-cancel', 'immediate-or-cancel', 'fill-or-kill', 'maker-or-cancel']);

export function createPredictionOrderTools(client: GeminiHttpClient): ToolDefinition[] {
  return [
    {
      name: 'gemini_place_prediction_order',
      description:
        'Place a limit order on a prediction market contract. ' +
        'Each contract has YES and NO sides; price represents implied probability (0.01–0.99). ' +
        'Winning contracts pay out $1.00.',
      inputSchema: z.object({
        symbol: z.string().describe('Contract instrument symbol (e.g. GEMI-PRES2028-VANCE)'),
        side: z.enum(['buy', 'sell']).describe('Order side'),
        outcome: z.enum(['yes', 'no']).describe('Contract outcome to trade'),
        quantity: z.string().describe('Number of contracts'),
        price: z.string().describe('Limit price between 0.01 and 0.99 (represents probability)'),
        timeInForce: TimeInForceEnum.optional().describe(
          'Time in force: good-til-cancel (default), immediate-or-cancel, fill-or-kill, maker-or-cancel'
        ),
        confirm: confirmField,
      }),
      handler: wrapHandler((args) => predictions.placeOrder(client, args)),
      mutates: 'destructive',
    },
    {
      name: 'gemini_cancel_prediction_order',
      description: 'Cancel an open prediction market order by order ID.',
      inputSchema: z.object({
        // String, not number — prediction-market order IDs are 17–18 digits
        // (e.g. `145828833218573125` in prod), exceeding JavaScript's
        // Number.MAX_SAFE_INTEGER (2^53 − 1, ≈ 16 digits). A `z.number().int()`
        // schema silently truncates the trailing digit, so the cancel hits
        // the API with the wrong ID and gets back a 404. Spot orders
        // (orders.ts) use the same string-typed pattern.
        orderId: z.string().describe('Order ID to cancel'),
        confirm: confirmField,
      }),
      handler: wrapHandler(({ orderId }) => predictions.cancelOrder(client, orderId)),
      mutates: 'destructive',
    },
    {
      name: 'gemini_place_prediction_order_batch',
      description:
        'Place up to 20 prediction-market limit orders in a single request. ' +
        'Every order in the batch is validated before any order is submitted, but each order is still ' +
        'executed independently once validation passes. The response contains one result per order, ' +
        'positional (same order as the request), and the results can be a mix of accepted and rejected ' +
        'entries — a successful (200) response does NOT mean every order in the batch was accepted. ' +
        'You MUST inspect and report each order\'s own outcome to the user rather than assuming the whole ' +
        'batch succeeded or failed together.',
      inputSchema: z.object({
        orders: z
          .array(
            z.object({
              symbol: z.string().describe('Contract instrument symbol (e.g. GEMI-PRES2028-VANCE)'),
              side: z.enum(['buy', 'sell']).describe('Order side'),
              outcome: z.enum(['yes', 'no']).describe('Contract outcome to trade'),
              quantity: z.string().describe('Number of contracts'),
              price: z.string().describe('Limit price between 0.01 and 0.99 (represents probability)'),
              timeInForce: TimeInForceEnum.optional().describe(
                'Time in force: good-til-cancel (default), immediate-or-cancel, fill-or-kill, maker-or-cancel'
              ),
            })
          )
          .min(1)
          .max(20)
          .describe('Orders to place, 1-20 per batch'),
        confirm: confirmField,
      }),
      handler: wrapHandler((args) => predictions.placeOrderBatch(client, args.orders)),
      mutates: 'destructive',
    },
    {
      name: 'gemini_cancel_prediction_order_batch',
      description:
        'Cancel up to 20 open prediction-market orders in a single request by order ID. ' +
        'Results are positional (same order as the request) and may mix successful and rejected ' +
        'cancellations in the same response — report each order\'s own outcome to the user rather than ' +
        'assuming a successful response means every order was cancelled.',
      inputSchema: z.object({
        // Strings, not numbers — same reasoning as gemini_cancel_prediction_order's
        // orderId above: prediction-market order IDs are 17–18 digits in prod,
        // exceeding JavaScript's Number.MAX_SAFE_INTEGER (2^53 − 1, ≈ 16 digits).
        orderIds: z
          .array(z.string().describe('Order ID to cancel'))
          .min(1)
          .max(20)
          .describe('Order IDs to cancel, 1-20 per batch')
          .refine((ids) => new Set(ids).size === ids.length, {
            message: 'orderIds must not contain duplicates',
          }),
        confirm: confirmField,
      }),
      handler: wrapHandler(({ orderIds }) => predictions.cancelOrderBatch(client, orderIds)),
      mutates: 'destructive',
    },
    {
      name: 'gemini_get_prediction_active_orders',
      description: 'Get open prediction market orders for the authenticated account.',
      inputSchema: z.object({
        symbol: z.string().optional().describe('Filter by contract symbol'),
        limit: z.number().min(1).max(100).optional().describe('Number of results (default 50, max 100)'),
        offset: z.number().min(0).optional().describe('Pagination offset'),
      }),
      handler: wrapHandler((args) => predictions.getActiveOrders(client, args)),
    },
    {
      name: 'gemini_get_prediction_order_history',
      description: 'Get historical prediction market orders (filled or cancelled).',
      inputSchema: z.object({
        status: z.enum(['filled', 'cancelled']).optional().describe('Filter by order status'),
        symbol: z.string().optional().describe('Filter by contract symbol'),
        limit: z.number().min(1).max(100).optional().describe('Number of results (default 50, max 100)'),
        offset: z.number().min(0).optional().describe('Pagination offset'),
      }),
      handler: wrapHandler((args) => predictions.getOrderHistory(client, args)),
    },
  ];
}
