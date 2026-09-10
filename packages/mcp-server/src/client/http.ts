import { createRequire } from 'module';
import JSONBig from 'json-bigint';
import { config } from '../config.js';
import { buildSignedHeaders } from '../auth/signer.js';

const REQUEST_TIMEOUT_MS = 30_000;

const { version: PKG_VERSION } = createRequire(import.meta.url)('../../package.json') as {
  version: string;
};
const USER_AGENT = `gemini-mcp/${PKG_VERSION} (node/${process.versions.node})`;

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

// Query parameters for both public and authenticated calls. `undefined`
// values are dropped rather than serialized as the string "undefined";
// arrays are emitted as repeated keys (`status[]=a&status[]=b`).
export type QueryParams = Record<string, string | string[] | undefined>;

function applyQuery(url: URL, params?: QueryParams): void {
  if (!params) return;
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      for (const item of value) url.searchParams.append(key, item);
    } else {
      url.searchParams.set(key, value);
    }
  }
}

export class GeminiHttpClient {
  private baseUrl: string;
  private apiKey: string;
  private apiSecret: string;

  constructor() {
    this.baseUrl = config.baseUrl;
    this.apiKey = config.apiKey;
    this.apiSecret = config.apiSecret;
  }

  async publicGet<T>(endpoint: string, params?: QueryParams): Promise<T> {
    const url = new URL(`${this.baseUrl}${endpoint}`);
    applyQuery(url, params);
    const res = await fetch(url.toString(), {
      headers: { 'User-Agent': USER_AGENT },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    return this.parseResponse<T>(res);
  }

  // Signed GET. A handful of private prediction-market endpoints are GETs
  // (e.g. `/v1/prediction-markets/terms/status`) rather than the POST-with-
  // payload shape used by most of the Gemini private API. The signing scheme
  // is identical either way: the payload rides in `X-GEMINI-PAYLOAD` and no
  // request body is sent, so only the HTTP method differs.
  async authenticatedGet<T>(endpoint: string, params?: QueryParams): Promise<T> {
    return this.sendAuthenticated<T>('GET', endpoint, undefined, params);
  }

  async authenticatedPost<T>(
    endpoint: string,
    body: Record<string, unknown> = {},
    params?: QueryParams
  ): Promise<T> {
    return this.sendAuthenticated<T>('POST', endpoint, body, params);
  }

  private async sendAuthenticated<T>(
    method: 'GET' | 'POST',
    endpoint: string,
    body: Record<string, unknown> | undefined,
    params?: QueryParams
  ): Promise<T> {
    if (!this.apiKey || !this.apiSecret) {
      throw new Error(
        `Authentication required for ${endpoint}: GEMINI_API_KEY and GEMINI_API_SECRET ` +
          'must be set in the MCP server environment. This tool is unavailable in ' +
          'public-only mode. See README for setup instructions.'
      );
    }
    const baseBody = body ?? {};
    const fullBody = config.account ? { ...baseBody, account: config.account } : baseBody;
    // The signed payload covers `endpoint` — the bare path, WITHOUT any query
    // string. Some private endpoints (e.g. `positions/settled`) take their
    // filters as query parameters on a signed POST; including those in the
    // signature produces a 400 from the API. Both the Go and TypeScript SDKs
    // sign the path only, reserving query signing for the two funding-payment
    // report endpoints that explicitly require it.
    const headers = {
      ...buildSignedHeaders(endpoint, fullBody, this.apiKey, this.apiSecret),
      'User-Agent': USER_AGENT,
    };
    const url = new URL(`${this.baseUrl}${endpoint}`);
    applyQuery(url, params);
    const res = await fetch(url.toString(), {
      method,
      headers,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    return this.parseResponse<T>(res);
  }

  private async parseResponse<T>(res: Response): Promise<T> {
    const text = await res.text();
    if (!res.ok) {
      throw new Error(`Gemini API error ${res.status}: ${text}`);
    }
    return jsonParse.parse(text) as T;
  }
}
