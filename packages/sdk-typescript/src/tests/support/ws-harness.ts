import type { TestContext } from "node:test";

import type { SocketFactory, SocketFactoryOptions } from "../../websocket/session.js";
import type { BoundaryValue } from "../../utils/boundary-value.js";
import { FakeSocket } from "./fake-socket.js";

/** Deterministic socket registry for WebSocket state-machine tests. */
export interface WebSocketHarness {
  readonly sockets: FakeSocket[];
  readonly urls: string[];
  readonly options: SocketFactoryOptions[];
  readonly socketFactory: SocketFactory;
  waitForSocket(index?: number): Promise<FakeSocket>;
  open(index?: number): FakeSocket;
  message(data: BoundaryValue, index?: number): void;
  networkClose(index?: number): void;
}

export interface FakeClock {
  tick(ms: number): void;
  flush(): Promise<void>;
  tickAndFlush(ms: number): Promise<void>;
}

export function createWebSocketHarness(): WebSocketHarness {
  const sockets: FakeSocket[] = [];
  const urls: string[] = [];
  const options: SocketFactoryOptions[] = [];
  const socketWaiters = new Map<number, ((socket: FakeSocket) => void)[]>();
  const waitForSocket = (index = 0): Promise<FakeSocket> => {
    const existing = sockets[index];
    if (existing) return Promise.resolve(existing);
    return new Promise((resolve) => {
      const waiters = socketWaiters.get(index) ?? [];
      waiters.push(resolve);
      socketWaiters.set(index, waiters);
    });
  };
  const socketFactory: SocketFactory = (url, socketOptions) => {
    const socket = new FakeSocket();
    const index = sockets.push(socket) - 1;
    urls.push(url);
    options.push(socketOptions);
    for (const resolve of socketWaiters.get(index) ?? []) resolve(socket);
    socketWaiters.delete(index);
    return socket;
  };
  const socketAt = (index = sockets.length - 1): FakeSocket => {
    const socket = sockets[index];
    if (!socket) throw new Error(`socket ${index} was not created`);
    return socket;
  };
  return {
    sockets,
    urls,
    options,
    socketFactory,
    waitForSocket,
    open: (index) => {
      const socket = socketAt(index);
      socket.fireOpen();
      return socket;
    },
    message: (data, index) => socketAt(index).fireMessage(data),
    networkClose: (index) => socketAt(index).fireClose(),
  };
}

/** Keep timer advancement and promise flushing explicit in state-machine tests. */
export function createFakeClock(t: Pick<TestContext, "mock">): FakeClock {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const flush = () => new Promise<void>((resolve) => setImmediate(resolve));
  return {
    tick: (ms) => t.mock.timers.tick(ms),
    flush,
    async tickAndFlush(ms) {
      t.mock.timers.tick(ms);
      await flush();
    },
  };
}
