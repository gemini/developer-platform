import assert from "node:assert/strict";
import { test } from "node:test";

import {
  HmacAuth,
  SdkError,
  type FetchLike,
  type HmacAuthOptions,
} from "../server/index.js";
import { HttpTransport } from "../transport/http.js";
import { fromBase64 } from "../utils/encoding.js";
import { streamingTextResponse } from "../tests/support/http-fixtures.js";
import type { BoundaryValue } from "../utils/boundary-value.js";

function invalidHmacOptions(value: BoundaryValue): HmacAuthOptions {
  // SAFETY: These fixtures intentionally bypass the static options contract to test constructor validation at runtime.
  return value as HmacAuthOptions;
}

test("HmacAuth signs the exact base64 payload with HMAC-SHA384", async () => {
  const auth = new HmacAuth({
    apiKey: "test-key",
    apiSecret: "test-secret",
  });
  const payload =
    "eyJyZXF1ZXN0IjoiL3YxL3ByZWRpY3Rpb24tbWFya2V0cy9vcmRlciIsIm5vbmNlIjoxNzAwMDAwMDAwMDAwfQ==";

  assert.deepEqual(await auth.credentialHeaders(payload), {
    "X-GEMINI-APIKEY": "test-key",
    "X-GEMINI-SIGNATURE":
      "4a665b714370dde25f1505aa89fc9f79830b9e071dd4f2276ec7913ef52edf2ba9911afbaa47b8a99bb4a4f32f273121",
  });
});

test("default nonces strictly increase within one millisecond", () => {
  const auth = new HmacAuth({
    apiKey: "key-a",
    apiSecret: "secret-a",
    now: () => 1_700_000_000_000,
  });

  assert.deepEqual(
    [auth.nextNonce(), auth.nextNonce(), auth.nextNonce()],
    ["1700000000000", "1700000000001", "1700000000002"],
  );
});

test("default nonce follows clock advances and survives clock regression", () => {
  let now = 1_700_000_000_000;
  const auth = new HmacAuth({
    apiKey: "key-a",
    apiSecret: "secret-a",
    now: () => now,
  });

  assert.equal(auth.nextNonce(), "1700000000000");
  now += 100;
  assert.equal(auth.nextNonce(), "1700000000100");
  now -= 200;
  assert.equal(auth.nextNonce(), "1700000000101");
});

test("separate API-key sessions have independent nonce state", () => {
  const options = { apiSecret: "secret", now: () => 1_700_000_000_000 };
  const first = new HmacAuth({ ...options, apiKey: "key-a" });
  const second = new HmacAuth({ ...options, apiKey: "key-b" });

  assert.equal(first.nextNonce(), "1700000000000");
  assert.equal(first.nextNonce(), "1700000000001");
  assert.equal(second.nextNonce(), "1700000000000");
});

test("time-based nonce mode emits epoch seconds for time-based session keys", () => {
  const auth = new HmacAuth({
    apiKey: "time-key",
    apiSecret: "secret",
    nonceMode: "time-based",
    now: () => 1_700_000_000_123,
  });

  assert.equal(auth.nextNonce(), "1700000000");
  assert.equal(auth.nextNonce(), "1700000000");
});

test("credentials are not exposed as enumerable object state", () => {
  const auth = new HmacAuth({ apiKey: "private-key", apiSecret: "private-secret" });

  assert.deepEqual(Object.keys(auth), []);
  assert.equal(JSON.stringify(auth), "{}");
});

test("HttpTransport sends the exact payload signed by HmacAuth", async () => {
  const payload =
    "eyJyZXF1ZXN0IjoiL3YxL3ByZWRpY3Rpb24tbWFya2V0cy9vcmRlciIsIm5vbmNlIjoxNzAwMDAwMDAwMDAwfQ==";
  const signature =
    "4a665b714370dde25f1505aa89fc9f79830b9e071dd4f2276ec7913ef52edf2ba9911afbaa47b8a99bb4a4f32f273121";
  let headers: Record<string, string> | undefined;
  const fetchImpl: FetchLike = async (_url, init) => {
    headers = init.headers;
    return streamingTextResponse("{}");
  };
  const auth = new HmacAuth({
    apiKey: "test-key",
    apiSecret: "test-secret",
    now: () => 1_700_000_000_000,
  });
  const client = new HttpTransport({ env: "sandbox", auth, fetchImpl });

  await client.request({ method: "POST", path: "/v1/prediction-markets/order" });

  assert.equal(headers?.["X-GEMINI-PAYLOAD"], payload);
  assert.equal(headers?.["X-GEMINI-SIGNATURE"], signature);
  assert.equal(
    JSON.parse(fromBase64(payload)).nonce,
    1_700_000_000_000,
  );
});

test("concurrent requests use unique increasing nonces", async () => {
  const nonces: number[] = [];
  const fetchImpl: FetchLike = async (_url, init) => {
    const payload = JSON.parse(
      fromBase64(init.headers["X-GEMINI-PAYLOAD"]),
    );
    nonces.push(payload.nonce);
    return streamingTextResponse("{}");
  };
  const auth = new HmacAuth({
    apiKey: "key",
    apiSecret: "secret",
    now: () => 1_700_000_000_000,
  });
  const client = new HttpTransport({ env: "sandbox", auth, fetchImpl });

  await Promise.all([
    client.request({ method: "POST", path: "/v1/a" }),
    client.request({ method: "POST", path: "/v1/b" }),
    client.request({ method: "POST", path: "/v1/c" }),
  ]);

  assert.deepEqual(nonces, [1_700_000_000_000, 1_700_000_000_001, 1_700_000_000_002]);
});

test("HmacAuth rejects missing credentials without echoing credential values", () => {
  assert.throws(
    () => new HmacAuth({ apiKey: "", apiSecret: "not-for-errors" }),
    (error: BoundaryValue) => error instanceof SdkError && !error.message.includes("not-for-errors"),
  );
  assert.throws(
    () => new HmacAuth({ apiKey: "not-for-errors", apiSecret: "" }),
    (error: BoundaryValue) => error instanceof SdkError && !error.message.includes("not-for-errors"),
  );
});

test("HmacAuth rejects an invalid clock before emitting any nonce", () => {
  for (const nonceMode of ["monotonic", "time-based"] as const) {
    const auth = new HmacAuth({
      apiKey: "key",
      apiSecret: "not-for-errors",
      nonceMode,
      now: () => Number.NaN,
    });
    assert.throws(
      () => auth.nextNonce(),
      (error: BoundaryValue) =>
        error instanceof SdkError && !error.message.includes("not-for-errors"),
    );
  }
});

test("HmacAuth rejects invalid runtime options with SdkError", () => {
  const invalid = [
    null,
    undefined,
    { apiKey: 1, apiSecret: "secret" },
    { apiKey: "key", apiSecret: 1 },
    { apiKey: "key", apiSecret: "secret", nonceMode: "invalid" },
    { apiKey: "key", apiSecret: "secret", now: 1 },
    Object.assign([], { apiKey: "key", apiSecret: "secret" }),
    Object.assign(new String("options"), { apiKey: "key", apiSecret: "secret" }),
  ].map(invalidHmacOptions);

  for (const options of invalid) {
    assert.throws(() => new HmacAuth(options), SdkError);
  }
});

test("HmacAuth rejects unsafe clock values", () => {
  const auth = new HmacAuth({
    apiKey: "key",
    apiSecret: "secret",
    now: () => Number.MAX_SAFE_INTEGER + 1,
  });

  assert.throws(() => auth.nextNonce(), SdkError);
});
