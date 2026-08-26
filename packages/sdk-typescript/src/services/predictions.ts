import { PredictionMarketsRest } from "../generated/rest.js";
import { SdkError } from "../errors.js";
import type { HttpMethod, HttpTransport } from "../transport/http.js";
import type { PaginationOptions } from "../transport/pagination.js";
import type { RestPromise } from "../transport/rest-promise.js";
import type { RequestOptions } from "../utils/deadline.js";
import { PREDICTION_MARKET_OPERATIONS, type PredictionMarketOperationTypes } from "../generated/operations.js";
import { isBoundaryObject, type BoundaryValue } from "../utils/boundary-value.js";

export type { PaginationOptions } from "../transport/pagination.js";

type PredictionMarketOperation = typeof PREDICTION_MARKET_OPERATIONS[keyof typeof PREDICTION_MARKET_OPERATIONS];
type PredictionMarketItems<Operation extends keyof PredictionMarketOperationTypes, Key extends string> =
  NonNullable<PredictionMarketOperationTypes[Operation]["response"]> extends { [K in Key]?: Array<infer T> }
    ? Extract<T, BoundaryValue>
    : BoundaryValue;

function toHttpMethod(method: string): HttpMethod {
  const upper = method.toUpperCase();
  if (upper === "GET" || upper === "POST" || upper === "PUT" || upper === "PATCH" || upper === "DELETE") {
    return upper;
  }
  throw new SdkError(`Unsupported prediction market HTTP method: ${method}`);
}

function paginatePredictionOperation<T extends BoundaryValue>(
  transport: HttpTransport,
  operation: PredictionMarketOperation,
  input: BoundaryValue,
  options: PaginationOptions | undefined,
  itemsKey: string,
  endpointMaxLimit = 500,
): AsyncGenerator<T> {
  const limit = options?.limit === undefined ? undefined : Math.min(options.limit, endpointMaxLimit);
  const maxLimit = options?.maxLimit === undefined
    ? (endpointMaxLimit < 500 ? endpointMaxLimit : undefined)
    : Math.min(options.maxLimit, endpointMaxLimit);
  return transport.paginate<T>({
    method: toHttpMethod(operation.method),
    path: operation.path,
    params: isBoundaryObject(input) ? input : undefined,
    visibility: operation.access === "public" ? "public" : "private",
    parameterLocation: operation.requestBody ? "payload" : "query",
    itemsKey,
    responseInt64Paths: operation.responseInt64Paths,
    limit,
    maxLimit,
    maxItems: options?.maxItems,
    retryable: operation.retryable,
    signal: options?.signal,
    timeoutMs: options?.timeoutMs,
  });
}

function rejectTimeBoundOrderHistory(input: BoundaryValue): void {
  if (isBoundaryObject(input) && (input.from !== undefined || input.to !== undefined)) {
    throw new SdkError("iterateOrderHistory cannot paginate when from or to is supplied; use getOrderHistory for a bounded time window");
  }
}

export class PredictionMarkets extends PredictionMarketsRest {
  private readonly httpTransport: HttpTransport;

  constructor(transport: HttpTransport) {
    super(transport);
    this.httpTransport = transport;
  }

  acceptPredictionMarketsTerms(requestOptions?: RequestOptions): RestPromise<PredictionMarketOperationTypes["acceptPredictionMarketsTerms"]["response"]> {
    return this.acceptTerms(requestOptions);
  }

  /**
   * Return an async iterator over all open prediction market positions.
   *
   * ```ts
   * for await (const position of client.predictions.iteratePositions({ eventTicker: "FEDJAN26" })) {
   *   console.log(position.symbol, position.totalQuantity);
   * }
   * ```
   * @yields A prediction market position.
   */
  async *iteratePositions(
    input?: PredictionMarketOperationTypes["getPositions"]["input"],
    options?: PaginationOptions,
  ): AsyncIterableIterator<
    NonNullable<PredictionMarketOperationTypes["getPositions"]["response"]> extends { positions?: Array<infer T> }
      ? T
      : BoundaryValue
  > {
    const generator = paginatePredictionOperation<PredictionMarketItems<"getPositions", "positions">>(this.httpTransport, PREDICTION_MARKET_OPERATIONS.getPositions, input, options, "positions");
    for await (const item of generator) {
      yield item;
    }
  }

