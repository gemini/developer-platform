import { toBase64 } from "../utils/encoding.js";
import { paginate, type PaginationRequestOptions } from "./pagination.js";

import {
  ApiError,
  EndpointMismatch,
  SdkError,
  ValidationError,
  serializeError,
} from "../errors.js";
import { DEFAULT_TIMEOUT_MS, deadline, type RequestOptions, withSignal } from "../utils/deadline.js";
import { emitDiagnostic, type Logger, NOOP_LOGGER } from "../observability/logging.js";
import { createResponseMetadata, sanitizeDiagnosticUrl, type DiagnosticEvent, type DiagnosticListener, type OperationContext, type ResponseMetadata } from "../observability/diagnostics.js";
import type { Environment } from "../types/client.js";
import {
  isBoundaryBigInt,
  isBoundaryContainer,
  isBoundaryFunction,
  isBoundaryNumber,
  isBoundaryObject,
  isBoundaryString,
  formatBoundaryValue,
  type BoundaryRecord,
  type BoundaryValue,
} from "../utils/boundary-value.js";

const RETRYABLE_STATUS_CODES: readonly number[] = [429, 502, 503, 504];

const DEFAULT_BACKOFF_BASE_MS = 500;
const DEFAULT_BACKOFF_CAP_MS = 30_000;
const DEFAULT_BACKOFF_FACTOR = 2;
const MAX_SETTIMEOUT_MS = 2_147_483_647;
const DEFAULT_MAX_RETRIES = 5;
const DEFAULT_MAX_RESPONSE_SIZE_BYTES = 16 * 1024 * 1024;


export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
export type RestResponseMode = "json" | "file";
export type RestResponseContract = {
  successStatuses: readonly number[];
  responseContentTypes: readonly string[];
};
export type RestPrimitiveType = "boolean" | "integer" | "number" | "string";
export type RestQueryParameter = {
  name: string;
  in: string;
  required: boolean;
  style: string;
  explode: boolean;
  /** Primitive schema type for scalar values, when the generated contract can represent it. */
  valueType?: RestPrimitiveType;
  /** Primitive schema types for a composed scalar value. */
  valueTypes?: readonly RestPrimitiveType[];
  /** Primitive schema type for array items, when the generated contract can represent it. */
  itemType?: RestPrimitiveType;
  /** Primitive schema types for items in a composed array schema. */
  itemTypes?: readonly RestPrimitiveType[];
  "shape"?: "scalar" | "array" | "object";
  allowReserved?: boolean;
};
export type RestFileResponse = {
  bytes: Uint8Array;
  contentType?: string;
  contentDisposition?: string;
};

/** A successful REST result with response metadata from the transport. */
export type RestResponse<T = BoundaryValue> = {
  data: T;
  metadata: ResponseMetadata;
};

type FetchReader = {
  read(): Promise<{ done: boolean; value?: Uint8Array }>;
  cancel?(cause?: unknown): Promise<void>;
};

type RequestHeaders = Record<string, string>;

export type FetchResponse = {
  status: number;
  type?: string;
  headers?: { get(name: string): string | null };
  body: { getReader(): FetchReader } | null;
};

/** Return true for an HTTP redirect or an opaque browser redirect response. */
export function isRedirectResponse(response: { status: number; type?: string }): boolean {
  return response.status === 0 || response.type === "opaqueredirect" ||
    (response.status >= 300 && response.status < 400);
}

function cancelReader(reader: FetchReader | undefined, cause: unknown): void {
  try {
    const cancellation = reader?.cancel?.(cause);
    void cancellation?.catch(() => undefined);
  } catch {
    // Cancellation is best effort. Preserve the original error.
  }
}

/** @internal Best-effort cleanup for a response body the caller will not consume. */
export function cancelResponseBody(response: FetchResponse, cause: unknown): void {
  try {
    cancelReader(response.body?.getReader(), cause);
  } catch {
    // Cancellation is best effort. Preserve the original error.
  }
}

/** Read a text response with a fixed byte limit. */
export async function readBoundedResponseText(
  response: FetchResponse,
  maxBytes: number,
  signal?: AbortSignal,
): Promise<string> {
  const read = <T>(promise: Promise<T>): Promise<T> => signal ? withSignal(promise, signal) : promise;
  const contentLength = response.headers?.get("content-length");
  const declaredLength = contentLength === null || contentLength === undefined ? undefined : Number(contentLength);
  if (declaredLength !== undefined && Number.isSafeInteger(declaredLength) && declaredLength > maxBytes) {
    // Cancellation is best effort and an adapter may never settle it. Return the
    // known size-limit error without waiting for that adapter.
    cancelResponseBody(response, "response too large");
    throw new SdkError(`HTTP response exceeded the configured ${maxBytes}-byte limit`);
  }

  const reader = response.body?.getReader();
  if (!reader) {
    throw new SdkError("HTTP response body must expose a readable stream");
  }

  const decoder = new TextDecoder();
  let totalBytes = 0;
  let text = "";
  try {
    while (true) {
      const result = await read(reader.read());
      if (result.done) break;
      const chunk = result.value;
      if (!(chunk instanceof Uint8Array)) throw new SdkError("HTTP response body contained an invalid chunk");
      totalBytes += chunk.byteLength;
      if (totalBytes > maxBytes) {
        cancelReader(reader, "response too large");
        throw new SdkError(`HTTP response exceeded the configured ${maxBytes}-byte limit`);
      }
      text += decoder.decode(chunk, { stream: true });
    }
    return text + decoder.decode();
  } catch (error) {
    cancelReader(reader, error);
    throw error;
  }
}

/** Read a file response with a fixed byte limit. */
export async function readBoundedResponseBytes(
  response: FetchResponse,
  maxBytes: number,
  signal?: AbortSignal,
): Promise<Uint8Array> {
  const read = <T>(promise: Promise<T>): Promise<T> => signal ? withSignal(promise, signal) : promise;
  const contentLength = response.headers?.get("content-length");
  const declaredLength = contentLength === null || contentLength === undefined ? undefined : Number(contentLength);
  if (declaredLength !== undefined && Number.isSafeInteger(declaredLength) && declaredLength > maxBytes) {
    cancelResponseBody(response, "response too large");
    throw new SdkError(`HTTP response exceeded the configured ${maxBytes}-byte limit`);
  }

  const reader = response.body?.getReader();
  if (!reader) {
    throw new SdkError("file response body must expose a readable stream");
  }

  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const result = await read(reader.read());
      if (result.done) break;
      const chunk = result.value;
      if (!(chunk instanceof Uint8Array)) throw new SdkError("HTTP response body contained an invalid chunk");
      totalBytes += chunk.byteLength;
      if (totalBytes > maxBytes) {
        cancelReader(reader, "response too large");
        throw new SdkError(`HTTP response exceeded the configured ${maxBytes}-byte limit`);
      }
      chunks.push(chunk);
    }
  } catch (error) {
    cancelReader(reader, error);
    throw error;
  }
  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

