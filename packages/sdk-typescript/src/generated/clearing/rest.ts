// Generated from rest.yaml#Clearing. Do not edit.

import type { HttpTransport } from "../../transport/http.js";
import type { RestPromise } from "../../transport/rest-promise.js";
import type { RequestOptions } from "../../utils/deadline.js";
import { executeRestOperation } from "../../transport/rest-operation.js";

import {
  CLEARING_OPERATIONS,
  type ClearingOperationTypes,
} from "./operations.js";

export class ClearingRest {
  constructor(private readonly transport: HttpTransport) {}

  cancelClearingOrder(input: ClearingOperationTypes["cancelClearingOrder"]["input"], requestOptions?: RequestOptions): RestPromise<ClearingOperationTypes["cancelClearingOrder"]["response"]> {
    const operation = CLEARING_OPERATIONS["cancelClearingOrder"];
    return executeRestOperation<ClearingOperationTypes["cancelClearingOrder"]>(this.transport, operation, input, requestOptions);
  }

  confirmClearingOrder(input: ClearingOperationTypes["confirmClearingOrder"]["input"], requestOptions?: RequestOptions): RestPromise<ClearingOperationTypes["confirmClearingOrder"]["response"]> {
    const operation = CLEARING_OPERATIONS["confirmClearingOrder"];
    return executeRestOperation<ClearingOperationTypes["confirmClearingOrder"]>(this.transport, operation, input, requestOptions);
  }

  createNewBrokerOrder(input: ClearingOperationTypes["createNewBrokerOrder"]["input"], requestOptions?: RequestOptions): RestPromise<ClearingOperationTypes["createNewBrokerOrder"]["response"]> {
    const operation = CLEARING_OPERATIONS["createNewBrokerOrder"];
    return executeRestOperation<ClearingOperationTypes["createNewBrokerOrder"]>(this.transport, operation, input, requestOptions);
  }

  createNewClearingOrder(input: ClearingOperationTypes["createNewClearingOrder"]["input"], requestOptions?: RequestOptions): RestPromise<ClearingOperationTypes["createNewClearingOrder"]["response"]> {
    const operation = CLEARING_OPERATIONS["createNewClearingOrder"];
    return executeRestOperation<ClearingOperationTypes["createNewClearingOrder"]>(this.transport, operation, input, requestOptions);
  }

  getClearingOrder(input: ClearingOperationTypes["getClearingOrder"]["input"], requestOptions?: RequestOptions): RestPromise<ClearingOperationTypes["getClearingOrder"]["response"]> {
    const operation = CLEARING_OPERATIONS["getClearingOrder"];
    return executeRestOperation<ClearingOperationTypes["getClearingOrder"]>(this.transport, operation, input, requestOptions);
  }

  listClearingBrokers(input?: ClearingOperationTypes["listClearingBrokers"]["input"], requestOptions?: RequestOptions): RestPromise<ClearingOperationTypes["listClearingBrokers"]["response"]> {
    const operation = CLEARING_OPERATIONS["listClearingBrokers"];
    return executeRestOperation<ClearingOperationTypes["listClearingBrokers"]>(this.transport, operation, input, requestOptions);
  }

  listClearingOrders(input?: ClearingOperationTypes["listClearingOrders"]["input"], requestOptions?: RequestOptions): RestPromise<ClearingOperationTypes["listClearingOrders"]["response"]> {
    const operation = CLEARING_OPERATIONS["listClearingOrders"];
    return executeRestOperation<ClearingOperationTypes["listClearingOrders"]>(this.transport, operation, input, requestOptions);
  }

  listClearingTrades(input?: ClearingOperationTypes["listClearingTrades"]["input"], requestOptions?: RequestOptions): RestPromise<ClearingOperationTypes["listClearingTrades"]["response"]> {
    const operation = CLEARING_OPERATIONS["listClearingTrades"];
    return executeRestOperation<ClearingOperationTypes["listClearingTrades"]>(this.transport, operation, input, requestOptions);
  }
}
