import test from "node:test";
import assert from "node:assert/strict";

import { WebSocketSession, type SocketFactoryOptions, type WebSocketSessionOptions } from "./session.js";
import { NOOP_LOGGER } from "../observability/logging.js";
import { ConnectionError } from "../errors.js";
import { FakeSocket } from "../tests/support/fake-socket.js";
import { isBoundaryNumber, isBoundaryObject, isBoundaryString, type BoundaryValue } from "../utils/boundary-value.js";
import { parseBoundaryRecord } from "../tests/support/http-fixtures.js";

type CapturedSocketFactoryOptions = SocketFactoryOptions;
type SentFrame = { id?: number; method?: string; params: string[] };

function parseSentFrame(text: string): SentFrame {
  const frame = parseBoundaryRecord(text);
  const params = Array.isArray(frame.params) ? frame.params.filter(isBoundaryString) : [];
  if (!Array.isArray(frame.params) || params.length !== frame.params.length) {
    throw new Error("test frame must contain only string params");
  }
  return {
    id: isBoundaryNumber(frame.id) ? frame.id : undefined,
    method: isBoundaryString(frame.method) ? frame.method : undefined,
    params,
  };
}

async function flush(): Promise<void> {
  await new Promise<void>((resolve) => setImmediate(resolve));
}

function createSession(url: string, options: Omit<WebSocketSessionOptions, "url"> = {}): WebSocketSession {
  return new WebSocketSession({ ...options, url });
}

test("connect() resolves once the socket opens and emits 'open'", async () => {
  const fake = new FakeSocket();
  const transport = createSession("wss://example.test/v1", {
    logger: NOOP_LOGGER,
    socketFactory: () => fake,
  });

  let openEvents = 0;
  transport.on("open", () => {
    openEvents++;
  });

  const connected = transport.connect();
  fake.fire("open");
  await connected;

  assert.equal(openEvents, 1, "'open' event must fire exactly once");
});

test("default WebSocket factory uses the native WebSocket with the configured URL", async (t) => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "WebSocket");
  const instances: Array<{ url: string; socket: FakeSocket }> = [];
  class NativeWebSocketStub extends FakeSocket {
    constructor(readonly url: string) {
      super();
      instances.push({ url, socket: this });
    }
  }
  Object.defineProperty(globalThis, "WebSocket", {
    configurable: true,
    writable: true,
    value: NativeWebSocketStub,
  });
  t.after(() => {
    if (descriptor) Object.defineProperty(globalThis, "WebSocket", descriptor);
    else {
      // SAFETY: The test temporarily installs a configurable global WebSocket property.
      delete (globalThis as { WebSocket?: BoundaryValue }).WebSocket;
    }
  });

  const session = new WebSocketSession({ url: "wss://native.example.test" });
  t.after(() => session.close());
  const connected = session.connect();
  await new Promise<void>((resolve) => setImmediate(resolve));

  assert.equal(instances.length, 1);
  assert.equal(instances[0]?.url, "wss://native.example.test");
  instances[0]?.socket.fire("open");
  await connected;
});

test("default WebSocket factory rejects custom headers instead of pretending native WebSocket supports them", async (t) => {
  const session = new WebSocketSession({
    url: "wss://native.example.test",
    headers: { Authorization: "secret" },
  });
  t.after(() => session.close());

  await assert.rejects(session.connect(), (error: BoundaryValue) =>
    error instanceof ConnectionError &&
    (error.cause instanceof Error) && error.cause.message.includes("default WebSocket factory cannot send custom headers"),
  );
});

test("WebSocket diagnostics omit URL credentials and query parameters", async () => {
  const fake = new FakeSocket();
  const events: BoundaryValue[] = [];
  const transport = createSession("wss://client:secret@example.test/v1?token=private#fragment", {
    logger: NOOP_LOGGER,
    onDiagnostic: (event) => events.push(event),
    socketFactory: () => fake,
  });

  const connected = transport.connect();
  fake.fire("open");
  await connected;

  assert.equal(JSON.stringify(events).includes("secret"), false);
  assert.equal(JSON.stringify(events).includes("private"), false);
  const firstEvent = events[0];
  assert.ok(isBoundaryObject(firstEvent));
  assert.ok(isBoundaryObject(firstEvent.metadata));
  assert.equal(firstEvent.metadata.url, "wss://example.test/v1");
});

