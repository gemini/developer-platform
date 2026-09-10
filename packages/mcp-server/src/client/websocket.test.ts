import test from 'node:test';
import assert from 'node:assert/strict';
import { WebSocketServer } from 'ws';
import {
  GeminiWebSocketClient,
  isContractStatusMessage,
  isBookTickerMessage,
  isTradeMessage,
} from './websocket.js';
import type { WSMessage } from '../types/websocket.js';

test('isContractStatusMessage identifies a contractStatus-shaped message', () => {
  const msg = {
    e: 'contractStatus',
    E: 1,
    s: 'GEMI-X',
    k: 'X',
    c: 'GEMI-X',
    i: '1',
    o: 'active',
    n: 'settled',
  } as unknown as WSMessage;
  assert.strictEqual(isContractStatusMessage(msg), true);
});

test('isContractStatusMessage rejects book ticker and trade messages', () => {
  const bookTicker = { s: 'BTCUSD', b: '1', B: '1', a: '1', A: '1', E: 1 } as unknown as WSMessage;
  const trade = { s: 'BTCUSD', p: '1', q: '1', m: true, E: 1, t: 1 } as unknown as WSMessage;
  assert.strictEqual(isContractStatusMessage(bookTicker), false);
  assert.strictEqual(isContractStatusMessage(trade), false);
  assert.strictEqual(isBookTickerMessage(bookTicker), true);
  assert.strictEqual(isTradeMessage(trade), true);
});

test('a large contract ID survives the wire round-trip as an exact string', async () => {
  const BIG_ID = '145828833218573125'; // exceeds Number.MAX_SAFE_INTEGER
  const wss = new WebSocketServer({ port: 0 });
  await new Promise<void>((resolve) => wss.once('listening', resolve));

  wss.on('connection', (socket) => {
    // Sent as a raw JSON number, exactly like Gemini's real wire format —
    // not pre-quoted — so the fix has to actually recover precision, not
    // just pass through a string that was already safe.
    socket.send(
      `{"e":"contractStatus","E":1,"s":"GEMI-X","k":"X","c":"GEMI-X","i":${BIG_ID},"o":"active","n":"settled"}`
    );
  });

  const { port } = wss.address() as { port: number };
  const client = new GeminiWebSocketClient(`ws://localhost:${port}`);

  try {
    const received = await new Promise<WSMessage>((resolve) => {
      client.addMessageHandler((message) => resolve(message));
      client.connect().catch(() => undefined);
    });

    assert.ok(isContractStatusMessage(received));
    assert.strictEqual((received as { i: string }).i, BIG_ID);
  } finally {
    client.disconnect();
    await new Promise<void>((resolve, reject) => wss.close((err) => (err ? reject(err) : resolve())));
  }
});
