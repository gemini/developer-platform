// any[] required: unknown[] rejects typed callbacks due to contravariance (TS function parameter bivariance)
type Listener = (...args: any[]) => void; // eslint-disable-line @typescript-eslint/no-explicit-any

interface Registration {
  original: Listener;   // the callback the caller passed
  actual: Listener;     // what's in the _listeners array (same for on, wrapper for once)
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
  private _listeners = new Map<keyof Events, Listener[]>();
  // Registrations in insertion order — off() scans from the end to find the
  // most recent match, exactly like Node's EventEmitter.
  private _registrations = new Map<keyof Events, Registration[]>();

  on<E extends keyof Events>(event: E, fn: Events[E]): this {
    let list = this._listeners.get(event);
    if (!list) {
      list = [];
      this._listeners.set(event, list);
    }
    list.push(fn);
    let regs = this._registrations.get(event);
    if (!regs) {
      regs = [];
      this._registrations.set(event, regs);
    }
    regs.push({ original: fn, actual: fn });
    return this;
  }

  addListener<E extends keyof Events>(event: E, fn: Events[E]): this {
    return this.on(event, fn);
  }

  off<E extends keyof Events>(event: E, fn: Events[E]): this {
    const regs = this._registrations.get(event);
    if (!regs) return this;
    // Scan from the end to remove the most recent registration (Node semantics).
    for (let i = regs.length - 1; i >= 0; i--) {
      if (regs[i]!.original === fn) {
        const removed = regs.splice(i, 1)[0]!;
        const list = this._listeners.get(event);
        if (list) {
          const idx = list.indexOf(removed.actual);
          if (idx >= 0) list.splice(idx, 1);
        }
        return this;
      }
    }
    return this;
  }

  removeListener<E extends keyof Events>(event: E, fn: Events[E]): this {
    return this.off(event, fn);
  }

  once<E extends keyof Events>(event: E, fn: Events[E]): this {
    const wrapper = ((...args: Parameters<Events[E]>) => {
      this._removeByActual(event, wrapper);
      fn(...args);
    }) as Events[E];
    let list = this._listeners.get(event);
    if (!list) {
      list = [];
      this._listeners.set(event, list);
    }
    list.push(wrapper);
    let regs = this._registrations.get(event);
    if (!regs) {
      regs = [];
      this._registrations.set(event, regs);
    }
    regs.push({ original: fn, actual: wrapper });
    return this;
  }

  /** Remove a specific registration by its actual (wrapper) identity. */
  private _removeByActual(event: keyof Events, actual: Listener): void {
    const regs = this._registrations.get(event);
    if (!regs) return;
    for (let i = regs.length - 1; i >= 0; i--) {
      if (regs[i]!.actual === actual) {
        regs.splice(i, 1);
        break;
      }
    }
    const list = this._listeners.get(event);
    if (list) {
      const idx = list.indexOf(actual);
      if (idx >= 0) list.splice(idx, 1);
    }
  }

  emit<E extends keyof Events>(event: E, ...args: Parameters<Events[E]>): void {
    const list = this._listeners.get(event);
    if (!list) return;
    for (const fn of [...list]) fn(...args);
  }

  listenerCount(event: keyof Events): number {
    return this._listeners.get(event)?.length ?? 0;
  }

  eventNames(): Array<keyof Events> {
    return [...this._listeners.keys()].filter((e) => (this._listeners.get(e)?.length ?? 0) > 0);
  }

  removeAllListeners(event?: keyof Events): this {
    if (event !== undefined) {
      this._listeners.delete(event);
      this._registrations.delete(event);
    } else {
      this._listeners.clear();
      this._registrations.clear();
    }
    return this;
  }
}
