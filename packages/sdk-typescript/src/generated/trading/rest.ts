// Generated from rest.yaml#Trading. Do not edit.

import type { HttpTransport } from "../../core/http.js";
import type { RequestOptions } from "../../core/deadline.js";
import { executeRestOperation } from "../../core/rest-operation.js";

import {
  TRADING_OPERATIONS,
  type TradingOperationTypes,
} from "./operations.js";

export class TradingRest {
  constructor(private readonly transport: HttpTransport) {}

  cancelAllActiveOrders(body: TradingOperationTypes["cancelAllActiveOrders"]["body"], requestOptions?: RequestOptions): Promise<TradingOperationTypes["cancelAllActiveOrders"]["response"]>;
  cancelAllActiveOrders(body: TradingOperationTypes["cancelAllActiveOrders"]["body"]): Promise<TradingOperationTypes["cancelAllActiveOrders"]["response"]>;
  cancelAllActiveOrders(body: TradingOperationTypes["cancelAllActiveOrders"]["body"], requestOptions?: RequestOptions): Promise<TradingOperationTypes["cancelAllActiveOrders"]["response"]> {
    const operation = TRADING_OPERATIONS["cancelAllActiveOrders"];
    return executeRestOperation<TradingOperationTypes["cancelAllActiveOrders"]>(this.transport, operation, {
      body,
    }, requestOptions);
  }

  cancelAllSessionOrders(body: TradingOperationTypes["cancelAllSessionOrders"]["body"], requestOptions?: RequestOptions): Promise<TradingOperationTypes["cancelAllSessionOrders"]["response"]>;
  cancelAllSessionOrders(body: TradingOperationTypes["cancelAllSessionOrders"]["body"]): Promise<TradingOperationTypes["cancelAllSessionOrders"]["response"]>;
  cancelAllSessionOrders(body: TradingOperationTypes["cancelAllSessionOrders"]["body"], requestOptions?: RequestOptions): Promise<TradingOperationTypes["cancelAllSessionOrders"]["response"]> {
    const operation = TRADING_OPERATIONS["cancelAllSessionOrders"];
    return executeRestOperation<TradingOperationTypes["cancelAllSessionOrders"]>(this.transport, operation, {
      body,
    }, requestOptions);
  }

  cancelOrder(body: TradingOperationTypes["cancelOrder"]["body"], requestOptions?: RequestOptions): Promise<TradingOperationTypes["cancelOrder"]["response"]>;
  cancelOrder(body: TradingOperationTypes["cancelOrder"]["body"]): Promise<TradingOperationTypes["cancelOrder"]["response"]>;
  cancelOrder(body: TradingOperationTypes["cancelOrder"]["body"], requestOptions?: RequestOptions): Promise<TradingOperationTypes["cancelOrder"]["response"]> {
    const operation = TRADING_OPERATIONS["cancelOrder"];
    return executeRestOperation<TradingOperationTypes["cancelOrder"]>(this.transport, operation, {
      body,
    }, requestOptions);
  }

  createNewOrder(body: TradingOperationTypes["createNewOrder"]["body"], requestOptions?: RequestOptions): Promise<TradingOperationTypes["createNewOrder"]["response"]>;
  createNewOrder(body: TradingOperationTypes["createNewOrder"]["body"]): Promise<TradingOperationTypes["createNewOrder"]["response"]>;
  createNewOrder(body: TradingOperationTypes["createNewOrder"]["body"], requestOptions?: RequestOptions): Promise<TradingOperationTypes["createNewOrder"]["response"]> {
    const operation = TRADING_OPERATIONS["createNewOrder"];
    return executeRestOperation<TradingOperationTypes["createNewOrder"]>(this.transport, operation, {
      body,
    }, requestOptions);
  }

  getNotionalTradingVolume(body: TradingOperationTypes["getNotionalTradingVolume"]["body"], requestOptions?: RequestOptions): Promise<TradingOperationTypes["getNotionalTradingVolume"]["response"]>;
  getNotionalTradingVolume(body: TradingOperationTypes["getNotionalTradingVolume"]["body"]): Promise<TradingOperationTypes["getNotionalTradingVolume"]["response"]>;
  getNotionalTradingVolume(body: TradingOperationTypes["getNotionalTradingVolume"]["body"], requestOptions?: RequestOptions): Promise<TradingOperationTypes["getNotionalTradingVolume"]["response"]> {
    const operation = TRADING_OPERATIONS["getNotionalTradingVolume"];
    return executeRestOperation<TradingOperationTypes["getNotionalTradingVolume"]>(this.transport, operation, {
      body,
    }, requestOptions);
  }

  getOrderStatus(body: TradingOperationTypes["getOrderStatus"]["body"], requestOptions?: RequestOptions): Promise<TradingOperationTypes["getOrderStatus"]["response"]>;
  getOrderStatus(body: TradingOperationTypes["getOrderStatus"]["body"]): Promise<TradingOperationTypes["getOrderStatus"]["response"]>;
  getOrderStatus(body: TradingOperationTypes["getOrderStatus"]["body"], requestOptions?: RequestOptions): Promise<TradingOperationTypes["getOrderStatus"]["response"]> {
    const operation = TRADING_OPERATIONS["getOrderStatus"];
    return executeRestOperation<TradingOperationTypes["getOrderStatus"]>(this.transport, operation, {
      body,
    }, requestOptions);
  }

