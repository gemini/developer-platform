import test, { describe } from "node:test";
import assert from "node:assert/strict";

import { WebSocketSession } from "./session.js";
import { createServerWebSocketAuthHeaders } from "./auth.js";
import { serializeError, SdkError, WebSocketRequestError } from "../errors.js";
import type { AuthStrategy } from "../transport/http.js";
import type { BoundaryValue } from "../utils/boundary-value.js";
import type { DiagnosticEvent, DiagnosticListener } from "../observability/diagnostics.js";
import { FakeSocket } from "../tests/support/fake-socket.js";
import { createFakeClock, createWebSocketHarness } from "../tests/support/ws-harness.js";


function harness(opts?: { auth?: AuthStrategy; timeoutMs?: number; liveness?: { intervalMs?: number; timeoutMs?: number }; onDiagnostic?: DiagnosticListener }) {
  const socketHarness = createWebSocketHarness();
  const session = new WebSocketSession({
    url: "wss://example.test",
    headersFactory: opts?.auth ? () => createServerWebSocketAuthHeaders(opts.auth!) : undefined,
    timeoutMs: opts?.timeoutMs,
    liveness: opts?.liveness,
    reconnect: { stableConnectionMs: 0 },
    onDiagnostic: opts?.onDiagnostic,
    socketFactory: socketHarness.socketFactory,
  });
  return { session, ...socketHarness };
}

async function open(session: WebSocketSession, sockets: FakeSocket[]): Promise<void> {
  const connected = session.connect();
  if (!sockets[0]) await new Promise<void>((resolve) => setImmediate(resolve));
  sockets[0].fire("open");
  await connected;
}

test("request() sends one frame with a generated id and resolves the matching response", async () => {
  const { session, sockets } = harness();
  const request = session.request({ method: "ping" });
  sockets[0].fire("open");
  await Promise.resolve();

  assert.deepEqual(JSON.parse(sockets[0].sent[0]), { id: 1, method: "ping" });
  sockets[0].fire("message", { data: '{"id":1,"status":200,"result":{"pong":true}}' });

  assert.deepEqual(await request, { id: 1, status: 200, result: { pong: true } });
  session.close();
});

test("request() serializes bigint parameters without losing integer precision", async () => {
  const { session, sockets } = harness();
  const request = session.request({
    method: "rfq.submit_quote",
    params: { rfqId: "rfq-1", price: "1", quantity: "2", validUntil: 9007199254740993n },
  });
  sockets[0].fire("open");
  await Promise.resolve();

  assert.equal(
    sockets[0].sent[0],
    '{"method":"rfq.submit_quote","params":{"rfqId":"rfq-1","price":"1","quantity":"2","validUntil":9007199254740993},"id":1}',
  );
  sockets[0].fire("message", { data: '{"id":1,"status":200}' });
  await request;
  session.close();
});

test("request() rejects a matching error response", async () => {
  const { session, sockets } = harness();
  const request = session.request({ method: "ping" });
  sockets[0].fire("open");
  await Promise.resolve();
  sockets[0].fire("message", { data: '{"id":1,"status":400,"error":{"code":-1002,"msg":"bad"}}' });

  await assert.rejects(request, SdkError);
  session.close();
});

test("request() preserves the full server error payload and normalized fields", async () => {
  const { session, sockets } = harness();
  const request = session.request({ method: "ping" });
  sockets[0].fire("open");
  await Promise.resolve();
  const payload = { error: { code: -1002, msg: "bad parameters" }, result: { field: "symbol" } };
  sockets[0].fire("message", { data: JSON.stringify({ id: 1, status: 400, ...payload }) });

  await assert.rejects(request, (error: BoundaryValue) => {
    assert.ok(error instanceof WebSocketRequestError);
    assert.equal(error.status, 400);
    assert.equal(error.reason, "bad parameters");
    assert.equal(error.serverCode, -1002);
    assert.equal(serializeError(error).body, undefined);
    assert.deepEqual(serializeError(error, { includeRawBody: true }).body, { id: 1, status: 400, ...payload });
    return true;
  });
  session.close();
});

