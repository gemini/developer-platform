import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const sdkDir = resolve(scriptDir, "..");
const sdkGeneratedPath = resolve(sdkDir, "src/generated/websocket/index.ts");

function declarationNames(source) {
  return [...source.matchAll(/^export (?:interface|enum|type) (\w+)/gm)].map(([, name]) => name);
}

function interfaceBlock(source, name) {
  const start = source.indexOf(`export interface ${name} {`);
  assert.notEqual(start, -1, `${name} interface not found`);
  const end = source.indexOf("\n}", start);
  assert.notEqual(end, -1, `${name} interface end not found`);
  return source.slice(start, end + 2);
}

test("generated WebSocket types cover documented request, response, and stream messages", () => {
  const source = readFileSync(sdkGeneratedPath, "utf8");
  const names = declarationNames(source);

  for (const name of [
    "DepthUpdate",
    "BookTicker",
    "Trade",
    "OrderUpdate",
    "BalanceUpdate",
    "PositionReport",
    "ContractStatus",
    "RfqPublicEvent",
    "RfqPrivateDelivery",
    "OrderPlaceRequest",
    "RfqConfirmQuoteResponse",
  ]) {
    assert(names.includes(name), `${name} is missing from generated WebSocket types`);
  }
});

test("generated WebSocket types preserve wire keys and widened int64 fields", () => {
  const source = readFileSync(sdkGeneratedPath, "utf8");
  const depthUpdate = interfaceBlock(source, "DepthUpdate");

  for (const key of ["e", "E", "s", "U", "u", "b", "a"]) {
    assert(depthUpdate.split("\n").some((line) => line.trimStart().startsWith(`${key}:`)), `${key} wire key is missing`);
  }
  assert.match(depthUpdate, /^\s*E: number \| bigint;/m);
  assert.match(depthUpdate, /^\s*U: number \| bigint;/m);
  assert.match(depthUpdate, /^\s*u: number \| bigint;/m);
});

test("RFQ legs expose the underlying contract symbol", () => {
  const source = readFileSync(sdkGeneratedPath, "utf8");
  assert.match(interfaceBlock(source, "RfqLeg"), /^\s*s\?: string;/m);
});

test("generated control-plane request method literals stay narrowed", () => {
  const source = readFileSync(sdkGeneratedPath, "utf8");

  assert.match(interfaceBlock(source, "SubscribeRequest"), /^\s*method: "SUBSCRIBE" \| "subscribe";/m);
  assert.match(interfaceBlock(source, "UnsubscribeRequest"), /^\s*method: "UNSUBSCRIBE" \| "unsubscribe";/m);
  assert.match(interfaceBlock(source, "ListSubscriptionsRequest"), /^\s*method: "LIST_SUBSCRIPTIONS" \| "list_subscriptions";/m);
});

test("generated WebSocket types preserve the previous RFQ delivery enum export", () => {
  const source = readFileSync(sdkGeneratedPath, "utf8");
  assert.match(source, /export \{ AnonymousSchema_153 as AnonymousSchema_152 \};/);
});
