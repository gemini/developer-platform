import { promises as fs } from 'node:fs';
import { homedir, userInfo } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defaultRunner } from './runner.js';
import {
  pickWhitelistedEnv,
  type InstallOptions,
  type InstallResult,
  type ShellRunner,
  type Supervisor,
  type SupervisorStatus,
} from './types.js';

export const LAUNCHD_LABEL = 'com.gemini.mcp.alerts';

export interface LaunchdDeps {
  homeDir?: string;
  uid?: number;
  run?: ShellRunner;
  /** Override path to the daemon entry; otherwise resolved from this file's URL. */
  resolveDaemonPath?: () => string;
}

export class LaunchdSupervisor implements Supervisor {
  private readonly run: ShellRunner;
  private readonly homeDir: string;
  private readonly uid: number;
  private readonly resolveDaemonPath: () => string;

  constructor(deps: LaunchdDeps = {}) {
    this.run = deps.run ?? defaultRunner;
    this.homeDir = deps.homeDir ?? homedir();
    this.uid = deps.uid ?? userInfo().uid;
    this.resolveDaemonPath = deps.resolveDaemonPath ?? defaultDaemonPath;
  }

  get plistPath(): string {
    return join(this.homeDir, 'Library', 'LaunchAgents', `${LAUNCHD_LABEL}.plist`);
  }

  buildPlist(opts: InstallOptions = {}): string {
    const nodePath = opts.nodePath ?? process.execPath;
    const daemonPath = opts.daemonPath ?? this.resolveDaemonPath();
    const env = opts.env ?? pickWhitelistedEnv();
    const logDir = join(this.homeDir, '.gemini-mcp');

    const envEntries = Object.entries(env)
      .map(([k, v]) => `      <key>${escapeXml(k)}</key>\n      <string>${escapeXml(v)}</string>`)
      .join('\n');

    return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${LAUNCHD_LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${escapeXml(nodePath)}</string>
    <string>${escapeXml(daemonPath)}</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>WorkingDirectory</key>
  <string>${escapeXml(opts.cwd ?? dirname(daemonPath))}</string>
  <key>StandardOutPath</key>
  <string>${escapeXml(join(logDir, 'daemon.out.log'))}</string>
  <key>StandardErrorPath</key>
  <string>${escapeXml(join(logDir, 'daemon.err.log'))}</string>
  <key>EnvironmentVariables</key>
  <dict>
${envEntries}
  </dict>
</dict>
</plist>
`;
  }

  async install(opts: InstallOptions = {}): Promise<InstallResult> {
    const plist = this.buildPlist(opts);
    await fs.mkdir(dirname(this.plistPath), { recursive: true });
    await fs.mkdir(join(this.homeDir, '.gemini-mcp'), { recursive: true });
    await writeAtomic(this.plistPath, plist, 0o644);

    // bootout first so a re-install picks up env/path changes. The bootout
    // call is allowed to fail (no-op if not currently loaded).
    await this.run('launchctl', ['bootout', `gui/${this.uid}/${LAUNCHD_LABEL}`]);
    const boot = await this.run('launchctl', ['bootstrap', `gui/${this.uid}`, this.plistPath]);
    const warnings: string[] = [];
    if (boot.code !== 0) {
      warnings.push(
        `launchctl bootstrap exited ${boot.code}: ${boot.stderr.trim() || boot.stdout.trim()}`,
      );
    }
    return { unitPath: this.plistPath, warnings };
  }

  async uninstall(): Promise<void> {
    await this.run('launchctl', ['bootout', `gui/${this.uid}/${LAUNCHD_LABEL}`]);
    try {
      await fs.unlink(this.plistPath);
    } catch {
      // already gone
    }
  }

  async restart(): Promise<void> {
    // kickstart -k restarts the existing service if loaded.
    await this.run('launchctl', ['kickstart', '-k', `gui/${this.uid}/${LAUNCHD_LABEL}`]);
  }

  async status(): Promise<SupervisorStatus> {
    let installed = false;
    try {
      await fs.access(this.plistPath);
      installed = true;
    } catch {
      installed = false;
    }
    const list = await this.run('launchctl', ['print', `gui/${this.uid}/${LAUNCHD_LABEL}`]);
    const running = list.code === 0;
    const pidMatch = list.stdout.match(/pid\s*=\s*(\d+)/);
    return {
      installed,
      running,
      pid: pidMatch ? Number(pidMatch[1]) : undefined,
      unitPath: this.plistPath,
      raw: list.stdout,
    };
  }
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function defaultDaemonPath(): string {
  // src/alerts/supervisor/launchd.ts -> when compiled to dist/alerts/supervisor/launchd.js
  // the daemon entry sits at dist/alerts/daemon/index.js (sibling).
  const here = dirname(fileURLToPath(import.meta.url));
  return join(here, '..', 'daemon', 'index.js');
}

async function writeAtomic(path: string, content: string, mode: number): Promise<void> {
  const tmp = `${path}.${process.pid}.${Date.now()}.tmp`;
  const handle = await fs.open(tmp, 'w', mode);
  try {
    await handle.writeFile(content, 'utf8');
    await handle.sync();
  } finally {
    await handle.close();
  }
  await fs.rename(tmp, path);
}
