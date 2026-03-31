import * as crypto from 'crypto';
import WebSocket from 'ws';
import * as dotenv from 'dotenv';

dotenv.config();

const GEMINI_WS_URL = process.env.GEMINI_WS_URL || 'wss://ws.gemini.com';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_API_SECRET = process.env.GEMINI_API_SECRET;

function placePredictionOrder(symbol: string, side: string, price: string, quantity: string, outcome: string): void {
  if (!GEMINI_API_KEY || !GEMINI_API_SECRET) {
    console.error('Error: GEMINI_API_KEY and GEMINI_API_SECRET must be set in .env file');
    return;
  }

  // Authentication — signs a timestamp with your secret so Gemini
  // can verify your identity.
  const nonce = Math.floor(Date.now() / 1000).toString();
  const payload = Buffer.from(nonce).toString('base64');
  const signature = crypto
    .createHmac('sha384', GEMINI_API_SECRET)
    .update(payload)
    .digest('hex');

  const ws = new WebSocket(GEMINI_WS_URL, {
    headers: {
      'X-GEMINI-APIKEY': GEMINI_API_KEY,
      'X-GEMINI-NONCE': nonce,
      'X-GEMINI-PAYLOAD': payload,
      'X-GEMINI-SIGNATURE': signature,
    },
  });

  ws.on('open', () => {
    console.log(`Connected to ${GEMINI_WS_URL}`);
    console.log(`Subscribing to ${symbol} prices and order updates...\n`);

    ws.send(JSON.stringify({
      id: '1',
      method: 'subscribe',
      params: [
        `${symbol}@bookTicker`,  // live prices
        'orders@account',         // your order updates
      ],
    }));
  });

  let orderPlaced = false;

  ws.on('message', (raw: WebSocket.Data) => {
    const data = JSON.parse(raw.toString());

    // Once we see a price, place an order
    if (!orderPlaced && data.b && data.a && data.s === symbol) {
      console.log(`Best bid: $${data.b}  Best ask: $${data.a}`);
      console.log('Placing order...');
      orderPlaced = true;

      ws.send(JSON.stringify({
        id: '2',
        method: 'order.place',
        params: {
          symbol,
          side,
          type: 'LIMIT',
          timeInForce: 'GTC',
          price,
          quantity,
          eventOutcome: outcome,
        },
      }));
    }

    // Order lifecycle updates from orders@account stream
    // X = status, S = side, O = outcome, p = price, q = quantity
    if (['NEW', 'OPEN', 'FILLED', 'PARTIALLY_FILLED'].includes(data.X)) {
      console.log(`Order ${data.X}: side=${data.S} outcome=${data.O} price=$${data.p} qty=${data.q}`);
    }
  });

  ws.on('error', (err: Error) => {
    console.error('WebSocket error:', err.message);
  });

  ws.on('close', () => {
    console.log('Connection closed');
  });

  // Graceful shutdown
  process.on('SIGINT', () => {
    console.log('\nClosing connection...');
    ws.close();
    process.exit(0);
  });
}

// Example usage — adjust parameters as needed
const symbol = process.argv[2] || 'GEMI-PRES2028-VANCE';

if (process.argv.includes('--help') || process.argv.includes('-h')) {
  console.log('Usage: npx ts-node src/pmOrder.ts [symbol]');
  console.log('Example: npx ts-node src/pmOrder.ts GEMI-PRES2028-VANCE');
  console.log('Default symbol: GEMI-PRES2028-VANCE');
  console.log('\nPlaces a BUY LIMIT order for 100 YES contracts at $0.27.');
  console.log('Edit the script to change side, price, quantity, or outcome.');
  process.exit(0);
}

placePredictionOrder(symbol, 'BUY', '0.27', '100', 'YES');