  getTradingVolume(body: TradingOperationTypes["getTradingVolume"]["body"], requestOptions?: RequestOptions): Promise<TradingOperationTypes["getTradingVolume"]["response"]>;
  getTradingVolume(body: TradingOperationTypes["getTradingVolume"]["body"]): Promise<TradingOperationTypes["getTradingVolume"]["response"]>;
  getTradingVolume(body: TradingOperationTypes["getTradingVolume"]["body"], requestOptions?: RequestOptions): Promise<TradingOperationTypes["getTradingVolume"]["response"]> {
    const operation = TRADING_OPERATIONS["getTradingVolume"];
    return executeRestOperation<TradingOperationTypes["getTradingVolume"]>(this.transport, operation, {
      body,
    }, requestOptions);
  }

  listActiveOrders(body: TradingOperationTypes["listActiveOrders"]["body"], requestOptions?: RequestOptions): Promise<TradingOperationTypes["listActiveOrders"]["response"]>;
  listActiveOrders(body: TradingOperationTypes["listActiveOrders"]["body"]): Promise<TradingOperationTypes["listActiveOrders"]["response"]>;
  listActiveOrders(body: TradingOperationTypes["listActiveOrders"]["body"], requestOptions?: RequestOptions): Promise<TradingOperationTypes["listActiveOrders"]["response"]> {
    const operation = TRADING_OPERATIONS["listActiveOrders"];
    return executeRestOperation<TradingOperationTypes["listActiveOrders"]>(this.transport, operation, {
      body,
    }, requestOptions);
  }

  listPastOrders(body: TradingOperationTypes["listPastOrders"]["body"], requestOptions?: RequestOptions): Promise<TradingOperationTypes["listPastOrders"]["response"]>;
  listPastOrders(body: TradingOperationTypes["listPastOrders"]["body"]): Promise<TradingOperationTypes["listPastOrders"]["response"]>;
  listPastOrders(body: TradingOperationTypes["listPastOrders"]["body"], requestOptions?: RequestOptions): Promise<TradingOperationTypes["listPastOrders"]["response"]> {
    const operation = TRADING_OPERATIONS["listPastOrders"];
    return executeRestOperation<TradingOperationTypes["listPastOrders"]>(this.transport, operation, {
      body,
    }, requestOptions);
  }

  listPastTrades(body: TradingOperationTypes["listPastTrades"]["body"], requestOptions?: RequestOptions): Promise<TradingOperationTypes["listPastTrades"]["response"]>;
  listPastTrades(body: TradingOperationTypes["listPastTrades"]["body"]): Promise<TradingOperationTypes["listPastTrades"]["response"]>;
  listPastTrades(body: TradingOperationTypes["listPastTrades"]["body"], requestOptions?: RequestOptions): Promise<TradingOperationTypes["listPastTrades"]["response"]> {
    const operation = TRADING_OPERATIONS["listPastTrades"];
    return executeRestOperation<TradingOperationTypes["listPastTrades"]>(this.transport, operation, {
      body,
    }, requestOptions);
  }

  sendHeartbeat(body: TradingOperationTypes["sendHeartbeat"]["body"], requestOptions?: RequestOptions): Promise<TradingOperationTypes["sendHeartbeat"]["response"]>;
  sendHeartbeat(body: TradingOperationTypes["sendHeartbeat"]["body"]): Promise<TradingOperationTypes["sendHeartbeat"]["response"]>;
  sendHeartbeat(body: TradingOperationTypes["sendHeartbeat"]["body"], requestOptions?: RequestOptions): Promise<TradingOperationTypes["sendHeartbeat"]["response"]> {
    const operation = TRADING_OPERATIONS["sendHeartbeat"];
    return executeRestOperation<TradingOperationTypes["sendHeartbeat"]>(this.transport, operation, {
      body,
    }, requestOptions);
  }

  wrapOrder(input: {
    path: TradingOperationTypes["wrapOrder"]["path"];
    body: TradingOperationTypes["wrapOrder"]["body"];
  }, requestOptions?: RequestOptions): Promise<TradingOperationTypes["wrapOrder"]["response"]>;
  wrapOrder(input: {
    path: TradingOperationTypes["wrapOrder"]["path"];
    body: TradingOperationTypes["wrapOrder"]["body"];
  }): Promise<TradingOperationTypes["wrapOrder"]["response"]>;
  wrapOrder(input: {
    path: TradingOperationTypes["wrapOrder"]["path"];
    body: TradingOperationTypes["wrapOrder"]["body"];
  }, requestOptions?: RequestOptions): Promise<TradingOperationTypes["wrapOrder"]["response"]> {
    const operation = TRADING_OPERATIONS["wrapOrder"];
    return executeRestOperation<TradingOperationTypes["wrapOrder"]>(this.transport, operation, {
      path: input.path,
      body: input.body,
    }, requestOptions);
  }
}
