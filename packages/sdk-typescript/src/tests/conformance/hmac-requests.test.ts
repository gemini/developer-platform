import assert from "node:assert/strict";
import { test } from "node:test";

import { HmacAuth } from "../../auth/hmac.js";
import { createServerWebSocketAuthHeaders } from "../../websocket/auth.js";
import { HttpTransport, type FetchLike, type HttpMethod } from "../../transport/http.js";
import { fromBase64, hmacSha384Hex } from "../../utils/encoding.js";
import { type BoundaryRecord, type BoundaryValue } from "../../utils/boundary-value.js";
import { parseBoundaryRecord, streamingTextResponse } from "../support/http-fixtures.js";
import {
  loadCase,
  loadManifest,
  type FixtureCase,
} from "./support/fixtures.js";

type HmacFixture = FixtureCase & {
  credentials: { apiKey: string; apiSecret: string };
  nonce: { mode: "monotonic" | "websocket"; value?: string };
  request: { method: HttpMethod; path: string; body?: BoundaryRecord };
  expect: {
    headers: readonly string[];
    apiKeyHeader: string;
    payload?: { request?: string; nonce?: string; fields?: BoundaryRecord };
    signature: { algorithm: string; over: string; encoding: string };
  };
};

function fixture(value: FixtureCase): HmacFixture {
  return value as unknown as HmacFixture;
}

function wireText(value: BoundaryValue): string {
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "bigint" || typeof value === "number" || typeof value === "boolean") return String(value);
  if (value === null) return "null";
  return JSON.stringify(value) ?? String(value);
}

function assertRawValue(actual: BoundaryValue, expected: BoundaryValue, label: string): void {
  assert.equal(wireText(actual), wireText(expected), label);
}

function assertHeaders(headers: Record<string, string>, expected: readonly string[]): void {
  for (const name of expected) {
    assert.equal(typeof headers[name], "string", `missing ${name}`);
    assert.notEqual(headers[name], "", `empty ${name}`);
  }
}

async function runHttpCase(value: HmacFixture): Promise<void> {
  const nonceValue = value.nonce.value;
  assert.equal(value.nonce.mode, "monotonic");
  assert.ok(nonceValue, "monotonic fixture must provide a nonce");
  const auth = new HmacAuth({
    apiKey: value.credentials.apiKey,
    apiSecret: value.credentials.apiSecret,
    now: () => Number(nonceValue),
  });
  let captured: { url: string; init: Parameters<FetchLike>[1] } | undefined;
  const transport = new HttpTransport({
    env: "sandbox",
    auth,
    maxRetries: 0,
    fetchImpl: async (url, init) => {
      captured = { url, init };
      return streamingTextResponse("{}", 200, { get: () => "application/json" });
    },
  });
  await transport.request({
    method: value.request.method,
    path: value.request.path,
    params: value.request.body,
  });
  assert.ok(captured, "fixture request did not reach fetch");
  const { url, init } = captured;
  assert.equal(url, `https://api.sandbox.gemini.com${value.request.path}`);
  assert.equal(init.method, value.request.method);
  assertHeaders(init.headers, value.expect.headers);
  assert.equal(init.headers["X-GEMINI-APIKEY"], value.expect.apiKeyHeader);
  assert.equal(init.body, undefined, "private REST fields belong in the signed payload");

  const payloadBase64 = init.headers["X-GEMINI-PAYLOAD"];
  assert.ok(payloadBase64);
  const payloadJson = fromBase64(payloadBase64);
  const payload = parseBoundaryRecord(payloadJson);
  const expectedPayload = value.expect.payload;
  assert.ok(expectedPayload);
  if (expectedPayload.request !== undefined) assert.equal(payload.request, expectedPayload.request);
  if (expectedPayload.nonce !== undefined) {
    assert.equal(String(payload.nonce).replace(/^"|"$/g, ""), expectedPayload.nonce);
  }
  const expectedFields = expectedPayload.fields ?? {};
  for (const [key, expected] of Object.entries(expectedFields)) {
    assert.ok(Object.hasOwn(payload, key), `missing payload field ${key}`);
    assertRawValue(payload[key], expected, `payload field ${key}`);
  }
  assert.deepEqual(
    Object.keys(payload).sort(),
    ["request", "nonce", ...Object.keys(expectedFields)].sort(),
    "signed payload contains only the declared fields",
  );
  assert.equal(
    init.headers["X-GEMINI-SIGNATURE"],
    await hmacSha384Hex(value.credentials.apiSecret, payloadBase64),
  );
  assert.equal(value.expect.signature.algorithm, "HMAC-SHA384");
  assert.equal(value.expect.signature.over, "payloadBase64");
  assert.equal(value.expect.signature.encoding, "hex-lower");
}

async function runWebSocketUpgradeCase(value: HmacFixture): Promise<void> {
  assert.equal(value.nonce.mode, "websocket");
  const auth = new HmacAuth({
    apiKey: value.credentials.apiKey,
    apiSecret: value.credentials.apiSecret,
    now: () => 1_700_000_000_000,
  });
  const headers = await createServerWebSocketAuthHeaders(auth);
  assertHeaders(headers, value.expect.headers);
  assert.equal(headers["X-GEMINI-APIKEY"], value.expect.apiKeyHeader);
  const nonce = headers["X-GEMINI-NONCE"];
  assert.match(nonce, /^\d{10}$/);
  const payloadBase64 = headers["X-GEMINI-PAYLOAD"];
  assert.equal(fromBase64(payloadBase64), nonce);
  assert.equal(
    headers["X-GEMINI-SIGNATURE"],
    await hmacSha384Hex(value.credentials.apiSecret, payloadBase64),
  );
  assert.equal(value.expect.signature.algorithm, "HMAC-SHA384");
  assert.equal(value.expect.signature.over, "payloadBase64");
  assert.equal(value.expect.signature.encoding, "hex-lower");
}

const manifest = await loadManifest();
const suite = manifest.suites.find((entry) => entry.id === "http/hmac-requests");
if (!suite) throw new Error("conformance manifest is missing http/hmac-requests");
for (const caseId of suite.cases) {
  test(`conformance hmac request: ${caseId}`, async () => {
    const value = fixture(await loadCase(suite.id, caseId));
    if (value.nonce.mode === "websocket") await runWebSocketUpgradeCase(value);
    else await runHttpCase(value);
  });
}
