/** Any non-primitive value crossing an SDK I/O boundary before schema parsing. */
export type BoundaryObject = object;

/** Values that can cross an SDK I/O boundary before a schema-specific parser narrows them. */
export type BoundaryValue<Owner extends BoundaryObject = BoundaryObject> = Owner | string | number | bigint | boolean | symbol | null | undefined;

function createBoundaryRecord(entries: readonly (readonly [string, BoundaryValue])[]) {
  return Object.fromEntries(entries);
}

/** A string-keyed boundary object used while inspecting unparsed payloads. */
export type BoundaryRecord = ReturnType<typeof createBoundaryRecord>;

export type BoundaryValueKind =
  | "undefined"
  | "null"
  | "string"
  | "number"
  | "bigint"
  | "boolean"
  | "symbol"
  | "function"
  | "object";

/** Classify a boundary value without allowing representation checks to leak through the SDK. */
export function boundaryValueKind(value: BoundaryValue): BoundaryValueKind {
  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- typeof is the non-spoofable primitive classifier.
  switch (typeof value) {
    case "undefined": return "undefined";
    case "string": return "string";
    case "number": return "number";
    case "bigint": return "bigint";
    case "boolean": return "boolean";
    case "symbol": return "symbol";
    case "function": return "function";
    case "object": return value === null ? "null" : "object";
  }
}

export function isBoundaryString(value: BoundaryValue): value is string {
  return boundaryValueKind(value) === "string";
}

export function isBoundaryNumber(value: BoundaryValue): value is number {
  return boundaryValueKind(value) === "number";
}

export function isBoundaryBoolean(value: BoundaryValue): value is boolean {
  return boundaryValueKind(value) === "boolean";
}

export function isBoundaryBigInt(value: BoundaryValue): value is bigint {
  return boundaryValueKind(value) === "bigint";
}

export function isBoundarySymbol(value: BoundaryValue): value is symbol {
  return boundaryValueKind(value) === "symbol";
}

function isBoxedPrimitive(value: BoundaryValue): boolean {
  if (boundaryValueKind(value) !== "object") return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === String.prototype ||
    prototype === Number.prototype ||
    prototype === BigInt.prototype ||
    prototype === Boolean.prototype ||
    prototype === Symbol.prototype;
}

export function isBoundaryObject(value: BoundaryValue): value is BoundaryRecord {
  return boundaryValueKind(value) === "object" && !Array.isArray(value) && !isBoxedPrimitive(value);
}

export function isBoundaryContainer(value: BoundaryValue): value is BoundaryObject {
  return Array.isArray(value) || (boundaryValueKind(value) === "object" && !isBoxedPrimitive(value));
}

export function isBoundaryFunction(value: BoundaryValue | undefined): value is (source: string) => BoundaryValue {
  return value !== undefined && boundaryValueKind(value) === "function";
}

/** Convert a boundary value without silently stringifying objects as [object Object]. */
export function formatBoundaryValue(value: BoundaryValue): string {
  if (isBoundaryString(value)) return value;
  if (isBoundaryNumber(value) || isBoundaryBigInt(value) || isBoundaryBoolean(value) || isBoundarySymbol(value)) return String(value);
  if (value === undefined) return "undefined";
  if (value === null) return "null";
  if (isBoundaryFunction(value)) return "[Function]";
  try {
    return JSON.stringify(value, (_key, item: BoundaryValue) =>
      isBoundaryBigInt(item) ? item.toString() : item) ?? "[Unserializable]";
  } catch {
    return "[Unserializable]";
  }
}
