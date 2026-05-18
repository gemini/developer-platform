import { z } from 'zod';
import type { CategoryDef } from './spec.js';
import { compareNumeric } from './spec.js';

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${Math.round(ms / 1000)} sec`;
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)} min`;
  if (ms < 86_400_000) {
    const h = Math.round(ms / 3_600_000);
    return `${h} hour${h === 1 ? '' : 's'}`;
  }
  const d = Math.round(ms / 86_400_000);
  return `${d} day${d === 1 ? '' : 's'}`;
}

/**
 * Best-effort quote-currency prefix for human-readable price values. Only
 * prefixes for the major fiat quotes Gemini lists; perps and crypto-quoted
 * pairs fall through to bare numbers. The trade-off is fewer mistakes
 * (e.g. labeling BTC-quoted volume as "$") at the cost of less polish on
 * non-fiat pairs.
 */
function quotePrefix(symbol: string): string {
  const u = symbol.toUpperCase();
  if (u.endsWith('USD') || u.endsWith('USDT') || u.endsWith('GUSD')) return '$';
  if (u.endsWith('EUR')) return '€';
  if (u.endsWith('GBP')) return '£';
  return '';
}

const directionSchema = z.enum(['above', 'below']);

const thresholdParams = z
  .object({
    symbol: z.string().min(1),
    direction: directionSchema,
    threshold: z.string().min(1),
  })
  .strict();
export type PriceThresholdParams = z.infer<typeof thresholdParams>;

export interface PriceSnapshot {
  price: string;
  timestamp: number;
}

export const priceThreshold: CategoryDef<PriceThresholdParams, PriceSnapshot> = {
  category: 'price.threshold',
  schema: thresholdParams,
  datasource: 'ws.price',
  defaultPollMs: 0,
  evaluate(params, snapshot) {
    const value = Number(snapshot.price);
    const threshold = Number(params.threshold);
    if (!Number.isFinite(value) || !Number.isFinite(threshold)) {
      return { triggered: false };
    }
    const triggered = compareNumeric(params.direction, value, threshold);
    return triggered
      ? {
          triggered,
          reason: `${params.symbol} ${params.direction} ${threshold} (price=${value})`,
          details: { price: snapshot.price, threshold: params.threshold },
        }
      : { triggered: false };
  },
};

const percentParams = z
  .object({
    symbol: z.string().min(1),
    direction: directionSchema,
    pct: z.number().positive(),
    windowMs: z.number().int().positive(),
  })
  .strict();
export type PricePercentChangeParams = z.infer<typeof percentParams>;

export interface PricePercentSnapshot {
  price: string;
  baselinePrice: string;
  baselineAt: number;
}

export const pricePercentChange: CategoryDef<PricePercentChangeParams, PricePercentSnapshot> = {
  category: 'price.percent_change',
  schema: percentParams,
  datasource: 'ws.price',
  defaultPollMs: 0,
  evaluate(params, snapshot) {
    const cur = Number(snapshot.price);
    const base = Number(snapshot.baselinePrice);
    if (!Number.isFinite(cur) || !Number.isFinite(base) || base === 0) {
      return { triggered: false };
    }
    const change = ((cur - base) / base) * 100;
    const triggered =
      params.direction === 'above' ? change >= params.pct : change <= -params.pct;
    return triggered
      ? {
          triggered,
          reason: `${params.symbol} ${change.toFixed(3)}% over ${formatDuration(params.windowMs)} (>= ${params.pct}%)`,
          details: { change, baseline: snapshot.baselinePrice, price: snapshot.price },
        }
      : { triggered: false };
  },
};

const absoluteParams = z
  .object({
    symbol: z.string().min(1),
    /** 'either' fires on a move of >= delta in any direction. */
    direction: z.enum(['above', 'below', 'either']),
    delta: z.string().min(1),
    windowMs: z.number().int().positive(),
  })
  .strict();
export type PriceAbsoluteChangeParams = z.infer<typeof absoluteParams>;

export const priceAbsoluteChange: CategoryDef<PriceAbsoluteChangeParams, PricePercentSnapshot> = {
  category: 'price.absolute_change',
  schema: absoluteParams,
  datasource: 'ws.price',
  defaultPollMs: 0,
  evaluate(params, snapshot) {
    const cur = Number(snapshot.price);
    const base = Number(snapshot.baselinePrice);
    const delta = Number(params.delta);
    if (!Number.isFinite(cur) || !Number.isFinite(base) || !Number.isFinite(delta)) {
      return { triggered: false };
    }
    const diff = cur - base;
    let triggered = false;
    if (params.direction === 'above') triggered = diff >= delta;
    else if (params.direction === 'below') triggered = -diff >= delta;
    else triggered = Math.abs(diff) >= delta;
    const prefix = quotePrefix(params.symbol);
    return triggered
      ? {
          triggered,
          reason: `${params.symbol} moved ${diff >= 0 ? '+' : ''}${prefix}${diff.toFixed(2)} over ${formatDuration(params.windowMs)} (>= ${prefix}${delta})`,
          details: { diff, baseline: snapshot.baselinePrice, price: snapshot.price },
        }
      : { triggered: false };
  },
};
