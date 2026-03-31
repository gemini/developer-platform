export interface Balance {
  type: string;
  currency: string;
  amount: string;
  available: string;
  availableForWithdrawal: string;
}

export interface Transfer {
  type: string;
  status: string;
  timestampms: number;
  eid: number;
  currency: string;
  amount: string;
  method?: string;
  txHash?: string;
  outputIdx?: number;
  destination?: string;
  purpose?: string;
}

export interface DepositAddress {
  currency: string;
  address: string;
  timestamp: number;
  label?: string;
}

export interface WithdrawalResult {
  address: string;
  amount: string;
  txHash?: string;
  withdrawalId?: string;
  message?: string;
}

export interface GasFeeEstimate {
  currency: string;
  fee: string;
  isOverride: boolean;
  monthlyLimit: number;
  monthlyRemaining: number;
}

export interface InternalTransferResult {
  sourceAccount: Record<string, unknown>;
  targetAccount: Record<string, unknown>;
  currency: string;
  amount: string;
  balances: Record<string, unknown>;
}
