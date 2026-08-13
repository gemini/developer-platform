import { TypedEmitter } from "./core/typed-emitter.js";

import type { AuthStrategy } from "./core/http.js";
import { DEFAULT_TIMEOUT_MS, type RequestOptions } from "./core/deadline.js";
import { SdkError, serializeError } from "./errors.js";
import { LiveOrderBook } from "./live-order-book.js";
import { emitDiagnostic, type Logger, NOOP_LOGGER } from "./logging.js";
import type { DiagnosticListener, OperationContext } from "./diagnostics.js";
import type { SocketFactory } from "./transport.js";
import type { LiveOrderBook as LiveOrderBookContract } from "./types/client.js";
import type {
  BalanceUpdate,
  BookTicker,
  ContractStatus,
  DepthResponse,
  DepthUpdate,
  GenericSuccessResponse,
  ListSubscriptionsResponse,
  OrderActionResponse,
  OrderCancelParams,
  OrderPlaceParams,
  OrderUpdate,
  OrderBookSnapshot,
  PositionReport,
  RfqConfirmQuoteParams,
  RfqConfirmQuoteResponse,
  RfqPrivateDelivery,
  RfqPublicEvent,
  RfqSubmitQuoteParams,
  RfqSubmitQuoteResponse,
  RfqWithdrawQuoteParams,
  RfqWithdrawQuoteResponse,
  Trade,
} from "./websocket-types.js";
import { WsSession, type WsSubscription } from "./ws-session.js";

type StreamEvent = "message" | "error" | "close" | "resubscribed" | "subscriptionError";
type StreamListener<T> = ((message: T) => void) | ((err: Error) => void) | (() => void);
type FrameMatcher<T> = (frame: unknown) => frame is T;
type StreamRegistration<T> = {
  event: StreamEvent;
  wrapper: (...args: unknown[]) => void;
  signal?: AbortSignal;
  onAbort?: () => void;
  callback: StreamListener<T>;
};

export type WebSocketStreamState = "active" | "reconnecting" | "failed" | "closed";

export interface WebSocketStream<T> {
  readonly ready: Promise<GenericSuccessResponse>;
  readonly state: WebSocketStreamState;
  readonly lastError?: Error;
  readonly malformedFrameCount: number;
  on(event: "message", cb: (message: T) => void, options?: { signal?: AbortSignal }): this;
  on(event: "error", cb: (err: Error) => void, options?: { signal?: AbortSignal }): this;
  on(event: "close", cb: () => void, options?: { signal?: AbortSignal }): this;
  on(event: "resubscribed", cb: () => void, options?: { signal?: AbortSignal }): this;
  /** Emits the failed subscription in addition to notifying registered error listeners. */
  on(event: "subscriptionError", cb: (err: Error) => void, options?: { signal?: AbortSignal }): this;
  off(event: "message", cb: (message: T) => void): this;
  off(event: "error", cb: (err: Error) => void): this;
  off(event: "close", cb: () => void): this;
  off(event: "resubscribed", cb: () => void): this;
  off(event: "subscriptionError", cb: (err: Error) => void): this;
  close(options?: RequestOptions): Promise<void>;
}

export type DepthIntervalMs = 100;
export type PartialDepthLevel = 5 | 10 | 20;

export interface DepthUpdatesOptions extends RequestOptions {
  intervalMs?: DepthIntervalMs;
}

export interface PartialDepthOptions extends RequestOptions {
  levels: PartialDepthLevel;
  intervalMs?: DepthIntervalMs;
}

export interface DepthSnapshotOptions extends RequestOptions {
  limit?: number;
}

export interface WebSocketScopeOptions extends RequestOptions {
  scope: "account" | "session";
}

export interface WebSocketAccountIntervalOptions extends RequestOptions {
  intervalMs?: 0 | 1000;
}

export type WebSocketOrderPlaceParams = Omit<
  OrderPlaceParams,
  "side" | "type" | "timeInForce" | "eventOutcome"
> & {
  side: "BUY" | "SELL";
  type: "LIMIT" | "MARKET";
  timeInForce: "GTC" | "IOC" | "FOK" | "MOC";
  eventOutcome?: "YES" | "NO";
};

