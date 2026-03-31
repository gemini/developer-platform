import axios from 'axios';
import * as crypto from 'crypto';
import * as dotenv from 'dotenv';

dotenv.config();

const GEMINI_BASE_URL = process.env.GEMINI_BASE_URL || 'https://api.gemini.com/v1';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_API_SECRET = process.env.GEMINI_API_SECRET;

interface OrderParams {
  symbol: string;
  side: 'buy' | 'sell';
  type: 'market' | 'limit';
  quantity: string;
  price?: string;
}

async function placeOrder(params: OrderParams): Promise<void> {
  if (!GEMINI_API_KEY || !GEMINI_API_SECRET) {
    console.error('Error: GEMINI_API_KEY and GEMINI_API_SECRET must be set in .env file');
    return;
  }

  try {
    // Create the payload
    const payload: Record<string, string> = {
      request: '/v1/order/new',
      nonce: Date.now().toString(),
      symbol: params.symbol,
      amount: params.quantity,
      side: params.side,
      type: params.type,
    };

    if (params.price !== undefined) {
      payload.price = params.price;
    }

    // Base64 encode the payload
    const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64');

    // Create the signature
    const signature = crypto
      .createHmac('sha384', GEMINI_API_SECRET)
      .update(encodedPayload)
      .digest('hex');

    // Make the request
    const response = await axios.post(
      `${GEMINI_BASE_URL}/order/new`,
      payload,
      {
        headers: {
          'Content-Type': 'application/json',
          'X-GEMINI-APIKEY': GEMINI_API_KEY,
          'X-GEMINI-PAYLOAD': encodedPayload,
          'X-GEMINI-SIGNATURE': signature,
        },
      }
    );

    console.log('Order placed:', response.data);
  } catch (error: any) {
    console.error('Error placing order:', error.response?.data || error.message);
  }
}

// Example usage
placeOrder({
  symbol: 'BTCUSD',
  side: 'buy',
  type: 'limit',
  quantity: '0.01',
  price: '50000',
});
