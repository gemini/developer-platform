import test from 'node:test';
import assert from 'node:assert/strict';
import { WebSocketServer, type RawData } from 'ws';
import { WebSocketManager, toChannelSymbol } from './manager.js';

test('toChannelSymbol preserves case and hyphens for prediction-market symbols', () => {
  assert.strictEqual(toChannelSymbol('GEMI-PRES2028-VANCE'), 'GEMI-PRES2028-VANCE');
  assert.strictEqual(toChannelSymbol('gemi-pres2028-vance'), 'GEMI-PRES2028-VANCE');
});

test('toChannelSymbol lowercases spot symbols', () => {
  assert.strictEqual(toChannelSymbol('BTCUSD'), 'btcusd');
  assert.strictEqual(toChannelSymbol('EthUsd'), 'ethusd');
});

async function withEchoServer(run: (manager: WebSocketManager, receivedParams: string[]) => Promise<void>): Promise<void> {
  const receivedParams: string[] = [];
  const wss = new WebSocketServer({ port: 0 });
  await new Promise<void>((resolve) => wss.once('listening', resolve));

  wss.on('connection', (socket) => {
    socket.on('message', (data: RawData) => {
      const msg = JSON.parse(data.toString()) as { id: string; params: string[] };
      receivedParams.push(...msg.params);
      socket.send(JSON.stringify({ id: msg.id, result: msg.params }));
    });
  });

  const { port } = wss.address() as { port: number };
  const manager = new WebSocketManager(`ws://localhost:${port}`);

  try {
    await manager.initialize();
    await run(manager, receivedParams);
  } finally {
    manager.disconnect();
    await new Promise<void>((resolve, reject) => wss.close((err) => (err ? reject(err) : resolve())));
  }
}

test('subscribe() sends the wire channel name with correct casing for spot vs prediction symbols', async () => {
  await withEchoServer(async (manager, receivedParams) => {
    await manager.subscribe('GEMI-PRES2028-VANCE', 'bookTicker');
    await manager.subscribe('BTCUSD', 'bookTicker');

    assert.ok(receivedParams.includes('GEMI-PRES2028-VANCE@bookTicker'));
    assert.ok(receivedParams.includes('btcusd@bookTicker'));
  });
});

test('subscribeContractStatus() sends the literal global channel name, with no symbol prefix', async () => {
  await withEchoServer(async (manager, receivedParams) => {
    await manager.subscribeContractStatus();

    assert.deepStrictEqual(receivedParams, ['contractStatus']);
  });
});

test('subscribeContractStatus() is idempotent — a second call does not re-subscribe over the wire', async () => {
  await withEchoServer(async (manager, receivedParams) => {
    await manager.subscribeContractStatus();
    await manager.subscribeContractStatus();

    assert.deepStrictEqual(receivedParams, ['contractStatus']);
  });
});

test('a real contractStatus wire message lands in the store with the contract ID intact', async () => {
  const wss = new WebSocketServer({ port: 0 });
  await new Promise<void>((resolve) => wss.once('listening', resolve));

  // 17-18 digit contract IDs exceed Number.MAX_SAFE_INTEGER. Built as a raw
  // string, not a JS numeric literal — `145828833218573125` as source code
  // would itself get rounded by V8 at parse time, before it's even sent.
  const BIG_CONTRACT_ID = '145828833218573125';

  wss.on('connection', (socket) => {
    socket.on('message', (data: RawData) => {
      const msg = JSON.parse(data.toString()) as { id: string; params: string[] };
      socket.send(JSON.stringify({ id: msg.id, result: msg.params }));
      socket.send(
        `{"e":"contractStatus","E":1700000000000,"s":"GEMI-PRES2028-VANCE",` +
          `"k":"PRES2028","c":"GEMI-PRES2028-VANCE","i":${BIG_CONTRACT_ID},` +
          `"p":"0.50","o":"active","n":"settled"}`
      );
    });
  });

  const { port } = wss.address() as { port: number };
  const manager = new WebSocketManager(`ws://localhost:${port}`);

  try {
    await manager.initialize();
    await manager.subscribeContractStatus();

    // The server sends the contractStatus event synchronously right after
    // acking the subscribe request, so it may already be in the store by
    // the time subscribe() resolves — check directly first. Only fall back
    // to waiting on the next onUpdate if it genuinely hasn't arrived yet,
    // with a bounded timeout so a real regression fails fast instead of
    // hanging forever waiting for an event that will never come.
    const store = manager.getStore();
    const status =
      store.getContractStatus('GEMI-PRES2028-VANCE') ??
      (await new Promise((resolve) => {
        const timer = setTimeout(() => {
          stop();
          resolve(undefined);
        }, 2000);
        const stop = store.onUpdate('GEMI-PRES2028-VANCE', (event) => {
          if (event.kind !== 'contractStatus') return;
          clearTimeout(timer);
          stop();
          resolve(store.getContractStatus('GEMI-PRES2028-VANCE'));
        });
      }));

    assert.deepStrictEqual(status, {
      symbol: 'GEMI-PRES2028-VANCE',
      eventTicker: 'PRES2028',
      contractTicker: 'GEMI-PRES2028-VANCE',
      contractId: BIG_CONTRACT_ID,
      previousStatus: 'active',
      newStatus: 'settled',
      strikePrice: '0.50',
      eventTimeMs: 1_700_000_000_000,
      timestamp: (status as { timestamp: number }).timestamp,
    });
  } finally {
    manager.disconnect();
    await new Promise<void>((resolve, reject) => wss.close((err) => (err ? reject(err) : resolve())));
  }
});
