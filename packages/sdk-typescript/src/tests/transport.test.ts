import test from "node:test";
import assert from "node:assert/strict";

import { WsTransport, type SocketLike } from "../transport.js";
import { NoopLogger } from "../logging.js";
import { ConnectionError, SdkError } from "../errors.js";
import { FakeSocket } from "./fake-socket.js";


type CapturedSocketFactoryOptions = { headers?: Record<string, string> };

test("connect() resolves once the socket opens and emits 'open'", async () => {
  const fake = new FakeSocket();
  const transport = new WsTransport("wss://example.test/v1", {
    logger: new NoopLogger(),
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

test("WebSocket diagnostics omit URL credentials and query parameters", async () => {
  const fake = new FakeSocket();
  const events: unknown[] = [];
  const transport = new WsTransport("wss://client:secret@example.test/v1?token=private#fragment", {
    logger: new NoopLogger(),
    onDiagnostic: (event) => events.push(event),
    socketFactory: () => fake,
  });

  const connected = transport.connect();
  fake.fire("open");
  await connected;

  assert.equal(JSON.stringify(events).includes("secret"), false);
  assert.equal(JSON.stringify(events).includes("private"), false);
  assert.equal((events[0] as { metadata?: { url?: string } }).metadata?.url, "wss://example.test/v1");
});

test("incoming frame is emitted as a lossless-parsed 'message' (big id stays bigint)", async () => {
  const fake = new FakeSocket();
  const transport = new WsTransport("wss://example.test/v1", {
    logger: new NoopLogger(),
    socketFactory: () => fake,
  });

  let received: unknown;
  transport.on("message", (msg: unknown) => {
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
  const transport = new WsTransport("wss://example.test/v1", {
    logger: new NoopLogger(),
    socketFactory: () => fake,
  });

  const errors: unknown[] = [];
  transport.on("error", (err: unknown) => {
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
  const transport = new WsTransport("wss://example.test/v1", {
    logger: new NoopLogger(),
    socketFactory: () => fake,
  });
  const errors: unknown[] = [];
  transport.on("error", (err: unknown) => errors.push(err));

  const connected = transport.connect();
  fake.fire("open");
  await connected;
  fake.fire("message", { data: new TextEncoder().encode("{}") });

  assert.equal(errors.length, 1);
  assert.ok(errors[0] instanceof ConnectionError);
  assert.match((errors[0] as Error).message, /must be a string/);
  assert.equal(fake.closed, true);
  transport.close();
});

test("socket close errors expose cause, close metadata, and whether it opened", async () => {
  const fake = new FakeSocket();
  const transport = new WsTransport("wss://example.test/v1", {
    logger: new NoopLogger(),
    socketFactory: () => fake,
    backoff: { baseMs: 100, capMs: 100, factor: 2 },
  });
  const errors: unknown[] = [];
  transport.on("error", (error) => errors.push(error));
  const connected = transport.connect();
  fake.fire("open");
  await connected;

  fake.fire("close", { code: 4001, reason: "expired" });

  assert.equal((errors[0] as ConnectionError).opened, true);
  assert.equal((errors[0] as ConnectionError).closeCode, 4001);
  assert.equal((errors[0] as ConnectionError).closeReason, "expired");
  transport.close();
});

test("socket error events preserve their underlying cause", async () => {
  const fake = new FakeSocket();
  const transport = new WsTransport("wss://example.test/v1", { socketFactory: () => fake });
  const errors: unknown[] = [];
  transport.on("error", (error) => errors.push(error));
  const connected = transport.connect();
  fake.fire("open");
  await connected;

  const cause = new Error("network reset");
  fake.fire("error", { error: cause });

  assert.equal((errors[0] as ConnectionError).cause, cause);
  transport.close();
});

test("oversized inbound messages are rejected before parsing", async () => {
  const fake = new FakeSocket();
  const transport = new WsTransport("wss://example.test/v1", {
    logger: new NoopLogger(),
    socketFactory: () => fake,
    maxMessageSizeBytes: 4,
  });
  const messages: unknown[] = [];
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
  const transport = new WsTransport("wss://example.test/v1", {
    logger: new NoopLogger(),
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

test("subscribe(sub) sends the subscription as a serialized frame", async () => {
  const fake = new FakeSocket();
  const transport = new WsTransport("wss://example.test/v1", {
    logger: new NoopLogger(),
    socketFactory: () => fake,
  });

  const connected = transport.connect();
  fake.fire("open");
  await connected;

  const sub = { type: "subscribe", subscriptions: [{ name: "l2", symbols: ["BTCUSD"] }] };
  transport.subscribe(sub);

  assert.equal(fake.sent.length, 1, "subscribe must send exactly one frame");
  assert.deepEqual(JSON.parse(fake.sent[0]), sub, "frame must be the serialized sub");
});

test("socketFactory receives connection headers", () => {
  let received: CapturedSocketFactoryOptions | undefined;
  const transport = new WsTransport("wss://example.test/v1", {
    logger: new NoopLogger(),
    headers: { Authorization: "Bearer token" },
    socketFactory: (_url, options) => {
      received = options;
      return new FakeSocket();
    },
  });

  void transport.connect();

  assert.deepEqual(received, { headers: { Authorization: "Bearer token" } });
  transport.close();
});

test("send(frame) fails loud before the socket opens", () => {
  const transport = new WsTransport("wss://example.test/v1", {
    logger: new NoopLogger(),
    socketFactory: () => new FakeSocket(),
  });

  assert.throws(() => transport.send({ id: 1, method: "ping" }), SdkError);
});

test("send(frame) sends a one-shot frame that is not replayed on reconnect", async (t) => {
  const sockets: FakeSocket[] = [];
  const transport = new WsTransport("wss://example.test/v1", {
    logger: new NoopLogger(),
    socketFactory: () => {
      const socket = new FakeSocket();
      sockets.push(socket);
      return socket;
    },
  });
  t.mock.timers.enable({ apis: ["setTimeout"] });

  const connected = transport.connect();
  sockets[0].fire("open");
  await connected;

  transport.send({ id: 1, method: "ping" });
  transport.subscribe({ id: 2, method: "SUBSCRIBE", params: ["btcusd@trade"] });

  sockets[0].fire("close");
  t.mock.timers.tick(0);
  sockets[1].fire("open");

  assert.deepEqual(sockets[0].sent.map((frame) => JSON.parse(frame)), [
    { id: 1, method: "ping" },
    { id: 2, method: "SUBSCRIBE", params: ["btcusd@trade"] },
  ]);
  assert.deepEqual(sockets[1].sent.map((frame) => JSON.parse(frame)), [
    { id: 2, method: "SUBSCRIBE", params: ["btcusd@trade"] },
  ]);
});

test("reconnect() closes the live socket and replays every durable subscription exactly once", async (t) => {
  const sockets: FakeSocket[] = [];
  const transport = new WsTransport("wss://example.test/v1", {
    logger: new NoopLogger(),
    socketFactory: () => {
      const socket = new FakeSocket();
      sockets.push(socket);
      return socket;
    },
  });

  t.mock.timers.enable({ apis: ["setTimeout"] });
  const connected = transport.connect();
  sockets[0].fire("open");
  await connected;

  const btc = { id: 1, method: "SUBSCRIBE", params: ["btcusd@depth"] };
  const eth = { id: 2, method: "SUBSCRIBE", params: ["ethusd@depth"] };
  transport.subscribe(btc);
  transport.subscribe(eth);

  transport.reconnect();
  assert.equal(sockets[0].closed, true, "restart closes the current socket");
  sockets[0].fire("close");
  t.mock.timers.tick(0);
  sockets[1].fire("open");
  assert.deepEqual(
    sockets[1].sent.map((frame) => JSON.parse(frame)),
    [btc, eth],
    "every durable subscription replays once on the fresh socket",
  );
});

test("reconnect() drops frames from the closing socket before its close event", async () => {
  const socket = new FakeSocket();
  const transport = new WsTransport("wss://example.test/v1", {
    logger: new NoopLogger(),
    socketFactory: () => socket,
  });
  const messages: unknown[] = [];
  transport.on("message", (frame) => messages.push(frame));

  const connected = transport.connect();
  socket.fire("open");
  await connected;

  transport.reconnect();
  socket.fire("message", { data: '{"stale":true}' });

  assert.deepEqual(messages, [], "the socket is stale as soon as restart begins");
});

test("unsubscribe() removes only that durable subscription from reconnect replay", async (t) => {
  const sockets: FakeSocket[] = [];
  const transport = new WsTransport("wss://example.test/v1", {
    logger: new NoopLogger(),
    socketFactory: () => {
      const socket = new FakeSocket();
      sockets.push(socket);
      return socket;
    },
  });
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const connected = transport.connect();
  sockets[0].fire("open");
  await connected;

  const btc = { id: 1, method: "SUBSCRIBE", params: ["btcusd@depth"] };
  const eth = { id: 2, method: "SUBSCRIBE", params: ["ethusd@depth"] };
  transport.subscribe(btc);
  transport.subscribe(eth);
  transport.unsubscribe(btc);

  transport.reconnect();
  sockets[0].fire("close");
  t.mock.timers.tick(0);
  sockets[1].fire("open");

  assert.deepEqual(sockets[1].sent.map((frame) => JSON.parse(frame)), [eth]);
});

test("an unexpected drop announces 'reconnecting' and opens a fresh socket immediately", async (t) => {
  const sockets: FakeSocket[] = [];
  const transport = new WsTransport("wss://example.test/v1", {
    logger: new NoopLogger(),
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

test("remembered subscriptions are replayed on reconnect", async (t) => {
  const sockets: FakeSocket[] = [];
  const transport = new WsTransport("wss://example.test/v1", {
    logger: new NoopLogger(),
    socketFactory: () => {
      const s = new FakeSocket();
      sockets.push(s);
      return s;
    },
  });

  t.mock.timers.enable({ apis: ["setTimeout"] });

  const connected = transport.connect();
  sockets[0].fire("open");
  await connected;

  const sub = { type: "subscribe", subscriptions: [{ name: "l2", symbols: ["BTCUSD"] }] };
  transport.subscribe(sub);
  assert.equal(sockets[0].sent.length, 1, "sent live on the open socket");

  sockets[0].fire("close"); // drop
  t.mock.timers.tick(0); // reconnect
  sockets[1].fire("open"); // fresh socket — exchange has forgotten our subs

  assert.equal(sockets[1].sent.length, 1, "sub must be replayed on the new socket");
  assert.deepEqual(JSON.parse(sockets[1].sent[0]), sub);
});

// Reconnect a transport whose sockets never open, driving repeated failures.
// random:()=>1 makes equal-jitter contribute its max, so delay === the exact
// base value — lets us assert cadence boundaries precisely.
function makeFlappy(t: { mock: { timers: { enable(o: unknown): void } } }) {
  const sockets: FakeSocket[] = [];
  const transport = new WsTransport("wss://example.test/v1", {
    logger: new NoopLogger(),
    socketFactory: () => {
      const s = new FakeSocket();
      sockets.push(s);
      return s;
    },
    backoff: { baseMs: 100, capMs: 400, factor: 2 },
    random: () => 1,
  });
  t.mock.timers.enable({ apis: ["setTimeout"] });
  return { sockets, transport };
}

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

test("jitter collapses the delay to its floor (raw/2) when random is low", async (t) => {
  const sockets: FakeSocket[] = [];
  const transport = new WsTransport("wss://example.test/v1", {
    logger: new NoopLogger(),
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
  const transport = new WsTransport("wss://example.test/v1", {
    logger: new NoopLogger(),
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
  const transport = new WsTransport("wss://example.test/v1", {
    logger: new NoopLogger(),
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
  const transport = new WsTransport("wss://example.test/v1", {
    logger: new NoopLogger(),
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

test("close() before the socket opens unblocks a pending connect()", { timeout: 2000 }, async () => {
  const fake = new FakeSocket();
  const transport = new WsTransport("wss://example.test/v1", {
    logger: new NoopLogger(),
    socketFactory: () => fake,
  });

  let resolved = false;
  const connected = transport.connect().then(() => {
    resolved = true;
  });

  transport.close(); // caller shuts down before the first 'open' ever arrives
  await connected; // hangs forever (test times out) if connect() never settles

  assert.ok(resolved, "connect() must settle when closed before it opens");
});

test("connect() called twice fails loud instead of starting a second connection", async () => {
  const sockets: FakeSocket[] = [];
  const transport = new WsTransport("wss://example.test/v1", {
    logger: new NoopLogger(),
    socketFactory: () => {
      const s = new FakeSocket();
      sockets.push(s);
      return s;
    },
  });

  const connected = transport.connect();
  sockets[0].fire("open");
  await connected;

  assert.throws(() => transport.connect(), SdkError, "second connect() must throw");
  assert.equal(sockets.length, 1, "no orphaned second socket");
});

test("connect() rejects when its caller aborts", async () => {
  const fake = new FakeSocket();
  const transport = new WsTransport("wss://example.test/v1", {
    logger: new NoopLogger(),
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
  const transport = new WsTransport("wss://example.test/v1", {
    logger: new NoopLogger(),
    socketFactory: () => fake,
  });
  t.mock.timers.enable({ apis: ["setTimeout"] });

  const connected = transport.connect({ timeoutMs: 10 });
  t.mock.timers.tick(10);

  await assert.rejects(connected, /deadline/);
  transport.close();
});

test("connect() settles when the socket factory throws synchronously", async () => {
  const transport = new WsTransport("wss://example.test/v1", {
    logger: new NoopLogger(),
    socketFactory: () => { throw new Error("factory failed"); },
  });

  await assert.rejects(transport.connect(), (error: unknown) =>
    error instanceof ConnectionError && (error.cause as Error | undefined)?.message === "factory failed",
  );
  transport.close();
});

test("late events from a superseded socket are ignored after reconnect", async (t) => {
  const sockets: FakeSocket[] = [];
  const transport = new WsTransport("wss://example.test/v1", {
    logger: new NoopLogger(),
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
