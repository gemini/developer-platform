import { z } from 'zod';
import type { CategoryDef } from './spec.js';
import { compareNumeric } from './spec.js';

const params = z
  .object({
    symbol: z.string().min(1),
    direction: z.enum(['above', 'below']),
    threshold: z.string().min(1),
  })
  .strict();

export type FundingRateThresholdParams = z.infer<typeof params>;

export interface FundingRateSnapshot {
  symbol: string;
  fundingRate: string;
}

export const fundingRateThreshold: CategoryDef<
  FundingRateThresholdParams,
  FundingRateSnapshot
> = {
  category: 'funding_rate.threshold',
  schema: params,
  datasource: 'rest.funding_rate',
  defaultPollMs: 5 * 60_000,
  evaluate(p, snap) {
    if (snap.symbol.toLowerCase() !== p.symbol.toLowerCase()) {
      return { triggered: false };
    }
    const rate = Number(snap.fundingRate);
    const threshold = Number(p.threshold);
    if (!Number.isFinite(rate) || !Number.isFinite(threshold)) {
      return { triggered: false };
    }
    if (!compareNumeric(p.direction, rate, threshold)) return { triggered: false };
    return {
      triggered: true,
      reason: `${p.symbol} funding rate ${rate} ${p.direction} ${threshold}`,
      details: { rate, threshold },
    };
  },
};