/**
 * The part of `fetch` that this transport uses.
 * Native `fetch` satisfies this type.
 * The response must expose a readable body stream, or `null` for an empty body.
 * Response helpers consume only that bounded readable body stream.
 */
export type FetchLike = (
  url: string,
  init: {
    method: HttpMethod;
    headers: Record<string, string>;
    body?: string;
    signal?: AbortSignal;
    redirect?: "manual";
  },
) => Promise<FetchResponse>;

export interface RequestHookPayload {
  readonly method: HttpMethod;
  readonly url: string;
  readonly endpoint: string;
  readonly attempt: number;
  readonly correlationId: string;
  readonly headers: Record<string, string>;
}

export interface ResponseHookPayload {
  readonly method: HttpMethod;
  readonly url: string;
  readonly endpoint: string;
  readonly status: number;
  readonly durationMs: number;
  readonly attempt: number;
  readonly correlationId: string;
  readonly retryCount: number;
}

export type RequestHook = (payload: RequestHookPayload) => void;
export type ResponseHook = (payload: ResponseHookPayload) => void;

/** Create credentials for a private request. */
export interface AuthStrategy {
  /** Return the nonce required by the request, or `undefined` when the scheme does not use one. */
  nextNonce(): string | undefined;
  /** Return headers for a request with the private payload `payloadBase64`. */
  credentialHeaders(payloadBase64: string, options?: RequestOptions): Promise<Record<string, string>>;
}

// Decode JSON at the HTTP boundary so exchange IDs keep their exact values.
// Keep this parser independent of runtime-specific JSON.parse features.
class LosslessJsonParser {
  private index = 0;

  constructor(private readonly text: string) {}

  parse(): BoundaryValue {
    this.skipWhitespace();
    const value = this.parseValue();
    this.skipWhitespace();
    if (this.index !== this.text.length) this.fail("unexpected trailing characters");
    return value;
  }

  private parseValue(): BoundaryValue {
    this.skipWhitespace();
    if (this.index >= this.text.length) this.fail("unexpected end of JSON input");
    const code = this.text.charCodeAt(this.index);
    if (code === 123 /* '{' */) return this.parseObject();
    if (code === 91 /* '[' */) return this.parseArray();
    if (code === 34 /* '"' */) return this.parseString();
    if (code === 116 /* 't' */) {
      if (
        this.index + 3 < this.text.length &&
        this.text.charCodeAt(this.index + 1) === 114 /* 'r' */ &&
        this.text.charCodeAt(this.index + 2) === 117 /* 'u' */ &&
        this.text.charCodeAt(this.index + 3) === 101 /* 'e' */
      ) {
        this.index += 4;
        return true;
      }
      this.fail("expected true");
    }
    if (code === 102 /* 'f' */) {
      if (
        this.index + 4 < this.text.length &&
        this.text.charCodeAt(this.index + 1) === 97 /* 'a' */ &&
        this.text.charCodeAt(this.index + 2) === 108 /* 'l' */ &&
        this.text.charCodeAt(this.index + 3) === 115 /* 's' */ &&
        this.text.charCodeAt(this.index + 4) === 101 /* 'e' */
      ) {
        this.index += 5;
        return false;
      }
      this.fail("expected false");
    }
    if (code === 110 /* 'n' */) {
      if (
        this.index + 3 < this.text.length &&
        this.text.charCodeAt(this.index + 1) === 117 /* 'u' */ &&
        this.text.charCodeAt(this.index + 2) === 108 /* 'l' */ &&
        this.text.charCodeAt(this.index + 3) === 108 /* 'l' */
      ) {
        this.index += 4;
        return null;
      }
      this.fail("expected null");
    }
    return this.parseNumber();
  }

  private parseObject(): BoundaryRecord {
    this.index++;
    const object: BoundaryRecord = {};
    this.skipWhitespace();
    if (this.index < this.text.length && this.text.charCodeAt(this.index) === 125 /* '}' */) {
      this.index++;
      return object;
    }

    for (;;) {
      this.skipWhitespace();
      if (this.index >= this.text.length || this.text.charCodeAt(this.index) !== 34 /* '"' */) {
        this.fail("object keys must be strings");
      }
      const key = this.parseString();
      this.skipWhitespace();
      this.expectColon();
      const value = this.parseValue();
      if (key === "__proto__") {
        // Define __proto__ explicitly so it behaves like JSON.parse without mutating the prototype.
        Object.defineProperty(object, key, {
          configurable: true,
          enumerable: true,
          value,
          writable: true,
        });
      } else {
        object[key] = value;
      }
      this.skipWhitespace();
      if (this.index < this.text.length && this.text.charCodeAt(this.index) === 125 /* '}' */) {
        this.index++;
        return object;
      }
      this.expectComma();
    }
  }

  private parseArray(): BoundaryValue[] {
    this.index++;
    const array: BoundaryValue[] = [];
    this.skipWhitespace();
    if (this.index < this.text.length && this.text.charCodeAt(this.index) === 93 /* ']' */) {
      this.index++;
      return array;
    }

    for (;;) {
      array.push(this.parseValue());
      this.skipWhitespace();
      if (this.index < this.text.length && this.text.charCodeAt(this.index) === 93 /* ']' */) {
        this.index++;
        return array;
      }
      this.expectComma();
    }
  }

  private parseString(): string {
    const start = this.index;
    this.index++;
    let hasEscape = false;
    let escaped = false;
    const len = this.text.length;
    while (this.index < len) {
      const code = this.text.charCodeAt(this.index++);
      if (escaped) {
        escaped = false;
        continue;
      }
      if (code === 92 /* '\\' */) {
        hasEscape = true;
        escaped = true;
        continue;
      }
      if (code < 32) {
        this.fail("unescaped control character in string");
      }
      if (code === 34 /* '"' */) {
        if (!hasEscape) {
          return this.text.slice(start + 1, this.index - 1);
        }
        try {
          const parsed = JSON.parse(this.text.slice(start, this.index));
          if (isBoundaryString(parsed)) return parsed;
          this.fail("invalid parsed string");
        } catch {
          this.fail("invalid string escape");
        }
      }
    }
    this.fail("unterminated string");
  }

