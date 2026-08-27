import test from "node:test";
import assert from "node:assert/strict";

import { BrowserOAuthAuth, createClient, SdkError, type AuthStrategy, type OAuthTokenStore, type OAuthTokens } from "../browser/index.js";
import { GeminiMarkets } from "../client/server.js";
import { GeminiWebSocket } from "./server.js";
import type { WebSocketStreamOptions } from "./public.js";
import type { DiagnosticEvent } from "../observability/diagnostics.js";
import type { Logger } from "../observability/logging.js";
import type { SocketFactoryOptions, WebSocketReconnectOptions } from "./session.js";
import { FakeSocket } from "../tests/support/fake-socket.js";
import { createWebSocketHarness } from "../tests/support/ws-harness.js";
import { isBoundaryNumber, isBoundaryObject, isBoundaryString, type BoundaryValue } from "../utils/boundary-value.js";
import { parseBoundaryRecord } from "../tests/support/http-fixtures.js";


function auth(): AuthStrategy {
  return {
    nextNonce: () => "1700000000",
    credentialHeaders: async (payloadBase64) => ({
      "X-GEMINI-APIKEY": "key",
      "X-GEMINI-SIGNATURE": `sig:${payloadBase64}`,
    }),
  };
}

function invalidStreamOptions(value: BoundaryValue): WebSocketStreamOptions {
  // SAFETY: This fixture intentionally bypasses the stream option union to test runtime validation.
  return value as WebSocketStreamOptions;
}

function invalidSymbol(value: BoundaryValue): string {
  // SAFETY: These fixtures intentionally bypass the public symbol type to test JavaScript runtime validation.
  return value as string;
}

function harness(opts?: { auth?: AuthStrategy; logger?: Logger; onDiagnostic?: (event: DiagnosticEvent) => void; env?: "production" | "sandbox"; timeoutMs?: number; webSocketMaxMessageSizeBytes?: number; webSocketReconnect?: WebSocketReconnectOptions }) {
  const socketHarness = createWebSocketHarness();
  const client = new GeminiMarkets({
    env: opts?.env ?? "sandbox",
    auth: opts?.auth,
    logger: opts?.logger,
    onDiagnostic: opts?.onDiagnostic,
    timeoutMs: opts?.timeoutMs,
    webSocketMaxMessageSizeBytes: opts?.webSocketMaxMessageSizeBytes,
    webSocketReconnect: opts?.webSocketReconnect ?? { stableConnectionMs: 0 },
    webSocketFactory: socketHarness.socketFactory,
  });
  return { client, ...socketHarness };
}

test("WebSocket diagnostics classify control and mutation traffic without frames", async () => {
  const events: DiagnosticEvent[] = [];
  const { client, sockets } = harness({ auth: auth(), onDiagnostic: (event) => events.push(event) });
  const stream = client.websocket.public.trades("btcusd");
  await flush();
  sockets[0].fire("open");
  await flush();
  sockets[0].fire("message", { data: '{"id":1,"status":200}' });
  await stream.ready;
  const order = client.websocket.private.placeOrder({
    symbol: "btcusd",
    side: "BUY",
    type: "LIMIT",
    timeInForce: "GTC",
    quantity: "1",
    price: "100",
    clientOrderId: "client-1",
  }).catch(() => undefined);
  await flush();
  sockets[1].fire("open");
  await flush();
  sockets[1].fire("message", { data: '{"id":1,"status":200}' });
  await order;

  assert.ok(events.some((event) => event.traffic === "control"));
  const mutation = events.find((event) => event.name === "ws.request.start" && event.traffic === "mutation");
  const mutationEnd = events.find((event) => event.name === "ws.request.end" && event.traffic === "mutation");
  const subscriptionStart = events.find((event) => event.name === "ws.subscription.start");
  const subscriptionSend = events.find((event) => event.name === "ws.subscription.send");
  assert.match(stream.correlationId, /^[0-9a-f-]{36}$/);
  assert.equal(subscriptionStart?.correlationId, stream.correlationId);
  assert.equal(subscriptionSend?.correlationId, stream.correlationId);
  assert.match(mutation?.correlationId ?? "", /^[0-9a-f-]{36}$/);
  assert.equal(mutationEnd?.correlationId, mutation?.correlationId);
  assert.deepEqual(mutation?.operationContext, { operation: "order.place", clientOrderId: "client-1" });
  assert.equal(events.some((event) => "body" in event || JSON.stringify(event).includes("X-GEMINI-SIGNATURE")), false);
  assert.equal(JSON.stringify(events).includes("btcusd@trade"), false);
  client.close();
});

test("WebSocket symbol streams reject non-string symbols before opening a socket", () => {
  const { client, sockets } = harness();
  assert.throws(() => client.websocket.public.trades(invalidSymbol(null)), /symbol is required/);
  assert.throws(() => client.websocket.public.trades(invalidSymbol(42)), /symbol is required/);
  assert.equal(sockets.length, 0);
  client.close();
});

async function flush(): Promise<void> {
  await new Promise<void>((resolve) => setImmediate(resolve));
}

test("public streams share one underlying WebSocket session", async () => {
  const { client, sockets } = harness({ env: "production" });
  const trades = client.websocket.public.trades("btcusd");
  const ticker = client.websocket.public.bookTicker("ethusd");

  sockets[0].fire("open");
  await flush();

  assert.equal(sockets.length, 1);
  assert.deepEqual(sockets[0].sent.map((frame) => JSON.parse(frame)), [
    { id: 1, method: "SUBSCRIBE", params: ["btcusd@trade"] },
    { id: 2, method: "SUBSCRIBE", params: ["ethusd@bookTicker"] },
  ]);

  sockets[0].fire("message", { data: '{"id":1,"status":200}' });
  sockets[0].fire("message", { data: '{"id":2,"status":200}' });
  await trades.ready;
  await ticker.ready;
  client.close();
});

test("public and authenticated streams use separate upgrade sessions", async () => {
  const { client, sockets, options } = harness({ auth: auth() });
  const trades = client.websocket.public.trades("btcusd");
  const orders = client.websocket.private.orders({ scope: "account" });

  await flush();
  assert.equal(sockets.length, 2);
  assert.equal(options[0].headers, undefined, "public streams must not attach credentials");
  assert.deepEqual(options[1].headers, {
    "X-GEMINI-APIKEY": "key",
    "X-GEMINI-SIGNATURE": "sig:MTcwMDAwMDAwMA==",
    "X-GEMINI-NONCE": "1700000000",
    "X-GEMINI-PAYLOAD": "MTcwMDAwMDAwMA==",
  });

  sockets[0].fire("open");
  sockets[1].fire("open");
  await flush();
  sockets[0].fire("message", { data: '{"id":1,"status":200}' });
  sockets[1].fire("message", { data: '{"id":1,"status":200}' });
  await Promise.all([trades.ready, orders.ready]);

  const ping = client.websocket.public.ping();
  await flush();
  assert.deepEqual(JSON.parse(sockets[0].sent[1]), { id: 2, method: "ping" });
  sockets[0].fire("message", { data: '{"id":2,"status":200}' });
  await ping;

  const subscriptions = client.websocket.public.listSubscriptions();
  await flush();
  assert.deepEqual(JSON.parse(sockets[0].sent[2]), { id: 3, method: "LIST_SUBSCRIPTIONS" });
  sockets[0].fire("message", { data: '{"id":3,"status":200}' });
  await subscriptions;

  const privateConnection = client.websocket.private.conninfo();
  await flush();
  assert.deepEqual(JSON.parse(sockets[1].sent[1]), { id: 2, method: "conninfo" });
  sockets[1].fire("message", { data: '{"id":2,"status":200}' });
  await privateConnection;

  const privateSubscriptions = client.websocket.private.listSubscriptions();
  await flush();
  assert.deepEqual(JSON.parse(sockets[1].sent[2]), { id: 3, method: "LIST_SUBSCRIPTIONS" });
  sockets[1].fire("message", { data: '{"id":3,"status":200}' });
  await privateSubscriptions;

  client.websocket.public.close();
  assert.equal(sockets[0].closed, true);
  assert.equal(sockets[1].closed, false, "closing the public namespace must not close the private session");

  client.close();
  assert.equal(sockets[0].closed, true);
  assert.equal(sockets[1].closed, true);
});

test("generic stream listeners support AbortSignal lifecycle", async () => {
  const { client, sockets } = harness();
  const controller = new AbortController();
  const messages: unknown[] = [];
  const trades = client.websocket.public.trades("btcusd");
  trades.on("message", (message) => messages.push(message), { signal: controller.signal });

  sockets[0].fire("open");
  await flush();
  sockets[0].fire("message", { data: '{"id":1,"status":200}' });
  await trades.ready;
  controller.abort();
  sockets[0].fire("message", { data: '{"E":2,"s":"btcusd","t":2,"p":"100","q":"1","m":false}' });

  assert.deepEqual(messages, []);
  client.close();
});

test("streams can be consumed as async iterables and close through the iterator", async () => {
  const { client, sockets } = harness();
  const trades = client.websocket.public.trades("btcusd");
  const iterator = trades[Symbol.asyncIterator]();
  const nextMessage = iterator.next();

  sockets[0].fire("open");
  await flush();
  sockets[0].fire("message", { data: '{"id":1,"status":200}' });
  await trades.ready;
  sockets[0].fire("message", { data: '{"E":2,"s":"btcusd","t":3,"p":"50","q":"2","m":false}' });

  assert.deepEqual(await nextMessage, {
    done: false,
    value: { E: 2, s: "btcusd", t: 3, p: "50", q: "2", m: false },
  });
  const closing = iterator.return?.();
  await flush();
  sockets[0].fire("message", { data: '{"id":2,"status":200}' });
  assert.deepEqual(await closing, { done: true, value: undefined });
  client.close();
});

test("stream iterator drops the oldest buffered frame at its high-water mark", async () => {
  const { client, sockets } = harness();
  const trades = client.websocket.public.trades("btcusd", { highWaterMark: 2 });
  sockets[0].fire("open");
  await flush();
  sockets[0].fire("message", { data: '{"id":1,"status":200}' });
  await trades.ready;

  for (const t of [1, 2, 3]) {
    sockets[0].fire("message", { data: `{"E":${t},"s":"btcusd","t":${t},"p":"50","q":"2","m":false}` });
  }

  const iterator = trades[Symbol.asyncIterator]();
  assert.equal((await iterator.next()).value.t, 2);
  assert.equal((await iterator.next()).value.t, 3);
  client.close();
});

test("stream iterator releases dequeued frame bytes", async () => {
  const { client, sockets } = harness();
  const trades = client.websocket.public.trades("btcusd", { highWaterMark: 10, highWaterMarkBytes: 60 });
  sockets[0].fire("open");
  await flush();
  sockets[0].fire("message", { data: '{"id":1,"status":200}' });
  await trades.ready;

  const first = { E: 1, s: "btcusd", t: 1, p: "50", q: "2", m: false };
  sockets[0].fire("message", { data: JSON.stringify(first) });
  const iterator = trades[Symbol.asyncIterator]();
  assert.deepEqual((await iterator.next()).value, first);

  const second = { E: 2, s: "btcusd", t: 2, p: "50", q: "2", m: false };
  sockets[0].fire("message", { data: JSON.stringify(second) });
  assert.deepEqual((await iterator.next()).value, second);
  client.close();
});