export interface WebSocketCancelAllOptions extends RequestOptions {
  confirm: boolean;
}

export interface GeminiWebSocketOptions {
  url: string;
  snapshotUrl?: string;
  auth?: AuthStrategy;
  logger?: Logger;
  onDiagnostic?: DiagnosticListener;
  socketFactory?: SocketFactory;
  snapshotStream?: boolean;
  /** Deadline for connection, acknowledgements, and unsubscribe completion. */
  timeoutMs?: number;
  /** Optional application-level liveness checks for long-lived sessions. */
  liveness?: { intervalMs?: number; timeoutMs?: number };
  /** Maximum accepted inbound WebSocket message size in UTF-8 bytes. */
  maxMessageSizeBytes?: number;
}

type BookPhase = "awaitingAck" | "awaitingSnapshot" | "live";

interface OrderBookEntry {
  book: LiveOrderBook;
  phase: BookPhase;
  pending: unknown[];
  subscription: WsSubscription;
}

type StreamEmitterEvents = {
  message: (frame: unknown) => void;
  error: (error: unknown) => void;
  close: () => void;
  resubscribed: () => void;
  subscriptionError: (error: unknown) => void;
};

class PublicWebSocketStream<T> implements WebSocketStream<T> {
  readonly ready: Promise<GenericSuccessResponse>;
  private readonly emitter = new TypedEmitter<StreamEmitterEvents>();
  private readonly onMessage: (frame: unknown) => void;
  private readonly onError: (error: unknown) => void;
  private readonly onClose: () => void;
  private readonly onReconnecting: () => void;
  private readonly onReconnected: (event: { id: string | number }) => void;
  private readonly onSubscriptionError: (event: { id: string | number; error: unknown }) => void;
  private readonly registrations = new Map<StreamListener<T>, StreamRegistration<T>[]>();
  private streamState: WebSocketStreamState = "active";
  private streamError?: Error;
  private malformedFrames = 0;
  private closed = false;

  constructor(
    private readonly session: WsSession,
    private readonly subscription: WsSubscription,
    private readonly matcher: FrameMatcher<T>,
    private readonly release: () => void,
    private readonly symbol: string | undefined,
    private readonly onMalformed: (symbol: string, count: number) => void,
  ) {
    this.ready = subscription.ready;
    this.onMessage = (frame) => {
      if (this.closed) return;
      if (this.matcher(frame)) {
        this.emitter.emit("message", frame);
      } else if (this.symbol && lowerSymbol(record(frame) ?? {}) === this.symbol) {
        this.malformedFrames++;
        this.onMalformed(this.symbol, this.malformedFrames);
      }
    };
    this.onError = (error) => {
      if (this.closed) return;
      this.streamError = error instanceof Error ? error : new SdkError("WebSocket stream error");
      this.streamState = "failed";
      if (this.emitter.listenerCount("error") > 0) this.emitter.emit("error", this.streamError);
    };
    this.onClose = () => {
      this.streamState = "closed";
      this.dispose();
    };
    this.onReconnecting = () => {
      if (!this.closed) this.streamState = "reconnecting";
    };
    this.onReconnected = (event) => {
      if (!this.closed && String(event.id) === String(this.subscription.id)) {
        this.streamState = "active";
        this.emitter.emit("resubscribed");
      }
    };
    this.onSubscriptionError = (event) => {
      if (!this.closed && String(event.id) === String(this.subscription.id)) {
        this.onError(event.error);
        this.emitter.emit("subscriptionError", this.streamError);
      }
    };
    session.on("message", this.onMessage);
    session.on("error", this.onError);
    session.on("reconnecting", this.onReconnecting);
    session.on("close", this.onClose);
    session.on("resubscribed", this.onReconnected);
    session.on("subscriptionError", this.onSubscriptionError);
    void this.ready.catch(this.onError);
  }

  get state(): WebSocketStreamState { return this.streamState; }
  get lastError(): Error | undefined { return this.streamError; }
  get malformedFrameCount(): number { return this.malformedFrames; }

