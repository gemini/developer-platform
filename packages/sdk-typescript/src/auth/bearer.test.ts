import assert from "node:assert/strict";
import { test } from "node:test";

import { BearerAuth, SdkError } from "../browser/index.js";

test("BearerAuth supplies only an Authorization header", async () => {
  const auth = new BearerAuth({ accessToken: "access-token" });

  assert.equal(auth.nextNonce(), undefined);
  assert.deepEqual(await auth.credentialHeaders("ignored"), {
    Authorization: "Bearer access-token",
  });
  assert.deepEqual(Object.keys(auth), []);
});

test("BearerAuth rejects an empty access token", () => {
  assert.throws(
    () => new BearerAuth({ accessToken: "" }),
    (error: unknown) => error instanceof SdkError && error.message === "accessToken is required",
  );
});

test("BearerAuth rejects header-control characters in access tokens", () => {
  assert.throws(
    () => new BearerAuth({ accessToken: "access-token\r\nX-Evil: injected" }),
    (error: unknown) => error instanceof SdkError && /visible ASCII/.test(error.message),
  );
});