test("request() rejects when its deadline expires", async (t) => {
  const { session, sockets } = harness();
  const clock = createFakeClock(t);
  const request = session.request({ method: "ping" }, { timeoutMs: 10 });
  sockets[0].fire("open");
  await Promise.resolve();

  clock.tick(10);

  await assert.rejects(request, /deadline/);
  session.close();
});

test("connect() aborts pending WebSocket credential generation", async (t) => {
  let credentialSignal: AbortSignal | undefined;
  const session = new WebSocketSession({
    url: "wss://example.test",
    timeoutMs: 10,
    headersFactory: async (options) => {
      credentialSignal = options?.signal;
      return new Promise<Record<string, string>>(() => {});
    },
    socketFactory: () => new FakeSocket(),
  });
  t.mock.timers.enable({ apis: ["setTimeout"] });

  const connected = session.connect();
  await Promise.resolve();
  t.mock.timers.tick(10);

  await assert.rejects(connected, /deadline/);
  assert.ok(credentialSignal);
  assert.equal(credentialSignal.aborted, true);
  session.close();
});

test("connect() preserves caller cancellation when the session is already open", async () => {
  const { session, sockets } = harness();
  await open(session, sockets);

  const controller = new AbortController();
  controller.abort();
  await assert.rejects(session.connect({ signal: controller.signal }), /aborted/);
  session.close();
});

test("connect() preserves caller deadlines when joining an in-flight connection", async (t) => {
  const { session, sockets } = harness();
  t.mock.timers.enable({ apis: ["setTimeout"] });

  const initial = session.connect({ timeoutMs: 100 });
  const joined = session.connect({ timeoutMs: 10 });
  t.mock.timers.tick(10);
  await assert.rejects(joined, /deadline/);

  sockets[0].fire("open");
  await initial;
  session.close();
});

test("subscribe() timeout removes replay state and unsubscribes after the request was sent", async (t) => {
  const { session, sockets } = harness();
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const subscription = session.subscribe(["btcusd@trade"], { timeoutMs: 10 });
  sockets[0].fire("open");
  await Promise.resolve();

  t.mock.timers.tick(10);

  await assert.rejects(subscription.ready, /deadline/);
  assert.deepEqual(sockets[0].sent.map((frame) => JSON.parse(frame)), [
    { id: 1, method: "SUBSCRIBE", params: ["btcusd@trade"] },
    { id: 2, method: "UNSUBSCRIBE", params: ["btcusd@trade"] },
  ]);
  session.close();
});

test("opt-in liveness watchdog pings and reconnects after a missed response", async (t) => {
  const { session, sockets } = harness({ liveness: { intervalMs: 10, timeoutMs: 5 } });
  t.mock.timers.enable({ apis: ["setTimeout"] });
  await open(session, sockets);

  t.mock.timers.tick(10);
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.deepEqual(JSON.parse(sockets[0].sent[0]), { id: 1, method: "ping" });

  t.mock.timers.tick(5);
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(sockets[0].closed, true);
  session.close();
});

test("request() rejects duplicate ids without replacing pending subscriptions", async () => {
  const { session, sockets } = harness();
  const sub = session.subscribe(["btcusd@trade"]);
  sockets[0].fire("open");
  await Promise.resolve();

  await assert.rejects(session.request({ id: 1, method: "ping" }), /id 1 is already pending/);
  assert.deepEqual(sockets[0].sent.map((frame) => JSON.parse(frame)), [{
    id: 1,
    method: "SUBSCRIBE",
    params: ["btcusd@trade"],
  }]);

  sockets[0].fire("message", { data: '{"id":1,"status":200}' });
  await sub.ready;
  session.close();
});

test("stream frames are emitted as message events and do not resolve pending requests", async () => {
  const { session, sockets } = harness();
  const frames: BoundaryValue[] = [];
  session.on("message", (frame) => frames.push(frame));
  const request = session.request({ method: "ping" });
  sockets[0].fire("open");
  await Promise.resolve();

  sockets[0].fire("message", { data: '{"e":"trade","s":"btcusd"}' });
  assert.deepEqual(frames, [{ e: "trade", s: "btcusd" }]);

  sockets[0].fire("message", { data: '{"id":1,"status":200}' });
  await request;
  session.close();
});