test("stream iterator can fail on overflow and emits a diagnostic", async () => {
  const events: DiagnosticEvent[] = [];
  const { client, sockets } = harness({ onDiagnostic: (event) => events.push(event) });
  const trades = client.websocket.public.trades("btcusd", { highWaterMark: 1, overflowStrategy: "error" });
  sockets[0].fire("open");
  await flush();
  sockets[0].fire("message", { data: '{"id":1,"status":200}' });
  await trades.ready;
  sockets[0].fire("message", { data: '{"E":1,"s":"btcusd","t":1,"p":"50","q":"2","m":false}' });
  sockets[0].fire("message", { data: '{"E":2,"s":"btcusd","t":2,"p":"50","q":"2","m":false}' });

  assert.equal(trades.state, "failed");
  await assert.rejects(() => trades[Symbol.asyncIterator]().next(), /buffer overflow/);
  const overflow = events.find((event) => event.name === "ws.stream.buffer_overflow");
  assert.equal(overflow?.metadata?.symbol, "btcusd");
  assert.equal(overflow?.metadata?.queueSize, 1);
  assert.equal(overflow?.metadata?.highWaterMark, 1);
  assert.equal(overflow?.metadata?.strategy, "error");
  assert.equal(overflow?.metadata?.stream, "btcusd@trade");
  assert.equal(isBoundaryNumber(overflow?.metadata?.queueBytes), true);
  assert.equal(isBoundaryNumber(overflow?.metadata?.highWaterMarkBytes), true);
  assert.equal(isBoundaryNumber(overflow?.metadata?.frameBytes), true);
  client.close();
});

test("stream iterator enforces a byte bound even when the message count is below its limit", async () => {
  const events: DiagnosticEvent[] = [];
  const { client, sockets } = harness({ onDiagnostic: (event) => events.push(event) });
  const trades = client.websocket.public.trades("btcusd", { highWaterMark: 100, highWaterMarkBytes: 1, overflowStrategy: "error" });

  sockets[0].fire("open");
  await flush();
  sockets[0].fire("message", { data: '{"id":1,"status":200}' });
  await trades.ready;
  sockets[0].fire("message", { data: '{"E":1,"s":"btcusd","t":1,"p":"50","q":"2","m":false}' });

  assert.equal(trades.state, "failed");
  assert.match(trades.lastError?.message ?? "", /messages or 1 bytes/);
  const overflow = events.find((event) => event.name === "ws.stream.buffer_overflow");
  assert.equal(overflow?.metadata?.highWaterMark, 100);
  assert.equal(overflow?.metadata?.highWaterMarkBytes, 1);
  assert.equal(overflow?.metadata?.queueSize, 0);
  const frameBytes = overflow?.metadata?.frameBytes;
  assert.ok(isBoundaryNumber(frameBytes) && frameBytes > 1);
  client.close();
});

test("stream options do not permit unbounded buffering", () => {
  const { client } = harness();
  assert.throws(
    () => client.websocket.public.trades("btcusd", invalidStreamOptions({ overflowStrategy: "unbounded" })),
    /unsupported WebSocket stream overflow strategy/,
  );
  assert.throws(
    () => client.websocket.public.trades("btcusd", { highWaterMark: Number.MAX_VALUE }),
    /highWaterMark must be a non-negative safe integer/,
  );
  client.close();
});

test("terminal stream failures are not cleared by a later reconnect", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const { client, sockets } = harness();
  const trades = client.websocket.public.trades("btcusd", { highWaterMark: 1, overflowStrategy: "error" });

  sockets[0].fire("open");
  await flush();
  sockets[0].fire("message", { data: '{"id":1,"status":200}' });
  await trades.ready;
  sockets[0].fire("message", { data: '{"E":1,"s":"btcusd","t":1,"p":"50","q":"2","m":false}' });
  sockets[0].fire("message", { data: '{"E":2,"s":"btcusd","t":2,"p":"50","q":"2","m":false}' });

  await assert.rejects(() => trades[Symbol.asyncIterator]().next(), /buffer overflow/);
  sockets[0].fire("close");
  t.mock.timers.tick(0);
  await flush();
  sockets[1].fire("open");
  await flush();
  sockets[1].fire("message", { data: '{"id":1,"status":200}' });

  assert.equal(trades.state, "failed");
  await assert.rejects(() => trades[Symbol.asyncIterator]().next(), /buffer overflow/);
  client.close();
});

test("retry exhaustion fails active streams instead of leaving them reconnecting", async () => {
  const { client, sockets } = harness({ webSocketReconnect: { maxAttempts: 0, stableConnectionMs: 0 } });
  const stream = client.websocket.public.trades("btcusd");
  await flush();
  sockets[0]!.fire("open");
  await flush();
  sockets[0]!.fire("message", { data: '{"id":1,"status":200}' });
  await stream.ready;

  sockets[0]!.fire("close");

  assert.equal(stream.state, "failed");
  assert.ok(stream.lastError);
  client.close();
});

test("a recoverable socket error enters reconnecting without failing the stream", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const { client, sockets } = harness();
  const errors: Error[] = [];
  const trades = client.websocket.public.trades("btcusd");
  trades.on("error", (error) => errors.push(error));
  sockets[0].fire("open");
  await flush();
  sockets[0].fire("message", { data: '{"id":1,"status":200}' });
  await trades.ready;

  sockets[0].fire("error", { error: new Error("socket failed") });

  assert.equal(trades.state, "reconnecting");
  assert.equal(errors.length, 1);
  assert.match(errors[0]!.message, /WebSocket socket error/);
  sockets[0].fire("close");
  client.close();
});

test("generic streams count and diagnose malformed known frames", async () => {
  const events: DiagnosticEvent[] = [];
  const { client, sockets } = harness({ onDiagnostic: (event) => events.push(event) });
  const trades = client.websocket.public.trades("btcusd");
  sockets[0].fire("open");
  await flush();
  sockets[0].fire("message", { data: '{"id":1,"status":200}' });
  await trades.ready;

  sockets[0].fire("message", { data: '{"E":2,"s":"btcusd","t":2,"p":"100","m":false}' });

  assert.equal(trades.malformedFrameCount, 1);
  assert.equal(events.some((event) => event.name === "ws.stream.malformed_frame"), true);
  client.close();
});

test("public streams surface successful replay acknowledgement", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const { client, sockets } = harness();
  const events: string[] = [];
  const trades = client.websocket.public.trades("btcusd");
  trades.on("resubscribed", () => events.push("resubscribed"));

  sockets[0].fire("open");
  await flush();
  sockets[0].fire("message", { data: '{"id":1,"status":200}' });
  await trades.ready;
  sockets[0].fire("close");
  t.mock.timers.tick(0);
  sockets[1].fire("open");
  sockets[1].fire("message", { data: '{"id":1,"status":200}' });

  assert.deepEqual(events, ["resubscribed"]);
  client.close();
});

test("a replayed initial subscription acknowledgement completes stream recovery", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const { client, sockets } = harness();
  const events: string[] = [];
  const trades = client.websocket.public.trades("btcusd");
  trades.on("resubscribed", () => events.push("resubscribed"));

  sockets[0].fire("open");
  await flush();
  sockets[0].fire("close");
  assert.equal(trades.state, "reconnecting");

  t.mock.timers.tick(0);
  await flush();
  sockets[1].fire("open");
  await flush();
  sockets[1].fire("message", { data: '{"id":1,"status":200}' });
  await trades.ready;

  assert.equal(trades.state, "active");
  assert.deepEqual(events, ["resubscribed"]);
  client.close();
});

test("stream async iterators survive a transient reconnect", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const { client, sockets } = harness();
  const trades = client.websocket.public.trades("btcusd");

  sockets[0].fire("open");
  await flush();
  sockets[0].fire("message", { data: '{"id":1,"status":200}' });
  await trades.ready;

  const nextMessage = trades[Symbol.asyncIterator]().next();
  sockets[0].fire("error", { error: new Error("socket failed") });
  assert.equal(trades.state, "reconnecting");
  sockets[0].fire("close");

  t.mock.timers.tick(0);
  await flush();
  sockets[1].fire("open");
  await flush();
  sockets[1].fire("message", { data: '{"id":1,"status":200}' });
  sockets[1].fire("message", { data: '{"E":2,"s":"btcusd","t":2,"p":"50","q":"2","m":false}' });

  assert.deepEqual(await nextMessage, {
    done: false,
    value: { E: 2, s: "btcusd", t: 2, p: "50", q: "2", m: false },
  });
  assert.equal(trades.state, "active");
  client.close();
});

test("direct GeminiWebSocket order books derive a snapshot URL and preserve query parameters", async () => {
  const sockets: FakeSocket[] = [];
  const urls: string[] = [];
  const websocket = new GeminiWebSocket({
    url: "wss://example.test?foo=bar",
    socketFactory: (url, _options) => {
      urls.push(url);
      const socket = new FakeSocket();
      sockets.push(socket);
      return socket;
    },
  });
  const book = websocket.public.orderBook("btcusd");

  await flush();
  assert.deepEqual(urls, ["wss://example.test/?foo=bar&snapshot=-1"]);
  sockets[0].fire("open");
  await flush();
  sockets[0].fire("message", { data: '{"id":1,"status":200}' });
  sockets[0].fire("message", { data: '{"e":"depthUpdate","E":1,"s":"btcusd","U":1,"u":1,"b":[["100","1"]],"a":[["101","1"]]}' });
  sockets[0].fire("message", { data: '{"e":"depthUpdate","E":2,"s":"btcusd","U":1,"u":2,"b":[],"a":[]}' });
  await flush();

  assert.deepEqual(book.bestBid(), { price: "100", qty: "1" });
  websocket.close();
});

test("a malformed live depth update marks the book stale and resubscribes", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const { client, sockets } = harness({ env: "production" });
  const book = client.orderBook("btcusd");
  let resyncs = 0;
  book.on("resync", () => { resyncs++; });

  await flush();
  sockets[0].fire("open");
  await flush();
  sockets[0].fire("message", { data: '{"id":1,"status":200}' });
  sockets[0].fire("message", { data: '{"e":"depthUpdate","E":1,"s":"btcusd","U":1,"u":1,"b":[["100","1"]],"a":[]}' });
  await flush();
  assert.deepEqual(book.bestBid(), { price: "100", qty: "1" });

  sockets[0].fire("message", { data: '{"e":"depthUpdate","E":2,"s":"btcusd","U":1,"u":2,"b":[["NaN","2"]],"a":[]}' });
  assert.equal(resyncs, 1);
  assert.equal(book.bestBid(), undefined);
  assert.equal(sockets[0].closed, true);

  t.mock.timers.tick(0);
  await flush();
  sockets[1].fire("open");
  await flush();
  sockets[1].fire("message", { data: '{"id":1,"status":200}' });
  sockets[1].fire("message", { data: '{"e":"depthUpdate","E":3,"s":"btcusd","U":3,"u":3,"b":[["101","2"]],"a":[]}' });
  await flush();

  assert.deepEqual(book.bestBid(), { price: "101", qty: "2" });
  client.close();
});

