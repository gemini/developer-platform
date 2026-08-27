import test from "node:test";
import assert from "node:assert/strict";

import { isPlainDecimal } from "../../utils/decimal.js";
import { parseLosslessJson } from "../../transport/http.js";
import { SdkError } from "../../errors.js";
import { OrderBook } from "../../services/market-data/orderbook.js";
import { WebSocketSession } from "../../websocket/session.js";
import { GeminiWebSocket } from "../../websocket/server.js";
import { FakeSocket } from "../support/fake-socket.js";
import { isBoundaryNumber, isBoundaryObject, type BoundaryValue } from "../../utils/boundary-value.js";

/** A reproducible generator keeps property failures debuggable in CI. */
class SeededRandom {
  constructor(private state: number) {}

  nextInt(maxExclusive: number): number {
    this.state = (Math.imul(this.state, 1664525) + 1013904223) >>> 0;
    return Math.floor((this.state / 0x1_0000_0000) * maxExclusive);
  }
}

async function flush(): Promise<void> {
  await new Promise<void>((resolve) => setImmediate(resolve));
}

function malformedDepthDiff(value: BoundaryValue): Parameters<OrderBook["applyDiff"]>[0] {
  // SAFETY: Fuzz fixtures intentionally bypass the valid depth-diff type to exercise rejection paths.
  return value as Parameters<OrderBook["applyDiff"]>[0];
}

function malformedJsonCorpus(count: number): string[] {
  const random = new SeededRandom(0xa55ec143);
  const corpus: string[] = [];
  const alphabet = "{}[],:\\\"0123456789abcdefnrt \\t\\n";

  for (let i = 0; i < count; i++) {
    const textLength = random.nextInt(24);
    let text = "";
    for (let j = 0; j < textLength; j++) text += alphabet[random.nextInt(alphabet.length)];
    const validFrame = JSON.stringify({
      id: i,
      text,
      nested: [i % 7, { value: i % 3 === 0 }],
    });
    // Removing at least the outer closing brace guarantees a malformed frame while
    // varying the truncation point exercises strings, arrays, numbers, and escapes.
    const truncation = 1 + random.nextInt(Math.min(16, validFrame.length - 1));
    corpus.push(validFrame.slice(0, validFrame.length - truncation));
  }

  return corpus;
}

function randomJsonishCorpus(count: number): string[] {
  const random = new SeededRandom(0x5eed1432);
  const alphabet = "{}[],:\\\"0123456789abcdefnrt-+. e\n\t";
  const corpus: string[] = [];
  for (let i = 0; i < count; i++) {
    const length = random.nextInt(96);
    let text = "";
    for (let j = 0; j < length; j++) text += alphabet[random.nextInt(alphabet.length)];
    corpus.push(text);
  }
  return corpus;
}

function nativeParserAccepts(text: string): boolean {
  try {
    JSON.parse(text);
    return true;
  } catch {
    return false;
  }
}

test("lossless JSON parsing agrees with JSON.parse on generated ordinary inputs", () => {
  const corpus = [...malformedJsonCorpus(512), ...randomJsonishCorpus(512)];

  for (const [index, text] of corpus.entries()) {
    const nativeAccepted = nativeParserAccepts(text);
    let losslessAccepted = false;
    try {
      parseLosslessJson(text);
      losslessAccepted = true;
    } catch (error) {
      assert.ok(error instanceof SyntaxError, `unexpected parser error at case ${index}`);
    }
    assert.equal(losslessAccepted, nativeAccepted, `parser acceptance mismatch at case ${index}: ${JSON.stringify(text)}`);
  }
});

test("malformed WebSocket JSON never tears down the session or blocks later frames", async () => {
  const socket = new FakeSocket();
  const session = new WebSocketSession({
    url: "wss://example.test",
    socketFactory: () => socket,
  });
  const errors: unknown[] = [];
  const messages: unknown[] = [];
  session.on("error", (error) => errors.push(error));
  session.on("message", (message) => messages.push(message));

  const connected = session.connect();
  socket.fire("open");
  await connected;

  const corpus = malformedJsonCorpus(512);
  for (const data of corpus) socket.fire("message", { data });

  assert.equal(errors.length, corpus.length);
  assert.equal(messages.length, 0);
  assert.equal(socket.closed, false);

  socket.fire("message", { data: '{"ok":true}' });
  assert.deepEqual(messages, [{ ok: true }]);
  session.close();
});

