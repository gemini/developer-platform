import { promises as fs } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';

export const MACOS_SENDER_BUNDLE_ID = 'Gemini.MCP.Alerts';
export const MACOS_SENDER_APP_NAME = 'Gemini MCP Alerts.app';

export interface MacosSenderOptions {
  /** Defaults to `~/Applications/Gemini MCP Alerts.app`. */
  installRoot?: string;
  /** Defaults to the bundled `assets/gemini-mcp.icns` next to dist/. */
  icnsSource?: string;
}

export interface MacosSenderInstallResult {
  bundlePath: string;
  bundleId: string;
  registered: boolean;
  warnings: string[];
}

/**
 * Build a minimal .app bundle that terminal-notifier (via node-notifier's
 * `sender` option) can impersonate, so toasts show our app icon in the
 * top-left rather than the bundled terminal-notifier branding.
 *
 * The bundle is installed at `~/Applications/Gemini MCP Alerts.app` (no
 * sudo required) and registered with Launch Services via `lsregister -f`.
 * macOS's NSDistributedNotificationCenter then resolves the bundle ID we
 * pass on each notification call to this app's icon.
 */
export async function installMacosSenderBundle(
  opts: MacosSenderOptions = {},
): Promise<MacosSenderInstallResult> {
  const warnings: string[] = [];
  const installRoot = opts.installRoot ?? join(homedir(), 'Applications', MACOS_SENDER_APP_NAME);
  const contentsDir = join(installRoot, 'Contents');
  const macosDir = join(contentsDir, 'MacOS');
  const resourcesDir = join(contentsDir, 'Resources');
  const icnsSource = opts.icnsSource ?? defaultIcnsSource();

  await fs.mkdir(macosDir, { recursive: true });
  await fs.mkdir(resourcesDir, { recursive: true });

  await fs.writeFile(join(contentsDir, 'Info.plist'), buildInfoPlist(), 'utf8');

  // Launch Services requires CFBundleExecutable to point at an actually-
  // executable file inside Contents/MacOS/. We never invoke it; it just
  // needs to exist with the +x bit so the bundle is well-formed.
  const launcherPath = join(macosDir, 'launcher');
  await fs.writeFile(launcherPath, '#!/bin/sh\nexit 0\n', { encoding: 'utf8', mode: 0o755 });

  try {
    await fs.copyFile(icnsSource, join(resourcesDir, 'AppIcon.icns'));
  } catch (err) {
    warnings.push(
      `icon source missing at ${icnsSource}; toast will fall back to a generic icon (${(err as Error).message})`,
    );
  }

  const registered = await registerBundle(installRoot);
  if (!registered) {
    warnings.push(
      'lsregister did not exit cleanly; macOS may not pick up the new app icon until you log out and back in',
    );
  }

  return { bundlePath: installRoot, bundleId: MACOS_SENDER_BUNDLE_ID, registered, warnings };
}

export async function uninstallMacosSenderBundle(opts: MacosSenderOptions = {}): Promise<void> {
  const installRoot = opts.installRoot ?? join(homedir(), 'Applications', MACOS_SENDER_APP_NAME);
  // Best-effort un-registration before removing — silent on failure.
  await runLsregister(['-u', installRoot]).catch(() => undefined);
  await fs.rm(installRoot, { recursive: true, force: true });
}

export function buildInfoPlist(): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleIdentifier</key>
  <string>${MACOS_SENDER_BUNDLE_ID}</string>
  <key>CFBundleName</key>
  <string>Gemini MCP Alerts</string>
  <key>CFBundleDisplayName</key>
  <string>Gemini MCP Alerts</string>
  <key>CFBundleExecutable</key>
  <string>launcher</string>
  <key>CFBundleIconFile</key>
  <string>AppIcon</string>
  <key>CFBundlePackageType</key>
  <string>APPL</string>
  <key>CFBundleShortVersionString</key>
  <string>1.0</string>
  <key>CFBundleVersion</key>
  <string>1</string>
  <key>LSUIElement</key>
  <true/>
  <key>NSHumanReadableCopyright</key>
  <string>Sender stub for Gemini MCP alerts. Not user-launchable.</string>
</dict>
</plist>
`;
}

const LSREGISTER_PATH =
  '/System/Library/Frameworks/CoreServices.framework/Versions/A/Frameworks/LaunchServices.framework/Versions/A/Support/lsregister';

async function registerBundle(bundlePath: string): Promise<boolean> {
  try {
    await runLsregister(['-f', bundlePath]);
    return true;
  } catch {
    return false;
  }
}

function runLsregister(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    execFile(LSREGISTER_PATH, args, { timeout: 10_000 }, (err) => {
      if (err) return reject(err);
      resolve();
    });
  });
}

function defaultIcnsSource(): string {
  // dist/alerts/notifier/macos-sender.js -> mcp-server root -> assets/.
  const here = dirname(fileURLToPath(import.meta.url));
  return join(here, '..', '..', '..', 'assets', 'gemini-mcp.icns');
}
