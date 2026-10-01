import assert from "node:assert/strict";
import { test } from "node:test";

import {
  AcceptTermsRequired,
  ApiError,
  InsufficientFunds,
  InvalidNonce,
  InvalidRequest,
  InvalidSignature,
  MissingNonce,
  MissingRole,
  NotFoundError,
  RateLimitError,
  ServiceUnavailable,
  serializeError,
} from "../../errors.js";
import { HttpTransport, parseLosslessJson } from "../../transport/http.js";
import { streamingTextResponse } from "../support/http-fixtures.js";
import {
  loadCase,
  loadManifest,
  type FixtureCase,
} from "./support/fixtures.js";

type ErrorKind =
  | "invalid_nonce"
  | "missing_nonce"
  | "invalid_signature"
  | "missing_role"
  | "terms_required"
  | "insufficient_funds"
  | "rate_limited"
  | "order_not_found"
  | "market_closed"
  | "not_found"
  | "service_error"
  | "invalid_request";
type ErrorFixture = FixtureCase & {
  readonly response: {
    readonly status: number;
    readonly headers?: Record<string, string>;
    readonly body: string;
  };
  readonly expect: {
    readonly kind: ErrorKind;
    readonly reason?: string;
    readonly retryAfterSeconds?: number;
  };
};

const CLASS_BY_KIND: Record<ErrorKind, typeof ApiError> = {
  invalid_nonce: InvalidNonce,
  missing_nonce: MissingNonce,
  invalid_signature: InvalidSignature,
  missing_role: MissingRole,
  terms_required: AcceptTermsRequired,
  insufficient_funds: InsufficientFunds,
  rate_limited: RateLimitError,
  order_not_found: NotFoundError,
  market_closed: ApiError,
  not_found: NotFoundError,
  service_error: ServiceUnavailable,
  invalid_request: InvalidRequest,
};

function fixture(value: FixtureCase): ErrorFixture {
  return value as unknown as ErrorFixture;
}

function responseHeaders(values: Record<string, string> | undefined): { get(name: string): string | null } {
  const entries = Object.entries(values ?? {});
  return {
    get(name) {
      const entry = entries.find(([key]) => key.toLowerCase() === name.toLowerCase());
      return entry?.[1] ?? null;
    },
  };
}

async function runCase(value: ErrorFixture): Promise<void> {
  const transport = new HttpTransport({
    env: "sandbox",
    maxRetries: 0,
    fetchImpl: async () => streamingTextResponse(
      value.response.body,
      value.response.status,
      responseHeaders(value.response.headers),
    ),
  });
  let observed: unknown;
  try {
    await transport.requestPublic({ method: "GET", path: "/v1/conformance" });
  } catch (error) {
    observed = error;
  }
  assert.ok(observed instanceof ApiError, "HTTP error must be an ApiError");
  assert.equal(observed.status, value.response.status, "HTTP status must be preserved");
  const expectedClass = CLASS_BY_KIND[value.expect.kind];
  assert.ok(observed instanceof expectedClass, `expected ${value.expect.kind} to map to ${expectedClass.name}`);
  if (value.expect.reason !== undefined) assert.equal(observed.reason, value.expect.reason);
  if (value.expect.retryAfterSeconds !== undefined) {
    assert.equal(
      observed.metadata?.rateLimit?.retryAfter,
      String(value.expect.retryAfterSeconds),
    );
  }

  const serialized = serializeError(observed, { includeRawBody: true });
  if (value.response.body.length === 0) {
    assert.equal(serialized.body, undefined);
  } else {
    let expectedBody: unknown = value.response.body;
    try {
      expectedBody = parseLosslessJson(value.response.body);
    } catch {
      // Keep unstructured response text as the retained raw body.
    }
    assert.deepEqual(serialized.body, expectedBody);
  }
}

const manifest = await loadManifest();
const suite = manifest.suites.find((entry) => entry.id === "http/errors");
if (!suite) throw new Error("conformance manifest is missing http/errors");
for (const caseId of suite.cases) {
  test(`conformance error mapping: ${caseId}`, async () => {
    await runCase(fixture(await loadCase(suite.id, caseId)));
  });
}
