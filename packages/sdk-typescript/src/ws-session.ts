import { TypedEmitter } from "./core/typed-emitter.js";
import { toBase64 } from "./core/encoding.js";

import type { AuthStrategy } from "./core/http.js";
import { DEFAULT_TIMEOUT_MS, deadline, type RequestOptions, withSignal } from "./core/deadline.js";
import {
  RequestAbortedError,
  RequestTimeoutError,
  serializeError,
  SdkError,
  WebSocketRequestError,
} from "./errors.js";
import type { DiagnosticListener, OperationContext } from "./diagnostics.js";
import { emitDiagnostic, type Logger, NOOP_LOGGER } from "./logging.js";
import { WsTransport, type SocketFactory } from "./transport.js";
import type {
  GenericSuccessResponse,
  SubscribeRequest,
  UnsubscribeRequest,
} from "./websocket-types.js";

const DEFAULT_LIVENESS_INTERVAL_MS = 30_000;
const DEFAULT_LIVENESS_TIMEOUT_MS = 10_000;

type WsMethodFrame = {
  id?: string | number;
  method: string;
  params?: unknown;
};

type Pending = {
  resolve: (value: unknown) => void;
  reject: (reason?: unknown) => void;
  durable?: boolean;
  replay?: boolean;
};

type DurableSubscription = {
  frame: SubscribeRequest;
  active: boolean;
  readySettled: boolean;
};

export interface WsSessionOptions {
  url: string;
  auth?: AuthStrategy;
  logger?: Logger;
  onDiagnostic?: DiagnosticListener;
  socketFactory?: SocketFactory;
  timeoutMs?: number;
  liveness?: { intervalMs?: number; timeoutMs?: number };
  maxMessageSizeBytes?: number;
}

export interface WsSubscription {
  readonly id: string | number;
  readonly ready: Promise<GenericSuccessResponse>;
  close(options?: RequestOptions): Promise<void>;
}

function isNumericNonce(nonce: string): boolean {
  return /^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(nonce);
}

function reservedCredentialHeader(headers: Record<string, string>): string | undefined {
  return Object.keys(headers).find((name) =>
    ["content-length", "x-gemini-nonce", "x-gemini-payload"].includes(name.toLowerCase()),
  );
}

async function websocketAuthHeaders(auth: AuthStrategy, options?: RequestOptions): Promise<Record<string, string>> {
  const nonce = auth.nextNonce();
  if (nonce === undefined) {
    const headers = await auth.credentialHeaders("", options);
    const reserved = reservedCredentialHeader(headers);
    if (reserved) throw new SdkError(`AuthStrategy returned reserved header ${reserved}`);
    return headers;
  }
  if (!isNumericNonce(nonce)) {
    throw new SdkError("AuthStrategy returned an invalid nonce");
  }
  const payloadBase64 = toBase64(nonce);
  const headers = await auth.credentialHeaders(payloadBase64, options);
  const reserved = reservedCredentialHeader(headers);
  if (reserved) throw new SdkError(`AuthStrategy returned reserved header ${reserved}`);
  return {
    ...headers,
    "X-GEMINI-NONCE": nonce,
    "X-GEMINI-PAYLOAD": payloadBase64,
  };
}

type WsSessionEvents = {
  open: () => void;
  message: (frame: unknown) => void;
  error: (error: unknown) => void;
  reconnecting: () => void;
  close: () => void;
  resubscribed: (event: { id: string | number; response: unknown }) => void;
  subscriptionError: (event: { id: string | number; error: unknown }) => void;
};

export class WsSession extends TypedEmitter<WsSessionEvents> {
  private readonly url: string;
  private readonly auth?: AuthStrategy;
  private readonly logger: Logger;
  private readonly onDiagnostic?: DiagnosticListener;
  private readonly socketFactory?: SocketFactory;
  private readonly pending = new Map<string, Pending>();
  private readonly subscriptions = new Map<string, DurableSubscription>();
  private nextId = 1;
  private transport?: WsTransport;
  private connectPromise?: Promise<void>;
  private closed = false;
  private transportOpen = false;
  private readonly timeoutMs: number;
  private readonly liveness?: { intervalMs: number; timeoutMs: number };
  private readonly maxMessageSizeBytes?: number;
  private livenessTimer?: ReturnType<typeof setTimeout>;

