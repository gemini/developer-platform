import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Resolves the daemon entry sibling to the supervisor module when compiled
 * (dist/alerts/supervisor/* → dist/alerts/daemon/index.js).
 */
export function defaultDaemonPath(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  return join(here, '..', 'daemon', 'index.js');
}

export interface InstallOptions {
  /** Absolute path to the node binary. Defaults to `process.execPath`. */
  nodePath?: string;
  /** Absolute path to the daemon entry. Defaults to dist/alerts/daemon/index.js. */
  daemonPath?: string;
  /** Env vars to bake into the unit. Defaults to whitelist from process.env. */
  env?: Record<string, string>;
  /** Working directory the daemon runs from. Defaults to the daemon's parent. */
  cwd?: string;
}

export interface InstallResult {
  unitPath: string;
  warnings: string[];
}

export interface SupervisorStatus {
  installed: boolean;
  running: boolean;
  pid?: number;
  unitPath?: string;
  raw?: string;
}

export interface Supervisor {
  install(opts?: InstallOptions): Promise<InstallResult>;
  uninstall(): Promise<void>;
  status(): Promise<SupervisorStatus>;
  restart(): Promise<void>;
}

export interface ShellRunResult {
  stdout: string;
  stderr: string;
  code: number;
}

export type ShellRunner = (command: string, args: string[]) => Promise<ShellRunResult>;

/**
 * Env vars baked into supervisor units. Other env vars from the user's shell
 * are intentionally NOT inherited — least privilege, and avoids leaking
 * unrelated session state into a long-running OS-supervised process.
 */
export const ENV_WHITELIST = [
  'GEMINI_API_KEY',
  'GEMINI_API_SECRET',
  'GEMINI_ACCOUNT',
  'GEMINI_API_BASE_URL',
  'GEMINI_WS_URL',
  // Without this, an operator who explicitly sets GEMINI_SDK_ENV to diverge from what
  // GEMINI_API_BASE_URL alone would derive (see config.ts's resolveSdkEnv) has that
  // override silently dropped when the daemon is installed as a persistent OS-supervised
  // service — the installed daemon would then derive sdkEnv from baseUrl alone and
  // fetch prediction-market settlements from a different environment than intended.
  'GEMINI_SDK_ENV',
  'PATH',
] as const;

export function pickWhitelistedEnv(env: NodeJS.ProcessEnv = process.env): Record<string, string> {
  const out: Record<string, string> = {};
  for (const key of ENV_WHITELIST) {
    const v = env[key];
    if (typeof v === 'string') out[key] = v;
  }
  return out;
}