  on(event: "message", cb: (message: T) => void, options?: { signal?: AbortSignal }): this;
  on(event: "error", cb: (err: Error) => void, options?: { signal?: AbortSignal }): this;
  on(event: "close", cb: () => void, options?: { signal?: AbortSignal }): this;
  on(event: "resubscribed", cb: () => void, options?: { signal?: AbortSignal }): this;
  on(event: "subscriptionError", cb: (err: Error) => void, options?: { signal?: AbortSignal }): this;
  on(event: StreamEvent, cb: StreamListener<T>, options?: { signal?: AbortSignal }): this {
    if (this.closed || options?.signal?.aborted) return this;
    const wrapper = (...args: unknown[]) => (cb as (...values: unknown[]) => void)(...args);
    this.emitter.on(event, wrapper);
    const registration: StreamRegistration<T> = { event, wrapper, signal: options?.signal, callback: cb };
    if (options?.signal) {
      registration.onAbort = () => this.removeRegistration(cb, registration);
      options.signal.addEventListener("abort", registration.onAbort, { once: true });
    }
    const list = this.registrations.get(cb) ?? [];
    list.push(registration);
    this.registrations.set(cb, list);
    return this;
  }

  off(event: "message", cb: (message: T) => void): this;
  off(event: "error", cb: (err: Error) => void): this;
  off(event: "close", cb: () => void): this;
  off(event: "resubscribed", cb: () => void): this;
  off(event: "subscriptionError", cb: (err: Error) => void): this;
  off(event: StreamEvent, cb: StreamListener<T>): this {
    const registration = this.registrations.get(cb)?.find((candidate) => candidate.event === event);
    if (registration) this.removeRegistration(cb, registration);
    return this;
  }

  async close(options?: RequestOptions): Promise<void> {
    if (this.closed) return;
    this.dispose();
    await this.subscription.close(options);
  }

  dispose(): void {
    if (this.closed) return;
    this.closed = true;
    this.streamState = "closed";
    this.session.off("message", this.onMessage);
    this.session.off("error", this.onError);
    this.session.off("reconnecting", this.onReconnecting);
    this.session.off("close", this.onClose);
    this.session.off("resubscribed", this.onReconnected);
    this.session.off("subscriptionError", this.onSubscriptionError);
    this.release();
    for (const list of this.registrations.values()) {
      for (const registration of list) registration.signal?.removeEventListener("abort", registration.onAbort!);
    }
    this.registrations.clear();
    this.emitter.emit("close");
    this.emitter.removeAllListeners();
  }

  private removeRegistration(cb: StreamListener<T>, registration: StreamRegistration<T>): void {
    this.emitter.off(registration.event, registration.wrapper);
    registration.signal?.removeEventListener("abort", registration.onAbort!);
    const list = this.registrations.get(cb);
    if (!list) return;
    const index = list.indexOf(registration);
    if (index >= 0) list.splice(index, 1);
    if (list.length === 0) this.registrations.delete(cb);
  }
}

export class GeminiWebSocket {
  private readonly url: string;
  private readonly snapshotUrl: string;
  private readonly auth?: AuthStrategy;
  private readonly logger: Logger;
  private readonly onDiagnostic?: DiagnosticListener;
  private readonly socketFactory?: SocketFactory;
  private readonly snapshotStream: boolean;
  private readonly timeoutMs: number;
  private readonly liveness?: { intervalMs?: number; timeoutMs?: number };
  private readonly maxMessageSizeBytes?: number;
  private readonly streams = new Set<PublicWebSocketStream<unknown>>();
  private readonly books = new Map<string, OrderBookEntry>();
  private readonly subIdToBook = new Map<string, string>();
  private session?: WsSession;
  private bookSession?: WsSession;
  private closed = false;
  private bookRoutingAttached = false;
  private restartingBooks = false;
  private readonly routeBookMessage = (frame: unknown) => this.routeOrderBook(frame);
  private readonly prepareBookReconnect = () => {
    this.restartingBooks = true;
    this.prepareBooksForReconnect();
  };
  private readonly finishBookReconnect = () => {
    this.restartingBooks = false;
  };
  private readonly logSessionError = (error: unknown) => this.emitDiagnosticEvent("error", "ws.session.failure", "control", undefined, error);

