// Generated from rest.yaml#Trading. Do not edit.

import type { HttpTransport } from "../../transport/http.js";
import type { RestPromise } from "../../transport/rest-promise.js";
import type { RequestOptions } from "../../utils/deadline.js";
import { executeRestOperation } from "../../transport/rest-operation.js";

import {
  TRADING_OPERATIONS,
  type TradingOperationTypes,
} from "./operations.js";

export class TradingRest {
  constructor(private readonly transport: HttpTransport) {}

  cancelAllActiveOrders(input?: TradingOperationTypes["cancelAllActiveOrders"]["input"], requestOptions?: RequestOptions): RestPromise<TradingOperationTypes["cancelAllActiveOrders"]["response"]> {
    const operation = TRADING_OPERATIONS["cancelAllActiveOrders"];
    return executeRestOperation<TradingOperationTypes["cancelAllActiveOrders"]>(this.transport, operation, input, requestOptions);
  }

  cancelAllSessionOrders(input?: TradingOperationTypes["cancelAllSessionOrders"]["input"], requestOptions?: RequestOptions): RestPromise<TradingOperationTypes["cancelAllSessionOrders"]["response"]> {
    const operation = TRADING_OPERATIONS["cancelAllSessionOrders"];
    return executeRestOperation<TradingOperationTypes["cancelAllSessionOrders"]>(this.transport, operation, input, requestOptions);
  }

  cancelOrder(input: TradingOperationTypes["cancelOrder"]["input"], requestOptions?: RequestOptions): RestPromise<TradingOperationTypes["cancelOrder"]["response"]> {
    const operation = TRADING_OPERATIONS["cancelOrder"];
    return executeRestOperation<TradingOperationTypes["cancelOrder"]>(this.transport, operation, input, requestOptions);
  }

  createNewOrder(input: TradingOperationTypes["createNewOrder"]["input"], requestOptions?: RequestOptions): RestPromise<TradingOperationTypes["createNewOrder"]["response"]> {
    const operation = TRADING_OPERATIONS["createNewOrder"];
    return executeRestOperation<TradingOperationTypes["createNewOrder"]>(this.transport, operation, input, requestOptions);
  }

  getNotionalTradingVolume(input?: TradingOperationTypes["getNotionalTradingVolume"]["input"], requestOptions?: RequestOptions): RestPromise<TradingOperationTypes["getNotionalTradingVolume"]["response"]> {
    const operation = TRADING_OPERATIONS["getNotionalTradingVolume"];
    return executeRestOperation<TradingOperationTypes["getNotionalTradingVolume"]>(this.transport, operation, input, requestOptions);
  }

  getOrderStatus(input: TradingOperationTypes["getOrderStatus"]["input"], requestOptions?: RequestOptions): RestPromise<TradingOperationTypes["getOrderStatus"]["response"]> {
    const operation = TRADING_OPERATIONS["getOrderStatus"];
    return executeRestOperation<TradingOperationTypes["getOrderStatus"]>(this.transport, operation, input, requestOptions);
  }

  getTradingVolume(input?: TradingOperationTypes["getTradingVolume"]["input"], requestOptions?: RequestOptions): RestPromise<TradingOperationTypes["getTradingVolume"]["response"]> {
    const operation = TRADING_OPERATIONS["getTradingVolume"];
    return executeRestOperation<TradingOperationTypes["getTradingVolume"]>(this.transport, operation, input, requestOptions);
  }

  listActiveOrders(input?: TradingOperationTypes["listActiveOrders"]["input"], requestOptions?: RequestOptions): RestPromise<TradingOperationTypes["listActiveOrders"]["response"]> {
    const operation = TRADING_OPERATIONS["listActiveOrders"];
    return executeRestOperation<TradingOperationTypes["listActiveOrders"]>(this.transport, operation, input, requestOptions);
  }

  listPastOrders(input?: TradingOperationTypes["listPastOrders"]["input"], requestOptions?: RequestOptions): RestPromise<TradingOperationTypes["listPastOrders"]["response"]> {
    const operation = TRADING_OPERATIONS["listPastOrders"];
    return executeRestOperation<TradingOperationTypes["listPastOrders"]>(this.transport, operation, input, requestOptions);
  }

  listPastTrades(input?: TradingOperationTypes["listPastTrades"]["input"], requestOptions?: RequestOptions): RestPromise<TradingOperationTypes["listPastTrades"]["response"]> {
    const operation = TRADING_OPERATIONS["listPastTrades"];
    return executeRestOperation<TradingOperationTypes["listPastTrades"]>(this.transport, operation, input, requestOptions);
  }

  sendHeartbeat(input?: TradingOperationTypes["sendHeartbeat"]["input"], requestOptions?: RequestOptions): RestPromise<TradingOperationTypes["sendHeartbeat"]["response"]> {
    const operation = TRADING_OPERATIONS["sendHeartbeat"];
    return executeRestOperation<TradingOperationTypes["sendHeartbeat"]>(this.transport, operation, input, requestOptions);
  }

  wrapOrder(input: TradingOperationTypes["wrapOrder"]["input"], requestOptions?: RequestOptions): RestPromise<TradingOperationTypes["wrapOrder"]["response"]> {
    const operation = TRADING_OPERATIONS["wrapOrder"];
    return executeRestOperation<TradingOperationTypes["wrapOrder"]>(this.transport, operation, input, requestOptions);
  }
}
