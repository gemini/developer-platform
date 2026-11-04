import type { SocketLike } from "../../websocket/session.js";
import type { BoundaryValue } from "../../utils/boundary-value.js";

/**
 * A fake WebSocket the tests drive by hand: no network, fully synchronous.
 * It records what was sent and exposes fire() to simulate the socket firing
 * its own events (open/message/close/error), so we control every scenario.
 */
export class FakeSocket implements SocketLike {
  sent: string[] = [];
  closed = false;
  private listeners: Record<string, ((ev: BoundaryValue) => void)[]> = {};

  addEventListener(type: string, listener: (ev: BoundaryValue) => void): void {
    (this.listeners[type] ??= []).push(listener);
  }
  send(data: string): void {
    this.sent.push(data);
  }
  close(): void {
    this.closed = true;
  }

  fire(type: string, ev?: BoundaryValue): void {
    for (const l of this.listeners[type] ?? []) l(ev);
  }

  fireOpen(): void {
    this.fire("open");
  }

  fireMessage(data: BoundaryValue): void {
    this.fire("message", data);
  }

  fireError(cause?: BoundaryValue): void {
    this.fire("error", cause);
  }

  fireClose(event?: BoundaryValue): void {
    this.closed = true;
    this.fire("close", event);
  }
}