  readonly rfq = {
    submitQuote: (params: RfqSubmitQuoteParams, options?: RequestOptions): Promise<RfqSubmitQuoteResponse> =>
      this.authenticatedRequest({ method: "rfq.submit_quote", params }, options),
    withdrawQuote: (params: RfqWithdrawQuoteParams, options?: RequestOptions): Promise<RfqWithdrawQuoteResponse> =>
      this.authenticatedRequest({ method: "rfq.withdraw_quote", params }, options),
    confirmQuote: (params: RfqConfirmQuoteParams, options?: RequestOptions): Promise<RfqConfirmQuoteResponse> =>
      this.authenticatedRequest({ method: "rfq.confirm_quote", params }, options),
  };

  constructor(options: GeminiWebSocketOptions) {
    if (!options || typeof options.url !== "string" || options.url.length === 0) {
      throw new SdkError("url is required");
    }
    this.url = options.url;
    this.snapshotUrl = options.snapshotUrl ?? snapshotUrl(options.url);
    this.auth = options.auth;
    this.logger = options.logger ?? NOOP_LOGGER;
    this.onDiagnostic = options.onDiagnostic;
    this.socketFactory = options.socketFactory;
    this.snapshotStream = options.snapshotStream ?? false;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.liveness = options.liveness;
    this.maxMessageSizeBytes = options.maxMessageSizeBytes;
    if (!Number.isFinite(this.timeoutMs) || this.timeoutMs <= 0) {
      throw new SdkError("timeoutMs must be a finite positive number");
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
      metadata,
      operationContext,
      ...(error ? { error: serializeError(error) } : {}),
    }, this.logger, this.onDiagnostic);
  }

  bookTicker(symbol: string, options?: RequestOptions): WebSocketStream<BookTicker> {
    const symbolKey = normalizedSymbol(symbol);
    return this.stream(`${symbolKey}@bookTicker`, isBookTickerFor(symbolKey), options);
  }

  trades(symbol: string, options?: RequestOptions): WebSocketStream<Trade> {
    const symbolKey = normalizedSymbol(symbol);
    return this.stream(`${symbolKey}@trade`, isTradeFor(symbolKey), options);
  }

  depthUpdates(symbol: string, options?: DepthUpdatesOptions): WebSocketStream<DepthUpdate> {
    const symbolKey = normalizedSymbol(symbol);
    return this.stream(`${symbolKey}@depth${intervalSuffix(options?.intervalMs)}`, isDepthUpdateFor(symbolKey), options);
  }

  depth(symbol: string, options: PartialDepthOptions): WebSocketStream<OrderBookSnapshot> {
    const symbolKey = normalizedSymbol(symbol);
    if (!options || ![5, 10, 20].includes(options.levels)) {
      throw new SdkError("depth levels must be 5, 10, or 20");
    }
    return this.isolatedStream(`${symbolKey}@depth${options.levels}${intervalSuffix(options.intervalMs)}`, isDepthSnapshotFor(symbolKey), options);
  }

  contractStatus(options?: RequestOptions): WebSocketStream<ContractStatus> {
    return this.stream("contractStatus", isContractStatus, options);
  }

  rfqs(options?: RequestOptions): WebSocketStream<RfqPublicEvent> {
    return this.stream("requestForQuote", isRfqPublicEvent, options);
  }

  orders(options: WebSocketScopeOptions): WebSocketStream<OrderUpdate> {
    return this.authenticatedStream(`orders@${scope(options)}`, isOrderUpdate, options);
  }

  balances(options?: WebSocketAccountIntervalOptions): WebSocketStream<BalanceUpdate> {
    return this.authenticatedStream(accountIntervalName("balances", options), isBalanceUpdate, options);
  }

  positions(options?: WebSocketAccountIntervalOptions): WebSocketStream<PositionReport> {
    return this.authenticatedStream(accountIntervalName("positions", options), isPositionReport, options);
  }

  rfqDeliveries(options: WebSocketScopeOptions): WebSocketStream<RfqPrivateDelivery> {
    return this.authenticatedStream(`requestForQuote@${scope(options)}`, isRfqPrivateDelivery, options);
  }

  orderBook(symbol: string, options?: RequestOptions): LiveOrderBookContract {
    if (this.closed) throw new SdkError("orderBook() called on a closed GeminiMarkets client");
    const symbolKey = normalizedSymbol(symbol);
    const existing = this.books.get(symbolKey);
    if (existing) return existing.book;

    const session = this.ensureBookSession();
    this.ensureBookRouting(session);

    let bookEntry: OrderBookEntry;
    const book = new LiveOrderBook(symbolKey, {
      logger: this.logger,
      onDiagnostic: this.onDiagnostic,
      onClose: () => this.releaseBook(symbolKey, bookEntry),
    });
    book.on("resync", () => this.restartBooks());

    const subscription = session.subscribe([`${symbolKey}@${this.snapshotStream ? "depth20" : "depth"}`], options);
    bookEntry = { book, phase: "awaitingAck", pending: [], subscription };
    this.books.set(symbolKey, bookEntry);
    this.subIdToBook.set(String(subscription.id), symbolKey);
    void subscription.ready.then(
      () => this.ackBook(subscription.id),
      (error) => this.rejectBook(subscription.id, error),
    );
    return book;
  }

  ping(options?: RequestOptions): Promise<GenericSuccessResponse> {
    return this.request({ method: "ping" }, options);
  }

  time(options?: RequestOptions): Promise<GenericSuccessResponse> {
    return this.request({ method: "time" }, options);
  }

  conninfo(options?: RequestOptions): Promise<GenericSuccessResponse> {
    return this.request({ method: "conninfo" }, options);
  }

  listSubscriptions(options?: RequestOptions): Promise<ListSubscriptionsResponse> {
    return this.request<ListSubscriptionsResponse>({ method: "LIST_SUBSCRIPTIONS" }, options);
  }

  depthSnapshot(symbol: string, options?: DepthSnapshotOptions): Promise<DepthResponse> {
    const symbolKey = normalizedSymbol(symbol);
    return this.request<DepthResponse>({
      method: "depth",
      params: options?.limit === undefined ? { symbol: symbolKey } : { symbol: symbolKey, limit: options.limit },
    }, options);
  }

  placeOrder(params: WebSocketOrderPlaceParams, options?: RequestOptions): Promise<OrderActionResponse> {
    return this.authenticatedRequest({ method: "order.place", params }, options);
  }

  cancelOrder(params: OrderCancelParams, options?: RequestOptions): Promise<OrderActionResponse> {
    return this.authenticatedRequest({ method: "order.cancel", params }, options);
  }

  async cancelAllOrders(options: WebSocketCancelAllOptions): Promise<OrderActionResponse> {
    requireConfirmedCancel(options);
    return this.authenticatedRequest({ method: "order.cancel_all" }, options);
  }

  async cancelSessionOrders(options: WebSocketCancelAllOptions): Promise<OrderActionResponse> {
    requireConfirmedCancel(options);
    return this.authenticatedRequest({ method: "order.cancel_session" }, options);
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    for (const bookEntry of [...this.books.values()]) bookEntry.book.close();
    this.books.clear();
    this.subIdToBook.clear();
    for (const stream of [...this.streams]) stream.dispose();
    this.streams.clear();
    this.session?.close();
    this.bookSession?.close();
  }

  private stream<T>(name: string, matcher: FrameMatcher<T>, options?: RequestOptions): WebSocketStream<T> {
    if (this.closed) throw new SdkError("websocket stream requested on a closed GeminiMarkets client");
    return this.createStream(this.ensureSession(), name, matcher, options);
  }

  private createStream<T>(
    session: WsSession,
    name: string,
    matcher: FrameMatcher<T>,
    options?: RequestOptions,
    closeSessionOnRelease = false,
  ): WebSocketStream<T> {
    const subscription = session.subscribe([name], options);
    let stream: PublicWebSocketStream<T>;
    stream = new PublicWebSocketStream(session, subscription, matcher, () => {
      this.streams.delete(stream as PublicWebSocketStream<unknown>);
      if (closeSessionOnRelease) session.close();
    }, streamSymbol(name), (symbol, count) => {
      this.emitDiagnosticEvent("warn", "ws.stream.malformed_frame", "stream", { symbol, stream: name, count });
    });
    this.streams.add(stream as PublicWebSocketStream<unknown>);
    return stream;
  }

  private authenticatedStream<T>(name: string, matcher: FrameMatcher<T>, options?: RequestOptions): WebSocketStream<T> {
    this.requireAuth();
    return this.stream(name, matcher, options);
  }

  private isolatedStream<T>(name: string, matcher: FrameMatcher<T>, options?: RequestOptions): WebSocketStream<T> {
    if (this.closed) throw new SdkError("websocket stream requested on a closed GeminiMarkets client");
    return this.createStream(this.createSession(this.snapshotUrl), name, matcher, options, true);
  }

  private request<T = GenericSuccessResponse>(frame: { method: string; params?: unknown }, options?: RequestOptions): Promise<T> {
    if (this.closed) throw new SdkError("websocket request made on a closed GeminiMarkets client");
    return this.ensureSession().request<T>(frame, options);
  }

  private async authenticatedRequest<T>(frame: { method: string; params?: unknown }, options?: RequestOptions): Promise<T> {
    this.requireAuth();
    return this.request<T>(frame, options);
  }

  private requireAuth(): void {
    if (!this.auth) throw new SdkError("authenticated WebSocket operation requires auth");
  }

  private ensureSession(): WsSession {
    if (!this.session) {
      this.session = this.createSession(this.url);
    }
    return this.session;
  }

  private ensureBookSession(): WsSession {
    if (!this.bookSession) {
      this.bookSession = this.createSession(this.snapshotUrl);
    }
    return this.bookSession;
  }

  private createSession(url: string): WsSession {
    return new WsSession({
      url,
      auth: this.auth,
      logger: this.logger,
      onDiagnostic: this.onDiagnostic,
      socketFactory: this.socketFactory,
      timeoutMs: this.timeoutMs,
      liveness: this.liveness,
      maxMessageSizeBytes: this.maxMessageSizeBytes,
    });
  }

  private ensureBookRouting(session: WsSession): void {
    if (this.bookRoutingAttached) return;
    this.bookRoutingAttached = true;
    this.attachBookRouting(session);
  }

  private attachBookRouting(session: WsSession): void {
    session.on("message", this.routeBookMessage);
    session.on("reconnecting", this.prepareBookReconnect);
    session.on("open", this.finishBookReconnect);
    session.on("error", this.logSessionError);
  }

  private releaseBook(symbolKey: string, bookEntry: OrderBookEntry): void {
    if (this.closed || this.books.get(symbolKey) !== bookEntry) return;
    this.books.delete(symbolKey);
    this.subIdToBook.delete(String(bookEntry.subscription.id));
    void bookEntry.subscription.close().catch((error) => {
      this.emitDiagnosticEvent("error", "orderbook.unsubscribe.failure", "control", { symbol: symbolKey }, error);
    });
  }

  private prepareBooksForReconnect(): void {
    for (const bookEntry of this.books.values()) {
      if (bookEntry.book.isClosed()) continue;
      bookEntry.phase = "awaitingAck";
      bookEntry.pending = [];
      bookEntry.book.markStale();
    }
  }

  private restartBooks(): void {
    if (this.restartingBooks || !this.bookSession) return;
    this.restartingBooks = true;
    this.prepareBooksForReconnect();
    this.bookSession.reconnect();
  }

  private routeOrderBook(frame: unknown): void {
    if (this.closed) return;
    const message = record(frame);
    if (!message) return;

    if (message.e === "depthUpdate") {
      this.routeDepth(message, frame);
      return;
    }
    const hasSnapshot = this.snapshotStream &&
      (typeof message.lastUpdateId === "number" || typeof message.lastUpdateId === "bigint") &&
      typeof message.symbol === "string" &&
      Array.isArray(message.bids) &&
      Array.isArray(message.asks);
    if (hasSnapshot) {
      const snapshot = {
        e: "depthUpdate",
        E: message.lastUpdateId,
        s: message.symbol,
        U: message.lastUpdateId,
        u: message.lastUpdateId,
        b: message.bids,
        a: message.asks,
      };
      this.routeDepth(snapshot, snapshot);
      return;
    }
    const hasAcknowledgement = typeof message.status === "number" &&
      (typeof message.id === "string" || typeof message.id === "number");
    if (hasAcknowledgement) {
      this.ackOrRejectBook(message as { id: string | number; status: number; error?: unknown });
    }
  }

  private routeDepth(message: { s?: unknown }, frame: unknown): void {
    if (typeof message.s !== "string") {
      this.emitDiagnosticEvent("warn", "orderbook.frame.unroutable", "stream");
      return;
    }
    const symbolKey = message.s.toLowerCase();
    const bookEntry = this.books.get(symbolKey);
    if (!bookEntry) {
      this.emitDiagnosticEvent("warn", "orderbook.frame.unsubscribed", "stream", { symbol: symbolKey });
      return;
    }
    if (bookEntry.phase === "awaitingSnapshot") {
      this.activateBook(bookEntry, frame, []);
    } else if (bookEntry.phase === "live") {
      if (this.snapshotStream) bookEntry.book.applySnapshot(frame);
      else bookEntry.book.ingest(frame);
    } else {
      bookEntry.pending.push(frame);
    }
  }

  private ackOrRejectBook(frame: { id: string | number; status: number; error?: unknown }): void {
    if (frame.error !== undefined || frame.status !== 200) {
      this.rejectBook(frame.id, new SdkError(`subscribe rejected with status ${frame.status}`), frame.status);
      return;
    }
    this.ackBook(frame.id);
  }

  private ackBook(id: string | number): void {
    const key = this.subIdToBook.get(String(id));
    if (key === undefined) return;
    const bookEntry = this.books.get(key);
    if (!bookEntry || bookEntry.book.isClosed() || bookEntry.phase !== "awaitingAck") return;
    if (bookEntry.pending.length === 0) {
      bookEntry.phase = "awaitingSnapshot";
      return;
    }
    const [snapshot, ...diffs] = bookEntry.pending;
    this.activateBook(bookEntry, snapshot, diffs);
  }

  private rejectBook(id: string | number, error: unknown, status?: number): void {
    const key = this.subIdToBook.get(String(id));
    if (key === undefined) return;
    const bookEntry = this.books.get(key);
    if (!bookEntry || bookEntry.book.isClosed()) return;
    this.emitDiagnosticEvent("error", "orderbook.subscribe.failure", "control", { symbol: key, status }, error);
    if (bookEntry.book.listenerCount("error") > 0) {
      bookEntry.book.emit("error", error instanceof Error ? error : new SdkError(`subscribe rejected for ${key}`));
    }
    bookEntry.pending = [];
    this.books.delete(key);
    this.subIdToBook.delete(String(id));
    void bookEntry.subscription.close().catch((unsubscribeError) => {
      this.emitDiagnosticEvent("error", "orderbook.unsubscribe.failure", "control", { symbol: key }, unsubscribeError);
    });
    bookEntry.book.close();
  }

  private activateBook(bookEntry: OrderBookEntry, snapshot: unknown, diffs: unknown[]): void {
    bookEntry.pending = [];
    bookEntry.phase = "live";
    const accepted = bookEntry.book.applySnapshot(snapshot);
    if (bookEntry.phase !== "live") return;
    if (!accepted) {
      bookEntry.phase = "awaitingAck";
      this.restartBooks();
      return;
    }
    for (const diff of diffs) {
      if (this.snapshotStream) bookEntry.book.applySnapshot(diff);
      else bookEntry.book.ingest(diff);
      if (bookEntry.phase !== "live") return;
    }
  }
}

