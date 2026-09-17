import test from "node:test";
import assert from "node:assert/strict";

import { GeminiWebSocket } from "../../websocket/server.js";
import type { WebSocketStream } from "../../websocket/public.js";
import type { WebSocketScopeOptions } from "../../websocket/server.js";
import type { AuthStrategy } from "../../transport/http.js";
import { parseBoundaryRecord } from "../support/http-fixtures.js";
import { createWebSocketHarness } from "../support/ws-harness.js";
import { isBoundaryObject, type BoundaryRecord, type BoundaryValue } from "../../utils/boundary-value.js";
import { loadCase, loadManifest } from "./support/fixtures.js";

async function flush(): Promise<void> {
  await new Promise<void>((resolve) => setImmediate(resolve));
}

function auth(): AuthStrategy {
  return {
    nextNonce: () => "1700000000",
    credentialHeaders: async (payloadBase64) => ({
      "X-GEMINI-APIKEY": "conformance-api-key",
      "X-GEMINI-SIGNATURE": `conformance:${payloadBase64}`,
    }),
  };
}

function record(value: BoundaryValue | undefined): BoundaryRecord | undefined {
  return isBoundaryObject(value) ? value : undefined;
}

function eventStream(client: GeminiWebSocket, fixture: BoundaryRecord): WebSocketStream<BoundaryValue> {
  const stream = String(fixture.stream);
  const symbol = typeof fixture.symbol === "string" ? fixture.symbol : "BTCUSD";
  switch (stream) {
    case "trades":
      return client.public.trades(symbol) as unknown as WebSocketStream<BoundaryValue>;
    case "bookTicker":
      return client.public.bookTicker(symbol) as unknown as WebSocketStream<BoundaryValue>;
    case "depthUpdates":
    case "depth":
      return client.public.depthUpdates(symbol) as unknown as WebSocketStream<BoundaryValue>;
    case "orders":
      return client.private.orders({ scope: "account" } as WebSocketScopeOptions) as unknown as WebSocketStream<BoundaryValue>;
    case "balances":
      return client.private.balances() as unknown as WebSocketStream<BoundaryValue>;
    default:
      assert.fail(`unsupported wsEvent stream: ${stream}`);
  }
}

function assertExpectedFields(message: BoundaryRecord, expected: BoundaryRecord): void {
  const fields = record(expected.fields);
  assert.ok(fields, "wsEvent fixture expect.fields must be an object");
  for (const [name, rawExpectation] of Object.entries(fields)) {
    const fieldExpectation = record(rawExpectation);
    assert.ok(fieldExpectation, `expected field ${name} must be an object`);
    const actual = message[name];
    assert.notEqual(actual, undefined, `event field ${name} must be present`);
    const text = String(fieldExpectation.text);
    if (fieldExpectation.compare === "caseInsensitive") {
      assert.equal(String(actual).toLowerCase(), text.toLowerCase(), `event field ${name} differs`);
    } else {
      assert.equal(String(actual), text, `event field ${name} differs`);
    }
    if (/^-?\d+$/.test(text) &&
      (BigInt(text) > BigInt(Number.MAX_SAFE_INTEGER) || BigInt(text) < BigInt(Number.MIN_SAFE_INTEGER))) {
      assert.equal(typeof actual, "bigint", `unsafe event field ${name} must remain lossless`);
    }
  }
}

test("wsEvent fixtures route and decode typed events", async () => {
  const manifest = await loadManifest();
  const suite = manifest.suites.find((candidate) => candidate.kind === "wsEvent");
  assert.ok(suite, "manifest must declare a wsEvent suite");

  for (const caseId of suite.cases) {
    await test(caseId, async () => {
      const fixture = await loadCase(suite.id, caseId);
      assert.equal(fixture.kind, "wsEvent");
      const needsAuth = ["orders", "balances", "positions"].includes(String(fixture.stream));
      const harness = createWebSocketHarness();
      const client = new GeminiWebSocket({
        url: "wss://example.test",
        auth: needsAuth ? auth() : undefined,
        socketFactory: harness.socketFactory,
      });
      try {
        const stream = eventStream(client, fixture);
        const messages: BoundaryValue[] = [];
        stream.on("message", (message) => messages.push(message));
        await flush();
        assert.equal(harness.sockets.length, 1);
        const socket = harness.sockets[0]!;
        socket.fireOpen();
        await flush();
        const subscribeFrame = socket.sent
          .map((frame) => parseBoundaryRecord(frame))
          .find((frame) => frame.method === "SUBSCRIBE");
        assert.ok(subscribeFrame);
        assert.equal(typeof subscribeFrame.id, "number");
        assert.ok(Number.isSafeInteger(subscribeFrame.id) && subscribeFrame.id > 0, "subscription IDs must be positive integers");
        socket.fireMessage({ data: `{"id":${String(subscribeFrame.id)},"status":200}` });
        await stream.ready;

        assert.equal(typeof fixture.frame, "string");
        socket.fireMessage({ data: fixture.frame as string });
        assert.equal(messages.length, 1, "valid fixture frame must reach its typed stream");
        const message = record(messages[0]);
        assert.ok(message, "typed event must be an object");
        const expected = record(fixture.expect);
        assert.ok(expected);
        assertExpectedFields(message, expected);
      } finally {
        client.close();
      }
    });
  }
});
