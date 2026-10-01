import assert from "node:assert/strict";
import { readdir } from "node:fs/promises";
import { join, relative } from "node:path";
import { test } from "node:test";

import {
  conformanceRoot,
  loadCase,
  loadExceptions,
  loadManifest,
} from "./support/fixtures.js";

const EXPECTED_SUITES: Readonly<Record<string, readonly string[]>> = {
  "http/hmac-requests": [
    "private-post-with-body",
    "private-post-empty-body",
    "private-post-wide-integer",
    "websocket-upgrade-nonce",
  ],
  "http/unsigned-requests": [
    "market-data-ticker",
    "market-data-order-book-limits",
    "prediction-markets-list-events-filters",
  ],
  "http/errors": [
    "invalid-nonce-400",
    "missing-role-403-result-envelope",
    "missing-role-403-error-envelope",
    "terms-required-400-must-accept",
    "terms-required-400-accept-terms-required",
    "insufficient-funds-406",
    "rate-limited-429-retry-after",
    "order-not-found-404",
    "market-closed-400",
    "server-error-500-unstructured",
    "not-found-404-empty-body",
  ],
  json: [
    "wide-integer-unsafe",
    "wide-integer-safe",
    "decimal-string-exact",
    "decimal-number-exact",
  ],
  "websocket/subscriptions": [
    "public-trades",
    "public-trades-untrimmed-symbol",
    "public-book-ticker",
    "public-depth-diff",
    "public-depth-diff-interval",
    "public-partial-depth-20",
    "public-contract-status",
    "private-orders-session",
    "private-balances-interval",
  ],
  "websocket/events": [
    "trade",
    "depth-unsafe-last-update-id",
    "order-update",
    "balance-update",
  ],
};

const EXPECTED_KINDS: Readonly<Record<string, string>> = {
  "http/hmac-requests": "hmacRequest",
  "http/unsigned-requests": "unsignedRequest",
  "http/errors": "errorMapping",
  json: "jsonDecoding",
  "websocket/subscriptions": "wsSubscription",
  "websocket/events": "wsEvent",
};

const EXPECTED_EXCEPTIONS = [
  "rest-nonce-json-type",
  "rest-payload-key-order",
  "ws-subscription-id-scope",
  "ws-inbound-symbol-case",
  "int64-static-typing",
  "http-406-insufficient-funds",
  "rest-query-signing",
  "candle-timeframe-spelling",
] as const;

async function fixtureJsonFiles(root: string): Promise<string[]> {
  const files: string[] = [];
  async function visit(directory: string): Promise<void> {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) {
        await visit(path);
      } else if (entry.isFile() && entry.name.endsWith(".json") && relative(root, path) !== "manifest.json") {
        files.push(relative(root, path).replace(/\.json$/, ""));
      }
    }
  }
  await visit(root);
  return files;
}

function sorted(values: Iterable<string>): string[] {
  return [...values].sort();
}

test("conformance manifest covers every fixture and declared exception", async () => {
  const manifest = await loadManifest();
  assert.equal(manifest.version, 1);
  assert.equal(manifest.suites.length, Object.keys(EXPECTED_SUITES).length);
  assert.deepEqual(sorted(manifest.suites.map((suite) => suite.id)), sorted(Object.keys(EXPECTED_SUITES)));

  const listedFiles = new Set<string>();
  const referencedExceptions = new Map<string, string[]>();
  for (const suite of manifest.suites) {
    assert.equal(suite.kind, EXPECTED_KINDS[suite.id]);
    assert.deepEqual(suite.cases, EXPECTED_SUITES[suite.id]);
    for (const caseId of suite.cases) {
      const relativePath = `${suite.id}/${caseId}`;
      listedFiles.add(relativePath);
      const value = await loadCase(suite.id, caseId);
      assert.equal(value.id, relativePath);
      assert.equal(value.kind, suite.kind);
      for (const exception of value.exceptions ?? []) {
        const ids = referencedExceptions.get(exception) ?? [];
        ids.push(relativePath);
        referencedExceptions.set(exception, ids);
      }
    }
  }

  const diskFiles = new Set(await fixtureJsonFiles(conformanceRoot()));
  assert.deepEqual(sorted(listedFiles), sorted(diskFiles), "manifest and fixture files must agree in both directions");

  assert.deepEqual(manifest.exceptions, EXPECTED_EXCEPTIONS);
  const exceptions = await loadExceptions();
  assert.deepEqual(sorted(exceptions.map((exception) => exception.id)), sorted(manifest.exceptions));
  const declaredExceptionIds = new Set(exceptions.map((exception) => exception.id));
  for (const exceptionId of referencedExceptions.keys()) {
    assert.ok(declaredExceptionIds.has(exceptionId), `case references undeclared exception ${exceptionId}`);
  }

  const declaredCases = new Map<string, string[]>();
  for (const exception of exceptions) {
    for (const caseId of exception.cases ?? []) {
      const cases = declaredCases.get(caseId) ?? [];
      cases.push(exception.id);
      declaredCases.set(caseId, cases);
    }
  }
  const observedCases = new Map<string, string[]>();
  for (const [exceptionId, cases] of referencedExceptions) {
    for (const caseId of cases) {
      const exceptionIds = observedCases.get(caseId) ?? [];
      exceptionIds.push(exceptionId);
      observedCases.set(caseId, exceptionIds);
    }
  }
  assert.deepEqual(
    sorted([...declaredCases.entries()].map(([caseId, ids]) => `${caseId}:${sorted(ids).join(",")}`)),
    sorted([...observedCases.entries()].map(([caseId, ids]) => `${caseId}:${sorted(ids).join(",")}`)),
    "overlay exception cases must match fixture references",
  );
});
