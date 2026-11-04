import { TypedEmitter } from "../utils/typed-emitter.js";
import { utf8ByteLength } from "../utils/encoding.js";

import { parseLosslessJson, stringifyJson } from "../transport/http.js";
import { DEFAULT_TIMEOUT_MS, deadline, type RequestOptions, withSignal } from "../utils/deadline.js";
import {
  ConnectionError,
  RequestAbortedError,
  RequestTimeoutError,
  SdkError,
  serializeError,
  WebSocketRequestError,
} from "../errors.js";
import { sanitizeDiagnosticUrl, type DiagnosticEvent, type DiagnosticListener, type OperationContext } from "../observability/diagnostics.js";
import { emitDiagnostic, type Logger, NOOP_LOGGER } from "../observability/logging.js";
import type { GenericSuccessResponse, SubscribeRequest, UnsubscribeRequest } from "./types.js";
import {
  isBoundaryNumber,
  isBoundaryObject,
  isBoundaryString,
  type BoundaryRecord,
  type BoundaryValue,
} from "../utils/boundary-value.js";

const DEFAULT_BACKOFF_BASE_MS = 250;
const DEFAULT_BACKOFF_CAP_MS = 30_000;
const DEFAULT_BACKOFF_FACTOR = 2;
const DEFAULT_MAX_MESSAGE_SIZE_BYTES = 1_048_576;
const DEFAULT_LIVENESS_INTERVAL_MS = 30_000;
const DEFAULT_LIVENESS_TIMEOUT_MS = 10_000;
const DEFAULT_MAX_RECONNECT_ATTEMPTS = 10;
const DEFAULT_STABLE_CONNECTION_MS = 30_000;

/** The part of the WebSocket API used by browser, Node.js, and test sockets. */
export interface SocketLike {
  addEventListener(type: string, listener: (ev: BoundaryValue) => void): void;
  send(data: string): void;
  close(): void;
}

export interface WebSocketReconnectContext {
  readonly attempt: number;
  readonly opened: boolean;
  readonly closeCode?: number;
  readonly closeReason?: string;
  readonly cause?: unknown;
}

export interface WebSocketReconnectOptions {
  /** Maximum automatic reconnect attempts after a connection drop. Default: 10. */
  maxAttempts?: number;
  /** Explicitly opt into unlimited reconnect attempts. Default: false. */
  unlimited?: boolean;
  /** Reset backoff only after this much continuous uptime. Default: 30 seconds. */
  stableConnectionMs?: number;
  /** Return false to stop reconnecting for a transport or protocol failure. */
  shouldReconnect?: (context: WebSocketReconnectContext) => boolean;
}

export interface SocketFactoryOptions {
  headers?: Record<string, string>;
  signal?: AbortSignal;
  maxPayload?: number;
  handshakeTimeout?: number;
  perMessageDeflate?: boolean;
}
export type SocketFactory = (url: string, options: SocketFactoryOptions) => SocketLike | Promise<SocketLike>;

export interface WebSocketSessionOptions {
  url: string;
  logger?: Logger;
  onDiagnostic?: DiagnosticListener;
  socketFactory?: SocketFactory;
  headers?: Record<string, string>;
  headersFactory?: (options?: RequestOptions) => Promise<Record<string, string> | undefined>;
  timeoutMs?: number;
  liveness?: { intervalMs?: number; timeoutMs?: number };
  backoff?: { baseMs?: number; capMs?: number; factor?: number };
  reconnect?: WebSocketReconnectOptions;
  handshakeTimeoutMs?: number;
  perMessageDeflate?: boolean;
  random?: () => number;
  maxMessageSizeBytes?: number;
}

export interface WsSubscription {
  readonly id: string | number;
  /** Stable SDK-generated ID shared by diagnostics for this subscription. */
  readonly correlationId: string;
  readonly ready: Promise<GenericSuccessResponse>;
  close(options?: RequestOptions): Promise<void>;
}

type WsMethodFrame = {
  id?: string | number;
  method: string;
  params?: BoundaryValue;
};

type Pending = {
  resolve: (value: BoundaryValue) => void;
  reject: (cause?: unknown) => void;
  durable?: boolean;
  replay?: boolean;
};

type DurableSubscription = {
  frame: SubscribeRequest;
  correlationId: string;
  active: boolean;
  sent: boolean;
  replayOnOpen: boolean;
};

type ConnectionState =
  | { kind: "idle" }
  | { kind: "connecting"; deferred: ConnectionDeferred }
  | { kind: "open" }
  | { kind: "reconnecting"; deferred: ConnectionDeferred }
  | { kind: "closed" };

type ConnectionDeferred = {
  promise: Promise<void>;
  resolve: () => void;
  reject: (cause?: unknown) => void;
};

type ConnectionAttempt = {
  readonly signal: AbortSignal;
  readonly controller: AbortController;
  readonly initial: boolean;
  readonly reconnecting: boolean;
  socket?: SocketLike;
  cancelled: boolean;
  removeAbortListener?: () => void;
};

type WebSocketSessionEvents = {
  open: () => void;
  message: (frame: BoundaryValue) => void;
  error: (error: BoundaryValue) => void;
  reconnecting: () => void;
  close: () => void;
  subscriptionReady: (event: { id: string | number; response: BoundaryValue }) => void;
  resubscribed: (event: { id: string | number; response: BoundaryValue }) => void;
  subscriptionError: (event: { id: string | number; error: BoundaryValue }) => void;
};

/**
 * Manage the WebSocket lifecycle, wire parsing, reconnect backoff, requests,
 * durable subscriptions, and liveness checks.
 */
