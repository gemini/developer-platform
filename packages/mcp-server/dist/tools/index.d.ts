import { z } from 'zod';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
export interface ToolDefinition<S extends z.ZodTypeAny = z.ZodTypeAny> {
    name: string;
    description: string;
    inputSchema: S;
    handler: (args: z.infer<S>) => Promise<CallToolResult>;
}
export declare function wrapHandler<S extends z.ZodTypeAny>(handler: (args: z.infer<S>) => Promise<unknown>): (args: z.infer<S>) => Promise<CallToolResult>;
export { createMarketTools } from './market.js';
export { createOrderTools } from './orders.js';
export { createFundTools } from './funds.js';
export { createAccountTools } from './account.js';
export { createMarginTools } from './margin.js';
export { createStakingTools } from './staking.js';
