import type { RequestOptions } from "../../utils/deadline.js";
import { isBoundaryFunction, isBoundaryObject, type BoundaryValue } from "../../utils/boundary-value.js";

export interface ManagedHeartbeatOptions {
  intervalMs: number;
  beat: (options: RequestOptions) => Promise<BoundaryValue | void>;
  onError?: (cause: unknown) => void;
  requestOptions?: RequestOptions;
}

/** Heartbeat loop that starts only after a call to start(). */
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

  [Symbol.dispose](): void {
    this.stop();
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
      if (this.running && !controller.signal.aborted && this.onError) {
        try {
          this.onError(error);
        } catch {
          // An observer error must not stop background execution.
        }
      }
    }
    if (this.running && this.controller === controller) {
      this.timer = setTimeout(() => { void this.run(); }, this.intervalMs);
      const timer = this.timer;
      const unref = isBoundaryObject(timer) ? timer["unref"] : undefined;
      if (isBoundaryFunction(unref)) unref.call(timer);
    }
  }
}
