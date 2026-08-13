import { TypedEmitter } from "./core/typed-emitter.js";
import { utf8ByteLength } from "./core/encoding.js";

import { ConnectionError, RequestTimeoutError, SdkError, serializeError } from "./errors.js";
import { DEFAULT_TIMEOUT_MS, deadline, type RequestOptions, withSignal } from "./core/deadline.js";
import { sanitizeDiagnosticUrl, type DiagnosticListener } from "./diagnostics.js";
import { parseLosslessJson } from "./json.js";
import { emitDiagnostic, type Logger, NOOP_LOGGER } from "./logging.js";

const DEFAULT_BACKOFF_BASE_MS = 250;
const DEFAULT_BACKOFF_CAP_MS = 30_000;
const DEFAULT_BACKOFF_FACTOR = 2;
const DEFAULT_MAX_MESSAGE_SIZE_BYTES = 1_048_576;

/**
 * The minimal slice of the WebSocket API this transport depends on. Native
 * `WebSocket` satisfies it; tests pass a fake implementing just these members.
 */
export interface SocketLike {
  addEventListener(type: string, listener: (ev: unknown) => void): void;
  send(data: string): void;
  close(): void;
}

/** Produces a socket for a URL. The default uses the native WebSocket global. */
export interface SocketFactoryOptions {
  headers?: Record<string, string>;
}
export type SocketFactory = (url: string, options: SocketFactoryOptions) => SocketLike;

export interface WsTransportOptions {
  logger?: Logger;
  onDiagnostic?: DiagnosticListener;
  socketFactory?: SocketFactory;
  headers?: Record<string, string>;
  headersFactory?: () => Promise<Record<string, string> | undefined>;
  /** Reconnect backoff tuning. Defaults: base 250ms, cap 30s, factor 2. */
  backoff?: { baseMs?: number; capMs?: number; factor?: number };
  // Injectable so tests can make jitter deterministic; production uses Math.random.
  random?: () => number;
  /** Bounds the initial socket open; reconnects remain background work. */
  timeoutMs?: number;
  /** Rejects and closes frames larger than this many UTF-8 bytes. */
  maxMessageSizeBytes?: number;
}
type WsTransportEvents = {
  open: () => void;
  message: (frame: unknown) => void;
  error: (error: unknown) => void;
  reconnecting: (attempt: number) => void;
  close: () => void;
};


export class WsTransport extends TypedEmitter<WsTransportEvents> {
  private readonly url: string;
  private readonly logger: Logger;
  private readonly onDiagnostic?: DiagnosticListener;
  private readonly socketFactory: SocketFactory;
  private readonly headers?: Record<string, string>;
  private readonly headersFactory?: () => Promise<Record<string, string> | undefined>;
  private readonly baseMs: number;
  private readonly capMs: number;
  private readonly factor: number;
  private readonly random: () => number;
  private readonly timeoutMs: number;
  private readonly maxMessageSizeBytes: number;
  private reconnectAttempt = 0;
  private closedByUser = false;
  private socket?: SocketLike;
  private reconnectTimer?: ReturnType<typeof setTimeout>;
  private resolveConnect?: () => void;
  private rejectConnect?: (error: unknown) => void;
  private connectStarted = false;
  private isOpen = false;
  private everOpened = false;
  private closeEmitted = false;
  private firstSocket = true;
  private opening = false;
  // Every subscription ever made, replayed on each reconnect — a fresh socket is
  // a blank slate at the exchange, so the caller's subs must be re-sent.
  private readonly subscriptions: unknown[] = [];

  constructor(url: string, options?: WsTransportOptions) {
    super();
    this.url = url;
    this.logger = options?.logger ?? NOOP_LOGGER;
    this.onDiagnostic = options?.onDiagnostic;
    this.socketFactory = options?.socketFactory ?? ((socketUrl, socketOptions) => {
      if (socketOptions.headers && Object.keys(socketOptions.headers).length > 0) {
        throw new SdkError(
          "The default WebSocket factory cannot send custom headers. " +
          "Pass a socketFactory that supports upgrade headers (e.g. the ws package for Node.js).",
        );
      }
      return new WebSocket(socketUrl) as SocketLike;
    });
    this.headers = options?.headers ? { ...options.headers } : undefined;
    this.headersFactory = options?.headersFactory;
    this.baseMs = options?.backoff?.baseMs ?? DEFAULT_BACKOFF_BASE_MS;
    this.capMs = options?.backoff?.capMs ?? DEFAULT_BACKOFF_CAP_MS;
    this.factor = options?.backoff?.factor ?? DEFAULT_BACKOFF_FACTOR;
    this.random = options?.random ?? Math.random;
    this.timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.maxMessageSizeBytes = options?.maxMessageSizeBytes ?? DEFAULT_MAX_MESSAGE_SIZE_BYTES;
    if (!Number.isFinite(this.timeoutMs) || this.timeoutMs <= 0) {
      throw new SdkError("timeoutMs must be a finite positive number");
    }
    if (!Number.isFinite(this.maxMessageSizeBytes) || this.maxMessageSizeBytes <= 0) {
      throw new SdkError("maxMessageSizeBytes must be a finite positive number");
    }
  }

