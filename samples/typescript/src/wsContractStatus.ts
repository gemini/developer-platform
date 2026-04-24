import WebSocket from 'ws';
import * as dotenv from 'dotenv';

dotenv.config();

const GEMINI_WS_URL = process.env.GEMINI_WS_URL || 'wss://ws.gemini.com';

function streamContractStatus(): void {
  const ws = new WebSocket(GEMINI_WS_URL);

  ws.on('open', () => {
    console.log(`Connected to ${GEMINI_WS_URL}`);
    console.log('Subscribing to contractStatus...\n');

    ws.send(JSON.stringify({
      id: '1',
      method: 'subscribe',
      params: ['contractStatus'],
    }));
  });

  ws.on('message', (data: WebSocket.Data) => {
    const msg = JSON.parse(data.toString());

    // Skip subscription confirmations
    if (msg.result || msg.id) return;

    const time = new Date(msg.E).toISOString();
    // `p` (strike price) is parsed from strike-based tickers (e.g. HI78999D63).
    // Up/Down contracts publish `p` only once the strike is set.
    const strike = msg.p ? ` strike=${msg.p}` : '';
    console.log(`[${time}] ${msg.s} [${msg.c}] ${msg.o} -> ${msg.n}${strike}`);
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

if (process.argv.includes('--help') || process.argv.includes('-h')) {
  console.log('Usage: npx ts-node src/wsContractStatus.ts');
  console.log('Streams prediction-market contract lifecycle events (status transitions and strike-populated moments).');
  process.exit(0);
}

streamContractStatus();