export class WebSocketSession extends TypedEmitter<WebSocketSessionEvents> {
  private readonly url: string;
  private readonly logger: Logger;
  private readonly onDiagnostic?: DiagnosticListener;
  private readonly socketFactory: SocketFactory;
  private readonly headers?: Record<string, string>;
  private readonly headersFactory?: (options?: RequestOptions) => Promise<Record<string, string> | undefined>;
  private readonly baseMs: number;
  private readonly capMs: number;
  private readonly factor: number;
  private readonly random: () => number;
  private readonly timeoutMs: number;
  private readonly maxMessageSizeBytes: number;
  private readonly handshakeTimeoutMs: number;
  private readonly perMessageDeflate: boolean;
  private readonly maxReconnectAttempts: number;
  private readonly unlimitedReconnects: boolean;
  private readonly stableConnectionMs: number;
  private readonly shouldReconnect?: (context: WebSocketReconnectContext) => boolean;
  private readonly liveness?: { intervalMs: number; timeoutMs: number };
  private readonly pending = new Map<string, Pending>();
  private readonly subscriptions = new Map<string, DurableSubscription>();
  private nextId = 1;
  private socket?: SocketLike;
  private connectionState: ConnectionState = { kind: "idle" };
  private reconnectTimer?: ReturnType<typeof setTimeout>;
  private stableConnectionTimer?: ReturnType<typeof setTimeout>;
  private livenessTimer?: ReturnType<typeof setTimeout>;
  private reconnectAttempt = 0;
  private socketAttempt = 0;
  private reconnectCorrelationId?: string;
  private activeAttempt?: ConnectionAttempt;
  constructor(options: WebSocketSessionOptions) {
    super();
    if (!options || options.url.length === 0) {
      throw new SdkError("url is required");
    }
    this.url = options.url;
    this.logger = options.logger ?? NOOP_LOGGER;
    this.onDiagnostic = options.onDiagnostic;
    this.socketFactory = options.socketFactory ?? ((socketUrl, socketOptions) => {
      if (socketOptions.headers && Object.keys(socketOptions.headers).length > 0) {
        throw new SdkError(
          "The default WebSocket factory cannot send custom headers. " +
          "Pass a socketFactory that supports upgrade headers (e.g. the ws package for Node.js).",
        );
      }
      // SAFETY: The browser WebSocket implements the SDK's SocketLike adapter surface.
      return new WebSocket(socketUrl) as SocketLike;
    });
    this.headers = options.headers ? { ...options.headers } : undefined;
    this.headersFactory = options.headersFactory;
    this.baseMs = options.backoff?.baseMs ?? DEFAULT_BACKOFF_BASE_MS;
    this.capMs = options.backoff?.capMs ?? DEFAULT_BACKOFF_CAP_MS;
    this.factor = options.backoff?.factor ?? DEFAULT_BACKOFF_FACTOR;
    if (![this.baseMs, this.capMs, this.factor].every(Number.isFinite) || this.baseMs < 0 || this.capMs < 0 || this.factor < 1) {
      throw new SdkError("backoff values must be finite (base/cap >= 0, factor >= 1)");
    }
    this.random = options.random ?? Math.random;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.maxMessageSizeBytes = options.maxMessageSizeBytes ?? DEFAULT_MAX_MESSAGE_SIZE_BYTES;
    this.handshakeTimeoutMs = options.handshakeTimeoutMs ?? this.timeoutMs;
    this.perMessageDeflate = options.perMessageDeflate ?? false;
    this.maxReconnectAttempts = options.reconnect?.maxAttempts ?? DEFAULT_MAX_RECONNECT_ATTEMPTS;
    this.unlimitedReconnects = options.reconnect?.unlimited ?? false;
    this.stableConnectionMs = options.reconnect?.stableConnectionMs ?? DEFAULT_STABLE_CONNECTION_MS;
    this.shouldReconnect = options.reconnect?.shouldReconnect;
    if (!Number.isFinite(this.timeoutMs) || this.timeoutMs <= 0) {
      throw new SdkError("timeoutMs must be a finite positive number");
    }
    if (!Number.isFinite(this.maxMessageSizeBytes) || this.maxMessageSizeBytes <= 0) {
      throw new SdkError("maxMessageSizeBytes must be a finite positive number");
    }
    if (!Number.isFinite(this.handshakeTimeoutMs) || this.handshakeTimeoutMs <= 0) {
      throw new SdkError("handshakeTimeoutMs must be a finite positive number");
    }
    if (!Number.isSafeInteger(this.maxReconnectAttempts) || this.maxReconnectAttempts < 0) {
      throw new SdkError("reconnect maxAttempts must be a non-negative safe integer");
    }
    if (!Number.isFinite(this.stableConnectionMs) || this.stableConnectionMs < 0) {
      throw new SdkError("reconnect stableConnectionMs must be a finite non-negative number");
    }
    if (options.liveness) {
      const intervalMs = options.liveness.intervalMs ?? DEFAULT_LIVENESS_INTERVAL_MS;
      const timeoutMs = options.liveness.timeoutMs ?? DEFAULT_LIVENESS_TIMEOUT_MS;
      if (!Number.isFinite(intervalMs) || intervalMs <= 0 || !Number.isFinite(timeoutMs) || timeoutMs <= 0) {
        throw new SdkError("liveness intervalMs and timeoutMs must be finite positive numbers");
      }
      this.liveness = { intervalMs, timeoutMs };
    }
  }

  private emitDiagnosticEvent(
    level: "debug" | "info" | "warn" | "error",
    name: string,
    traffic: "control" | "stream" | "reconnect" | "mutation",
    metadata?: BoundaryRecord,
    cause?: unknown,
    operationContext?: OperationContext,
    correlationId?: string,
  ): void {
    const event: DiagnosticEvent = {
      level,
      component: "websocket",
      name,
      traffic,
      correlationId,
      operationContext,
      metadata: { ...metadata, url: sanitizeDiagnosticUrl(this.url) },
    };
    if (cause) event.error = serializeError(cause);
    emitDiagnostic(event, this.logger, this.onDiagnostic);
  }

