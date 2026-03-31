import type { GeminiHttpClient } from '../client/http.js';
import type { StakingBalance, StakingHistory, StakingRate, StakingResult } from '../types/staking.js';
export declare function getStakingBalances(client: GeminiHttpClient): Promise<StakingBalance[]>;
export declare function getStakingHistory(client: GeminiHttpClient): Promise<StakingHistory[]>;
export declare function getStakingRates(client: GeminiHttpClient): Promise<StakingRate[]>;
export declare function stake(client: GeminiHttpClient, currency: string, amount: string, providerId: string): Promise<StakingResult>;
export declare function unstake(client: GeminiHttpClient, currency: string, amount: string, providerId: string): Promise<StakingResult>;
