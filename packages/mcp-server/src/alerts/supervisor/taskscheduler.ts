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
import {
  AUMID,
  defaultIconDestPath,
  defaultShortcutPath,
  installAumidShortcut,
} from './win32-aumid.js';

export const TASK_NAME = 'GeminiMcpAlerts';

export interface TaskSchedulerDeps {
  appData?: string;
  run?: ShellRunner;
  resolveDaemonPath?: () => string;
}

/**
 * NOTE: Implemented but not validated on a real Windows host from this
 * dev environment. On first install, expect to iterate on quoting
 * and PowerShell escapes — the unit tests cover construction only.
 */
export class TaskSchedulerSupervisor implements Supervisor {
  private readonly run: ShellRunner;
  private readonly appData: string;
  private readonly resolveDaemonPath: () => string;

  constructor(deps: TaskSchedulerDeps = {}) {
    this.run = deps.run ?? defaultRunner;
    this.appData = deps.appData ?? process.env.APPDATA ?? '';
    this.resolveDaemonPath = deps.resolveDaemonPath ?? defaultDaemonPath;
  }

  buildRegisterScript(opts: InstallOptions = {}): string {
    const nodePath = opts.nodePath ?? process.execPath;
    const daemonPath = opts.daemonPath ?? this.resolveDaemonPath();
    const env = opts.env ?? pickWhitelistedEnv();
    const cwd = opts.cwd ?? dirname(daemonPath);

    const envSetters = Object.entries(env)
      .map(([k, v]) => `[Environment]::SetEnvironmentVariable(${psQuote(k)}, ${psQuote(v)}, 'User')`)
      .join('\n');

    return `$ErrorActionPreference = 'Stop'
${envSetters}

$action = New-ScheduledTaskAction \`
  -Execute ${psQuote(nodePath)} \`
  -Argument ${psQuote(`"${daemonPath}"`)} \`
  -WorkingDirectory ${psQuote(cwd)}

$trigger = New-ScheduledTaskTrigger -AtLogon -User $env:USERNAME

$settings = New-ScheduledTaskSettingsSet \`
  -AllowStartIfOnBatteries \`
  -DontStopIfGoingOnBatteries \`
  -StartWhenAvailable \`
  -RestartCount 999 \`
  -RestartInterval (New-TimeSpan -Seconds 30)

Register-ScheduledTask -TaskName ${psQuote(TASK_NAME)} \`
  -Action $action -Trigger $trigger -Settings $settings -Force | Out-Null

Start-ScheduledTask -TaskName ${psQuote(TASK_NAME)}
`;
  }

  async install(opts: InstallOptions = {}): Promise<InstallResult> {
    const warnings: string[] = [];
    const script = this.buildRegisterScript(opts);
    const result = await this.run('powershell.exe', [
      '-NoProfile',
      '-NonInteractive',
      '-ExecutionPolicy',
      'Bypass',
      '-Command',
      script,
    ]);
    if (result.code !== 0) {
      warnings.push(
        `Register-ScheduledTask exited ${result.code}: ${result.stderr.trim() || result.stdout.trim()}`,
      );
    }

    if (this.appData) {
      const aumid = await installAumidShortcut(
        {
          shortcutPath: defaultShortcutPath(this.appData),
          targetPath: opts.nodePath ?? process.execPath,
          arguments: `"${opts.daemonPath ?? this.resolveDaemonPath()}"`,
          iconPath: defaultIconDestPath(this.appData),
          workingDir: opts.cwd ?? dirname(opts.daemonPath ?? this.resolveDaemonPath()),
          appId: AUMID,
        },
        { run: this.run },
      );
      if (!aumid.ok) {
        warnings.push(`AUMID shortcut creation failed: ${aumid.stderr.trim()}`);
      }
    } else {
      warnings.push('APPDATA env var unset — skipped Start Menu AUMID shortcut');
    }

    return { unitPath: TASK_NAME, warnings };
  }

  async uninstall(): Promise<void> {
    await this.run('powershell.exe', [
      '-NoProfile',
      '-NonInteractive',
      '-ExecutionPolicy',
      'Bypass',
      '-Command',
      `Unregister-ScheduledTask -TaskName ${psQuote(TASK_NAME)} -Confirm:$false`,
    ]);
    if (this.appData) {
      const lnk = defaultShortcutPath(this.appData);
      await this.run('powershell.exe', [
        '-NoProfile',
        '-NonInteractive',
        '-ExecutionPolicy',
        'Bypass',
        '-Command',
        `Remove-Item -Force ${psQuote(lnk)} -ErrorAction SilentlyContinue`,
      ]);
    }
  }

  async restart(): Promise<void> {
    await this.run('powershell.exe', [
      '-NoProfile',
      '-NonInteractive',
      '-ExecutionPolicy',
      'Bypass',
      '-Command',
      `Stop-ScheduledTask -TaskName ${psQuote(TASK_NAME)}; Start-ScheduledTask -TaskName ${psQuote(TASK_NAME)}`,
    ]);
  }

  async status(): Promise<SupervisorStatus> {
    const result = await this.run('powershell.exe', [
      '-NoProfile',
      '-NonInteractive',
      '-ExecutionPolicy',
      'Bypass',
      '-Command',
      `Get-ScheduledTask -TaskName ${psQuote(TASK_NAME)} -ErrorAction SilentlyContinue | ConvertTo-Json`,
    ]);
    const installed = result.code === 0 && result.stdout.trim().length > 0;
    let running = false;
    try {
      const parsed = JSON.parse(result.stdout) as { State?: string | number };
      running = parsed.State === 'Running' || parsed.State === 4;
    } catch {
      // not installed or non-JSON output
    }
    return {
      installed,
      running,
      unitPath: TASK_NAME,
      raw: result.stdout,
    };
  }
}

function defaultDaemonPath(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  return join(here, '..', 'daemon', 'index.js');
}

function psQuote(s: string): string {
  return `'${s.replace(/'/g, "''")}'`;
}

export function joinAppData(...parts: string[]): string {
  return join(...parts);
}
