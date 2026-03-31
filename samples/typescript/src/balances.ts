import axios from 'axios';
import * as crypto from 'crypto';
import * as dotenv from 'dotenv';

dotenv.config();

const GEMINI_BASE_URL = process.env.GEMINI_BASE_URL || 'https://api.gemini.com/v1';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_API_SECRET = process.env.GEMINI_API_SECRET;

interface Balance {
  type: string;
  currency: string;
  amount: string;
  available: string;
  availableForWithdrawal: string;
  pendingWithdrawal?: string;
  pendingDeposit?: string;
}

async function getBalances(): Promise<void> {
  if (!GEMINI_API_KEY || !GEMINI_API_SECRET) {
    console.error('Error: GEMINI_API_KEY and GEMINI_API_SECRET must be set in .env file');
    return;
  }

  try {
    // Create the payload
    const payload = {
      request: '/v1/balances',
      nonce: Date.now().toString(),
    };

    // Base64 encode the payload
    const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64');

    // Create the signature
    const signature = crypto
      .createHmac('sha384', GEMINI_API_SECRET)
      .update(encodedPayload)
      .digest('hex');

    // Make the request
    const response = await axios.post<Balance[]>(`${GEMINI_BASE_URL}/balances`, payload, {
      headers: {
        'Content-Type': 'application/json',
        'X-GEMINI-APIKEY': GEMINI_API_KEY,
        'X-GEMINI-PAYLOAD': encodedPayload,
        'X-GEMINI-SIGNATURE': signature,
      },
    });

    console.log('Account balances:');
    console.log(JSON.stringify(response.data, null, 2));

    // Summary
    console.log(`\nTotal currencies: ${response.data.length}`);
    response.data.forEach(balance => {
      console.log(`${balance.currency}: ${balance.available} available (${balance.amount} total)`);
    });
  } catch (error: any) {
    console.error('Error fetching balances:', error.response?.data || error.message);
  }
}

// Example usage
getBalances();