test("close() rejects pending requests", async () => {
  const { session, sockets } = harness();
  const request = session.request({ method: "ping" });
  sockets[0].fire("open");
  await Promise.resolve();

  session.close();

  await assert.rejects(request, /WebSocket session closed/);
});

test("close() rejects pending durable subscriptions and one-shot requests", async () => {
  const { session, sockets } = harness();
  const subscription = session.subscribe(["btcusd@trade"]);
  const request = session.request({ method: "ping" });
  sockets[0].fire("open");
  await Promise.resolve();

  session.close();

  await assert.rejects(subscription.ready, /WebSocket session closed/);
  await assert.rejects(request, /WebSocket session closed/);
});

describe("reconnect diagnostics", () => {
  test("reconnecting rejects in-flight method requests", async (t) => {
    const { session, sockets } = harness();
    t.mock.timers.enable({ apis: ["setTimeout"] });
    const request = session.request({ method: "ping" });
    sockets[0].fire("open");
    await Promise.resolve();

    sockets[0].fire("close");

    await assert.rejects(request, /WebSocket session reconnecting/);
    session.close();
  });

  test("explicit reconnect fences the intentional close from transport failures", async (t) => {
    const events: DiagnosticEvent[] = [];
    const { session, sockets } = harness({ onDiagnostic: (event) => events.push(event) });
    t.mock.timers.enable({ apis: ["setTimeout"] });
    await open(session, sockets);

    session.reconnect(0);
    sockets[0].fire("close");
    assert.equal(events.filter((event) => event.name === "ws.close.failure").length, 0);
    assert.equal(events.filter((event) => event.name === "ws.reconnect").length, 1);

    t.mock.timers.tick(0);
    sockets[1].fire("open");
    await Promise.resolve();
    assert.equal(events.filter((event) => event.name === "ws.open").length, 2);
    session.close();
  });

  test("explicit reconnect fences the old socket while replacement headers are pending", async (t) => {
    const events: DiagnosticEvent[] = [];
    const socketHarness = createWebSocketHarness();
    let releaseHeaders!: (headers: Record<string, string>) => void;
    let headerCalls = 0;
    const session = new WebSocketSession({
      url: "wss://example.test",
      headersFactory: async () => {
        headerCalls++;
        if (headerCalls === 1) return {};
        return new Promise((resolve) => { releaseHeaders = resolve; });
      },
      onDiagnostic: (event) => events.push(event),
      socketFactory: socketHarness.socketFactory,
    });
    t.mock.timers.enable({ apis: ["setTimeout"] });

    const connected = session.connect();
    await new Promise<void>((resolve) => setImmediate(resolve));
    socketHarness.sockets[0]!.fire("open");
    await connected;

    session.reconnect(0);
    t.mock.timers.tick(0);
    await new Promise<void>((resolve) => setImmediate(resolve));
    socketHarness.sockets[0]!.fire("close");

    assert.equal(events.filter((event) => event.name === "ws.close.failure").length, 0);
    assert.equal(events.filter((event) => event.name === "ws.reconnect").length, 1);

    releaseHeaders({});
    await new Promise<void>((resolve) => setImmediate(resolve));
    socketHarness.sockets[1]!.fire("open");
    await Promise.resolve();
    assert.equal(events.filter((event) => event.name === "ws.open").length, 2);
    session.close();
  });
});

test("connect() during reconnect waits for the fresh socket", async (t) => {
  const { session, sockets } = harness();
  t.mock.timers.enable({ apis: ["setTimeout"] });
  await open(session, sockets);

  sockets[0].fire("close");
  let settled = false;
  const reconnected = session.connect().then(() => {
    settled = true;
  });

  await Promise.resolve();
  assert.equal(settled, false, "connect() must not resolve during reconnect backoff");

  t.mock.timers.tick(0);
  sockets[1].fire("open");
  await reconnected;
  assert.equal(settled, true);
  session.close();
});

