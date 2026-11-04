import assert from "node:assert/strict";
import { test } from "node:test";

import {
  createPkceCodeChallenge,
  generatePkceCodeVerifier,
  SdkError,
} from "../server/index.js";

test("PKCE helpers generate an RFC-compliant verifier", () => {
  const verifier = generatePkceCodeVerifier((size) => new Uint8Array(size).fill(7));

  assert.equal(verifier.length, 86);
  assert.match(verifier, /^[A-Za-z0-9._~-]{43,128}$/);
});

test("PKCE helper derives the RFC 7636 S256 example challenge", async () => {
  const verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";

  assert.equal(
    await createPkceCodeChallenge(verifier),
    "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM",
  );
});

test("PKCE helpers reject malformed verifiers and random sources", async () => {
  await assert.rejects(
    () => createPkceCodeChallenge("not-a-verifier"),
    (error: unknown) => error instanceof SdkError && /code verifier/.test(error.message),
  );
  assert.throws(
    () => generatePkceCodeVerifier(() => "invalid" as never),
    (error: unknown) => error instanceof SdkError && /Uint8Array/.test(error.message),
  );
});
