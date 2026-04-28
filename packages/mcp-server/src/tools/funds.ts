import { z } from 'zod';
import type { GeminiHttpClient } from '../client/http.js';
import type { ToolDefinition } from './index.js';
import { wrapHandler, confirmField } from './index.js';
import * as funds from '../datasources/funds.js';

export function createFundTools(client: GeminiHttpClient): ToolDefinition[] {
  return [
    {
      name: 'gemini_get_balances',
      description: 'Get account balances for all currencies',
      inputSchema: z.object({}),
      handler: wrapHandler(() => funds.getBalances(client)),
    },
    {
      name: 'gemini_get_notional_balances',
      description: 'Get account balances converted to a notional currency',
      inputSchema: z.object({ currency: z.string().describe('Notional currency e.g. usd') }),
      handler: wrapHandler(({ currency }: { currency: string }) => funds.getNotionalBalances(client, currency)),
    },
    {
      name: 'gemini_get_transfers',
      description: 'Get transfer history',
      inputSchema: z.object({
        limitTransfers: z.number().optional().describe('Maximum number of transfers to return'),
        currency: z.string().optional().describe('Filter by currency'),
      }),
      handler: wrapHandler(({ limitTransfers, currency }: { limitTransfers?: number; currency?: string }) =>
        funds.getTransfers(client, limitTransfers, currency)
      ),
    },
    {
      name: 'gemini_get_deposit_addresses',
      description: 'Get deposit addresses for a network',
      inputSchema: z.object({ network: z.string().describe('Network name e.g. bitcoin, ethereum') }),
      handler: wrapHandler(({ network }: { network: string }) => funds.getDepositAddresses(client, network)),
    },
    {
      name: 'gemini_get_new_deposit_address',
      description: 'Generate a new deposit address for a network',
      inputSchema: z.object({
        network: z.string().describe('Network name'),
        label: z.string().optional().describe('Label for the address'),
      }),
      handler: wrapHandler(({ network, label }: { network: string; label?: string }) =>
        funds.getNewDepositAddress(client, network, label)
      ),
    },
    {
      name: 'gemini_withdraw',
      description: 'Withdraw cryptocurrency to an external address',
      inputSchema: z.object({
        currency: z.string().describe('Currency to withdraw'),
        address: z.string().describe('Destination address'),
        amount: z.string().describe('Amount to withdraw'),
        memo: z.string().optional().describe('Memo for the transaction'),
        confirm: confirmField,
      }),
      handler: wrapHandler(({ currency, address, amount, memo }: {
        currency: string; address: string; amount: string; memo?: string;
      }) => funds.cryptoWithdrawal(client, currency, address, amount, memo)),
      destructive: true,
    },
    {
      name: 'gemini_internal_transfer',
      description: 'Transfer funds between Gemini accounts',
      inputSchema: z.object({
        currency: z.string().describe('Currency to transfer'),
        sourceAccount: z.string().describe('Source account name'),
        targetAccount: z.string().describe('Target account name'),
        amount: z.string().describe('Amount to transfer'),
        confirm: confirmField,
      }),
      handler: wrapHandler(({ currency, sourceAccount, targetAccount, amount }: {
        currency: string; sourceAccount: string; targetAccount: string; amount: string;
      }) => funds.internalTransfer(client, currency, sourceAccount, targetAccount, amount)),
      destructive: true,
    },
    {
      name: 'gemini_add_bank',
      description: 'Add a bank account for fiat transfers',
      inputSchema: z.object({
        accountNumber: z.string().describe('Bank account number'),
        routing: z.string().describe('Routing number'),
        type: z.string().describe('Account type: checking or savings'),
        name: z.string().describe('Account holder name'),
      }),
      handler: wrapHandler((body: Record<string, unknown>) => funds.addBank(client, body)),
    },
    {
      name: 'gemini_get_bank_payment_methods',
      description: 'Get available bank payment methods',
      inputSchema: z.object({}),
      handler: wrapHandler(() => funds.getBankPaymentMethods(client)),
    },
    {
      name: 'gemini_get_gas_fee_estimate',
      description: 'Estimate the gas fee for a cryptocurrency withdrawal, including fee-free withdrawal allowance',
      inputSchema: z.object({
        currency: z.string().describe('Cryptocurrency code e.g. eth, btc'),
        address: z.string().describe('Destination address'),
        amount: z.string().describe('Amount to withdraw'),
      }),
      handler: wrapHandler(({ currency, address, amount }: { currency: string; address: string; amount: string }) =>
        funds.getGasFeeEstimate(client, currency, address, amount)
      ),
    },
    {
      name: 'gemini_fiat_withdrawal',
      description: 'Withdraw fiat currency to a bank account',
      inputSchema: z.object({
        accountId: z.string().describe('Bank account ID'),
        amount: z.string().describe('Amount to withdraw'),
        currency: z.string().describe('Currency e.g. USD'),
        confirm: confirmField,
      }),
      handler: wrapHandler(({ accountId, amount, currency }: { accountId: string; amount: string; currency: string }) =>
        funds.fiatWithdrawal(client, accountId, amount, currency)
      ),
      destructive: true,
    },
  ];
}
