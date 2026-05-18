import type { z } from 'zod';
import type { AlertCategory } from '../types.js';

export interface CategoryEvalResult {
  triggered: boolean;
  reason?: string;
  details?: Record<string, unknown>;
}

export interface CategoryDef<P = unknown, S = unknown> {
  category: AlertCategory;
  schema: z.ZodType<P>;
  /**
   * Identifier the scheduler uses to coalesce work. Two rules sharing a
   * datasource must be servable by a single fetch (REST) or a single
   * subscription per param-key (WS).
   */
  datasource: string;
  /**
   * Default poll cadence in ms for REST datasources. 0 means push-only (WS).
   */
  defaultPollMs: number;
  evaluate(params: P, snapshot: S, prev: S | undefined, now: number): CategoryEvalResult;
}

export type AnyCategoryDef = CategoryDef<unknown, unknown>;

export function compareNumeric(
  direction: 'above' | 'below',
  value: number,
  threshold: number,
): boolean {
  return direction === 'above' ? value >= threshold : value <= threshold;
}
