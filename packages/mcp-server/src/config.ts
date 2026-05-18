export const config = {
  apiKey: process.env.GEMINI_API_KEY ?? '',
  apiSecret: process.env.GEMINI_API_SECRET ?? '',
  baseUrl: process.env.GEMINI_API_BASE_URL ?? 'https://api.gemini.com',
  wsUrl: process.env.GEMINI_WS_URL ?? 'wss://ws.gemini.com',
  account: process.env.GEMINI_ACCOUNT ?? '',
};