test("order-book preserves a current-generation snapshot received before its ACK", async () => {
  const { client, sockets } = harness({ env: "production" });
  const book = client.orderBook("btcusd");
  await flush();
  sockets[0].fire("open");
  await flush();

  sockets[0].fire("message", { data: '{"e":"depthUpdate","E":1,"s":"btcusd","U":1,"u":1,"b":[["100","9"]],"a":[["101","3"]]}' });
  sockets[0].fire("message", { data: '{"id":1,"status":200}' });
  sockets[0].fire("message", { data: '{"e":"depthUpdate","E":2,"s":"btcusd","U":1,"u":2,"b":[],"a":[]}' });
  await flush();

  assert.deepEqual(book.snapshot(), {
    bids: [{ price: "100", qty: "9" }],
    asks: [{ price: "101", qty: "3" }],
  });

  sockets[0].fire("message", { data: '{"e":"depthUpdate","E":3,"s":"btcusd","U":2,"u":3,"b":[["100","0"],["99","4"]],"a":[]}' });
  await flush();

  assert.deepEqual(book.snapshot(), {
    bids: [{ price: "99", qty: "4" }],
    asks: [{ price: "101", qty: "3" }],
  });
  client.close();
});

test("a malformed initial depth snapshot fences the generation before a diff can be promoted", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const { client, sockets } = harness({ env: "production" });
  const book = client.orderBook("btcusd");
  await flush();
  sockets[0].fire("open");
  await flush();
  sockets[0].fire("message", { data: '{"id":1,"status":200}' });

  sockets[0].fire("message", {
    data: '{"e":"depthUpdate","E":1,"s":"btcusd","U":1,"u":1,"b":[["100",1]],"a":[]}',
  });
  assert.equal(sockets[0].closed, true);

  // This valid diff belongs to the fenced socket and cannot become the baseline.
  sockets[0].fire("message", {
    data: '{"e":"depthUpdate","E":2,"s":"btcusd","U":2,"u":2,"b":[["99","1"]],"a":[]}',
  });
  assert.equal(book.bestBid(), undefined);

  t.mock.timers.tick(0);
  await flush();
  sockets[1].fire("open");
  await flush();
  sockets[1].fire("message", { data: '{"id":1,"status":200}' });
  sockets[1].fire("message", {
    data: '{"e":"depthUpdate","E":3,"s":"btcusd","U":3,"u":3,"b":[["101","2"]],"a":[]}',
  });
  await flush();

  assert.deepEqual(book.bestBid(), { price: "101", qty: "2" });
  client.close();
});

test("a malformed initial depth snapshot without a symbol fences awaiting books", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const { client, sockets } = harness({ env: "production" });
  const book = client.orderBook("btcusd");
  await flush();
  sockets[0].fire("open");
  await flush();
  sockets[0].fire("message", { data: '{"id":1,"status":200}' });

  sockets[0].fire("message", {
    data: '{"e":"depthUpdate","E":1,"U":1,"u":1,"b":[["100",1]],"a":[]}',
  });
  assert.equal(sockets[0].closed, true);
  sockets[0].fire("message", {
    data: '{"e":"depthUpdate","E":2,"s":"btcusd","U":2,"u":2,"b":[["99","1"]],"a":[]}',
  });
  assert.equal(book.bestBid(), undefined);

  t.mock.timers.tick(0);
  await flush();
  sockets[1].fire("open");
  await flush();
  sockets[1].fire("message", { data: '{"id":1,"status":200}' });
  sockets[1].fire("message", {
    data: '{"e":"depthUpdate","E":3,"s":"btcusd","U":3,"u":3,"b":[["101","2"]],"a":[]}',
  });
  await flush();

  assert.deepEqual(book.bestBid(), { price: "101", qty: "2" });
  client.close();
});

test("a malformed initial depth snapshot with an empty symbol fences awaiting books", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const { client, sockets } = harness({ env: "production" });
  const book = client.orderBook("btcusd");
  await flush();
  sockets[0].fire("open");
  await flush();
  sockets[0].fire("message", { data: '{"id":1,"status":200}' });

  sockets[0].fire("message", {
    data: '{"e":"depthUpdate","E":1,"s":"","U":1,"u":1,"b":[["100",1]],"a":[]}',
  });
  assert.equal(sockets[0].closed, true);
  sockets[0].fire("message", {
    data: '{"e":"depthUpdate","E":2,"s":"btcusd","U":2,"u":2,"b":[["99","1"]],"a":[]}',
  });
  assert.equal(book.bestBid(), undefined);

  t.mock.timers.tick(0);
  await flush();
  sockets[1].fire("open");
  await flush();
  sockets[1].fire("message", { data: '{"id":1,"status":200}' });
  sockets[1].fire("message", {
    data: '{"e":"depthUpdate","E":3,"s":"btcusd","U":3,"u":3,"b":[["101","2"]],"a":[]}',
  });
  await flush();

  assert.deepEqual(book.bestBid(), { price: "101", qty: "2" });
  client.close();
});

test("a malformed replay snapshot before acknowledgement fences the replacement socket", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const { client, sockets } = harness({ env: "production" });
  const book = client.orderBook("btcusd");
  await flush();
  sockets[0].fire("open");
  await flush();
  sockets[0].fire("message", { data: '{"id":1,"status":200}' });
  sockets[0].fire("message", {
    data: '{"e":"depthUpdate","E":1,"s":"btcusd","U":1,"u":1,"b":[["100","1"]],"a":[]}',
  });
  await flush();

  sockets[0].fire("close");
  t.mock.timers.tick(0);
  await flush();
  sockets[1].fire("open");
  await flush();
  sockets[1].fire("message", {
    data: '{"e":"depthUpdate","E":2,"s":"btcusd","U":2,"u":2,"b":[["100",1]],"a":[]}',
  });
  assert.equal(sockets[1].closed, true);
  sockets[1].fire("message", {
    data: '{"e":"depthUpdate","E":3,"s":"btcusd","U":3,"u":3,"b":[["99","1"]],"a":[]}',
  });
  assert.equal(book.bestBid(), undefined);

  t.mock.timers.tick(0);
  await flush();
  sockets[2].fire("open");
  await flush();
  sockets[2].fire("message", { data: '{"id":1,"status":200}' });
  sockets[2].fire("message", {
    data: '{"e":"depthUpdate","E":4,"s":"btcusd","U":4,"u":4,"b":[["102","2"]],"a":[]}',
  });
  await flush();

  assert.deepEqual(book.bestBid(), { price: "102", qty: "2" });
  client.close();
});

test("repeated malformed replay snapshots back off before opening another socket", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const { client, sockets } = harness({ env: "production" });
  client.orderBook("btcusd");
  await flush();
  sockets[0].fire("open");
  await flush();
  sockets[0].fire("message", { data: '{"id":1,"status":200}' });
  sockets[0].fire("message", {
    data: '{"e":"depthUpdate","E":1,"s":"btcusd","U":1,"u":1,"b":[["100","1"]],"a":[]}',
  });
  await flush();

  sockets[0].fire("close");
  t.mock.timers.tick(0);
  await flush();
  sockets[1].fire("open");
  await flush();
  sockets[1].fire("message", {
    data: '{"e":"depthUpdate","E":2,"s":"btcusd","U":2,"u":2,"b":[["100",1]],"a":[]}',
  });
  assert.equal(sockets[1].closed, true);

  t.mock.timers.tick(0);
  await flush();
  sockets[2].fire("open");
  await flush();
  sockets[2].fire("message", {
    data: '{"e":"depthUpdate","E":3,"s":"btcusd","U":3,"u":3,"b":[["100",1]],"a":[]}',
  });
  assert.equal(sockets[2].closed, true);

  t.mock.timers.tick(249);
  await flush();
  assert.equal(sockets.length, 3, "a second malformed replay snapshot must not reconnect immediately");
  t.mock.timers.tick(1);
  await flush();
  assert.equal(sockets.length, 4);
  client.close();
});

test("order-book activates a differential snapshot without a follow-up frame", async () => {
  const { client, sockets } = harness({ env: "production" });
  const book = client.orderBook("btcusd");
  await flush();
  sockets[0].fire("open");
  await flush();

  sockets[0].fire("message", { data: '{"e":"depthUpdate","E":1,"s":"btcusd","U":1,"u":1,"b":[["100","9"]],"a":[]}' });
  sockets[0].fire("message", { data: '{"id":1,"status":200}' });
  await flush();

  assert.deepEqual(book.snapshot(), {
    bids: [{ price: "100", qty: "9" }],
    asks: [],
  });
  client.close();
});

test("orderBook uses a snapshot session separate from public streams", async () => {
  const { client, sockets } = harness();
  const trades: unknown[] = [];
  const book = client.orderBook("btcusd");
  const tradeStream = client.websocket.public.trades("ethusd");
  tradeStream.on("message", (trade) => trades.push(trade));

  await flush();
  sockets[0].fire("open");
  sockets[1].fire("open");
  await flush();

  assert.equal(sockets.length, 2);
  assert.deepEqual(sockets[0].sent.map((frame) => JSON.parse(frame)), [
    { id: 1, method: "SUBSCRIBE", params: ["btcusd@depth20"] },
  ]);
  assert.deepEqual(sockets[1].sent.map((frame) => JSON.parse(frame)), [
    { id: 1, method: "SUBSCRIBE", params: ["ethusd@trade"] },
  ]);

  sockets[0].fire("message", { data: '{"id":1,"status":200}' });
  sockets[1].fire("message", { data: '{"id":1,"status":200}' });
  await tradeStream.ready;
  sockets[0].fire("message", { data: '{"lastUpdateId":1,"symbol":"btcusd","bids":[["100","1"]],"asks":[["101","1"]]}' });
  sockets[1].fire("message", { data: '{"E":2,"s":"ethusd","t":3,"p":"50","q":"2","m":false}' });

  assert.deepEqual(book.bestBid(), { price: "100", qty: "1" });
  assert.deepEqual(trades, [{ E: 2, s: "ethusd", t: 3, p: "50", q: "2", m: false }]);
  client.close();
});