  /**
   * Return an async iterator over all settled prediction market positions.
   *
   * ```ts
   * for await (const position of client.predictions.iterateSettledPositions({})) {
   *   console.log(position.symbol, position.payout);
   * }
   * ```
   * @yields A settled prediction market position.
   */
  async *iterateSettledPositions(
    input?: PredictionMarketOperationTypes["getSettledPositions"]["input"],
    options?: PaginationOptions,
  ): AsyncIterableIterator<
    NonNullable<PredictionMarketOperationTypes["getSettledPositions"]["response"]> extends { positions?: Array<infer T> }
      ? T
      : BoundaryValue
  > {
    const generator = paginatePredictionOperation<PredictionMarketItems<"getSettledPositions", "positions">>(this.httpTransport, PREDICTION_MARKET_OPERATIONS.getSettledPositions, input, options, "positions");
    for await (const item of generator) {
      yield item;
    }
  }

  /**
   * Return an async iterator over prediction market events.
   *
   * ```ts
   * for await (const event of client.predictions.iterateEvents({ category: ["Crypto"] })) {
   *   console.log(event.title, event.contracts);
   * }
   * ```
   * @yields A prediction market event.
   */
  async *iterateEvents(
    input?: PredictionMarketOperationTypes["listEvents"]["input"],
    options?: PaginationOptions,
  ): AsyncIterableIterator<
    NonNullable<PredictionMarketOperationTypes["listEvents"]["response"]> extends { data?: Array<infer T> }
      ? T
      : BoundaryValue
  > {
    const generator = paginatePredictionOperation<PredictionMarketItems<"listEvents", "data">>(this.httpTransport, PREDICTION_MARKET_OPERATIONS.listEvents, input, options, "data");
    for await (const item of generator) {
      yield item;
    }
  }

  /**
   * Return an async iterator over newly listed prediction market events.
   *
   * ```ts
   * for await (const event of client.predictions.iterateNewlyListedEvents()) {
   *   console.log(event.title);
   * }
   * ```
   * @yields A newly listed prediction market event.
   */
  async *iterateNewlyListedEvents(
    input?: PredictionMarketOperationTypes["listNewlyListedEvents"]["input"],
    options?: PaginationOptions,
  ): AsyncIterableIterator<
    NonNullable<PredictionMarketOperationTypes["listNewlyListedEvents"]["response"]> extends { data?: Array<infer T> }
      ? T
      : BoundaryValue
  > {
    const generator = paginatePredictionOperation<PredictionMarketItems<"listNewlyListedEvents", "data">>(this.httpTransport, PREDICTION_MARKET_OPERATIONS.listNewlyListedEvents, input, options, "data");
    for await (const item of generator) {
      yield item;
    }
  }

  /**
   * Return an async iterator over recently settled prediction market events.
   *
   * ```ts
   * for await (const event of client.predictions.iterateRecentlySettledEvents()) {
   *   console.log(event.title, event.resolvedAt);
   * }
   * ```
   * @yields A recently settled prediction market event.
   */
  async *iterateRecentlySettledEvents(
    input?: PredictionMarketOperationTypes["listRecentlySettledEvents"]["input"],
    options?: PaginationOptions,
  ): AsyncIterableIterator<
    NonNullable<PredictionMarketOperationTypes["listRecentlySettledEvents"]["response"]> extends { data?: Array<infer T> }
      ? T
      : BoundaryValue
  > {
    const generator = paginatePredictionOperation<PredictionMarketItems<"listRecentlySettledEvents", "data">>(this.httpTransport, PREDICTION_MARKET_OPERATIONS.listRecentlySettledEvents, input, options, "data");
    for await (const item of generator) {
      yield item;
    }
  }

  /**
   * Return an async iterator over upcoming prediction market events.
   *
   * ```ts
   * for await (const event of client.predictions.iterateUpcomingEvents()) {
   *   console.log(event.title, event.effectiveDate);
   * }
   * ```
   * @yields An upcoming prediction market event.
   */
  async *iterateUpcomingEvents(
    input?: PredictionMarketOperationTypes["listUpcomingEvents"]["input"],
    options?: PaginationOptions,
  ): AsyncIterableIterator<
    NonNullable<PredictionMarketOperationTypes["listUpcomingEvents"]["response"]> extends { data?: Array<infer T> }
      ? T
      : BoundaryValue
  > {
    const generator = paginatePredictionOperation<PredictionMarketItems<"listUpcomingEvents", "data">>(this.httpTransport, PREDICTION_MARKET_OPERATIONS.listUpcomingEvents, input, options, "data");
    for await (const item of generator) {
      yield item;
    }
  }