  constructor(options: WsSessionOptions) {
    super();
    if (!options || typeof options.url !== "string" || options.url.length === 0) {
      throw new SdkError("url is required");
    }
    this.url = options.url;
    this.auth = options.auth;
    this.logger = options.logger ?? NOOP_LOGGER;
    this.onDiagnostic = options.onDiagnostic;
    this.socketFactory = options.socketFactory;
    this.maxMessageSizeBytes = options.maxMessageSizeBytes;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    if (!Number.isFinite(this.timeoutMs) || this.timeoutMs <= 0) {
      throw new SdkError("timeoutMs must be a finite positive number");
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
    metadata?: Record<string, unknown>,
    error?: unknown,
    operationContext?: OperationContext,
  ): void {
    emitDiagnostic({
      level,
      component: "websocket",
      name,
      traffic,
      operationContext,
      metadata,
      ...(error ? { error: serializeError(error) } : {}),
    }, this.logger, this.onDiagnostic);
  }

  async connect(options: RequestOptions = {}): Promise<void> {
    return this.wait(this.ensureConnected(options), options);
  }

  private ensureConnected(options: RequestOptions = {}): Promise<void> {
    if (this.closed) throw new SdkError("connect() called on a closed WebSocket session");
    if (this.transportOpen) return Promise.resolve();
    if (this.connectPromise) return this.connectPromise;
    const auth = this.auth;
    if (!auth) {
      this.transport = this.createTransport(undefined);
      this.connectPromise = this.transport.connect();
      return this.connectPromise;
    }
    this.connectPromise = (async () => {
      const headers = await websocketAuthHeaders(auth, options);
      this.transport = this.createTransport(headers);
      await this.transport.connect();
    })();
    return this.connectPromise;
  }

  async request<T = GenericSuccessResponse>(frame: WsMethodFrame, options: RequestOptions = {}): Promise<T> {
    if (this.closed) throw new SdkError("request() called on a closed WebSocket session");
    const execution = deadline(options, this.timeoutMs);
    const operationContext = operationContextForFrame(frame);
    const traffic = isMutationMethod(frame.method) ? "mutation" : "control";
    this.emitDiagnosticEvent("debug", "ws.request.start", traffic, { method: frame.method }, undefined, operationContext);
    let id: string | number | undefined;
    try {
      const connection = this.ensureConnected(options);
      await (options.signal || options.timeoutMs !== undefined
        ? withSignal(connection, execution.signal)
        : connection);
      if (this.closed) throw new SdkError("WebSocket session closed");
      id = this.reserveId(frame.id);
      const requestFrame = { ...frame, id };
      const pendingRequest = new Promise<T>((resolve, reject) => {
        this.pending.set(String(id), {
          resolve: (response) => resolve(response as T),
          reject,
        });
        try {
          this.transport?.send(requestFrame);
        } catch (error) {
          this.pending.delete(String(id));
          reject(error);
        }
      });
      const response = await withSignal(pendingRequest, execution.signal);
      this.emitDiagnosticEvent("info", "ws.request.end", traffic, {
        method: frame.method,
        status: statusFromFrame(response),
      }, undefined, operationContext);
      return response;
    } catch (error) {
      this.emitDiagnosticEvent("error", "ws.request.failure", traffic, { method: frame.method }, error, operationContext);
      throw error;
    } finally {
      if (id !== undefined) this.pending.delete(String(id));
      execution.cleanup();
    }
  }

  subscribe(params: string[], options: RequestOptions = {}): WsSubscription {
    if (this.closed) throw new SdkError("subscribe() called on a closed WebSocket session");
    const id = this.reserveId();
    const frame: SubscribeRequest = { id, method: "SUBSCRIBE", params };
    this.emitDiagnosticEvent("debug", "ws.subscription.start", "control", {
      subscriptionCount: params.length,
    });
    let closed = false;
    let sent = false;
    let rejectReady: (reason?: unknown) => void = () => {};
    const ready = new Promise<GenericSuccessResponse>((resolve, reject) => {
      rejectReady = reject;
      this.pending.set(String(id), {
        resolve: (value) => {
          const subscription = this.subscriptions.get(String(id));
          if (subscription) subscription.readySettled = true;
          resolve(value as GenericSuccessResponse);
        },
        reject,
        durable: true,
      });
      this.subscriptions.set(String(id), { frame, active: true, readySettled: false });
      const connection = options.signal || options.timeoutMs !== undefined
        ? this.wait(this.ensureConnected(options), options)
        : this.ensureConnected(options);
      void connection.then(() => {
        if (closed || this.closed) return;
        sent = true;
        this.emitDiagnosticEvent("info", "ws.subscription.send", "control", {
          subscriptionCount: params.length,
        });
        this.transport?.subscribe(frame);
      }, (error) => {
        this.emitDiagnosticEvent("error", "ws.subscription.failure", "control", {
          subscriptionCount: params.length,
        }, error);
        this.pending.delete(String(id));
        this.subscriptions.delete(String(id));
        reject(error);
      });
    });

    let unsubscribeSent = false;
    const sendUnsubscribe = async (closeOptions: RequestOptions = {}): Promise<void> => {
      this.transport?.unsubscribe(frame);
      if (!sent || !this.transportOpen || unsubscribeSent) return;
      unsubscribeSent = true;
      const unsubscribe: UnsubscribeRequest = {
        method: "UNSUBSCRIBE",
        params,
        id: this.reserveId(),
      };
      await this.request(unsubscribe, closeOptions);
    };

    const boundedReady = this.wait(ready, options).catch((error) => {
      closed = true;
      if (this.pending.delete(String(id))) {
        this.subscriptions.delete(String(id));
        rejectReady(error);
      }
      if (error instanceof RequestTimeoutError || error instanceof RequestAbortedError) {
        void sendUnsubscribe().catch((unsubscribeError) => {
          this.emitDiagnosticEvent("error", "ws.subscription.unsubscribe.failure", "control", {
            subscriptionCount: params.length,
          }, unsubscribeError);
        });
      } else {
        this.transport?.unsubscribe(frame);
      }
      throw error;
    });
    return {
      id,
      ready: boundedReady,
      close: async (closeOptions = {}) => {
        if (closed) return;
        closed = true;
        if (this.pending.delete(String(id))) {
          rejectReady(new SdkError("WebSocket subscription closed before acknowledgement"));
        }
        this.subscriptions.delete(String(id));
        await sendUnsubscribe(closeOptions);
      },
    };
  }

  private async wait<T>(promise: Promise<T>, options: RequestOptions): Promise<T> {
    const execution = deadline(options, this.timeoutMs);
    try { return await withSignal(promise, execution.signal); } finally { execution.cleanup(); }
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.transportOpen = false;
    this.clearLivenessTimer();
    this.rejectAll(new SdkError("WebSocket session closed"));
    this.subscriptions.clear();
    this.transport?.close();
  }

  reconnect(): void {
    if (this.closed) throw new SdkError("reconnect() called on a closed WebSocket session");
    this.transport?.reconnect();
  }

  private createTransport(headers: Record<string, string> | undefined): WsTransport {
    const auth = this.auth;
    const transport = new WsTransport(this.url, {
      logger: this.logger,
      socketFactory: this.socketFactory,
      headers,
      onDiagnostic: this.onDiagnostic,
      timeoutMs: this.timeoutMs,
      maxMessageSizeBytes: this.maxMessageSizeBytes,
      headersFactory: auth ? () => websocketAuthHeaders(auth) : undefined,
    });
    transport.on("message", (frame: unknown) => this.route(frame));
    transport.on("open", () => {
      this.transportOpen = true;
      this.connectPromise = Promise.resolve();
      this.scheduleLiveness();
      this.emit("open");
    });
    transport.on("reconnecting", () => {
      this.transportOpen = false;
      this.clearLivenessTimer();
      this.rejectRequests(new SdkError("WebSocket session reconnecting"));
      for (const [key, subscription] of this.subscriptions) {
        if (!subscription.active || !subscription.readySettled) continue;
        this.pending.set(key, {
          resolve: () => {},
          reject: () => {
            subscription.active = false;
          },
          durable: true,
          replay: true,
        });
      }
      this.emit("reconnecting");
    });
    transport.on("close", () => {
      this.transportOpen = false;
      this.rejectAll(new SdkError("WebSocket session closed"));
      this.emit("close");
    });
    transport.on("error", (transportError: unknown) => {
      const error = transportError instanceof Error ? transportError : new SdkError("WebSocket session error");
      // A socket close emits the richer transport error immediately before the
      // reconnecting event. Let reconnecting own pending-request rejection;
      // standalone malformed/socket errors still reject on the next turn.
      queueMicrotask(() => {
        if (this.transportOpen) this.rejectRequests(error);
      });
      if (this.listenerCount("error") > 0) this.emit("error", transportError);
    });
    return transport;
  }

  private scheduleLiveness(): void {
    if (!this.liveness || this.closed || !this.transportOpen) return;
    this.clearLivenessTimer();
    this.livenessTimer = setTimeout(() => { void this.runLiveness(); }, this.liveness.intervalMs);
  }

  private clearLivenessTimer(): void {
    if (this.livenessTimer) clearTimeout(this.livenessTimer);
    this.livenessTimer = undefined;
  }

  private async runLiveness(): Promise<void> {
    this.livenessTimer = undefined;
    if (!this.liveness || this.closed || !this.transportOpen) return;
    try {
      await this.request({ method: "ping" }, { timeoutMs: this.liveness.timeoutMs });
    } catch (error) {
      if (!this.closed && this.transportOpen) {
        this.emitDiagnosticEvent("error", "ws.liveness.failure", "reconnect", undefined, error);
        this.transport?.reconnect();
      }
      return;
    }
    this.scheduleLiveness();
  }

  private route(frame: unknown): void {
    const response = frame as { id?: unknown; status?: unknown; error?: unknown };
    if ((typeof response.id === "string" || typeof response.id === "number") && typeof response.status === "number") {
      const key = String(response.id);
      const pending = this.pending.get(key);
      if (pending) {
        this.pending.delete(key);
        if (response.error !== undefined || response.status !== 200) {
          const error = new WebSocketRequestError({ status: response.status, body: frame });
          pending.reject(error);
          const subscription = this.subscriptions.get(key);
          if (pending.durable && subscription) {
            this.transport?.unsubscribe(subscription.frame);
            subscription.active = false;
            this.subscriptions.delete(key);
          }
          if (pending.replay) this.emit("subscriptionError", { id: response.id, error });
        } else {
          pending.resolve(frame);
          if (pending.replay) {
            const subscription = this.subscriptions.get(key);
            if (subscription) subscription.active = true;
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

  private rejectAll(error: unknown): void {
    for (const pending of this.pending.values()) pending.reject(error);
    this.pending.clear();
  }

  private rejectRequests(error: unknown): void {
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
}

function statusFromFrame(message: unknown): number | undefined {
  if (message !== null && typeof message === "object" && typeof (message as { status?: unknown }).status === "number") {
    return (message as { status: number }).status;
  }
  return undefined;
}

function streamMetadata(frame: unknown): Record<string, unknown> {
  if (frame === null || typeof frame !== "object" || Array.isArray(frame)) return {};
  const message = frame as Record<string, unknown>;
  return {
    ...(typeof message.e === "string" ? { event: message.e } : {}),
    ...(typeof message.s === "string" ? { symbol: message.s } : {}),
  };
}

function isMutationMethod(method: string): boolean {
  return /(?:order|quote|cancel|withdraw|transfer|payment|session)/i.test(method);
}

function operationContextForFrame(frame: WsMethodFrame): OperationContext {
  const context: OperationContext = { operation: frame.method };
  if (frame.params === null || typeof frame.params !== "object" || Array.isArray(frame.params)) return context;
  const params = frame.params as Record<string, unknown>;
  const clientOrderId = typeof params.clientOrderId === "string"
    ? params.clientOrderId
    : typeof params.client_order_id === "string"
      ? params.client_order_id
      : undefined;
  if (clientOrderId !== undefined) context.clientOrderId = clientOrderId;
  return context;
}
