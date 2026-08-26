import { SdkError } from "../errors.js";
import { deadline, type RequestOptions } from "../utils/deadline.js";
import {
  isBoundaryObject,
  isBoundaryString,
  type BoundaryRecord,
  type BoundaryValue,
} from "../utils/boundary-value.js";
import type { HttpMethod, HttpTransport, Int64Path } from "./http.js";

const MAX_PAGE_SIZE = 500;
const DEFAULT_PAGE_SIZE = 50;

/** Options shared by domain services that expose offset pagination. */
export interface PaginationOptions extends RequestOptions {
  /** Maximum items requested per page. Default: 50. Maximum: 500. */
  limit?: number;
  /** Maximum total items to yield across all pages. */
  maxItems?: number;
  /** Maximum value for the per-page limit parameter. */
  maxLimit?: number;
}

export type PaginationRequestOptions<T extends BoundaryValue = BoundaryValue> = {
  method: HttpMethod;
  path: string;
  params?: BoundaryRecord;
  limit?: number;
  /** Endpoint-specific limit ceiling. Defaults to the API-wide maximum of 500. */
  maxLimit?: number;
  /** Top-level array field when the endpoint returns an object. */
  itemsKey?: string;
  visibility?: "private" | "public";
  parameterLocation?: "payload" | "query";
  responseInt64Paths?: readonly Int64Path[];
  maxItems?: number;
  dedupeKey?: (item: T) => string;
  retryable?: boolean;
} & RequestOptions;

/**
 * Walk an offset-paginated endpoint, yielding each item across pages.
 *
 * This owns pagination policy while HttpTransport owns request execution. The
 * API has no cursors: pages advance by incrementing `offset` by `limit` until
 * a short page signals the end. Offset pagination is not snapshot-consistent;
 * provide `dedupeKey` when drift must fail loudly instead of yielding the same
 * logical record twice.
 */
export async function* paginate<T extends BoundaryValue = BoundaryValue>(
  transport: HttpTransport,
  transportTimeoutMs: number,
  options: PaginationRequestOptions<T>,
): AsyncGenerator<T> {
  for (const [name, value] of [["limit", options.limit], ["maxLimit", options.maxLimit]] as const) {
    if (value !== undefined && (!Number.isInteger(value) || value <= 0)) {
      throw new SdkError(`${name} must be a finite positive integer`);
    }
  }
  const maxLimit = Math.min(Math.max(options.maxLimit ?? MAX_PAGE_SIZE, 1), MAX_PAGE_SIZE);
  const limit = Math.min(Math.max(options.limit ?? DEFAULT_PAGE_SIZE, 1), maxLimit);
  if (options.maxItems !== undefined && (!Number.isInteger(options.maxItems) || options.maxItems <= 0)) {
    throw new SdkError("maxItems must be a finite positive integer");
  }

  const execution = deadline(options, transportTimeoutMs);
  let yielded = 0;
  let offset = 0;
  const seen = options.dedupeKey ? new Set<string>() : undefined;
  try {
    for (;;) {
      const pageLimit = options.maxItems === undefined ? limit : Math.min(limit, options.maxItems - yielded);
      if (pageLimit <= 0) return;
      const params = { ...options.params, limit: pageLimit, offset };
      const page = options.visibility === "public"
        ? await transport.requestPublic({
          method: options.method,
          path: options.path,
          query: params,
          responseInt64Paths: options.responseInt64Paths,
          retryable: options.retryable,
          signal: execution.signal,
          timeoutMs: transportTimeoutMs,
        })
        : options.parameterLocation === "query"
          ? await transport.request({
            method: options.method,
            path: options.path,
            query: params,
            responseInt64Paths: options.responseInt64Paths,
            retryable: options.retryable,
            signal: execution.signal,
            timeoutMs: transportTimeoutMs,
          })
          : await transport.request({
            method: options.method,
            path: options.path,
            params,
            responseInt64Paths: options.responseInt64Paths,
            retryable: options.retryable,
            signal: execution.signal,
            timeoutMs: transportTimeoutMs,
          });
      const items = Array.isArray(page)
        ? page
        : options.itemsKey && isBoundaryObject(page)
          ? page[options.itemsKey]
          : undefined;
      if (!Array.isArray(items)) {
        const endpoint = options.path.split("?", 1)[0] ?? options.path;
        throw new SdkError(`paginate expected an array page from ${endpoint}`);
      }
      for (const item of items) {
        if (seen) {
          const key = options.dedupeKey?.(item);
          if (!isBoundaryString(key)) throw new SdkError("dedupeKey must return a string");
          if (seen.has(key)) throw new SdkError(`paginate detected duplicate item key ${key}`);
          seen.add(key);
        }
        yield item as T;
        yielded++;
        if (yielded === options.maxItems) return;
      }
      if (items.length < pageLimit) return;
      offset += pageLimit;
    }
  } finally {
    execution.cleanup();
  }
}
