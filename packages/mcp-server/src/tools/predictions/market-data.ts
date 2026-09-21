import { z } from 'zod';
import type { SdkClient } from '../../client/sdk.js';
import type { ToolDefinition } from '../index.js';
import { wrapHandler } from '../index.js';
import * as predictions from '../../datasources/predictions/market-data.js';

const EventStatusEnum = z.enum(['approved', 'active', 'closed', 'under_review', 'settled', 'invalid']);

export function createPredictionMarketDataTools(client: SdkClient): ToolDefinition[] {
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
  ];
}