function requireConfirmedCancel(options: WebSocketCancelAllOptions): void {
  if (!options || options.confirm !== true) {
    throw new SdkError("cancel-all WebSocket methods require confirm: true");
  }
}

function normalizedSymbol(symbol: string): string {
  if (typeof symbol !== "string" || symbol.length === 0) {
    throw new SdkError("symbol is required");
  }
  return symbol.toLowerCase();
}

function streamSymbol(name: string): string | undefined {
  const symbol = name.split("@", 1)[0];
  return name.includes("@trade") || name.includes("@bookTicker") || name.includes("@depth")
    ? symbol
    : undefined;
}

function snapshotUrl(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.searchParams.set("snapshot", "-1");
    return parsed.toString();
  } catch {
    throw new SdkError("url must be a valid WebSocket URL");
  }
}

function intervalSuffix(intervalMs: DepthIntervalMs | undefined): string {
  if (intervalMs === undefined) return "";
  if (intervalMs !== 100) throw new SdkError("only 100ms WebSocket depth intervals are supported");
  return "@100ms";
}

function scope(options: WebSocketScopeOptions): "account" | "session" {
  if (options?.scope !== "account" && options?.scope !== "session") {
    throw new SdkError("scope must be account or session");
  }
  return options.scope;
}

function accountIntervalName(base: "balances" | "positions", options?: WebSocketAccountIntervalOptions): string {
  const intervalMs = options?.intervalMs ?? 0;
  if (intervalMs !== 0 && intervalMs !== 1000) {
    throw new SdkError("intervalMs must be 0 or 1000");
  }
  return intervalMs === 1000 ? `${base}@account@1s` : `${base}@account`;
}

