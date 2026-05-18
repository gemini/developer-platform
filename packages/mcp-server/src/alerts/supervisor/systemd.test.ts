import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SystemdSupervisor, SYSTEMD_UNIT_NAME } from './systemd.js';
import type { ShellRunner } from './types.js';

interface FakeRunCall {
  command: string;
  args: string[];
}

function fakeRunner(): { runner: ShellRunner; calls: FakeRunCall[] } {
  const calls: FakeRunCall[] = [];
  const runner: ShellRunner = async (command, args) => {
    calls.push({ command, args });
    return { stdout: '', stderr: '', code: 0 };
  };
  return { runner, calls };
}

function freshHome() {
  const dir = mkdtempSync(join(tmpdir(), 'gemini-alerts-systemd-'));
  return { dir, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

test('buildUnit renders [Service] with ExecStart and Environment lines', () => {
  const { dir, cleanup } = freshHome();
  try {
    const sup = new SystemdSupervisor({ homeDir: dir });
    const unit = sup.buildUnit({
      nodePath: '/usr/bin/node',
      daemonPath: '/opt/gemini/daemon.js',
      env: { GEMINI_API_KEY: 'k', GEMINI_ACCOUNT: 'primary' },
    });
    assert.match(unit, /\[Unit\]/);
    assert.match(unit, /\[Service\]/);
    assert.match(unit, /\[Install\]/);
    assert.match(unit, /ExecStart=\/usr\/bin\/node \/opt\/gemini\/daemon\.js/);
    assert.match(unit, /Restart=always/);
    assert.match(unit, /Environment=GEMINI_API_KEY=k/);
    assert.match(unit, /Environment=GEMINI_ACCOUNT=primary/);
  } finally {
    cleanup();
  }
});

test('buildUnit quotes ExecStart paths that contain whitespace', () => {
  const { dir, cleanup } = freshHome();
  try {
    const sup = new SystemdSupervisor({ homeDir: dir });
    const unit = sup.buildUnit({
      nodePath: '/usr/bin/node',
      daemonPath: '/opt/has space/daemon.js',
      env: {},
    });
    assert.match(unit, /ExecStart=\/usr\/bin\/node '\/opt\/has space\/daemon\.js'/);
  } finally {
    cleanup();
  }
});

test('buildUnit double-quotes Environment values that contain whitespace', () => {
  const { dir, cleanup } = freshHome();
  try {
    const sup = new SystemdSupervisor({ homeDir: dir });
    const unit = sup.buildUnit({
      nodePath: '/n',
      daemonPath: '/d.js',
      env: { GEMINI_API_BASE_URL: 'https://api.gemini.com path with spaces' },
    });
    assert.match(unit, /Environment=GEMINI_API_BASE_URL="https:\/\/api\.gemini\.com path with spaces"/);
  } finally {
    cleanup();
  }
});

test('install runs daemon-reload then enable --now', async () => {
  const { dir, cleanup } = freshHome();
  try {
    const { runner, calls } = fakeRunner();
    const sup = new SystemdSupervisor({ homeDir: dir, run: runner });
    const result = await sup.install({ nodePath: '/n', daemonPath: '/d.js', env: {} });
    assert.strictEqual(result.unitPath, sup.unitPath);
    assert.ok(existsSync(sup.unitPath));
    assert.deepStrictEqual(calls.map((c) => `${c.command} ${c.args.join(' ')}`), [
      'systemctl --user daemon-reload',
      `systemctl --user enable --now ${SYSTEMD_UNIT_NAME}`,
    ]);
  } finally {
    cleanup();
  }
});

test('install surfaces enable failure as a warning, not a throw', async () => {
  const { dir, cleanup } = freshHome();
  try {
    const sup = new SystemdSupervisor({
      homeDir: dir,
      run: async (command, args) => {
        if (args.includes('enable')) {
          return { stdout: '', stderr: 'Failed to connect to bus', code: 1 };
        }
        return { stdout: '', stderr: '', code: 0 };
      },
    });
    const result = await sup.install({ nodePath: '/n', daemonPath: '/d.js', env: {} });
    assert.strictEqual(result.warnings.length, 1);
    assert.match(result.warnings[0], /enable --now exited 1/);
  } finally {
    cleanup();
  }
});

test('uninstall disables, removes the unit, and reloads', async () => {
  const { dir, cleanup } = freshHome();
  try {
    const { runner, calls } = fakeRunner();
    const sup = new SystemdSupervisor({ homeDir: dir, run: runner });
    await sup.install({ nodePath: '/n', daemonPath: '/d.js', env: {} });
    calls.length = 0;
    await sup.uninstall();
    assert.strictEqual(existsSync(sup.unitPath), false);
    const order = calls.map((c) => c.args.join(' '));
    assert.deepStrictEqual(order, [
      `--user disable --now ${SYSTEMD_UNIT_NAME}`,
      '--user daemon-reload',
    ]);
  } finally {
    cleanup();
  }
});

test('status reports running=true and parses MainPID', async () => {
  const { dir, cleanup } = freshHome();
  try {
    const sup = new SystemdSupervisor({
      homeDir: dir,
      // Decide by command intent rather than call ordinal — install fires
      // its own runner calls before status() does.
      run: async (_cmd, args) => {
        if (args.includes('is-active')) return { stdout: 'active\n', stderr: '', code: 0 };
        if (args.includes('show')) return { stdout: 'MainPID=4242\n', stderr: '', code: 0 };
        return { stdout: '', stderr: '', code: 0 };
      },
    });
    await sup.install({ nodePath: '/n', daemonPath: '/d.js', env: {} });
    const status = await sup.status();
    assert.strictEqual(status.installed, true);
    assert.strictEqual(status.running, true);
    assert.strictEqual(status.pid, 4242);
  } finally {
    cleanup();
  }
});

test('status reports running=false when MainPID is 0', async () => {
  const { dir, cleanup } = freshHome();
  try {
    const sup = new SystemdSupervisor({
      homeDir: dir,
      run: async () => ({ stdout: 'inactive\nMainPID=0\n', stderr: '', code: 3 }),
    });
    const status = await sup.status();
    assert.strictEqual(status.running, false);
    assert.strictEqual(status.pid, undefined);
  } finally {
    cleanup();
  }
});
