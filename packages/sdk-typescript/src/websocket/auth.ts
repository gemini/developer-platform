import { toBase64 } from "../utils/encoding.js";
import type { AuthStrategy } from "../transport/http.js";
import { SdkError } from "../errors.js";
import { isBoundaryString } from "../utils/boundary-value.js";
import type { RequestOptions } from "../utils/deadline.js";

function isNumericNonce(nonce: string): boolean {
  if (nonce.length === 0) return false;
  let index = 0;
  if (nonce.charCodeAt(0) === 48) {
    index = 1;
    if (index < nonce.length && nonce.charCodeAt(index) !== 46) return false;
  } else {
    while (index < nonce.length && nonce.charCodeAt(index) >= 48 && nonce.charCodeAt(index) <= 57) index++;
    if (index === 0) return false;
  }
  if (index < nonce.length && nonce.charCodeAt(index) === 46) {
    index++;
    const fractionStart = index;
    while (index < nonce.length && nonce.charCodeAt(index) >= 48 && nonce.charCodeAt(index) <= 57) index++;
    if (index === fractionStart) return false;
  }
  return index === nonce.length;
}

function reservedCredentialHeader(headers: Record<string, string>): string | undefined {
  for (const name in headers) {
    const lower = name.toLowerCase();
    if (lower === "content-length" || lower === "x-gemini-nonce" || lower === "x-gemini-payload") return name;
  }
  return undefined;
}

/** Create fresh, validated upgrade headers for an authenticated server WebSocket. */
export async function createServerWebSocketAuthHeaders(
  auth: AuthStrategy,
  options?: RequestOptions,
): Promise<Record<string, string>> {
  const nonce = auth.nextNonce();
  if (nonce === undefined) {
    const headers = await auth.credentialHeaders("", options);
    const reserved = reservedCredentialHeader(headers);
    if (reserved) throw new SdkError(`AuthStrategy returned reserved header ${reserved}`);
    return headers;
  }
  if (!isBoundaryString(nonce) || !isNumericNonce(nonce)) throw new SdkError("AuthStrategy returned an invalid nonce");
  const payloadBase64 = toBase64(nonce);
  const headers = await auth.credentialHeaders(payloadBase64, options);
  const reserved = reservedCredentialHeader(headers);
  if (reserved) throw new SdkError(`AuthStrategy returned reserved header ${reserved}`);
  return { ...headers, "X-GEMINI-NONCE": nonce, "X-GEMINI-PAYLOAD": payloadBase64 };
}
