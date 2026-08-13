import assert from "node:assert/strict";
import { execFile as execFileCallback } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const execFile = promisify(execFileCallback);
const scriptDir = dirname(fileURLToPath(import.meta.url));
const sdkDir = resolve(scriptDir, "..");
const repoRoot = resolve(sdkDir, "../..");
const generatorPath = resolve(sdkDir, "scripts/generate-ws-types.mjs");
const localWsSpec = resolve(repoRoot, "apis/websocket.yaml");
const specPath = existsSync(localWsSpec) ? localWsSpec : "https://developer.gemini.com/specs/asyncapi/websocket.yaml";
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

test("generated WebSocket types match the AsyncAPI generator output", async (t) => {
  const directory = mkdtempSync(join(tmpdir(), "ws-types-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  await execFile(process.execPath, [generatorPath, directory, specPath]);

  const fresh = readFileSync(resolve(directory, "index.ts"), "utf8");
  const sdkGenerated = readFileSync(sdkGeneratedPath, "utf8");

  assert.equal(sdkGenerated, fresh, "SDK generated WebSocket types are stale");
});

test("generated WebSocket types cover documented request, response, and stream messages", () => {
  const source = readFileSync(sdkGeneratedPath, "utf8");
  const names = declarationNames(source);

  assert.equal(names.length, 59);
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

test("generated control-plane request method literals stay narrowed", () => {
  const source = readFileSync(sdkGeneratedPath, "utf8");

  assert.match(interfaceBlock(source, "SubscribeRequest"), /^\s*method: "SUBSCRIBE" \| "subscribe";/m);
  assert.match(interfaceBlock(source, "UnsubscribeRequest"), /^\s*method: "UNSUBSCRIBE" \| "unsubscribe";/m);
  assert.match(interfaceBlock(source, "ListSubscriptionsRequest"), /^\s*method: "LIST_SUBSCRIPTIONS" \| "list_subscriptions";/m);
});
