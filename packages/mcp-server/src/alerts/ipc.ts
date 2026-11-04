import { promises as fs } from 'node:fs';
import { dirname, join } from 'node:path';
import { GEMINI_MCP_DIR, writeAtomic } from './paths.js';

export const DEFAULT_DAEMON_META_FILE = join(GEMINI_MCP_DIR, 'daemon.json');

export interface DaemonMeta {
  pid: number;
  port: number;
  startedAt: number;
  version?: string;
}

export interface IpcOptions {
  metaPath?: string;
  timeoutMs?: number;
}

export interface IpcResult {
  ok: boolean;
  status?: number;
  body?: unknown;
}

export async function readDaemonMeta(path: string = DEFAULT_DAEMON_META_FILE): Promise<DaemonMeta | null> {
  try {
    const raw = await fs.readFile(path, 'utf8');
    const parsed = JSON.parse(raw) as DaemonMeta;
    if (typeof parsed.pid !== 'number' || typeof parsed.port !== 'number') return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function writeDaemonMeta(
  meta: DaemonMeta,
  path: string = DEFAULT_DAEMON_META_FILE,
): Promise<void> {
  await fs.mkdir(dirname(path), { recursive: true });
  await writeAtomic(path, `${JSON.stringify(meta, null, 2)}\n`);
}

export async function deleteDaemonMeta(path: string = DEFAULT_DAEMON_META_FILE): Promise<void> {
  try {
    await fs.unlink(path);
  } catch {
    // best-effort
  }
}

async function request(
  method: 'GET' | 'POST',
  pathSuffix: string,
  options: IpcOptions & { body?: unknown } = {},
): Promise<IpcResult> {
  const meta = await readDaemonMeta(options.metaPath);
  if (!meta) return { ok: false };

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), options.timeoutMs ?? 1500);
  try {
    const init: RequestInit = { method, signal: ctrl.signal };
    if (options.body !== undefined) {
      init.headers = { 'content-type': 'application/json' };
      init.body = JSON.stringify(options.body);
    }
    const res = await fetch(`http://127.0.0.1:${meta.port}${pathSuffix}`, init);
    let parsed: unknown;
    try {
      parsed = await res.json();
    } catch {
      parsed = undefined;
    }
    return { ok: res.ok, status: res.status, body: parsed };
  } catch {
    return { ok: false };
  } finally {
    clearTimeout(timer);
  }
}

/** POST /reload — silent no-op if daemon is not running. */
export async function notifyDaemonReload(options: IpcOptions = {}): Promise<IpcResult> {
  return request('POST', '/reload', options);
}

/** POST /test-fire/:ruleId — drives gemini_alert_test from the MCP side. */
export async function testFireRule(ruleId: string, options: IpcOptions = {}): Promise<IpcResult> {
  return request('POST', `/test-fire/${encodeURIComponent(ruleId)}`, options);
}

/** GET /status — returns the daemon's status object, or null if unreachable. */
export async function getDaemonStatus(options: IpcOptions = {}): Promise<unknown | null> {
  const result = await request('GET', '/status', options);
  return result.ok ? result.body : null;
}
