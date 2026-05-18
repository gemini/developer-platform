import { execFile } from 'node:child_process';
import type { ShellRunner } from './types.js';

export const defaultRunner: ShellRunner = (command, args) =>
  new Promise((resolve) => {
    execFile(
      command,
      args,
      { timeout: 15_000, maxBuffer: 1024 * 1024, encoding: 'utf8' },
      (err, stdout, stderr) => {
        const code = err && 'code' in err && typeof err.code === 'number' ? err.code : err ? 1 : 0;
        resolve({
          stdout: stdout ?? '',
          stderr: stderr ?? '',
          code,
        });
      },
    );
  });