function record(frame: unknown): Record<string, unknown> | undefined {
  return frame && typeof frame === "object" ? (frame as Record<string, unknown>) : undefined;
}

function lowerSymbol(frame: Record<string, unknown>): string | undefined {
  return typeof frame.s === "string" ? frame.s.toLowerCase() : undefined;
}

function isBookTickerFor(symbol: string): FrameMatcher<BookTicker> {
  return (frame): frame is BookTicker => {
    const frameRecord = record(frame);
    return !!frameRecord &&
      lowerSymbol(frameRecord) === symbol &&
      typeof frameRecord.u !== "undefined" &&
      typeof frameRecord.b === "string" &&
      typeof frameRecord.B === "string" &&
      typeof frameRecord.a === "string" &&
      typeof frameRecord.A === "string";
  };
}

function isTradeFor(symbol: string): FrameMatcher<Trade> {
  return (frame): frame is Trade => {
    const frameRecord = record(frame);
    return !!frameRecord &&
      lowerSymbol(frameRecord) === symbol &&
      typeof frameRecord.t !== "undefined" &&
      typeof frameRecord.p === "string" &&
      typeof frameRecord.q === "string" &&
      typeof frameRecord.m === "boolean";
  };
}

function isDepthUpdateFor(symbol: string): FrameMatcher<DepthUpdate> {
  return (frame): frame is DepthUpdate => {
    const frameRecord = record(frame);
    return !!frameRecord &&
      frameRecord.e === "depthUpdate" &&
      lowerSymbol(frameRecord) === symbol &&
      Array.isArray(frameRecord.b) &&
      Array.isArray(frameRecord.a);
  };
}

