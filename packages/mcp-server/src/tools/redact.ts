import type { Transfer, WithdrawalResult } from '../types/funds.js';
import type { Account, AccountDetail, ApprovedAddress } from '../types/account.js';

export const redacted = (reason: string): string =>
  `[redacted: ${reason} — ask the user if needed]`;

const TRANSFER_PURPOSE = redacted('user-set free text from the sender');
const WITHDRAWAL_MESSAGE = redacted('API-returned free text');
const ACCOUNT_MEMO_REF = redacted('free-text memo reference');
const ACCOUNT_AGREEMENT = redacted('agreement text');
const APPROVED_ADDRESS_LABEL = redacted('user-set address label');

export function redactTransfer(t: Transfer): Transfer {
  if (t.purpose === undefined) return t;
  return { ...t, purpose: TRANSFER_PURPOSE };
}

export function redactWithdrawalResult(w: WithdrawalResult): WithdrawalResult {
  if (w.message === undefined) return w;
  return { ...w, message: WITHDRAWAL_MESSAGE };
}

export function redactAccount(a: Account): Account {
  return { ...a, memo_reference_code: ACCOUNT_MEMO_REF };
}

export function redactAccountDetail(a: AccountDetail): AccountDetail {
  return { ...a, agreement: ACCOUNT_AGREEMENT };
}

export function redactApprovedAddress(a: ApprovedAddress): ApprovedAddress {
  return { ...a, label: APPROVED_ADDRESS_LABEL };
}
