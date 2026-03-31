import type { GeminiHttpClient } from '../client/http.js';
import type { StakingBalance, StakingHistory, StakingRate, StakingResult } from '../types/staking.js';

export async function getStakingBalances(client: GeminiHttpClient): Promise<StakingBalance[]> {
  return client.authenticatedPost<StakingBalance[]>('/v1/balances/staking');
}

export async function getStakingHistory(client: GeminiHttpClient): Promise<StakingHistory[]> {
  return client.authenticatedPost<StakingHistory[]>('/v1/staking/history');
}

export async function getStakingRates(client: GeminiHttpClient): Promise<StakingRate[]> {
  return client.authenticatedPost<StakingRate[]>('/v1/staking/rates');
}

export async function stake(
  client: GeminiHttpClient,
  currency: string,
  amount: string,
  providerId: string
): Promise<StakingResult> {
  return client.authenticatedPost<StakingResult>('/v1/staking/stake', { currency, amount, providerId });
}

export async function unstake(
  client: GeminiHttpClient,
  currency: string,
  amount: string,
  providerId: string
): Promise<StakingResult> {
  return client.authenticatedPost<StakingResult>('/v1/staking/unstake', { currency, amount, providerId });
}