  private parseNumber(): number | bigint {
    const start = this.index;
    const len = this.text.length;
    let curr = this.index;
    if (curr < len && this.text.charCodeAt(curr) === 45 /* '-' */) {
      curr++;
    }
    const digitStart = curr;
    while (curr < len) {
      const code = this.text.charCodeAt(curr);
      if (code >= 48 && code <= 57) {
        curr++;
      } else {
        break;
      }
    }
    if (curr === digitStart) this.fail("expected a JSON value");
    // Disallow leading zeros on multi-digit integer portion per JSON RFC
    if (curr - digitStart > 1 && this.text.charCodeAt(digitStart) === 48) {
      this.fail("numbers cannot have leading zeros");
    }

    let isInteger = true;
    if (curr < len && this.text.charCodeAt(curr) === 46 /* '.' */) {
      isInteger = false;
      curr++;
      const fracStart = curr;
      while (curr < len) {
        const code = this.text.charCodeAt(curr);
        if (code >= 48 && code <= 57) {
          curr++;
        } else {
          break;
        }
      }
      if (curr === fracStart) this.fail("expected decimal fraction digits");
    }

    if (curr < len) {
      const expCode = this.text.charCodeAt(curr);
      if (expCode === 101 /* 'e' */ || expCode === 69 /* 'E' */) {
        isInteger = false;
        curr++;
        if (curr < len && (this.text.charCodeAt(curr) === 43 || this.text.charCodeAt(curr) === 45)) {
          curr++;
        }
        const expDigitStart = curr;
        while (curr < len) {
          const code = this.text.charCodeAt(curr);
          if (code >= 48 && code <= 57) {
            curr++;
          } else {
            break;
          }
        }
        if (curr === expDigitStart) this.fail("expected exponent digits");
      }
    }

    const literal = this.text.slice(start, curr);
    this.index = curr;
    const number = Number(literal);
    if (isInteger && !Number.isSafeInteger(number)) {
      try {
        return BigInt(literal);
      } catch {
        this.fail("invalid integer");
      }
    }
    const significand = literal.replace(/[eE][+-]?\d+$/, "");
    if (!Number.isFinite(number) || (number === 0 && /[1-9]/.test(significand))) {
      this.fail("number is outside the representable finite range");
    }
    return number;
  }

  private consume(value: string): boolean {
    const vLen = value.length;
    if (this.index + vLen <= this.text.length) {
      for (let i = 0; i < vLen; i++) {
        if (this.text.charCodeAt(this.index + i) !== value.charCodeAt(i)) {
          return false;
        }
      }
      this.index += vLen;
      return true;
    }
    return false;
  }

  private expectColon(): void {
    if (this.index < this.text.length && this.text.charCodeAt(this.index) === 58 /* ':' */) {
      this.index++;
    } else {
      this.fail('expected ":"');
    }
  }

  private expectComma(): void {
    if (this.index < this.text.length && this.text.charCodeAt(this.index) === 44 /* ',' */) {
      this.index++;
    } else {
      this.fail('expected ","');
    }
  }

  private expect(value: string): void {
    if (!this.consume(value)) this.fail(`expected "${value}"`);
  }

  private skipWhitespace(): void {
    const len = this.text.length;
    while (this.index < len) {
      const code = this.text.charCodeAt(this.index);
      if (code <= 32 && (code === 32 || code === 10 || code === 13 || code === 9)) {
        this.index++;
      } else {
        break;
      }
    }
  }

  private fail(message: string): never {
    throw new SyntaxError(`${message} at position ${this.index}`);
  }
}

export function parseLosslessJson(text: string): BoundaryValue {
  return new LosslessJsonParser(text).parse();
}

export type Int64Path = readonly string[];
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
  value: BoundaryValue,
  descriptor: RequestInt64Path,
  offset: number,
  displayPath: string,
  operation: string,
): void {
  const { path } = descriptor;
  if (value === undefined || (value === null && offset < path.length)) return;
  if (offset === path.length) {
    if (isBoundaryBigInt(value)) {
      if (!descriptor.unsigned || (value >= 0n && value <= MAX_UNSIGNED_INT64)) return;
      throw new ValidationError({ operation, field: displayPath, rule: "unsigned-integer", message: `request field ${displayPath} must be an unsigned 64-bit integer` });
    }
    if (isBoundaryNumber(value) && Number.isSafeInteger(value)) {
      if (!descriptor.unsigned || value >= 0) return;
      throw new ValidationError({ operation, field: displayPath, rule: "unsigned-integer", message: `request field ${displayPath} must be an unsigned 64-bit integer` });
    }
    if (descriptor.allowString && isBoundaryString(value)) return;
    throw new ValidationError({ operation, field: displayPath, rule: isBoundaryNumber(value) ? "safe-integer" : "type", message: `request field ${displayPath} must be a bigint or safe integer` });
  }
  const segment = path[offset];
  if (segment === "*") {
    if (!Array.isArray(value)) throw new ValidationError({ operation, field: displayPath, rule: "type", message: `request field ${displayPath} must be an array` });
    value.forEach((item, index) => validateRequestInt64AtPath(item, descriptor, offset + 1, `${displayPath}[${index}]`, operation));
    return;
  }
  if (!isBoundaryObject(value)) throw new ValidationError({ operation, field: displayPath, rule: "type", message: `request field ${displayPath} must be an object` });
  const record = value;
  if (!Object.hasOwn(record, segment)) return;
  validateRequestInt64AtPath(record[segment], descriptor, offset + 1, requestFieldPath(path, offset, displayPath), operation);
}

export function validateInt64RequestPaths(
  value: BoundaryValue,
  paths: readonly RequestInt64Path[],
  operation: string,
): void {
  for (const descriptor of paths) validateRequestInt64AtPath(value, descriptor, 0, "", operation);
}

const INTEGER_LITERAL = /^-?\d+$/;