test("new method requests during reconnect reject with a stable reconnect error", async (t) => {
  const { session, sockets } = harness();
  t.mock.timers.enable({ apis: ["setTimeout"] });
  await open(session, sockets);

  sockets[0].fire("close");
  await assert.rejects(session.request({ method: "ping" }), /WebSocket session reconnecting/);
  session.close();
});

test("a pending durable subscription survives reconnect and resolves on the replay ack", async (t) => {
  const { session, sockets } = harness();
  t.mock.timers.enable({ apis: ["setTimeout"] });
  await open(session, sockets);

  const sub = session.subscribe(["btcusd@trade"]);
  await Promise.resolve();
  sockets[0].fire("close");
  t.mock.timers.tick(0);
  sockets[1].fire("open");

  assert.deepEqual(sockets[1].sent.map((frame) => JSON.parse(frame)), [{
    id: 1,
    method: "SUBSCRIBE",
    params: ["btcusd@trade"],
  }]);
  sockets[1].fire("message", { data: '{"id":1,"status":200}' });

  await sub.ready;
  session.close();
});

test("replayed subscriptions emit success and rejection separately from initial ready", async (t) => {
  const { session, sockets } = harness();
  t.mock.timers.enable({ apis: ["setTimeout"] });
  await open(session, sockets);

  const events: string[] = [];
  session.on("resubscribed", () => events.push("resubscribed"));
  session.on("subscriptionError", () => events.push("subscriptionError"));
  const sub = session.subscribe(["btcusd@trade"]);
  await Promise.resolve();
  sockets[0].fire("message", { data: '{"id":1,"status":200}' });
  await sub.ready;

  sockets[0].fire("close");
  t.mock.timers.tick(0);
  sockets[1].fire("open");
  sockets[1].fire("message", { data: '{"id":1,"status":400,"error":{"code":-1,"msg":"rejected"}}' });

  assert.deepEqual(events, ["subscriptionError"]);
  session.close();
});

test("a rejected replay is not sent on a later reconnect", async (t) => {
  const { session, sockets } = harness();
  t.mock.timers.enable({ apis: ["setTimeout"] });
  await open(session, sockets);

  const sub = session.subscribe(["btcusd@trade"]);
  await Promise.resolve();
  sockets[0].fire("message", { data: '{"id":1,"status":200}' });
  await sub.ready;

  sockets[0].fire("close");
  t.mock.timers.tick(0);
  sockets[1].fire("open");
  sockets[1].fire("message", { data: '{"id":1,"status":400,"error":{"code":-1,"msg":"rejected"}}' });

  sockets[1].fire("close");
  t.mock.timers.tick(0);
  sockets[2].fire("open");

  assert.deepEqual(sockets[2].sent, []);
  session.close();
});

test("reconnect rejects method requests while retaining a pending subscription", async (t) => {
  const { session, sockets } = harness();
  t.mock.timers.enable({ apis: ["setTimeout"] });
  await open(session, sockets);

  const sub = session.subscribe(["btcusd@trade"]);
  const request = session.request({ method: "ping" });
  await Promise.resolve();
  sockets[0].fire("close");

  await assert.rejects(request, /WebSocket session reconnecting/);
  t.mock.timers.tick(0);
  sockets[1].fire("open");
  assert.deepEqual(sockets[1].sent.map((frame) => JSON.parse(frame)), [{
    id: 1,
    method: "SUBSCRIBE",
    params: ["btcusd@trade"],
  }]);
  sockets[1].fire("message", { data: '{"id":1,"status":200}' });
  await sub.ready;
  session.close();
});

test("malformed transport errors reject method requests without destroying pending subscriptions", async () => {
  const { session, sockets } = harness();
  await open(session, sockets);

  const sub = session.subscribe(["btcusd@trade"]);
  const request = session.request({ method: "ping" });
  await Promise.resolve();
  sockets[0].fire("message", { data: "not-json" });

  await assert.rejects(request, /malformed WebSocket frame/);
  sockets[0].fire("message", { data: '{"id":1,"status":200}' });
  await sub.ready;
  session.close();
});

