import type { SocketLike } from "../transport.js";

/**
 * A fake WebSocket the tests drive by hand: no network, fully synchronous.
 * It records what was sent and exposes fire() to simulate the socket firing
 * its own events (open/message/close/error), so we control every scenario.
 */
export class FakeSocket implements SocketLike {
  sent: string[] = [];
  closed = false;
  private listeners: Record<string, ((ev: unknown) => void)[]> = {};

  addEventListener(type: string, listener: (ev: unknown) => void): void {
    (this.listeners[type] ??= []).push(listener);
  }
  send(data: string): void {
    this.sent.push(data);
  }
  close(): void {
    this.closed = true;
  }

  fire(type: string, ev?: unknown): void {
    for (const l of this.listeners[type] ?? []) l(ev);
  }
}
