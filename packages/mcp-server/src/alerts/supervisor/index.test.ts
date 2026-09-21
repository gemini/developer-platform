import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getSupervisor,
  LaunchdSupervisor,
  SystemdSupervisor,
  TaskSchedulerSupervisor,
  pickWhitelistedEnv,
  ENV_WHITELIST,
} from './index.js';

test('getSupervisor returns LaunchdSupervisor on darwin', () => {
  assert.ok(getSupervisor('darwin') instanceof LaunchdSupervisor);
});

test('getSupervisor returns SystemdSupervisor on linux', () => {
  assert.ok(getSupervisor('linux') instanceof SystemdSupervisor);
});

test('getSupervisor returns TaskSchedulerSupervisor on win32', () => {
  assert.ok(getSupervisor('win32') instanceof TaskSchedulerSupervisor);
});

test('getSupervisor returns an unsupported stub for other platforms', async () => {
  const sup = getSupervisor('aix');
  await assert.rejects(() => sup.install(), /Unsupported platform/);
  await assert.rejects(() => sup.uninstall(), /Unsupported platform/);
  const status = await sup.status();
  assert.strictEqual(status.installed, false);
  assert.strictEqual(status.running, false);
});

test('pickWhitelistedEnv only retains the documented vars', () => {
  const picked = pickWhitelistedEnv({
    GEMINI_API_KEY: 'k',
    GEMINI_API_SECRET: 's',
    GEMINI_ACCOUNT: 'main',
    AWS_SECRET_ACCESS_KEY: 'should-not-leak',
    PATH: '/usr/bin',
    HOME: '/home/me',
  });
  assert.deepStrictEqual(picked, {
    GEMINI_API_KEY: 'k',
    GEMINI_API_SECRET: 's',
    GEMINI_ACCOUNT: 'main',
    PATH: '/usr/bin',
  });
});

// Regression guard for PREDICT-8820: an installed daemon derives config.sdkEnv from
// whatever env vars actually reach its process, so an explicit GEMINI_SDK_ENV override
// dropped here would silently diverge from the operator's intent once installed.
test('pickWhitelistedEnv preserves an explicit GEMINI_SDK_ENV override', () => {
  const picked = pickWhitelistedEnv({
    GEMINI_API_BASE_URL: 'https://api.gemini.com',
    GEMINI_SDK_ENV: 'sandbox',
  });
  assert.strictEqual(picked['GEMINI_SDK_ENV'], 'sandbox');
});

test('ENV_WHITELIST is the canonical list and does not include arbitrary HOME', () => {
  assert.ok(ENV_WHITELIST.includes('GEMINI_API_KEY'));
  assert.ok(ENV_WHITELIST.includes('GEMINI_API_SECRET'));
  assert.ok(ENV_WHITELIST.includes('GEMINI_SDK_ENV'));
  assert.ok(!(ENV_WHITELIST as readonly string[]).includes('HOME'));
});