test("subscribe() sends a durable SUBSCRIBE, resolves ready on ack, and replays on reconnect", async (t) => {
  const { session, sockets } = harness();
  t.mock.timers.enable({ apis: ["setTimeout"] });
  await open(session, sockets);

  const sub = session.subscribe(["btcusd@trade"]);
  await Promise.resolve();
  assert.deepEqual(JSON.parse(sockets[0].sent[0]), {
    id: 1,
    method: "SUBSCRIBE",
    params: ["btcusd@trade"],
  });
  sockets[0].fire("message", { data: '{"id":1,"status":200}' });
  await sub.ready;

  sockets[0].fire("close");
  t.mock.timers.tick(0);
  sockets[1].fire("open");

  assert.deepEqual(sockets[1].sent.map((frame) => JSON.parse(frame)), [{
    id: 1,
    method: "SUBSCRIBE",
    params: ["btcusd@trade"],
  }]);
  session.close();
});

test("replays every active durable subscription exactly once across repeated reconnects", async (t) => {
  const { session, sockets } = harness();
  t.mock.timers.enable({ apis: ["setTimeout"] });
  await open(session, sockets);

  const first = session.subscribe(["btcusd@trade"]);
  const second = session.subscribe(["ethusd@trade"]);
  await Promise.resolve();
  sockets[0].fire("message", { data: '{"id":1,"status":200}' });
  sockets[0].fire("message", { data: '{"id":2,"status":200}' });
  await Promise.all([first.ready, second.ready]);

  for (let cycle = 1; cycle <= 5; cycle++) {
    const previous = sockets.length - 1;
    sockets[previous].fire("close");
    t.mock.timers.tick(0);
    sockets[previous + 1].fire("open");

    assert.deepEqual(
      sockets[previous + 1].sent.map((frame) => JSON.parse(frame)),
      [
        { id: 1, method: "SUBSCRIBE", params: ["btcusd@trade"] },
        { id: 2, method: "SUBSCRIBE", params: ["ethusd@trade"] },
      ],
      `reconnect ${cycle} should replay each subscription once`,
    );
    sockets[previous + 1].fire("message", { data: '{"id":1,"status":200}' });
    sockets[previous + 1].fire("message", { data: '{"id":2,"status":200}' });
  }

  session.close();
});

test("subscription close removes durable replay and sends UNSUBSCRIBE", async (t) => {
  const { session, sockets } = harness();
  t.mock.timers.enable({ apis: ["setTimeout"] });
  await open(session, sockets);

  const sub = session.subscribe(["btcusd@trade"]);
  await Promise.resolve();
  sockets[0].fire("message", { data: '{"id":1,"status":200}' });
  await sub.ready;

  const closed = sub.close();
  await Promise.resolve();
  assert.deepEqual(JSON.parse(sockets[0].sent[1]), {
    id: 2,
    method: "UNSUBSCRIBE",
    params: ["btcusd@trade"],
  });
  sockets[0].fire("message", { data: '{"id":2,"status":200}' });
  await closed;

  sockets[0].fire("close");
  t.mock.timers.tick(0);
  sockets[1].fire("open");

  assert.deepEqual(sockets[1].sent, []);
  session.close();
});

test("subscription close during reconnect resolves without retaining unsubscribe state", async (t) => {
  const { session, sockets } = harness();
  t.mock.timers.enable({ apis: ["setTimeout"] });
  await open(session, sockets);

  const sub = session.subscribe(["btcusd@trade"]);
  await Promise.resolve();
  sockets[0].fire("message", { data: '{"id":1,"status":200}' });
  await sub.ready;
  sockets[0].fire("close");

  const closed = sub.close();
  await closed;
  t.mock.timers.tick(0);
  sockets[1].fire("open");

  assert.deepEqual(sockets[1].sent, []);
  session.close();
});

test("subscription close before subscribe send rejects ready and sends no unsubscribe", async () => {
  const { session, sockets } = harness();
  const sub = session.subscribe(["btcusd@trade"]);

  await sub.close();

  await assert.rejects(sub.ready, /subscription closed before acknowledgement/);
  assert.deepEqual(sockets[0].sent, []);
  session.close();
});

