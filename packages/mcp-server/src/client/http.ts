import { config } from '../config.js';
import { buildSignedHeaders } from '../auth/signer.js';

const REQUEST_TIMEOUT_MS = 30_000;

export class GeminiHttpClient {
  private baseUrl: string;
  private apiKey: string;
  private apiSecret: string;

  constructor() {
    this.baseUrl = config.baseUrl;
    this.apiKey = config.apiKey;
    this.apiSecret = config.apiSecret;
  }

  async publicGet<T>(endpoint: string, params?: Record<string, string>): Promise<T> {
    const url = new URL(`${this.baseUrl}${endpoint}`);
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        url.searchParams.set(k, v);
      }
    }
    const res = await fetch(url.toString(), {
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Gemini API error ${res.status}: ${text}`);
    }
    return res.json() as Promise<T>;
  }

  async authenticatedPost<T>(endpoint: string, body: Record<string, unknown> = {}): Promise<T> {
    const fullBody = config.account ? { ...body, account: config.account } : body;
    const headers = buildSignedHeaders(endpoint, fullBody, this.apiKey, this.apiSecret);
    const res = await fetch(`${this.baseUrl}${endpoint}`, {
      method: 'POST',
      headers,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Gemini API error ${res.status}: ${text}`);
    }
    return res.json() as Promise<T>;
  }
}