  private emitDiagnosticEvent(
    level: "debug" | "info" | "warn" | "error",
    name: string,
    traffic: "control" | "stream" | "reconnect" | "mutation",
    metadata?: Record<string, unknown>,
    error?: unknown,
  ): void {
    emitDiagnostic({
      level,
      component: "websocket",
      name,
      traffic,
      metadata: { url: sanitizeDiagnosticUrl(this.url), ...metadata },
      ...(error ? { error: serializeError(error) } : {}),
    }, this.logger, this.onDiagnostic);
  }

  // Delay before reconnect attempt N. Attempt 0 is immediate (most drops are
  // transient); later attempts grow exponentially, capped. Equal jitter — half
  // fixed, half random — keeps a floor while de-synchronising many clients that
  // all dropped at once (e.g. an exchange restart), so they don't reconnect in
  // lockstep and re-crash it.
  private backoffDelay(attempt: number): number {
    if (attempt === 0) return 0;
    const raw = Math.min(this.capMs, this.baseMs * this.factor ** (attempt - 1));
    return raw / 2 + this.random() * (raw / 2);
  }

  /**
   * Open the connection. Resolves on the first 'open'.
   *
   * The initial connection is bounded by the configured timeout and rejects on
   * failure. Reconnects after a drop remain background work; watch the
   * 'reconnecting'/'open' events for those. Call once; calling again throws.
   */
  connect(options: RequestOptions = {}): Promise<void> {
    if (this.connectStarted) {
      throw new SdkError("connect() called more than once on the same transport");
    }
    this.connectStarted = true;
    const connection = new Promise<void>((resolve, reject) => {
      this.resolveConnect = resolve;
      this.rejectConnect = reject;
      void this.openSocket();
    });
    if (options.signal === undefined && options.timeoutMs === undefined) {
      const timer = setTimeout(() => this.rejectConnect?.(
        new RequestTimeoutError(`WebSocket connection exceeded ${this.timeoutMs}ms deadline`),
      ), this.timeoutMs);
      const resolve = this.resolveConnect;
      const reject = this.rejectConnect;
      this.resolveConnect = () => { clearTimeout(timer); resolve?.(); };
      this.rejectConnect = (error) => { clearTimeout(timer); reject?.(error); };
      return connection;
    }
    const execution = deadline(options, this.timeoutMs);
    return withSignal(connection, execution.signal).finally(execution.cleanup);
  }

