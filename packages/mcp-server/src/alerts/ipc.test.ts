import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer, type Server } from 'node:http';
import {
  notifyDaemonReload,
  testFireRule,
  getDaemonStatus,
  readDaemonMeta,
  writeDaemonMeta,
  deleteDaemonMeta,
} from './ipc.js';

function tmp(name: string) {
  const dir = mkdtempSync(join(tmpdir(), `gemini-alerts-ipc-${name}-`));
  return { dir, metaPath: join(dir, 'daemon.json'), cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

function startMockDaemon(handlers: Record<string, (req: import('node:http').IncomingMessage) => Promise<{ status: number; body: unknown }>>): Promise<{ port: number; close: () => Promise<void>; calls: string[] }> {
  return new Promise((resolve, reject) => {
    const calls: string[] = [];
    const server: Server = createServer((req, res) => {
      const key = `${req.method} ${req.url}`;
      calls.push(key);
      const handler = handlers[key] ?? handlers[`${req.method} *`];
      if (!handler) {
        res.statusCode = 404;
        return res.end(JSON.stringify({ error: 'not found' }));
      }
      handler(req).then(({ status, body }) => {
        res.statusCode = status;
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify(body));
      });
    });
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      if (!addr || typeof addr === 'string') return reject(new Error('listen failed'));
      resolve({
        port: addr.port,
        calls,
        close: () =>
          new Promise<void>((r) => {
            server.close(() => r());
          }),
      });
    });
  });
}

test('readDaemonMeta returns null when file is missing', async () => {
  const { metaPath, cleanup } = tmp('missing');
  try {
    assert.strictEqual(await readDaemonMeta(metaPath), null);
  } finally {
    cleanup();
  }
});

test('readDaemonMeta returns null on malformed JSON', async () => {
  const { metaPath, cleanup } = tmp('malformed');
  try {
    writeFileSync(metaPath, '{ not json');
    assert.strictEqual(await readDaemonMeta(metaPath), null);
  } finally {
    cleanup();
  }
});

test('writeDaemonMeta + readDaemonMeta round-trip', async () => {
  const { metaPath, cleanup } = tmp('roundtrip');
  try {
    await writeDaemonMeta({ pid: 9999, port: 12345, startedAt: 1700_000_000_000 }, metaPath);
    const got = await readDaemonMeta(metaPath);
    assert.deepStrictEqual(got, { pid: 9999, port: 12345, startedAt: 1700_000_000_000 });
  } finally {
    cleanup();
  }
});

test('deleteDaemonMeta removes the file and is silent when absent', async () => {
  const { metaPath, cleanup } = tmp('delete');
  try {
    await writeDaemonMeta({ pid: 1, port: 2, startedAt: 3 }, metaPath);
    await deleteDaemonMeta(metaPath);
    assert.strictEqual(await readDaemonMeta(metaPath), null);
    // second delete is a no-op
    await deleteDaemonMeta(metaPath);
  } finally {
    cleanup();
  }
});

test('notifyDaemonReload returns ok=false when meta is missing — does not throw', async () => {
  const { metaPath, cleanup } = tmp('no-daemon');
  try {
    const result = await notifyDaemonReload({ metaPath });
    assert.deepStrictEqual(result, { ok: false });
  } finally {
    cleanup();
  }
});

test('notifyDaemonReload POSTs to /reload and returns ok=true on 200', async () => {
  const { metaPath, cleanup } = tmp('reload');
  const daemon = await startMockDaemon({
    'POST /reload': async () => ({ status: 200, body: { ok: true } }),
  });
  try {
    await writeDaemonMeta({ pid: 1, port: daemon.port, startedAt: Date.now() }, metaPath);
    const result = await notifyDaemonReload({ metaPath });
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.status, 200);
    assert.deepStrictEqual(daemon.calls, ['POST /reload']);
  } finally {
    await daemon.close();
    cleanup();
  }
});

test('notifyDaemonReload returns ok=false when daemon is unreachable', async () => {
  const { metaPath, cleanup } = tmp('unreachable');
  try {
    // Point at a port that is almost certainly not bound on loopback.
    await writeDaemonMeta({ pid: 1, port: 1, startedAt: Date.now() }, metaPath);
    const result = await notifyDaemonReload({ metaPath, timeoutMs: 250 });
    assert.strictEqual(result.ok, false);
  } finally {
    cleanup();
  }
});

test('testFireRule URL-encodes the rule id', async () => {
  const { metaPath, cleanup } = tmp('test-fire');
  const daemon = await startMockDaemon({
    'POST *': async () => ({ status: 200, body: { ok: true } }),
  });
  try {
    await writeDaemonMeta({ pid: 1, port: daemon.port, startedAt: Date.now() }, metaPath);
    const result = await testFireRule('rule with spaces/and-slashes', { metaPath });
    assert.strictEqual(result.ok, true);
    const lastCall = daemon.calls[daemon.calls.length - 1];
    assert.match(lastCall, /\/test-fire\/rule%20with%20spaces%2Fand-slashes/);
  } finally {
    await daemon.close();
    cleanup();
  }
});

test('getDaemonStatus returns the body on 200, null otherwise', async () => {
  const { metaPath, cleanup } = tmp('status');
  const daemon = await startMockDaemon({
    'GET /status': async () => ({ status: 200, body: { pid: 1, port: 2, firedCount: 7 } }),
  });
  try {
    await writeDaemonMeta({ pid: 1, port: daemon.port, startedAt: Date.now() }, metaPath);
    const status = (await getDaemonStatus({ metaPath })) as Record<string, unknown> | null;
    assert.ok(status);
    assert.strictEqual(status.firedCount, 7);
  } finally {
    await daemon.close();
    cleanup();
  }
});

test('getDaemonStatus returns null when daemon meta is absent', async () => {
  const { metaPath, cleanup } = tmp('status-missing');
  try {
    assert.strictEqual(await getDaemonStatus({ metaPath }), null);
  } finally {
    cleanup();
  }
});
