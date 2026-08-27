const encoder = new TextEncoder();
const decoder = new TextDecoder();

const HEX_TABLE: string[] = [];
for (let i = 0; i < 256; i++) {
  HEX_TABLE[i] = i.toString(16).padStart(2, "0");
}

/** Convert a byte array to a binary string using chunked transfers to avoid stack limits and excessive allocations. */
function bytesToBinaryString(bytes: Uint8Array): string {
  const CHUNK_SIZE = 0x8000;
  if (bytes.length <= CHUNK_SIZE) {
    return String.fromCharCode(...Array.from(bytes));
  }
  let result = "";
  for (let i = 0; i < bytes.length; i += CHUNK_SIZE) {
    const chunk = bytes.subarray(i, i + CHUNK_SIZE);
    result += String.fromCharCode(...Array.from(chunk));
  }
  return result;
}

/** Encode a UTF-8 string to standard base64. */
export function toBase64(text: string): string {
  if (globalThis.Buffer !== undefined) {
    return globalThis.Buffer.from(text, "utf8").toString("base64");
  }
  const bytes = encoder.encode(text);
  return btoa(bytesToBinaryString(bytes));
}

/** Encode a Uint8Array to URL-safe base64 (no padding). */
export function toBase64Url(bytes: Uint8Array): string {
  if (globalThis.Buffer !== undefined) {
    return globalThis.Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength)
      .toString("base64url");
  }
  return btoa(bytesToBinaryString(bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Decode a standard base64 string to a UTF-8 string. */
export function fromBase64(encoded: string): string {
  if (globalThis.Buffer !== undefined) {
    return globalThis.Buffer.from(encoded, "base64").toString("utf8");
  }
  return decoder.decode(fromBase64Bytes(encoded));
}

/** Decode a standard base64 string to bytes. */
export function fromBase64Bytes(encoded: string): Uint8Array {
  const binary = atob(encoded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** Decode a URL-safe base64 string to bytes. */
export function fromBase64Url(encoded: string): Uint8Array {
  const padded = encoded.replace(/-/g, "+").replace(/_/g, "/");
  return fromBase64Bytes(padded);
}

/** Return the UTF-8 byte length of a string without allocating buffer objects. */
export function utf8ByteLength(text: string): number {
  let len = 0;
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code < 0x80) len += 1;
    else if (code < 0x800) len += 2;
    else if (code >= 0xd800 && code <= 0xdbff) {
      len += 4;
      i++;
    } else len += 3;
  }
  return len;
}

/** Encode bytes as lowercase hex using a precomputed lookup table. */
export function toHex(bytes: Uint8Array): string {
  if (globalThis.Buffer !== undefined) {
    return globalThis.Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).toString("hex");
  }
  let hex = "";
  for (let i = 0; i < bytes.length; i++) {
    hex += HEX_TABLE[bytes[i]!];
  }
  return hex;
}

/** Compute HMAC-SHA-384 and return the hex digest. */
export async function hmacSha384Hex(secret: string, data: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-384" }, false, ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(data));
  return toHex(new Uint8Array(sig));
}