  connect(options: RequestOptions = {}): Promise<void> {
    if (this.connectionState.kind === "closed") throw new SdkError("connect() called on a closed WebSocket session");
    const execution = deadline(options, this.timeoutMs);
    const connection = this.ensureConnected({ ...options, signal: execution.signal }, execution.signal);
    return withSignal(connection, execution.signal).finally(execution.cleanup);
  }

  private ensureConnected(options: RequestOptions = {}, attemptSignal?: AbortSignal): Promise<void> {
    if (this.connectionState.kind === "closed") throw new SdkError("connect() called on a closed WebSocket session");
    if (this.connectionState.kind === "open") return Promise.resolve();
    if (this.connectionState.kind === "connecting" || this.connectionState.kind === "reconnecting") {
      return this.connectionState.deferred.promise;
    }
    const attemptExecution = attemptSignal ? undefined : deadline(options, this.timeoutMs);
    const signal = attemptSignal ?? attemptExecution!.signal;
    let resolve!: () => void;
    let reject!: (cause?: unknown) => void;
    const promise = new Promise<void>((resolvePromise, rejectPromise) => {
      resolve = resolvePromise;
      reject = rejectPromise;
    });
    void promise.catch(() => undefined);
    this.connectionState = { kind: "connecting", deferred: { promise, resolve, reject } };
    if (attemptExecution) {
      void promise.finally(attemptExecution.cleanup).catch(() => undefined);
    }
    void this.prepareSocket({ ...options, signal }, signal);
    return promise;
  }

  private async prepareSocket(options: RequestOptions, signal: AbortSignal): Promise<void> {
    try {
      await this.openSocket(this.headers, true, false, options, signal);
    } catch (error) {
      if (this.connectionState.kind === "connecting") {
        this.connectionState.deferred.reject(error);
        this.connectionState = { kind: "idle" };
      }
    }
  }

  private backoffDelay(attempt: number): number {
    if (attempt === 0) return 0;
    const raw = Math.min(this.capMs, this.baseMs * this.factor ** (attempt - 1));
    return raw / 2 + this.random() * (raw / 2);
  }

