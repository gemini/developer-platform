import type { SocketFactory, SocketLike } from "../websocket/session.js";
import { SdkError } from "../errors.js";

type WsConstructor = new (url: string, options: {
  headers?: Record<string, string>;
  maxPayload?: number;
  handshakeTimeout?: number;
  perMessageDeflate?: boolean;
}) => SocketLike;

let WsClass: WsConstructor | undefined;

/**
 * Create sockets with the `ws` package.
 * This supports custom headers on WebSocket upgrade requests.
 * HMAC-authenticated WebSockets require this factory.
 * The SDK loads `ws` when it creates the first socket.
 */
export const serverSocketFactory: SocketFactory = async (url, options) => {
  await loadWs();
  const Ws = WsClass;
  if (!Ws) throw new SdkError("The ws package failed to initialize");
  return new Ws(url, {
    headers: options.headers,
    maxPayload: options.maxPayload,
    handshakeTimeout: options.handshakeTimeout,
    perMessageDeflate: options.perMessageDeflate,
  });
};

/**
 * Load the `ws` package.
 * `createClient` calls this when auth is provided unless `skipWsInit` is true.
 * You can also call it before the first authenticated WebSocket.
 */
export async function initServerWebSocket(): Promise<void> {
  await loadWs();
}

async function loadWs(): Promise<void> {
  if (WsClass) return;
  try {
    // Use a dynamic import because ws is an optional server peer dependency.
    // A static import would break browser and edge bundles.
    // SAFETY: The optional ws module is loaded through its documented default-export constructor.
    const mod = await (import("ws") as Promise<{ default: WsConstructor }>);
    WsClass = mod.default;
  } catch {
    throw new SdkError(
      "The ws package is required for server WebSocket connections with custom headers. " +
      "Install it: npm install ws",
    );
  }
}
