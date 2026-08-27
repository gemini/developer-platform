import { DEFAULT_TIMEOUT_MS, type RequestOptions } from "../utils/deadline.js";
import { SdkError, serializeError } from "../errors.js";
import { OrderBook } from "../services/market-data/orderbook.js";
import { emitDiagnostic, type Logger, NOOP_LOGGER } from "../observability/logging.js";
import { sanitizeDiagnosticUrl, type DiagnosticEvent, type DiagnosticListener, type OperationContext } from "../observability/diagnostics.js";
import { WebSocketSession, type SocketFactory, type WebSocketReconnectOptions, type WsSubscription } from "./session.js";
import { isPlainDecimal } from "../utils/decimal.js";
import {
  isBoundaryBoolean,
  isBoundaryNumber,
  isBoundaryString,
  type BoundaryRecord,
  type BoundaryValue,
} from "../utils/boundary-value.js";
import {
  isNonEmptyString,
  isOneOf,
  isOptionalDecimal,
  isOptionalNonEmptyString,
  isOptionalUpdateId,
  isRfqLeg,
  isUpdateId,
  record,
} from "./validation.js";
import type { LiveOrderBook as LiveOrderBookContract } from "../types/client.js";
import type {
  BookTicker,
  ContractStatus,
  DepthResponse,
  DepthUpdate,
  GenericSuccessResponse,
  ListSubscriptionsResponse,
  OrderBookSnapshot,
  RfqPublicEvent,
  Trade,
  WebSocketJsonObject,
} from "./types.js";

export {
  type WebSocketOverflowStrategy,
  type WebSocketStream,
  type WebSocketStreamOptions,
  type WebSocketStreamState,
} from "./stream.js";
import {
  WebSocketStreamImpl,
  estimateFrameBytes,
  validateWebSocketStreamOptions,
  type FrameMatcher,
  type WebSocketStream,
  type WebSocketStreamOptions,
} from "./stream.js";

export type DepthIntervalMs = 100;
export type PartialDepthLevel = 5 | 10 | 20;

export interface DepthUpdatesOptions extends WebSocketStreamOptions {
  intervalMs?: DepthIntervalMs;
}

export interface PartialDepthOptions extends WebSocketStreamOptions {
  levels: PartialDepthLevel;
  intervalMs?: DepthIntervalMs;
}

export interface DepthSnapshotOptions extends RequestOptions {
  limit?: number;
}

export interface PublicGeminiWebSocketOptions {
  url: string;
  snapshotUrl?: string;
  logger?: Logger;
  onDiagnostic?: DiagnosticListener;
  socketFactory?: SocketFactory;
  snapshotStream?: boolean;
  /** Deadline for connection, acknowledgement, and unsubscribe completion. */
  timeoutMs?: number;
  /** Optional application-level liveness checks for long sessions. */
  liveness?: { intervalMs?: number; timeoutMs?: number };
  /** Maximum inbound WebSocket message size in UTF-8 bytes. */
  maxMessageSizeBytes?: number;
  /** Exponential reconnect backoff. Defaults to 250 ms base, 30 s cap, factor 2. */
  backoff?: { baseMs?: number; capMs?: number; factor?: number };
  /** Automatic reconnect policy. Defaults to ten attempts and a 30-second stable reset. */
  reconnect?: WebSocketReconnectOptions;
  /** Node transport handshake timeout, forwarded through the socket factory. */
  handshakeTimeoutMs?: number;
  /** Whether the runtime transport should negotiate per-message compression. Default: false. */
  perMessageDeflate?: boolean;
}

type BookPhase = "awaitingAck" | "awaitingSnapshot" | "live";

interface OrderBookEntry {
  symbol: string;
  book: OrderBook;
  phase: BookPhase;
  pending: BoundaryValue[];
  pendingBytes: number;
  subscription: WsSubscription;
  session: WebSocketSession;
  malformedResyncs: number;
}

type MalformedFrameMetadata = {
  stream: string;
  count: number;
  symbol?: string;
};

const MAX_PENDING_ORDER_BOOK_FRAMES = 256;
const MAX_PENDING_ORDER_BOOK_BYTES = 4 * 1024 * 1024;
const MAX_MALFORMED_BOOK_RESYNCS = 8;
const BOOK_RESYNC_BACKOFF_BASE_MS = 250;
const BOOK_RESYNC_BACKOFF_CAP_MS = 30_000;

