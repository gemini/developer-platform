import { SdkError } from "../errors.js";
import { isBoundaryString, type BoundaryValue } from "./boundary-value.js";

const DECIMAL_PATTERN = /^[+-]?(?:(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?)$/;
const MAX_EXPONENT = 100;

export interface DecimalParts {
  readonly negative: boolean;
  readonly integer: string;
  readonly fraction: string;
}

/**
 * Test the decimal grammar used by order-book wire values.
 * This grammar does not allow signs, whitespace, or exponent notation.
 */
export function isPlainDecimal(value: BoundaryValue): value is string;
export function isPlainDecimal(value: BoundaryValue): value is string {
  if (!isBoundaryString(value) || value.length === 0) return false;
  let hasDigit = false;
  let hasDot = false;
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (code >= 48 && code <= 57) {
      hasDigit = true;
    } else if (code === 46 /* '.' */) {
      if (hasDot) return false;
      hasDot = true;
    } else {
      return false;
    }
  }
  return hasDigit;
}

/** Expand exponential notation without floating-point conversion. */
function expandScientific(value: string): string {
  const match = value.match(/^([+-]?(?:\d+\.?\d*|\.\d+))[eE]([+-]?\d+)$/);
  if (!match) return value;
  const coeff = match[1] ?? "0";
  const expStr = match[2] ?? "0";
  const exp = parseInt(expStr, 10);
  if (Math.abs(exp) > MAX_EXPONENT) {
    throw new SdkError(`Decimal exponent ${exp} exceeds supported range of ±${MAX_EXPONENT}`);
  }
  if (exp === 0) return coeff;

  const isNeg = coeff.startsWith("-");
  const unsigned = isNeg || coeff.startsWith("+") ? coeff.slice(1) : coeff;
  const [intPart = "0", fracPart = ""] = unsigned.split(".");
  const rawInt = intPart.replace(/^0+(?=\d)/, "") || (intPart ? "0" : "");

  if (exp > 0) {
    if (fracPart.length <= exp) {
      const zeros = "0".repeat(exp - fracPart.length);
      const res = `${rawInt}${fracPart}${zeros}`;
      return isNeg ? `-${res}` : res;
    }
    const moved = fracPart.slice(0, exp);
    const remainder = fracPart.slice(exp);
    const res = `${rawInt}${moved}.${remainder}`;
    return isNeg ? `-${res}` : res;
  }

  const absExp = -exp;
  if (absExp >= rawInt.length) {
    const res = `0.${"0".repeat(absExp - rawInt.length)}${rawInt}${fracPart}`;
    return isNeg ? `-${res}` : res;
  }
  const splitIdx = rawInt.length - absExp;
  const res = `${rawInt.slice(0, splitIdx)}.${rawInt.slice(splitIdx)}${fracPart}`;
  return isNeg ? `-${res}` : res;
}

/** Validate and split a decimal string into sign, integer, and fraction. */
export function parseDecimal(value: string): DecimalParts;
export function parseDecimal(value: BoundaryValue): DecimalParts {
  if (!isBoundaryString(value) || !DECIMAL_PATTERN.test(value.trim())) {
    throw new SdkError(`Invalid decimal string: ${JSON.stringify(value)}`);
  }
  const expanded = expandScientific(value.trim());
  const negative = expanded.startsWith("-");
  const unsigned = negative || expanded.startsWith("+") ? expanded.slice(1) : expanded;
  const [intPart = "0", fracPart = ""] = unsigned.split(".");
  const integer = intPart.replace(/^0+(?=\d)/, "") || "0";
  const fraction = fracPart;
  return { negative, integer, fraction };
}

