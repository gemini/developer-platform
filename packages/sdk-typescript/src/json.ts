// Lossless JSON parsing for the wire boundary.
//
// The exchange sends integers that exceed JS safe-int (2^53) — the `E` nanosecond
// timestamp and sequence ids. Plain JSON.parse rounds them to the nearest double
// silently, corrupting ids with no error. This preserves them as bigint using the
// reviver's raw source text (Node 22+ JSON.parse source access), so the exact
// digits survive.
import { SdkError, ValidationError } from "./errors.js";

// An integer literal: optional sign, digits, no fraction or exponent. Only these
// can be a precise id; anything with "." or "e" is a float form and stays a number.
const INTEGER_LITERAL = /^-?\d+$/;

/**
 * Parse JSON, preserving integers beyond the safe range as `bigint`. Everything
 * else is unchanged: strings (e.g. prices) stay strings, floats and safe integers
 * stay `number`.
 */
export function parseLosslessJson(text: string): unknown {
  return JSON.parse(text, (_key, value, context?: { source?: string }) => {
    if (typeof value !== "number") return value;

    const source = context?.source;
    if (source === undefined) {
      // Runtime lacks JSON source access (pre-Node-22). We can't recover the exact
      // digits, so fail loud rather than hand back a silently-rounded id.
      if (Number.isInteger(value) && !Number.isSafeInteger(value)) {
        throw new SdkError(
          "lossless JSON parsing requires JSON source access (Node 22+)",
        );
      }
      return value;
    }

    if (INTEGER_LITERAL.test(source) && !Number.isSafeInteger(value)) {
      return BigInt(source);
    }
    return value;
  });
}

export type Int64Path = readonly (string | "*")[];

export type RequestInt64Path = {
  path: Int64Path;
  allowString?: boolean;
  unsigned?: boolean;
};

const MAX_UNSIGNED_INT64 = 18446744073709551615n;

function requestFieldPath(path: Int64Path, index: number, displayPath: string): string {
  const segment = path[index];
  if (segment === "*") return `${displayPath}[*]`;
  return displayPath ? `${displayPath}.${segment}` : segment;
}

function validateRequestInt64AtPath(
  value: unknown,
  descriptor: RequestInt64Path,
  offset: number,
  displayPath: string,
  operation: string,
): void {
  const { path } = descriptor;
  if (value === undefined || (value === null && offset < path.length)) return;

  if (offset === path.length) {
    if (typeof value === "bigint") {
      if (!descriptor.unsigned || (value >= 0n && value <= MAX_UNSIGNED_INT64)) return;
      throw new ValidationError({
        operation,
        field: displayPath,
        rule: "unsigned-integer",
        message: `request field ${displayPath} must be an unsigned 64-bit integer`,
      });
    }
    if (typeof value === "number" && Number.isSafeInteger(value)) {
      if (!descriptor.unsigned || value >= 0) return;
      throw new ValidationError({
        operation,
        field: displayPath,
        rule: "unsigned-integer",
        message: `request field ${displayPath} must be an unsigned 64-bit integer`,
      });
    }
    if (descriptor.allowString && typeof value === "string") return;
    throw new ValidationError({
      operation,
      field: displayPath,
      rule: typeof value === "number" ? "safe-integer" : "type",
      message: `request field ${displayPath} must be a bigint or safe integer`,
    });
  }

  const segment = path[offset];
  if (segment === "*") {
    if (!Array.isArray(value)) {
      throw new ValidationError({
        operation,
        field: displayPath,
        rule: "type",
        message: `request field ${displayPath} must be an array`,
      });
    }
    value.forEach((item, index) =>
      validateRequestInt64AtPath(item, descriptor, offset + 1, `${displayPath}[${index}]`, operation));
    return;
  }

  if (typeof value !== "object" || Array.isArray(value)) {
    throw new ValidationError({
      operation,
      field: displayPath,
      rule: "type",
      message: `request field ${displayPath} must be an object`,
    });
  }
  const record = value as Record<string, unknown>;
  if (!Object.hasOwn(record, segment)) return;
  validateRequestInt64AtPath(
    record[segment],
    descriptor,
    offset + 1,
    requestFieldPath(path, offset, displayPath),
    operation,
  );
}

export function validateInt64RequestPaths(
  value: unknown,
  paths: readonly RequestInt64Path[],
  operation: string,
): void {
  for (const descriptor of paths) {
    validateRequestInt64AtPath(value, descriptor, 0, "", operation);
  }
}

function normalizeAtPath(
  value: unknown,
  path: Int64Path,
  offset: number,
  displayPath: string,
): unknown {
  if (value === undefined || value === null) return value;

  if (offset === path.length) {
    if (typeof value === "bigint") return value;
    if (typeof value === "number" && Number.isSafeInteger(value)) return BigInt(value);
    if (typeof value === "string" && INTEGER_LITERAL.test(value)) return BigInt(value);
    throw new SdkError(`expected int64 at ${displayPath}`);
  }

  const segment = path[offset];
  if (segment === "*") {
    if (!Array.isArray(value)) throw new SdkError(`expected array at ${displayPath}`);
    for (let index = 0; index < value.length; index++) {
      value[index] = normalizeAtPath(value[index], path, offset + 1, `${displayPath}[${index}]`);
    }
    return value;
  }

  if (typeof value !== "object" || Array.isArray(value)) {
    throw new SdkError(`expected object at ${displayPath}`);
  }
  const record = value as Record<string, unknown>;
  if (!Object.hasOwn(record, segment)) return value;
  record[segment] = normalizeAtPath(
    record[segment],
    path,
    offset + 1,
    displayPath ? `${displayPath}.${segment}` : segment,
  );
  return value;
}

export function normalizeInt64Paths(
  value: unknown,
  paths: readonly Int64Path[],
): unknown {
  let normalized = value;
  for (const path of paths) {
    normalized = normalizeAtPath(normalized, path, 0, "");
  }
  return normalized;
}