  private async openSocket(
    initialHeaders: Record<string, string> | undefined,
    initial: boolean,
    reconnecting: boolean,
    requestOptions: RequestOptions,
    signal: AbortSignal,
  ): Promise<void> {
    if (this.isClosed()) return;
    const reconnectCorrelationId = reconnecting ? this.reconnectCorrelationId : undefined;
    const socketAttempt = ++this.socketAttempt;
    const controller = new AbortController();
    const externalAbort = () => controller.abort(signal.reason);
    if (signal.aborted) externalAbort();
    else signal.addEventListener("abort", externalAbort, { once: true });
    const attemptSignal = controller.signal;
    const attempt: ConnectionAttempt = { signal: attemptSignal, controller, initial, reconnecting, cancelled: false };
    const abort = () => {
      attempt.cancelled = true;
      if (this.activeAttempt !== attempt) return;
      this.socketAttempt++;
      this.activeAttempt = undefined;
      const socket = attempt.socket;
      attempt.socket = undefined;
      if (socket && this.socket === socket) {
        this.socket = undefined;
        socket.close();
      }
      const reason = attemptSignal.reason ?? new RequestAbortedError("WebSocket connection attempt was aborted");
      const deferred = this.connectionState.kind === "connecting" || this.connectionState.kind === "reconnecting"
        ? this.connectionState.deferred
        : undefined;
      if (attempt.initial) {
        if (deferred) {
          this.connectionState = { kind: "idle" };
          deferred.reject(reason);
        }
      } else if (!this.isClosed()) {
        this.scheduleReconnect(reason);
      }
    };
    attemptSignal.addEventListener("abort", abort, { once: true });
    attempt.removeAbortListener = () => {
      attemptSignal.removeEventListener("abort", abort);
      signal.removeEventListener("abort", externalAbort);
    };
    this.activeAttempt = attempt;
    if (attemptSignal.aborted) {
      abort();
      attempt.removeAbortListener?.();
      return;
    }
    let headers = initialHeaders;
    if (this.headersFactory) {
      try {
        headers = await withSignal(this.headersFactory({ ...requestOptions, signal: attemptSignal }), attemptSignal);
      } catch (error) {
        attempt.removeAbortListener?.();
        if (this.activeAttempt === attempt) this.activeAttempt = undefined;
        if (attemptSignal.aborted || attempt.cancelled) {
          if (initial) throw error;
          if (!this.isClosed()) this.scheduleReconnect(error);
          return;
        }
        if (initial && this.connectionState.kind === "connecting") {
          this.connectionState.deferred.reject(error);
          this.connectionState = { kind: "idle" };
          return;
        }
        const connectionError = new ConnectionError("WebSocket authentication headers failed", { cause: error, opened: this.hasOpened() });
        this.emitDiagnosticEvent("error", "ws.reconnect_headers.failure", "reconnect", { attempt: this.reconnectAttempt }, connectionError, undefined, reconnectCorrelationId);
        this.scheduleReconnect(connectionError, { fatal: true });
        return;
      }
    }
    if (this.isClosed() || attempt.cancelled || attemptSignal.aborted || this.activeAttempt !== attempt) return;

    let socket: SocketLike;
    try {
      const created = this.socketFactory(this.url, {
        headers,
        signal: attemptSignal,
        maxPayload: this.maxMessageSizeBytes,
        handshakeTimeout: this.handshakeTimeoutMs,
        perMessageDeflate: this.perMessageDeflate,
      });
      if (isPromiseLike<SocketLike>(created)) {
        const lateSocket = Promise.resolve(created).then((resolvedSocket) => {
          if (attemptSignal.aborted || attempt.cancelled || this.isClosed() || this.activeAttempt !== attempt) {
            resolvedSocket.close();
          }
          return resolvedSocket;
        });
        socket = await withSignal(lateSocket, attemptSignal);
      } else {
        socket = created;
      }
      attempt.socket = socket;
    } catch (cause) {
      const error = new ConnectionError("WebSocket socket creation failed", {
        cause,
        opened: this.hasOpened(),
      });
      attempt.removeAbortListener?.();
      if (this.activeAttempt === attempt) this.activeAttempt = undefined;
      if (attemptSignal.aborted || attempt.cancelled) {
        if (initial) throw cause;
        if (!this.isClosed()) this.scheduleReconnect(error);
        return;
      }
      this.emitDiagnosticEvent("error", "ws.socket_factory.failure", reconnecting ? "reconnect" : "control", { attempt: this.reconnectAttempt }, error, undefined, reconnectCorrelationId);
      if (initial) {
        if (this.connectionState.kind === "connecting") {
          this.connectionState.deferred.reject(error);
          this.connectionState = { kind: "idle" };
        }
      }
      else this.scheduleReconnect(error);
      return;
    }
    if (this.isClosed() || attempt.cancelled || attemptSignal.aborted || this.activeAttempt !== attempt || socketAttempt !== this.socketAttempt) {
      attempt.removeAbortListener?.();
      socket.close();
      return;
    }
    this.socket = socket;
    const isCurrent = () => socket === this.socket;

    socket.addEventListener("open", () => {
      if (!isCurrent()) return;
      attempt.removeAbortListener?.();
      if (this.activeAttempt === attempt) this.activeAttempt = undefined;
      this.reconnectCorrelationId = undefined;
      this.emitDiagnosticEvent("info", "ws.open", "control", undefined, undefined, undefined, reconnectCorrelationId);
      const deferred = this.connectionState.kind === "connecting" || this.connectionState.kind === "reconnecting"
        ? this.connectionState.deferred
        : undefined;
      this.connectionState = { kind: "open" };
      this.clearStableConnectionTimer();
      if (this.reconnectAttempt === 0 || this.stableConnectionMs === 0) {
        this.reconnectAttempt = 0;
      } else {
        this.stableConnectionTimer = setTimeout(() => {
          if (isCurrent() && this.connectionState.kind === "open") this.reconnectAttempt = 0;
        }, this.stableConnectionMs);
      }
      deferred?.resolve();
      this.scheduleLiveness();
      this.emit("open");
      for (const subscription of this.subscriptions.values()) {
        // The connection continuation sends initial subscriptions.
        // This block replays subscriptions that existed when reconnect started.
        // A subscription created during reconnect is sent by its own continuation.
        if (subscription.active && subscription.replayOnOpen) {
          if (!isCurrent() || this.connectionState.kind !== "open") break;
          try {
            this.sendSub(subscription.frame, socket);
            subscription.sent = true;
            subscription.replayOnOpen = false;
          } catch (error) {
            subscription.replayOnOpen = true;
            this.emitDiagnosticEvent("error", "ws.subscription.replay.failure", "control", {
              subscriptionCount: subscription.frame.params?.length ?? 0,
            }, error, undefined, subscription.correlationId);
            if (isCurrent()) {
              this.scheduleReconnect(error);
              this.socket = undefined;
              socket.close();
            }
            break;
          }
        }
      }
    });

    socket.addEventListener("message", (event) => {
      if (!isCurrent() || this.connectionState.kind !== "open") return;
      const frameText = isBoundaryObject(event) ? event.data : undefined;
      if (!isBoundaryString(frameText)) {
        const error = new ConnectionError("WebSocket frame must be a string", { opened: this.hasOpened() });
        this.emitDiagnosticEvent("error", "ws.invalid_frame_type", "stream", undefined, error);
        if (this.listenerCount("error") > 0) this.emit("error", error);
        socket.close();
        return;
      }
      if (frameText.length * 3 > this.maxMessageSizeBytes && utf8ByteLength(frameText) > this.maxMessageSizeBytes) {
        const error = new ConnectionError("WebSocket message exceeded the configured size limit", { opened: this.hasOpened() });
        this.emitDiagnosticEvent("warn", "ws.message_too_large", "stream", { maxMessageSizeBytes: this.maxMessageSizeBytes }, error);
        if (this.listenerCount("error") > 0) this.emit("error", error);
        socket.close();
        return;
      }
      let parsed: BoundaryValue;
      try {
        parsed = parseLosslessJson(frameText);
      } catch (cause) {
        const error = new ConnectionError("malformed WebSocket frame", { cause, opened: this.hasOpened() });
        this.emitDiagnosticEvent("error", "ws.malformed_frame", "stream", undefined, error);
        this.rejectRequests(error);
        if (this.listenerCount("error") > 0) this.emit("error", error);
        return;
      }
      this.route(parsed);
    });

    socket.addEventListener("error", (event) => {
      if (!isCurrent()) return;
      attempt.removeAbortListener?.();
      if (this.activeAttempt === attempt) this.activeAttempt = undefined;
      const socketError = isBoundaryObject(event) ? event.error : undefined;
      const error = new ConnectionError("WebSocket socket error", {
        cause: event instanceof Error ? event : socketError,
        opened: this.hasOpened(),
      });
      // A browser WebSocket can report an error before close.
      // Enter reconnecting before notifying consumers.
      // This keeps pending iterators available for the replayed subscription.
      if (this.socket === socket) {
        // SocketLike does not guarantee that an error is followed by close.
        // Fence and close the failed socket before creating its replacement.
        this.socket = undefined;
        socket.close();
      }
      const failedReconnectCorrelationId = this.reconnectCorrelationId;
      if (this.scheduleReconnect(error)) {
        this.emitDiagnosticEvent("error", "ws.socket.failure", "reconnect", undefined, error, undefined, failedReconnectCorrelationId);
        if (this.listenerCount("error") > 0) this.emit("error", error);
      }
      queueMicrotask(() => {
        if (this.connectionState.kind === "open") this.rejectRequests(error);
      });
    });

    socket.addEventListener("close", (event) => {
      if (!isCurrent()) return;
      attempt.removeAbortListener?.();
      if (this.activeAttempt === attempt) this.activeAttempt = undefined;
      this.clearLivenessTimer();
      if (this.connectionState.kind === "closed") {
        this.emitClose();
        return;
      }
      // reconnect() deliberately closes the old socket after entering the
      // reconnecting state. Its close event is part of that lifecycle, not a
      // second transport failure for the reconnect span.
      if (this.connectionState.kind === "reconnecting" && this.reconnectCorrelationId !== undefined) return;
      const closeEvent = isBoundaryObject(event) ? event : {};
      const error = new ConnectionError("WebSocket connection closed unexpectedly", {
        opened: this.hasOpened(),
        closeCode: isBoundaryNumber(closeEvent.code) ? closeEvent.code : undefined,
        closeReason: isBoundaryString(closeEvent.reason) ? closeEvent.reason : undefined,
      });
      this.socket = undefined;
      this.emitDiagnosticEvent("error", "ws.close.failure", "reconnect", undefined, error, undefined, this.reconnectCorrelationId);
      if (this.scheduleReconnect(error, {
        closeCode: error.closeCode,
        closeReason: error.closeReason,
      })) {
        if (this.listenerCount("error") > 0) this.emit("error", error);
      }
    });
  }

