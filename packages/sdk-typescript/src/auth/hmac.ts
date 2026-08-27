import { toHex } from "../utils/encoding.js";
import { isBoundaryFunction, isBoundaryObject, isBoundaryString } from "../utils/boundary-value.js";

import type { AuthStrategy } from "../transport/http.js";
import { SdkError } from "../errors.js";

const encoder = new TextEncoder();

export type HmacNonceMode = "monotonic" | "time-based";

export interface HmacAuthOptions {
  apiKey: string;
  apiSecret: string;
  nonceMode?: HmacNonceMode;
  now?: () => number;
}

export class HmacAuth implements AuthStrategy {
  /** Runtime marker. Browser clients must reject this strategy. */
  readonly authCapability!: "server";
  readonly #apiKey: string;
  readonly #keyPromise: Promise<CryptoKey>;
  readonly #nonceMode: HmacNonceMode;
  readonly #now: () => number;
  #lastNonce?: bigint;
  #signQueue: Promise<void> = Promise.resolve();

  constructor(options: HmacAuthOptions) {
    Object.defineProperty(this, "authCapability", {
      value: "server",
      enumerable: false,
      configurable: false,
      writable: false,
    });
    if (!isBoundaryObject(options)) {
      throw new SdkError("options are required");
    }
    if (!isBoundaryString(options.apiKey) || options.apiKey.length === 0) {
      throw new SdkError("apiKey is required");
    }
    if (!isBoundaryString(options.apiSecret) || options.apiSecret.length === 0) {
      throw new SdkError("apiSecret is required");
    }
    if (options.nonceMode !== undefined && !["monotonic", "time-based"].includes(options.nonceMode)) {
      throw new SdkError("nonceMode must be monotonic or time-based");
    }
    if (options.now !== undefined && !isBoundaryFunction(options.now)) {
      throw new SdkError("now must be a function");
    }
    this.#apiKey = options.apiKey;
    this.#keyPromise = crypto.subtle.importKey(
      "raw",
      encoder.encode(options.apiSecret),
      { name: "HMAC", hash: "SHA-384" },
      false,
      ["sign"],
    );
    this.#nonceMode = options.nonceMode ?? "monotonic";
    this.#now = options.now ?? Date.now;
  }

  nextNonce(): string {
    return this.#nextNonceFor(this.#nonceMode);
  }

  /** Return an auth strategy with the epoch-second nonce required by WebSockets. */
  forWebSocket(): AuthStrategy {
    return {
      nextNonce: () => this.#nextNonceFor("time-based"),
      credentialHeaders: (payloadBase64) => this.credentialHeaders(payloadBase64),
    };
  }

  #nextNonceFor(mode: HmacNonceMode): string {
    const now = this.#now();
    if (!Number.isSafeInteger(now) || now < 0) {
      throw new SdkError("nonce clock must return a non-negative safe integer timestamp");
    }
    if (mode === "time-based") {
      return Math.floor(now / 1000).toString();
    }

    const candidate = BigInt(Math.trunc(now));
    this.#lastNonce = this.#lastNonce === undefined || candidate > this.#lastNonce
      ? candidate
      : this.#lastNonce + 1n;
    return this.#lastNonce.toString();
  }

  async credentialHeaders(payloadBase64: string): Promise<Record<string, string>> {
    // Serialize signing so requests keep nonce order.
    // Concurrent crypto.subtle.sign() calls can finish out of order.
    const result = this.#signQueue.then(async () => {
      const key = await this.#keyPromise;
      const signature = await crypto.subtle.sign(
        "HMAC",
        key,
        encoder.encode(payloadBase64),
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
