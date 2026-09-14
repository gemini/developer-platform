import { z } from 'zod';
import type { GeminiHttpClient } from '../client/http.js';
import type { ToolDefinition } from './index.js';
import { wrapHandler, confirmField } from './index.js';
import * as predictions from '../datasources/predictions.js';

const EventStatusEnum = z.enum(['approved', 'active', 'closed', 'under_review', 'settled', 'invalid']);

const TimeInForceEnum = z.enum(['good-til-cancel', 'immediate-or-cancel', 'fill-or-kill', 'maker-or-cancel']);

export function createPredictionTools(client: GeminiHttpClient): ToolDefinition[] {
  return [
    {
      name: 'gemini_list_prediction_events',
      description:
        'List prediction market events on Gemini. Supports filtering by status, category, and search text. ' +
        'Categories include sports, crypto, politics, and financial markets. ' +
        'Event symbols start with "GEMI-". ' +
        'IMPORTANT: Always filter by category when the user specifies or implies a category (e.g. "NBA" or "basketball" → "Sports", "bitcoin" → "Crypto"). ' +
        'Use gemini_list_prediction_categories to discover available categories before listing events.',
      inputSchema: z.object({
        status: z
          .array(EventStatusEnum)
          .optional()
          .describe('Filter by event status (approved, active, closed, under_review, settled, invalid)'),
        category: z
          .array(z.string())
          .optional()
          .describe(
            'Filter by category (e.g. sports, crypto, politics). Prefer providing this whenever a category can be inferred from the request to reduce response size.'
          ),
        search: z.string().optional().describe('Search text for event titles'),
        limit: z.number().min(1).max(500).optional().describe('Number of results to return (default 50, max 500)'),
        offset: z.number().min(0).optional().describe('Pagination offset'),
      }),
      handler: wrapHandler((args) => predictions.listEvents(client, args)),
    },
    {
      name: 'gemini_get_prediction_event',
      description: 'Get details for a specific prediction market event by its ticker symbol.',
      inputSchema: z.object({
        eventTicker: z.string().describe('Event ticker symbol (e.g. GEMI-PRES2028)'),
      }),
      handler: wrapHandler(({ eventTicker }) => predictions.getEvent(client, eventTicker)),
    },
    {
      name: 'gemini_get_prediction_event_strike',
      description: 'Get the strike price / reference value for a prediction market event.',
      inputSchema: z.object({
        eventTicker: z.string().describe('Event ticker symbol'),
      }),
      handler: wrapHandler(({ eventTicker }) => predictions.getEventStrike(client, eventTicker)),
    },
    {
      name: 'gemini_list_newly_listed_prediction_events',
      description: 'List recently added prediction market events.',
      inputSchema: z.object({
        category: z.array(z.string()).optional().describe('Filter by category'),
        limit: z.number().min(1).max(500).optional().describe('Number of results (default 50)'),
        offset: z.number().min(0).optional().describe('Pagination offset'),
      }),
      handler: wrapHandler((args) => predictions.listNewlyListed(client, args)),
    },
    {
      name: 'gemini_list_recently_settled_prediction_events',
      description: 'List prediction market events that have recently resolved/settled.',
      inputSchema: z.object({
        category: z.array(z.string()).optional().describe('Filter by category'),
        limit: z.number().min(1).max(500).optional().describe('Number of results (default 50)'),
        offset: z.number().min(0).optional().describe('Pagination offset'),
      }),
      handler: wrapHandler((args) => predictions.listRecentlySettled(client, args)),
    },
    {
      name: 'gemini_list_upcoming_prediction_events',
      description: 'List upcoming prediction market events that have not yet opened for trading.',
      inputSchema: z.object({
        category: z.array(z.string()).optional().describe('Filter by category'),
        limit: z.number().min(1).max(500).optional().describe('Number of results (default 50)'),
        offset: z.number().min(0).optional().describe('Pagination offset'),
      }),
      handler: wrapHandler((args) => predictions.listUpcoming(client, args)),
    },
    {
      name: 'gemini_list_prediction_categories',
      description:
        'List available prediction market categories (e.g. sports, crypto, politics, financial markets).',
      inputSchema: z.object({
        status: z
          .array(EventStatusEnum)
          .optional()
          .describe('Filter categories to those with events in these statuses'),
      }),
      handler: wrapHandler(({ status }) => predictions.listCategories(client, status)),
    },
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
    {
      name: 'gemini_get_prediction_positions',
      description:
        'Get current prediction market positions held by the authenticated account. ' +
        'Supports filtering by event and sorting by position value, unrealized P&L, or expiry date.',
      inputSchema: z.object({
        eventTicker: z.string().optional().describe('Filter to a single event ticker'),
        limit: z.number().min(1).max(1000).optional().describe('Maximum number of positions to return'),
        offset: z.number().min(0).optional().describe('Number of positions to skip for pagination'),
        sort: z
          .enum([
            'positionValue',
            '+positionValue',
            '-positionValue',
            'unrealizedPnl',
            '+unrealizedPnl',
            '-unrealizedPnl',
            'expiryDate',
            '+expiryDate',
            '-expiryDate',
          ])
          .optional()
          .describe(
            'Sort order. Bare field name uses its default direction (positionValue/unrealizedPnl: descending, expiryDate: ascending); prefix with + or - to override.'
          ),
      }),
      handler: wrapHandler((args) => predictions.getPositions(client, args)),
    },
    {
      name: 'gemini_get_prediction_settled_positions',
      description:
        'Get historically settled prediction market positions (closed-out P&L after a market ' +
        'resolves) for the authenticated account. ' +
        'IMPORTANT: totalCostBasis, totalNetProfit, and totalPayout are frequently absent from ' +
        'the response — their absence means "not computed", not zero. If you need a total, sum ' +
        'the positions array yourself rather than relying on these fields being present. ' +
        'Set withCashOuts to true to also include early sells (cash-outs) from before contract ' +
        'resolution in the same time window; omitting it leaves the response shape unchanged.',
      inputSchema: z.object({
        eventTicker: z.string().optional().describe('Filter to a single event ticker'),
        limit: z.number().min(1).optional().describe('Maximum number of settled positions to return'),
        offset: z.number().min(0).optional().describe('Number of settled positions to skip for pagination'),
        sort: z
          .enum(['date', '+date', '-date', 'payout', '+payout', '-payout'])
          .optional()
          .describe(
            'Sort order (default: most recent first). Note: ascending date (+date) is not ' +
              'supported by the API and silently falls back to the default order.'
          ),
        search: z
          .string()
          .optional()
          .describe(
            'Case-insensitive substring filter over event/contract name and category. Inputs ' +
              'under 3 characters are ignored; over 64 characters are truncated.'
          ),
        category: z.string().optional().describe('Filter to settled positions in this category (or its descendants)'),
        withCashOuts: z
          .boolean()
          .optional()
          .describe('Include early-sell cash-outs from the same time window as sibling fields'),
      }),
      handler: wrapHandler((args) => predictions.getSettledPositions(client, args)),
    },
    {
      name: 'gemini_get_prediction_volume_metrics',
      description: 'Get trading volume metrics for a prediction market event.',
      inputSchema: z.object({
        eventTicker: z.string().describe('Event ticker symbol'),
        startTime: z.number().optional().describe('Start of time range in epoch milliseconds'),
        endTime: z.number().optional().describe('End of time range in epoch milliseconds'),
      }),
      handler: wrapHandler(({ eventTicker, startTime, endTime }) =>
        predictions.getVolumeMetrics(client, eventTicker, { startTime, endTime })
      ),
    },
    {
      name: 'gemini_list_prediction_combos',
      description:
        'List multi-leg combo contracts on Gemini. A combo bundles 2-6 underlying prediction ' +
        'market contracts, each with a required outcome, into a single tradeable instrument. ' +
        'Defaults to Active combos when status is not specified.',
      inputSchema: z.object({
        status: z.string().optional().describe('Filter by combo status (e.g. Active, Settled, Voided). Defaults to Active.'),
        contractId: z.string().optional().describe('Filter to combos containing this underlying contract ID as a leg'),
        instrumentRegistered: z.boolean().optional().describe('Filter by whether the combo has a registered tradeable instrument symbol'),
        limit: z.number().min(1).max(500).optional().describe('Number of results (max 500)'),
        offset: z.number().min(0).optional().describe('Pagination offset'),
      }),
      handler: wrapHandler((args) => predictions.listCombos(client, args)),
    },
    {
      name: 'gemini_get_prediction_combo',
      description: 'Get the legs and contract metadata for a single combo by its instrument symbol.',
      inputSchema: z.object({
        instrumentSymbol: z.string().describe('Combo instrument symbol'),
      }),
      handler: wrapHandler(({ instrumentSymbol }) => predictions.getCombo(client, instrumentSymbol)),
    },
    {
      name: 'gemini_create_prediction_combo',
      description:
        'Register a canonical combo contract for a set of 2-6 underlying contract legs, or ' +
        'retrieve the existing one if this exact set of legs was already registered ' +
        '(alreadyExisted: true). This does NOT place a trade and moves no funds — it only ' +
        'registers the combo so it can be discovered and traded as a single instrument. Leg ' +
        'order does not create a distinct combo; the service canonicalizes the complete leg ' +
        'set. Once registered with an instrument symbol, trade it using gemini_place_prediction_order ' +
        'with that symbol.',
      inputSchema: z.object({
        legs: z
          .array(
            z.object({
              contractId: z.string().describe('Underlying contract ID as a decimal string'),
              requiredOutcome: z.enum(['Yes', 'No']).describe('Outcome this leg must settle for the combo to settle YES'),
            })
          )
          .min(2)
          .max(6)
          .describe('2-6 distinct underlying contract legs')
          .refine(
            (legs) => new Set(legs.map((l) => l.contractId)).size === legs.length,
            { message: 'legs must not contain duplicate contractIds' }
          ),
      }),
      handler: wrapHandler((args) => predictions.createCombo(client, args.legs)),
      mutates: 'write',
    },
  ];
}
