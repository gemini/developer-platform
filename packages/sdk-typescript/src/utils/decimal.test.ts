import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { decimal } from "./decimal.js";
import type { BoundaryValue } from "./boundary-value.js";

function invalidDecimal(value: BoundaryValue): string {
  // SAFETY: The fixture intentionally passes a non-string through the public runtime validation boundary.
  return value as string;
}

void describe("decimal math module", () => {
  void describe("parse & normalize", () => {
    it("normalizes integers and decimals with leading and trailing zeros", () => {
      assert.equal(decimal.normalize("0100.50"), "100.5");
      assert.equal(decimal.normalize("000.000"), "0");
      assert.equal(decimal.normalize("-0.00"), "0");
      assert.equal(decimal.normalize(".5"), "0.5");
      assert.equal(decimal.normalize("-.5"), "-0.5");
      assert.equal(decimal.normalize("42"), "42");
      assert.equal(decimal.normalize("-42.0"), "-42");
    });

    it("parses and expands scientific notation without precision loss", () => {
      assert.equal(decimal.normalize("1e-8"), "0.00000001");
      assert.equal(decimal.normalize("1.5e-4"), "0.00015");
      assert.equal(decimal.normalize("2.5e3"), "2500");
      assert.equal(decimal.normalize("-3.14e-2"), "-0.0314");
      assert.equal(decimal.normalize("1.2345e2"), "123.45");
      assert.equal(decimal.add("1e-8", "2e-8"), "0.00000003");
    });

    it("rejects invalid decimal strings", () => {
      assert.throws(() => decimal.normalize("abc"));
      assert.throws(() => decimal.normalize(""));
      assert.throws(() => decimal.normalize("12.34.56"));
      assert.throws(() => decimal.normalize("1e1000"));
    });
  });

  void describe("compare", () => {
    it("compares positive decimals", () => {
      assert.equal(decimal.compare("100.5", "100.50"), 0);
      assert.equal(decimal.compare("100.51", "100.50"), 1);
      assert.equal(decimal.compare("99.999", "100.0"), -1);
      assert.equal(decimal.compare("0.00000001", "0.00000002"), -1);
      assert.equal(decimal.compare("2.000000000000000001", "2.000000000000000002"), -1);
    });

    it("compares negative and mixed decimals", () => {
      assert.equal(decimal.compare("-10", "10"), -1);
      assert.equal(decimal.compare("10", "-10"), 1);
      assert.equal(decimal.compare("-5.5", "-5.50"), 0);
      assert.equal(decimal.compare("-5.4", "-5.5"), 1);
      assert.equal(decimal.compare("-5.6", "-5.5"), -1);
    });

    it("validates both inputs before the equality shortcut", () => {
      assert.throws(() => decimal.compare("abc", "abc"), /Invalid decimal string/);
      assert.throws(() => decimal.compare("", ""), /Invalid decimal string/);
      assert.throws(
        () => decimal.compare(invalidDecimal(null), invalidDecimal(null)),
        /Invalid decimal string/,
      );
    });
  });

  void describe("add & subtract", () => {
    it("adds decimals of varying scale exactly", () => {
      assert.equal(decimal.add("0.1", "0.2"), "0.3");
      assert.equal(decimal.add("99.99999999", "0.00000001"), "100");
      assert.equal(decimal.add("100.5", "-50.25"), "50.25");
      assert.equal(decimal.add("-10", "-20"), "-30");
      assert.equal(decimal.add("0", "0"), "0");
    });

    it("subtracts decimals without floating-point drift", () => {
      assert.equal(decimal.sub("1", "0.9"), "0.1");
      assert.equal(decimal.sub("0.3", "0.1"), "0.2");
      assert.equal(decimal.sub("50.25", "100.5"), "-50.25");
      assert.equal(decimal.sub("10", "10"), "0");
    });
  });

  void describe("multiply & divide", () => {
    it("multiplies decimals preserving full precision", () => {
      assert.equal(decimal.mul("10.5", "2"), "21");
      assert.equal(decimal.mul("0.1", "0.1"), "0.01");
      assert.equal(decimal.mul("0.00000001", "100000000"), "1");
      assert.equal(decimal.mul("-5", "2.5"), "-12.5");
      assert.equal(decimal.mul("-5", "-2.5"), "12.5");
      assert.equal(decimal.mul("100", "0"), "0");
    });

    it("divides decimals with specified scale", () => {
      assert.equal(decimal.div("10", "2"), "5");
      assert.equal(decimal.div("1", "3", 8), "0.33333333");
      assert.equal(decimal.div("1", "3", 2), "0.33");
      assert.equal(decimal.div("100", "8", 4), "12.5");
      assert.equal(decimal.div("-10", "2"), "-5");
    });

    it("throws on divide by zero", () => {
      assert.throws(() => decimal.div("10", "0"), /Division by zero/);
    });
  });

  void describe("format & fixed decimals", () => {
    it("formats with exact decimal places", () => {
      assert.equal(decimal.toFixed("100.5", 2), "100.50");
      assert.equal(decimal.toFixed("100.5678", 2), "100.56");
      assert.equal(decimal.toFixed("100", 4), "100.0000");
      assert.equal(decimal.toFixed("-0.5", 2), "-0.50");
    });
  });
});
