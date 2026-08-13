// Browser entry point — no HMAC, no Node dependencies, no server-only auth.

// --- Core ---
export * from "../logging.js";
export * from "../diagnostics.js";
export * from "../errors.js";
export * from "../orderbook.js";
export * from "../json.js";
export type { Environment } from "../core/environment.js";
export type { RequestOptions } from "../core/deadline.js";
export {
  HttpTransport,
} from "../core/http.js";
export type {
  AuthStrategy,
  FetchLike,
  HttpMethod,
  HttpTransportOptions,
  RestFileResponse,
  RestQueryParameter,
  RestResponseContract,
  RestResponseMode,
} from "../core/http.js";

// --- Auth (OAuth only — no HMAC, no confidential client) ---

import { OAuthAuth as _OAuthAuth } from "../auth/oauth.js";
import type { OAuthAuthOptions as _FullOAuthAuthOptions } from "../auth/oauth.js";

/** Browser OAuth client — public clients only (no client secret). */
export type BrowserOAuthClient = { type: "public"; clientId: string; redirectUri: string };

/** Browser-safe OAuth options — restricts client to public (PKCE) only. */
export type BrowserOAuthAuthOptions = Omit<_FullOAuthAuthOptions, "client"> & {
  client: BrowserOAuthClient;
};

/**
 * Browser-safe OAuthAuth — only accepts public clients (no client secret).
 * Use `gemini-markets/server` for confidential OAuth flows.
 */
export class BrowserOAuthAuth extends _OAuthAuth {
  constructor(options: BrowserOAuthAuthOptions) {
    super(options);
  }
}

export {
  type OAuthAuthorizationRequest,
  type OAuthAuthorizationTransaction,
  type OAuthTokens,
  type OAuthTokenStore,
} from "../auth/oauth.js";

// --- WebSocket ---
export * from "../websocket-types.js";
export {
  GeminiWebSocket,
  type GeminiWebSocketOptions,
  type DepthIntervalMs,
  type DepthSnapshotOptions,
  type DepthUpdatesOptions,
  type PartialDepthLevel,
  type PartialDepthOptions,
  type WebSocketAccountIntervalOptions,
  type WebSocketCancelAllOptions,
  type WebSocketOrderPlaceParams,
  type WebSocketScopeOptions,
  type WebSocketStream,
  type WebSocketStreamState,
} from "../websocket.js";
export { WsSession, type WsSessionOptions, type WsSubscription } from "../ws-session.js";
export { ManagedHeartbeat, type ManagedHeartbeatOptions } from "../heartbeat.js";

// --- Client ---
export type { GeminiMarketsOptions, BookEvent, BookDelta, LiveOrderBook } from "../types/client.js";
export { GeminiMarkets } from "../gemini-markets.js";

// --- Generated REST clients ---
export { MarketDataRest, MarketDataRest as MarketDataClient } from "../generated/market-data/rest.js";
export { TradingRest, TradingRest as TradingClient } from "../generated/trading/rest.js";
export { MarginRest, MarginRest as MarginClient } from "../generated/margin/rest.js";
export { PerpetualsRest, PerpetualsRest as PerpetualsClient } from "../generated/perpetuals/rest.js";
export { AccountServicesRest, AccountServicesRest as AccountServicesClient } from "../generated/account-services/rest.js";
export { ClearingInstantRest, ClearingInstantRest as ClearingInstantClient } from "../generated/clearing-instant/rest.js";
export { PredictionMarketsRest } from "../generated/rest.js";
export { PredictionMarkets } from "../prediction-markets.js";

// --- Generated types & operations ---
export type {
  paths as PredictionMarketsPaths,
  components as PredictionMarketsComponents,
  operations as PredictionMarketsOpenApiOperations,
} from "../generated/models.js";
export {
  PREDICTION_MARKET_OPERATIONS,
  type PredictionMarketOperationId,
  type PredictionMarketOperationTypes,
} from "../generated/operations.js";
export {
  MARKET_DATA_OPERATIONS,
  type MarketDataOperationId,
  type MarketDataOperationTypes,
} from "../generated/market-data/operations.js";
export {
  TRADING_OPERATIONS,
  type TradingOperationId,
  type TradingOperationTypes,
} from "../generated/trading/operations.js";
export {
  MARGIN_OPERATIONS,
  type MarginOperationId,
  type MarginOperationTypes,
} from "../generated/margin/operations.js";
export {
  PERPETUALS_OPERATIONS,
  type PerpetualsOperationId,
  type PerpetualsOperationTypes,
} from "../generated/perpetuals/operations.js";
export {
  ACCOUNT_SERVICES_OPERATIONS,
  type AccountServicesOperationId,
  type AccountServicesOperationTypes,
} from "../generated/account-services/operations.js";
export {
  CLEARING_INSTANT_OPERATIONS,
  type ClearingInstantOperationId,
  type ClearingInstantOperationTypes,
} from "../generated/clearing-instant/operations.js";

// --- Browser createClient ---

import { GeminiMarkets } from "../gemini-markets.js";
import type { GeminiMarketsOptions } from "../types/client.js";

/** Browser-safe options — same as GeminiMarketsOptions (auth is optional, typically OAuthAuth). */
export type BrowserClientOptions = GeminiMarketsOptions;

/**
 * Create a Gemini Markets client with browser-safe defaults.
 * Uses native `fetch` and `WebSocket` — no Node dependencies.
 *
 * For public market data, no options are needed:
 * ```ts
 * const client = createClient();
 * ```
 *
 * For authenticated access, pass an OAuthAuth instance:
 * ```ts
 * const client = createClient({ auth: oauthAuth });
 * ```
 */
export function createClient(options?: BrowserClientOptions): GeminiMarkets {
  return new GeminiMarkets(options);
}
