// Selects the @gemini-markets/sdk client's environment. Independent from baseUrl/wsUrl
// below, which keep governing the legacy client for tools not yet migrated to the SDK.
// Accepts only the exact values the SDK itself supports, or unset/empty for the default
// ("production") — anything else fails startup instead of silently falling back to
// production, since that fallback would otherwise send authenticated calls to live
// markets when an operator meant sandbox (e.g. a typo like "sandbx").
function resolveSdkEnv(): 'sandbox' | 'production' {
  const raw = process.env.GEMINI_SDK_ENV;
  if (raw === undefined || raw === '') return 'production';
  if (raw === 'sandbox' || raw === 'production') return raw;
  throw new Error(
    `Invalid GEMINI_SDK_ENV "${raw}": must be "sandbox" or "production" (or unset, which defaults to "production").`
  );
}

export const config = {
  apiKey: process.env.GEMINI_API_KEY ?? '',
  apiSecret: process.env.GEMINI_API_SECRET ?? '',
  baseUrl: process.env.GEMINI_API_BASE_URL ?? 'https://api.gemini.com',
  wsUrl: process.env.GEMINI_WS_URL ?? 'wss://ws.gemini.com',
  account: process.env.GEMINI_ACCOUNT ?? '',
  sdkEnv: resolveSdkEnv(),
};
