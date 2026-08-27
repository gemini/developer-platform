// Server entry point. Includes browser exports, HMAC auth, and ws-backed WebSockets.

// Re-export the browser entry point.
export * from "../browser/index.js";

// Server-only HMAC auth
export {
  HmacAuth,
  type HmacAuthOptions,
  type HmacNonceMode,
} from "../auth/hmac.js";

// Server-only OAuth. Includes confidential clients.
export {
  OAuthAuth,
  type OAuthAuthOptions,
  type OAuthClient,
} from "../auth/oauth.js";

// Server-only WebSocket factory and types
import { GeminiMarkets } from "../client/server.js";
import { SdkError } from "../errors.js";
import type { GeminiMarketsOptions } from "../types/client.js";
import { initServerWebSocket, serverSocketFactory } from "./ws-factory.js";

export { serverSocketFactory, initServerWebSocket };
export type { GeminiMarketsOptions };
export type {
  GeminiWebSocketOptions,
  PrivateWebSocket,
  PublicWebSocket,
  WebSocketAccountIntervalOptions,
  WebSocketCancelAllOptions,
  WebSocketOrderPlaceParams,
  WebSocketScopeOptions,
} from "../websocket/server.js";

export interface ServerClientOptions extends GeminiMarketsOptions {
  /**
   * Do not load `ws` when the client uses REST only.
   * Set this value to `true` when the client does not use authenticated WebSockets.
   */
  skipWsInit?: boolean;
}

/**
 * Create a Gemini Markets client with server defaults.
 *
 * When `auth` is provided without a custom `webSocketFactory`, the SDK loads
 * `ws` before returning unless `skipWsInit` is `true`.
 *
 * ```ts
 * // Server client with REST and authenticated WebSockets
 * const client = await createClient({
 *   env: "sandbox",
 *   auth: new HmacAuth({ apiKey, apiSecret }),
 * });
 *
 * // Server client with REST only
 * const client = await createClient({
 *   env: "sandbox",
 *   auth: new HmacAuth({ apiKey, apiSecret }),
 *   skipWsInit: true,
 * });
 * ```
 */
export async function createClient(options: ServerClientOptions): Promise<GeminiMarkets> {
  if (!options?.env) throw new SdkError("env is required; choose \"sandbox\" or \"production\"");
  const settings = options;
  if (settings.auth && !settings.webSocketFactory) {
    if (!settings.skipWsInit) await initServerWebSocket();
    const { skipWsInit: _skipWsInit, ...clientOptions } = settings;
    return new GeminiMarkets({ ...clientOptions, webSocketFactory: serverSocketFactory });
  }
  return new GeminiMarkets(settings);
}
