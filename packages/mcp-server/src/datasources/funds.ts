import type { GeminiHttpClient } from '../client/http.js';
import type { Balance, Transfer, DepositAddress, WithdrawalResult, InternalTransferResult, GasFeeEstimate } from '../types/funds.js';

export async function getBalances(client: GeminiHttpClient): Promise<Balance[]> {
  return client.authenticatedPost<Balance[]>('/v1/balances');
}

export async function getNotionalBalances(client: GeminiHttpClient, currency: string): Promise<Record<string, unknown>[]> {
  return client.authenticatedPost<Record<string, unknown>[]>(`/v1/notionalbalances/${currency}`);
}

export async function getTransfers(
  client: GeminiHttpClient,
  limitTransfers?: number,
  currency?: string
): Promise<Transfer[]> {
  const body: Record<string, unknown> = {};
  if (limitTransfers !== undefined) body['limit_transfers'] = limitTransfers;
  if (currency !== undefined) body['currency'] = currency;
  return client.authenticatedPost<Transfer[]>('/v1/transfers', body);
}

export async function getDepositAddresses(
  client: GeminiHttpClient,
  network: string
): Promise<DepositAddress[]> {
  return client.authenticatedPost<DepositAddress[]>(`/v1/addresses/${network}`);
}

export async function getNewDepositAddress(
  client: GeminiHttpClient,
  network: string,
  label?: string
): Promise<DepositAddress> {
  const body: Record<string, unknown> = {};
  if (label) body['label'] = label;
  return client.authenticatedPost<DepositAddress>(`/v1/deposit/${network}/newAddress`, body);
}

export async function internalTransfer(
  client: GeminiHttpClient,
  currency: string,
  sourceAccount: string,
  targetAccount: string,
  amount: string
): Promise<InternalTransferResult> {
  return client.authenticatedPost<InternalTransferResult>('/v1/account/transfer', {
    currency,
    sourceAccount,
    targetAccount,
    amount,
  });
}

export async function addBank(client: GeminiHttpClient, body: Record<string, unknown>): Promise<Record<string, unknown>> {
  return client.authenticatedPost<Record<string, unknown>>('/v1/payments/addbank', body);
}

export async function getBankPaymentMethods(client: GeminiHttpClient): Promise<Record<string, unknown>[]> {
  return client.authenticatedPost<Record<string, unknown>[]>('/v1/payments/methods');
}

export async function cryptoWithdrawal(
  client: GeminiHttpClient,
  currency: string,
  address: string,
  amount: string,
  memo?: string
): Promise<WithdrawalResult> {
  const body: Record<string, unknown> = { address, amount };
  if (memo) body['memo'] = memo;
  return client.authenticatedPost<WithdrawalResult>(`/v1/withdraw/${currency}`, body);
}

export async function getGasFeeEstimate(
  client: GeminiHttpClient,
  currency: string,
  address: string,
  amount: string
): Promise<GasFeeEstimate> {
  return client.authenticatedPost<GasFeeEstimate>(`/v1/withdraw/${currency.toLowerCase()}/feeEstimate`, { address, amount });
}

export async function fiatWithdrawal(
  client: GeminiHttpClient,
  accountId: string,
  amount: string,
  currency: string
): Promise<Record<string, unknown>> {
  return client.authenticatedPost<Record<string, unknown>>('/v1/withdraw/usd', { accountId, amount, currency });
}