test("incoming frame is emitted as a lossless-parsed 'message' (big id stays bigint)", async () => {
  const fake = new FakeSocket();
  const transport = createSession("wss://example.test/v1", {
    logger: NOOP_LOGGER,
    socketFactory: () => fake,
  });

  let received: BoundaryValue;
  transport.on("message", (msg: BoundaryValue) => {
    received = msg;
  });

  const connected = transport.connect();
  fake.fire("open");
  await connected;

  // lastUpdateId exceeds 2^53; raw JSON.parse would silently round it.
  fake.fire("message", { data: '{"lastUpdateId":9007199254740993,"bids":[]}' });

  assert.deepEqual(received, {
    lastUpdateId: 9007199254740993n,
    bids: [],
  });
});

test("a malformed frame emits ConnectionError and leaves the socket up", async () => {
  const fake = new FakeSocket();
  const transport = createSession("wss://example.test/v1", {
    logger: NOOP_LOGGER,
    socketFactory: () => fake,
  });

  const errors: BoundaryValue[] = [];
  transport.on("error", (err: BoundaryValue) => {
    errors.push(err);
  });
  let goodMessages = 0;
  transport.on("message", () => {
    goodMessages++;
  });

  const connected = transport.connect();
  fake.fire("open");
  await connected;

  fake.fire("message", { data: "}{ not json" });

  assert.equal(errors.length, 1, "malformed frame must surface exactly one error");
  assert.ok(errors[0] instanceof ConnectionError, "error must be a ConnectionError");
  assert.equal(fake.closed, false, "one bad frame must not tear down the socket");

  // A subsequent good frame still flows — the connection survived.
  fake.fire("message", { data: '{"ok":true}' });
  assert.equal(goodMessages, 1);
});

test("a non-string frame emits a typed error and closes the socket", async () => {
  const fake = new FakeSocket();
  const transport = createSession("wss://example.test/v1", {
    logger: NOOP_LOGGER,
    socketFactory: () => fake,
  });
  const errors: BoundaryValue[] = [];
  transport.on("error", (err: BoundaryValue) => errors.push(err));

  const connected = transport.connect();
  fake.fire("open");
  await connected;
  fake.fire("message", { data: new TextEncoder().encode("{}") });

  assert.equal(errors.length, 1);
  assert.ok(errors[0] instanceof ConnectionError);
  if (!(errors[0] instanceof ConnectionError)) throw new Error("expected a connection error");
  assert.match(errors[0].message, /must be a string/);
  assert.equal(fake.closed, true);
  transport.close();
});

test("socket close errors expose cause, close metadata, and whether it opened", async () => {
  const fake = new FakeSocket();
  const transport = createSession("wss://example.test/v1", {
    logger: NOOP_LOGGER,
    socketFactory: () => fake,
    backoff: { baseMs: 100, capMs: 100, factor: 2 },
  });
  const errors: BoundaryValue[] = [];
  transport.on("error", (error) => errors.push(error));
  const connected = transport.connect();
  fake.fire("open");
  await connected;

  fake.fire("close", { code: 4001, reason: "expired" });

  if (!(errors[0] instanceof ConnectionError)) throw new Error("expected a connection error");
  assert.equal(errors[0].opened, true);
  assert.equal(errors[0].closeCode, 4001);
  assert.equal(errors[0].closeReason, "expired");
  transport.close();
});

test("socket error events preserve their underlying cause", async () => {
  const fake = new FakeSocket();
  const transport = createSession("wss://example.test/v1", { socketFactory: () => fake });
  const errors: BoundaryValue[] = [];
  transport.on("error", (error) => errors.push(error));
  const connected = transport.connect();
  fake.fire("open");
  await connected;

  const cause = new Error("network reset");
  fake.fire("error", { error: cause });

  if (!(errors[0] instanceof ConnectionError)) throw new Error("expected a connection error");
  assert.equal(errors[0].cause, cause);
  transport.close();
});

test("socket errors close and fence sockets that never emit close", async (t) => {
  const sockets: FakeSocket[] = [];
  const transport = createSession("wss://example.test/v1", {
    socketFactory: () => {
      const socket = new FakeSocket();
      sockets.push(socket);
      return socket;
    },
  });
  t.mock.timers.enable({ apis: ["setTimeout"] });

  const connected = transport.connect();
  sockets[0]!.fire("open");
  await connected;

  sockets[0]!.fire("error", { error: new Error("socket failed") });
  t.mock.timers.tick(0);

  assert.equal(sockets.length, 2, "an error-only socket must still reconnect");
  assert.equal(sockets[0]!.closed, true, "the errored socket must be closed before replacement");

  transport.close();
  assert.equal(sockets[1]!.closed, true, "close() must close the replacement socket");
});