  private scheduleReconnect(
    cause?: unknown,
    metadata: { closeCode?: number; closeReason?: string; fatal?: boolean } = {},
    delayOverride?: number,
  ): boolean {
    if (this.connectionState.kind === "closed" || this.reconnectTimer) return true;
    const context: WebSocketReconnectContext = {
      attempt: this.reconnectAttempt,
      opened: this.hasOpened(),
      closeCode: metadata.closeCode,
      closeReason: metadata.closeReason,
      cause,
    };
    let shouldRetry = !metadata.fatal && !isFatalCloseCode(metadata.closeCode);
    if (this.shouldReconnect) {
      try {
        shouldRetry = this.shouldReconnect(context);
      } catch (classifierError) {
        shouldRetry = false;
        cause = classifierError;
      }
    }
    if (!shouldRetry || (!this.unlimitedReconnects && this.reconnectAttempt >= this.maxReconnectAttempts)) {
      this.failConnection(cause ?? new ConnectionError("WebSocket reconnect policy stopped retries", {
        opened: context.opened,
        closeCode: context.closeCode,
        closeReason: context.closeReason,
      }));
      return false;
    }
    if (this.connectionState.kind === "connecting" || this.connectionState.kind === "reconnecting") {
      this.connectionState = { kind: "reconnecting", deferred: this.connectionState.deferred };
    } else {
      let resolve!: () => void;
      let reject!: (cause?: unknown) => void;
      const promise = new Promise<void>((resolvePromise, rejectPromise) => {
        resolve = resolvePromise;
        reject = rejectPromise;
      });
      void promise.catch(() => undefined);
      this.connectionState = { kind: "reconnecting", deferred: { promise, resolve, reject } };
    }
    this.clearLivenessTimer();
    this.rejectRequests(new SdkError("WebSocket session reconnecting"));
    for (const [key, subscription] of this.subscriptions) {
      if (!subscription.active) continue;
      subscription.replayOnOpen = true;
      const pending = this.pending.get(key);
      if (pending?.durable) {
        // Preserve the initial ready promise, but mark its replacement ACK as a
        // replay so stream consumers leave reconnecting and emit resubscribed.
        pending.replay = true;
        continue;
      }
      this.pending.set(key, {
        resolve: () => {},
        reject: () => { subscription.active = false; },
        durable: true,
        replay: true,
      });
    }
    const delay = delayOverride ?? this.backoffDelay(this.reconnectAttempt);
    const correlationId = crypto.randomUUID();
    this.reconnectCorrelationId = correlationId;
    this.emitDiagnosticEvent("warn", "ws.reconnect", "reconnect", { attempt: this.reconnectAttempt, delayMs: delay }, undefined, undefined, correlationId);
    this.emit("reconnecting");
    this.reconnectAttempt++;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = undefined;
      if (this.connectionState.kind === "closed") return;
      if (this.connectionState.kind === "reconnecting") {
        this.connectionState = { kind: "connecting", deferred: this.connectionState.deferred };
      }
      const attemptExecution = deadline({}, this.timeoutMs);
      const deferred = this.connectionState.kind === "connecting" ? this.connectionState.deferred : undefined;
      if (deferred) void deferred.promise.finally(attemptExecution.cleanup).catch(() => undefined);
      void this.openSocket(undefined, false, true, { signal: attemptExecution.signal }, attemptExecution.signal);
    }, delay);
    return true;
  }

  private failConnection(cause: unknown): void {
    const error = cause instanceof Error
      ? cause
      : new ConnectionError("WebSocket reconnect failed", { cause, opened: this.hasOpened() });
    clearTimeout(this.reconnectTimer);
    this.reconnectTimer = undefined;
    this.clearStableConnectionTimer();
    this.socketAttempt++;
    const activeAttempt = this.activeAttempt;
    this.activeAttempt = undefined;
    activeAttempt?.removeAbortListener?.();
    activeAttempt?.controller.abort(error);
    const pendingAttemptSocket = activeAttempt?.socket;
    if (activeAttempt) activeAttempt.socket = undefined;
    pendingAttemptSocket?.close();
    const deferred = this.connectionState.kind === "connecting" || this.connectionState.kind === "reconnecting"
      ? this.connectionState.deferred
      : undefined;
    this.connectionState = { kind: "idle" };
    deferred?.reject(error);
    for (const [key, subscription] of this.subscriptions) {
      const pending = this.pending.get(key);
      if (!subscription.sent && !pending?.replay) continue;
      subscription.active = false;
      this.emitDiagnosticEvent(
        "error",
        "ws.subscription.replay.failure",
        "reconnect",
        { terminal: true },
        error,
        undefined,
        subscription.correlationId,
      );
      this.emit("subscriptionError", { id: subscription.frame.id, error });
    }
    this.rejectAll(error);
    this.subscriptions.clear();
    this.emitDiagnosticEvent("error", "ws.reconnect.failure", "reconnect", undefined, error, undefined, this.reconnectCorrelationId);
    if (this.listenerCount("error") > 0) this.emit("error", error);
  }

  subscribe(params: string[], options: RequestOptions = {}): WsSubscription {
    if (this.connectionState.kind === "closed") throw new SdkError("subscribe() called on a closed WebSocket session");
    const id = this.reserveId();
    const correlationId = crypto.randomUUID();
    const frame: SubscribeRequest = { id, method: "SUBSCRIBE", params };
    this.emitDiagnosticEvent("debug", "ws.subscription.start", "control", { subscriptionCount: params.length }, undefined, undefined, correlationId);
    let closed = false;
    let sent = false;
    let rejectReady: (reason?: BoundaryValue) => void = () => {};
    const ready = new Promise<GenericSuccessResponse>((resolve, reject) => {
      rejectReady = reject;
      this.pending.set(String(id), {
        resolve: (value) => {
          // SAFETY: A successful subscription acknowledgement is the generated GenericSuccessResponse wire contract.
          resolve(value as GenericSuccessResponse);
        },
        reject,
        durable: true,
      });
      this.subscriptions.set(String(id), {
        frame,
        correlationId,
        active: true,
        sent: false,
        replayOnOpen: false,
      });
      const connectionExecution = deadline(options, this.timeoutMs);
      const connection = this.ensureConnected(
        { ...options, signal: connectionExecution.signal },
        connectionExecution.signal,
      );
      void connection.then(connectionExecution.cleanup, connectionExecution.cleanup);
      const subscriptionSocketAttempt = this.socketAttempt;
      const subscribedWhileOpen = this.connectionState.kind === "open";
      void connection.then(() => {
        const subscription = this.subscriptions.get(String(id));
        if (closed || this.connectionState.kind !== "open" || !subscription?.active || subscription.sent || subscription.replayOnOpen ||
          (subscribedWhileOpen && this.socketAttempt !== subscriptionSocketAttempt)) return;
        try {
          this.emitDiagnosticEvent("info", "ws.subscription.send", "control", { subscriptionCount: params.length }, undefined, undefined, subscription.correlationId);
          this.sendSub(frame);
          sent = true;
          subscription.sent = true;
        } catch (error) {
          this.emitDiagnosticEvent("error", "ws.subscription.failure", "control", { subscriptionCount: params.length }, error, undefined, subscription.correlationId);
          this.pending.delete(String(id));
          this.subscriptions.delete(String(id));
          reject(error);
        }
      }, (error) => {
        this.emitDiagnosticEvent("error", "ws.subscription.failure", "control", { subscriptionCount: params.length }, error, undefined, correlationId);
        this.pending.delete(String(id));
        this.subscriptions.delete(String(id));
        reject(error);
      });
    });

    let unsubscribeSent = false;
    let subscriptionCloseEmitted = false;
    const emitSubscriptionClose = (reason?: string): void => {
      if (subscriptionCloseEmitted) return;
      subscriptionCloseEmitted = true;
      this.emitDiagnosticEvent("info", "ws.subscription.close", "control", {
        subscriptionCount: params.length,
        ...(reason ? { reason } : {}),
      }, undefined, undefined, correlationId);
    };
    const sendUnsubscribe = async (closeOptions: RequestOptions = {}, wasSent = sent): Promise<void> => {
      this.removeSubscription(frame);
      if (!wasSent || this.connectionState.kind !== "open" || unsubscribeSent) {
        if (!wasSent || this.connectionState.kind !== "open") emitSubscriptionClose("not_sent");
        return;
      }
      unsubscribeSent = true;
      const unsubscribe: UnsubscribeRequest = { method: "UNSUBSCRIBE", params, id: this.reserveId() };
      await this.request(unsubscribe, closeOptions);
      emitSubscriptionClose();
    };
    const boundedReady = this.wait(ready, options).catch((error) => {
      const durable = this.subscriptions.get(String(id));
      const wasSent = sent || durable?.sent === true;
      closed = true;
      if (this.pending.delete(String(id))) {
        this.subscriptions.delete(String(id));
        rejectReady(error);
      }
      if (error instanceof RequestTimeoutError || error instanceof RequestAbortedError) {
        void sendUnsubscribe({}, wasSent).catch((unsubscribeError) => {
          this.emitDiagnosticEvent("error", "ws.subscription.unsubscribe.failure", "control", { subscriptionCount: params.length }, unsubscribeError, undefined, correlationId);
        });
      } else {
        this.removeSubscription(frame);
      }
      throw error;
    });
    return {
      id,
      correlationId,
      ready: boundedReady,
      close: async (closeOptions = {}) => {
        if (closed) return;
        const durable = this.subscriptions.get(String(id));
        const wasSent = sent || durable?.sent === true;
        closed = true;
        if (this.pending.delete(String(id))) rejectReady(new SdkError("WebSocket subscription closed before acknowledgement"));
        this.subscriptions.delete(String(id));
        try {
          await sendUnsubscribe(closeOptions, wasSent);
        } catch (error) {
          this.emitDiagnosticEvent("error", "ws.subscription.unsubscribe.failure", "control", { subscriptionCount: params.length }, error, undefined, correlationId);
          throw error;
        }
      },
    };
  }

  private removeSubscription(frame: SubscribeRequest): void {
    for (const [key, subscription] of this.subscriptions) {
      if (subscription.frame === frame) this.subscriptions.delete(key);
    }
  }

  reconnect(delayMs?: number): void {
    if (this.connectionState.kind === "closed") throw new SdkError("reconnect() called on a closed WebSocket session");
    if (this.connectionState.kind !== "open") return;
    if (delayMs !== undefined && (!Number.isFinite(delayMs) || delayMs < 0)) {
      throw new SdkError("reconnect delay must be a finite non-negative number");
    }
    const socket = this.socket;
    // Fence the intentionally retired socket before starting the replacement.
    // Its close event can arrive while async reconnect headers are pending,
    // after the state has moved from reconnecting to connecting.
    this.socket = undefined;
    this.scheduleReconnect(undefined, {}, delayMs);
    socket?.close();
  }

  async request<T extends BoundaryValue = GenericSuccessResponse>(frame: WsMethodFrame, options: RequestOptions = {}): Promise<T> {
    if (this.connectionState.kind === "closed") throw new SdkError("request() called on a closed WebSocket session");
    if (this.connectionState.kind === "reconnecting") throw new SdkError("WebSocket session reconnecting");
    const execution = deadline(options, this.timeoutMs);
    const operationContext = operationContextForFrame(frame);
    const traffic = isMutationMethod(frame.method) ? "mutation" : "control";
    const correlationId = crypto.randomUUID();
    this.emitDiagnosticEvent("debug", "ws.request.start", traffic, { method: frame.method }, undefined, operationContext, correlationId);
    let id: string | number | undefined;
    try {
      const connection = this.ensureConnected(
        { ...options, signal: execution.signal },
        execution.signal,
      );
      await connection;
      if (execution.signal.aborted) {
        throw execution.signal.reason instanceof SdkError
          ? execution.signal.reason
          : new RequestAbortedError("request was aborted");
      }
      if (this.isClosed()) throw new SdkError("WebSocket session closed");
      id = this.reserveId(frame.id);
      const pendingRequest = new Promise<T>((resolve, reject) => {
        // SAFETY: The caller's generated request type determines the response contract for this pending frame.
        this.pending.set(String(id), { resolve: (response) => resolve(response as T), reject });
        try {
          this.sendFrame({ ...frame, id });
        } catch (error) {
          this.pending.delete(String(id));
          reject(error);
        }
      });
      const response = await withSignal(pendingRequest, execution.signal);
      this.emitDiagnosticEvent("info", "ws.request.end", traffic, { method: frame.method, status: statusFromFrame(response) }, undefined, operationContext, correlationId);
      return response;
    } catch (error) {
      this.emitDiagnosticEvent("error", "ws.request.failure", traffic, { method: frame.method }, error, operationContext, correlationId);
      throw error;
    } finally {
      if (id !== undefined) this.pending.delete(String(id));
      execution.cleanup();
    }
  }

  private async wait<T>(promise: Promise<T>, options: RequestOptions): Promise<T> {
    const execution = deadline(options, this.timeoutMs);
    try { return await withSignal(promise, execution.signal); } finally { execution.cleanup(); }
  }

  close(): void {
    if (this.connectionState.kind === "closed") return;
    this.socketAttempt++;
    const deferred = this.connectionState.kind === "connecting" || this.connectionState.kind === "reconnecting"
      ? this.connectionState.deferred
      : undefined;
    this.connectionState = { kind: "closed" };
    clearTimeout(this.reconnectTimer);
    this.reconnectTimer = undefined;
    this.clearStableConnectionTimer();
    this.clearLivenessTimer();
    // A close before open is a terminal outcome.
    // Reject the connection promise because no open event can arrive.
    const closeError = new SdkError("WebSocket session closed");
    deferred?.reject(closeError);
    this.rejectAll(closeError);
    for (const subscription of this.subscriptions.values()) {
      this.emitDiagnosticEvent("info", "ws.subscription.close", "control", { reason: "session_closed" }, undefined, undefined, subscription.correlationId);
    }
    this.subscriptions.clear();
    const socket = this.socket;
    this.socket = undefined;
    const activeAttempt = this.activeAttempt;
    this.activeAttempt = undefined;
    activeAttempt?.removeAbortListener?.();
    activeAttempt?.controller.abort(closeError);
    const pendingAttemptSocket = activeAttempt?.socket;
    if (activeAttempt) activeAttempt.socket = undefined;
    pendingAttemptSocket?.close();
    socket?.close();
    this.emitClose();
  }

  private sendSub(frame: WsMethodFrame, expectedSocket?: SocketLike): void {
    const socket = expectedSocket ?? this.socket;
    if (!socket || socket !== this.socket || this.connectionState.kind !== "open") {
      throw new SdkError("WebSocket socket is no longer current");
    }
    socket.send(stringifyJson(frame));
  }

  private sendFrame(frame: WsMethodFrame): void {
    if (this.connectionState.kind !== "open") throw new SdkError("send() called before WebSocket is open");
    this.sendSub(frame);
  }

  private scheduleLiveness(): void {
    if (!this.liveness || this.connectionState.kind !== "open") return;
    this.clearLivenessTimer();
    this.livenessTimer = setTimeout(() => { void this.runLiveness(); }, this.liveness.intervalMs);
  }

  private clearLivenessTimer(): void {
    if (this.livenessTimer) clearTimeout(this.livenessTimer);
    this.livenessTimer = undefined;
  }

  private clearStableConnectionTimer(): void {
    if (this.stableConnectionTimer) clearTimeout(this.stableConnectionTimer);
    this.stableConnectionTimer = undefined;
  }

  private async runLiveness(): Promise<void> {
    this.livenessTimer = undefined;
    if (!this.liveness || this.connectionState.kind !== "open") return;
    try {
      await this.request({ method: "ping" }, { timeoutMs: this.liveness.timeoutMs });
    } catch (error) {
      if (this.connectionState.kind === "open") {
        this.emitDiagnosticEvent("error", "ws.liveness.failure", "reconnect", undefined, error);
        this.reconnect();
      }
      return;
    }
    this.scheduleLiveness();
  }

  private route(frame: BoundaryValue): void {
    if (!isBoundaryObject(frame)) {
      this.emitDiagnosticEvent("debug", "ws.stream.frame", "stream", streamMetadata(frame));
      this.emit("message", frame);
      return;
    }
    const response = frame;
    if ((isBoundaryString(response.id) || isBoundaryNumber(response.id)) && isBoundaryNumber(response.status)) {
      const key = String(response.id);
      const pending = this.pending.get(key);
      if (pending) {
        this.pending.delete(key);
        if (response.error !== undefined || response.status !== 200) {
          const error = new WebSocketRequestError({ status: response.status, body: frame });
          pending.reject(error);
          const subscription = this.subscriptions.get(key);
          if (pending.durable) {
            this.emitDiagnosticEvent(
              "error",
              pending.replay ? "ws.subscription.replay.failure" : "ws.subscription.failure",
              "control",
              { subscriptionCount: subscription?.frame.params?.length ?? 0, ...(pending.replay ? { terminal: true } : {}) },
              error,
              undefined,
              subscription?.correlationId,
            );
          }
          if (pending.durable && subscription) {
            this.removeSubscription(subscription.frame);
            subscription.active = false;
            this.subscriptions.delete(key);
          }
          if (pending.replay) this.emit("subscriptionError", { id: response.id, error });
        } else {
          pending.resolve(frame);
          if (pending.durable && !pending.replay) {
            const subscription = this.subscriptions.get(key);
            this.emitDiagnosticEvent("info", "ws.subscription.ready", "control", {
              subscriptionCount: subscription?.frame.params?.length ?? 0,
            }, undefined, undefined, subscription?.correlationId);
            this.emit("subscriptionReady", { id: response.id, response: frame });
          }
          if (pending.replay) {
            const subscription = this.subscriptions.get(key);
            if (subscription) subscription.active = true;
            this.emitDiagnosticEvent("info", "ws.subscription.replay", "reconnect", {
              subscriptionCount: subscription?.frame.params?.length ?? 0,
            }, undefined, undefined, subscription?.correlationId);
            this.emit("resubscribed", { id: response.id, response: frame });
          }
        }
        return;
      }
      return;
    }
    this.emitDiagnosticEvent("debug", "ws.stream.frame", "stream", streamMetadata(frame));
    this.emit("message", frame);
  }

  private rejectAll(error: BoundaryValue): void {
    for (const pending of this.pending.values()) pending.reject(error);
    this.pending.clear();
  }

  private rejectRequests(error: BoundaryValue): void {
    for (const [key, pending] of this.pending) {
      if (pending.durable) continue;
      pending.reject(error);
      this.pending.delete(key);
    }
  }

  private reserveId(preferred?: string | number): string | number {
    if (preferred !== undefined) {
      const key = String(preferred);
      if (this.pending.has(key)) throw new SdkError(`WebSocket request id ${key} is already pending`);
      return preferred;
    }
    while (this.pending.has(String(this.nextId))) this.nextId++;
    return this.nextId++;
  }

  private emitClose(): void {
    if (this.connectionState.kind !== "closed") return;
    this.emitDiagnosticEvent("info", "ws.close", "control", { reason: "caller" });
    this.emit("close");
  }

  private isClosed(): boolean {
    return this.connectionState.kind === "closed";
  }

  private hasOpened(): boolean {
    return this.connectionState.kind === "open" || this.connectionState.kind === "reconnecting";
  }
}