test("order-book reconstruction applies queued diffs after the fresh snapshot", async () => {
  const { client, sockets } = harness({ env: "production" });
  const book = client.orderBook("btcusd");
  await flush();
  sockets[0].fire("open");
  await flush();

  sockets[0].fire("message", { data: '{"id":1,"status":200}' });
  // The first valid depth frame is the initial differential snapshot.
  sockets[0].fire("message", { data: '{"e":"depthUpdate","E":10,"s":"btcusd","U":10,"u":12,"b":[["101","1"]],"a":[]}' });
  sockets[0].fire("message", { data: '{"e":"depthUpdate","E":13,"s":"btcusd","U":12,"u":13,"b":[["101","2"]],"a":[]}' });
  await flush();

  assert.deepEqual(book.bestBid(), { price: "101", qty: "2" });
  assert.deepEqual(book.snapshot().bids, [{ price: "101", qty: "2" }]);
  client.close();
});

test("order-book snapshot buffering is bounded when no valid snapshot arrives", async () => {
  const { client, sockets } = harness({ env: "production" });
  const errors: Error[] = [];
  const book = client.orderBook("btcusd");
  book.on("error", (error) => errors.push(error));
  await flush();
  sockets[0].fire("open");
  await flush();
  sockets[0].fire("message", { data: '{"id":1,"status":200}' });
  await flush();

  for (let id = 1; id <= 257; id++) {
    sockets[0].fire("message", {
      data: `{"e":"depthUpdate","E":${id},"s":"btcusd","U":${id + 1},"u":${id},"b":[["100","1"]],"a":[]}`,
    });
  }
  await flush();

  assert.equal(errors.length, 1);
  assert.match(errors[0]?.message ?? "", /snapshot buffer exceeded/);
  assert.equal(book.bestBid(), undefined);
  client.close();
});

test("a timed-out order-book subscription closes the book and releases its routing entry", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const { client, sockets } = harness({ env: "production", timeoutMs: 10 });
  const errors: Error[] = [];
  const book = client.orderBook("btcusd");
  book.on("error", (error) => errors.push(error));

  await flush();
  sockets[0].fire("open");
  await flush();
  t.mock.timers.tick(10);
  await flush();

  assert.equal(errors.length, 1);
  assert.deepEqual(sockets[0].sent.map((frame) => JSON.parse(frame)), [
    { id: 1, method: "SUBSCRIBE", params: ["btcusd@depth"] },
    { id: 2, method: "UNSUBSCRIBE", params: ["btcusd@depth"] },
  ]);
  assert.notEqual(client.orderBook("btcusd"), book);
  client.close();
});

test("public reconnect does not stale an order book on its separate session", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const { client, sockets } = harness();
  const book = client.orderBook("btcusd");
  const trades = client.websocket.public.trades("ethusd");

  await flush();
  sockets[0].fire("open");
  sockets[1].fire("open");
  await flush();
  sockets[0].fire("message", { data: '{"id":1,"status":200}' });
  sockets[1].fire("message", { data: '{"id":1,"status":200}' });
  await trades.ready;
  sockets[0].fire("message", { data: '{"lastUpdateId":1,"symbol":"btcusd","bids":[["100","1"]],"asks":[["101","1"]]}' });
  assert.deepEqual(book.bestBid(), { price: "100", qty: "1" });

  sockets[1].fire("close");
  t.mock.timers.tick(0);
  await flush();
  sockets[2].fire("open");
  await flush();
  sockets[2].fire("message", { data: '{"id":1,"status":200}' });
  await flush();
  sockets[0].fire("message", { data: '{"e":"depthUpdate","E":2,"s":"btcusd","U":2,"u":2,"b":[["100","2"]],"a":[]}' });

  assert.deepEqual(book.bestBid(), { price: "100", qty: "2" });
  client.close();
});

test("sandbox order books accept the documented symbol-less snapshot envelope", async () => {
  const { client, sockets } = harness({ env: "sandbox" });
  const book = client.orderBook("btcusd");
  await flush();
  sockets[0].fire("open");
  await flush();
  sockets[0].fire("message", { data: '{"id":1,"status":200}' });
  sockets[0].fire("message", { data: '{"lastUpdateId":1,"bids":[["100","1"]],"asks":[["101","1"]]}' });
  await flush();
  assert.deepEqual(book.bestBid(), { price: "100", qty: "1" });
  client.close();
});

test("sandbox order books isolate symbol-less snapshots per subscription", async () => {
  const { client, sockets } = harness({ env: "sandbox" });
  const btc = client.orderBook("btcusd");
  const eth = client.orderBook("ethusd");

  await flush();
  assert.equal(sockets.length, 2);
  sockets[0].fire("open");
  sockets[1].fire("open");
  await flush();
  assert.deepEqual(sockets[0].sent.map((frame) => JSON.parse(frame)), [
    { id: 1, method: "SUBSCRIBE", params: ["btcusd@depth20"] },
  ]);
  assert.deepEqual(sockets[1].sent.map((frame) => JSON.parse(frame)), [
    { id: 1, method: "SUBSCRIBE", params: ["ethusd@depth20"] },
  ]);

  sockets[0].fire("message", { data: '{"id":1,"status":200}' });
  sockets[1].fire("message", { data: '{"id":1,"status":200}' });
  sockets[0].fire("message", { data: '{"lastUpdateId":1,"bids":[["100","1"]],"asks":[]}' });
  sockets[1].fire("message", { data: '{"lastUpdateId":2,"bids":[["200","2"]],"asks":[]}' });
  await flush();

  assert.deepEqual(btc.bestBid(), { price: "100", qty: "1" });
  assert.deepEqual(eth.bestBid(), { price: "200", qty: "2" });
  client.close();
});

test("order book session reconnect resubscribes and synchronizes fresh snapshot", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const { client, sockets } = harness({ env: "production" });
  const book = client.orderBook("btcusd");

  await flush();
  sockets[0].fire("open");
  await flush();
  sockets[0].fire("message", { data: '{"id":1,"status":200}' });
  sockets[0].fire("message", { data: '{"e":"depthUpdate","E":1,"s":"btcusd","U":1,"u":1,"b":[["100","1"]],"a":[["101","1"]]}' });
  sockets[0].fire("message", { data: '{"e":"depthUpdate","E":2,"s":"btcusd","U":1,"u":2,"b":[],"a":[]}' });
  await flush();

  assert.deepEqual(book.bestBid(), { price: "100", qty: "1" });

  // Simulate socket drop on the order book session
  sockets[0].fire("close");
  t.mock.timers.tick(0);
  await flush();

  // Book should be marked stale during reconnect
  assert.equal(book.bestBid(), undefined);

  // New socket connects and replays the subscription
  assert.equal(sockets.length, 2);
  sockets[1].fire("open");
  await flush();
  assert.deepEqual(JSON.parse(sockets[1].sent[0]), { id: 1, method: "SUBSCRIBE", params: ["btcusd@depth"] });

  // Server acknowledges replayed subscription
  sockets[1].fire("message", { data: '{"id":1,"status":200}' });
  // Server sends fresh snapshot
  sockets[1].fire("message", { data: '{"e":"depthUpdate","E":10,"s":"btcusd","U":10,"u":10,"b":[["105","2"]],"a":[["106","2"]]}' });
  sockets[1].fire("message", { data: '{"e":"depthUpdate","E":11,"s":"btcusd","U":10,"u":11,"b":[],"a":[]}' });
  await flush();

  assert.deepEqual(book.bestBid(), { price: "105", qty: "2" });
  assert.deepEqual(book.bestAsk(), { price: "106", qty: "2" });

  // Subsequent diff applies smoothly
  sockets[1].fire("message", { data: '{"e":"depthUpdate","E":12,"s":"btcusd","U":11,"u":12,"b":[["105","3"]],"a":[]}' });
  await flush();
  assert.deepEqual(book.bestBid(), { price: "105", qty: "3" });

  client.close();
});

test("a resync from one recovering order book schedules another shared-session recovery", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const { client, sockets } = harness({ env: "production" });
  const first = client.orderBook("btcusd");
  const second = client.orderBook("ethusd");
  await flush();
  sockets[0].fire("open");
  await flush();
  sockets[0].fire("message", { data: '{"id":1,"status":200}' });
  sockets[0].fire("message", { data: '{"id":2,"status":200}' });
  sockets[0].fire("message", { data: '{"e":"depthUpdate","E":1,"s":"btcusd","U":1,"u":1,"b":[["100","1"]],"a":[]}' });
  sockets[0].fire("message", { data: '{"e":"depthUpdate","E":1,"s":"ethusd","U":1,"u":1,"b":[["200","1"]],"a":[]}' });
  await flush();

  sockets[0].fire("close");
  t.mock.timers.tick(0);
  await flush();
  sockets[1].fire("open");
  await flush();
  sockets[1].fire("message", { data: '{"id":1,"status":200}' });
  sockets[1].fire("message", { data: '{"id":2,"status":200}' });
  sockets[1].fire("message", { data: '{"e":"depthUpdate","E":10,"s":"btcusd","U":10,"u":10,"b":[["110","1"]],"a":[]}' });
  // ETH is still waiting for its replacement snapshot, so BTC's gap must be remembered.
  sockets[1].fire("message", { data: '{"e":"depthUpdate","E":11,"s":"btcusd","U":12,"u":12,"b":[["111","1"]],"a":[]}' });
  sockets[1].fire("message", { data: '{"e":"depthUpdate","E":10,"s":"ethusd","U":10,"u":10,"b":[["210","1"]],"a":[]}' });
  t.mock.timers.tick(0);
  await flush();

  assert.equal(sockets.length, 3);
  assert.equal(first.bestBid(), undefined);
  assert.equal(second.bestBid(), undefined);
  sockets[2].fire("open");
  await flush();
  sockets[2].fire("message", { data: '{"id":1,"status":200}' });
  sockets[2].fire("message", { data: '{"id":2,"status":200}' });
  sockets[2].fire("message", { data: '{"e":"depthUpdate","E":20,"s":"btcusd","U":20,"u":20,"b":[["120","1"]],"a":[]}' });
  sockets[2].fire("message", { data: '{"e":"depthUpdate","E":20,"s":"ethusd","U":20,"u":20,"b":[["220","1"]],"a":[]}' });
  await flush();
  assert.deepEqual(first.bestBid(), { price: "120", qty: "1" });
  assert.deepEqual(second.bestBid(), { price: "220", qty: "1" });
  client.close();
});

test("closing an order book during reconnect prevents stale frames from reviving it", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const { client, sockets } = harness({ env: "production" });
  const book = client.orderBook("btcusd");

  await flush();
  sockets[0].fire("open");
  await flush();
  sockets[0].fire("message", { data: '{"id":1,"status":200}' });
  sockets[0].fire("message", { data: '{"e":"depthUpdate","E":1,"s":"btcusd","U":1,"u":1,"b":[["100","1"]],"a":[]}' });
  sockets[0].fire("message", { data: '{"e":"depthUpdate","E":2,"s":"btcusd","U":1,"u":2,"b":[],"a":[]}' });
  await flush();
  assert.deepEqual(book.bestBid(), { price: "100", qty: "1" });

  sockets[0].fire("close");
  t.mock.timers.tick(0);
  await flush();
  book.close();

  sockets[1].fire("open");
  await flush();
  sockets[1].fire("message", { data: '{"id":1,"status":200}' });
  sockets[1].fire("message", { data: '{"e":"depthUpdate","E":2,"s":"btcusd","U":2,"u":2,"b":[["101","2"]],"a":[]}' });

  assert.deepEqual(sockets[1].sent, []);
  assert.deepEqual(book.bestBid(), undefined);
  client.close();
});

