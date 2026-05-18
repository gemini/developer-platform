import { z } from 'zod';
import type { CategoryDef } from './spec.js';

const params = z
  .object({
    eventTicker: z.string().optional(),
  })
  .strict();

export type PredictionSettledParams = z.infer<typeof params>;

export interface PredictionEventRecord {
  id: string;
  ticker: string;
  status: string;
  settlementValue?: string;
  settlementTime?: string;
}

export interface PredictionSnapshot {
  events: PredictionEventRecord[];
}

function isSettled(e: PredictionEventRecord): boolean {
  return e.status.toLowerCase() === 'settled';
}

export const predictionSettled: CategoryDef<PredictionSettledParams, PredictionSnapshot> = {
  category: 'prediction.settled',
  schema: params,
  datasource: 'rest.predictions_settled',
  defaultPollMs: 5 * 60_000,
  evaluate(p, snap, prev) {
    const priorIds = new Set((prev?.events ?? []).filter(isSettled).map((e) => e.id));
    const newlySettled = snap.events.find((e) => {
      if (!isSettled(e)) return false;
      if (p.eventTicker && e.ticker !== p.eventTicker) return false;
      return !priorIds.has(e.id);
    });
    if (!newlySettled) return { triggered: false };
    return {
      triggered: true,
      reason: `Prediction event ${newlySettled.ticker} settled${newlySettled.settlementValue ? ` at ${newlySettled.settlementValue}` : ''}`,
      details: {
        id: newlySettled.id,
        ticker: newlySettled.ticker,
        settlementValue: newlySettled.settlementValue,
      },
    };
  },
};