/** Return a canonical decimal string. */
export function normalize(value: string): string;
export function normalize(value: BoundaryValue): string {
  if (!isBoundaryString(value)) {
    throw new SdkError(`Invalid decimal string: ${JSON.stringify(value)}`);
  }
  const str = value.trim();
  const len = str.length;
  if (len === 0) {
    throw new SdkError(`Invalid decimal string: ""`);
  }

  // Use a fast path for standard decimal values.
  let isNeg = false;
  let start = 0;
  const first = str.charCodeAt(0);
  if (first === 45 /* '-' */) {
    isNeg = true;
    start = 1;
  } else if (first === 43 /* '+' */) {
    start = 1;
  }
  if (start >= len) {
    throw new SdkError(`Invalid decimal string: ${JSON.stringify(value)}`);
  }

  let dotIndex = -1;
  let isSimple = true;
  let hasDigit = false;
  for (let i = start; i < len; i++) {
    const code = str.charCodeAt(i);
    if (code >= 48 && code <= 57) {
      hasDigit = true;
      continue;
    }
    if (code === 46 /* '.' */) {
      if (dotIndex !== -1) {
        isSimple = false;
        break;
      }
      dotIndex = i;
    } else {
      isSimple = false;
      break;
    }
  }

  if (isSimple && hasDigit) {
    const intEnd = dotIndex === -1 ? len : dotIndex;
    let intStart = start;
    while (intStart < intEnd - 1 && str.charCodeAt(intStart) === 48) {
      intStart++;
    }
    const intPart = intStart === intEnd ? "0" : str.slice(intStart, intEnd);

    if (dotIndex !== -1) {
      let fracEnd = len;
      while (fracEnd > dotIndex + 1 && str.charCodeAt(fracEnd - 1) === 48) {
        fracEnd--;
      }
      if (fracEnd > dotIndex + 1) {
        const fracPart = str.slice(dotIndex + 1, fracEnd);
        const isZeroValue = intPart === "0" && fracPart === "";
        if (isZeroValue) return "0";
        if (!isNeg && start === 0 && intStart === 0 && intStart < intEnd && fracEnd === len && str === value) {
          return value;
        }
        const formatted = `${intPart}.${fracPart}`;
        return isNeg ? `-${formatted}` : formatted;
      }
    }
    if (intPart === "0") return "0";
    if (!isNeg && start === 0 && intStart === 0 && intStart < intEnd && dotIndex === -1 && str === value) {
      return value;
    }
    return isNeg ? `-${intPart}` : intPart;
  }

  // Use the full parser for scientific notation and other complex values.
  const { negative, integer, fraction } = parseDecimal(value);
  const cleanFraction = fraction.replace(/0+$/, "");
  if (integer === "0" && cleanFraction === "") return "0";
  const formatted = cleanFraction === "" ? integer : `${integer}.${cleanFraction}`;
  return negative ? `-${formatted}` : formatted;
}

/** Compare two decimal strings. Return a value less than, equal to, or greater than zero. */
export function compare(a: string, b: string): number {
  const normA = normalize(a);
  const normB = normalize(b);
  if (normA === normB) return 0;

  const isNegA = normA.startsWith("-");
  const isNegB = normB.startsWith("-");

  if (isNegA && !isNegB) return -1;
  if (!isNegA && isNegB) return 1;

  const dotA = normA.indexOf(".");
  const intA = dotA < 0 ? (isNegA ? normA.slice(1) : normA) : (isNegA ? normA.slice(1, dotA) : normA.slice(0, dotA));
  const fracA = dotA < 0 ? "" : normA.slice(dotA + 1);

  const dotB = normB.indexOf(".");
  const intB = dotB < 0 ? (isNegB ? normB.slice(1) : normB) : (isNegB ? normB.slice(1, dotB) : normB.slice(0, dotB));
  const fracB = dotB < 0 ? "" : normB.slice(dotB + 1);

  let cmp = 0;
  if (intA.length !== intB.length) {
    cmp = intA.length - intB.length;
  } else if (intA !== intB) {
    cmp = intA < intB ? -1 : 1;
  } else {
    const maxFracLen = Math.max(fracA.length, fracB.length);
    for (let i = 0; i < maxFracLen; i++) {
      const chA = i < fracA.length ? fracA.charCodeAt(i) : 48;
      const chB = i < fracB.length ? fracB.charCodeAt(i) : 48;
      if (chA !== chB) {
        cmp = chA < chB ? -1 : 1;
        break;
      }
    }
  }

  return isNegA ? -cmp : cmp;
}

/** Exact string addition. */
export function add(a: string, b: string): string {
  const pA = parseDecimal(a);
  const pB = parseDecimal(b);
  const maxFrac = Math.max(pA.fraction.length, pB.fraction.length);

  const scaledA = (pA.negative ? -1n : 1n) * BigInt(pA.integer + pA.fraction.padEnd(maxFrac, "0"));
  const scaledB = (pB.negative ? -1n : 1n) * BigInt(pB.integer + pB.fraction.padEnd(maxFrac, "0"));

  const sum = scaledA + scaledB;
  return formatScaled(sum, maxFrac);
}

/** Exact string subtraction. */
export function subtract(a: string, b: string): string {
  const pB = parseDecimal(b);
  const invertedB = pB.negative
    ? `${pB.integer}${pB.fraction ? `.${pB.fraction}` : ""}`
    : `-${pB.integer}${pB.fraction ? `.${pB.fraction}` : ""}`;
  return add(a, invertedB);
}

/** Exact string multiplication. */
export function multiply(a: string, b: string): string {
  const pA = parseDecimal(a);
  const pB = parseDecimal(b);
  const totalFrac = pA.fraction.length + pB.fraction.length;

  const rawA = BigInt(pA.integer + pA.fraction);
  const rawB = BigInt(pB.integer + pB.fraction);

  const isNeg = pA.negative !== pB.negative;
  const product = (isNeg ? -1n : 1n) * (rawA * rawB);

  return formatScaled(product, totalFrac);
}

