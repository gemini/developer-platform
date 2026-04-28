import { z } from 'zod';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

export interface ToolDefinition<S extends z.ZodTypeAny = z.ZodTypeAny> {
  name: string;
  description: string;
  inputSchema: S;
  handler: (args: z.infer<S>) => Promise<CallToolResult>;
  destructive?: boolean;
}

export const confirmField = z.literal(true).describe(
  'REQUIRED for this destructive, irreversible action. Set to true ONLY after presenting the user with a plain-language summary of the call (symbol, amount, side, dollar-quantified impact where applicable) and obtaining their explicit approval.'
);

export function wrapHandler<S extends z.ZodTypeAny>(
  handler: (args: z.infer<S>) => Promise<unknown>
): (args: z.infer<S>) => Promise<CallToolResult> {
  return async (args: z.infer<S>): Promise<CallToolResult> => {
    try {
      const result = await handler(args);
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        content: [{ type: 'text', text: `Error: ${message}` }],
        isError: true,
      };
    }
  };
}

export { createMarketTools } from './market.js';
export { createOrderTools } from './orders.js';
export { createFundTools } from './funds.js';
export { createAccountTools } from './account.js';
export { createMarginTools } from './margin.js';
export { createStakingTools } from './staking.js';
export { createPredictionTools } from './predictions.js';
