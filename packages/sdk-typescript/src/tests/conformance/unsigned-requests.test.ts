import assert from "node:assert/strict";
import { test } from "node:test";

import { PredictionMarketsRest } from "../../generated/rest.js";
import { MarketDataRest } from "../../generated/market-data/rest.js";
import { HttpTransport, type FetchLike, type HttpMethod } from "../../transport/http.js";
import { type BoundaryRecord } from "../../utils/boundary-value.js";
import { streamingTextResponse } from "../support/http-fixtures.js";
import {
  loadCase,
  loadManifest,
  type FixtureCase,
} from "./support/fixtures.js";

type UnsignedFixture = FixtureCase & {
  operation: "marketData.getTicker" | "marketData.getCurrentOrderBook" | "predictions.listEvents";
  input?: BoundaryRecord;
  expect: {
    method: HttpMethod;
    path: string;
    query?: Record<string, readonly string[]>;
    authHeaders: readonly string[];
  };
};

function fixture(value: FixtureCase): UnsignedFixture {
  return value as unknown as UnsignedFixture;
}

function assertQuery(url: URL, expected: Record<string, readonly string[]> | undefined): void {
  const expectedEntries = Object.entries(expected ?? {});
  const actualKeys = [...new Set([...url.searchParams.keys()])].sort();
  assert.deepEqual(actualKeys, expectedEntries.map(([name]) => name).sort());
  for (const [name, values] of expectedEntries) {
    assert.deepEqual(url.searchParams.getAll(name), [...values], `query ${name}`);
  }
}

async function runCase(value: UnsignedFixture): Promise<void> {
  let captured: { url: string; init: Parameters<FetchLike>[1] } | undefined;
  const transport = new HttpTransport({
    env: "sandbox",
    maxRetries: 0,
    fetchImpl: async (url, init) => {
      captured = { url, init };
      return streamingTextResponse("{}", 200, { get: () => "application/json" });
    },
  });
  const marketData = new MarketDataRest(transport);
  const predictions = new PredictionMarketsRest(transport);
  switch (value.operation) {
    case "marketData.getTicker":
      await marketData.getTicker(value.input as never);
      break;
    case "marketData.getCurrentOrderBook":
      await marketData.getCurrentOrderBook(value.input as never);
      break;
    case "predictions.listEvents":
      await predictions.listEvents(value.input as never);
      break;
    default:
      throw new Error(`unsupported unsigned conformance operation: ${value.operation}`);
  }
  assert.ok(captured, "fixture request did not reach fetch");
  const url = new URL(captured.url);
  assert.equal(captured.init.method, value.expect.method);
  assert.equal(url.pathname, value.expect.path);
  assertQuery(url, value.expect.query);
  assert.equal(captured.init.body, undefined);
  const actualAuthHeaders = Object.keys(captured.init.headers)
    .filter((name) => name.toLowerCase().startsWith("x-gemini-") || name.toLowerCase() === "authorization")
    .map((name) => name.toLowerCase())
    .sort();
  assert.deepEqual(
    actualAuthHeaders,
    value.expect.authHeaders.map((name) => name.toLowerCase()).sort(),
    "authentication headers must match the fixture",
  );
  for (const name of value.expect.authHeaders) {
    const actual = Object.entries(captured.init.headers)
      .find(([header]) => header.toLowerCase() === name.toLowerCase())?.[1];
    assert.notEqual(actual, undefined, `expected auth header ${name}`);
  }
  for (const header of Object.values(captured.init.headers)) {
    assert.notEqual(header, "", "empty header");
  }
}
const manifest = await loadManifest();
const suite = manifest.suites.find((entry) => entry.id === "http/unsigned-requests");
if (!suite) throw new Error("conformance manifest is missing http/unsigned-requests");
for (const caseId of suite.cases) {
  test(`conformance unsigned request: ${caseId}`, async () => {
    await runCase(fixture(await loadCase(suite.id, caseId)));
  });
}
