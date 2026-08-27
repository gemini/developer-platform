import assert from "node:assert/strict";
import test from "node:test";

import { rewriteRestUrl, rewriteWebSocketUrl } from "./qa-routing.mjs";

test("QA REST routing changes only the sandbox origin", () => {
  assert.equal(
    rewriteRestUrl(
      "https://api.sandbox.gemini.com/v1/prediction-markets/events?status=active",
      "https://api.qa100.aurora7.net",
    ),
    "https://api.qa100.aurora7.net/v1/prediction-markets/events?status=active",
  );
});

test("QA routing can preserve production protocol behavior while replacing its origins", () => {
  assert.equal(
    rewriteRestUrl(
      "https://api.gemini.com/v1/prediction-markets/events",
      "https://api.qa100.aurora7.net",
      "production",
    ),
    "https://api.qa100.aurora7.net/v1/prediction-markets/events",
  );
  assert.equal(
    rewriteWebSocketUrl(
      "wss://ws.gemini.com/?snapshot=-1",
      "wss://api.qa100.aurora7.net/feed",
      "production",
    ),
    "wss://api.qa100.aurora7.net/feed?snapshot=-1",
  );
});

test("QA WebSocket routing retains its configured path and the SDK snapshot query", () => {
  assert.equal(
    rewriteWebSocketUrl(
      "wss://ws.sandbox.gemini.com/?snapshot=-1",
      "wss://feed.qa100.aurora7.net/prediction-markets",
    ),
    "wss://feed.qa100.aurora7.net/prediction-markets?snapshot=-1",
  );
});

test("QA routing rejects non-TLS targets and unexpected source origins", () => {
  assert.throws(
    () => rewriteRestUrl("https://api.sandbox.gemini.com/v1/test", "http://localhost:3000"),
    /QA REST URL must use https/,
  );
  assert.throws(
    () => rewriteWebSocketUrl("wss://ws.sandbox.gemini.com", "ws://localhost:3000"),
    /QA WebSocket URL must use wss/,
  );
  assert.throws(
    () => rewriteRestUrl("https://api.gemini.com/v1/test", "https://api.qa100.aurora7.net"),
    /refusing to reroute unexpected REST origin/,
  );
  assert.throws(
    () => rewriteWebSocketUrl("wss://ws.gemini.com", "wss://feed.qa100.aurora7.net"),
    /refusing to reroute unexpected WebSocket origin/,
  );
});
