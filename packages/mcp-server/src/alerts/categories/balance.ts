import { z } from 'zod';
import type { CategoryDef } from './spec.js';

const params = z
  .object({
    currency: z.string().min(1),
    direction: z.enum(['above', 'below']),
    delta: z.string().optional(),
    pct: z.number().positive().optional(),
  })
  .strict()
  .refine((p) => p.delta !== undefined || p.pct !== undefined, {
    message: 'balance.change requires either delta or pct',
  });

export type BalanceChangeParams = z.infer<typeof params>;

export interface BalanceSnapshot {
  currency: string;
  balance: string;
}

export const balanceChange: CategoryDef<BalanceChangeParams, BalanceSnapshot> = {
  category: 'balance.change',
  schema: params,
  datasource: 'rest.balances',
  defaultPollMs: 60_000,
  evaluate(p, snap, prev) {
    if (!prev) return { triggered: false };
    if (snap.currency.toLowerCase() !== p.currency.toLowerCase()) {
      return { triggered: false };
    }
    const cur = Number(snap.balance);
    const before = Number(prev.balance);
    if (!Number.isFinite(cur) || !Number.isFinite(before)) return { triggered: false };

    const diff = p.direction === 'above' ? cur - before : before - cur;

    if (p.delta !== undefined) {
      const delta = Number(p.delta);
      if (!Number.isFinite(delta)) return { triggered: false };
      if (diff >= delta) {
        return {
          triggered: true,
          reason: `${p.currency} balance ${p.direction === 'above' ? 'rose' : 'fell'} by ${diff} (>= ${delta})`,
          details: { previous: prev.balance, current: snap.balance, diff },
        };
      }
    }

    if (p.pct !== undefined && before > 0) {
      const pct = (diff / before) * 100;
      if (pct >= p.pct) {
        return {
          triggered: true,
          reason: `${p.currency} balance ${p.direction === 'above' ? 'rose' : 'fell'} ${pct.toFixed(3)}% (>= ${p.pct}%)`,
          details: { previous: prev.balance, current: snap.balance, pct },
        };
      }
    }

    return { triggered: false };
  },
};
