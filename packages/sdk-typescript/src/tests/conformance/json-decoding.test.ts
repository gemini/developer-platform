import test from "node:test";
import assert from "node:assert/strict";

import { parseLosslessJson } from "../../transport/http.js";
import { isBoundaryObject } from "../../utils/boundary-value.js";
import { loadCase, loadManifest } from "./support/fixtures.js";

test("jsonDecoding fixtures preserve wire numeric semantics", async () => {
  const manifest = await loadManifest();
  const suite = manifest.suites.find((candidate) => candidate.kind === "jsonDecoding");
  assert.ok(suite, "manifest must declare a jsonDecoding suite");

  for (const caseId of suite.cases) {
    await test(caseId, async () => {
      const fixture = await loadCase(suite.id, caseId);
      const raw = fixture.raw;
      const field = fixture.field;
      const expected = fixture.expect;
      assert.equal(typeof raw, "string");
      assert.equal(typeof field, "string");
      assert.ok(isBoundaryObject(expected));
      const parsed = parseLosslessJson(raw as string);
      assert.ok(isBoundaryObject(parsed), "json fixture must decode to an object");
      const value = parsed[field as string];
      assert.notEqual(value, undefined, `fixture field ${String(field)} must be present`);

      switch (expected.valueKind) {
        case "integer":
          assert.equal(String(value), String(expected.text));
          if (BigInt(String(expected.text)) > BigInt(Number.MAX_SAFE_INTEGER) ||
            BigInt(String(expected.text)) < BigInt(Number.MIN_SAFE_INTEGER)) {
            assert.equal(typeof value, "bigint", "unsafe integers must be promoted to bigint");
          } else {
            assert.equal(typeof value, "number", "safe integers must remain numbers");
          }
          break;
        case "decimal":
          if (typeof value === "string") {
            assert.equal(value, expected.text, "decimal strings must remain exact strings");
          } else {
            assert.equal(typeof value, "number", "decimal numbers must remain numbers");
            assert.equal(value, Number(expected.text), "decimal number value must be preserved");
          }
          break;
        default:
          assert.fail(`unsupported json fixture valueKind: ${String(expected.valueKind)}`);
      }
    });
  }
});
