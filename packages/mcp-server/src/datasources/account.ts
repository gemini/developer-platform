import type { GeminiHttpClient } from '../client/http.js';
import type { Account, AccountDetail, ApprovedAddress } from '../types/account.js';

export async function getAccount(client: GeminiHttpClient): Promise<Account> {
  return client.authenticatedPost<Account>('/v1/account');
}

export async function createAccount(
  client: GeminiHttpClient,
  name: string,
  type: string
): Promise<Record<string, unknown>> {
  return client.authenticatedPost<Record<string, unknown>>('/v1/account/create', { name, type });
}

export async function getAccounts(client: GeminiHttpClient): Promise<AccountDetail[]> {
  try {
    return await client.authenticatedPost<AccountDetail[]>('/v1/account/list');
  } catch (err) {
    // /v1/account/list is a master-key endpoint; scoped keys always get
    // InvalidApiKey. Surface that cause instead of a bare API error.
    if (err instanceof Error && err.message.includes('"reason":"InvalidApiKey"')) {
      throw new Error(
        '/v1/account/list requires a master API key with account-list permission; ' +
          'this key is scoped and cannot list accounts. Use gemini_get_account for the key\'s own account.'
      );
    }
    throw err;
  }
}

export async function getRoles(client: GeminiHttpClient): Promise<Record<string, unknown>> {
  return client.authenticatedPost<Record<string, unknown>>('/v1/roles');
}

export async function getApprovedAddresses(
  client: GeminiHttpClient,
  network: string
): Promise<ApprovedAddress[]> {
  return client.authenticatedPost<ApprovedAddress[]>(`/v1/approvedAddresses/account/${network}`);
}

export async function sessionHeartbeat(client: GeminiHttpClient): Promise<Record<string, unknown>> {
  return client.authenticatedPost<Record<string, unknown>>('/v1/heartbeat');
}

export async function revokeOAuthToken(client: GeminiHttpClient): Promise<Record<string, unknown>> {
  return client.authenticatedPost<Record<string, unknown>>('/v1/oauth/token/revoke');
}
