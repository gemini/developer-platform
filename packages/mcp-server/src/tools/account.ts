import { z } from 'zod';
import type { GeminiHttpClient } from '../client/http.js';
import type { ToolDefinition } from './index.js';
import { wrapHandler } from './index.js';
import * as account from '../datasources/account.js';

export function createAccountTools(client: GeminiHttpClient): ToolDefinition[] {
  return [
    {
      name: 'gemini_get_account',
      description: 'Get account details',
      inputSchema: z.object({}),
      handler: wrapHandler(() => account.getAccount(client)),
    },
    {
      name: 'gemini_create_account',
      description: 'Create a new sub-account',
      inputSchema: z.object({
        name: z.string().describe('Account name'),
        type: z.string().describe('Account type: exchange or custody'),
      }),
      handler: wrapHandler(({ name, type }: { name: string; type: string }) =>
        account.createAccount(client, name, type)
      ),
    },
    {
      name: 'gemini_get_accounts',
      description: 'List all accounts',
      inputSchema: z.object({}),
      handler: wrapHandler(() => account.getAccounts(client)),
    },
    {
      name: 'gemini_get_roles',
      description: 'Get API key roles and permissions',
      inputSchema: z.object({}),
      handler: wrapHandler(() => account.getRoles(client)),
    },
    {
      name: 'gemini_get_approved_addresses',
      description: 'Get approved withdrawal addresses for a network',
      inputSchema: z.object({ network: z.string().describe('Network name') }),
      handler: wrapHandler(({ network }: { network: string }) => account.getApprovedAddresses(client, network)),
    },
    {
      name: 'gemini_session_heartbeat',
      description: 'Send a heartbeat to keep the session alive',
      inputSchema: z.object({}),
      handler: wrapHandler(() => account.sessionHeartbeat(client)),
    },
    {
      name: 'gemini_revoke_oauth_token',
      description: 'Revoke the current OAuth token',
      inputSchema: z.object({}),
      handler: wrapHandler(() => account.revokeOAuthToken(client)),
    },
  ];
}
