import test from "node:test";
import assert from "node:assert/strict";

import { GeminiWebSocket } from "../../websocket/server.js";
import type {
  DepthUpdatesOptions,
  PartialDepthOptions,
  WebSocketStream,
} from "../../websocket/public.js";
import type {
  WebSocketAccountIntervalOptions,
  WebSocketScopeOptions,
} from "../../websocket/server.js";
import type { AuthStrategy } from "../../transport/http.js";
import { parseBoundaryRecord } from "../support/http-fixtures.js";
import { createWebSocketHarness } from "../support/ws-harness.js";
import type { BoundaryRecord, BoundaryValue } from "../../utils/boundary-value.js";
import { isBoundaryObject } from "../../utils/boundary-value.js";
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

function subscribe(client: GeminiWebSocket, fixture: BoundaryRecord): WebSocketStream<BoundaryValue> {
  const stream = String(fixture.stream);
  const symbol = typeof fixture.symbol === "string" ? fixture.symbol : undefined;
  const options = record(fixture.options);
  switch (stream) {
    case "trades":
      assert.equal(typeof symbol, "string");
      return client.public.trades(symbol!) as unknown as WebSocketStream<BoundaryValue>;
    case "bookTicker":
      assert.equal(typeof symbol, "string");
      return client.public.bookTicker(symbol!) as unknown as WebSocketStream<BoundaryValue>;
    case "depthUpdates":
      assert.equal(typeof symbol, "string");
      return client.public.depthUpdates(symbol!, options as unknown as DepthUpdatesOptions) as unknown as WebSocketStream<BoundaryValue>;
    case "partialDepth":
      assert.equal(typeof symbol, "string");
      return client.public.depth(symbol!, options as unknown as PartialDepthOptions) as unknown as WebSocketStream<BoundaryValue>;
    case "contractStatus":
      return client.public.contractStatus() as unknown as WebSocketStream<BoundaryValue>;
    case "orders":
      return client.private.orders(options as unknown as WebSocketScopeOptions) as unknown as WebSocketStream<BoundaryValue>;
    case "balances":
      return client.private.balances(options as unknown as WebSocketAccountIntervalOptions) as unknown as WebSocketStream<BoundaryValue>;
    case "positions":
      return client.private.positions(options as unknown as WebSocketAccountIntervalOptions) as unknown as WebSocketStream<BoundaryValue>;
    default:
      assert.fail(`unsupported wsSubscription stream: ${stream}`);
  }
}

function expectedParams(value: BoundaryValue): string[] {
  assert.ok(Array.isArray(value), "subscription fixture expect.params must be an array");
  return value.map((item) => {
    assert.equal(typeof item, "string");
    return item as string;
  });
}

test("wsSubscription fixtures emit exact subscribe frames", async () => {
  const manifest = await loadManifest();
  const suite = manifest.suites.find((candidate) => candidate.kind === "wsSubscription");
  assert.ok(suite, "manifest must declare a wsSubscription suite");

  for (const caseId of suite.cases) {
    await test(caseId, async () => {
      const fixture = await loadCase(suite.id, caseId);
      assert.equal(fixture.kind, "wsSubscription");
      const needsAuth = ["orders", "balances", "positions"].includes(String(fixture.stream));
      const harness = createWebSocketHarness();
      const client = new GeminiWebSocket({
        url: "wss://example.test",
        auth: needsAuth ? auth() : undefined,
        socketFactory: harness.socketFactory,
      });
      try {
        const stream = subscribe(client, fixture);
        await flush();
        assert.equal(harness.sockets.length, 1, "one fixture subscription must create one socket");
        const socket = harness.sockets[0]!;
        socket.fireOpen();
        await flush();

        const sent = socket.sent
          .map((frame) => parseBoundaryRecord(frame))
          .filter((frame) => frame.method === "SUBSCRIBE");
        assert.equal(sent.length, 1, "one fixture subscription must emit one SUBSCRIBE frame");
        const frame = sent[0]!;
        const expected = record(fixture.expect);
        assert.ok(expected);
        assert.equal(frame.method, expected.method);
        assert.deepEqual(frame.params, expectedParams(expected.params));
        assert.equal(typeof frame.id, "number");
        assert.ok(Number.isSafeInteger(frame.id) && frame.id > 0, "subscription IDs must be positive integers");

        socket.fireMessage({ data: `{"id":${String(frame.id)},"status":200}` });
        await stream.ready;
      } finally {
        client.close();
      }
    });
  }
});
