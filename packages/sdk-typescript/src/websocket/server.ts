import type { AuthStrategy } from "../transport/http.js";
import type { RequestOptions } from "../utils/deadline.js";
import { SdkError } from "../errors.js";
import { createServerWebSocketAuthHeaders } from "./auth.js";
import { WebSocketSession } from "./session.js";
import {
  PublicGeminiWebSocket,
  type WebSocketStream,
  type WebSocketStreamOptions,
} from "./public.js";
import type {
  BalanceUpdate,
  ListSubscriptionsResponse,
  OrderActionResponse,
  OrderCancelParams,
  OrderPlaceParams,
  OrderUpdate,
  PositionReport,
  RfqConfirmQuoteParams,
  RfqConfirmQuoteResponse,
  RfqPrivateDelivery,
  RfqSubmitQuoteParams,
  RfqSubmitQuoteResponse,
  RfqWithdrawQuoteParams,
  RfqWithdrawQuoteResponse,
  SettlementUpdate,
  WebSocketJsonObject,
} from "./types.js";
import {
  isBoundaryBoolean,
  isBoundaryString,
  type BoundaryValue,
} from "../utils/boundary-value.js";
import { isPlainDecimal } from "../utils/decimal.js";
import {
  isNonEmptyString,
  isOneOf,
  isOneOfOptional,
  isOptionalDecimal,
  isOptionalNonEmptyString,
  isOptionalString,
  isOptionalUpdateId,
  isUpdateId,
  record,
} from "./validation.js";

export interface WebSocketScopeOptions extends WebSocketStreamOptions {
  scope: "account" | "session";
}

export interface WebSocketAccountIntervalOptions extends WebSocketStreamOptions {
  intervalMs?: 0 | 1000;
}

export type WebSocketOrderPlaceParams = Omit<OrderPlaceParams, "side" | "type" | "timeInForce" | "eventOutcome"> & {
  side: "BUY" | "SELL";
  type: "LIMIT" | "MARKET";
  timeInForce: "GTC" | "IOC" | "FOK" | "MOC";
  eventOutcome?: "YES" | "NO";
};

export interface WebSocketCancelAllOptions extends RequestOptions {
  confirm: boolean;
}

export type GeminiWebSocketOptions = ConstructorParameters<typeof PublicGeminiWebSocket>[0] & {
  auth?: AuthStrategy;
};

/** Operations owned by the unauthenticated public WebSocket connection. */
export type PublicWebSocket = Pick<
  PublicGeminiWebSocket,
  "bookTicker" | "trades" | "depthUpdates" | "depth" | "contractStatus" | "rfqs" |
  "orderBook" | "ping" | "time" | "conninfo" | "listSubscriptions" | "depthSnapshot"
  | "close"
>;

/** Operations owned by the authenticated server-only WebSocket connection. */
export interface PrivateWebSocket {
  readonly rfq: {
    submitQuote(params: RfqSubmitQuoteParams, options?: RequestOptions): Promise<RfqSubmitQuoteResponse>;
    withdrawQuote(params: RfqWithdrawQuoteParams, options?: RequestOptions): Promise<RfqWithdrawQuoteResponse>;
    confirmQuote(params: RfqConfirmQuoteParams, options?: RequestOptions): Promise<RfqConfirmQuoteResponse>;
  };
  orders(options: WebSocketScopeOptions): WebSocketStream<OrderUpdate>;
  balances(options?: WebSocketAccountIntervalOptions): WebSocketStream<BalanceUpdate>;
  positions(options?: WebSocketAccountIntervalOptions): WebSocketStream<PositionReport>;
  settlements(options?: WebSocketStreamOptions): WebSocketStream<SettlementUpdate>;
  rfqDeliveries(options: WebSocketScopeOptions): WebSocketStream<RfqPrivateDelivery>;
  placeOrder(params: WebSocketOrderPlaceParams, options?: RequestOptions): Promise<OrderActionResponse>;
  cancelOrder(params: OrderCancelParams, options?: RequestOptions): Promise<OrderActionResponse>;
  cancelAllOrders(options: WebSocketCancelAllOptions): Promise<OrderActionResponse>;
  cancelSessionOrders(options: WebSocketCancelAllOptions): Promise<OrderActionResponse>;
  conninfo(options?: RequestOptions): Promise<WebSocketJsonObject>;
  listSubscriptions(options?: RequestOptions): Promise<ListSubscriptionsResponse>;
}

type FrameMatcher<T extends BoundaryValue> = (frame: BoundaryValue) => frame is T;

