import { RequestAbortedError, RequestTimeoutError, SdkError } from "../errors.js";

export const DEFAULT_TIMEOUT_MS = 30_000;

/** Controls one bounded SDK operation. A timeout covers retries and response reads. */
export interface RequestOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
  /** Custom HTTP headers, such as W3C traceparent or application correlation IDs. */
  headers?: Record<string, string>;
}

export function deadline(options: RequestOptions = {}, defaultTimeoutMs = DEFAULT_TIMEOUT_MS) {
  const timeoutMs = options.timeoutMs ?? defaultTimeoutMs;
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new SdkError("timeoutMs must be a finite positive number");
  const controller = new AbortController();
  const abort = () => controller.abort(new RequestAbortedError("request was aborted"));
  if (options.signal?.aborted) abort();
  else options.signal?.addEventListener("abort", abort, { once: true });
  const timer = setTimeout(() => controller.abort(new RequestTimeoutError(`request exceeded ${timeoutMs}ms deadline`)), timeoutMs);
  return { signal: controller.signal, cleanup: () => { clearTimeout(timer); options.signal?.removeEventListener("abort", abort); } };
}

export async function withSignal<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) throw signal.reason instanceof SdkError ? signal.reason : new RequestAbortedError("request was aborted");
  return new Promise<T>((resolve, reject) => {
    const abort = () => {
      cleanup();
      reject(signal.reason instanceof SdkError ? signal.reason : new RequestAbortedError("request was aborted"));
    };
    const cleanup = () => signal.removeEventListener("abort", abort);
    signal.addEventListener("abort", abort, { once: true });
    void promise.then(
      (value) => { cleanup(); resolve(value); },
      (error) => { cleanup(); reject(error); },
    );
  });
}
