import type { AuthStrategy } from "../transport/http.js";
import { SdkError } from "../errors.js";
import { isBoundaryObject, isBoundaryString } from "../utils/boundary-value.js";
import { validateOAuthToken } from "./token-values.js";

export interface BearerAuthOptions {
  accessToken: string;
}

/**
 * Authenticate requests with an application-managed access token.
 * This strategy does not persist or refresh the token.
 */
export class BearerAuth implements AuthStrategy {
  readonly authCapability!: "bearer";
  readonly #accessToken: string;

  constructor(options: BearerAuthOptions) {
    Object.defineProperty(this, "authCapability", {
      value: "bearer",
      enumerable: false,
      configurable: false,
      writable: false,
    });
    if (!isBoundaryObject(options) || !isBoundaryString(options.accessToken) || options.accessToken.length === 0) {
      throw new SdkError("accessToken is required");
    }
    this.#accessToken = validateOAuthToken(options.accessToken, "accessToken");
  }

  nextNonce(): undefined {
    return undefined;
  }

  async credentialHeaders(_payloadBase64: string): Promise<Record<string, string>> {
    return { Authorization: `Bearer ${this.#accessToken}` };
  }
}
