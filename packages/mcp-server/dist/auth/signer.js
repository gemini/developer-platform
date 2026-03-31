import { createHmac } from 'crypto';
export function buildSignedHeaders(endpoint, body, apiKey, apiSecret) {
    const nonce = Math.floor(Date.now() / 1000);
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