function isDepthSnapshotFor(symbol: string): FrameMatcher<OrderBookSnapshot> {
  return (frame): frame is OrderBookSnapshot => {
    const frameRecord = record(frame);
    if (!frameRecord ||
      typeof frameRecord.lastUpdateId === "undefined" ||
      !Array.isArray(frameRecord.bids) ||
      !Array.isArray(frameRecord.asks)) return false;
    return typeof frameRecord.symbol !== "string" || frameRecord.symbol.toLowerCase() === symbol;
  };
}

function isContractStatus(frame: unknown): frame is ContractStatus {
  const message = record(frame);
  return !!message && message.e === "contractStatus";
}

function isRfqPublicEvent(frame: unknown): frame is RfqPublicEvent {
  const message = record(frame);
  return !!message && message.e === "requestForQuote" && Array.isArray(message.l);
}

function isOrderUpdate(frame: unknown): frame is OrderUpdate {
  const message = record(frame);
  return !!message && message.e === "orderUpdate";
}

function isBalanceUpdate(frame: unknown): frame is BalanceUpdate {
  const message = record(frame);
  return !!message && message.e === "balanceUpdate" && Array.isArray(message.B);
}

function isPositionReport(frame: unknown): frame is PositionReport {
  const message = record(frame);
  return !!message && message.e === "positionReport" && Array.isArray(message.P);
}

function isRfqPrivateDelivery(frame: unknown): frame is RfqPrivateDelivery {
  const message = record(frame);
  return !!message && message.e === "requestForQuote" && typeof message.i === "string";
}
