export const config = {
  apiKey: process.env.GEMINI_API_KEY ?? '',
  apiSecret: process.env.GEMINI_API_SECRET ?? '',
  baseUrl: process.env.GEMINI_API_BASE_URL ?? 'https://api.gemini.com',
  wsUrl: process.env.GEMINI_WS_URL ?? 'wss://ws.gemini.com',
  account: process.env.GEMINI_ACCOUNT ?? '',
  // Selects the @gemini-markets/sdk client's environment. Independent from baseUrl/wsUrl
  // above, which keep governing the legacy client for tools not yet migrated to the SDK.
  sdkEnv: (process.env.GEMINI_SDK_ENV === 'sandbox' ? 'sandbox' : 'production') as
    | 'sandbox'
    | 'production',
};