  /**
   * Return an async iterator over combo markets.
   *
   * ```ts
   * for await (const combo of client.predictions.iterateCombos()) {
   *   console.log(combo.contract.contractTicker, combo.legs);
   * }
   * ```
   * @yields A prediction market combo.
   */
  async *iterateCombos(
    input?: PredictionMarketOperationTypes["listCombos"]["input"],
    options?: PaginationOptions,
  ): AsyncIterableIterator<
    NonNullable<PredictionMarketOperationTypes["listCombos"]["response"]> extends { combos?: Array<infer T> }
      ? T
      : BoundaryValue
  > {
    const generator = paginatePredictionOperation<PredictionMarketItems<"listCombos", "combos">>(this.httpTransport, PREDICTION_MARKET_OPERATIONS.listCombos, input, options, "combos");
    for await (const item of generator) {
      yield item;
    }
  }

  /**
   * Return an async iterator over active prediction market orders.
   *
   * ```ts
   * for await (const order of client.predictions.iterateActiveOrders()) {
   *   console.log(order.orderId, order.side, order.price);
   * }
   * ```
   * @yields An active prediction market order.
   */
  async *iterateActiveOrders(
    input?: PredictionMarketOperationTypes["getActiveOrders"]["input"],
    options?: PaginationOptions,
  ): AsyncIterableIterator<
    NonNullable<PredictionMarketOperationTypes["getActiveOrders"]["response"]> extends { orders?: Array<infer T> }
      ? T
      : BoundaryValue
  > {
    const generator = paginatePredictionOperation<PredictionMarketItems<"getActiveOrders", "orders">>(this.httpTransport, PREDICTION_MARKET_OPERATIONS.getActiveOrders, input, options, "orders", 100);
    for await (const item of generator) {
      yield item;
    }
  }

  /**
   * Return an async iterator over historical prediction market orders.
   *
   * ```ts
   * for await (const order of client.predictions.iterateOrderHistory({})) {
   *   console.log(order.orderId, order.status);
   * }
   * ```
   * @yields A historical prediction market order.
   */
  async *iterateOrderHistory(
    input?: PredictionMarketOperationTypes["getOrderHistory"]["input"],
    options?: PaginationOptions,
  ): AsyncIterableIterator<
    NonNullable<PredictionMarketOperationTypes["getOrderHistory"]["response"]> extends { orders?: Array<infer T> }
      ? T
      : BoundaryValue
  > {
    rejectTimeBoundOrderHistory(input);
    const generator = paginatePredictionOperation<PredictionMarketItems<"getOrderHistory", "orders">>(this.httpTransport, PREDICTION_MARKET_OPERATIONS.getOrderHistory, input, options, "orders");
    for await (const item of generator) {
      yield item;
    }
  }

  /**
   * Return an async iterator over events that qualify for liquidity rewards.
   *
   * ```ts
   * for await (const ev of client.predictions.iterateLiquidityRewardsEvents()) {
   *   console.log(ev.event_ticker, ev.daily_pool_usd);
   * }
   * ```
   * @yields A liquidity rewards event.
   */
  async *iterateLiquidityRewardsEvents(
    input?: PredictionMarketOperationTypes["listLiquidityRewardsEvents"]["input"],
    options?: PaginationOptions,
  ): AsyncIterableIterator<
    NonNullable<PredictionMarketOperationTypes["listLiquidityRewardsEvents"]["response"]> extends { events?: Array<infer T> }
      ? T
      : BoundaryValue
  > {
    const generator = paginatePredictionOperation<PredictionMarketItems<"listLiquidityRewardsEvents", "events">>(this.httpTransport, PREDICTION_MARKET_OPERATIONS.listLiquidityRewardsEvents, input, options, "events", 100);
    for await (const item of generator) {
      yield item;
    }
  }
}
