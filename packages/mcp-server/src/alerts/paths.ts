import { promises as fs } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export const GEMINI_MCP_DIR = join(homedir(), '.gemini-mcp');

export async function writeAtomic(
  path: string,
  content: string,
  mode: number = 0o600,
): Promise<void> {
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

export function isENOENT(err: unknown): boolean {
  return !!err && typeof err === 'object' && (err as NodeJS.ErrnoException).code === 'ENOENT';
}
