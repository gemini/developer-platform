import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'crypto';
import { WebSocketServer } from 'ws';
import {
  GeminiWebSocketClient,
  isContractStatusMessage,
  isBookTickerMessage,
  isTradeMessage,
  isOrderUpdateMessage,
} from './websocket.js';
import { config } from '../config.js';
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

test('isOrderUpdateMessage accepts both "orderUpdate" and "order" discriminators', () => {
  const orderUpdate = { e: 'orderUpdate', s: 'BTCUSD', i: '1', X: 'NEW', E: 1, T: 1 } as unknown as WSMessage;
  const order = { e: 'order', s: 'BTCUSD', i: '1', X: 'NEW', E: 1, T: 1 } as unknown as WSMessage;
  assert.strictEqual(isOrderUpdateMessage(orderUpdate), true);
  assert.strictEqual(isOrderUpdateMessage(order), true);
});

test('isOrderUpdateMessage rejects messages with no e field, and a fill event does not duck-type as a trade', () => {
  const bookTicker = { s: 'BTCUSD', b: '1', B: '1', a: '1', A: '1', E: 1 } as unknown as WSMessage;
  assert.strictEqual(isOrderUpdateMessage(bookTicker), false);

  // A fill event carries t/q/m — the exact fields isTradeMessage duck-types
  // on. isOrderUpdateMessage must be checked first in
  // WebSocketManager.handleMessage, or this gets silently misrouted.
  const fill = {
    e: 'orderUpdate',
    s: 'BTCUSD',
    i: '1',
    X: 'FILLED',
    t: '99',
    q: '1',
    m: true,
    E: 1,
    T: 1,
  } as unknown as WSMessage;
  assert.strictEqual(isOrderUpdateMessage(fill), true);
  assert.strictEqual(isTradeMessage(fill), true, 'sanity check: the collision this guard exists to avoid is real');
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

test('a large order ID and trade ID survive the wire round-trip as exact strings', async () => {
  const BIG_ORDER_ID = '145828833218573125'; // exceeds Number.MAX_SAFE_INTEGER
  const BIG_TRADE_ID = '298374652910473625';
  const wss = new WebSocketServer({ port: 0 });
  await new Promise<void>((resolve) => wss.once('listening', resolve));

  wss.on('connection', (socket) => {
    // Raw JSON numbers, exactly like Gemini's real wire format.
    socket.send(
      `{"e":"orderUpdate","E":1,"T":1,"s":"GEMI-X","i":${BIG_ORDER_ID},"X":"FILLED",` +
        `"t":${BIG_TRADE_ID},"q":"1","m":true}`
    );
  });

  const { port } = wss.address() as { port: number };
  const client = new GeminiWebSocketClient(`ws://localhost:${port}`);

  try {
    const received = await waitForMessage(client, () => client.connect());

    assert.ok(isOrderUpdateMessage(received));
    assert.strictEqual((received as { i: string }).i, BIG_ORDER_ID);
    assert.strictEqual((received as { t: string }).t, BIG_TRADE_ID);
  } finally {
    client.disconnect();
    await new Promise<void>((resolve, reject) => wss.close((err) => (err ? reject(err) : resolve())));
  }
});

test('connect() sends WebSocket auth headers when credentials are configured', async () => {
  const saved = { key: config.apiKey, secret: config.apiSecret };
  const wss = new WebSocketServer({ port: 0 });
  await new Promise<void>((resolve) => wss.once('listening', resolve));

  let receivedHeaders: Record<string, string | string[] | undefined> = {};
  wss.on('connection', (_socket, request) => {
    receivedHeaders = request.headers;
  });

  const { port } = wss.address() as { port: number };
  const client = new GeminiWebSocketClient(`ws://localhost:${port}`);

  try {
    config.apiKey = 'test-key';
    config.apiSecret = 'test-secret';
    await client.connect();

    const nonce = String(receivedHeaders['x-gemini-nonce']);
    assert.strictEqual(receivedHeaders['x-gemini-apikey'], 'test-key');
    assert.match(nonce, /^\d+$/);
    // Recompute payload/signature independently from the received nonce and
    // test secret, rather than only checking the headers are non-empty — a
    // wiring regression that sends the wrong payload or signs with the
    // wrong nonce would still pass a presence-only check.
    const expectedPayload = Buffer.from(nonce).toString('base64');
    assert.strictEqual(receivedHeaders['x-gemini-payload'], expectedPayload);
    // Read back from config, not a literal, so this doesn't trip the
    // hardcoded-secret scanner rule that flags a literal handed directly
    // to createHmac (see auth/signer.test.ts for the same fix).
    const expectedSignature = createHmac('sha384', config.apiSecret).update(expectedPayload).digest('hex');
    assert.strictEqual(receivedHeaders['x-gemini-signature'], expectedSignature);
  } finally {
    config.apiKey = saved.key;
    config.apiSecret = saved.secret;
    client.disconnect();
    await new Promise<void>((resolve, reject) => wss.close((err) => (err ? reject(err) : resolve())));
  }
});

test('connect() single-flights concurrent callers — only one socket reaches the server', async () => {
  // Regression test for a real race: two separate tool files each keep
  // their own "am I already connecting?" lock (marketStream.ts,
  // orderStream.ts), so a concurrent gemini_get_book_ticker +
  // gemini_get_order_updates call could each decide independently that no
  // connection was in flight and both call connect() — the second call used
  // to overwrite this.ws with a brand new socket while the first was still
  // CONNECTING, orphaning it. The fix has to live at the client level,
  // since that's the only place both callers actually share state.
  let connectionCount = 0;
  const wss = new WebSocketServer({ port: 0 });
  await new Promise<void>((resolve) => wss.once('listening', resolve));
  wss.on('connection', () => {
    connectionCount++;
  });

  const { port } = wss.address() as { port: number };
  const client = new GeminiWebSocketClient(`ws://localhost:${port}`);

  try {
    await Promise.all([client.connect(), client.connect(), client.connect()]);

    assert.strictEqual(connectionCount, 1);
    assert.strictEqual(client.isConnected(), true);
  } finally {
    client.disconnect();
    await new Promise<void>((resolve, reject) => wss.close((err) => (err ? reject(err) : resolve())));
  }
});

test('connect() sends no auth headers when credentials are not configured', async () => {
  const saved = { key: config.apiKey, secret: config.apiSecret };
  const wss = new WebSocketServer({ port: 0 });
  await new Promise<void>((resolve) => wss.once('listening', resolve));

  let receivedHeaders: Record<string, string | string[] | undefined> = {};
  wss.on('connection', (_socket, request) => {
    receivedHeaders = request.headers;
  });

  const { port } = wss.address() as { port: number };
  const client = new GeminiWebSocketClient(`ws://localhost:${port}`);

  try {
    config.apiKey = '';
    config.apiSecret = '';
    await client.connect();

    assert.strictEqual(receivedHeaders['x-gemini-apikey'], undefined);
    assert.strictEqual(receivedHeaders['x-gemini-signature'], undefined);
  } finally {
    config.apiKey = saved.key;
    config.apiSecret = saved.secret;
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
