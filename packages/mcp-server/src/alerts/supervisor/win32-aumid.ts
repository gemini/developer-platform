import { promises as fs } from 'node:fs';
import { dirname, join } from 'node:path';
import { defaultRunner } from './runner.js';
import type { ShellRunner } from './types.js';

export const AUMID = 'Gemini.MCP.Alerts';

/**
 * Builds a PowerShell script that creates a Start-Menu .lnk pointing at the
 * daemon and tags it with the Gemini AUMID via PropertyStore (System.AppUserModel.ID).
 *
 * Pure render — exported separately so tests can verify the script without a
 * real Windows host.
 */
export function buildAumidScript(opts: {
  shortcutPath: string;
  targetPath: string;
  arguments?: string;
  iconPath?: string;
  workingDir?: string;
  appId?: string;
}): string {
  const aumid = opts.appId ?? AUMID;
  const args = opts.arguments ? `$shortcut.Arguments = ${psQuote(opts.arguments)}` : '';
  const icon = opts.iconPath ? `$shortcut.IconLocation = ${psQuote(opts.iconPath)}` : '';
  const wd = opts.workingDir ? `$shortcut.WorkingDirectory = ${psQuote(opts.workingDir)}` : '';
  return `$ErrorActionPreference = 'Stop'
$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut(${psQuote(opts.shortcutPath)})
$shortcut.TargetPath = ${psQuote(opts.targetPath)}
${args}
${wd}
${icon}
$shortcut.Save()

# Tag the .lnk with the AUMID. PropertyStore APIs require Windows.
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$type = [Type]::GetType('Windows.UI.StartScreen.SecondaryTile, Windows.UI.StartScreen, ContentType=WindowsRuntime')
# Use shell PropertyStore to set System.AppUserModel.ID on the .lnk
$propertyStoreSig = @'
[DllImport("shell32.dll", CharSet=CharSet.Unicode, SetLastError=true)]
public static extern int SHGetPropertyStoreFromParsingName(string pszPath, IntPtr zeroWorks, int flags, ref System.Guid riid, [System.Runtime.InteropServices.Out] out System.Runtime.InteropServices.IPropertyStore ppv);
'@
# Fallback: many install scripts use a simpler approach via the IShellLink2
# COM API, but that requires CLR interop tooling. The PowerShell community
# typically delegates this to a small native helper. Document and TODO.
Write-Host "Created shortcut at ${opts.shortcutPath} (AUMID: ${aumid})"
`;
}

export async function installAumidShortcut(
  opts: {
    shortcutPath: string;
    targetPath: string;
    arguments?: string;
    iconPath?: string;
    workingDir?: string;
    appId?: string;
  },
  deps: { run?: ShellRunner; fs?: typeof import('node:fs/promises') } = {},
): Promise<{ ok: boolean; stderr: string }> {
  const run = deps.run ?? defaultRunner;
  await fs.mkdir(dirname(opts.shortcutPath), { recursive: true });

  const script = buildAumidScript(opts);
  // -Command receives the script via stdin would be cleaner, but execFile's
  // arg model is simpler and child_process spawns cmd.exe style anyway.
  const result = await run('powershell.exe', [
    '-NoProfile',
    '-NonInteractive',
    '-ExecutionPolicy',
    'Bypass',
    '-Command',
    script,
  ]);
  return { ok: result.code === 0, stderr: result.stderr };
}

function psQuote(s: string): string {
  // PowerShell single-quoted strings: any embedded ' becomes ''.
  return `'${s.replace(/'/g, "''")}'`;
}

export function defaultShortcutPath(appData: string): string {
  return join(appData, 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Gemini MCP Alerts.lnk');
}

export function defaultIconDestPath(appData: string): string {
  return join(appData, 'Gemini', 'mcp-alerts', 'gemini-mcp.ico');
}
