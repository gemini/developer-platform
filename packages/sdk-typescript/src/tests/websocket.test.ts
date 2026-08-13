import test from "node:test";
import assert from "node:assert/strict";

import { BrowserOAuthAuth, GeminiMarkets, GeminiWebSocket, SdkError, type AuthStrategy, type OAuthTokenStore, type OAuthTokens } from "../browser/index.js";
import type { DiagnosticEvent } from "../diagnostics.js";
import type { Logger } from "../logging.js";
import type { SocketFactoryOptions, SocketLike } from "../transport.js";
import { FakeSocket } from "./fake-socket.js";


function auth(): AuthStrategy {
  return {
    nextNonce: () => "1700000000",
    credentialHeaders: async (payloadBase64) => ({
      "X-GEMINI-APIKEY": "key",
      "X-GEMINI-SIGNATURE": `sig:${payloadBase64}`,
    }),
  };
}

function harness(opts?: { auth?: AuthStrategy; logger?: Logger; onDiagnostic?: (event: DiagnosticEvent) => void; env?: "production" | "sandbox"; timeoutMs?: number }) {
  const sockets: FakeSocket[] = [];
  const options: SocketFactoryOptions[] = [];
  const client = new GeminiMarkets({
    env: opts?.env ?? "sandbox",
    auth: opts?.auth,
    logger: opts?.logger,
    onDiagnostic: opts?.onDiagnostic,
    timeoutMs: opts?.timeoutMs,
    webSocketFactory: (_url: string, socketOptions: SocketFactoryOptions) => {
      const socket = new FakeSocket();
      sockets.push(socket);
      options.push(socketOptions);
      return socket;
    },
  } as never);
  return { client, sockets, options };
}

test("WebSocket diagnostics classify control and mutation traffic without frames", async () => {
  const events: DiagnosticEvent[] = [];
  const { client, sockets } = harness({ auth: auth(), onDiagnostic: (event) => events.push(event) });
  const stream = client.websocket.trades("btcusd");
  await flush();
  sockets[0].fire("open");
  await flush();
  sockets[0].fire("message", { data: '{"id":1,"status":200}' });
  await stream.ready;
  const order = client.websocket.placeOrder({
    symbol: "btcusd",
    side: "BUY",
    type: "LIMIT",
    quantity: "1",
    price: "100",
    clientOrderId: "client-1",
  } as never).catch(() => undefined);
  await flush();
  sockets[0].fire("message", { data: '{"id":2,"status":200}' });
  await order;

  assert.ok(events.some((event) => event.traffic === "control"));
  const mutation = events.find((event) => event.name === "ws.request.start" && event.traffic === "mutation");
  assert.deepEqual(mutation?.operationContext, { operation: "order.place", clientOrderId: "client-1" });
  assert.equal(events.some((event) => "body" in event || JSON.stringify(event).includes("X-GEMINI-SIGNATURE")), false);
  assert.equal(JSON.stringify(events).includes("btcusd@trade"), false);
  client.close();
});

async function flush(): Promise<void> {
  await new Promise<void>((resolve) => setImmediate(resolve));
}

