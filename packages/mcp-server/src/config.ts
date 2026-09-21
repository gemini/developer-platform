// Selects the @gemini-markets/sdk client's environment. Defaults to whatever baseUrl
// below already selects for the legacy client, so setting GEMINI_API_BASE_URL alone
// (the documented way to point this package at sandbox) routes prediction-market SDK
// calls to sandbox too — an operator who sets only the base URL and forgets a second,
// SDK-specific env var must not end up silently sending those calls to production.
// GEMINI_SDK_ENV remains available to override that derivation explicitly; accepts only
// the exact values the SDK itself supports, or unset/empty to derive from baseUrl —
// anything else fails startup instead of silently falling back to production, since that
// fallback would otherwise send authenticated calls to live markets when an operator
// meant sandbox (e.g. a typo like "sandbx").
function isSandboxBaseUrl(baseUrl: string): boolean {
  try {
    return new URL(baseUrl).hostname.includes('sandbox');
  } catch {
    return false;
  }
}

function resolveSdkEnv(baseUrl: string): 'sandbox' | 'production' {
  const raw = process.env.GEMINI_SDK_ENV;
  if (raw === undefined || raw === '') return isSandboxBaseUrl(baseUrl) ? 'sandbox' : 'production';
  if (raw === 'sandbox' || raw === 'production') return raw;
  throw new Error(
    `Invalid GEMINI_SDK_ENV "${raw}": must be "sandbox" or "production" (or unset, which derives from GEMINI_API_BASE_URL).`
  );
}

const baseUrl = process.env.GEMINI_API_BASE_URL ?? 'https://api.gemini.com';

export const config = {
  apiKey: process.env.GEMINI_API_KEY ?? '',
  apiSecret: process.env.GEMINI_API_SECRET ?? '',
  baseUrl,
  wsUrl: process.env.GEMINI_WS_URL ?? 'wss://ws.gemini.com',
  account: process.env.GEMINI_ACCOUNT ?? '',
  sdkEnv: resolveSdkEnv(baseUrl),
};
