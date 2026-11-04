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
