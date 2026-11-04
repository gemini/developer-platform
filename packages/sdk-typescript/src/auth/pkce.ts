import { SdkError } from "../errors.js";
import { toBase64Url } from "../utils/encoding.js";

const CODE_VERIFIER_PATTERN = /^[A-Za-z0-9._~-]{43,128}$/;
const CODE_VERIFIER_BYTES = 64;

export type RandomBytes = (size: number) => Uint8Array;

function defaultRandomBytes(size: number): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(size));
}

/** Return whether a value is a syntactically valid RFC 7636 code verifier. */
export function isValidPkceCodeVerifier(codeVerifier: string): boolean {
  return typeof codeVerifier === "string" && CODE_VERIFIER_PATTERN.test(codeVerifier);
}

function validateCodeVerifier(codeVerifier: string): string {
  if (!isValidPkceCodeVerifier(codeVerifier)) {
    throw new SdkError("PKCE code verifier must be 43-128 unreserved characters");
  }
  return codeVerifier;
}

/** Generate a high-entropy RFC 7636 code verifier. */
export function generatePkceCodeVerifier(randomBytes: RandomBytes = defaultRandomBytes): string {
  const bytes = randomBytes(CODE_VERIFIER_BYTES);
  if (!(bytes instanceof Uint8Array)) {
    throw new SdkError("PKCE random source must return a Uint8Array");
  }
  return validateCodeVerifier(toBase64Url(bytes));
}

/** Derive the RFC 7636 S256 code challenge for a code verifier. */
export async function createPkceCodeChallenge(codeVerifier: string): Promise<string> {
  const validated = validateCodeVerifier(codeVerifier);
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(validated));
  return toBase64Url(new Uint8Array(hash));
}
