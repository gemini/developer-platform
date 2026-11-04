export function boundaryValueKind(value) {
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
