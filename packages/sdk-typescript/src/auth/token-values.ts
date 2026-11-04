import { SdkError } from "../errors.js";
import { isBoundaryString, type BoundaryValue } from "../utils/boundary-value.js";

// OAuth token values are opaque, but they must not contain control characters
// before an access token is placed in an HTTP Authorization header.
const OAUTH_TOKEN_PATTERN = /^[\x21-\x7E]+$/;

export function validateOAuthToken(value: BoundaryValue, name: string): string {
  if (!isBoundaryString(value) || value.length === 0) {
    throw new SdkError(`${name} is required`);
  }
  if (!OAUTH_TOKEN_PATTERN.test(value)) {
    throw new SdkError(`${name} must contain only visible ASCII characters`);
  }
  return value;
}
