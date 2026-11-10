import { createHmac } from 'crypto';

// Each Gemini API key uses one of two nonce contracts, fixed by its "Uses a time based
// nonce" setting. The MCP server must send the contract that matches the key:
//   - 'incremental': every nonce must be strictly greater than the last one accepted for
//     the key. Nonces are epoch milliseconds (PR #75; QA100 keys), and concurrent requests
//     in this process must not share one.
//   - 'time-based': epoch seconds, which must be within ±30s of server time. There is no
//     ordering check. Agentic/production onboarding keys use this mode.
export type NonceMode = 'incremental' | 'time-based';

// Incremental sequence shared by every legacy REST request and, via the SDK override in
// client/sdk.ts, every SDK request. A separate counter would issue nonces that interleave
// and get rejected. Time-based nonces are stateless and do not use this counter.
let lastNonce = 0;

export function nextNonce(nowMs: number = Date.now()): number {
  lastNonce = Math.max(nowMs, lastNonce + 1);
  return lastNonce;
}

/** Nonce for one REST request under the key's nonce mode. */
export function nonceForMode(mode: NonceMode, nowMs: number = Date.now()): number {
  if (mode === 'time-based') return Math.floor(nowMs / 1000);
  return nextNonce(nowMs);
}

// `nonceMode` defaults to 'incremental' to preserve the behaviour shipped in PR #75. Callers
// that have config should pass config.nonceMode explicitly.
export function buildSignedHeaders(
  endpoint: string,
  body: Record<string, unknown>,
  apiKey: string,
  apiSecret: string,
  nonceMode: NonceMode = 'incremental'
): Record<string, string> {
  const nonce = nonceForMode(nonceMode);
  const payload = JSON.stringify({ request: endpoint, nonce, ...body });
  const encodedPayload = Buffer.from(payload).toString('base64');
  const signature = createHmac('sha384', apiSecret)
    .update(encodedPayload)
    .digest('hex');

  return {
    'Content-Type': 'text/plain',
    'Content-Length': '0',
    'X-GEMINI-APIKEY': apiKey,
    'X-GEMINI-PAYLOAD': encodedPayload,
    'X-GEMINI-SIGNATURE': signature,
    'Cache-Control': 'no-cache',
  };
}

// Server messages from api-commons' ApiNonceCheck. Time-based keys only produce the window
// error and incremental keys only produce the not-increased error, so each message identifies
// which contract the key actually uses. Legacy REST errors carry these sentences. SDK errors do
// not: the SDK keeps the rejection code (reason=InvalidNonce) and a generic "HTTP <status>"
// message, so NONCE_REJECTED is the only signal left for them.
const OUT_OF_WINDOW = /not within \d+ seconds of server time/;
const NOT_INCREMENTED = /has not increased since your last call/;
const NONCE_REJECTED = /\bInvalidNonce\b/;

const TIME_BASED_HINT =
  'This key rejects millisecond nonces, so it is a time-based key. Set GEMINI_API_NONCE_MODE=time-based in the MCP server environment and restart the server.';
const INCREMENTAL_HINT =
  'This key rejects time-based nonces, so it is an incremental key. Remove GEMINI_API_NONCE_MODE or set it to incremental, then restart the server.';
const SHARED_KEY_HINT =
  'Incremental nonces are tracked per process. If another MCP client or SDK process is using this key at the same time, it can cause this rejection. Use a time-based key for shared use, or run one client per key.';
const CLOCK_HINT =
  'Time-based nonces must be within 30 seconds of server time. Check that this host\'s clock is in sync.';
const GENERIC_HINT =
  'The server rejected this key\'s nonce. Check GEMINI_API_NONCE_MODE against the key\'s "Uses a time based nonce" setting: a time-based key needs GEMINI_API_NONCE_MODE=time-based, and an incremental key should leave it unset. Time-based nonces also need this host\'s clock within 30 seconds of server time.';

/**
 * Operator hint for a nonce rejection, or undefined if the text is not a nonce error. `text`
 * is the full error text as shown to the operator, including any SDK `reason=` detail, so the
 * same function covers legacy REST and SDK errors.
 */
export function nonceModeHint(text: string, configured: NonceMode): string | undefined {
  if (configured === 'incremental' && OUT_OF_WINDOW.test(text)) return TIME_BASED_HINT;
  if (configured === 'time-based' && NOT_INCREMENTED.test(text)) return INCREMENTAL_HINT;
  if (configured === 'incremental' && NOT_INCREMENTED.test(text)) return SHARED_KEY_HINT;
  if (configured === 'time-based' && OUT_OF_WINDOW.test(text)) return CLOCK_HINT;
  if (NONCE_REJECTED.test(text)) return GENERIC_HINT;
  return undefined;
}

/**
 * Build auth headers for the WebSocket connection-upgrade request. Gemini
 * requires credentials at connect time — there's no post-connect auth
 * handshake — and the payload here is just the nonce itself (base64), not
 * the JSON-wrapped {request, nonce, ...body} shape REST uses. Confirmed
 * against sdk-typescript's HmacAuth.forWebSocket(): epoch-seconds nonce,
 * HMAC-SHA384 over base64(nonce). WebSocket auth is always seconds, regardless of
 * GEMINI_API_NONCE_MODE, because it is a separate contract.
 */
export function buildWsAuthHeaders(apiKey: string, apiSecret: string): Record<string, string> {
  const nonce = Math.floor(Date.now() / 1000).toString();
  const encodedPayload = Buffer.from(nonce).toString('base64');
  const signature = createHmac('sha384', apiSecret)
    .update(encodedPayload)
    .digest('hex');

  return {
    'X-GEMINI-APIKEY': apiKey,
    'X-GEMINI-NONCE': nonce,
    'X-GEMINI-PAYLOAD': encodedPayload,
    'X-GEMINI-SIGNATURE': signature,
  };
}
