import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { appendAlertEvent, readRecentEvents } from './log.js';
import type { AlertEvent } from './types.js';

function fresh() {
  const dir = mkdtempSync(join(tmpdir(), 'gemini-alerts-log-'));
  return { dir, path: join(dir, 'alerts.log'), cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

const event = (overrides: Partial<AlertEvent> = {}): AlertEvent => ({
  ruleId: 'r1',
  ruleName: 'BTC drop',
  category: 'price.threshold',
  firedAt: '2026-05-07T12:00:00.000Z',
  reason: 'BTC below 50000',
  ...overrides,
});

test('readRecentEvents returns [] when log is missing', async () => {
  const { path, cleanup } = fresh();
  try {
    assert.deepStrictEqual(await readRecentEvents(50, path), []);
  } finally {
    cleanup();
  }
});

test('append + read round-trips an event', async () => {
  const { path, cleanup } = fresh();
  try {
    await appendAlertEvent(event(), path);
    const events = await readRecentEvents(50, path);
    assert.strictEqual(events.length, 1);
    assert.strictEqual(events[0].ruleId, 'r1');
  } finally {
    cleanup();
  }
});

test('readRecentEvents returns the last N entries in order', async () => {
  const { path, cleanup } = fresh();
  try {
    for (let i = 0; i < 10; i++) {
      await appendAlertEvent(event({ ruleId: `r${i}` }), path);
    }
    const events = await readRecentEvents(3, path);
    assert.deepStrictEqual(
      events.map((e) => e.ruleId),
      ['r7', 'r8', 'r9'],
    );
  } finally {
    cleanup();
  }
});

test('readRecentEvents tolerates a partially-written tail line', async () => {
  const { path, cleanup } = fresh();
  try {
    writeFileSync(
      path,
      `${JSON.stringify(event({ ruleId: 'good' }))}\n{ partial`,
    );
    const events = await readRecentEvents(50, path);
    assert.strictEqual(events.length, 1);
    assert.strictEqual(events[0].ruleId, 'good');
  } finally {
    cleanup();
  }
});