/** Internal authenticated connection; the exported façade exposes this only as `.private`. */
class PrivateGeminiWebSocket extends PublicGeminiWebSocket {
  readonly private: PrivateWebSocket;
  readonly rfq = {
    submitQuote: (params: RfqSubmitQuoteParams, options?: RequestOptions): Promise<RfqSubmitQuoteResponse> =>
      this.authenticatedRequest({ method: "rfq.submit_quote", params }, options),
    withdrawQuote: (params: RfqWithdrawQuoteParams, options?: RequestOptions): Promise<RfqWithdrawQuoteResponse> =>
      this.authenticatedRequest({ method: "rfq.withdraw_quote", params }, options),
    confirmQuote: (params: RfqConfirmQuoteParams, options?: RequestOptions): Promise<RfqConfirmQuoteResponse> =>
      this.authenticatedRequest({ method: "rfq.confirm_quote", params }, options),
  };
  private readonly auth?: AuthStrategy;
  private privateSession?: WebSocketSession;

  constructor(options: GeminiWebSocketOptions) {
    const { auth, ...publicOptions } = options;
    super(publicOptions);
    this.auth = auth;
    this.private = {
      rfq: this.rfq,
      orders: this.orders.bind(this),
      balances: this.balances.bind(this),
      positions: this.positions.bind(this),
      settlements: this.settlements.bind(this),
      rfqDeliveries: this.rfqDeliveries.bind(this),
      placeOrder: this.placeOrder.bind(this),
      cancelOrder: this.cancelOrder.bind(this),
      cancelAllOrders: this.cancelAllOrders.bind(this),
      cancelSessionOrders: this.cancelSessionOrders.bind(this),
      conninfo: (options) => this.authenticatedRequest<WebSocketJsonObject>({ method: "conninfo" }, options),
      listSubscriptions: (options) => this.authenticatedRequest({ method: "LIST_SUBSCRIPTIONS" }, options),
    };
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

  settlements(options?: WebSocketStreamOptions): WebSocketStream<SettlementUpdate> {
    return this.authenticatedStream("settlements@account", isSettlementUpdate, options);
  }

  rfqDeliveries(options: WebSocketScopeOptions): WebSocketStream<RfqPrivateDelivery> {
    return this.authenticatedStream(`requestForQuote@${scope(options)}`, isRfqPrivateDelivery, options);
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

  override close(): void {
    this.privateSession?.close();
    super.close();
  }

  private authenticatedStream<T extends BoundaryValue>(name: string, matcher: FrameMatcher<T>, options?: WebSocketStreamOptions): WebSocketStream<T> {
    this.requireAuth();
    if (this.closed) throw new SdkError("websocket stream requested on a closed GeminiMarkets client");
    return this.createStream(this.ensurePrivateSession(), name, matcher, options);
  }

  private async authenticatedRequest<T extends BoundaryValue>(frame: { method: string; params?: BoundaryValue }, options?: RequestOptions): Promise<T> {
    this.requireAuth();
    if (this.closed) throw new SdkError("websocket request made on a closed GeminiMarkets client");
    return this.ensurePrivateSession().request<T>(frame, options);
  }

  private requireAuth(): void {
    if (!this.auth) throw new SdkError("authenticated WebSocket operation requires auth");
  }

  private ensurePrivateSession(): WebSocketSession {
    if (!this.privateSession) {
      this.privateSession = this.createSession(this.url, (options) => createServerWebSocketAuthHeaders(this.auth!, options));
    }
    return this.privateSession;
  }

  protected override isCandidateFrameForStream(name: string, frame: BoundaryValue): boolean {
    const message = record(frame);
    if (!message) return false;
    if (name.startsWith("orders@")) return message.e === "orderUpdate";
    if (name.startsWith("balances@")) return message.e === "balanceUpdate";
    if (name.startsWith("positions@")) return message.e === "positionReport";
    if (name.startsWith("settlements@")) return message.type === "settlements";
    if (name.startsWith("requestForQuote@")) {
      return message.e === "requestForQuote" && Object.hasOwn(message, "i");
    }
    return super.isCandidateFrameForStream(name, frame);
  }
}

/** Server façade with explicit ownership of public and authenticated connections. */
export class GeminiWebSocket {
  readonly public: PublicWebSocket;
  readonly private: PrivateWebSocket;
  readonly #publicConnection: PublicGeminiWebSocket;
  readonly #privateConnection: PrivateGeminiWebSocket;

  constructor(options: GeminiWebSocketOptions) {
    this.#publicConnection = new PublicGeminiWebSocket(options);
    this.public = this.#publicConnection;
    this.#privateConnection = new PrivateGeminiWebSocket(options);
    this.private = this.#privateConnection.private;
  }

  close(): void {
    this.#publicConnection.close();
    this.#privateConnection.close();
  }

  [Symbol.dispose](): void {
    this.close();
  }

  async [Symbol.asyncDispose](): Promise<void> {
    this.close();
  }
}

function requireConfirmedCancel(options: WebSocketCancelAllOptions): void {
  if (!options || options.confirm !== true) throw new SdkError("cancel-all WebSocket methods require confirm: true");
}

function scope(options: WebSocketScopeOptions): "account" | "session" {
  if (options?.scope !== "account" && options?.scope !== "session") throw new SdkError("scope must be account or session");
  return options.scope;
}

function accountIntervalName(base: "balances" | "positions", options?: WebSocketAccountIntervalOptions): string {
  const intervalMs = options?.intervalMs ?? 0;
  if (intervalMs !== 0 && intervalMs !== 1000) throw new SdkError("intervalMs must be 0 or 1000");
  return intervalMs === 1000 ? `${base}@account@1s` : `${base}@account`;
}

function isOptionalBoolean(value: BoundaryValue): boolean {
  return value === undefined || isBoundaryBoolean(value);
}

function isSignedPlainDecimal(value: BoundaryValue): value is string {
  if (!isBoundaryString(value) || value.length === 0) return false;
  return value.startsWith("-") ? isPlainDecimal(value.slice(1)) : isPlainDecimal(value);
}

function isOrderUpdate(frame: BoundaryValue): frame is OrderUpdate {
  const message = record(frame);
  return !!message && message.e === "orderUpdate" &&
    isUpdateId(message.E) && isNonEmptyString(message.s) && isUpdateId(message.i) &&
    isOneOf(message.X, ["NEW", "OPEN", "FILLED", "PARTIALLY_FILLED", "CANCELED", "REJECTED", "MODIFIED"]) &&
    isUpdateId(message.T) && isOptionalString(message.c) && isOneOfOptional(message.S, ["BUY", "SELL"]) &&
    isOneOfOptional(message.o, ["LIMIT", "MARKET", "STOP_LIMIT", "STOP_MARKET"]) &&
    isOneOfOptional(message.O, ["YES", "NO"]) && isOptionalUpdateId(message.t) &&
    isOptionalBoolean(message.m) && isOptionalString(message.r) && isOptionalDecimal(message.p) && isOptionalDecimal(message.P) &&
    isOptionalDecimal(message.q) && isOptionalDecimal(message.z) && isOptionalDecimal(message.Z) &&
    isOptionalDecimal(message.L) && isOptionalDecimal(message.n);
}

function isBalanceUpdate(frame: BoundaryValue): frame is BalanceUpdate {
  const message = record(frame);
  return !!message && message.e === "balanceUpdate" && isUpdateId(message.E) && isUpdateId(message.u) &&
    Array.isArray(message.B) && message.B.every(isBalanceRow);
}

function isPositionReport(frame: BoundaryValue): frame is PositionReport {
  const message = record(frame);
  return !!message && message.e === "positionReport" && isUpdateId(message.E) && isUpdateId(message.u) &&
    isUpdateId(message.A) && Array.isArray(message.P) && message.P.every(isPositionRow);
}

function isRfqPrivateDelivery(frame: BoundaryValue): frame is RfqPrivateDelivery {
  const message = record(frame);
  return !!message && message.e === "requestForQuote" && isNonEmptyString(message.i) &&
    isUpdateId(message.E) && isNonEmptyString(message.r) &&
    isOneOf(message.x, ["CLOSED", "ACCEPTED", "CONFIRMED", "DECLINED", "FINALIZED", "FAILED"]) &&
    isOneOf(message.S, ["OPEN", "PENDING_ACCEPTANCE", "CONFIRMING", "FINALIZING", "FINALIZED", "CANCELLED", "EXPIRED", "FAILED"]) &&
    isOptionalNonEmptyString(message.q) && isOptionalDecimal(message.p) &&
    isOptionalDecimal(message.sz) && isOptionalUpdateId(message.vu) &&
    (message.qs === undefined || isOneOf(message.qs, ["ACTIVE", "WITHDRAWN", "EXPIRED", "WON", "LOST"]));
}

function isBalanceRow(value: BoundaryValue): boolean {
  const row = record(value);
  return !!row && isNonEmptyString(row.a) && isPlainDecimal(row.f) && isPlainDecimal(row.c);
}

function isPositionRow(value: BoundaryValue): boolean {
  const row = record(value);
  return !!row && isNonEmptyString(row.t) && isNonEmptyString(row.s) &&
    Array.isArray(row.a) && row.a.every(isNamedAmount);
}

function isNamedAmount(value: BoundaryValue): boolean {
  const amount = record(value);
  return !!amount && isNonEmptyString(amount.t) &&
    isOptionalString(amount.c) &&
    (amount.t === "position" ? isSignedPlainDecimal(amount.v) : isPlainDecimal(amount.v));
}

function isSettlementUpdate(frame: BoundaryValue): frame is SettlementUpdate {
  const message = record(frame);
  return !!message && message.type === "settlements" && Array.isArray(message.settlements) &&
    message.settlements.every(isSettlement);
}

function isSettlement(value: BoundaryValue): boolean {
  const settlement = record(value);
  return !!settlement && isNonEmptyString(settlement.symbol) && isSignedPlainDecimal(settlement.position) &&
    isOneOf(settlement.outcome, ["yes", "no", "unspecified"]) &&
    (settlement.payout === undefined || isPlainDecimal(settlement.payout));
}