function isOrderBookSnapshot(frame: BoundaryValue): frame is DepthUpdate {
  const message = record(frame);
  if (!isValidDepthUpdateFrame(message)) return false;
  return BigInt(message.U) <= BigInt(message.u);
}

export class PublicGeminiWebSocket {
  protected readonly url: string;
  private readonly snapshotUrl: string;
  protected readonly logger: Logger;
  protected readonly onDiagnostic?: DiagnosticListener;
  protected readonly socketFactory?: SocketFactory;
  protected readonly snapshotStream: boolean;
  protected readonly timeoutMs: number;
  protected readonly liveness?: { intervalMs?: number; timeoutMs?: number };
  protected readonly maxMessageSizeBytes?: number;
  protected readonly backoff?: { baseMs?: number; capMs?: number; factor?: number };
  protected readonly reconnect?: WebSocketReconnectOptions;
  protected readonly handshakeTimeoutMs?: number;
  protected readonly perMessageDeflate?: boolean;
  protected readonly streams = new Set<{ dispose(): void }>();
  private readonly books = new Map<string, OrderBookEntry>();
  private readonly subIdToBook = new Map<string, string>();
  private publicSession?: WebSocketSession;
  private bookSession?: WebSocketSession;
  protected closed = false;
  private bookRoutingAttached = false;
  private restartingBooks = false;
  private preparingBooksForReconnect = false;
  private resyncAfterRecovery = false;
  private malformedBookResyncs = 0;
  private readonly routeBookMessage = (frame: BoundaryValue) => this.routeOrderBook(frame);
  private readonly prepareBookReconnect = () => {
    this.restartingBooks = true;
    this.prepareBooksForReconnect();
  };
  private readonly logSessionError = (error: BoundaryValue) => this.emitDiagnosticEvent("error", "ws.session.failure", "control", undefined, error);

  constructor(options: PublicGeminiWebSocketOptions) {
    if (!options || options.url.length === 0) {
      throw new SdkError("url is required");
    }
    this.url = options.url;
    this.snapshotUrl = options.snapshotUrl ?? snapshotUrl(options.url);
    this.logger = options.logger ?? NOOP_LOGGER;
    this.onDiagnostic = options.onDiagnostic;
    this.socketFactory = options.socketFactory;
    this.snapshotStream = options.snapshotStream ?? false;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.liveness = options.liveness;
    this.maxMessageSizeBytes = options.maxMessageSizeBytes;
    this.backoff = options.backoff;
    this.reconnect = options.reconnect;
    this.handshakeTimeoutMs = options.handshakeTimeoutMs;
    this.perMessageDeflate = options.perMessageDeflate;
    if (!Number.isFinite(this.timeoutMs) || this.timeoutMs <= 0) {
      throw new SdkError("timeoutMs must be a finite positive number");
    }
  }

