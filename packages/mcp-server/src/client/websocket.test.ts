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

// Waits for the next message the client dispatches, or rejects — on a
// connect() failure, or if nothing arrives within `timeoutMs` — instead of
// hanging forever. A prior version of this helper had neither: it swallowed
// connect() errors and awaited an unbounded promise, so a real regression
// (server refuses the connection, or stops dispatching this message type)
// would hang the test process rather than fail it.
function waitForMessage(
  client: GeminiWebSocketClient,
  connect: () => Promise<void>,
  timeoutMs = 2000
): Promise<WSMessage> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timed out after ${timeoutMs}ms waiting for a message`)), timeoutMs);
    client.addMessageHandler((message) => {
      clearTimeout(timer);
      resolve(message);
    });
    connect().catch((err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

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
    const received = await waitForMessage(client, () => client.connect());

    assert.ok(isContractStatusMessage(received));
    assert.strictEqual((received as { i: string }).i, BIG_ID);
  } finally {
    client.disconnect();
    await new Promise<void>((resolve, reject) => wss.close((err) => (err ? reject(err) : resolve())));
  }
});

test('a bookTicker message is delivered unmodified through the real client (wire-level regression)', async () => {
  // The contract-status path re-scans the raw payload text for every
  // message (see the CONTRACT_ID_PATTERN check in connect()). This proves
  // that scan is a no-op for other message types — an existing stream
  // being dropped or mutated by that change would fail here, not just in
  // an in-memory predicate test.
  const wss = new WebSocketServer({ port: 0 });
  await new Promise<void>((resolve) => wss.once('listening', resolve));

  wss.on('connection', (socket) => {
    socket.send('{"s":"BTCUSD","b":"99.5","B":"1.2","a":"99.6","A":"0.8","E":1700000000000}');
  });

  const { port } = wss.address() as { port: number };
  const client = new GeminiWebSocketClient(`ws://localhost:${port}`);

  try {
    const received = await waitForMessage(client, () => client.connect());

    assert.strictEqual(isContractStatusMessage(received), false);
    assert.strictEqual(isBookTickerMessage(received), true);
    assert.deepStrictEqual(received, {
      s: 'BTCUSD',
      b: '99.5',
      B: '1.2',
      a: '99.6',
      A: '0.8',
      E: 1700000000000,
    });
  } finally {
    client.disconnect();
    await new Promise<void>((resolve, reject) => wss.close((err) => (err ? reject(err) : resolve())));
  }
});