test("close() before subscribe ack rejects subscription readiness", async () => {
  const { session } = harness();
  const sub = session.subscribe(["btcusd@trade"]);

  session.close();

  await assert.rejects(sub.ready, /WebSocket session closed/);
});

test("close() before the socket opens rejects the pending connection", async () => {
  const { session } = harness();
  const connected = session.connect();

  session.close();

  await assert.rejects(connected, /WebSocket session closed/);
});

test("authenticated reconnects generate fresh upgrade headers", async (t) => {
  let nonce = 1700000000;
  const auth: AuthStrategy = {
    nextNonce: () => String(nonce++),
    credentialHeaders: async (payloadBase64) => ({
      "X-GEMINI-APIKEY": "key",
      "X-GEMINI-SIGNATURE": `sig:${payloadBase64}`,
    }),
  };
  const { session, sockets, options } = harness({ auth });
  t.mock.timers.enable({ apis: ["setTimeout"] });

  await open(session, sockets);
  sockets[0].fire("close");
  t.mock.timers.tick(0);
  await new Promise<void>((resolve) => setImmediate(resolve));

  assert.equal(sockets.length, 2);
  assert.equal(options[0].headers?.["X-GEMINI-NONCE"], "1700000000");
  assert.equal(options[1].headers?.["X-GEMINI-NONCE"], "1700000001");
  session.close();
});

test("HMAC auth creates WebSocket upgrade headers", async () => {
  const auth: AuthStrategy = {
    nextNonce: () => "1700000000",
    credentialHeaders: async (payloadBase64) => ({
      "X-GEMINI-APIKEY": "key",
      "X-GEMINI-SIGNATURE": `sig:${payloadBase64}`,
    }),
  };
  const { session, sockets, options } = harness({ auth });

  await open(session, sockets);

  assert.deepEqual(options[0].headers, {
    "X-GEMINI-APIKEY": "key",
    "X-GEMINI-SIGNATURE": "sig:MTcwMDAwMDAwMA==",
    "X-GEMINI-NONCE": "1700000000",
    "X-GEMINI-PAYLOAD": "MTcwMDAwMDAwMA==",
  });
  session.close();
});

test("WebSocket auth rejects malformed custom nonces with SdkError", async () => {
  for (const nonce of [null, 42, new String("1700000000")]) {
    // SAFETY: This intentionally violates AuthStrategy's return contract to exercise the
    // JavaScript boundary validation in createServerWebSocketAuthHeaders.
    const nextNonce: () => string = () => nonce as string;
    const auth: AuthStrategy = {
      nextNonce,
      credentialHeaders: async () => ({}),
    };
    const session = new WebSocketSession({
      url: "wss://example.test",
      headersFactory: () => createServerWebSocketAuthHeaders(auth),
      socketFactory: () => new FakeSocket(),
    });
    await assert.rejects(session.connect(), (error: Error) =>
      error instanceof SdkError && error.message === "AuthStrategy returned an invalid nonce");
  }
});

test("OAuth auth creates only Authorization upgrade headers", async () => {
  const auth: AuthStrategy = {
    nextNonce: () => undefined,
    credentialHeaders: async () => ({ Authorization: "Bearer token" }),
  };
  const { session, sockets, options } = harness({ auth });

  await open(session, sockets);

  assert.deepEqual(options[0].headers, { Authorization: "Bearer token" });
  session.close();
});

test("auth header helper rejects transport-controlled credential headers", async () => {
  const auth: AuthStrategy = {
    nextNonce: () => "1700000000",
    credentialHeaders: async () => ({ "X-GEMINI-PAYLOAD": "evil" }),
  };
  const session = new WebSocketSession({
    url: "wss://example.test",
    headersFactory: () => createServerWebSocketAuthHeaders(auth),
    socketFactory: () => new FakeSocket(),
  });

  await assert.rejects(session.connect(), /reserved header X-GEMINI-PAYLOAD/);
});
