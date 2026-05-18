import notifier from 'node-notifier';
import type { AlertEvent } from '../types.js';

export interface NotificationPayload {
  title: string;
  message: string;
  /** Linux: notify-send -i; Windows: SnoreToast -p. */
  icon?: string;
  /**
   * macOS: terminal-notifier `-sender <bundleId>`. The named app must be
   * registered with Launch Services. When set, the toast claims to come
   * from that app and its icon shows in the toast.
   */
  sender?: string;
  /** Windows AUMID — must match the AUMID set on the Start Menu shortcut. */
  appID?: string;
  sound?: boolean | string;
  /** Wait for the user to dismiss before resolving. Daemon usage: false. */
  wait?: boolean;
}

export type SendFn = (payload: NotificationPayload) => Promise<void>;
export type Notifier = (event: AlertEvent) => Promise<void>;

export interface NotifierDeps {
  /** Override the underlying send function — primarily for tests. */
  send?: SendFn;
  /** Absolute path to the icon shown in the toast. */
  iconPath?: string;
  /** Windows AUMID. Should match the supervisor's installed shortcut. */
  appID?: string;
  /**
   * macOS bundle ID for the sender app — provides a Gemini-branded top-left
   * icon. Must point at an installed bundle (see installMacosSenderBundle).
   */
  macosSender?: string;
  /** Override platform detection — primarily for tests. */
  platform?: NodeJS.Platform;
  /** Override env reads — primarily for tests. */
  env?: NodeJS.ProcessEnv;
}

export interface NotifierProbe {
  platform: NodeJS.Platform;
  ok: boolean;
  warnings: string[];
}

const DEFAULT_APP_ID = 'Gemini.MCP.Alerts';
const TEST_FIRE_PREFIX = '[test]';

export function createNotifier(deps: NotifierDeps = {}): Notifier {
  const send = deps.send ?? defaultSend;
  const iconPath = deps.iconPath;
  const appID = deps.appID ?? DEFAULT_APP_ID;

  const macosSender = deps.macosSender;

  return async (event: AlertEvent) => {
    const isTest = event.reason.startsWith(TEST_FIRE_PREFIX);
    const title = isTest
      ? `[TEST] ${event.ruleName}`
      : `${event.ruleName}`;
    await send({
      title,
      message: event.reason,
      icon: iconPath,         // linux notify-send + windows SnoreToast
      sender: macosSender,    // macOS top-left app icon, via installed sender bundle
      appID,                  // windows AUMID
      sound: true,
      wait: false,
    });
  };
}

/**
 * Best-effort startup health check. Lets daemon_status surface "Linux session
 * has no DBus, your toasts will be silent" without erroring out the daemon.
 */
export function probeNotifier(deps: NotifierDeps = {}): NotifierProbe {
  const platform = deps.platform ?? process.platform;
  const env = deps.env ?? process.env;
  const warnings: string[] = [];

  if (platform === 'linux' && !env.DBUS_SESSION_BUS_ADDRESS) {
    warnings.push(
      'DBUS_SESSION_BUS_ADDRESS is unset — desktop notifications will be silent on this session (likely a headless or sshd login)',
    );
  }

  if (platform === 'win32' && !deps.appID) {
    // Not fatal: SnoreToast falls back to its own AUMID, but the user loses
    // the Gemini icon and Action Center grouping.
    warnings.push(
      'No appID set — Windows toasts will not be grouped under a Gemini AUMID. Run gemini_alert_daemon_install to register one.',
    );
  }

  return { platform, ok: warnings.length === 0, warnings };
}

function defaultSend(payload: NotificationPayload): Promise<void> {
  return new Promise((resolve, reject) => {
    notifier.notify(payload as Parameters<typeof notifier.notify>[0], (err) => {
      if (err) return reject(err);
      resolve();
    });
  });
}
