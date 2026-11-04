import { LaunchdSupervisor } from './launchd.js';
import { SystemdSupervisor } from './systemd.js';
import { TaskSchedulerSupervisor } from './taskscheduler.js';
import type { Supervisor } from './types.js';

export type { Supervisor, SupervisorStatus, InstallOptions, InstallResult } from './types.js';
export { pickWhitelistedEnv, ENV_WHITELIST } from './types.js';
export { LaunchdSupervisor } from './launchd.js';
export { SystemdSupervisor } from './systemd.js';
export { TaskSchedulerSupervisor } from './taskscheduler.js';

export class UnsupportedPlatformSupervisor implements Supervisor {
  constructor(private readonly platform: NodeJS.Platform) {}
  install(): Promise<never> {
    return Promise.reject(new Error(`Unsupported platform for supervisor: ${this.platform}`));
  }
  uninstall(): Promise<never> {
    return Promise.reject(new Error(`Unsupported platform for supervisor: ${this.platform}`));
  }
  restart(): Promise<never> {
    return Promise.reject(new Error(`Unsupported platform for supervisor: ${this.platform}`));
  }
  status(): Promise<{ installed: false; running: false }> {
    return Promise.resolve({ installed: false, running: false });
  }
}

export function getSupervisor(platform: NodeJS.Platform = process.platform): Supervisor {
  switch (platform) {
    case 'darwin':
      return new LaunchdSupervisor();
    case 'linux':
      return new SystemdSupervisor();
    case 'win32':
      return new TaskSchedulerSupervisor();
    default:
      return new UnsupportedPlatformSupervisor(platform);
  }
}
