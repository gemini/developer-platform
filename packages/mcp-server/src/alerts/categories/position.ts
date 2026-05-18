import { z } from 'zod';
import type { CategoryDef } from './spec.js';

const params = z
  .object({
    symbol: z.string().min(1),
    marginPctRemaining: z.number().min(0).max(100),
  })
  .strict();

export type PositionLiquidationRiskParams = z.infer<typeof params>;

export interface PositionSnapshot {
  symbol: string;
  marginPctRemaining: number;
  liquidationPrice?: string;
  currentPrice?: string;
}

export const positionLiquidationRisk: CategoryDef<
  PositionLiquidationRiskParams,
  PositionSnapshot
> = {
  category: 'position.liquidation_risk',
  schema: params,
  datasource: 'rest.positions',
  defaultPollMs: 30_000,
  evaluate(p, snap) {
    if (snap.symbol.toLowerCase() !== p.symbol.toLowerCase()) {
      return { triggered: false };
    }
    if (snap.marginPctRemaining > p.marginPctRemaining) return { triggered: false };
    return {
      triggered: true,
      reason: `${p.symbol} margin remaining ${snap.marginPctRemaining.toFixed(2)}% (<= ${p.marginPctRemaining}%)`,
      details: {
        marginPctRemaining: snap.marginPctRemaining,
        liquidationPrice: snap.liquidationPrice,
        currentPrice: snap.currentPrice,
      },
    };
  },
};