test("plain decimal validation matches the order-book wire grammar", () => {
  for (const value of ["0", "100", "100.", ".5", "0100.50", "0.00000001"]) {
    assert.equal(isPlainDecimal(value), true, `valid wire decimal rejected: ${value}`);
  }

  for (const value of ["", ".", "1..0", "+1", "-1", " 1", "1 ", "1e-8", "NaN"]) {
    assert.equal(isPlainDecimal(value), false, `malformed wire decimal accepted: ${value}`);
  }
  for (const value of [undefined, null, 1, [], {}]) {
    assert.equal(isPlainDecimal(value), false, `non-string wire decimal accepted: ${String(value)}`);
  }
});

test("order-book mutations remain atomic across generated malformed updates", () => {
  const random = new SeededRandom(0x0dde1432);
  const book = new OrderBook();
  book.applySnapshot({ lastUpdateId: 42, bids: [["100.5", "2"], ["100.4", "1"]], asks: [["101", "3"]] });

  const malformedLevels: unknown[] = [
    ["NaN", "1"],
    ["100", "1e-8"],
    ["+100", "1"],
    ["100", "-1"],
    ["100", " 1"],
    ["100", ""],
    ["100"],
    [1, 2],
    "12",
    null,
  ];

  for (let i = 0; i < 512; i++) {
    const malformed = malformedLevels[random.nextInt(malformedLevels.length)];
    for (const malformedSide of ["b", "a"] as const) {
      const before = { id: book.lastUpdateId, snapshot: book.snapshot() };
      const diff = malformedDepthDiff({
        e: "depthUpdate",
        E: before.id,
        s: "TEST",
        U: before.id,
        u: before.id + 1n,
        b: malformedSide === "b"
          ? [["100.5", String((i % 9) + 1)], malformed]
          : [["100.5", String((i % 9) + 1)]],
        a: malformedSide === "a"
          ? [["101", String((i % 9) + 1)], malformed]
          : [],
      });

      assert.throws(
        () => book.applyDiff(diff),
        SdkError,
        `malformed ${malformedSide}-side update ${i} must be rejected`,
      );
      assert.equal(book.lastUpdateId, before.id, `malformed ${malformedSide}-side update ${i} advanced the sequence`);
      assert.deepEqual(
        book.snapshot(),
        before.snapshot,
        `malformed ${malformedSide}-side update ${i} partially mutated the book`,
      );
    }
  }
});

test("generated valid depth frames do not exhaust pending order-book memory", async () => {
  const sockets: FakeSocket[] = [];
  const websocket = new GeminiWebSocket({
    url: "wss://example.test",
    socketFactory: () => {
      const socket = new FakeSocket();
      sockets.push(socket);
      return socket;
    },
  });
  const errors: unknown[] = [];
  const book = websocket.public.orderBook("btcusd");
  book.on("error", (error) => errors.push(error));

  await flush();
  sockets[0]!.fire("open");
  await flush();
  sockets[0]!.fire("message", { data: '{"id":1,"status":200}' });
  await flush();
  for (let i = 0; i < 2048; i++) {
    sockets[0]!.fire("message", {
      data: `{"e":"depthUpdate","E":${i + 1},"s":"btcusd","U":${i + 2},"u":${i + 1},"b":[["100","1"]],"a":[]}`,
    });
  }

  assert.equal(errors.length, 1);
  if (!(errors[0] instanceof Error)) throw new Error("expected an Error instance");
  assert.match(errors[0].message, /snapshot buffer exceeded/);
  assert.equal(book.bestBid(), undefined);
  websocket.close();
});

test("stream iterator memory stays bounded under generated valid traffic", async () => {
  const sockets: FakeSocket[] = [];
  const websocket = new GeminiWebSocket({
    url: "wss://example.test",
    socketFactory: () => {
      const socket = new FakeSocket();
      sockets.push(socket);
      return socket;
    },
  });
  const stream = websocket.public.trades("btcusd", { highWaterMark: 8 });

  await flush();
  sockets[0]!.fire("open");
  await flush();
  sockets[0]!.fire("message", { data: '{"id":1,"status":200}' });
  await stream.ready;

  for (let i = 0; i < 2048; i++) {
    sockets[0]!.fire("message", {
      data: `{"E":${i},"s":"btcusd","t":${i},"p":"100","q":"1","m":false}`,
    });
  }

  const iterator = stream[Symbol.asyncIterator]();
  const values: number[] = [];
  for (let i = 0; i < 8; i++) {
    const result = await iterator.next();
    assert.equal(result.done, false);
    if (!isBoundaryObject(result.value) || !isBoundaryNumber(result.value.t)) throw new Error("stream frame is missing timestamp");
    values.push(result.value.t);
  }
  assert.deepEqual(values, [2040, 2041, 2042, 2043, 2044, 2045, 2046, 2047]);
  websocket.close();
});
