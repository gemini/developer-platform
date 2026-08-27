import type { RestResponse } from "./http.js";

/**
 * An awaitable REST result with explicit response metadata.
 * A normal await returns the parsed response body.
 */
export interface RestPromise<T> extends Promise<T> {
  withResponse(): Promise<RestResponse<T>>;
}

/** Add metadata access to one REST execution. */
export function createRestPromise<T>(responsePromise: Promise<RestResponse<T>>): RestPromise<T> {
  // SAFETY: The derived promise is branded with withResponse immediately below.
  const dataPromise = responsePromise.then(({ data }) => data) as RestPromise<T>;
  // Attach a rejection handler to the derived promise.
  // Do not change the rejection seen by callers.
  void dataPromise.catch(() => undefined);
  void Object.defineProperty(dataPromise, "withResponse", {
    value: (): Promise<RestResponse<T>> => responsePromise,
    enumerable: false,
  });
  return dataPromise;
}
