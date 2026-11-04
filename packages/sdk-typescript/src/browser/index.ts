// Browser entry point. It has no HMAC auth or Node.js dependencies.

// Core
export * from "../observability/logging.js";
export * from "../observability/diagnostics.js";
export * from "../errors.js";
export { decimal, type DecimalParts } from "../utils/decimal.js";
export type { Level } from "../services/market-data/orderbook.js";
export type { RequestOptions } from "../utils/deadline.js";
export type { PaginationOptions } from "../transport/pagination.js";
export type {
  AuthStrategy,
  FetchLike,
  RequestHook,
  RequestHookPayload,
  ResponseHook,
  ResponseHookPayload,
  RestFileResponse,
  RestResponse,
} from "../transport/http.js";
export type { RestPromise } from "../transport/rest-promise.js";

// Auth. OAuth and static Bearer only. No HMAC or confidential clients.

import { BearerAuth, type BearerAuthOptions } from "../auth/bearer.js";
export { BearerAuth, type BearerAuthOptions };
export { createPkceCodeChallenge, generatePkceCodeVerifier, type RandomBytes } from "../auth/pkce.js";
import {
  OAuthAuth as _OAuthAuth,
  DEFAULT_OAUTH_ENDPOINTS,
  type OAuthAuthOptions as _FullOAuthAuthOptions,
  type OAuthAuthorizationRequest,
  type OAuthAuthorizationTransaction,
  type OAuthEndpoints,
  type OAuthTokens,
  type OAuthTokenStore,
  type OAuthAuthorizationTransactionStore,
} from "../auth/oauth.js";
import { SdkError } from "../errors.js";

/** Browser OAuth client. Only public clients are supported. */
export type BrowserOAuthClient = { type: "public"; clientId: string; redirectUri: string };

/** Browser OAuth options. The client must be a public PKCE client. */
export type BrowserOAuthAuthOptions = Omit<_FullOAuthAuthOptions, "client"> & {
  client: BrowserOAuthClient;
};

/**
 * Browser OAuthAuth. Only public clients are accepted.
 * Browser OAuth authenticates REST requests only.
 * Use `@gemini-markets/sdk/server` or a server-side relay for private WebSockets.
 */
export class BrowserOAuthAuth extends _OAuthAuth {
  constructor(options: BrowserOAuthAuthOptions) {
    if (options?.client?.type !== "public") {
      throw new SdkError("BrowserOAuthAuth only supports public OAuth clients");
    }
    super(options);
    Object.defineProperty(this, "authCapability", {
      value: "browser",
      enumerable: false,
      configurable: false,
      writable: false,
    });
  }
}

export type {
  OAuthAuthorizationRequest,
  OAuthAuthorizationTransaction,
  OAuthTokens,
  OAuthTokenStore,
  OAuthAuthorizationTransactionStore,
  OAuthEndpoints,
};
export { DEFAULT_OAUTH_ENDPOINTS };

// WebSocket
export * from "../websocket/types.js";
export {
  PublicGeminiWebSocket,
  type PublicGeminiWebSocketOptions,
  type PublicWebSocket,
  type DepthIntervalMs,
  type DepthSnapshotOptions,
  type DepthUpdatesOptions,
  type PartialDepthLevel,
  type PartialDepthOptions,
  type WebSocketStream,
  type WebSocketStreamState,
  type WebSocketStreamOptions,
  type WebSocketOverflowStrategy,
} from "../websocket/public.js";
export type {
  SocketFactory,
  SocketFactoryOptions,
  SocketLike,
  WebSocketReconnectContext,
  WebSocketReconnectOptions,
} from "../websocket/session.js";
export { ManagedHeartbeat, type ManagedHeartbeatOptions } from "../services/trading/heartbeat.js";

// Client
import { BrowserGeminiMarkets as BrowserGeminiMarketsImpl, BrowserWebSocket as BrowserWebSocketImpl } from "../client/browser.js";
import type {
  Environment,
  GeminiMarketsOptions,
  BookEvent,
  BookDelta,
  LiveOrderBook,
} from "../types/client.js";

export type {
  Environment,
  GeminiMarketsOptions,
  BookEvent,
  BookDelta,
  LiveOrderBook,
};

// Generated REST clients and types
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
  ACCOUNT_OPERATIONS,
  type AccountOperationId,
  type AccountOperationTypes,
} from "../generated/account/operations.js";
export {
  STAKING_OPERATIONS,
  type StakingOperationId,
  type StakingOperationTypes,
} from "../generated/staking/operations.js";
export {
  TRANSFERS_OPERATIONS,
  type TransfersOperationId,
  type TransfersOperationTypes,
} from "../generated/transfers/operations.js";
export {
  CLEARING_OPERATIONS,
  type ClearingOperationId,
  type ClearingOperationTypes,
} from "../generated/clearing/operations.js";
export {
  INSTANT_OPERATIONS,
  type InstantOperationId,
  type InstantOperationTypes,
} from "../generated/instant/operations.js";

// Browser createClient

/**
 * Browser client options.
 * This entry point does not accept confidential or HMAC auth.
 * Browser OAuth and static Bearer auth authenticate REST requests only.
 */
export type BrowserClientOptions = Omit<GeminiMarketsOptions, "auth"> & {
  auth?: BrowserOAuthAuth | import("../auth/bearer.js").BearerAuth;
};

/** Browser WebSocket surface. It contains only the public connection namespace. */
export type BrowserWebSocket = BrowserWebSocketImpl;

/** Browser client surface with private WebSocket methods removed from its type. */
export type BrowserGeminiMarkets = BrowserGeminiMarketsImpl;

/**
 * Create a Gemini Markets client with browser-safe defaults.
 * Uses native `fetch` and `WebSocket`.
 *
 * Public market data still requires an explicit environment:
 * ```ts
 * const client = createClient({ env: "sandbox" });
 * ```
 *
 * For authenticated REST calls with PKCE OAuth:
 * ```ts
 * const auth = new BrowserOAuthAuth({
 *   client: { type: "public", clientId: "my-app", redirectUri: "https://my-app.com/callback" },
 *   tokenStore: storedTokenStore,
 * });
 * const client = createClient({ env: "sandbox", auth });
 * ```
 *
 * Browser OAuth and Bearer auth do not authenticate private WebSocket streams or request methods.
 * Browser clients expose only `websocket.public`; private operations are not bundled.
 * Use the server entry point or a server-side relay for those operations.
 * Public WebSocket streams do not require authentication.
 */
export function createClient(options: BrowserClientOptions): BrowserGeminiMarkets {
  if (!options?.env) throw new SdkError("env is required; choose \"sandbox\" or \"production\"");
  if (options.auth !== undefined &&
    (!((options.auth instanceof BrowserOAuthAuth && options.auth.authCapability === "browser") ||
      options.auth instanceof BearerAuth))) {
    throw new SdkError("Browser clients accept only BrowserOAuthAuth strategies or BearerAuth");
  }
  return new BrowserGeminiMarketsImpl(options);
}