/** Exact string division with target fractional precision (default: 18 digits). */
export function divide(a: string, b: string, precision = 18): string {
  if (!Number.isInteger(precision) || precision < 0) {
    throw new SdkError("precision must be a finite non-negative integer");
  }
  if (compare(b, "0") === 0) {
    throw new SdkError("Division by zero in decimal.divide");
  }
  const pA = parseDecimal(a);
  const pB = parseDecimal(b);

  const rawA = BigInt(pA.integer + pA.fraction);
  const rawB = BigInt(pB.integer + pB.fraction);

  const shift = precision + pB.fraction.length - pA.fraction.length;
  const numerator = shift >= 0
    ? rawA * 10n ** BigInt(shift)
    : rawA / 10n ** BigInt(-shift);

  const quotient = numerator / rawB;
  const isNeg = pA.negative !== pB.negative;
  const resultScaled = (isNeg ? -1n : 1n) * quotient;

  return formatScaled(resultScaled, precision);
}

/** Format a scaled integer by decimal shift and strip trailing zeros. */
function formatScaled(scaled: bigint, fractionDigits: number): string {
  if (scaled === 0n) return "0";
  const isNeg = scaled < 0n;
  const absScaled = isNeg ? -scaled : scaled;
  const digits = absScaled.toString().padStart(fractionDigits + 1, "0");

  if (fractionDigits === 0) {
    return isNeg ? `-${digits}` : digits;
  }

  const integer = digits.slice(0, -fractionDigits) || "0";
  const fraction = digits.slice(-fractionDigits).replace(/0+$/, "");

  const formatted = fraction ? `${integer}.${fraction}` : integer;
  return isNeg ? `-${formatted}` : formatted;
}

/** Absolute value of a decimal string. */
export function abs(value: string): string {
  const norm = normalize(value);
  return norm.startsWith("-") ? norm.slice(1) : norm;
}

function decomposeNormalized(norm: string): DecimalParts {
  const negative = norm.startsWith("-");
  const unsigned = negative ? norm.slice(1) : norm;
  const dot = unsigned.indexOf(".");
  const integer = dot < 0 ? unsigned : unsigned.slice(0, dot);
  const fraction = dot < 0 ? "" : unsigned.slice(dot + 1);
  return { negative, integer, fraction };
}

/** Round a decimal string to a specific number of fraction digits. */
export function round(value: string, fractionDigits = 0): string {
  if (fractionDigits < 0 || !Number.isInteger(fractionDigits)) {
    throw new SdkError("fractionDigits must be a non-negative integer");
  }
  const norm = normalize(value);
  const { negative, integer, fraction } = decomposeNormalized(norm);
  if (fraction.length <= fractionDigits) {
    return format(norm, fractionDigits);
  }

  const scaled = BigInt(integer + fraction.padEnd(fractionDigits + 1, "0").slice(0, fractionDigits + 1));
  const lastDigit = Number(fraction[fractionDigits] ?? "0");
  const baseScaled = scaled / 10n;
  const roundedScaled = lastDigit >= 5 ? baseScaled + 1n : baseScaled;

  const result = formatScaled(negative ? -roundedScaled : roundedScaled, fractionDigits);
  return format(result, fractionDigits);
}

/** Format with fixed decimal places, padding with zeros if needed. */
export function format(value: string, fractionDigits = 2): string {
  if (fractionDigits < 0 || !Number.isInteger(fractionDigits)) {
    throw new SdkError("fractionDigits must be a non-negative integer");
  }
  const norm = normalize(value);
  const { negative, integer, fraction } = decomposeNormalized(norm);
  const padded = fraction.padEnd(fractionDigits, "0").slice(0, fractionDigits);
  const body = fractionDigits === 0 ? integer : `${integer}.${padded}`;
  return negative && body !== "0" ? `-${body}` : body;
}

/** Test if a decimal string is zero. */
export function isZero(value: string): boolean {
  if (value === "0" || value === "0.0" || value === "0.00") return true;
  return normalize(value) === "0";
}

/** Test if a decimal string is strictly positive (> 0). */
export function isPositive(value: string): boolean {
  const norm = normalize(value);
  return norm !== "0" && !norm.startsWith("-");
}

/** Test if a decimal string is strictly negative (< 0). */
export function isNegative(value: string): boolean {
  const norm = normalize(value);
  return norm !== "0" && norm.startsWith("-");
}

export const decimal = {
  parse: parseDecimal,
  normalize,
  compare,
  add,
  subtract,
  sub: subtract,
  multiply,
  mul: multiply,
  divide,
  div: divide,
  round,
  format,
  toFixed: format,
  abs,
  isZero,
  isPositive,
  isNegative,
};