test("oversized inbound messages are rejected before parsing", async () => {
  const fake = new FakeSocket();
  const transport = createSession("wss://example.test/v1", {
    logger: NOOP_LOGGER,
    socketFactory: () => fake,
    maxMessageSizeBytes: 4,
  });
  const messages: BoundaryValue[] = [];
  transport.on("message", (message) => messages.push(message));
  const connected = transport.connect();
  fake.fire("open");
  await connected;

  fake.fire("message", { data: '{"x":1}' });

  assert.equal(fake.closed, true);
  assert.deepEqual(messages, []);
  transport.close();
});

test("a malformed frame does not crash when no 'error' listener is attached", async () => {
  const fake = new FakeSocket();
  const transport = createSession("wss://example.test/v1", {
    logger: NOOP_LOGGER,
    socketFactory: () => fake,
  });

  // Deliberately attach NO 'error' listener — an ordinary consumer that only
  // cares about messages. Node's EventEmitter re-throws an unhandled 'error',
  // which would crash the process; a resilient transport must not die on one bad frame.
  let goodMessages = 0;
  transport.on("message", () => {
    goodMessages++;
  });

  const connected = transport.connect();
  fake.fire("open");
  await connected;

  fake.fire("message", { data: "}{ not json" }); // must NOT throw
  assert.equal(fake.closed, false, "socket must survive a bad frame");

  fake.fire("message", { data: '{"ok":true}' });
  assert.equal(goodMessages, 1, "good frames still flow after a bad one");
});

test("socketFactory receives connection headers", async () => {
  let received: CapturedSocketFactoryOptions | undefined;
  const transport = createSession("wss://example.test/v1", {
    logger: NOOP_LOGGER,
    headers: { Authorization: "Bearer token" },
    socketFactory: (_url, options) => {
      received = options;
      return new FakeSocket();
    },
  });

  const connected = transport.connect();

  assert.deepEqual(received?.headers, { Authorization: "Bearer token" });
  assert.ok(received?.signal instanceof AbortSignal);
  assert.equal(received?.maxPayload, 1_048_576);
  assert.equal(received?.handshakeTimeout, 30_000);
  assert.equal(received?.perMessageDeflate, false);
  transport.close();
  await assert.rejects(connected, /WebSocket session closed/);
});

test("reconnect() drops frames from the closing socket before its close event", async () => {
  const socket = new FakeSocket();
  const transport = createSession("wss://example.test/v1", {
    logger: NOOP_LOGGER,
    socketFactory: () => socket,
  });
  const messages: BoundaryValue[] = [];
  transport.on("message", (frame) => messages.push(frame));

  const connected = transport.connect();
  socket.fire("open");
  await connected;

  transport.reconnect();
  socket.fire("message", { data: '{"stale":true}' });

  assert.deepEqual(messages, [], "the socket is stale as soon as restart begins");
});

test("an unexpected drop announces 'reconnecting' and opens a fresh socket immediately", async (t) => {
  const sockets: FakeSocket[] = [];
  const transport = createSession("wss://example.test/v1", {
    logger: NOOP_LOGGER,
    socketFactory: () => {
      const s = new FakeSocket();
      sockets.push(s);
      return s;
    },
  });

  let reconnecting = 0;
  transport.on("reconnecting", () => {
    reconnecting++;
  });

  t.mock.timers.enable({ apis: ["setTimeout"] });

  const connected = transport.connect();
  sockets[0].fire("open");
  await connected;
  assert.equal(sockets.length, 1, "one socket so far");

  sockets[0].fire("close"); // unexpected drop
  assert.equal(reconnecting, 1, "drop must announce 'reconnecting'");

  t.mock.timers.tick(0); // immediate first retry (delay 0)
  assert.equal(sockets.length, 2, "must open a fresh socket to reconnect");

  sockets[1].fire("open"); // connection restored, no throw
});

// Reconnect a transport whose sockets never open, driving repeated failures.
// random:()=>1 makes equal-jitter contribute its max, so delay === the exact
// base value — lets us assert cadence boundaries precisely.
function makeFlappy(t: { mock: { timers: { enable(o: BoundaryValue): void } } }) {
  const sockets: FakeSocket[] = [];
  const transport = createSession("wss://example.test/v1", {
    logger: NOOP_LOGGER,
    socketFactory: () => {
      const s = new FakeSocket();
      sockets.push(s);
      return s;
    },
    backoff: { baseMs: 100, capMs: 400, factor: 2 },
    random: () => 1,
    reconnect: { stableConnectionMs: 0 },
  });
  t.mock.timers.enable({ apis: ["setTimeout"] });
  return { sockets, transport };
}

