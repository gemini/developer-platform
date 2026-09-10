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

test('subscribe() sends the wire channel name with correct casing for spot vs prediction symbols', async () => {
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
    await manager.subscribe('GEMI-PRES2028-VANCE', 'bookTicker');
    await manager.subscribe('BTCUSD', 'bookTicker');

    assert.ok(receivedParams.includes('GEMI-PRES2028-VANCE@bookTicker'));
    assert.ok(receivedParams.includes('btcusd@bookTicker'));
  } finally {
    manager.disconnect();
    await new Promise<void>((resolve, reject) => wss.close((err) => (err ? reject(err) : resolve())));
  }
});
