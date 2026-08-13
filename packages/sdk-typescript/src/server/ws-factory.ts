import type { SocketFactory, SocketLike } from "../transport.js";
import { SdkError } from "../errors.js";

type WsConstructor = new (url: string, options: { headers?: Record<string, string> }) => SocketLike;

let WsClass: WsConstructor | undefined;

/**
 * Socket factory that uses the `ws` package for header support on WebSocket
 * upgrade requests. Required for HMAC-authenticated WebSocket connections.
 *
 * `ws` is loaded lazily on first socket creation via `initServerWebSocket()`.
 * If not yet loaded, throws a clear error with instructions.
 */
export const serverSocketFactory: SocketFactory = (url, options) => {
  if (!WsClass) {
    throw new SdkError(
      "The ws package is required for authenticated WebSocket connections. " +
      "Install it (npm install ws) and call await initServerWebSocket() before connecting, " +
      "or use createClient() which handles this automatically.",
    );
  }
  return new WsClass(url, { headers: options.headers }) as SocketLike;
};

/**
 * Load the `ws` package. Called automatically by `createClient` when auth
 * is provided, or call manually before the first authenticated WebSocket.
 */
export async function initServerWebSocket(): Promise<void> {
  if (WsClass) return;
  try {
    // Dynamic import: ws is an optional peer dependency that only exists on
    // server runtimes. A static import would break browser and edge bundling.
    const mod = await (import("ws") as Promise<{ default: WsConstructor }>);
    WsClass = mod.default;
  } catch {
    throw new SdkError(
      "The ws package is required for server WebSocket connections with custom headers. " +
      "Install it: npm install ws",
    );
  }
}