test("rejects invalid reconnect backoff values", () => {
  for (const backoff of [
    { baseMs: -1 },
    { capMs: -1 },
    { factor: 0 },
    { baseMs: Number.NaN },
    { factor: Number.POSITIVE_INFINITY },
  ]) {
    assert.throws(
      () => createSession("wss://example.test/v1", { backoff }),
      /backoff values must be finite/,
    );
  }
});

test("reconnect backoff grows exponentially and is capped", async (t) => {
  const { sockets, transport } = makeFlappy(t);

  const connected = transport.connect();
  sockets[0].fire("open");
  await connected;

  // attempt 0: immediate (0ms)
  sockets[0].fire("close");
  t.mock.timers.tick(0);
  assert.equal(sockets.length, 2, "first retry is immediate");

  // attempt 1: base = 100ms
  sockets[1].fire("close");
  t.mock.timers.tick(99);
  assert.equal(sockets.length, 2, "must still be waiting at 99ms");
  t.mock.timers.tick(1);
  assert.equal(sockets.length, 3, "reconnects at 100ms");

  // attempt 2: 200ms
  sockets[2].fire("close");
  t.mock.timers.tick(199);
  assert.equal(sockets.length, 3);
  t.mock.timers.tick(1);
  assert.equal(sockets.length, 4, "reconnects at 200ms");

  // attempt 3: 400ms (100*2^2)
  sockets[3].fire("close");
  t.mock.timers.tick(400);
  assert.equal(sockets.length, 5, "reconnects at 400ms");

  // attempt 4: would be 800ms but capped at 400ms
  sockets[4].fire("close");
  t.mock.timers.tick(400);
  assert.equal(sockets.length, 6, "delay is capped at 400ms");
});

test("backoff resets to immediate after a successful reconnect", async (t) => {
  const { sockets, transport } = makeFlappy(t);

  const connected = transport.connect();
  sockets[0].fire("open");
  await connected;

  // Fail once so the attempt counter escalates past 0.
  sockets[0].fire("close");
  t.mock.timers.tick(0); // sockets[1]
  sockets[1].fire("close");
  t.mock.timers.tick(100); // sockets[2] at the base delay
  assert.equal(sockets.length, 3);

  sockets[2].fire("open"); // SUCCESS — must reset the counter

  // The next drop should be immediate again, not the escalated 200ms.
  sockets[2].fire("close");
  t.mock.timers.tick(0);
  assert.equal(sockets.length, 4, "a success resets backoff, so the next reconnect is immediate");
});

test("a subscription created during reconnect is sent exactly once", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const sockets: FakeSocket[] = [];
  const session = createSession("wss://example.test/v1", {
    socketFactory: () => {
      const socket = new FakeSocket();
      sockets.push(socket);
      return socket;
    },
  });
  t.after(() => session.close());

  const connected = session.connect();
  await flush();
  sockets[0].fire("open");
  await connected;
  const first = session.subscribe(["first"]);
  await flush();
  sockets[0].fire("message", { data: '{"id":1,"status":200}' });
  await first.ready;

  sockets[0].fire("close");
  t.mock.timers.tick(0);
  await flush();
  const second = session.subscribe(["second"]);
  sockets[1].fire("open");
  await flush();

  const sent = sockets[1].sent.map(parseSentFrame);
  assert.equal(sent.filter((frame) => frame.params[0] === "first").length, 1);
  assert.equal(sent.filter((frame) => frame.params[0] === "second").length, 1);
  sockets[1].fire("message", { data: '{"id":2,"status":200}' });
  await second.ready;
});

test("initial subscription emits subscriptionReady with the acknowledgement", async (t) => {
  const socket = new FakeSocket();
  const session = createSession("wss://example.test/v1", { socketFactory: () => socket });
  t.after(() => session.close());
  const events: Array<{ id: string | number; response: BoundaryValue }> = [];
  session.on("subscriptionReady", (event) => events.push(event));

  const connected = session.connect();
  socket.fire("open");
  await connected;
  const subscription = session.subscribe(["ready-event"]);
  await flush();
  socket.fire("message", { data: '{"id":1,"status":200}' });
  await subscription.ready;

  assert.deepEqual(events, [{ id: 1, response: { id: 1, status: 200 } }]);
});

test("a subscription on a socket that closes before open is replayed exactly once", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const sockets: FakeSocket[] = [];
  const session = createSession("wss://example.test/v1", {
    socketFactory: () => {
      const socket = new FakeSocket();
      sockets.push(socket);
      return socket;
    },
  });
  t.after(() => session.close());

  const subscription = session.subscribe(["before-open-close"]);
  await flush();
  sockets[0].fire("close");
  t.mock.timers.tick(0);
  sockets[1].fire("open");
  await flush();

  const sent = sockets[1].sent.map(parseSentFrame);
  assert.equal(sent.filter((frame) => frame.method === "SUBSCRIBE" && frame.params[0] === "before-open-close").length, 1);
  sockets[1].fire("message", { data: '{"id":1,"status":200}' });
  await subscription.ready;
});

