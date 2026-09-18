import { createClient, HmacAuth } from '@gemini-markets/sdk/server';
import { config } from '../config.js';

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
  const auth =
    config.apiKey && config.apiSecret
      ? new HmacAuth({ apiKey: config.apiKey, apiSecret: config.apiSecret })
      : undefined;

  return createClient({ env: config.sdkEnv, auth, ...overrides });
}
