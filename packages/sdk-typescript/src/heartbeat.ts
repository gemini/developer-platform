import type { RequestOptions } from "./core/deadline.js";

export interface ManagedHeartbeatOptions {
  intervalMs: number;
  beat: (options: RequestOptions) => Promise<unknown>;
  onError?: (error: unknown) => void;
  requestOptions?: RequestOptions;
}

/** Explicitly controlled heartbeat loop. It never starts by construction. */
export class ManagedHeartbeat {
  private readonly intervalMs: number;
  private readonly beat: ManagedHeartbeatOptions["beat"];
  private readonly onError?: ManagedHeartbeatOptions["onError"];
  private readonly requestOptions: RequestOptions;
  private timer?: ReturnType<typeof setTimeout>;
  private controller?: AbortController;
  private running = false;

  constructor(options: ManagedHeartbeatOptions) {
    if (!Number.isFinite(options.intervalMs) || options.intervalMs <= 0) {
      throw new Error("heartbeat intervalMs must be a finite positive number");
    }
    this.intervalMs = options.intervalMs;
    this.beat = options.beat;
    this.onError = options.onError;
    this.requestOptions = options.requestOptions ?? {};
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.controller = new AbortController();
    void this.run();
  }

  stop(): void {
    this.running = false;
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
    this.controller?.abort();
    this.controller = undefined;
  }

  private async run(): Promise<void> {
    const controller = this.controller;
    if (!this.running || !controller) return;
    try {
      const signal = this.requestOptions.signal
        ? AbortSignal.any([this.requestOptions.signal, controller.signal])
        : controller.signal;
      await this.beat({ ...this.requestOptions, signal });
    } catch (error) {
      if (this.running && !controller.signal.aborted) this.onError?.(error);
    }
    if (this.running && this.controller === controller) {
      this.timer = setTimeout(() => { void this.run(); }, this.intervalMs);
    }
  }
}
