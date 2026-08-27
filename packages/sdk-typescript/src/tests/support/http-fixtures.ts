import { isBoundaryObject, type BoundaryRecord, type BoundaryValue } from "../../utils/boundary-value.js";
import { parseLosslessJson, type FetchLike } from "../../transport/http.js";

type ResponseHeaders = { get(name: string): string | null };

export function streamingTextResponse(
  body: string,
  status = 200,
  headers?: ResponseHeaders,
): Awaited<ReturnType<FetchLike>> {
  const bytes = new TextEncoder().encode(body);
  let offset = 0;
  return {
    status,
    headers,
    body: {
      getReader: () => ({
        read: async () => {
          if (offset >= bytes.byteLength) return { done: true };
          const chunk = bytes.slice(offset);
          offset = bytes.byteLength;
          return { done: false, value: chunk };
        },
      }),
    },
  };
}

export function streamingBytesResponse(
  bytes: Uint8Array,
  status = 200,
  headers?: ResponseHeaders,
): Awaited<ReturnType<FetchLike>> {
  let read = false;
  return {
    status,
    headers,
    body: {
      getReader: () => ({
        read: async () => {
          if (read) return { done: true };
          read = true;
          return { done: false, value: bytes };
        },
      }),
    },
  };
}

export function parseBoundaryRecord(text: string): BoundaryRecord {
  const value = parseLosslessJson(text);
  if (!isBoundaryObject(value)) throw new Error("test fixture must contain a JSON object");
  return value;
}

export function parseBoundaryArray(text: string): BoundaryValue[] {
  const value = parseLosslessJson(text);
  if (!Array.isArray(value)) throw new Error("test fixture must contain a JSON array");
  return value;
}
