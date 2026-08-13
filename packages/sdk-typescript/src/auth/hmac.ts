import { toHex } from "../core/encoding.js";

import type { AuthStrategy } from "../core/http.js";
import { SdkError } from "../errors.js";

export type HmacNonceMode = "monotonic" | "time-based";

export interface HmacAuthOptions {
  apiKey: string;
  apiSecret: string;
  nonceMode?: HmacNonceMode;
  now?: () => number;
}

export class HmacAuth implements AuthStrategy {
  readonly #apiKey: string;
  readonly #keyPromise: Promise<CryptoKey>;
  readonly #nonceMode: HmacNonceMode;
  readonly #now: () => number;
  #lastNonce?: bigint;
  #signQueue: Promise<void> = Promise.resolve();

  constructor(options: HmacAuthOptions) {
    if (!options || typeof options !== "object") {
      throw new SdkError("options are required");
    }
    if (typeof options.apiKey !== "string" || options.apiKey.length === 0) {
      throw new SdkError("apiKey is required");
    }
    if (typeof options.apiSecret !== "string" || options.apiSecret.length === 0) {
      throw new SdkError("apiSecret is required");
    }
    if (options.nonceMode !== undefined && !["monotonic", "time-based"].includes(options.nonceMode)) {
      throw new SdkError("nonceMode must be monotonic or time-based");
    }
    if (options.now !== undefined && typeof options.now !== "function") {
      throw new SdkError("now must be a function");
    }
    this.#apiKey = options.apiKey;
    this.#keyPromise = crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(options.apiSecret),
      { name: "HMAC", hash: "SHA-384" },
      false,
      ["sign"],
    );
    this.#nonceMode = options.nonceMode ?? "monotonic";
    this.#now = options.now ?? Date.now;
  }

  nextNonce(): string {
    const now = this.#now();
    if (!Number.isSafeInteger(now) || now < 0) {
      throw new SdkError("nonce clock must return a non-negative safe integer timestamp");
    }
    if (this.#nonceMode === "time-based") {
      return Math.floor(now / 1000).toString();
    }

    const candidate = BigInt(Math.trunc(now));
    this.#lastNonce = this.#lastNonce === undefined || candidate > this.#lastNonce
      ? candidate
      : this.#lastNonce + 1n;
    return this.#lastNonce.toString();
  }

  async credentialHeaders(payloadBase64: string): Promise<Record<string, string>> {
    // Serialize signing so that requests dispatched in nonce order arrive at the
    // server in nonce order. Without this, concurrent await crypto.subtle.sign()
    // calls can resolve out of order, causing the server to reject valid nonces.
    const result = this.#signQueue.then(async () => {
      const key = await this.#keyPromise;
      const signature = await crypto.subtle.sign(
        "HMAC",
        key,
        new TextEncoder().encode(payloadBase64),
      );
      return {
        "X-GEMINI-APIKEY": this.#apiKey,
        "X-GEMINI-SIGNATURE": toHex(new Uint8Array(signature)),
      };
    });
    this.#signQueue = result.then(() => {}, () => {});
    return result;
  }
}
