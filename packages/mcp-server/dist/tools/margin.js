import { z } from 'zod';
import { wrapHandler } from './index.js';
import * as margin from '../datasources/margin.js';
export function createMarginTools(client) {
    return [
        {
            name: 'gemini_get_margin_account',
            description: 'Get margin account information',
            inputSchema: z.object({}),
            handler: wrapHandler(() => margin.getMarginAccount(client)),
        },
        {
            name: 'gemini_get_margin_preview',
            description: 'Preview a margin order',
            inputSchema: z.object({
                symbol: z.string().describe('Trading symbol'),
                side: z.enum(['buy', 'sell']).describe('Order side'),
                quantity: z.string().describe('Order quantity'),
                price: z.string().describe('Order price'),
            }),
            handler: wrapHandler(({ symbol, side, quantity, price }) => margin.getMarginPreview(client, symbol, side, quantity, price)),
        },
        {
            name: 'gemini_get_open_positions',
            description: 'Get open perpetual contract positions',
            inputSchema: z.object({}),
            handler: wrapHandler(() => margin.getOpenPositions(client)),
        },
        {
            name: 'gemini_get_funding_payments',
            description: 'Get funding payment history for perpetual contracts',
            inputSchema: z.object({
                since: z.number().optional().describe('Start timestamp (ms)'),
                until: z.number().optional().describe('End timestamp (ms)'),
            }),
            handler: wrapHandler(({ since, until }) => margin.getFundingPayments(client, since, until)),
        },
        {
            name: 'gemini_clearing_new_order',
            description: 'Place a new clearing order',
            inputSchema: z.object({
                symbol: z.string().describe('Symbol'),
                amount: z.string().describe('Amount'),
                price: z.string().describe('Price'),
                side: z.enum(['buy', 'sell']).describe('Side'),
                type: z.string().describe('Order type'),
                clearingId: z.string().optional().describe('Clearing ID'),
            }),
            handler: wrapHandler((body) => margin.clearingNewOrder(client, body)),
        },
        {
            name: 'gemini_clearing_broker_new_order',
            description: 'Place a new clearing broker order',
            inputSchema: z.object({
                symbol: z.string().describe('Symbol'),
                amount: z.string().describe('Amount'),
                price: z.string().describe('Price'),
                side: z.enum(['buy', 'sell']).describe('Side'),
                type: z.string().describe('Order type'),
            }),
            handler: wrapHandler((body) => margin.clearingBrokerNewOrder(client, body)),
        },
        {
            name: 'gemini_clearing_order_status',
            description: 'Get the status of a clearing order',
            inputSchema: z.object({ clearingId: z.string().describe('Clearing order ID') }),
            handler: wrapHandler(({ clearingId }) => margin.clearingOrderStatus(client, clearingId)),
        },
    ];
}
