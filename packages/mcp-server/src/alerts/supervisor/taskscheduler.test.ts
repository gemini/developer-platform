import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { TaskSchedulerSupervisor, TASK_NAME } from './taskscheduler.js';
import { buildAumidScript, AUMID } from './win32-aumid.js';
import type { ShellRunResult, ShellRunner } from './types.js';

function fakeAppData() {
  // installAumidShortcut calls fs.mkdir on the shortcut directory — even in
  // tests with a fake runner. Use a real tmpdir so we don't create literal
  // "C:\Users\test\..." trees on the host filesystem.
  const dir = mkdtempSync(join(tmpdir(), 'gemini-alerts-tasksched-'));
  return { dir, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

function fakeRunner(handler?: (cmd: string, args: string[]) => ShellRunResult): {
  runner: ShellRunner;
  calls: { command: string; args: string[] }[];
} {
  const calls: { command: string; args: string[] }[] = [];
  const runner: ShellRunner = async (command, args) => {
    calls.push({ command, args });
    return handler?.(command, args) ?? { stdout: '', stderr: '', code: 0 };
  };
  return { runner, calls };
}

test('buildRegisterScript embeds Register-ScheduledTask with AtLogon trigger', () => {
  // buildRegisterScript is a pure render — appData isn't read by it, so a
  // literal Windows-shaped string is fine here (no fs side effects).
  const sup = new TaskSchedulerSupervisor({ appData: 'C:\\Users\\test\\AppData\\Roaming' });
  const script = sup.buildRegisterScript({
    nodePath: 'C:\\Program Files\\nodejs\\node.exe',
    daemonPath: 'C:\\opt\\gemini\\daemon.js',
    env: { GEMINI_API_KEY: 'k' },
  });
  assert.match(script, /Register-ScheduledTask -TaskName 'GeminiMcpAlerts'/);
  assert.match(script, /-AtLogon/);
  assert.match(script, /-RestartCount 999/);
  assert.match(script, /SetEnvironmentVariable\('GEMINI_API_KEY', 'k', 'User'\)/);
});

test('buildRegisterScript single-quote-escapes embedded apostrophes', () => {
  const sup = new TaskSchedulerSupervisor({ appData: 'C:\\AD' });
  const script = sup.buildRegisterScript({
    nodePath: 'C:\\node.exe',
    daemonPath: 'C:\\d.js',
    env: { WEIRD: "it's tricky" },
  });
  assert.match(script, /'WEIRD', 'it''s tricky'/);
});

test('install passes through a single PowerShell call with -Command', async () => {
  const { runner, calls } = fakeRunner();
  const sup = new TaskSchedulerSupervisor({ appData: '', run: runner });
  const result = await sup.install({
    nodePath: 'C:\\node.exe',
    daemonPath: 'C:\\d.js',
    env: {},
  });
  assert.strictEqual(result.unitPath, TASK_NAME);
  assert.strictEqual(calls[0].command, 'powershell.exe');
  assert.deepStrictEqual(calls[0].args.slice(0, 5), [
    '-NoProfile',
    '-NonInteractive',
    '-ExecutionPolicy',
    'Bypass',
    '-Command',
  ]);
});

test('install warns when APPDATA is unavailable (skips AUMID shortcut)', async () => {
  const { runner } = fakeRunner();
  const sup = new TaskSchedulerSupervisor({ appData: '', run: runner });
  const result = await sup.install({ nodePath: 'C:\\node.exe', daemonPath: 'C:\\d.js', env: {} });
  assert.ok(result.warnings.some((w) => /APPDATA/.test(w)));
});

test('install creates the AUMID shortcut when APPDATA is set', async () => {
  const tmp = fakeAppData();
  try {
    const { runner, calls } = fakeRunner();
    const sup = new TaskSchedulerSupervisor({ appData: tmp.dir, run: runner });
    await sup.install({ nodePath: 'C:\\node.exe', daemonPath: 'C:\\d.js', env: {} });
    // First call: register task. Second call: AUMID shortcut.
    assert.strictEqual(calls.length, 2);
    const aumidScript = calls[1].args[calls[1].args.length - 1];
    assert.match(aumidScript, /WScript\.Shell/);
    assert.match(aumidScript, /CreateShortcut/);
    assert.match(aumidScript, new RegExp(AUMID));
  } finally {
    tmp.cleanup();
  }
});

test('uninstall removes both the task and the start-menu shortcut', async () => {
  // uninstall only invokes the runner; appData is just embedded in script
  // strings, so a literal value is fine and avoids fs side effects.
  const { runner, calls } = fakeRunner();
  const sup = new TaskSchedulerSupervisor({
    appData: 'C:\\Users\\test\\AppData\\Roaming',
    run: runner,
  });
  await sup.uninstall();
  assert.strictEqual(calls.length, 2);
  assert.match(calls[0].args[calls[0].args.length - 1], /Unregister-ScheduledTask/);
  assert.match(calls[1].args[calls[1].args.length - 1], /Remove-Item/);
});

test('status returns installed=false when Get-ScheduledTask exits non-zero', async () => {
  const sup = new TaskSchedulerSupervisor({
    appData: '',
    run: async () => ({ stdout: '', stderr: 'not found', code: 1 }),
  });
  const status = await sup.status();
  assert.strictEqual(status.installed, false);
  assert.strictEqual(status.running, false);
});

test('status reads State=Running from JSON output', async () => {
  const sup = new TaskSchedulerSupervisor({
    appData: '',
    run: async () => ({
      stdout: JSON.stringify({ TaskName: TASK_NAME, State: 'Running' }),
      stderr: '',
      code: 0,
    }),
  });
  const status = await sup.status();
  assert.strictEqual(status.installed, true);
  assert.strictEqual(status.running, true);
});

test('buildAumidScript renders shortcut creation with target + icon', () => {
  const script = buildAumidScript({
    shortcutPath: 'C:\\Users\\test\\AppData\\Roaming\\Microsoft\\Windows\\Start Menu\\Programs\\Gemini MCP Alerts.lnk',
    targetPath: 'C:\\Program Files\\nodejs\\node.exe',
    arguments: '"C:\\opt\\daemon.js"',
    iconPath: 'C:\\Users\\test\\AppData\\Roaming\\Gemini\\mcp-alerts\\gemini-mcp.ico',
  });
  assert.match(script, /WScript\.Shell/);
  assert.match(script, /CreateShortcut\('C:\\Users\\test\\AppData\\Roaming\\Microsoft/);
  assert.match(script, /TargetPath = 'C:\\\\Program Files\\\\nodejs\\\\node\.exe'|TargetPath = 'C:\\Program Files\\nodejs\\node\.exe'/);
});
