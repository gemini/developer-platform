import { createHmac } from 'crypto';

// Gemini rejects any request whose nonce is not strictly greater than the last
// nonce accepted for that API key, so concurrent requests must not share one.
// Nonces are epoch milliseconds; a seconds value is three orders of magnitude
// below an accepted millisecond nonce and is rejected forever.
let lastNonce = 0;

export function nextNonce(nowMs: number = Date.now()): number {
  lastNonce = Math.max(nowMs, lastNonce + 1);
  return lastNonce;
}

export function buildSignedHeaders(
  endpoint: string,
  body: Record<string, unknown>,
  apiKey: string,
  apiSecret: string
): Record<string, string> {
  const nonce = nextNonce();
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

/**
 * Build auth headers for the WebSocket connection-upgrade request. Gemini
 * requires credentials at connect time — there's no post-connect auth
 * handshake — and the payload here is just the nonce itself (base64), not
 * the JSON-wrapped {request, nonce, ...body} shape REST uses. Confirmed
 * against sdk-typescript's HmacAuth.forWebSocket(): epoch-seconds nonce,
 * HMAC-SHA384 over base64(nonce).
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
