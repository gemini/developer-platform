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
