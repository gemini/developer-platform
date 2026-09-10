import { z } from 'zod';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

// How a tool changes state. Drives both the MCP annotations and the
// confirmation gate in server.ts:
//   undefined     - read-only. Published as `readOnlyHint: true`.
//   'write'       - changes state but moves no funds, and is recoverable or
//                   idempotent (e.g. registering a canonical combo contract,
//                   which returns the existing one if it is already there).
//                   NOT confirm-gated: prompting on harmless writes trains
//                   users to click through the prompts that do matter.
//   'destructive' - irreversible and/or moves funds. Published as
//                   `destructiveHint: true`; callers MUST pass `confirm: true`.
export type ToolMutation = 'write' | 'destructive';

export interface ToolDefinition<S extends z.ZodTypeAny = z.ZodTypeAny> {
  name: string;
  description: string;
  inputSchema: S;
  handler: (args: z.infer<S>) => Promise<CallToolResult>;
  mutates?: ToolMutation;
}

// Derived in one place so the published annotations and the confirmation gate
// in server.ts can never disagree about a tool's mutation kind.
export function annotationsFor(tool: ToolDefinition): {
  title: string;
  readOnlyHint: boolean;
  destructiveHint: boolean;
} {
  return {
    title: tool.name,
    readOnlyHint: tool.mutates === undefined,
    destructiveHint: tool.mutates === 'destructive',
  };
}

export function requiresConfirmation(tool: ToolDefinition): boolean {
  return tool.mutates === 'destructive';
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

function sanitizeString(s: string, cap: number = STRING_CAP): string {
  const cleaned = s.replace(ANSI_ESC, '').replace(CONTROL_BYTES, '').replace(BIDI_OVERRIDES, '');
  if (cleaned.length <= cap) return cleaned;
  const omitted = cleaned.length - cap;
  return `${cleaned.slice(0, cap)}…[truncated, ${omitted} chars omitted]`;
}

export function sanitizeForLLM(value: unknown, cap: number = STRING_CAP): unknown {
  if (typeof value === 'string') return sanitizeString(value, cap);
  if (Array.isArray(value)) return value.map((item) => sanitizeForLLM(item, cap));
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = sanitizeForLLM(v, cap);
    return out;
  }
  return value;
}

function wrap(text: string): string {
  return `<tool-output server="gemini-mcp">\n${text}\n</tool-output>`;
}

export interface WrapHandlerOptions {
  // Raises the per-string truncation cap for this tool only. Needed by tools
  // whose payload is legitimately long prose — `gemini_get_prediction_terms`
  // returns a full terms-of-service document, and truncating it at the 2000
  // char default would defeat the point of reading the terms before accepting
  // them. Sanitization itself (ANSI, control bytes, bidi overrides) is
  // unconditional and is NOT affected by this option.
  stringCap?: number;
}

export function wrapHandler<S extends z.ZodTypeAny>(
  handler: (args: z.infer<S>) => Promise<unknown>,
  opts?: WrapHandlerOptions
): (args: z.infer<S>) => Promise<CallToolResult> {
  return async (args: z.infer<S>): Promise<CallToolResult> => {
    try {
      const result = await handler(args);
      const safe = sanitizeForLLM(result, opts?.stringCap);
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
export { createAlertTools } from './alerts.js';