test("an unacknowledged subscription replays once and can be unsubscribed", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const sockets: FakeSocket[] = [];
  const session = createSession("wss://example.test/v1", {
    socketFactory: () => {
      const socket = new FakeSocket();
      sockets.push(socket);
      return socket;
    },
  });
  t.after(() => session.close());

  const connected = session.connect();
  await flush();
  sockets[0].fire("open");
  await connected;
  const subscription = session.subscribe(["pending"]);
  await flush();
  assert.equal(sockets[0].sent.length, 1);

  sockets[0].fire("close");
  t.mock.timers.tick(0);
  await flush();
  sockets[1].fire("open");
  await flush();

  const replayed = sockets[1].sent.map(parseSentFrame);
  assert.equal(replayed.filter((frame) => frame.method === "SUBSCRIBE" && frame.params[0] === "pending").length, 1);
  sockets[1].fire("message", { data: '{"id":1,"status":200}' });
  await subscription.ready;

  const closing = subscription.close();
  await flush();
  const unsubscribed = sockets[1].sent.map(parseSentFrame);
  assert.equal(unsubscribed.filter((frame) => frame.method === "UNSUBSCRIBE" && frame.params[0] === "pending").length, 1);
  sockets[1].fire("message", { data: '{"id":2,"status":200}' });
  await closing;
});

test("a timed-out replayed subscription unsubscribes from the replacement socket", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const sockets: FakeSocket[] = [];
  const session = createSession("wss://example.test/v1", {
    socketFactory: () => {
      const socket = new FakeSocket();
      sockets.push(socket);
      return socket;
    },
  });
  t.after(() => session.close());

  const connected = session.connect();
  await flush();
  sockets[0].fire("open");
  await connected;

  // Reconnect before the subscription's initial connection continuation runs. The
  // replacement socket must replay the durable subscription and own its cleanup.
  const subscription = session.subscribe(["timeout-race"], { timeoutMs: 10 });
  session.reconnect();
  t.mock.timers.tick(0);
  sockets[1].fire("open");
  await flush();

  t.mock.timers.tick(10);
  await assert.rejects(subscription.ready, /deadline/);
  await flush();

  const sent = sockets[1].sent.map(parseSentFrame);
  assert.equal(sent.filter((frame) => frame.method === "SUBSCRIBE" && frame.params[0] === "timeout-race").length, 1);
  assert.equal(sent.filter((frame) => frame.method === "UNSUBSCRIBE" && frame.params[0] === "timeout-race").length, 1);
});

test("a subscription cannot send after reconnect has started", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const sockets: FakeSocket[] = [];
  const session = createSession("wss://example.test/v1", {
    socketFactory: () => {
      const socket = new FakeSocket();
      sockets.push(socket);
      return socket;
    },
  });
  t.after(() => session.close());

  const connected = session.connect();
  await flush();
  sockets[0].fire("open");
  await connected;

  const subscription = session.subscribe(["race"]);
  session.reconnect();
  t.mock.timers.tick(0);
  sockets[1].fire("open");
  await flush();

  assert.deepEqual(sockets[0].sent, []);
  assert.deepEqual(sockets[1].sent.map((frame) => JSON.parse(frame)), [{
    id: 1,
    method: "SUBSCRIBE",
    params: ["race"],
  }]);
  sockets[1].fire("message", { data: '{"id":1,"status":200}' });
  await subscription.ready;
});

test("a diagnostic callback cannot strand a subscription when it reconnects during send", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const socket = new FakeSocket();
  let session!: WebSocketSession;
  session = createSession("wss://example.test/v1", {
    socketFactory: () => socket,
    onDiagnostic: (event) => {
      if (event.name === "ws.subscription.send") session.reconnect();
    },
  });
  t.after(() => session.close());

  const connected = session.connect();
  socket.fire("open");
  await connected;
  const subscription = session.subscribe(["diagnostic-race"]);
  await assert.rejects(subscription.ready, /socket is no longer current/);
  assert.deepEqual(socket.sent, []);
});