test("public streams share one underlying WebSocket session", async () => {
  const { client, sockets } = harness({ env: "production" });
  const trades = client.websocket.trades("btcusd");
  const ticker = client.websocket.bookTicker("ethusd");

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

test("generic stream listeners support AbortSignal lifecycle", async () => {
  const { client, sockets } = harness();
  const controller = new AbortController();
  const messages: unknown[] = [];
  const trades = client.websocket.trades("btcusd");
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

test("stream state exposes a socket failure without an error listener", async () => {
  const { client, sockets } = harness();
  const trades = client.websocket.trades("btcusd");
  sockets[0].fire("open");
  await flush();
  sockets[0].fire("message", { data: '{"id":1,"status":200}' });
  await trades.ready;

  sockets[0].fire("error", new Error("socket failed"));

  assert.equal(trades.state, "failed");
  assert.equal((trades.lastError?.cause as Error | undefined)?.message, "socket failed");
  client.close();
});

test("generic streams count and diagnose malformed known frames", async () => {
  const events: DiagnosticEvent[] = [];
  const { client, sockets } = harness({ onDiagnostic: (event) => events.push(event) });
  const trades = client.websocket.trades("btcusd");
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
  const trades = client.websocket.trades("btcusd");
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
  const book = websocket.orderBook("btcusd");

  await flush();
  assert.deepEqual(urls, ["wss://example.test/?foo=bar&snapshot=-1"]);
  sockets[0].fire("open");
  await flush();
  sockets[0].fire("message", { data: '{"id":1,"status":200}' });
  sockets[0].fire("message", { data: '{"e":"depthUpdate","E":1,"s":"btcusd","U":1,"u":1,"b":[["100","1"]],"a":[["101","1"]]}' });
  await flush();

  assert.deepEqual(book.bestBid(), { price: "100", qty: "1" });
  websocket.close();
});

test("orderBook uses a snapshot session separate from public streams", async () => {
  const { client, sockets } = harness();
  const trades: unknown[] = [];
  const book = client.orderBook("btcusd");
  const tradeStream = client.websocket.trades("ethusd");
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

  sockets[0].fire("message", { data: '{"e":"depthUpdate","E":1,"s":"btcusd","U":1,"u":1,"b":[["100","1"]],"a":[]}' });
  sockets[0].fire("message", { data: '{"e":"depthUpdate","E":2,"s":"btcusd","U":1,"u":2,"b":[["100","2"]],"a":[]}' });
  sockets[0].fire("message", { data: '{"id":1,"status":200}' });
  await flush();

  assert.deepEqual(book.bestBid(), { price: "100", qty: "2" });
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
  const trades = client.websocket.trades("ethusd");

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

test("utility methods resolve through request correlation", async () => {
  const { client, sockets } = harness();
  const ping = client.websocket.ping();

  sockets[0].fire("open");
  await flush();
  assert.deepEqual(JSON.parse(sockets[0].sent[0]), { id: 1, method: "ping" });

  sockets[0].fire("message", { data: '{"id":1,"status":200,"result":{"pong":true}}' });
  assert.deepEqual(await ping, { id: 1, status: 200, result: { pong: true } });
  client.close();
});

test("utility methods send documented public request frames", async () => {
  const { client, sockets } = harness();
  const conninfo = client.websocket.conninfo();

  sockets[0].fire("open");
  await flush();
  sockets[0].fire("message", { data: '{"id":1,"status":200}' });
  await conninfo;

  const time = client.websocket.time();
  await flush();
  sockets[0].fire("message", { data: '{"id":2,"status":200}' });
  await time;

  const subscriptions = client.websocket.listSubscriptions();
  await flush();
  sockets[0].fire("message", { data: '{"id":3,"status":200,"result":["btcusd@trade"]}' });
  assert.deepEqual(await subscriptions, { id: 3, status: 200, result: ["btcusd@trade"] });

  const depth = client.websocket.depthSnapshot("BTCUSD", { limit: 10 });
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
  const depthUpdates = client.websocket.depthUpdates("btcusd", { intervalMs: 100 });
  const depth = client.websocket.depth("ethusd", { levels: 20, intervalMs: 100 });
  const contractStatus = client.websocket.contractStatus();
  const rfqs = client.websocket.rfqs();

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

test("stream frames do not resolve pending utility requests", async () => {
  const { client, sockets } = harness();
  const messages: unknown[] = [];
  const trades = client.websocket.trades("btcusd");
  trades.on("message", (trade) => messages.push(trade));
  const ping = client.websocket.ping();

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
  const stream = client.websocket.depthUpdates("btcusd");

  sockets[0].fire("open");
  await flush();
  sockets[0].fire("message", { data: '{"id":1,"status":200}' });
  await stream.ready;
  client.close();
});

test("closing one stream unsubscribes only that stream", async () => {
  const { client, sockets } = harness();
  const trades = client.websocket.trades("btcusd");
  const ticker = client.websocket.bookTicker("ethusd");

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
  const tradeStream = client.websocket.trades("btcusd");
  const tickerStream = client.websocket.bookTicker("ethusd");
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
  const btc = client.websocket.depth("btcusd", { levels: 20 });
  const eth = client.websocket.depth("ethusd", { levels: 20 });
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
  const trades = client.websocket.trades("btcusd");
  const ticker = client.websocket.bookTicker("ethusd");
  const depth = client.websocket.depth("solusd", { levels: 5 });
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
  const orders = client.websocket.orders({ scope: "account" });
  const balances = client.websocket.balances({ intervalMs: 1000 });
  const positions = client.websocket.positions({ intervalMs: 0 });
  const rfqs = client.websocket.rfqDeliveries({ scope: "session" });
  orders.on("message", (message) => messages.push(message));
  balances.on("message", (message) => messages.push(message));
  positions.on("message", (message) => messages.push(message));
  rfqs.on("message", (message) => messages.push(message));

  await flush();
  sockets[0].fire("open");
  await flush();
  for (let id = 1; id <= 4; id++) sockets[0].fire("message", { data: `{"id":${id},"status":200}` });
  await Promise.all([orders.ready, balances.ready, positions.ready, rfqs.ready]);

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
    { id: 4, method: "SUBSCRIBE", params: ["requestForQuote@session"] },
  ]);

  sockets[0].fire("message", { data: '{"e":"orderUpdate","E":1,"s":"GEMI-X","i":2,"X":"NEW","T":3}' });
  sockets[0].fire("message", { data: '{"e":"balanceUpdate","E":4,"u":5,"B":[]}' });
  sockets[0].fire("message", { data: '{"e":"positionReport","E":6,"u":7,"A":8,"P":[]}' });
  sockets[0].fire("message", { data: '{"e":"requestForQuote","i":"delivery-1","E":9,"r":"rfq-1","x":"ACCEPTED","S":"CONFIRMING"}' });

  assert.deepEqual(messages, [
    { e: "orderUpdate", E: 1, s: "GEMI-X", i: 2, X: "NEW", T: 3 },
    { e: "balanceUpdate", E: 4, u: 5, B: [] },
    { e: "positionReport", E: 6, u: 7, A: 8, P: [] },
    { e: "requestForQuote", i: "delivery-1", E: 9, r: "rfq-1", x: "ACCEPTED", S: "CONFIRMING" },
  ]);
  client.close();
});

test("authenticated streams and methods fail before sending without auth", async () => {
  const { client, sockets } = harness();

  assert.throws(() => client.websocket.orders({ scope: "account" }), /requires auth/);
  await assert.rejects(
    client.websocket.placeOrder({
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
  const placed = client.websocket.placeOrder({
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

  const canceled = client.websocket.cancelOrder({ orderId: "o1" });
  await flush();
  sockets[0].fire("message", { data: '{"id":2,"status":200,"result":{"orderId":"o1"}}' });
  await canceled;

  const cancelAll = client.websocket.cancelAllOrders({ confirm: true });
  await flush();
  sockets[0].fire("message", { data: '{"id":3,"status":200}' });
  await cancelAll;

  const cancelSession = client.websocket.cancelSessionOrders({ confirm: true });
  await flush();
  sockets[0].fire("message", { data: '{"id":4,"status":200}' });
  await cancelSession;

  const quote = client.websocket.rfq.submitQuote({ rfqId: "rfq-1", price: "0.55", quantity: "10" });
  await flush();
  sockets[0].fire("message", { data: '{"id":5,"status":200,"result":{"rfqId":"rfq-1","quoteId":"q1"}}' });
  await quote;

  const withdraw = client.websocket.rfq.withdrawQuote({ rfqId: "rfq-1", quoteId: "q1" });
  await flush();
  sockets[0].fire("message", { data: '{"id":6,"status":200,"result":{"rfqId":"rfq-1","quoteId":"q1"}}' });
  await withdraw;

  const confirm = client.websocket.rfq.confirmQuote({ rfqId: "rfq-1", quoteId: "q1", confirm: true });
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
  const request = client.websocket.cancelOrder({ orderId: "o1" });

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
  const request = client.websocket.cancelOrder({ orderId: "o1" });

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
  const trades = client.websocket.trades("btcusd");
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
  const orders = client.websocket.orders({ scope: "session" });

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
  const requests = [client.websocket.ping(), client.websocket.time(), client.websocket.conninfo()];

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
  const tradeStream = client.websocket.trades("btcusd");
  const tickerStream = client.websocket.bookTicker("ethusd");
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
  const trades = client.websocket.trades("btcusd");
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

  await assert.rejects(client.websocket.cancelAllOrders({ confirm: false }), /confirm: true/);
  await assert.rejects(client.websocket.cancelSessionOrders({ confirm: false }), /confirm: true/);
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
  } as never);

  // Initial connection
  const orders = client.websocket.orders({ scope: "session" });
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

test("BrowserOAuthAuth Bearer header flows through to WebSocket upgrade", async () => {
  // Wire a real BrowserOAuthAuth (with pre-loaded tokens) into GeminiMarkets
  // and verify the Bearer header reaches the socket factory.
  const tokens: OAuthTokens = {
    accessToken: "ws-bearer-token",
    refreshToken: "ws-refresh",
    tokenType: "bearer",
    scope: "orders:create",
    expiresAt: 1_800_000_000_000,
  };
  const store: OAuthTokenStore = {
    load: async () => tokens,
    save: async () => {},
    clear: async () => {},
    runExclusive: async <T>(op: () => Promise<T>) => op(),
  };
  const oauthAuth = new BrowserOAuthAuth({
    client: { type: "public", clientId: "ws-test", redirectUri: "http://localhost/cb" },
    tokenStore: store,
    now: () => 1_700_000_000_000,
  });

  const capturedOptions: SocketFactoryOptions[] = [];
  const sockets: FakeSocket[] = [];
  const client = new GeminiMarkets({
    env: "sandbox",
    auth: oauthAuth,
    webSocketFactory: (_url: string, opts: SocketFactoryOptions) => {
      const socket = new FakeSocket();
      sockets.push(socket);
      capturedOptions.push(opts);
      return socket;
    },
  } as never);

  // Open an authenticated stream
  const orders = client.websocket.orders({ scope: "session" });
  await flush();
  await flush(); // credentialHeaders is async — socket creation may need an extra tick
  sockets[0].fire("open");
  await flush();
  sockets[0].fire("message", { data: '{"id":1,"status":200}' });
  await orders.ready;

  // Verify the Bearer header made it to the socket upgrade
  assert.equal(capturedOptions[0].headers?.Authorization, "Bearer ws-bearer-token");
  // OAuth does not use HMAC headers
  assert.equal(capturedOptions[0].headers?.["X-GEMINI-APIKEY"], undefined);
  assert.equal(capturedOptions[0].headers?.["X-GEMINI-SIGNATURE"], undefined);

  client.close();
});
