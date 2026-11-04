// any[] required: unknown[] rejects typed callbacks due to contravariance (TS function parameter bivariance)
type Listener = (...args: any[]) => void; // eslint-disable-line @typescript-eslint/no-explicit-any

interface Registration {
  original: Listener;   // the callback the caller passed
  actual: Listener;     // what's in the listeners array (same for on, wrapper for once)
  signal?: AbortSignal;
  onAbort?: () => void;
}

export interface ListenerOptions {
  signal?: AbortSignal;
}

/**
 * Minimal typed event emitter that replaces `node:events` EventEmitter.
 * Preserves the public surface used by the SDK and consumers: `on`, `off`,
 * `once`, `addListener`, `removeListener`, `emit`, `listenerCount`,
 * `removeAllListeners`, and `eventNames`.
 *
 * `off()` removes the most recently registered listener matching the callback,
 * regardless of whether it was added via `on()` or `once()`, matching Node
 * EventEmitter semantics.
 */
export class TypedEmitter<Events extends Record<string, Listener>> {
  // The actual listener functions invoked by emit().
  private listeners = new Map<keyof Events, Listener[]>();
  // Registrations in insertion order — off() scans from the end to find the
  // most recent match, exactly like Node's EventEmitter.
  private registrations = new Map<keyof Events, Registration[]>();

  on<E extends keyof Events>(event: E, fn: Events[E], options?: ListenerOptions): this {
    if (options?.signal?.aborted) return this;
    this.addRegistration(event, fn, fn, options?.signal);
    return this;
  }

  private addRegistration<E extends keyof Events>(event: E, original: Events[E], actual: Events[E], signal?: AbortSignal): void {
    let list = this.listeners.get(event);
    if (!list) {
      list = [];
      this.listeners.set(event, list);
    }
    list.push(actual);
    let regs = this.registrations.get(event);
    if (!regs) {
      regs = [];
      this.registrations.set(event, regs);
    }
    const registration: Registration = { original, actual, signal };
    if (signal) {
      registration.onAbort = () => this.removeRegistration(event, registration);
      signal.addEventListener("abort", registration.onAbort, { once: true });
    }
    regs.push(registration);
  }

  addListener<E extends keyof Events>(event: E, fn: Events[E], options?: ListenerOptions): this {
    return this.on(event, fn, options);
  }

  off<E extends keyof Events>(event: E, fn: Events[E]): this {
    const regs = this.registrations.get(event);
    if (!regs) return this;
    // Scan from the end to remove the most recent registration (Node semantics).
    for (let i = regs.length - 1; i >= 0; i--) {
      if (regs[i]!.original === fn) {
        this.removeRegistration(event, regs[i]!);
        return this;
      }
    }
    return this;
  }

  removeListener<E extends keyof Events>(event: E, fn: Events[E]): this {
    return this.off(event, fn);
  }

  once<E extends keyof Events>(event: E, fn: Events[E], options?: ListenerOptions): this {
    if (options?.signal?.aborted) return this;
    // SAFETY: The wrapper has the same parameter tuple as the event-specific listener.
    const wrapper = ((...args: Parameters<Events[E]>) => {
      this.removeByActual(event, wrapper);
      fn(...args);
    }) as Events[E];
    this.addRegistration(event, fn, wrapper, options?.signal);
    return this;
  }

  /** Remove a specific registration by its actual (wrapper) identity. */
  private removeByActual(event: keyof Events, actual: Listener): void {
    const regs = this.registrations.get(event);
    if (!regs) return;
    for (let i = regs.length - 1; i >= 0; i--) {
      if (regs[i]!.actual === actual) {
        this.removeRegistration(event, regs[i]!);
        break;
      }
    }
  }

  private removeRegistration(event: keyof Events, registration: Registration): void {
    const regs = this.registrations.get(event);
    if (regs) {
      const index = regs.indexOf(registration);
      if (index >= 0) regs.splice(index, 1);
      if (regs.length === 0) this.registrations.delete(event);
    }
    const list = this.listeners.get(event);
    if (list) {
      const index = list.indexOf(registration.actual);
      if (index >= 0) list.splice(index, 1);
      if (list.length === 0) this.listeners.delete(event);
    }
    if (registration.signal && registration.onAbort) {
      registration.signal.removeEventListener("abort", registration.onAbort);
    }
  }

  emit<E extends keyof Events>(event: E, ...args: Parameters<Events[E]>): void {
    const list = this.listeners.get(event);
    if (!list || list.length === 0) return;
    if (list.length === 1) {
      list[0]!(...args);
      return;
    }
    const copy = list.slice();
    for (let i = 0; i < copy.length; i++) {
      copy[i]!(...args);
    }
  }

  listenerCount(event: keyof Events): number {
    return this.listeners.get(event)?.length ?? 0;
  }

  eventNames(): Array<keyof Events> {
    return [...this.listeners.keys()].filter((e) => (this.listeners.get(e)?.length ?? 0) > 0);
  }

  removeAllListeners(event?: keyof Events): this {
    if (event !== undefined) {
      for (const registration of this.registrations.get(event) ?? []) {
        if (registration.signal && registration.onAbort) {
          registration.signal.removeEventListener("abort", registration.onAbort);
        }
      }
      this.listeners.delete(event);
      this.registrations.delete(event);
    } else {
      for (const registrations of this.registrations.values()) {
        for (const registration of registrations) {
          if (registration.signal && registration.onAbort) {
            registration.signal.removeEventListener("abort", registration.onAbort);
          }
        }
      }
      this.listeners.clear();
      this.registrations.clear();
    }
    return this;
  }
}
