import test from 'node:test';
import assert from 'node:assert/strict';
import { createNotifier, probeNotifier, type NotificationPayload } from './index.js';
import type { AlertEvent } from '../types.js';

const sampleEvent: AlertEvent = {
  ruleId: 'r1',
  ruleName: 'BTC drop',
  category: 'price.threshold',
  firedAt: '2026-05-07T12:00:00.000Z',
  reason: 'BTCUSD below 50000 (price=49900)',
};

test('notifier builds title from ruleName and message from reason', async () => {
  const calls: NotificationPayload[] = [];
  const notify = createNotifier({
    send: async (p) => {
      calls.push(p);
    },
  });

  await notify(sampleEvent);

  assert.strictEqual(calls.length, 1);
  assert.strictEqual(calls[0].title, 'BTC drop');
  assert.strictEqual(calls[0].message, sampleEvent.reason);
});

test('notifier marks test-fire events distinctly in the title', async () => {
  const calls: NotificationPayload[] = [];
  const notify = createNotifier({
    send: async (p) => {
      calls.push(p);
    },
  });

  await notify({ ...sampleEvent, reason: '[test] manual fire' });

  assert.match(calls[0].title, /^\[TEST\]/);
});

test('notifier passes through iconPath and appID', async () => {
  const calls: NotificationPayload[] = [];
  const notify = createNotifier({
    send: async (p) => {
      calls.push(p);
    },
    iconPath: '/etc/gemini.ico',
    appID: 'Custom.AppID',
  });

  await notify(sampleEvent);

  assert.strictEqual(calls[0].icon, '/etc/gemini.ico');
  assert.strictEqual(calls[0].appID, 'Custom.AppID');
});

test('notifier defaults appID to Gemini.MCP.Alerts when not provided', async () => {
  const calls: NotificationPayload[] = [];
  const notify = createNotifier({
    send: async (p) => {
      calls.push(p);
    },
  });

  await notify(sampleEvent);

  assert.strictEqual(calls[0].appID, 'Gemini.MCP.Alerts');
});

test('notifier does not block on user dismissal (wait: false)', async () => {
  const calls: NotificationPayload[] = [];
  const notify = createNotifier({
    send: async (p) => {
      calls.push(p);
    },
  });

  await notify(sampleEvent);

  assert.strictEqual(calls[0].wait, false);
});

test('probe warns on linux without DBUS_SESSION_BUS_ADDRESS', () => {
  const probe = probeNotifier({ platform: 'linux', env: {} });
  assert.strictEqual(probe.ok, false);
  assert.match(probe.warnings.join(' '), /DBUS/);
});

test('probe is happy on linux with DBus configured', () => {
  const probe = probeNotifier({
    platform: 'linux',
    env: { DBUS_SESSION_BUS_ADDRESS: 'unix:path=/run/user/1000/bus' },
  });
  assert.strictEqual(probe.ok, true);
  assert.deepStrictEqual(probe.warnings, []);
});

test('probe warns on win32 when appID is absent', () => {
  const probe = probeNotifier({ platform: 'win32', env: {} });
  assert.strictEqual(probe.ok, false);
  assert.match(probe.warnings.join(' '), /AUMID/);
});

test('probe is happy on win32 with appID', () => {
  const probe = probeNotifier({ platform: 'win32', env: {}, appID: 'Gemini.MCP.Alerts' });
  assert.strictEqual(probe.ok, true);
});

test('probe is happy on macOS by default', () => {
  const probe = probeNotifier({ platform: 'darwin', env: {} });
  assert.strictEqual(probe.ok, true);
});
