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
  return client.authenticatedPost<AccountDetail[]>('/v1/account/list');
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