function normalizeAtPath(value: BoundaryValue, path: Int64Path, offset: number, displayPath: string): BoundaryValue {
  if (value === undefined || value === null) return value;
  if (offset === path.length) {
    if (isBoundaryBigInt(value)) return value;
    if (isBoundaryNumber(value) && Number.isSafeInteger(value)) return BigInt(value);
    if (isBoundaryString(value) && INTEGER_LITERAL.test(value)) return BigInt(value);
    throw new SdkError(`expected int64 at ${displayPath}`);
  }
  const segment = path[offset];
  if (segment === "*") {
    if (!Array.isArray(value)) throw new SdkError(`expected array at ${displayPath}`);
    for (let index = 0; index < value.length; index++) value[index] = normalizeAtPath(value[index], path, offset + 1, `${displayPath}[${index}]`);
    return value;
  }
  if (!isBoundaryObject(value)) throw new SdkError(`expected object at ${displayPath}`);
  const record = value;
  if (!Object.hasOwn(record, segment)) return value;
  record[segment] = normalizeAtPath(record[segment], path, offset + 1, displayPath ? `${displayPath}.${segment}` : segment);
  return value;
}

export function normalizeInt64Paths(value: BoundaryValue, paths: readonly Int64Path[]): BoundaryValue {
  let normalized = value;
  for (const path of paths) normalized = normalizeAtPath(normalized, path, 0, "");
  return normalized;
}

const RAW_JSON = Symbol("gemini.rawJSON");
type RawJsonFallback = { readonly [RAW_JSON]: string };
type JSONWithRawJSON = typeof JSON & { rawJSON?: (source: string) => BoundaryValue };
// SAFETY: JSON is the platform object; this optional property is the Stage 4 raw JSON hook when the runtime provides it.
const candidateRawJSON = (JSON as JSONWithRawJSON).rawJSON;
const nativeRawJSON = isBoundaryFunction(candidateRawJSON) ? candidateRawJSON : undefined;

function rawJSON(source: string): BoundaryValue {
  return nativeRawJSON ? nativeRawJSON(source) : { [RAW_JSON]: source } satisfies RawJsonFallback;
}

let rawJsonMarker = 0;

function containsString(value: BoundaryValue, needle: string, seen = new Set<object>()): boolean {
  if (isBoundaryString(value)) return value.includes(needle);
  if (!isBoundaryContainer(value) || seen.has(value)) return false;
  seen.add(value);
  if (Array.isArray(value)) return value.some((item) => containsString(item, needle, seen));
  if (!isBoundaryObject(value)) return false;
  const record = value;
  return Object.keys(record).some((key) => key.includes(needle) || containsString(record[key], needle, seen));
}

function nextRawJsonMarker(value: BoundaryValue): string {
  let marker: string;
  do {
    marker = `__gemini_raw_json_${rawJsonMarker++}__`;
  } while (containsString(value, marker));
  return marker;
}

function isAsciiDigits(value: string): boolean {
  return value.length > 0 && [...value].every((character) => character >= "0" && character <= "9");
}

function rawJsonSlot(value: string, marker: string, rawValueCount: number): number | undefined {
  if (!value.startsWith(marker) || !value.endsWith("__")) return undefined;
  const indexText = value.slice(marker.length, -2);
  if (!isAsciiDigits(indexText)) return undefined;
  const index = Number(indexText);
  return Number.isSafeInteger(index) && index < rawValueCount ? index : undefined;
}

function jsonStringEnd(json: string, start: number): number {
  let escaped = false;
  for (let index = start + 1; index < json.length; index++) {
    const character = json[index];
    if (escaped) {
      escaped = false;
    } else if (character === "\\") {
      escaped = true;
    } else if (character === '"') {
      return index + 1;
    }
  }
  return json.length;
}

function countRawJsonSlots(json: string, marker: string, rawValueCount: number): number {
  let count = 0;
  for (let cursor = 0; cursor < json.length;) {
    const start = json.indexOf('"', cursor);
    if (start === -1) break;
    const end = jsonStringEnd(json, start);
    const value = JSON.parse(json.slice(start, end));
    if (isBoundaryString(value) && rawJsonSlot(value, marker, rawValueCount) !== undefined) count++;
    cursor = end;
  }
  return count;
}

function replaceRawJsonSlots(json: string, marker: string, rawValues: readonly string[]): string {
  let output = "";
  let cursor = 0;
  while (cursor < json.length) {
    const start = json.indexOf('"', cursor);
    if (start === -1) {
      output += json.slice(cursor);
      break;
    }
    const end = jsonStringEnd(json, start);
    output += json.slice(cursor, start);
    const value = JSON.parse(json.slice(start, end));
    const slot = isBoundaryString(value) ? rawJsonSlot(value, marker, rawValues.length) : undefined;
    output += slot === undefined ? json.slice(start, end) : rawValues[slot]!;
    cursor = end;
  }
  return output;
}

/** Serialize JSON while preserving bigint and raw JSON integer values exactly. */
export function stringifyJson(value: BoundaryValue): string {
  if (nativeRawJSON) {
    return JSON.stringify(value, (_key, nested) =>
      isBoundaryBigInt(nested) ? nativeRawJSON(nested.toString()) : nested,
    );
  }

  for (;;) {
    const rawValues: string[] = [];
    const marker = nextRawJsonMarker(value);
    const json = JSON.stringify(value, (_key, nested) => {
      if (nested !== null && isBoundaryObject(nested) && RAW_JSON in nested) {
        // SAFETY: RAW_JSON is the marker installed by rawJSON() immediately above this serializer.
        const source = (nested as RawJsonFallback)[RAW_JSON];
        if (!isBoundaryString(source)) return nested;
        const index = rawValues.push(source) - 1;
        return `${marker}${index}__`;
      }
      if (isBoundaryBigInt(nested)) {
        const index = rawValues.push(nested.toString()) - 1;
        return `${marker}${index}__`;
      }
      return nested;
    });
    if (countRawJsonSlots(json, marker, rawValues.length) === rawValues.length) {
      return replaceRawJsonSlots(json, marker, rawValues);
    }
  }
}

function mediaType(value: string | null | undefined): string | undefined {
  return value?.split(";", 1)[0]?.trim().toLowerCase() || undefined;
}

