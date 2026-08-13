export const ENVIRONMENT_URLS = {
  production: {
    rest: "https://api.gemini.com",
    websocket: "wss://ws.gemini.com",
    oauthAuthorization: "https://exchange.gemini.com/auth",
    oauthToken: "https://exchange.gemini.com/auth/token",
  },
  sandbox: {
    rest: "https://api.sandbox.gemini.com",
    websocket: "wss://ws.sandbox.gemini.com",
    oauthAuthorization: "https://exchange.sandbox.gemini.com/auth",
    oauthToken: "https://exchange.sandbox.gemini.com/auth/token",
  },
} as const;

export type Environment = keyof typeof ENVIRONMENT_URLS;
