import { createClient, HmacAuth } from '@gemini-markets/sdk/server';
import { config } from '../config.js';
import { nextNonce } from '../auth/signer.js';

// Custom REST targets share the legacy client's millisecond nonce sequence.
// Keep HmacAuth's independent epoch-second WebSocket auth contract intact.
class CustomTargetHmacAuth extends HmacAuth {
  override nextNonce(): string {
    return String(nextNonce());
  }
}

// @gemini-markets/sdk/server doesn't export the GeminiMarkets class itself (only
// createClient's return type uses it) — derive the type from createClient so the rest of
// mcp-server has something to import instead of reaching into the SDK's internals.
export type SdkClient = Awaited<ReturnType<typeof createClient>>;

// Single shared factory for the @gemini-markets/sdk client, used by both mcp-server's
// process bootstraps (the MCP server itself and the separate alerts daemon binary) so
// they stay configured identically. Omits `auth` entirely when no API key/secret are
// configured, matching this package's existing public-only mode (see index.ts's
// validateConfig) — authenticated SDK calls/streams will throw their own "auth required"
// error if invoked without one.
//
// `overrides` exists for tests only (e.g. injecting a fake `fetch` to prove which
// environment's URL a call actually targets without a live network round-trip). Real
// callers (index.ts, alerts/daemon/index.ts) pass nothing.
export async function createSdkClient(
  overrides?: Partial<Parameters<typeof createClient>[0]>
): Promise<SdkClient> {
  const baseUrl = config.baseUrl.replace(/\/+$/, '');
  const customTarget =
    baseUrl !== 'https://api.gemini.com' && baseUrl !== 'https://api.sandbox.gemini.com';
  const Auth = customTarget ? CustomTargetHmacAuth : HmacAuth;
  const auth =
    config.apiKey && config.apiSecret
      ? new Auth({
          apiKey: config.apiKey,
          apiSecret: config.apiSecret,
          // Standard Gemini REST endpoints retain their epoch-second nonce policy.
          nonceMode: 'time-based',
        })
      : undefined;

  const options = { env: config.sdkEnv, auth, ...overrides };
  if (customTarget) {
    // The SDK exposes routing through fetch, not a client-level baseUrl option.
    // Compose with injected fetch so tests and runtime use the same routing path.
    const fetchImpl = options.fetch ?? globalThis.fetch;
    options.fetch = (url, init) => {
      const { pathname, search } = new URL(url);
      return fetchImpl(`${baseUrl}${pathname}${search}`, init);
    };
  }
  return createClient(options);
}

// The legacy GeminiHttpClient.authenticatedPost added config.account (GEMINI_ACCOUNT) to
// every signed request body, so a master API key reads and trades on the configured
// sub-account. The SDK has no account-scope option of its own, but for operations with a
// request body it copies every input key that isn't a path/query/header parameter into
// the signed body, so authenticated body-bearing calls wrap their input with this.
//
// It does NOT work for query-only operations (e.g. predictions.getPositions /
// getSettledPositions): the SDK sends only their declared query fields and signs no body,
// so an added `account` key is silently dropped. Scoping those needs an SDK-level account
// option. Public operations must not use it either — the SDK refuses to send a body on a
// public request.
export function withAccountScope<T extends object>(input: T): T {
  return config.account ? { ...input, account: config.account } : input;
}