function validateResponseContract(
  status: number,
  headers: { get(name: string): string | null } | undefined,
  contract: RestResponseContract,
  path: string,
  metadata?: ResponseMetadata,
): void {
  if (!contract.successStatuses.includes(status)) {
    throw new SdkError(`unexpected success status ${status} for ${path}`, { metadata });
  }
  const actual = mediaType(headers?.get("content-type"));
  const expected = contract.responseContentTypes.map((value) => mediaType(value));
  if (!actual || !expected.includes(actual)) {
    throw new SdkError(`unexpected success content type ${actual ?? "missing"} for ${path}`, { metadata });
  }
}

const RESERVED_QUERY_ESCAPE = /%(?:21|23|24|26|27|28|29|2A|2B|2C|2F|3A|3B|3D|3F|40|5B|5D)/gi;
const COMPONENT_ESCAPE = /[!'()*]/g;

function encodeQueryValue(value: BoundaryValue, allowReserved: boolean): string {
  const encoded = encodeURIComponent(formatBoundaryValue(value)).replace(COMPONENT_ESCAPE, (character) =>
    `%${character.charCodeAt(0).toString(16).toUpperCase()}`);
  return allowReserved ? encoded.replace(RESERVED_QUERY_ESCAPE, decodeURIComponent) : encoded;
}

function appendQueryPair(
  parts: string[],
  name: string,
  value: BoundaryValue,
  allowReserved = false,
): void {
  parts.push(`${encodeQueryValue(name, false)}=${encodeQueryValue(value, allowReserved)}`);
}

function appendEncodedQueryPair(parts: string[], name: string, encodedValue: string): void {
  parts.push(`${encodeQueryValue(name, false)}=${encodedValue}`);
}

function encodedQueryValues(values: readonly BoundaryValue[], delimiter: string, allowReserved: boolean): string {
  return values
    .filter((value) => value !== undefined)
    .map((value) => encodeQueryValue(value, allowReserved))
    .join(delimiter);
}

function withDeclaredQuery(
  path: string,
  query: BoundaryRecord,
  parameters: readonly RestQueryParameter[],
): string {
  const parts: string[] = [];
  for (const parameter of parameters) {
    const value = query[parameter.name];
    if (value === undefined) continue;
    const allowReserved = Boolean(parameter.allowReserved);
    if (parameter.style === "form") {
      if (Array.isArray(value)) {
        if (parameter.explode) {
          for (const item of value) {
            if (item !== undefined) appendQueryPair(parts, parameter.name, item, allowReserved);
          }
        } else {
          appendEncodedQueryPair(parts, parameter.name, encodedQueryValues(value, ",", allowReserved));
        }
      } else if (isBoundaryObject(value)) {
        const entries = Object.entries(value).filter(([, item]) => item !== undefined);
        if (parameter.explode) {
          for (const [name, item] of entries) appendQueryPair(parts, name, item, allowReserved);
        } else {
          const flattened = entries.flatMap(([name, item]) => [name, item]);
          appendEncodedQueryPair(parts, parameter.name, encodedQueryValues(flattened, ",", allowReserved));
        }
      } else {
        appendQueryPair(parts, parameter.name, value, allowReserved);
      }
    } else if (parameter.style === "spaceDelimited" || parameter.style === "pipeDelimited") {
      const delimiter = parameter.style === "spaceDelimited" ? "%20" : "%7C";
      if (!Array.isArray(value)) throw new SdkError(`${parameter.name} must be an array for ${parameter.style} serialization`);
      appendEncodedQueryPair(parts, parameter.name, encodedQueryValues(value, delimiter, allowReserved));
    } else if (parameter.style === "deepObject" && isBoundaryObject(value)) {
      for (const [name, item] of Object.entries(value)) {
        if (item !== undefined) appendQueryPair(parts, `${parameter.name}[${name}]`, item, allowReserved);
      }
    } else {
      throw new SdkError(`unsupported query parameter serialization for ${parameter.name}`);
    }
  }
  return parts.length > 0 ? `${path}?${parts.join("&")}` : path;
}

function withQuery(
  path: string,
  query?: BoundaryRecord,
  parameters?: readonly RestQueryParameter[],
): string {
  if (!query) return path;
  if (parameters) return withDeclaredQuery(path, query, parameters);
  const parts: string[] = [];
  for (const key of Object.keys(query)) {
    const value = query[key];
    if (value === undefined) continue;
    const encodedKey = encodeURIComponent(key);
    if (Array.isArray(value)) {
      for (let i = 0; i < value.length; i++) {
        const item = value[i];
        if (item !== undefined) {
          parts.push(`${encodedKey}=${encodeURIComponent(formatBoundaryValue(item))}`);
        }
      }
    } else {
      parts.push(`${encodedKey}=${encodeURIComponent(formatBoundaryValue(value))}`);
    }
  }
  return parts.length > 0 ? `${path}?${parts.join("&")}` : path;
}

export interface HttpTransportOptions {
  env: Environment;
  /** Optional base URL override. Direct users use the selected environment by default. */
  baseUrl?: string;
  auth?: AuthStrategy;
  fetchImpl?: FetchLike;
  logger?: Logger;
  onDiagnostic?: DiagnosticListener;
  /** Maximum client-side retries for safe generated reads. Default: 5. */
  maxRetries?: number;
  /** Backoff settings for transient reads. Defaults: 500 ms, 30 s, and factor 2. */
  backoff?: { baseMs?: number; capMs?: number; factor?: number };
  /** Default end-to-end request deadline. Default: 30 seconds. */
  timeoutMs?: number;
  /** Maximum REST response body size. Default: 16 MiB. */
  maxResponseSizeBytes?: number;
  /** Clock used to read `Retry-After` HTTP dates. */
  now?: () => number;
  /** Optional hook for request logs and metrics. */
  onRequest?: RequestHook;
  /** Optional hook for response logs and metrics. */
  onResponse?: ResponseHook;
  // Tests inject this function to make waits deterministic. Production uses the default.
  random?: () => number;
  sleep?: (ms: number) => Promise<void>;
}

type RestRequestOptions = {
  method: HttpMethod;
  path: string;
  query?: BoundaryRecord;
  queryParameters?: readonly RestQueryParameter[];
  headers?: Record<string, string>;
  responseInt64Paths?: readonly Int64Path[];
  responseMode?: RestResponseMode;
  responseContract?: RestResponseContract;
  retryable?: boolean;
  operationContext?: OperationContext;
} & RequestOptions;

type PrivateRestRequestOptions = RestRequestOptions & {
  params?: BoundaryRecord;
};

export class HttpTransport {
  private readonly baseUrl: string;
  private readonly auth?: AuthStrategy;
  private readonly fetchImpl: FetchLike;
  private readonly logger: Logger;
  private readonly onDiagnostic?: DiagnosticListener;
  private readonly onRequest?: RequestHook;
  private readonly onResponse?: ResponseHook;
  private readonly maxRetries: number;
  private readonly baseMs: number;
  private readonly capMs: number;
  private readonly factor: number;
  private readonly random: () => number;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly timeoutMs: number;
  private readonly maxResponseSizeBytes: number;
  private readonly now: () => number;

  constructor(options: HttpTransportOptions) {
    this.baseUrl = options.baseUrl ?? (options.env === "sandbox"
      ? "https://api.sandbox.gemini.com"
      : "https://api.gemini.com");
    this.auth = options.auth;
    // SAFETY: The platform fetch response is adapted to the SDK's deliberately smaller FetchLike contract.
    this.fetchImpl = options.fetchImpl ?? ((url, init) => fetch(url, init) as ReturnType<FetchLike>);
    this.logger = options.logger ?? NOOP_LOGGER;
    this.onDiagnostic = options.onDiagnostic;
    this.onRequest = options.onRequest;
    this.onResponse = options.onResponse;
    const maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
    if (!Number.isInteger(maxRetries) || maxRetries < 0) {
      throw new SdkError("maxRetries must be a finite non-negative integer");
    }
    this.maxRetries = maxRetries;
    this.baseMs = options.backoff?.baseMs ?? DEFAULT_BACKOFF_BASE_MS;
    this.capMs = options.backoff?.capMs ?? DEFAULT_BACKOFF_CAP_MS;
    this.factor = options.backoff?.factor ?? DEFAULT_BACKOFF_FACTOR;
    if (![this.baseMs, this.capMs, this.factor].every(Number.isFinite) || this.baseMs < 0 || this.capMs < 0 || this.factor < 1) throw new SdkError("backoff values must be finite (base/cap >= 0, factor >= 1)");
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    if (!Number.isFinite(this.timeoutMs) || this.timeoutMs <= 0) throw new SdkError("timeoutMs must be a finite positive number");
    this.maxResponseSizeBytes = options.maxResponseSizeBytes ?? DEFAULT_MAX_RESPONSE_SIZE_BYTES;
    if (!Number.isSafeInteger(this.maxResponseSizeBytes) || this.maxResponseSizeBytes <= 0) {
      throw new SdkError("maxResponseSizeBytes must be a positive safe integer");
    }
    this.now = options.now ?? Date.now;
    this.random = options.random ?? Math.random;
    this.sleep = options.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  }

  // Use equal jitter for each retry: half fixed and half random.
  // This prevents clients from retrying at the same time.
  private backoffDelay(attempt: number): number {
    const raw = Math.min(this.capMs, this.baseMs * this.factor ** attempt);
    return raw / 2 + this.random() * (raw / 2);
  }

  private retryAfterDelay(value: string | null | undefined, attempt: number): number {
    const trimmed = value?.trim();
    if (trimmed && /^\d+$/.test(trimmed)) {
      const seconds = Number(trimmed);
      if (Number.isSafeInteger(seconds)) return Math.min(seconds * 1000, MAX_SETTIMEOUT_MS);
    }
    if (trimmed) {
      const date = Date.parse(trimmed);
      if (Number.isFinite(date)) return Math.min(Math.max(0, date - this.now()), MAX_SETTIMEOUT_MS);
    }
    return this.backoffDelay(attempt);
  }

  private async delay(ms: number, signal: AbortSignal): Promise<void> {
    await withSignal(this.sleep(ms), signal);
  }

  private isTransient(cause: unknown): boolean {
    if (cause instanceof TypeError) return true;
    const source = Object(cause);
    return ["ECONNRESET", "ECONNREFUSED", "ECONNABORTED", "ETIMEDOUT", "EPIPE"].includes(String(source.code)) ||
      ["AbortError", "NetworkError"].includes(String(source.name));
  }

  /** Send a signed private request. Build the payload and add auth headers. */
  async request<T = BoundaryValue>(options: PrivateRestRequestOptions): Promise<T> {
    const response = await this.requestWithResponse<T>(options);
    return response.data;
  }

  /** Send a signed private request and return the body and response metadata. */
  async requestWithResponse<T = BoundaryValue>(options: PrivateRestRequestOptions): Promise<RestResponse<T>> {
    const { method, path, params } = options;
    const requestPath = withQuery(path, options.query, options.queryParameters);
    if (!this.auth) {
      throw new SdkError("private request requires an injected AuthStrategy");
    }
    if (
      (params && Object.hasOwn(params, "nonce")) ||
      (options.query && Object.hasOwn(options.query, "nonce"))
    ) {
      throw new SdkError("nonce is reserved for the AuthStrategy");
    }
    const reservedCallerHeader = Object.keys(options.headers ?? {}).find((name) => {
      const normalized = name.toLowerCase();
      return normalized.startsWith("x-gemini-") || ["authorization", "content-length", "content-type", "cache-control", ...(options.responseContract ? ["accept"] : [])].includes(normalized);
    });
    if (reservedCallerHeader) {
      throw new SdkError(`private request header ${reservedCallerHeader} is reserved for transport or authentication`);
    }
    const auth = this.auth;
    const stableHeaders = { ...options.headers };
    // A retry refreshes authentication only.
    // Do not allow caller mutation to change the trading instruction.
    const stableParams = structuredClone(params);

    // Build the signed request for each attempt.
    // Each attempt gets a new nonce and signature.
    const build = async (signal?: AbortSignal) => {
      const payload: BoundaryRecord = { request: requestPath, ...stableParams };
      // A params key must not override the signed endpoint.
      if (payload.request !== requestPath) {
        throw new EndpointMismatch(requestPath, payload.request);
      }
      const nonce = auth.nextNonce();
      if (nonce !== undefined) {
        if (!/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(nonce)) {
          throw new SdkError("AuthStrategy returned an invalid nonce");
        }
        payload.nonce = rawJSON(nonce);
      }
      const json = stringifyJson(payload);
      const b64 = toBase64(json);
      const credentials = await auth.credentialHeaders(b64, { signal });
      const reservedHeader = Object.keys(credentials).find((name) =>
        ["content-length", "content-type", "cache-control", "x-gemini-payload"].includes(
          name.toLowerCase(),
        ),
      );
      if (reservedHeader) {
        throw new SdkError(`AuthStrategy returned reserved header ${reservedHeader}`);
      }
      // Add auth headers first so the fixed envelope headers always win.
      // This prevents an auth strategy from replacing the payload or content headers.
      const headers = {
        ...stableHeaders,
        ...credentials,
        "Content-Length": "0",
        "Content-Type": "text/plain",
        "Cache-Control": "no-cache",
        "X-GEMINI-PAYLOAD": b64,
        ...(options.responseContract
          ? { Accept: options.responseContract.responseContentTypes.join(", ") }
          : null),
      } satisfies RequestHeaders;
      return headers;
    };

    return this.send<T>(
      method,
      requestPath,
      build,
      options.responseInt64Paths,
      options.responseMode,
      options.responseContract,
      options.retryable,
      options,
      options.operationContext,
    );
  }

  /**
   * Send an unsigned public request for market data.
   * Query parameters go in the URL.
   * The request uses the same parsing, error mapping, and 429 backoff as private requests.
   */
  async requestPublic<T = BoundaryValue>(options: RestRequestOptions): Promise<T> {
    const response = await this.requestPublicWithResponse<T>(options);
    return response.data;
  }

  /** Send an unsigned public request and return the body and response metadata. */
  async requestPublicWithResponse<T = BoundaryValue>(options: RestRequestOptions): Promise<RestResponse<T>> {
    const reservedCallerHeader = Object.keys(options.headers ?? {}).find((name) => {
      const normalized = name.toLowerCase();
      return normalized.startsWith("x-gemini-") ||
        ["authorization", "content-length", "content-type", "cache-control", ...(options.responseContract ? ["accept"] : [])].includes(normalized);
    });
    if (reservedCallerHeader) {
      throw new SdkError(`public request header ${reservedCallerHeader} is reserved by transport or the REST operation contract`);
    }
    const stableHeaders = {
      ...options.headers,
    };
    if (options.responseContract) {
      stableHeaders.Accept = options.responseContract.responseContentTypes.join(", ");
    }
    return this.send<T>(
      options.method,
      withQuery(options.path, options.query, options.queryParameters),
      async () => stableHeaders,
      options.responseInt64Paths,
      options.responseMode,
      options.responseContract,
      options.retryable,
      options,
      options.operationContext,
    );
  }

  /**
   * Walk an offset-paginated endpoint, yielding each item across pages. The API
   * has no cursors: pages advance by incrementing `offset` by `limit` until a
   * short page (fewer than `limit` items) signals the end. Use `itemsKey` for
   * documented object envelopes such as `{ orders, pagination }`. `limit`
   * defaults to 50 and is clamped to the documented max of 500. Public pages
   * use query parameters; private pages default to the signed payload but can
   * select query parameters for endpoints that document them there. Offset
   * pagination is not snapshot-consistent; provide `dedupeKey` when drift
   * must fail loudly instead of yielding the same logical record twice.
   * @yields An item from the paginated endpoint response.
   */
  paginate<T extends BoundaryValue = BoundaryValue>(options: PaginationRequestOptions<T>): AsyncGenerator<T> {
    return paginate<T>(this, this.timeoutMs, options);
  }

  // Send the request with a bounded retry for safe reads.
  // Build headers for each attempt so each retry is signed again.
  // Return mutations and non-transient errors once.
  private async send<T = BoundaryValue>(
    method: HttpMethod,
    path: string,
    buildHeaders: (signal?: AbortSignal) => Promise<Record<string, string>>,
    responseInt64Paths: readonly Int64Path[] = [],
    responseMode: RestResponseMode = "json",
    responseContract?: RestResponseContract,
    retryable = false,
    requestOptions: RequestOptions = {},
    operationContext?: OperationContext,
  ): Promise<RestResponse<T>> {
    const endpoint = path.split("?", 1)[0] ?? path;
    const requestUrl = `${this.baseUrl}${path}`;
    const lifecycleUrl = sanitizeDiagnosticUrl(requestUrl);
    if (responseMode !== "json" && responseMode !== "file") {
      throw new SdkError(`unsupported response mode ${formatBoundaryValue(responseMode)} for ${endpoint}`);
    }
    const canRetry = retryable && method === "GET";
    const correlationId = crypto.randomUUID();
    const responseMetadata = (
      status: number | undefined,
      retryCount: number,
      response?: { headers?: { get(name: string): string | null } },
    ): ResponseMetadata => createResponseMetadata({
        endpoint,
        method,
        correlationId,
        status,
        retryCount,
        headers: response?.headers,
      });
    const emit = (
      level: "debug" | "info" | "warn" | "error",
      name: string,
      response?: ResponseMetadata,
      metadata?: BoundaryRecord,
      cause?: unknown,
    ): void => {
      const event: DiagnosticEvent = {
        level,
        component: "rest",
        name,
        correlationId: response?.correlationId,
        response,
        operationContext,
        metadata: { ...metadata, url: lifecycleUrl },
      };
      if (cause) event.error = serializeError(cause);
      emitDiagnostic(event, this.logger, this.onDiagnostic);
    };
    emit("debug", "request.start", responseMetadata(undefined, 0), {
      operation: operationContext?.operation,
    });
    const execution = deadline(requestOptions, this.timeoutMs);
    try { for (let attempt = 0; ; attempt++) {
      let headers: Record<string, string>;
      try {
        headers = await withSignal(buildHeaders(execution.signal), execution.signal);
      } catch (cause) {
        emit("error", "request.failure", responseMetadata(undefined, attempt), undefined, cause);
        throw cause;
      }
      let response: Awaited<ReturnType<FetchLike>>;
      if (this.onRequest) {
        try {
          this.onRequest({
            method,
            url: lifecycleUrl,
            endpoint,
            attempt,
            correlationId,
            headers: Object.fromEntries(Object.entries(headers).filter(([name]) =>
              ["accept", "cache-control", "content-length", "content-type", "traceparent", "tracestate", "user-agent", "x-correlation-id"].includes(name.toLowerCase()))),
          });
        } catch {
          // Hooks should not break core request dispatch
        }
      }
      const requestStartTime = Date.now();
      try {
        response = await withSignal(
          this.fetchImpl(requestUrl, { method, headers, signal: execution.signal, redirect: "manual" }),
          execution.signal,
        );
      } catch (cause) {
        if (cause instanceof SdkError) {
          emit("error", "transport.failure", responseMetadata(undefined, attempt), undefined, cause);
          throw cause;
        }
        if (canRetry && attempt < this.maxRetries && this.isTransient(cause)) {
          const delay = this.backoffDelay(attempt);
          emit("warn", "request.retry", responseMetadata(undefined, attempt), { attempt, delayMs: delay });
          await this.delay(delay, execution.signal);
          continue;
        }
        const error = new SdkError(`HTTP request failed for ${endpoint}`, {
          cause,
          metadata: responseMetadata(undefined, attempt),
          operationContext,
        });
        emit("error", "transport.failure", error.metadata, undefined, error);
        throw error;
      }

      if (this.onResponse) {
        try {
          this.onResponse({
            method,
            url: lifecycleUrl,
            endpoint,
            status: response.status,
            durationMs: Math.max(0, Date.now() - requestStartTime),
            attempt,
            correlationId,
            retryCount: attempt,
          });
        } catch {
          // Hooks should not break core response processing
        }
      }

      if (isRedirectResponse(response)) {
        const error = new SdkError(`unexpected redirect response from ${endpoint}`, {
          metadata: responseMetadata(response.status, attempt, response),
          operationContext,
        });
        cancelResponseBody(response, error);
        emit("error", "response.failure", error.metadata, undefined, error);
        throw error;
      }

      const isSuccess = response.status >= 200 && response.status < 300;
      if (isSuccess && responseContract) {
        try {
          validateResponseContract(
            response.status,
            response.headers,
            responseContract,
            endpoint,
            responseMetadata(response.status, attempt, response),
          );
        } catch (cause) {
          cancelResponseBody(response, cause);
          emit("error", "response.failure", responseMetadata(response.status, attempt, response), undefined, cause);
          throw cause;
        }
      }

      if (isSuccess && responseMode === "file") {
        if (!response.body) {
          const fileResponse = {
            bytes: new Uint8Array(),
            contentType: response.headers?.get("content-type") ?? undefined,
            contentDisposition: response.headers?.get("content-disposition") ?? undefined,
          } satisfies RestFileResponse;
          emit("info", "request.end", responseMetadata(response.status, attempt, response));
          return {
            // SAFETY: The generated REST operation supplies the response type for this file transport result.
            data: fileResponse as T,
            metadata: responseMetadata(response.status, attempt, response),
          };
        }
        try {
          const fileResponse = {
            bytes: await readBoundedResponseBytes(response, this.maxResponseSizeBytes, execution.signal),
            contentType: response.headers?.get("content-type") ?? undefined,
            contentDisposition: response.headers?.get("content-disposition") ?? undefined,
          } satisfies RestFileResponse;
          emit("info", "request.end", responseMetadata(response.status, attempt, response));
          return {
            // SAFETY: The generated REST operation supplies the response type for this file transport result.
            data: fileResponse as T,
            metadata: responseMetadata(response.status, attempt, response),
          };
        } catch (cause) {
          if (cause instanceof SdkError) throw cause;
          if (canRetry && attempt < this.maxRetries && this.isTransient(cause)) { await this.delay(this.backoffDelay(attempt), execution.signal); continue; }
          const error = new SdkError(`HTTP request failed for ${endpoint}`, {
            cause,
            metadata: responseMetadata(response.status, attempt, response),
            operationContext,
          });
          emit("error", "transport.failure", error.metadata, undefined, error);
          throw error;
        }
      }

      let text: string;
      try {
        text = await readBoundedResponseText(response, this.maxResponseSizeBytes, execution.signal);
      } catch (cause) {
        if (cause instanceof SdkError) throw cause;
        if (canRetry && RETRYABLE_STATUS_CODES.includes(response.status) && attempt < this.maxRetries && this.isTransient(cause)) {
          const delay = this.retryAfterDelay(response.headers?.get("retry-after"), attempt);
          emit("warn", "request.retry", responseMetadata(response.status, attempt, response), { attempt, delayMs: delay });
          await this.delay(delay, execution.signal);
          continue;
        }
        if (canRetry && attempt < this.maxRetries && this.isTransient(cause)) { await this.delay(this.backoffDelay(attempt), execution.signal); continue; }
        const error = new SdkError(`HTTP request failed for ${endpoint}`, {
          cause,
          metadata: responseMetadata(response.status, attempt, response),
          operationContext,
        });
        emit("error", "transport.failure", error.metadata, undefined, error);
        throw error;
      }

      if (canRetry && RETRYABLE_STATUS_CODES.includes(response.status) && attempt < this.maxRetries) {
        const delay = this.retryAfterDelay(response.headers?.get("retry-after"), attempt);
        emit("warn", "request.retry", responseMetadata(response.status, attempt, response), { attempt, delayMs: delay });
        await this.delay(delay, execution.signal);
        continue;
      }

      // Parse the body, but never let a non-JSON body (a proxy/LB HTML error
      // page, an empty 429) escape as a raw SyntaxError — that would strip the
      // HTTP status and defeat error mapping. Empty -> undefined; unparseable on
      // an error status -> map by status, keeping the raw text as the message.
      let body: BoundaryValue;
      try {
        body = text ? parseLosslessJson(text) : undefined;
      } catch (cause) {
        if (isSuccess) {
          // A 2xx that isn't JSON is a protocol violation — fail loud, typed.
          const error = new SdkError(`unparseable success response from ${endpoint}`, {
            cause,
            metadata: responseMetadata(response.status, attempt, response),
            operationContext,
          });
          emit("error", "response.failure", error.metadata, undefined, error);
          throw error;
        }
        body = text;
      }

      if (isSuccess) {
        let normalizedResponse: BoundaryValue;
        try {
          normalizedResponse = normalizeInt64Paths(body, responseInt64Paths);
        } catch (cause) {
          emit("error", "response.failure", responseMetadata(response.status, attempt, response), undefined, cause);
          throw cause;
        }
        emit("info", "request.end", responseMetadata(response.status, attempt, response));
        return {
          // SAFETY: The generated REST operation supplies the response type for this transport result.
          data: normalizedResponse as T,
          metadata: responseMetadata(response.status, attempt, response),
        };
      }

      const apiError = ApiError.fromResponse({
        status: response.status,
        body,
        metadata: responseMetadata(response.status, attempt, response),
        operationContext,
      });
      emit("error", "api.error", apiError.metadata, undefined, apiError);
      throw apiError;
    } } finally { execution.cleanup(); }
  }
}