test("jitter collapses the delay to its floor (raw/2) when random is low", async (t) => {
  const sockets: FakeSocket[] = [];
  const transport = createSession("wss://example.test/v1", {
    logger: NOOP_LOGGER,
    socketFactory: () => {
      const s = new FakeSocket();
      sockets.push(s);
      return s;
    },
    backoff: { baseMs: 100, capMs: 400, factor: 2 },
    random: () => 0, // jitter contributes nothing → delay is the floor, raw/2
  });
  t.mock.timers.enable({ apis: ["setTimeout"] });

  const connected = transport.connect();
  sockets[0].fire("open");
  await connected;

  sockets[0].fire("close");
  t.mock.timers.tick(0); // sockets[1], immediate
  sockets[1].fire("close"); // attempt 1: raw = 100ms, floor = 50ms

  t.mock.timers.tick(49);
  assert.equal(sockets.length, 2, "still waiting at 49ms");
  t.mock.timers.tick(1);
  assert.equal(sockets.length, 3, "reconnects at 50ms — the jitter floor, not the full 100ms");
});

test("close() emits 'close' and suppresses reconnect", async (t) => {
  const sockets: FakeSocket[] = [];
  const transport = createSession("wss://example.test/v1", {
    logger: NOOP_LOGGER,
    socketFactory: () => {
      const s = new FakeSocket();
      sockets.push(s);
      return s;
    },
  });

  t.mock.timers.enable({ apis: ["setTimeout"] });

  let closeEvents = 0;
  let reconnecting = 0;
  transport.on("close", () => {
    closeEvents++;
  });
  transport.on("reconnecting", () => {
    reconnecting++;
  });

  const connected = transport.connect();
  sockets[0].fire("open");
  await connected;

  transport.close();
  assert.equal(sockets[0].closed, true, "close() must shut the underlying socket");

  sockets[0].fire("close"); // socket confirms the deliberate closure

  assert.equal(closeEvents, 1, "must emit 'close' on deliberate teardown");
  assert.equal(reconnecting, 0, "must NOT announce reconnecting");

  t.mock.timers.tick(60_000); // well past any backoff window
  assert.equal(sockets.length, 1, "must NOT reconnect after a deliberate close");
});

test("close() during the backoff window cancels the pending reconnect", async (t) => {
  const sockets: FakeSocket[] = [];
  const transport = createSession("wss://example.test/v1", {
    logger: NOOP_LOGGER,
    socketFactory: () => {
      const s = new FakeSocket();
      sockets.push(s);
      return s;
    },
    backoff: { baseMs: 100, capMs: 400, factor: 2 },
  });

  t.mock.timers.enable({ apis: ["setTimeout"] });

  let opens = 0;
  transport.on("open", () => {
    opens++;
  });

  const connected = transport.connect();
  sockets[0].fire("open");
  await connected;
  assert.equal(opens, 1);

  sockets[0].fire("close"); // unexpected drop → schedules a reconnect timer
  transport.close(); // caller tears down while that timer is still pending

  t.mock.timers.tick(60_000); // fire everything
  assert.equal(sockets.length, 1, "a pending reconnect must not fire after close()");
  assert.equal(opens, 1, "no second connection is opened");
});

test("close() during the backoff window still emits 'close'", async (t) => {
  const sockets: FakeSocket[] = [];
  const transport = createSession("wss://example.test/v1", {
    logger: NOOP_LOGGER,
    socketFactory: () => {
      const s = new FakeSocket();
      sockets.push(s);
      return s;
    },
    backoff: { baseMs: 100, capMs: 400, factor: 2 },
  });

  t.mock.timers.enable({ apis: ["setTimeout"] });

  let closeEvents = 0;
  transport.on("close", () => {
    closeEvents++;
  });

  const connected = transport.connect();
  sockets[0].fire("open");
  await connected;

  sockets[0].fire("close"); // drop → reconnect scheduled (socket now dead)
  transport.close(); // tear down mid-backoff — no live socket to fire 'close'

  assert.equal(closeEvents, 1, "close() must emit 'close' even with no live socket");
});

test("close() before the socket opens rejects a pending connect()", { timeout: 2000 }, async () => {
  const fake = new FakeSocket();
  const transport = createSession("wss://example.test/v1", {
    logger: NOOP_LOGGER,
    socketFactory: () => fake,
  });

  const connected = transport.connect();

  transport.close(); // caller shuts down before the first 'open' ever arrives
  await assert.rejects(connected, /WebSocket session closed/);
});

