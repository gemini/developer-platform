import JSONBig from 'json-bigint';
import { config } from '../config.js';
import { buildSignedHeaders } from '../auth/signer.js';

const REQUEST_TIMEOUT_MS = 30_000;

// Precision-preserving JSON parser. The Gemini API emits some numeric fields
// — most notably prediction-market `orderId` — as JSON numbers in the 17–18
// digit range, which exceed JavaScript's `Number.MAX_SAFE_INTEGER` (2^53 − 1,
// ≈ 16 digits). The native `res.json()` (a.k.a. `JSON.parse`) silently
// truncates the trailing digits, so a real `orderId` of `73797746583641557`
// is returned to the caller as `73797746583641550` and the MCP hands Claude
// a wrong ID for any follow-up call. With `storeAsString: true`, json-bigint
// keeps any integer larger than `Number.MAX_SAFE_INTEGER` as a string;
// smaller integers and all non-integer numbers stay as JS numbers exactly
// as before. Type definitions in `src/types/` declare the affected fields
// as `string` so TypeScript catches any divergence.
const jsonParse = JSONBig({ storeAsString: true });

export class GeminiHttpClient {
  private baseUrl: string;
  private apiKey: string;
  private apiSecret: string;

  constructor() {
    this.baseUrl = config.baseUrl;
    this.apiKey = config.apiKey;
    this.apiSecret = config.apiSecret;
  }

  async publicGet<T>(endpoint: string, params?: Record<string, string | string[]>): Promise<T> {
    const url = new URL(`${this.baseUrl}${endpoint}`);
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        if (Array.isArray(v)) {
          for (const item of v) url.searchParams.append(k, item);
        } else {
          url.searchParams.set(k, v);
        }
      }
    }
    const res = await fetch(url.toString(), {
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    const text = await res.text();
    if (!res.ok) {
      throw new Error(`Gemini API error ${res.status}: ${text}`);
    }
    return jsonParse.parse(text) as T;
  }

  async authenticatedPost<T>(endpoint: string, body: Record<string, unknown> = {}): Promise<T> {
    const fullBody = config.account ? { ...body, account: config.account } : body;
    const headers = buildSignedHeaders(endpoint, fullBody, this.apiKey, this.apiSecret);
    const res = await fetch(`${this.baseUrl}${endpoint}`, {
      method: 'POST',
      headers,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    const text = await res.text();
    if (!res.ok) {
      throw new Error(`Gemini API error ${res.status}: ${text}`);
    }
    return jsonParse.parse(text) as T;
  }
}
