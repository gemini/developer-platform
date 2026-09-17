import { z } from 'zod';
import type { GeminiHttpClient } from '../../client/http.js';
import type { ToolDefinition } from '../index.js';
import { wrapHandler } from '../index.js';
import * as predictions from '../../datasources/predictions/positions.js';

export function createPredictionPositionTools(client: GeminiHttpClient): ToolDefinition[] {
  return [
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
  ];
}