test("utility methods resolve through request correlation", async () => {
  const { client, sockets } = harness();
  const ping = client.websocket.public.ping();

  sockets[0].fire("open");
  await flush();
  assert.deepEqual(JSON.parse(sockets[0].sent[0]), { id: 1, method: "ping" });

  sockets[0].fire("message", { data: '{"id":1,"status":200,"result":{"pong":true}}' });
  assert.deepEqual(await ping, { id: 1, status: 200, result: { pong: true } });
  client.close();
});

test("utility methods send documented public request frames", async () => {
  const { client, sockets } = harness();
  const conninfo = client.websocket.public.conninfo();

  sockets[0].fire("open");
  await flush();
  sockets[0].fire("message", { data: '{"id":1,"status":200}' });
  await conninfo;

  const time = client.websocket.public.time();
  await flush();
  sockets[0].fire("message", { data: '{"id":2,"status":200}' });
  await time;

  const subscriptions = client.websocket.public.listSubscriptions();
  await flush();
  sockets[0].fire("message", { data: '{"id":3,"status":200,"result":["btcusd@trade"]}' });
  assert.deepEqual(await subscriptions, { id: 3, status: 200, result: ["btcusd@trade"] });

  const depth = client.websocket.public.depthSnapshot("BTCUSD", { limit: 10 });
  await flush();
  sockets[0].fire("message", { data: '{"id":4,"status":200,"result":{"lastUpdateId":1,"bids":[],"asks":[]}}' });
  await depth;

  assert.deepEqual(sockets[0].sent.map((frame) => JSON.parse(frame)), [
    { id: 1, method: "conninfo" },
    { id: 2, method: "time" },
    { id: 3, method: "LIST_SUBSCRIPTIONS" },
    { id: 4, method: "depth", params: { symbol: "btcusd", limit: 10 } },
  ]);
  client.close();
});

test("stream methods subscribe to documented public stream names", async () => {
  const { client, sockets } = harness();
  const depthUpdates = client.websocket.public.depthUpdates("btcusd", { intervalMs: 100 });
  const depth = client.websocket.public.depth("ethusd", { levels: 20, intervalMs: 100 });
  const contractStatus = client.websocket.public.contractStatus();
  const rfqs = client.websocket.public.rfqs();

  sockets[0].fire("open");
  sockets[1].fire("open");
  await flush();
  sockets[0].fire("message", { data: '{"id":1,"status":200}' });
  sockets[1].fire("message", { data: '{"id":1,"status":200}' });
  sockets[0].fire("message", { data: '{"id":2,"status":200}' });
  sockets[0].fire("message", { data: '{"id":3,"status":200}' });
  await Promise.all([depthUpdates.ready, depth.ready, contractStatus.ready, rfqs.ready]);

  assert.deepEqual(sockets[0].sent.map((frame) => JSON.parse(frame)), [
    { id: 1, method: "SUBSCRIBE", params: ["btcusd@depth@100ms"] },
    { id: 2, method: "SUBSCRIBE", params: ["contractStatus"] },
    { id: 3, method: "SUBSCRIBE", params: ["requestForQuote"] },
  ]);
  assert.deepEqual(sockets[1].sent.map((frame) => JSON.parse(frame)), [
    { id: 1, method: "SUBSCRIBE", params: ["ethusd@depth20@100ms"] },
  ]);
  client.close();
});

test("public status and RFQ validators deliver valid frames", async () => {
  const { client, sockets } = harness();
  const statuses: BoundaryValue[] = [];
  const rfqs: BoundaryValue[] = [];
  const contractStatus = client.websocket.public.contractStatus();
  const requestForQuote = client.websocket.public.rfqs();
  contractStatus.on("message", (message) => statuses.push(message));
  requestForQuote.on("message", (message) => rfqs.push(message));

  sockets[0].fire("open");
  await flush();
  sockets[0].fire("message", { data: '{"id":1,"status":200}' });
  sockets[0].fire("message", { data: '{"id":2,"status":200}' });
  await Promise.all([contractStatus.ready, requestForQuote.ready]);

  sockets[0].fire("message", {
    data: JSON.stringify({
      e: "contractStatus",
      E: 1,
      s: "PRED-EVENT",
      k: "contract-yes",
      c: "OPEN",
      i: 2,
      p: "0.65",
      o: "OPEN",
      n: "100",
    }),
  });
  sockets[0].fire("message", {
    data: JSON.stringify({
      e: "requestForQuote",
      E: 3,
      r: "rfq-1",
      s: "PRED-EVENT",
      l: [{ c: "contract-yes", s: "CONTRACT-YES", o: "YES" }],
      n: "10",
      f: "10",
      S: "OPEN",
      w: 4,
      x: 5,
      c: 6,
    }),
  });

  assert.equal(statuses.length, 1);
  assert.ok(isBoundaryObject(statuses[0]) && isBoundaryString(statuses[0].e));
  assert.equal(statuses[0].e, "contractStatus");
  assert.equal(rfqs.length, 1);
  assert.ok(isBoundaryObject(rfqs[0]) && isBoundaryString(rfqs[0].S));
  assert.equal(rfqs[0].S, "OPEN");
  assert.equal(rfqs[0].s, "PRED-EVENT");
  assert.ok(Array.isArray(rfqs[0].l) && isBoundaryObject(rfqs[0].l[0]));
  assert.equal(rfqs[0].l[0].c, "contract-yes");
  assert.equal(rfqs[0].l[0].s, "CONTRACT-YES");
  assert.equal(rfqs[0].c, 6);
  client.close();
});

test("public financial stream validators reject malformed decimal fields", async () => {
  const { client, sockets } = harness();
  const ticker = client.websocket.public.bookTicker("btcusd");
  const rfqs = client.websocket.public.rfqs();

  sockets[0].fire("open");
  await flush();
  sockets[0].fire("message", { data: '{"id":1,"status":200}' });
  sockets[0].fire("message", { data: '{"id":2,"status":200}' });
  await Promise.all([ticker.ready, rfqs.ready]);

  sockets[0].fire("message", {
    data: JSON.stringify({
      u: 1,
      E: 2,
      s: "btcusd",
      b: "100",
      B: "1",
      a: "101",
      A: "2",
      c: "not-a-decimal",
      C: "1",
    }),
  });
  sockets[0].fire("message", {
    data: JSON.stringify({
      e: "requestForQuote",
      E: 3,
      r: "rfq-1",
      s: "PRED-EVENT",
      l: [{ c: "contract-yes", s: "CONTRACT-YES", o: "YES" }],
      n: "10",
      q: "1",
      f: "1",
      S: "OPEN",
    }),
  });

  assert.equal(ticker.malformedFrameCount, 1);
  assert.equal(rfqs.malformedFrameCount, 1);
  client.close();
});

test("public streams reject malformed typed frames at the transport boundary", async () => {
  const { client, sockets } = harness();
  const trades = client.websocket.public.trades("btcusd");
  const ticker = client.websocket.public.bookTicker("ethusd");
  const depth = client.websocket.public.depthUpdates("solusd");
  const contractStatus = client.websocket.public.contractStatus();
  const rfqs = client.websocket.public.rfqs();

  sockets[0].fire("open");
  await flush();
  for (let id = 1; id <= 5; id++) sockets[0].fire("message", { data: `{"id":${id},"status":200}` });
  await Promise.all([trades.ready, ticker.ready, depth.ready, contractStatus.ready, rfqs.ready]);

  sockets[0].fire("message", { data: '{"E":"bad","s":"btcusd","t":2,"p":"100","q":"1","m":false}' });
  sockets[0].fire("message", { data: '{"E":1,"s":"btcusd","t":2,"p":"not-a-decimal","q":"1","m":false}' });
  sockets[0].fire("message", { data: '{"u":1,"E":2,"s":"ethusd","b":"","B":"1","a":"2","A":"3"}' });
  sockets[0].fire("message", { data: '{"e":"depthUpdate","E":1,"s":"solusd","U":1,"u":1,"b":[["100","1"]],"a":[["101","1e-8"]]}' });
  sockets[0].fire("message", { data: '{"e":"contractStatus"}' });
  sockets[0].fire("message", { data: '{"e":"requestForQuote","l":[]}' });
  sockets[0].fire("message", {
    data: JSON.stringify({
      e: "requestForQuote",
      E: 1,
      r: "rfq-1",
      l: [{ c: "contract-yes", s: 7, o: "YES" }],
      S: "OPEN",
    }),
  });

  assert.equal(trades.malformedFrameCount, 2);
  assert.equal(ticker.malformedFrameCount, 1);
  assert.equal(depth.malformedFrameCount, 1);
  assert.equal(contractStatus.malformedFrameCount, 1);
  assert.equal(rfqs.malformedFrameCount, 2);
  client.close();
});

test("sibling public streams do not count each other's valid frames as malformed", async () => {
  const { client, sockets } = harness();
  const trades = client.websocket.public.trades("btcusd");
  const ticker = client.websocket.public.bookTicker("btcusd");
  const depth = client.websocket.public.depthUpdates("btcusd");

  sockets[0].fire("open");
  await flush();
  for (let id = 1; id <= 3; id++) sockets[0].fire("message", { data: `{"id":${id},"status":200}` });
  await Promise.all([trades.ready, ticker.ready, depth.ready]);

  sockets[0].fire("message", { data: '{"E":1,"s":"btcusd","t":2,"p":"100","q":"1","m":false}' });
  sockets[0].fire("message", { data: '{"u":1,"E":2,"s":"btcusd","b":"100","B":"1","a":"101","A":"2"}' });
  sockets[0].fire("message", { data: '{"e":"depthUpdate","E":3,"s":"btcusd","U":3,"u":3,"b":[["100","1"]],"a":[]}' });

  assert.equal(trades.malformedFrameCount, 0);
  assert.equal(ticker.malformedFrameCount, 0);
  assert.equal(depth.malformedFrameCount, 0);
  client.close();
});

test("sibling public and private rfq streams do not count each other's valid frames as malformed", async () => {
  const { client, sockets } = harness({ auth: auth() });
  const publicRfqs = client.websocket.public.rfqs();
  const privateRfqs = client.websocket.private.rfqDeliveries({ scope: "session" });

  await flush();
  sockets[0].fire("open");
  sockets[1].fire("open");
  await flush();
  sockets[0].fire("message", { data: '{"id":1,"status":200}' });
  sockets[1].fire("message", { data: '{"id":1,"status":200}' });
  await Promise.all([publicRfqs.ready, privateRfqs.ready]);

  sockets[0].fire("message", {
    data: JSON.stringify({
      e: "requestForQuote",
      E: 1,
      r: "rfq-1",
      x: 123,
      l: [{ c: "CONTRACT-1", o: "YES" }],
      S: "OPEN",
    }),
  });

  sockets[1].fire("message", {
    data: JSON.stringify({
      e: "requestForQuote",
      i: "delivery-1",
      E: 2,
      r: "rfq-1",
      x: "ACCEPTED",
      S: "CONFIRMING",
    }),
  });

  assert.equal(publicRfqs.malformedFrameCount, 0);
  assert.equal(privateRfqs.malformedFrameCount, 0);
  client.close();
});

