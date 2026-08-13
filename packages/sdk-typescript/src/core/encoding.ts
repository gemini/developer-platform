const encoder = new TextEncoder();

/** Encode a UTF-8 string to standard base64. */
export function toBase64(text: string): string {
  const bytes = encoder.encode(text);
  return btoa(Array.from(bytes, (b) => String.fromCharCode(b)).join(""));
}

/** Encode a Uint8Array to URL-safe base64 (no padding). */
export function toBase64Url(bytes: Uint8Array): string {
  const binary = Array.from(bytes, (b) => String.fromCharCode(b)).join("");
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

const decoder = new TextDecoder();

/** Decode a standard base64 string to a UTF-8 string. */
export function fromBase64(encoded: string): string {
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

/** Return the UTF-8 byte length of a string without allocating the full buffer. */
export function utf8ByteLength(text: string): number {
  return new Blob([text]).size;
}

/** Encode bytes as lowercase hex. */
export function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Compute HMAC-SHA-384 and return the hex digest. */
export async function hmacSha384Hex(secret: string, data: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-384" }, false, ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(data));
  return toHex(new Uint8Array(sig));
}
