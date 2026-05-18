import { promises as fs } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import type { AlertEvent } from './types.js';

export const DEFAULT_LOG_FILE = join(homedir(), '.gemini-mcp', 'alerts.log');

/**
 * Append a fired event as one JSON line. The file is rotated lazily by
 * `truncateOldest` once it crosses ~5MB; the audit log is for human review,
 * not high-volume telemetry.
 */
export async function appendAlertEvent(
  event: AlertEvent,
  path: string = DEFAULT_LOG_FILE,
): Promise<void> {
  await fs.mkdir(dirname(path), { recursive: true });
  await fs.appendFile(path, `${JSON.stringify(event)}\n`, 'utf8');
}

export async function readRecentEvents(
  limit = 50,
  path: string = DEFAULT_LOG_FILE,
): Promise<AlertEvent[]> {
  let raw: string;
  try {
    raw = await fs.readFile(path, 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw err;
  }
  const lines = raw.split('\n').filter((l) => l.length > 0);
  const slice = lines.slice(Math.max(0, lines.length - limit));
  const events: AlertEvent[] = [];
  for (const line of slice) {
    try {
      events.push(JSON.parse(line) as AlertEvent);
    } catch {
      // tolerate a partially-written tail line; keep going
    }
  }
  return events;
}