function statusFromFrame(message: BoundaryValue): number | undefined {
  return isBoundaryObject(message) && isBoundaryNumber(message.status) ? message.status : undefined;
}

function streamMetadata(frame: BoundaryValue) {
  if (!isBoundaryObject(frame)) return {};
  const message = frame;
  const metadata: BoundaryRecord = {};
  if (isBoundaryString(message.e)) metadata.event = message.e;
  if (isBoundaryString(message.s)) metadata.symbol = message.s;
  return metadata;
}

function isMutationMethod(method: string): boolean {
  return /(?:order|quote|cancel|withdraw|transfer|payment|session)/i.test(method);
}

function isPromiseLike<T>(value: T | PromiseLike<T>): value is PromiseLike<T> {
  return typeof value === "object" && value !== null && "then" in value && typeof value.then === "function";
}

function isFatalCloseCode(code: number | undefined): boolean {
  // RFC 6455 protocol/policy failures and the common auth close codes are not
  // made healthy by retrying the same credentials or wire contract.
  return code === 1002 || code === 1003 || code === 1007 || code === 1008 || code === 1009 ||
    code === 1010 || code === 4001 || code === 4003 || code === 4401 || code === 4403;
}

function operationContextForFrame(frame: WsMethodFrame): OperationContext {
  const context: OperationContext = { operation: frame.method };
  if (!isBoundaryObject(frame.params)) return context;
  const params = frame.params;
  const clientOrderId = isBoundaryString(params.clientOrderId)
    ? params.clientOrderId
    : isBoundaryString(params.client_order_id)
      ? params.client_order_id
      : undefined;
  if (clientOrderId !== undefined) context.clientOrderId = clientOrderId;
  return context;
}