  // Open a socket and wire its lifecycle. Called for the initial connect and
  // again for every reconnect, so all connections behave identically.
  private async openSocket(): Promise<void> {
    // A reconnect timer may fire after the caller tore us down; don't reconnect.
    if (this.closedByUser || this.opening) return;
    this.opening = true;

    let headers = this.headers;
    if (!this.firstSocket && this.headersFactory) {
      try {
        headers = await this.headersFactory();
      } catch (error) {
        this.opening = false;
        this.emitDiagnosticEvent("error", "ws.reconnect_headers.failure", "reconnect", { attempt: this.reconnectAttempt }, error);
        this.scheduleReconnect();
        return;
      }
    }
    this.firstSocket = false;
    if (this.closedByUser) {
      this.opening = false;
      return;
    }

    let socket: SocketLike;
    try {
      socket = this.socketFactory(this.url, { headers });
    } catch (cause) {
      this.opening = false;
      const error = new ConnectionError("WebSocket socket creation failed", {
        cause,
        opened: this.everOpened,
      });
      this.rejectConnect?.(error);
      this.emitDiagnosticEvent("error", "ws.socket_factory.failure", "control", { attempt: this.reconnectAttempt }, error);
      this.scheduleReconnect();
      return;
    }
    this.opening = false;
    this.socket = socket;

    // A superseded socket (replaced on reconnect) can still fire late events; the
    // SocketLike seam has no removeEventListener, so ignore anything not from the
    // current socket — otherwise a stale frame would be emitted as if it were live.
    const isCurrent = () => socket === this.socket;

    socket.addEventListener("open", () => {
      if (!isCurrent()) return;
      this.emitDiagnosticEvent("info", "ws.open", "control");
      this.isOpen = true;
      this.everOpened = true;
      this.reconnectAttempt = 0; // a live connection resets the backoff curve

      this.emit("open");
      this.resolveConnect?.(); // idempotent — only the first connect() awaits it
      for (const sub of this.subscriptions) this.sendSub(sub);
    });

    socket.addEventListener("message", (event) => {
      if (!isCurrent() || !this.isOpen) return;
      // Gemini sends text JSON; reject binary frames until the protocol requires decoding.
      const frameText = (event as { data: unknown }).data;
      if (typeof frameText !== "string") {
        const error = new ConnectionError("WebSocket frame must be a string", {
          opened: this.everOpened,
        });
        this.emitDiagnosticEvent("error", "ws.invalid_frame_type", "stream", undefined, error);
        if (this.listenerCount("error") > 0) this.emit("error", error);
        socket.close();
        return;
      }
      if (utf8ByteLength(frameText) > this.maxMessageSizeBytes) {
        const error = new ConnectionError("WebSocket message exceeded the configured size limit", {
          opened: this.everOpened,
        });
        this.emitDiagnosticEvent("warn", "ws.message_too_large", "stream", {
          maxMessageSizeBytes: this.maxMessageSizeBytes,
        }, error);
        if (this.listenerCount("error") > 0) this.emit("error", error);
        socket.close();
        return;
      }
      let parsed: unknown;
      try {
        parsed = parseLosslessJson(frameText);
      } catch (cause) {
        // Fail loud: a frame we can't parse must never be silently dropped on a
        // trading path. Always log it; the socket itself is still fine, so keep it.
        const error = new ConnectionError("malformed WebSocket frame", {
          cause,
          opened: this.everOpened,
        });
        this.emitDiagnosticEvent("error", "ws.malformed_frame", "stream", undefined, error);
        // Emit only if someone's listening — avoids swallowing the error when
        // no listener is attached. Already logged above, so this stays loud without crashing.
        if (this.listenerCount("error") > 0) {
          this.emit("error", error);
        }
        return;
      }
      this.emit("message", parsed);
    });

    socket.addEventListener("error", (event) => {
      if (!isCurrent()) return;
      const socketErrorEvent = event as { error?: unknown };
      const error = new ConnectionError("WebSocket socket error", {
        cause: event instanceof Error ? event : socketErrorEvent.error,
        opened: this.everOpened,
      });
      this.emitDiagnosticEvent("error", "ws.socket.failure", "control", undefined, error);
      if (this.listenerCount("error") > 0) this.emit("error", error);
    });

    socket.addEventListener("close", (event) => {
      if (!isCurrent()) return;
      this.isOpen = false;

      // A deliberate close() — don't fight the caller by reconnecting.
      if (this.closedByUser) {
        this.emitClose();
        return;
      }

      const closeEvent = event as { code?: unknown; reason?: unknown };
      const error = new ConnectionError("WebSocket connection closed unexpectedly", {
        opened: this.everOpened,
        closeCode: typeof closeEvent?.code === "number" ? closeEvent.code : undefined,
        closeReason: typeof closeEvent?.reason === "string" ? closeEvent.reason : undefined,
      });
      this.emitDiagnosticEvent("error", "ws.close.failure", "reconnect", undefined, error);
      if (this.listenerCount("error") > 0) this.emit("error", error);
      this.scheduleReconnect();
    });
  }

  private scheduleReconnect(): void {
    if (this.closedByUser || this.reconnectTimer) return;
    const delay = this.backoffDelay(this.reconnectAttempt);
    this.emitDiagnosticEvent("warn", "ws.reconnect", "reconnect", {
      attempt: this.reconnectAttempt,
      delayMs: delay,
    });
    this.emit("reconnecting", this.reconnectAttempt);
    this.reconnectAttempt++;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = undefined;
      void this.openSocket();
    }, delay);
  }

  /** Send a subscription frame. `sub` is opaque — serialized and sent as-is. */
  subscribe(sub: unknown): void {
    this.subscriptions.push(sub);
    if (this.isOpen) this.sendSub(sub);
  }

  /** Send a one-shot frame. It is not remembered or replayed after reconnect. */
  send(frame: unknown): void {
    if (!this.isOpen) {
      throw new SdkError("send() called before WebSocket is open");
    }
    this.sendSub(frame);
  }

  /** Stop replaying a durable subscription. The caller restarts to drop its server-side stream. */
  unsubscribe(sub: unknown): void {
    const index = this.subscriptions.indexOf(sub);
    if (index >= 0) this.subscriptions.splice(index, 1);
  }

  /** Restart the live connection; durable subscriptions replay when the fresh socket opens. */
  reconnect(): void {
    if (this.closedByUser || !this.isOpen) return;
    this.isOpen = false; // reject frames immediately; close may complete asynchronously
    this.socket?.close();
  }

  private sendSub(sub: unknown): void {
    this.socket?.send(JSON.stringify(sub));
  }

  /** Deliberately tear down the connection. Suppresses reconnect; emits 'close'. */
  close(): void {
    this.closedByUser = true;
    this.isOpen = false;
    clearTimeout(this.reconnectTimer); // cancel any reconnect scheduled mid-backoff
    this.resolveConnect?.(); // unblock a connect() still awaiting a first 'open'
    this.socket?.close();
    // Announce teardown now: mid-backoff the socket is already dead and won't fire
    // 'close'. If it is live, its 'close' handler also calls emitClose() — deduped.
    this.emitClose();
  }

  private emitClose(): void {
    if (this.closeEmitted) return;
    this.closeEmitted = true;
    this.emitDiagnosticEvent("info", "ws.close", "control", { reason: "caller" });
    this.emit("close");
  }
}
