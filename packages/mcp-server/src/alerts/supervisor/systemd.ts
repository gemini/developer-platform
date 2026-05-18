import { promises as fs } from 'node:fs';
import { homedir } from 'node:os';
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

export const SYSTEMD_UNIT_NAME = 'gemini-mcp-alerts.service';

export interface SystemdDeps {
  homeDir?: string;
  run?: ShellRunner;
  resolveDaemonPath?: () => string;
}

export class SystemdSupervisor implements Supervisor {
  private readonly run: ShellRunner;
  private readonly homeDir: string;
  private readonly resolveDaemonPath: () => string;

  constructor(deps: SystemdDeps = {}) {
    this.run = deps.run ?? defaultRunner;
    this.homeDir = deps.homeDir ?? homedir();
    this.resolveDaemonPath = deps.resolveDaemonPath ?? defaultDaemonPath;
  }

  get unitPath(): string {
    return join(this.homeDir, '.config', 'systemd', 'user', SYSTEMD_UNIT_NAME);
  }

  buildUnit(opts: InstallOptions = {}): string {
    const nodePath = opts.nodePath ?? process.execPath;
    const daemonPath = opts.daemonPath ?? this.resolveDaemonPath();
    const env = opts.env ?? pickWhitelistedEnv();
    const cwd = opts.cwd ?? dirname(daemonPath);

    const envLines = Object.entries(env)
      .map(([k, v]) => `Environment=${k}=${escapeUnitValue(v)}`)
      .join('\n');

    return `[Unit]
Description=Gemini MCP Alerts daemon
After=default.target

[Service]
Type=simple
ExecStart=${shellQuote(nodePath)} ${shellQuote(daemonPath)}
Restart=always
RestartSec=5
WorkingDirectory=${cwd}
${envLines}

[Install]
WantedBy=default.target
`;
  }

  async install(opts: InstallOptions = {}): Promise<InstallResult> {
    const unit = this.buildUnit(opts);
    await fs.mkdir(dirname(this.unitPath), { recursive: true });
    await writeAtomic(this.unitPath, unit, 0o644);

    await this.run('systemctl', ['--user', 'daemon-reload']);
    const enabled = await this.run('systemctl', ['--user', 'enable', '--now', SYSTEMD_UNIT_NAME]);
    const warnings: string[] = [];
    if (enabled.code !== 0) {
      warnings.push(
        `systemctl enable --now exited ${enabled.code}: ${enabled.stderr.trim() || enabled.stdout.trim()}`,
      );
    }
    return { unitPath: this.unitPath, warnings };
  }

  async uninstall(): Promise<void> {
    await this.run('systemctl', ['--user', 'disable', '--now', SYSTEMD_UNIT_NAME]);
    try {
      await fs.unlink(this.unitPath);
    } catch {
      // already gone
    }
    await this.run('systemctl', ['--user', 'daemon-reload']);
  }

  async restart(): Promise<void> {
    await this.run('systemctl', ['--user', 'restart', SYSTEMD_UNIT_NAME]);
  }

  async status(): Promise<SupervisorStatus> {
    let installed = false;
    try {
      await fs.access(this.unitPath);
      installed = true;
    } catch {
      installed = false;
    }
    const active = await this.run('systemctl', ['--user', 'is-active', SYSTEMD_UNIT_NAME]);
    const running = active.stdout.trim() === 'active';
    const show = await this.run('systemctl', ['--user', 'show', '-p', 'MainPID', SYSTEMD_UNIT_NAME]);
    const pidMatch = show.stdout.match(/MainPID=(\d+)/);
    const pid = pidMatch ? Number(pidMatch[1]) : undefined;
    return {
      installed,
      running,
      pid: pid && pid > 0 ? pid : undefined,
      unitPath: this.unitPath,
      raw: `${active.stdout}\n${show.stdout}`.trim(),
    };
  }
}

/**
 * systemd's Environment= line is space-delimited, so any whitespace inside a
 * value must be quoted. Backslashes and double-quotes inside the quoted
 * value need backslash-escaping per systemd.exec(5).
 */
function escapeUnitValue(v: string): string {
  if (!/[\s"'\\$]/.test(v)) return v;
  return `"${v.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

function shellQuote(s: string): string {
  // systemd's ExecStart is whitespace-tokenized. Wrap in single quotes if the
  // path contains whitespace; embedded single quotes are not expected in
  // practical install paths but get the standard sh-quote treatment if they
  // appear.
  if (!/\s/.test(s) && !/'/.test(s)) return s;
  return `'${s.replace(/'/g, `'\\''`)}'`;
}

function defaultDaemonPath(): string {
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