test("public and private reconnects replay only their own subscriptions", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const { client, sockets } = harness({ auth: auth() });
  const trades = client.websocket.public.trades("btcusd");
  const orders = client.websocket.private.orders({ scope: "account" });

  await flush();
  sockets[0].fire("open");
  sockets[1].fire("open");
  await flush();
  sockets[0].fire("message", { data: '{"id":1,"status":200}' });
  sockets[1].fire("message", { data: '{"id":1,"status":200}' });
  await Promise.all([trades.ready, orders.ready]);

  sockets[0].fire("error", { error: new Error("public socket failed") });
  sockets[0].fire("close");
  t.mock.timers.tick(0);
  await flush();
  assert.equal(sockets.length, 3);
  assert.deepEqual(sockets[1].sent.map((frame) => JSON.parse(frame)), [
    { id: 1, method: "SUBSCRIBE", params: ["orders@account"] },
  ]);
  sockets[2].fire("open");
  await flush();
  sockets[2].fire("message", { data: '{"id":1,"status":200}' });

  sockets[1].fire("error", { error: new Error("private socket failed") });
  sockets[1].fire("close");
  t.mock.timers.tick(0);
  await flush();
  assert.equal(sockets.length, 4);
  assert.deepEqual(sockets[2].sent.map((frame) => JSON.parse(frame)), [
    { id: 1, method: "SUBSCRIBE", params: ["btcusd@trade"] },
  ]);
  sockets[3].fire("open");
  await flush();
  sockets[3].fire("message", { data: '{"id":1,"status":200}' });
  client.close();
});

test("private connection control methods do not create a public session", async () => {
  const { client, sockets } = harness({ auth: auth() });
  const orders = client.websocket.private.orders({ scope: "account" });

  await flush();
  assert.equal(sockets.length, 1);
  sockets[0].fire("open");
  await flush();
  sockets[0].fire("message", { data: '{"id":1,"status":200}' });
  await orders.ready;

  const subscriptions = client.websocket.private.listSubscriptions();
  await flush();
  assert.equal(sockets.length, 1);
  assert.deepEqual(JSON.parse(sockets[0].sent[1]), { id: 2, method: "LIST_SUBSCRIPTIONS" });
  sockets[0].fire("message", { data: '{"id":2,"status":200}' });
  await subscriptions;
  client.close();
});

test("stream frames do not resolve pending utility requests", async () => {
  const { client, sockets } = harness();
  const messages: unknown[] = [];
  const trades = client.websocket.public.trades("btcusd");
  trades.on("message", (trade) => messages.push(trade));
  const ping = client.websocket.public.ping();

  sockets[0].fire("open");
  await flush();
  sockets[0].fire("message", { data: '{"id":1,"status":200}' });
  await trades.ready;

  sockets[0].fire("message", { data: '{"E":1,"s":"btcusd","t":2,"p":"100","q":"0.1","m":false}' });
  assert.deepEqual(messages, [{ E: 1, s: "btcusd", t: 2, p: "100", q: "0.1", m: false }]);

  sockets[0].fire("message", { data: '{"id":2,"status":200}' });
  await ping;
  client.close();
});

test("depth updates use the differential public session", async () => {
  const { client, sockets } = harness();
  const stream = client.websocket.public.depthUpdates("btcusd");

  sockets[0].fire("open");
  await flush();
  sockets[0].fire("message", { data: '{"id":1,"status":200}' });
  await stream.ready;
  client.close();
});

test("closing one stream unsubscribes only that stream", async () => {
  const { client, sockets } = harness();
  const trades = client.websocket.public.trades("btcusd");
  const ticker = client.websocket.public.bookTicker("ethusd");

  sockets[0].fire("open");
  await flush();
  sockets[0].fire("message", { data: '{"id":1,"status":200}' });
  sockets[0].fire("message", { data: '{"id":2,"status":200}' });
  await trades.ready;
  await ticker.ready;

  const closed = trades.close();
  await flush();
  assert.deepEqual(JSON.parse(sockets[0].sent[2]), {
    id: 3,
    method: "UNSUBSCRIBE",
    params: ["btcusd@trade"],
  });
  sockets[0].fire("message", { data: '{"id":3,"status":200}' });
  await closed;

  assert.equal(trades.state, "closed");
  assert.equal(sockets[0].sent.length, 3);
  const tickerClosed = ticker.close();
  await flush();
  sockets[0].fire("message", { data: '{"id":4,"status":200}' });
  await tickerClosed;
  client.close();
});

test("typed stream handles route only matching stream frames", async () => {
  const { client, sockets } = harness();
  const trades: unknown[] = [];
  const tickers: unknown[] = [];
  const tradeStream = client.websocket.public.trades("btcusd");
  const tickerStream = client.websocket.public.bookTicker("ethusd");
  tradeStream.on("message", (trade) => trades.push(trade));
  tickerStream.on("message", (ticker) => tickers.push(ticker));

  sockets[0].fire("open");
  await flush();
  sockets[0].fire("message", { data: '{"id":1,"status":200}' });
  sockets[0].fire("message", { data: '{"id":2,"status":200}' });
  await tradeStream.ready;
  await tickerStream.ready;

  sockets[0].fire("message", { data: '{"E":1,"s":"ethusd","t":2,"p":"100","q":"0.1","m":false}' });
  sockets[0].fire("message", { data: '{"u":1,"E":2,"s":"ethusd","b":"99","B":"1","a":"101","A":"2"}' });
  sockets[0].fire("message", { data: '{"E":3,"s":"btcusd","t":4,"p":"200","q":"0.2","m":true}' });

  assert.deepEqual(trades, [{ E: 3, s: "btcusd", t: 4, p: "200", q: "0.2", m: true }]);
  assert.deepEqual(tickers, [{ u: 1, E: 2, s: "ethusd", b: "99", B: "1", a: "101", A: "2" }]);
  client.close();
});

test("concurrent partial depth streams isolate symbol-less snapshots", async () => {
  const { client, sockets } = harness();
  const btcSnapshots: unknown[] = [];
  const ethSnapshots: unknown[] = [];
  const btc = client.websocket.public.depth("btcusd", { levels: 20 });
  const eth = client.websocket.public.depth("ethusd", { levels: 20 });
  btc.on("message", (snapshot) => btcSnapshots.push(snapshot));
  eth.on("message", (snapshot) => ethSnapshots.push(snapshot));

  sockets[0].fire("open");
  await flush();
  sockets[0].fire("message", { data: '{"id":1,"status":200}' });
  sockets[1].fire("open");
  await flush();
  sockets[1].fire("message", { data: '{"id":1,"status":200}' });
  await btc.ready;
  await eth.ready;

  sockets[0].fire("message", { data: '{"lastUpdateId":1,"bids":[["100","1"]],"asks":[["101","1"]]}' });

  assert.deepEqual(btcSnapshots, [{ lastUpdateId: 1, bids: [["100", "1"]], asks: [["101", "1"]] }]);
  assert.deepEqual(ethSnapshots, []);
  client.close();
});

test("client.close() closes active public streams and the shared session", async () => {
  const { client, sockets } = harness();
  const closes: string[] = [];
  const trades = client.websocket.public.trades("btcusd");
  const ticker = client.websocket.public.bookTicker("ethusd");
  const depth = client.websocket.public.depth("solusd", { levels: 5 });
  trades.on("close", () => closes.push("trades"));
  ticker.on("close", () => closes.push("ticker"));
  depth.on("close", () => closes.push("depth"));

  sockets[0].fire("open");
  sockets[1].fire("open");
  await flush();
  sockets[0].fire("message", { data: '{"id":1,"status":200}' });
  sockets[0].fire("message", { data: '{"id":2,"status":200}' });
  sockets[1].fire("message", { data: '{"id":1,"status":200}' });
  await trades.ready;
  await ticker.ready;
  await depth.ready;

  client.close();

  assert.equal(sockets[0].closed, true);
  assert.equal(sockets[1].closed, true);
  assert.deepEqual(closes.sort(), ["depth", "ticker", "trades"]);
});

test("authenticated streams pass upgrade headers and route typed frames", async () => {
  const { client, sockets, options } = harness({ auth: auth() });
  const messages: unknown[] = [];
  const orders = client.websocket.private.orders({ scope: "account" });
  const balances = client.websocket.private.balances({ intervalMs: 1000 });
  const positions = client.websocket.private.positions({ intervalMs: 0 });
  const settlements = client.websocket.private.settlements();
  const rfqs = client.websocket.private.rfqDeliveries({ scope: "session" });
  orders.on("message", (message) => messages.push(message));
  balances.on("message", (message) => messages.push(message));
  positions.on("message", (message) => messages.push(message));
  settlements.on("message", (message) => messages.push(message));
  rfqs.on("message", (message) => messages.push(message));

  await flush();
  sockets[0].fire("open");
  await flush();
  for (let id = 1; id <= 5; id++) sockets[0].fire("message", { data: `{"id":${id},"status":200}` });
  await Promise.all([orders.ready, balances.ready, positions.ready, settlements.ready, rfqs.ready]);

  assert.deepEqual(options[0].headers, {
    "X-GEMINI-APIKEY": "key",
    "X-GEMINI-SIGNATURE": "sig:MTcwMDAwMDAwMA==",
    "X-GEMINI-NONCE": "1700000000",
    "X-GEMINI-PAYLOAD": "MTcwMDAwMDAwMA==",
  });
  assert.deepEqual(sockets[0].sent.map((frame) => JSON.parse(frame)), [
    { id: 1, method: "SUBSCRIBE", params: ["orders@account"] },
    { id: 2, method: "SUBSCRIBE", params: ["balances@account@1s"] },
    { id: 3, method: "SUBSCRIBE", params: ["positions@account"] },
    { id: 4, method: "SUBSCRIBE", params: ["settlements@account"] },
    { id: 5, method: "SUBSCRIBE", params: ["requestForQuote@session"] },
  ]);

  sockets[0].fire("message", { data: '{"e":"orderUpdate","E":1,"s":"GEMI-X","i":2,"X":"NEW","T":3}' });
  sockets[0].fire("message", { data: '{"e":"balanceUpdate","E":4,"u":5,"B":[]}' });
  sockets[0].fire("message", { data: '{"e":"positionReport","E":6,"u":7,"A":8,"P":[]}' });
  sockets[0].fire("message", { data: '{"type":"settlements","settlements":[{"symbol":"BTC-2026","position":"100","outcome":"yes"}]}' });
  sockets[0].fire("message", { data: '{"e":"requestForQuote","i":"delivery-1","E":9,"r":"rfq-1","x":"ACCEPTED","S":"CONFIRMING"}' });

  assert.deepEqual(messages, [
    { e: "orderUpdate", E: 1, s: "GEMI-X", i: 2, X: "NEW", T: 3 },
    { e: "balanceUpdate", E: 4, u: 5, B: [] },
    { e: "positionReport", E: 6, u: 7, A: 8, P: [] },
    { type: "settlements", settlements: [{ symbol: "BTC-2026", position: "100", outcome: "yes" }] },
    { e: "requestForQuote", i: "delivery-1", E: 9, r: "rfq-1", x: "ACCEPTED", S: "CONFIRMING" },
  ]);
  client.close();
});