  protected emitDiagnosticEvent(
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
      metadata: { ...metadata, url: sanitizeDiagnosticUrl(this.url) },
      operationContext,
    };
    if (cause) event.error = serializeError(cause);
    emitDiagnostic(event, this.logger, this.onDiagnostic);
  }

  bookTicker(symbol: string, options?: WebSocketStreamOptions): WebSocketStream<BookTicker> {
    const symbolKey = normalizedSymbol(symbol);
    return this.stream(`${symbolKey}@bookTicker`, isBookTickerFor(symbolKey), options);
  }

  trades(symbol: string, options?: WebSocketStreamOptions): WebSocketStream<Trade> {
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

  contractStatus(options?: WebSocketStreamOptions): WebSocketStream<ContractStatus> {
    return this.stream("contractStatus", isContractStatus, options);
  }

  rfqs(options?: WebSocketStreamOptions): WebSocketStream<RfqPublicEvent> {
    return this.stream("requestForQuote", isRfqPublicEvent, options);
  }

  orderBook(symbol: string, options?: RequestOptions): LiveOrderBookContract {
    if (this.closed) throw new SdkError("orderBook() called on a closed GeminiMarkets client");
    const symbolKey = normalizedSymbol(symbol);
    const existing = this.books.get(symbolKey);
    if (existing) return existing.book;

    const session = this.snapshotStream ? this.createSession(this.snapshotUrl) : this.ensureBookSession();
    if (!this.snapshotStream) this.ensureBookRouting(session);
    const subscription = session.subscribe([`${symbolKey}@${this.snapshotStream ? "depth20" : "depth"}`], options);
    const book = new OrderBook(symbolKey, {
      logger: this.logger,
      onDiagnostic: this.onDiagnostic,
      correlationId: subscription.correlationId,
      onClose: () => {
        const entry = this.books.get(symbolKey);
        if (entry) this.releaseBook(symbolKey, entry);
      },
    });
    book.on("resync", () => {
      if (!this.preparingBooksForReconnect) this.requestBookResync(symbolKey);
    });

    const bookEntry: OrderBookEntry = {
      symbol: symbolKey,
      book,
      phase: "awaitingAck",
      pending: [],
      pendingBytes: 0,
      subscription,
      session,
      malformedResyncs: 0,
    };
    this.books.set(symbolKey, bookEntry);
    if (!this.snapshotStream) this.subIdToBook.set(String(subscription.id), symbolKey);
    if (this.snapshotStream) this.attachIsolatedBookRouting(session, bookEntry);
    void subscription.ready.then(
      () => this.ackBookEntry(bookEntry),
      (error) => this.rejectBookEntry(bookEntry, error),
    );
    return book;
  }

  ping(options?: RequestOptions): Promise<GenericSuccessResponse> {
    return this.request({ method: "ping" }, options);
  }

  time(options?: RequestOptions): Promise<GenericSuccessResponse> {
    return this.request({ method: "time" }, options);
  }

  conninfo(options?: RequestOptions): Promise<WebSocketJsonObject> {
    return this.request<WebSocketJsonObject>({ method: "conninfo" }, options);
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

  close(): void {
    if (this.closed) return;
    this.closed = true;
    const bookSessions = new Set<WebSocketSession>();
    for (const bookEntry of this.books.values()) {
      bookSessions.add(bookEntry.session);
      bookEntry.book.close();
    }
    this.books.clear();
    this.subIdToBook.clear();
    for (const stream of this.streams) stream.dispose();
    this.streams.clear();
    this.publicSession?.close();
    for (const session of bookSessions) session.close();
    this.bookSession?.close();
  }

  private stream<T extends BoundaryValue>(name: string, matcher: FrameMatcher<T>, options?: WebSocketStreamOptions): WebSocketStream<T> {
    if (this.closed) throw new SdkError("websocket stream requested on a closed GeminiMarkets client");
    return this.createStream(this.ensurePublicSession(), name, matcher, options);
  }

  protected createStream<T extends BoundaryValue>(
    session: WebSocketSession,
    name: string,
    matcher: FrameMatcher<T>,
    options?: WebSocketStreamOptions,
    closeSessionOnRelease = false,
  ): WebSocketStream<T> {
    validateWebSocketStreamOptions(options);
    const subscription = session.subscribe([name], options);
    const stream: WebSocketStreamImpl<T> = new WebSocketStreamImpl(session, subscription, matcher, (frame) => this.isCandidateFrameForStream(name, frame), () => {
      this.streams.delete(stream);
      if (closeSessionOnRelease) session.close();
    }, streamSymbol(name), (count) => {
      const symbol = streamSymbol(name);
      const metadata: MalformedFrameMetadata = { stream: name, count };
      if (symbol) metadata.symbol = symbol;
      this.emitDiagnosticEvent("warn", "ws.stream.malformed_frame", "stream", metadata, undefined, undefined, stream.correlationId);
    }, (metadata) => {
      this.emitDiagnosticEvent("warn", "ws.stream.buffer_overflow", "stream", {
        ...metadata,
        stream: name,
      }, undefined, undefined, stream.correlationId);
    }, options);
    this.streams.add(stream);
    return stream;
  }

  private isolatedStream<T extends BoundaryValue>(name: string, matcher: FrameMatcher<T>, options?: WebSocketStreamOptions): WebSocketStream<T> {
    if (this.closed) throw new SdkError("websocket stream requested on a closed GeminiMarkets client");
    return this.createStream(this.createSession(this.snapshotUrl), name, matcher, options, true);
  }

  protected request<T extends BoundaryValue = GenericSuccessResponse>(frame: { method: string; params?: BoundaryValue }, options?: RequestOptions): Promise<T> {
    if (this.closed) throw new SdkError("websocket request made on a closed GeminiMarkets client");
    return this.ensurePublicSession().request<T>(frame, options);
  }

  protected ensurePublicSession(): WebSocketSession {
    if (!this.publicSession) {
      this.publicSession = this.createSession(this.url);
    }
    return this.publicSession;
  }

  private ensureBookSession(): WebSocketSession {
    if (!this.bookSession) {
      this.bookSession = this.createSession(this.snapshotUrl);
    }
    return this.bookSession;
  }

  protected createSession(url: string, headersFactory?: (options?: RequestOptions) => Promise<Record<string, string> | undefined>): WebSocketSession {
    return new WebSocketSession({
      url,
      headersFactory,
      logger: this.logger,
      onDiagnostic: this.onDiagnostic,
      socketFactory: this.socketFactory,
      timeoutMs: this.timeoutMs,
      liveness: this.liveness,
      maxMessageSizeBytes: this.maxMessageSizeBytes,
      backoff: this.backoff,
      reconnect: this.reconnect,
      handshakeTimeoutMs: this.handshakeTimeoutMs,
      perMessageDeflate: this.perMessageDeflate,
    });
  }

  protected isCandidateFrameForStream(name: string, frame: BoundaryValue): boolean {
    return isCandidateFrameForStream(name, frame);
  }

  private ensureBookRouting(session: WebSocketSession): void {
    if (this.bookRoutingAttached) return;
    this.bookRoutingAttached = true;
    this.attachBookRouting(session);
  }

  private attachBookRouting(session: WebSocketSession): void {
    session.on("message", this.routeBookMessage);
    session.on("subscriptionReady", ({ id }) => this.ackBook(id));
    session.on("resubscribed", ({ id }) => this.ackBook(id));
    session.on("subscriptionError", ({ id, error }) => this.rejectBook(id, error));
    session.on("reconnecting", this.prepareBookReconnect);
    session.on("error", this.logSessionError);
  }

  private attachIsolatedBookRouting(session: WebSocketSession, bookEntry: OrderBookEntry): void {
    const isActive = () => this.books.get(bookEntry.symbol) === bookEntry && !bookEntry.book.isClosed();
    session.on("message", (frame) => {
      if (isActive()) this.routeOrderBook(frame, bookEntry);
    });
    session.on("subscriptionReady", ({ id }) => {
      if (isActive() && String(id) === String(bookEntry.subscription.id)) this.ackBookEntry(bookEntry);
    });
    session.on("resubscribed", ({ id }) => {
      if (isActive() && String(id) === String(bookEntry.subscription.id)) this.ackBookEntry(bookEntry);
    });
    session.on("subscriptionError", ({ id, error }) => {
      if (isActive() && String(id) === String(bookEntry.subscription.id)) this.rejectBookEntry(bookEntry, error);
    });
    session.on("reconnecting", () => {
      if (isActive()) this.prepareBookForReconnect(bookEntry);
    });
    session.on("error", this.logSessionError);
  }

  private releaseBook(symbolKey: string, bookEntry: OrderBookEntry): void {
    if (this.closed || this.books.get(symbolKey) !== bookEntry) return;
    this.books.delete(symbolKey);
    if (this.subIdToBook.get(String(bookEntry.subscription.id)) === symbolKey) {
      this.subIdToBook.delete(String(bookEntry.subscription.id));
    }
    this.finishBookReconnectIfReady();
    if (bookEntry.session !== this.bookSession) {
      bookEntry.session.close();
      return;
    }
    void bookEntry.subscription.close().catch((error) => {
      this.emitDiagnosticEvent("error", "orderbook.unsubscribe.failure", "control", { symbol: symbolKey }, error, undefined, bookEntry.subscription.correlationId);
    });
  }

  private prepareBooksForReconnect(): void {
    this.preparingBooksForReconnect = true;
    try {
      for (const bookEntry of this.books.values()) {
        this.prepareBookForReconnect(bookEntry);
      }
    } finally {
      this.preparingBooksForReconnect = false;
    }
  }

  private prepareBookForReconnect(bookEntry: OrderBookEntry): void {
    if (bookEntry.book.isClosed()) return;
    bookEntry.phase = "awaitingAck";
    bookEntry.pending = [];
    bookEntry.pendingBytes = 0;
    bookEntry.book.markStale();
  }

  private restartBooks(force = false): void {
    if (!this.bookSession) return;
    if (this.restartingBooks && !force) {
      this.resyncAfterRecovery = true;
      return;
    }
    if (force && this.malformedBookResyncs >= MAX_MALFORMED_BOOK_RESYNCS) {
      this.rejectAwaitingBooks(new SdkError("order-book recovery stopped after repeated malformed snapshots"));
      return;
    }
    this.restartingBooks = true;
    this.prepareBooksForReconnect();
    if (this.books.size === 0) {
      this.restartingBooks = false;
      return;
    }
    this.bookSession.reconnect(force ? this.nextMalformedBookResyncDelay() : undefined);
  }

  private finishBookReconnectIfReady(): void {
    if (!this.restartingBooks) return;
    for (const bookEntry of this.books.values()) {
      if (!bookEntry.book.isClosed() && bookEntry.phase !== "live") return;
    }
    this.restartingBooks = false;
    this.malformedBookResyncs = 0;
    if (this.resyncAfterRecovery) {
      this.resyncAfterRecovery = false;
      this.restartBooks();
    }
  }

  private requestBookResync(symbolKey?: string): void {
    if (this.snapshotStream && symbolKey !== undefined) {
      const bookEntry = this.books.get(symbolKey);
      if (bookEntry) {
        this.restartBook(bookEntry);
        return;
      }
    }
    this.restartBooks();
  }

  private restartBook(bookEntry: OrderBookEntry, force = false): void {
    if (bookEntry.book.isClosed()) return;
    if (force && bookEntry.malformedResyncs >= MAX_MALFORMED_BOOK_RESYNCS) {
      this.rejectBookEntry(bookEntry, new SdkError("order-book recovery stopped after repeated malformed snapshots"));
      return;
    }
    this.prepareBookForReconnect(bookEntry);
    bookEntry.session.reconnect(force ? this.nextBookMalformedResyncDelay(bookEntry) : undefined);
  }

  private routeOrderBook(frame: BoundaryValue, fallbackBookEntry?: OrderBookEntry): void {
    if (this.closed) return;
    const message = record(frame);
    if (!message) return;

    if (message.e === "depthUpdate") {
      if (!isValidDepthUpdateFrame(message)) {
        this.handleMalformedBookFrame(message, fallbackBookEntry);
        this.emitDiagnosticEvent("warn", "orderbook.frame.malformed", "stream");
        return;
      }
      this.routeDepth(message, frame, fallbackBookEntry);
      return;
    }
    const hasSnapshot = this.snapshotStream &&
      isUpdateId(message.lastUpdateId) &&
      Array.isArray(message.bids) &&
      Array.isArray(message.asks);
    if (hasSnapshot) {
      const symbol = isNonEmptyString(message.symbol)
        ? message.symbol
        : fallbackBookEntry?.symbol;
      const snapshot = {
        e: "depthUpdate",
        E: message.lastUpdateId,
        s: symbol,
        U: message.lastUpdateId,
        u: message.lastUpdateId,
        b: message.bids,
        a: message.asks,
      };
      if (!isValidDepthUpdateFrame(snapshot)) {
        this.handleMalformedBookFrame(snapshot, fallbackBookEntry);
        this.emitDiagnosticEvent("warn", "orderbook.frame.malformed", "stream");
        return;
      }
      this.routeDepth(snapshot, snapshot, fallbackBookEntry);
      return;
    }
    if (isBoundaryNumber(message.status) &&
      (isBoundaryString(message.id) || isBoundaryNumber(message.id))) {
      this.ackOrRejectBook({ id: message.id, status: message.status, error: message.error });
    }
  }

  private routeDepth(message: { s?: BoundaryValue }, frame: BoundaryValue, fallbackBookEntry?: OrderBookEntry): void {
    const symbolKey = isNonEmptyString(message.s) ? message.s.toLowerCase() : fallbackBookEntry?.symbol;
    if (symbolKey === undefined) {
      this.emitDiagnosticEvent("warn", "orderbook.frame.unroutable", "stream");
      return;
    }
    const bookEntry = this.books.get(symbolKey);
    if (!bookEntry) {
      this.emitDiagnosticEvent("warn", "orderbook.frame.unsubscribed", "stream", { symbol: symbolKey });
      return;
    }
    if (bookEntry.phase === "awaitingSnapshot") {
      if (!this.queuePendingBookFrame(bookEntry, frame)) return;
      this.activatePendingBook(bookEntry);
    } else if (bookEntry.phase === "live") {
      if (this.snapshotStream) bookEntry.book.applySnapshot(frame);
      else bookEntry.book.ingest(frame);
    } else {
      this.queuePendingBookFrame(bookEntry, frame);
    }
  }

  private restartMalformedInitialBookSnapshot(message: Record<string, BoundaryValue>, fallbackBookEntry?: OrderBookEntry): void {
    if (!isNonEmptyString(message.s)) {
      if (fallbackBookEntry) this.restartBook(fallbackBookEntry, true);
      else if (this.hasAwaitingBookSnapshot()) this.restartBooks(true);
      return;
    }
    const bookEntry = this.books.get(message.s.toLowerCase());
    if (!bookEntry || (bookEntry.phase !== "awaitingAck" && bookEntry.phase !== "awaitingSnapshot")) return;
    // The first depth frame is the book baseline. Fence this generation so a
    // later ordinary diff cannot be promoted as a replacement snapshot.
    if (this.snapshotStream) this.restartBook(bookEntry, true);
    else this.restartBooks(true);
  }

  private handleMalformedBookFrame(message: Record<string, BoundaryValue>, fallbackBookEntry?: OrderBookEntry): void {
    if (isNonEmptyString(message.s)) {
      const bookEntry = this.books.get(message.s.toLowerCase());
      if (bookEntry?.phase === "live") {
        // A malformed frame may represent an unseen sequence range. Keep the
        // book unreadable until a fresh snapshot rebuilds it.
        bookEntry.book.markStale();
        return;
      }
    }
    this.restartMalformedInitialBookSnapshot(message, fallbackBookEntry);
  }

  private hasAwaitingBookSnapshot(): boolean {
    for (const bookEntry of this.books.values()) {
      if (!bookEntry.book.isClosed() &&
        (bookEntry.phase === "awaitingAck" || bookEntry.phase === "awaitingSnapshot")) return true;
    }
    return false;
  }

  private nextMalformedBookResyncDelay(): number {
    const attempt = this.malformedBookResyncs++;
    if (attempt === 0) return 0;
    return Math.min(
      BOOK_RESYNC_BACKOFF_CAP_MS,
      BOOK_RESYNC_BACKOFF_BASE_MS * 2 ** (attempt - 1),
    );
  }

  private rejectAwaitingBooks(error: Error): void {
    for (const bookEntry of Array.from(this.books.values())) {
      if (bookEntry.phase === "awaitingAck" || bookEntry.phase === "awaitingSnapshot") {
        this.rejectBookEntry(bookEntry, error);
      }
    }
    this.restartingBooks = false;
  }

  private queuePendingBookFrame(bookEntry: OrderBookEntry, frame: BoundaryValue): boolean {
    const frameBytes = estimateFrameBytes(frame);
    if (bookEntry.pending.length >= MAX_PENDING_ORDER_BOOK_FRAMES ||
      bookEntry.pendingBytes + frameBytes > MAX_PENDING_ORDER_BOOK_BYTES) {
      this.rejectBookEntry(
        bookEntry,
        new SdkError(`order-book snapshot buffer exceeded ${MAX_PENDING_ORDER_BOOK_FRAMES} frames or ${MAX_PENDING_ORDER_BOOK_BYTES} bytes`),
      );
      return false;
    }
    bookEntry.pending.push(frame);
    bookEntry.pendingBytes += frameBytes;
    return true;
  }

  private ackOrRejectBook(frame: { id: string | number; status: number; error?: BoundaryValue }): void {
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
    if (bookEntry) this.ackBookEntry(bookEntry);
  }

  private ackBookEntry(bookEntry: OrderBookEntry): void {
    if (bookEntry.book.isClosed() || bookEntry.phase !== "awaitingAck") return;
    // The session fences superseded sockets.
    // Frames received before this acknowledgement belong to the current subscription.
    // The exchange can send the first full snapshot before the control ACK.
    // Keep those frames so the book does not start from a later diff.
    bookEntry.phase = "awaitingSnapshot";
    this.activatePendingBook(bookEntry);
    this.finishBookReconnectIfReady();
  }

  private activatePendingBook(bookEntry: OrderBookEntry): void {
    const snapshotIndex = bookEntry.pending.findIndex(isOrderBookSnapshot);
    if (snapshotIndex < 0) return;
    const snapshot = bookEntry.pending[snapshotIndex];
    const diffs = bookEntry.pending.slice(snapshotIndex + 1);
    bookEntry.pending = [];
    bookEntry.pendingBytes = 0;
    this.activateBook(bookEntry, snapshot, diffs);
  }

  private rejectBook(id: string | number, error: BoundaryValue, status?: number): void {
    const key = this.subIdToBook.get(String(id));
    if (key === undefined) return;
    const bookEntry = this.books.get(key);
    if (bookEntry) this.rejectBookEntry(bookEntry, error, status);
  }

  private rejectBookEntry(bookEntry: OrderBookEntry, error: BoundaryValue, status?: number): void {
    if (bookEntry.book.isClosed()) return;
    this.emitDiagnosticEvent("error", "orderbook.subscribe.failure", "control", { symbol: bookEntry.symbol, status }, error, undefined, bookEntry.subscription.correlationId);
    if (bookEntry.book.listenerCount("error") > 0) {
      bookEntry.book.emit("error", error instanceof Error ? error : new SdkError(`subscribe rejected for ${bookEntry.symbol}`));
    }
    bookEntry.pending = [];
    bookEntry.pendingBytes = 0;
    this.books.delete(bookEntry.symbol);
    if (this.subIdToBook.get(String(bookEntry.subscription.id)) === bookEntry.symbol) {
      this.subIdToBook.delete(String(bookEntry.subscription.id));
    }
    this.finishBookReconnectIfReady();
    if (bookEntry.session !== this.bookSession) {
      bookEntry.session.close();
      bookEntry.book.close();
      return;
    }
    void bookEntry.subscription.close().catch((unsubscribeError) => {
      this.emitDiagnosticEvent("error", "orderbook.unsubscribe.failure", "control", { symbol: bookEntry.symbol }, unsubscribeError, undefined, bookEntry.subscription.correlationId);
    });
    bookEntry.book.close();
  }

  private activateBook(bookEntry: OrderBookEntry, snapshot: BoundaryValue, diffs: BoundaryValue[]): void {
    bookEntry.pending = [];
    bookEntry.pendingBytes = 0;
    bookEntry.phase = "live";
    const accepted = bookEntry.book.applySnapshot(snapshot);
    if (bookEntry.phase !== "live") return;
    if (!accepted) {
      bookEntry.phase = "awaitingAck";
      if (this.snapshotStream) this.restartBook(bookEntry, true);
      else this.restartBooks(true);
      return;
    }
    for (const diff of diffs) {
      if (this.snapshotStream) bookEntry.book.applySnapshot(diff);
      else bookEntry.book.ingest(diff);
      if (bookEntry.phase !== "live") return;
    }
    bookEntry.malformedResyncs = 0;
    this.finishBookReconnectIfReady();
  }

  private nextBookMalformedResyncDelay(bookEntry: OrderBookEntry): number {
    const attempt = bookEntry.malformedResyncs++;
    if (attempt === 0) return 0;
    return Math.min(
      BOOK_RESYNC_BACKOFF_CAP_MS,
      BOOK_RESYNC_BACKOFF_BASE_MS * 2 ** (attempt - 1),
    );
  }
}

function normalizedSymbol(symbol: string): string {
  if (!isBoundaryString(symbol) || symbol.length === 0) {
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

function isDepthLevel(value: BoundaryValue): value is string[] {
  return Array.isArray(value) && value.length === 2 && value.every(isPlainDecimal);
}

function isValidDepthUpdateFrame(message: Record<string, BoundaryValue> | undefined): message is Record<string, BoundaryValue> & {
  e: "depthUpdate";
  E: number | bigint;
  s: string;
  U: number | bigint;
  u: number | bigint;
  b: string[][];
  a: string[][];
} {
  return !!message && message.e === "depthUpdate" && isUpdateId(message.E) &&
    isNonEmptyString(message.s) && isUpdateId(message.U) && isUpdateId(message.u) &&
    Array.isArray(message.b) && message.b.every(isDepthLevel) &&
    Array.isArray(message.a) && message.a.every(isDepthLevel);
}

function isMatchingSymbol(frameSymbol: BoundaryValue, targetSymbolLower: string): boolean {
  if (!isBoundaryString(frameSymbol)) return false;
  const len = frameSymbol.length;
  if (len !== targetSymbolLower.length) return false;
  for (let i = 0; i < len; i++) {
    let code = frameSymbol.charCodeAt(i);
    if (code >= 65 && code <= 90) code += 32;
    if (code !== targetSymbolLower.charCodeAt(i)) return false;
  }
  return true;
}

function isCandidateFrameForStream(name: string, frame: BoundaryValue): boolean {
  const message = record(frame);
  if (!message) return false;
  const symbol = streamSymbol(name);
  if (symbol) {
    if (!isMatchingSymbol(message.s, symbol)) return false;
    if (name.includes("@trade")) {
      return Object.hasOwn(message, "t") || Object.hasOwn(message, "p") ||
        Object.hasOwn(message, "q") || Object.hasOwn(message, "m");
    }
    if (name.includes("@bookTicker")) {
      return message.e !== "depthUpdate" && !Object.hasOwn(message, "U") &&
        (Object.hasOwn(message, "u") || Object.hasOwn(message, "b") ||
          Object.hasOwn(message, "B") || Object.hasOwn(message, "a") || Object.hasOwn(message, "A"));
    }
    if (name.includes("@depth")) {
      return message.e === "depthUpdate" || Object.hasOwn(message, "U") ||
        (Object.hasOwn(message, "b") && Object.hasOwn(message, "a") &&
          !Object.hasOwn(message, "B") && !Object.hasOwn(message, "A"));
    }
    return false;
  }
  if (name === "contractStatus") return message.e === "contractStatus";
  return name === "requestForQuote" &&
    message.e === "requestForQuote" && (Object.hasOwn(message, "l") || !Object.hasOwn(message, "i"));
}

function isBookTickerFor(symbol: string): FrameMatcher<BookTicker> {
  return (frame): frame is BookTicker => {
    const frameRecord = record(frame);
    return !!frameRecord &&
      isMatchingSymbol(frameRecord.s, symbol) &&
      isUpdateId(frameRecord.u) &&
      isUpdateId(frameRecord.E) &&
      isPlainDecimal(frameRecord.b) &&
      isPlainDecimal(frameRecord.B) &&
      isPlainDecimal(frameRecord.a) &&
      isPlainDecimal(frameRecord.A) &&
      isOptionalDecimal(frameRecord.c) &&
      isOptionalDecimal(frameRecord.C);
  };
}

function isTradeFor(symbol: string): FrameMatcher<Trade> {
  return (frame): frame is Trade => {
    const frameRecord = record(frame);
    return !!frameRecord &&
      isMatchingSymbol(frameRecord.s, symbol) &&
      isUpdateId(frameRecord.E) &&
      isUpdateId(frameRecord.t) &&
      isPlainDecimal(frameRecord.p) &&
      isPlainDecimal(frameRecord.q) &&
      isBoundaryBoolean(frameRecord.m);
  };
}

function isDepthUpdateFor(symbol: string): FrameMatcher<DepthUpdate> {
  return (frame): frame is DepthUpdate => {
    const frameRecord = record(frame);
    return isValidDepthUpdateFrame(frameRecord) && isMatchingSymbol(frameRecord.s, symbol);
  };
}

function isDepthSnapshotFor(symbol: string): FrameMatcher<OrderBookSnapshot> {
  return (frame): frame is OrderBookSnapshot => {
    const frameRecord = record(frame);
    if (!frameRecord ||
      !isUpdateId(frameRecord.lastUpdateId) ||
      !Array.isArray(frameRecord.bids) ||
      !frameRecord.bids.every(isDepthLevel) ||
      !Array.isArray(frameRecord.asks) ||
      !frameRecord.asks.every(isDepthLevel)) return false;
    return !isBoundaryString(frameRecord.symbol) || isMatchingSymbol(frameRecord.symbol, symbol);
  };
}

function isContractStatus(frame: BoundaryValue): frame is ContractStatus {
  const message = record(frame);
  return !!message && message.e === "contractStatus" && isUpdateId(message.E) &&
    isNonEmptyString(message.s) && isNonEmptyString(message.k) &&
    isNonEmptyString(message.c) && isUpdateId(message.i) &&
    isOptionalNonEmptyString(message.p) && isNonEmptyString(message.o) &&
    isNonEmptyString(message.n);
}

function isRfqPublicEvent(frame: BoundaryValue): frame is RfqPublicEvent {
  const message = record(frame);
  const hasNotional = message?.n !== undefined;
  const hasQuantity = message?.q !== undefined;
  return !!message && message.e === "requestForQuote" && isUpdateId(message.E) &&
    isNonEmptyString(message.r) && isOptionalNonEmptyString(message.s) &&
    Array.isArray(message.l) && message.l.every(isRfqLeg) &&
    isOptionalDecimal(message.n) && isOptionalDecimal(message.q) &&
    !(hasNotional && hasQuantity) && isOptionalDecimal(message.f) &&
    isOneOf(message.S, ["OPEN", "PENDING_ACCEPTANCE", "CONFIRMING", "FINALIZING", "FINALIZED", "CANCELLED", "EXPIRED", "FAILED"]) &&
    isOptionalUpdateId(message.w) && isOptionalUpdateId(message.x) && isOptionalUpdateId(message.c);
}

/** Public WebSocket namespace available in browser and server clients. */
export type PublicWebSocket = PublicGeminiWebSocket;
