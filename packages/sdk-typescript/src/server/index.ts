// Server entry point — everything from browser, plus HMAC auth and ws-backed WebSocket.

// Re-export everything the browser exposes.
export * from "../browser/index.js";

// --- Server-only: HMAC auth ---
export {
  HmacAuth,
  type HmacAuthOptions,
  type HmacNonceMode,
} from "../auth/hmac.js";

// --- Server-only: full OAuth (includes confidential client support) ---
export {
  OAuthAuth,
  type OAuthAuthOptions,
  type OAuthClient,
} from "../auth/oauth.js";

// --- Server-only: ws-backed WebSocket factory ---
export { serverSocketFactory, initServerWebSocket } from "./ws-factory.js";

// --- Server createClient (overrides the browser createClient) ---

import { GeminiMarkets } from "../gemini-markets.js";
import type { GeminiMarketsOptions } from "../types/client.js";
import { initServerWebSocket, serverSocketFactory } from "./ws-factory.js";

export interface ServerClientOptions extends GeminiMarketsOptions {
  /**
   * Skip automatic ws preloading. Set to true if you only use REST
   * endpoints and don't need authenticated WebSocket connections.
   */
  skipWsInit?: boolean;
}

/**
 * Create a Gemini Markets client with server defaults.
 *
 * When `auth` is provided and no custom `webSocketFactory` is set, the `ws`
 * package is loaded for authenticated WebSocket header support. This only
 * happens if you haven't set `skipWsInit: true` — REST-only users can skip it.
 *
 * ```ts
 * // Full server client (REST + authenticated WebSocket)
 * const client = await createClient({
 *   auth: new HmacAuth({ apiKey, apiSecret }),
 * });
 *
 * // REST-only server client (no ws dependency needed)
 * const client = await createClient({
 *   auth: new HmacAuth({ apiKey, apiSecret }),
 *   skipWsInit: true,
 * });
 * ```
 */
export async function createClient(options?: ServerClientOptions): Promise<GeminiMarkets> {
  const settings = options ?? {};
  if (settings.auth && !settings.skipWsInit && !settings.webSocketFactory) {
    await initServerWebSocket();
    return new GeminiMarkets({ ...settings, webSocketFactory: serverSocketFactory } as GeminiMarketsOptions);
  }
  return new GeminiMarkets(settings);
}
