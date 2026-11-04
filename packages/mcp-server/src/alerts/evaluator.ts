import { getCategoryDef } from './categories/index.js';
import type { AlertRule } from './types.js';

export type SkipReason = 'disabled' | 'cooldown' | 'oneShot' | 'invalid_params';

export interface EvaluateInput {
  rule: AlertRule;
  snapshot: unknown;
  prev?: unknown;
  now?: number;
}

export interface EvaluateOutput {
  triggered: boolean;
  reason: string;
  skip?: SkipReason;
  details?: Record<string, unknown>;
}

export function evaluateRule(input: EvaluateInput): EvaluateOutput {
  const { rule, snapshot, prev } = input;
  const now = input.now ?? Date.now();

  if (!rule.enabled) {
    return { triggered: false, reason: 'rule disabled', skip: 'disabled' };
  }

  if (rule.lastFiredAt) {
    const last = Date.parse(rule.lastFiredAt);
    if (rule.oneShot) {
      return { triggered: false, reason: 'oneShot already fired', skip: 'oneShot' };
    }
    if (Number.isFinite(last) && now - last < rule.cooldownMs) {
      return { triggered: false, reason: 'within cooldown window', skip: 'cooldown' };
    }
  }

  const def = getCategoryDef(rule.category);
  const parsed = def.schema.safeParse(rule.params);
  if (!parsed.success) {
    return {
      triggered: false,
      reason: `invalid params: ${parsed.error.issues.map((i) => i.message).join('; ')}`,
      skip: 'invalid_params',
    };
  }

  const result = def.evaluate(parsed.data, snapshot, prev, now);
  if (!result.triggered) {
    return { triggered: false, reason: result.reason ?? 'no match' };
  }
  return {
    triggered: true,
    reason: result.reason ?? `${rule.category} matched`,
    details: result.details,
  };
}
