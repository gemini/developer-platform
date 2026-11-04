import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AlertStore } from './store.js';
import type { AlertRule } from './types.js';

function freshStore(): { store: AlertStore; dir: string; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), 'gemini-alerts-test-'));
  const store = new AlertStore({ filePath: join(dir, 'alerts.json') });
  return { store, dir, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

const sample = (overrides: Partial<AlertRule> = {}): Parameters<AlertStore['create']>[0] => ({
  name: 'BTC drop',
  category: 'price.threshold',
  enabled: true,
  oneShot: false,
  cooldownMs: 60_000,
  params: { symbol: 'BTCUSD', direction: 'below', threshold: '50000' },
  ...overrides,
});

test('read returns empty file when alerts.json is missing', async () => {
  const { store, cleanup } = freshStore();
  try {
    const file = await store.read();
    assert.deepStrictEqual(file, { version: 1, rules: [] });
  } finally {
    cleanup();
  }
});

test('create assigns id + createdAt and persists across instances', async () => {
  const { store, dir, cleanup } = freshStore();
  try {
    const created = await store.create(sample());
    assert.ok(created.id, 'id assigned');
    assert.ok(created.createdAt, 'createdAt assigned');
    assert.strictEqual(created.lastFiredAt, null);

    const fresh = new AlertStore({ filePath: join(dir, 'alerts.json') });
    const all = await fresh.list();
    assert.strictEqual(all.length, 1);
    assert.strictEqual(all[0].id, created.id);
  } finally {
    cleanup();
  }
});

test('update applies patch, delete removes, get round-trips', async () => {
  const { store, cleanup } = freshStore();
  try {
    const a = await store.create(sample({ name: 'A' }));
    const b = await store.create(sample({ name: 'B' }));

    const updated = await store.update(a.id, { name: 'A2', enabled: false });
    assert.strictEqual(updated.name, 'A2');
    assert.strictEqual(updated.enabled, false);
    assert.deepStrictEqual(updated.params, a.params, 'untouched fields preserved');

    const got = await store.get(a.id);
    assert.strictEqual(got?.name, 'A2');

    assert.strictEqual(await store.delete(a.id), true);
    assert.strictEqual(await store.delete(a.id), false, 'second delete is a no-op');
    assert.deepStrictEqual((await store.list()).map((r) => r.id), [b.id]);
  } finally {
    cleanup();
  }
});

test('markFired stamps lastFiredAt', async () => {
  const { store, cleanup } = freshStore();
  try {
    const r = await store.create(sample());
    const stamped = await store.markFired(r.id, '2026-05-07T12:00:00.000Z');
    assert.strictEqual(stamped.lastFiredAt, '2026-05-07T12:00:00.000Z');
  } finally {
    cleanup();
  }
});

test('write is atomic — partial .tmp does not corrupt reads', async () => {
  const { store, dir, cleanup } = freshStore();
  try {
    await store.create(sample());
    const stale = join(dir, 'alerts.json.999.123.tmp');
    writeFileSync(stale, '{"this":"is corrupt');
    const list = await store.list();
    assert.strictEqual(list.length, 1, 'real file is unaffected by stale tmp sibling');
  } finally {
    cleanup();
  }
});

test('write does not leave a .tmp file behind on success', async () => {
  const { store, dir, cleanup } = freshStore();
  try {
    await store.create(sample());
    const entries = await fs.readdir(dir);
    assert.strictEqual(
      entries.some((e) => e.endsWith('.tmp')),
      false,
      `unexpected tmp leftovers: ${entries.join(',')}`,
    );
  } finally {
    cleanup();
  }
});

test('read throws on malformed JSON instead of silently resetting', async () => {
  const { store, dir, cleanup } = freshStore();
  try {
    writeFileSync(join(dir, 'alerts.json'), '{ not json');
    await assert.rejects(() => store.read());
  } finally {
    cleanup();
  }
});

