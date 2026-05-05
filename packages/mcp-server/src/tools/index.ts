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

// Strips terminal/control characters that have no legitimate place in API JSON
// but can smuggle hidden directives or display reordering into the LLM context.
// ANSI CSI escapes, C0/C1 controls (except \t \n \r), and Unicode bidi overrides
// (Trojan-Source family: U+202A-U+202E, U+2066-U+2069).
const ANSI_ESC = /\x1B\[[0-?]*[ -/]*[@-~]/g;
// eslint-disable-next-line no-control-regex
const CONTROL_BYTES = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F]/g;
const BIDI_OVERRIDES = /[‪-‮⁦-⁩]/g;

const STRING_CAP = 2000;

function sanitizeString(s: string): string {
  const cleaned = s.replace(ANSI_ESC, '').replace(CONTROL_BYTES, '').replace(BIDI_OVERRIDES, '');
  if (cleaned.length <= STRING_CAP) return cleaned;
  const omitted = cleaned.length - STRING_CAP;
  return `${cleaned.slice(0, STRING_CAP)}…[truncated, ${omitted} chars omitted]`;
}

export function sanitizeForLLM(value: unknown): unknown {
  if (typeof value === 'string') return sanitizeString(value);
  if (Array.isArray(value)) return value.map(sanitizeForLLM);
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = sanitizeForLLM(v);
    return out;
  }
  return value;
}

function wrap(text: string): string {
  return `<tool-output server="gemini-mcp">\n${text}\n</tool-output>`;
}

export function wrapHandler<S extends z.ZodTypeAny>(
  handler: (args: z.infer<S>) => Promise<unknown>
): (args: z.infer<S>) => Promise<CallToolResult> {
  return async (args: z.infer<S>): Promise<CallToolResult> => {
    try {
      const result = await handler(args);
      const safe = sanitizeForLLM(result);
      return {
        content: [{ type: 'text', text: wrap(JSON.stringify(safe, null, 2)) }],
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        content: [{ type: 'text', text: wrap(`Error: ${sanitizeString(message)}`) }],
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