test("close() while an async socket factory is connecting settles and closes the late socket", async () => {
  let resolveSocket!: (socket: FakeSocket) => void;
  const socketReady = new Promise<FakeSocket>((resolve) => {
    resolveSocket = resolve;
  });
  const transport = createSession("wss://example.test/v1", {
    logger: NOOP_LOGGER,
    socketFactory: () => socketReady,
  });

  const connected = transport.connect();
  transport.close();
  await assert.rejects(connected, /WebSocket session closed/);

  const lateSocket = new FakeSocket();
  resolveSocket(lateSocket);
  await new Promise<void>((resolve) => setImmediate(resolve));

  assert.equal(lateSocket.closed, true, "a socket created after close() must be closed immediately");
});

test("close() while an async socket factory is rejected remains permanently closed", async () => {
  let rejectSocket!: (error: Error) => void;
  let factoryCalls = 0;
  const socketReady = new Promise<FakeSocket>((_resolve, reject) => {
    rejectSocket = reject;
  });
  const transport = createSession("wss://example.test/v1", {
    logger: NOOP_LOGGER,
    socketFactory: () => {
      factoryCalls++;
      return socketReady;
    },
  });

  const connected = transport.connect();
  transport.close();
  await assert.rejects(connected, /WebSocket session closed/);

  rejectSocket(new Error("late factory failure"));
  await new Promise<void>((resolve) => setImmediate(resolve));

  assert.throws(() => transport.connect(), /closed WebSocket session/);
  assert.equal(factoryCalls, 1, "a late rejection must not return the closed session to idle");
});

test("connect() called twice reuses the open session", async () => {
  const sockets: FakeSocket[] = [];
  const transport = createSession("wss://example.test/v1", {
    logger: NOOP_LOGGER,
    socketFactory: () => {
      const s = new FakeSocket();
      sockets.push(s);
      return s;
    },
  });

  const connected = transport.connect();
  sockets[0].fire("open");
  await connected;

  await transport.connect();
  assert.equal(sockets.length, 1, "no orphaned second socket");
});

test("connect() rejects when its caller aborts", async () => {
  const fake = new FakeSocket();
  const transport = createSession("wss://example.test/v1", {
    logger: NOOP_LOGGER,
    socketFactory: () => fake,
  });
  const controller = new AbortController();

  const connected = transport.connect({ signal: controller.signal });
  controller.abort();

  await assert.rejects(connected, /aborted/);
  transport.close();
});

test("connect() rejects when its caller deadline expires", async (t) => {
  const fake = new FakeSocket();
  const transport = createSession("wss://example.test/v1", {
    logger: NOOP_LOGGER,
    socketFactory: () => fake,
  });
  t.mock.timers.enable({ apis: ["setTimeout"] });

  const connected = transport.connect({ timeoutMs: 10 });
  t.mock.timers.tick(10);

  await assert.rejects(connected, /deadline/);
  assert.equal(fake.closed, true, "an expired connection attempt must close its socket");
  fake.fire("open");
  transport.close();
});

test("connect() closes a socket that resolves after its deadline", async (t) => {
  let resolveSocket!: (socket: FakeSocket) => void;
  const socketReady = new Promise<FakeSocket>((resolve) => {
    resolveSocket = resolve;
  });
  const transport = createSession("wss://example.test/v1", {
    logger: NOOP_LOGGER,
    timeoutMs: 10,
    socketFactory: () => socketReady,
  });
  t.mock.timers.enable({ apis: ["setTimeout"] });

  const connected = transport.connect();
  t.mock.timers.tick(10);
  await assert.rejects(connected, /deadline/);

  const lateSocket = new FakeSocket();
  resolveSocket(lateSocket);
  await flush();
  assert.equal(lateSocket.closed, true, "a timed-out attempt must fence and close a late socket");
  transport.close();
});

test("reconnect policy stops fatal close codes and bounded retry loops", async (t) => {
  const sockets: FakeSocket[] = [];
  let reconnecting = 0;
  const transport = createSession("wss://example.test/v1", {
    logger: NOOP_LOGGER,
    socketFactory: () => {
      const socket = new FakeSocket();
      sockets.push(socket);
      return socket;
    },
    backoff: { baseMs: 0, capMs: 0 },
    reconnect: { maxAttempts: 1, stableConnectionMs: 0 },
  });
  transport.on("reconnecting", () => reconnecting++);
  t.mock.timers.enable({ apis: ["setTimeout"] });

  const connected = transport.connect();
  sockets[0]!.fire("open");
  await connected;
  sockets[0]!.fire("close", { code: 1008, reason: "policy" });
  assert.equal(sockets.length, 1, "policy failures must not be retried");
  assert.equal(reconnecting, 0);

  const retrying = createSession("wss://example.test/v1", {
    logger: NOOP_LOGGER,
    socketFactory: () => {
      const socket = new FakeSocket();
      sockets.push(socket);
      return socket;
    },
    backoff: { baseMs: 0, capMs: 0 },
    reconnect: { maxAttempts: 1, stableConnectionMs: 0 },
  });
  const retryConnected = retrying.connect();
  sockets[1]!.fire("open");
  await retryConnected;
  sockets[1]!.fire("close");
  t.mock.timers.tick(0);
  assert.equal(sockets.length, 3, "one bounded retry is allowed");
  sockets[2]!.fire("close");
  assert.equal(sockets.length, 3, "the retry budget is terminal");
  retrying.close();
  transport.close();
});

