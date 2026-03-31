import { z } from 'zod';
import type { GeminiHttpClient } from '../client/http.js';
import type { ToolDefinition } from './index.js';
import { wrapHandler } from './index.js';
import * as staking from '../datasources/staking.js';

export function createStakingTools(client: GeminiHttpClient): ToolDefinition[] {
  return [
    {
      name: 'gemini_get_staking_balances',
      description: 'Get staking balances and rewards',
      inputSchema: z.object({}),
      handler: wrapHandler(() => staking.getStakingBalances(client)),
    },
    {
      name: 'gemini_get_staking_history',
      description: 'Get staking event history (deposits, withdrawals, rewards)',
      inputSchema: z.object({}),
      handler: wrapHandler(() => staking.getStakingHistory(client)),
    },
    {
      name: 'gemini_get_staking_rates',
      description: 'Get current staking interest rates',
      inputSchema: z.object({}),
      handler: wrapHandler(() => staking.getStakingRates(client)),
    },
    {
      name: 'gemini_stake',
      description: 'Stake cryptocurrency',
      inputSchema: z.object({
        currency: z.string().describe('Currency to stake'),
        amount: z.string().describe('Amount to stake'),
        providerId: z.string().describe('Staking provider ID'),
      }),
      handler: wrapHandler(({ currency, amount, providerId }: { currency: string; amount: string; providerId: string }) =>
        staking.stake(client, currency, amount, providerId)
      ),
    },
    {
      name: 'gemini_unstake',
      description: 'Unstake cryptocurrency',
      inputSchema: z.object({
        currency: z.string().describe('Currency to unstake'),
        amount: z.string().describe('Amount to unstake'),
        providerId: z.string().describe('Staking provider ID'),
      }),
      handler: wrapHandler(({ currency, amount, providerId }: { currency: string; amount: string; providerId: string }) =>
        staking.unstake(client, currency, amount, providerId)
      ),
    },
  ];
}
