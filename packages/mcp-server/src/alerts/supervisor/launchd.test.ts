import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LaunchdSupervisor, LAUNCHD_LABEL } from './launchd.js';
import type { ShellRunResult, ShellRunner } from './types.js';

interface FakeRunCall {
  command: string;
  args: string[];
}

function fakeRunner(programmedResults: Record<string, ShellRunResult> = {}): {
  runner: ShellRunner;
  calls: FakeRunCall[];
} {
  const calls: FakeRunCall[] = [];
  const runner: ShellRunner = async (command, args) => {
    calls.push({ command, args });
    const key = `${command} ${args.join(' ')}`;
    return programmedResults[key] ?? { stdout: '', stderr: '', code: 0 };
  };
  return { runner, calls };
}

function freshHome() {
  const dir = mkdtempSync(join(tmpdir(), 'gemini-alerts-launchd-'));
  return { dir, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

test('buildPlist renders a valid plist with bin paths and env baked in', () => {
  const { dir, cleanup } = freshHome();
  try {
    const sup = new LaunchdSupervisor({ homeDir: dir, uid: 501 });
    const plist = sup.buildPlist({
      nodePath: '/usr/local/bin/node',
      daemonPath: '/opt/gemini/daemon.js',
      env: { GEMINI_API_KEY: 'k', GEMINI_API_SECRET: 'sec' },
    });

    assert.match(plist, /<string>com\.gemini\.mcp\.alerts<\/string>/);
    assert.match(plist, /<string>\/usr\/local\/bin\/node<\/string>/);
    assert.match(plist, /<string>\/opt\/gemini\/daemon\.js<\/string>/);
    assert.match(plist, /<key>GEMINI_API_KEY<\/key>\s*<string>k<\/string>/);
    assert.match(plist, /<key>RunAtLoad<\/key>\s*<true\/>/);
    assert.match(plist, /<key>KeepAlive<\/key>\s*<true\/>/);
  } finally {
    cleanup();
  }
});

test('buildPlist escapes XML-special characters in values', () => {
  const { dir, cleanup } = freshHome();
  try {
    const sup = new LaunchdSupervisor({ homeDir: dir, uid: 501 });
    const plist = sup.buildPlist({
      nodePath: '/usr/local/bin/node',
      daemonPath: '/opt/<dangerous>/daemon.js',
      env: { GEMINI_API_KEY: 'a&b<c>"d\'' },
    });
    assert.match(plist, /\/opt\/&lt;dangerous&gt;\/daemon\.js/);
    assert.match(plist, /a&amp;b&lt;c&gt;&quot;d&apos;/);
  } finally {
    cleanup();
  }
});

test('install writes plist atomically and runs bootstrap', async () => {
  const { dir, cleanup } = freshHome();
  try {
    const { runner, calls } = fakeRunner();
    const sup = new LaunchdSupervisor({ homeDir: dir, uid: 501, run: runner });
    const result = await sup.install({
      nodePath: '/n',
      daemonPath: '/d.js',
      env: { GEMINI_API_KEY: 'k' },
    });
    assert.strictEqual(result.unitPath, sup.plistPath);
    assert.deepStrictEqual(result.warnings, []);
    assert.ok(existsSync(sup.plistPath));

    // bootout (idempotent) then bootstrap
    assert.deepStrictEqual(calls.map((c) => c.command + ' ' + c.args[0]), [
      'launchctl bootout',
      'launchctl bootstrap',
    ]);
    assert.ok(calls[1].args.includes(sup.plistPath));
  } finally {
    cleanup();
  }
});

test('install surfaces bootstrap non-zero exit as a warning, not a throw', async () => {
  const { dir, cleanup } = freshHome();
  try {
    const sup = new LaunchdSupervisor({
      homeDir: dir,
      uid: 501,
      run: async (command, args) => {
        if (args[0] === 'bootstrap') {
          return { stdout: '', stderr: 'permission denied', code: 1 };
        }
        return { stdout: '', stderr: '', code: 0 };
      },
    });
    const result = await sup.install({ nodePath: '/n', daemonPath: '/d.js', env: {} });
    assert.strictEqual(result.warnings.length, 1);
    assert.match(result.warnings[0], /bootstrap exited 1/);
  } finally {
    cleanup();
  }
});

test('uninstall calls bootout and removes the plist', async () => {
  const { dir, cleanup } = freshHome();
  try {
    const { runner, calls } = fakeRunner();
    const sup = new LaunchdSupervisor({ homeDir: dir, uid: 501, run: runner });
    await sup.install({ nodePath: '/n', daemonPath: '/d.js', env: {} });
    assert.ok(existsSync(sup.plistPath));

    calls.length = 0;
    await sup.uninstall();
    assert.strictEqual(existsSync(sup.plistPath), false);
    assert.strictEqual(calls[0].command, 'launchctl');
    assert.strictEqual(calls[0].args[0], 'bootout');
  } finally {
    cleanup();
  }
});

test('status returns running=true and parses pid from launchctl print output', async () => {
  const { dir, cleanup } = freshHome();
  try {
    const sup = new LaunchdSupervisor({
      homeDir: dir,
      uid: 501,
      run: async () => ({
        stdout: 'state = running\n\tpid = 12345\n\t...',
        stderr: '',
        code: 0,
      }),
    });
    await sup.install({ nodePath: '/n', daemonPath: '/d.js', env: {} });
    const status = await sup.status();
    assert.strictEqual(status.installed, true);
    assert.strictEqual(status.running, true);
    assert.strictEqual(status.pid, 12345);
  } finally {
    cleanup();
  }
});

test('status reports installed=false, running=false when nothing exists', async () => {
  const { dir, cleanup } = freshHome();
  try {
    const sup = new LaunchdSupervisor({
      homeDir: dir,
      uid: 501,
      run: async () => ({ stdout: '', stderr: 'service not found', code: 1 }),
    });
    const status = await sup.status();
    assert.strictEqual(status.installed, false);
    assert.strictEqual(status.running, false);
  } finally {
    cleanup();
  }
});

test('label and plist path use the canonical reverse-DNS label', () => {
  const { dir, cleanup } = freshHome();
  try {
    const sup = new LaunchdSupervisor({ homeDir: dir, uid: 501 });
    assert.strictEqual(LAUNCHD_LABEL, 'com.gemini.mcp.alerts');
    assert.match(sup.plistPath, /Library\/LaunchAgents\/com\.gemini\.mcp\.alerts\.plist$/);
  } finally {
    cleanup();
  }
});

test('install creates ~/.gemini-mcp/ for log paths', async () => {
  const { dir, cleanup } = freshHome();
  try {
    const { runner } = fakeRunner();
    const sup = new LaunchdSupervisor({ homeDir: dir, uid: 501, run: runner });
    await sup.install({ nodePath: '/n', daemonPath: '/d.js', env: {} });
    assert.ok(existsSync(join(dir, '.gemini-mcp')));
    const written = readFileSync(sup.plistPath, 'utf8');
    assert.match(written, /daemon\.out\.log/);
    assert.match(written, /daemon\.err\.log/);
  } finally {
    cleanup();
  }
});