test("shouldReconnect receives close metadata before retrying", async (t) => {
  const sockets: FakeSocket[] = [];
  const contexts: Array<{ closeCode?: number; closeReason?: string; opened: boolean }> = [];
  const transport = createSession("wss://example.test/v1", {
    logger: NOOP_LOGGER,
    socketFactory: () => {
      const socket = new FakeSocket();
      sockets.push(socket);
      return socket;
    },
    backoff: { baseMs: 0, capMs: 0 },
    reconnect: {
      stableConnectionMs: 0,
      shouldReconnect: (context) => {
        contexts.push({ closeCode: context.closeCode, closeReason: context.closeReason, opened: context.opened });
        return false;
      },
    },
  });
  t.mock.timers.enable({ apis: ["setTimeout"] });

  const connected = transport.connect();
  sockets[0]!.fire("open");
  await connected;
  sockets[0]!.fire("close", { code: 4009, reason: "session expired" });

  assert.deepEqual(contexts, [{ closeCode: 4009, closeReason: "session expired", opened: true }]);
  assert.equal(sockets.length, 1);
  transport.close();
});

test("reconnect backoff resets only after stable uptime", async (t) => {
  const sockets: FakeSocket[] = [];
  const transport = createSession("wss://example.test/v1", {
    logger: NOOP_LOGGER,
    socketFactory: () => {
      const socket = new FakeSocket();
      sockets.push(socket);
      return socket;
    },
    backoff: { baseMs: 100, capMs: 100 },
    random: () => 1,
    reconnect: { stableConnectionMs: 1_000 },
  });
  t.mock.timers.enable({ apis: ["setTimeout"] });

  const connected = transport.connect();
  sockets[0]!.fire("open");
  await connected;
  sockets[0]!.fire("close");
  t.mock.timers.tick(0);
  sockets[1]!.fire("open");
  sockets[1]!.fire("close");
  t.mock.timers.tick(99);
  assert.equal(sockets.length, 2, "a flap before stable uptime keeps the backoff");
  t.mock.timers.tick(1);
  assert.equal(sockets.length, 3);
  sockets[2]!.fire("open");
  t.mock.timers.tick(1_000);
  sockets[2]!.fire("close");
  t.mock.timers.tick(0);
  assert.equal(sockets.length, 4, "stable uptime resets the next reconnect to immediate");
  transport.close();
});

test("connect() settles when the socket factory throws synchronously", async () => {
  const transport = createSession("wss://example.test/v1", {
    logger: NOOP_LOGGER,
    socketFactory: () => { throw new Error("factory failed"); },
  });

  await assert.rejects(transport.connect(), (error: BoundaryValue) =>
    error instanceof ConnectionError && error.cause instanceof Error && error.cause.message === "factory failed",
  );
  transport.close();
});

test("late events from a superseded socket are ignored after reconnect", async (t) => {
  const sockets: FakeSocket[] = [];
  const transport = createSession("wss://example.test/v1", {
    logger: NOOP_LOGGER,
    socketFactory: () => {
      const s = new FakeSocket();
      sockets.push(s);
      return s;
    },
    backoff: { baseMs: 100, capMs: 400, factor: 2 },
  });

  t.mock.timers.enable({ apis: ["setTimeout"] });

  let messages = 0;
  let reconnecting = 0;
  transport.on("message", () => {
    messages++;
  });
  transport.on("reconnecting", () => {
    reconnecting++;
  });

  const connected = transport.connect();
  sockets[0].fire("open");
  await connected;

  sockets[0].fire("close"); // drop → reconnect scheduled (reconnecting == 1)
  t.mock.timers.tick(0); // sockets[1] created
  sockets[1].fire("open"); // reconnected; current socket is now sockets[1]

  // The old, superseded socket coughs up a late frame and a second close.
  sockets[0].fire("message", { data: '{"stale":true}' });
  sockets[0].fire("close");

  assert.equal(messages, 0, "a stale frame from the old socket must not be emitted");
  assert.equal(reconnecting, 1, "the old socket's second close must not schedule another reconnect");
});
