import type { GeminiHttpClient } from '../client/http.js';
import type { Account, AccountDetail, ApprovedAddress } from '../types/account.js';
export declare function getAccount(client: GeminiHttpClient): Promise<Account>;
export declare function createAccount(client: GeminiHttpClient, name: string, type: string): Promise<Record<string, unknown>>;
export declare function getAccounts(client: GeminiHttpClient): Promise<AccountDetail[]>;
export declare function getRoles(client: GeminiHttpClient): Promise<Record<string, unknown>>;
export declare function getApprovedAddresses(client: GeminiHttpClient, network: string): Promise<ApprovedAddress[]>;
export declare function sessionHeartbeat(client: GeminiHttpClient): Promise<Record<string, unknown>>;
export declare function revokeOAuthToken(client: GeminiHttpClient): Promise<Record<string, unknown>>;
