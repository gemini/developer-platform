import test from "node:test";
import assert from "node:assert/strict";

import { WsSession } from "../ws-session.js";
import { serializeError, SdkError, WebSocketRequestError } from "../errors.js";
import type { AuthStrategy } from "../core/http.js";
import type { SocketLike, SocketFactoryOptions } from "../transport.js";
import { FakeSocket } from "./fake-socket.js";


function harness(opts?: { auth?: AuthStrategy; timeoutMs?: number; liveness?: { intervalMs?: number; timeoutMs?: number } }) {
  const sockets: FakeSocket[] = [];
  const options: SocketFactoryOptions[] = [];
  const session = new WsSession({
    url: "wss://example.test",
    auth: opts?.auth,
    timeoutMs: opts?.timeoutMs,
    liveness: opts?.liveness,
    socketFactory: (_url, socketOptions) => {
      const socket = new FakeSocket();
      sockets.push(socket);
      options.push(socketOptions);
      return socket;
    },
  });
  return { session, sockets, options };
}

async function open(session: WsSession, sockets: FakeSocket[]): Promise<void> {
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

  await assert.rejects(request, (error: unknown) => {
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
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const request = session.request({ method: "ping" }, { timeoutMs: 10 });
  sockets[0].fire("open");
  await Promise.resolve();

  t.mock.timers.tick(10);

  await assert.rejects(request, /deadline/);
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
  const frames: unknown[] = [];
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
  const session = new WsSession({
    url: "wss://example.test",
    auth,
    socketFactory: () => new FakeSocket(),
  });

  await assert.rejects(session.connect(), /reserved header X-GEMINI-PAYLOAD/);
});
