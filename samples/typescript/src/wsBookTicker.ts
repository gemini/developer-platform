import WebSocket from 'ws';
import * as dotenv from 'dotenv';

dotenv.config();

const GEMINI_WS_URL = process.env.GEMINI_WS_URL || 'wss://ws.gemini.com';

function streamBookTicker(symbol: string): void {
  const ws = new WebSocket(GEMINI_WS_URL);

  ws.on('open', () => {
    console.log(`Connected to ${GEMINI_WS_URL}`);
    console.log(`Subscribing to ${symbol} book ticker...\n`);

    ws.send(JSON.stringify({
      id: '1',
      method: 'subscribe',
      params: [`${symbol}@bookTicker`],
    }));
  });

  ws.on('message', (data: WebSocket.Data) => {
    const msg = JSON.parse(data.toString());

    // Skip subscription confirmations
    if (msg.result || msg.id) return;

    const time = new Date(msg.E / 1_000_000).toISOString();
    console.log(`[${time}] ${msg.s} bid ${msg.b} x ${msg.B} | ask ${msg.a} x ${msg.A}`);
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

// Get symbol from command line or use default
const symbol = process.argv[2] || 'btcusd';

if (process.argv.includes('--help') || process.argv.includes('-h')) {
  console.log('Usage: npx ts-node src/wsBookTicker.ts [symbol]');
  console.log('Example: npx ts-node src/wsBookTicker.ts ethusd');
  console.log('Default symbol: btcusd');
  process.exit(0);
}

streamBookTicker(symbol);
