import type { GeminiHttpClient } from '../client/http.js';
import type { MarginAccount, MarginPreview, FundingPayment, ClearingOrder } from '../types/margin.js';
export declare function getMarginAccount(client: GeminiHttpClient): Promise<MarginAccount[]>;
export declare function getMarginPreview(client: GeminiHttpClient, symbol: string, side: string, quantity: string, price: string): Promise<MarginPreview>;
export declare function getOpenPositions(client: GeminiHttpClient): Promise<Record<string, unknown>[]>;
export declare function getFundingPayments(client: GeminiHttpClient, since?: number, until?: number): Promise<FundingPayment[]>;
export declare function clearingNewOrder(client: GeminiHttpClient, body: Record<string, unknown>): Promise<ClearingOrder>;
export declare function clearingBrokerNewOrder(client: GeminiHttpClient, body: Record<string, unknown>): Promise<ClearingOrder>;
export declare function clearingOrderStatus(client: GeminiHttpClient, clearingId: string): Promise<ClearingOrder>;