test("authenticated streams reject and count malformed private frames", async () => {
  const events: DiagnosticEvent[] = [];
  const { client, sockets } = harness({ auth: auth(), onDiagnostic: (event) => events.push(event) });
  const messages: unknown[] = [];
  const orders = client.websocket.private.orders({ scope: "account" });
  const balances = client.websocket.private.balances();
  const positions = client.websocket.private.positions();
  const rfqs = client.websocket.private.rfqDeliveries({ scope: "session" });
  orders.on("message", (message) => messages.push(message));
  balances.on("message", (message) => messages.push(message));
  positions.on("message", (message) => messages.push(message));
  rfqs.on("message", (message) => messages.push(message));

  await flush();
  sockets[0].fire("open");
  await flush();
  for (let id = 1; id <= 4; id++) sockets[0].fire("message", { data: `{"id":${id},"status":200}` });
  await Promise.all([orders.ready, balances.ready, positions.ready, rfqs.ready]);

  sockets[0].fire("message", { data: '{"e":"orderUpdate","E":1,"s":"GEMI-X","i":2,"X":"NEW"}' });
  sockets[0].fire("message", { data: '{"e":"balanceUpdate","E":4,"u":5,"B":[{}]}' });
  sockets[0].fire("message", { data: '{"e":"positionReport","E":6,"u":7,"A":8,"P":[{}]}' });
  sockets[0].fire("message", { data: '{"e":"positionReport","E":6,"u":7,"A":8,"P":[{"t":"ec","s":"GEMI-X","a":[{"t":"position","v":"1","c":1}]}]}' });
  sockets[0].fire("message", { data: '{"e":"requestForQuote","i":"delivery-1","E":9,"r":"rfq-1","x":"ACCEPTED"}' });
  sockets[0].fire("message", { data: '{"e":"orderUpdate","E":1,"s":"GEMI-X","i":2,"X":"NEW","T":3,"p":"NaN"}' });
  sockets[0].fire("message", { data: '{"e":"balanceUpdate","E":4,"u":5,"B":[{"a":"USD","f":"1e3","c":"2"}]}' });
  sockets[0].fire("message", { data: '{"e":"positionReport","E":6,"u":7,"A":8,"P":[{"t":"ec","s":"GEMI-X","a":[{"t":"position","v":"NaN"}]}]}' });
  sockets[0].fire("message", { data: '{"e":"requestForQuote","i":"delivery-1","E":9,"r":"rfq-1","x":"ACCEPTED","S":"CONFIRMING","p":"1e3"}' });

  for (const fields of [
    '"c":1',
    '"S":"HOLD"',
    '"o":"PEGGED"',
    '"O":"MAYBE"',
    '"t":"4"',
    '"m":"yes"',
    '"r":false',
  ]) {
    sockets[0].fire("message", {
      data: `{"e":"orderUpdate","E":1,"s":"GEMI-X","i":2,"X":"NEW","T":3,${fields}}`,
    });
  }

  assert.equal(messages.length, 0);
  assert.equal(orders.malformedFrameCount, 9);
  assert.equal(balances.malformedFrameCount, 2);
  assert.equal(positions.malformedFrameCount, 3);
  assert.equal(rfqs.malformedFrameCount, 2);
  assert.equal(events.filter((event) => event.name === "ws.stream.malformed_frame").length, 16);
  client.close();
});

test("authenticated RFQ delivery validation rejects malformed optional fields and IDs", async () => {
  const { client, sockets } = harness({ auth: auth() });
  const rfqs = client.websocket.private.rfqDeliveries({ scope: "session" });
  await flush();
  sockets[0].fire("open");
  await flush();
  sockets[0].fire("message", { data: '{"id":1,"status":200}' });
  await rfqs.ready;

  for (const field of [
    '{"q":7}',
    '{"p":7}',
    '{"sz":7}',
    '{"vu":-1}',
    '{"qs":"INVALID"}',
    '{"E":-1}',
  ]) {
    const overrides = parseBoundaryRecord(field);
    sockets[0].fire("message", {
      data: JSON.stringify({ e: "requestForQuote", i: "delivery-1", E: 9, r: "rfq-1", x: "ACCEPTED", S: "CONFIRMING", ...overrides }),
    });
  }

  assert.equal(rfqs.malformedFrameCount, 6);
  client.close();
});

test("order-book pending state is bounded by bytes as well as frame count", async () => {
  const { client, sockets } = harness({ webSocketMaxMessageSizeBytes: 1_000_000 });
  const errors: Error[] = [];
  const book = client.orderBook("btcusd");
  book.on("error", (error) => errors.push(error));
  await flush();
  sockets[0].fire("open");
  await flush();
  sockets[0].fire("message", { data: '{"id":1,"status":200}' });
  await flush();

  const largePrice = "1".repeat(900_000);
  for (let i = 0; i < 5; i++) {
    sockets[0].fire("message", {
      data: `{"e":"depthUpdate","E":${i + 1},"s":"btcusd","U":${i + 2},"u":${i + 1},"b":[["${largePrice}","1"]],"a":[]}`,
    });
  }

  assert.equal(errors.length, 1);
  assert.match(errors[0]?.message ?? "", /snapshot buffer exceeded/);
  client.close();
});

test("authenticated settlement streams reject malformed settlement entries", async () => {
  const { client, sockets } = harness({ auth: auth() });
  const messages: unknown[] = [];
  const settlements = client.websocket.private.settlements();
  settlements.on("message", (message) => messages.push(message));

  await flush();
  sockets[0].fire("open");
  await flush();
  sockets[0].fire("message", { data: '{"id":1,"status":200}' });
  await settlements.ready;
  sockets[0].fire("message", { data: '{"type":"settlements","settlements":[{}]}' });

  assert.deepEqual(messages, []);
  assert.equal(settlements.malformedFrameCount, 1);
  client.close();
});

test("position-valued WebSocket decimals accept negative values", async () => {
  const { client, sockets } = harness({ auth: auth() });
  const positions: unknown[] = [];
  const settlements: unknown[] = [];
  const positionStream = client.websocket.private.positions();
  const settlementStream = client.websocket.private.settlements();
  positionStream.on("message", (message) => positions.push(message));
  settlementStream.on("message", (message) => settlements.push(message));

  await flush();
  sockets[0].fire("open");
  await flush();
  sockets[0].fire("message", { data: '{"id":1,"status":200}' });
  sockets[0].fire("message", { data: '{"id":2,"status":200}' });
  await Promise.all([positionStream.ready, settlementStream.ready]);

  const position = { e: "positionReport", E: 1, u: 2, A: 3, P: [{ t: "ec", s: "GEMI-X", a: [{ t: "position", v: "-2.5" }] }] };
  const settlement = { type: "settlements", settlements: [{ symbol: "GEMI-X", position: "-2.5", outcome: "no" }] };
  sockets[0].fire("message", { data: JSON.stringify(position) });
  sockets[0].fire("message", { data: JSON.stringify(settlement) });

  assert.deepEqual(positions, [position]);
  assert.deepEqual(settlements, [settlement]);
  assert.equal(positionStream.malformedFrameCount, 0);
  assert.equal(settlementStream.malformedFrameCount, 0);
  client.close();
});

test("authenticated streams and methods fail before sending without auth", async () => {
  const { client, sockets } = harness();

  assert.throws(() => client.websocket.private.orders({ scope: "account" }), /requires auth/);
  await assert.rejects(
    client.websocket.private.placeOrder({
      symbol: "GEMI-X",
      side: "BUY",
      type: "LIMIT",
      timeInForce: "GTC",
      quantity: "1",
      price: "0.50",
    }),
    /requires auth/,
  );
  assert.equal(sockets.length, 0);
  client.close();
});

test("authenticated order and RFQ methods send one-shot request frames", async () => {
  const { client, sockets } = harness({ auth: auth() });
  const placed = client.websocket.private.placeOrder({
    symbol: "GEMI-X",
    side: "BUY",
    type: "LIMIT",
    timeInForce: "GTC",
    quantity: "1",
    price: "0.50",
  });

  await flush();
  sockets[0].fire("open");
  await flush();
  sockets[0].fire("message", { data: '{"id":1,"status":200,"result":{"orderId":"o1"}}' });
  assert.deepEqual(await placed, { id: 1, status: 200, result: { orderId: "o1" } });

  const canceled = client.websocket.private.cancelOrder({ orderId: "o1" });
  await flush();
  sockets[0].fire("message", { data: '{"id":2,"status":200,"result":{"orderId":"o1"}}' });
  await canceled;

  const cancelAll = client.websocket.private.cancelAllOrders({ confirm: true });
  await flush();
  sockets[0].fire("message", { data: '{"id":3,"status":200}' });
  await cancelAll;

  const cancelSession = client.websocket.private.cancelSessionOrders({ confirm: true });
  await flush();
  sockets[0].fire("message", { data: '{"id":4,"status":200}' });
  await cancelSession;

  const quote = client.websocket.private.rfq.submitQuote({ rfqId: "rfq-1", price: "0.55", quantity: "10" });
  await flush();
  sockets[0].fire("message", { data: '{"id":5,"status":200,"result":{"rfqId":"rfq-1","quoteId":"q1"}}' });
  await quote;

  const withdraw = client.websocket.private.rfq.withdrawQuote({ rfqId: "rfq-1", quoteId: "q1" });
  await flush();
  sockets[0].fire("message", { data: '{"id":6,"status":200,"result":{"rfqId":"rfq-1","quoteId":"q1"}}' });
  await withdraw;

  const confirm = client.websocket.private.rfq.confirmQuote({ rfqId: "rfq-1", quoteId: "q1", confirm: true });
  await flush();
  sockets[0].fire("message", { data: '{"id":7,"status":200,"result":{"rfqId":"rfq-1","quoteId":"q1","confirmed":true}}' });
  await confirm;

  assert.deepEqual(sockets[0].sent.map((frame) => JSON.parse(frame)), [
    { id: 1, method: "order.place", params: { symbol: "GEMI-X", side: "BUY", type: "LIMIT", timeInForce: "GTC", quantity: "1", price: "0.50" } },
    { id: 2, method: "order.cancel", params: { orderId: "o1" } },
    { id: 3, method: "order.cancel_all" },
    { id: 4, method: "order.cancel_session" },
    { id: 5, method: "rfq.submit_quote", params: { rfqId: "rfq-1", price: "0.55", quantity: "10" } },
    { id: 6, method: "rfq.withdraw_quote", params: { rfqId: "rfq-1", quoteId: "q1" } },
    { id: 7, method: "rfq.confirm_quote", params: { rfqId: "rfq-1", quoteId: "q1", confirm: true } },
  ]);
  client.close();
});

