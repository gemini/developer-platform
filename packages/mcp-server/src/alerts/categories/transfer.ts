import { z } from 'zod';
import type { CategoryDef } from './spec.js';

const params = z
  .object({
    currency: z.string().optional(),
  })
  .strict();

export type TransferDepositConfirmedParams = z.infer<typeof params>;

export interface TransferRecord {
  type: string;
  status: string;
  currency: string;
  amount: string;
  eid: number;
  timestampms: number;
}

export interface TransferSnapshot {
  transfers: TransferRecord[];
}

const DEPOSIT = 'deposit';
const COMPLETE = 'complete';

function isConfirmedDeposit(t: TransferRecord): boolean {
  return t.type.toLowerCase() === DEPOSIT && t.status.toLowerCase() === COMPLETE;
}

export const transferDepositConfirmed: CategoryDef<
  TransferDepositConfirmedParams,
  TransferSnapshot
> = {
  category: 'transfer.deposit_confirmed',
  schema: params,
  datasource: 'rest.transfers',
  defaultPollMs: 60_000,
  evaluate(p, snap, prev) {
    const priorIds = new Set(
      (prev?.transfers ?? []).filter(isConfirmedDeposit).map((t) => t.eid),
    );
    const newlyConfirmed = snap.transfers.find((t) => {
      if (!isConfirmedDeposit(t)) return false;
      if (p.currency && t.currency.toLowerCase() !== p.currency.toLowerCase()) return false;
      return !priorIds.has(t.eid);
    });
    if (!newlyConfirmed) return { triggered: false };
    return {
      triggered: true,
      reason: `Deposit of ${newlyConfirmed.amount} ${newlyConfirmed.currency} confirmed (eid=${newlyConfirmed.eid})`,
      details: { eid: newlyConfirmed.eid, currency: newlyConfirmed.currency, amount: newlyConfirmed.amount },
    };
  },
};