test("authenticated request errors reject with SdkError", async () => {
  const { client, sockets } = harness({ auth: auth() });
  const request = client.websocket.private.cancelOrder({ orderId: "o1" });

  await flush();
  sockets[0].fire("open");
  await flush();
  sockets[0].fire("message", { data: '{"id":1,"status":400,"error":{"code":-2010,"msg":"rejected"}}' });

  await assert.rejects(request, SdkError);
  client.close();
});

test("mutating requests reject on reconnect and are not replayed", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const { client, sockets } = harness({ auth: auth() });
  const request = client.websocket.private.cancelOrder({ orderId: "o1" });

  await flush();
  sockets[0].fire("open");
  await flush();
  sockets[0].fire("close");

  await assert.rejects(request, /reconnecting/);
  t.mock.timers.tick(0);
  await flush();
  sockets[1].fire("open");
  assert.deepEqual(sockets[1].sent, []);
  client.close();
});

test("public streams replay exactly once after reconnect and ignore superseded frames", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const { client, sockets } = harness();
  const messages: unknown[] = [];
  const trades = client.websocket.public.trades("btcusd");
  trades.on("message", (message) => messages.push(message));

  sockets[0].fire("open");
  await flush();
  sockets[0].fire("message", { data: '{"id":1,"status":200}' });
  await trades.ready;

  sockets[0].fire("close");
  t.mock.timers.tick(0);
  await flush();
  sockets[0].fire("message", { data: '{"E":1,"s":"btcusd","t":1,"p":"90","q":"1","m":false}' });
  sockets[1].fire("open");
  await flush();

  assert.deepEqual(sockets[1].sent.map((frame) => JSON.parse(frame)), [
    { id: 1, method: "SUBSCRIBE", params: ["btcusd@trade"] },
  ]);
  sockets[1].fire("message", { data: '{"E":2,"s":"btcusd","t":2,"p":"100","q":"1","m":false}' });

  assert.deepEqual(messages, [{ E: 2, s: "btcusd", t: 2, p: "100", q: "1", m: false }]);
  client.close();
});

test("authenticated streams replay with fresh credentials without logging secrets", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let nonce = 1700000000;
  const logs: string[] = [];
  const logger: Logger = {
    debug: (_message, meta) => logs.push(JSON.stringify(meta)),
    info: (_message, meta) => logs.push(JSON.stringify(meta)),
    warn: (_message, meta) => logs.push(JSON.stringify(meta)),
    error: (_message, meta) => logs.push(JSON.stringify(meta)),
  };
  const authenticated: AuthStrategy = {
    nextNonce: () => String(nonce++),
    credentialHeaders: async (payloadBase64) => ({
      "X-GEMINI-APIKEY": "key",
      "X-GEMINI-SIGNATURE": `sig:${payloadBase64}`,
    }),
  };
  const { client, sockets, options } = harness({ auth: authenticated, logger });
  const orders = client.websocket.private.orders({ scope: "session" });

  await flush();
  sockets[0].fire("open");
  await flush();
  sockets[0].fire("message", { data: '{"id":1,"status":200}' });
  await orders.ready;

  sockets[0].fire("close");
  t.mock.timers.tick(0);
  await flush();
  sockets[1].fire("open");
  await flush();

  assert.equal(options[0].headers?.["X-GEMINI-NONCE"], "1700000000");
  assert.equal(options[1].headers?.["X-GEMINI-NONCE"], "1700000001");
  assert.deepEqual(sockets[1].sent.map((frame) => JSON.parse(frame)), [
    { id: 1, method: "SUBSCRIBE", params: ["orders@session"] },
  ]);
  assert.equal(logs.some((entry) => /key|sig:|1700000000|1700000001|X-GEMINI-PAYLOAD/i.test(entry)), false);
  client.close();
});

test("ping, time, and conninfo reject on reconnect and are not replayed", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const { client, sockets } = harness();
  const requests = [client.websocket.public.ping(), client.websocket.public.time(), client.websocket.public.conninfo()];

  sockets[0].fire("open");
  await flush();
  sockets[0].fire("close");
  await Promise.all(requests.map((request) => assert.rejects(request, /reconnecting/)));

  t.mock.timers.tick(0);
  await flush();
  sockets[1].fire("open");
  assert.deepEqual(sockets[1].sent, []);
  client.close();
});

test("closing one stream detaches its listener before unsubscribe acknowledgement", async () => {
  const { client, sockets } = harness();
  const trades: unknown[] = [];
  const tickers: unknown[] = [];
  const tradeStream = client.websocket.public.trades("btcusd");
  const tickerStream = client.websocket.public.bookTicker("ethusd");
  tradeStream.on("message", (message) => trades.push(message));
  tickerStream.on("message", (message) => tickers.push(message));

  sockets[0].fire("open");
  await flush();
  sockets[0].fire("message", { data: '{"id":1,"status":200}' });
  sockets[0].fire("message", { data: '{"id":2,"status":200}' });
  await Promise.all([tradeStream.ready, tickerStream.ready]);

  const closed = tradeStream.close();
  await flush();
  sockets[0].fire("message", { data: '{"E":3,"s":"btcusd","t":3,"p":"100","q":"1","m":false}' });
  sockets[0].fire("message", { data: '{"u":4,"E":4,"s":"ethusd","b":"99","B":"1","a":"101","A":"2"}' });
  assert.deepEqual(trades, []);
  assert.deepEqual(tickers, [{ u: 4, E: 4, s: "ethusd", b: "99", B: "1", a: "101", A: "2" }]);

  sockets[0].fire("message", { data: '{"id":3,"status":200}' });
  await closed;
  client.close();
});

test("malformed stream frames emit errors and later valid frames still arrive", async () => {
  const { client, sockets } = harness();
  const errors: Error[] = [];
  const messages: unknown[] = [];
  const trades = client.websocket.public.trades("btcusd");
  trades.on("error", (error) => errors.push(error));
  trades.on("message", (message) => messages.push(message));

  sockets[0].fire("open");
  await flush();
  sockets[0].fire("message", { data: '{"id":1,"status":200}' });
  await trades.ready;
  sockets[0].fire("message", { data: "not-json" });
  sockets[0].fire("message", { data: '{"E":2,"s":"btcusd","t":2,"p":"100","q":"1","m":false}' });

  assert.equal(errors.length, 1);
  assert.match(errors[0].message, /malformed WebSocket frame/);
  assert.deepEqual(messages, [{ E: 2, s: "btcusd", t: 2, p: "100", q: "1", m: false }]);
  client.close();
});

test("broad cancellation methods require explicit confirmation", async () => {
  const { client } = harness({ auth: auth() });

  await assert.rejects(client.websocket.private.cancelAllOrders({ confirm: false }), /confirm: true/);
  await assert.rejects(client.websocket.private.cancelSessionOrders({ confirm: false }), /confirm: true/);
  client.close();
});

test("OAuth token refresh triggers during WebSocket reconnect", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });

  // Simulate an OAuthAuth-like strategy: first call returns an expired-then-refreshed token,
  // second call (reconnect) triggers a refresh and returns a new token.
  let credentialCalls = 0;
  const oauthLike: AuthStrategy = {
    nextNonce: () => undefined,
    credentialHeaders: async () => {
      credentialCalls++;
      if (credentialCalls === 1) {
        return { Authorization: "Bearer token-v1" };
      }
      // Simulate refresh delay (as OAuthAuth would internally refresh)
      await new Promise<void>((r) => setImmediate(r));
      return { Authorization: "Bearer token-v2-refreshed" };
    },
  };

  const sockets: FakeSocket[] = [];
  const capturedOptions: SocketFactoryOptions[] = [];
  const client = new GeminiMarkets({
    env: "sandbox",
    auth: oauthLike,
    webSocketFactory: (_url: string, opts: SocketFactoryOptions) => {
      const socket = new FakeSocket();
      sockets.push(socket);
      capturedOptions.push(opts);
      return socket;
    },
  });

  // Initial connection
  const orders = client.websocket.private.orders({ scope: "session" });
  await flush();
  sockets[0].fire("open");
  await flush();
  sockets[0].fire("message", { data: '{"id":1,"status":200}' });
  await orders.ready;

  // Verify first connection used token-v1
  assert.equal(capturedOptions[0].headers?.Authorization, "Bearer token-v1");

  // Simulate disconnect → reconnect
  sockets[0].fire("close");
  t.mock.timers.tick(0);
  await flush();
  // Let the async refresh resolve
  await flush();
  sockets[1].fire("open");
  await flush();

  // Verify reconnect used the refreshed token
  assert.equal(capturedOptions[1].headers?.Authorization, "Bearer token-v2-refreshed");
  assert.equal(credentialCalls, 2, "credentialHeaders should be called twice (initial + reconnect)");

  client.close();
});

test("browser OAuth is REST-only and exposes no private WebSocket namespace", async () => {
  const tokens: OAuthTokens = {
    accessToken: "browser-token",
    refreshToken: "browser-refresh",
    tokenType: "bearer",
    scope: "orders:create",
    expiresAt: 1_800_000_000_000,
  };
  const store: OAuthTokenStore = {
    load: async () => tokens,
    save: async () => {},
    clear: async () => {},
    consumeAuthorizationState: async () => true,
    runExclusive: async <T>(op: () => Promise<T>) => op(),
  };
  const oauthAuth = new BrowserOAuthAuth({
    env: "sandbox",
    client: { type: "public", clientId: "browser-test", redirectUri: "http://localhost/cb" },
    tokenStore: store,
    now: () => 1_700_000_000_000,
  });

  const capturedOptions: SocketFactoryOptions[] = [];
  const sockets: FakeSocket[] = [];
  const client = createClient({
    env: "sandbox",
    auth: oauthAuth,
    webSocketFactory: (_url: string, options: SocketFactoryOptions) => {
      const socket = new FakeSocket();
      sockets.push(socket);
      capturedOptions.push(options);
      return socket;
    },
  });

  const trades = client.websocket.public.trades("BTCUSD");
  await flush();
  assert.equal(sockets.length, 1);
  assert.equal(capturedOptions[0].headers, undefined, "browser OAuth must not be attached to WebSocket upgrades");
  sockets[0].fire("open");
  await flush();
  sockets[0].fire("message", { data: '{"id":1,"status":200}' });
  await trades.ready;
  assert.equal(Object.hasOwn(client.websocket, "private"), false);
  assert.equal(Object.hasOwn(client.websocket.public, "orders"), false);
  assert.equal(sockets.length, 1);
  client.close();
});
