// Generated from rest.yaml#Clearing & Instant. Do not edit.

import type { HttpTransport } from "../../core/http.js";
import type { RequestOptions } from "../../core/deadline.js";
import { executeRestOperation } from "../../core/rest-operation.js";

import {
  CLEARING_INSTANT_OPERATIONS,
  type ClearingInstantOperationTypes,
} from "./operations.js";

export class ClearingInstantRest {
  constructor(private readonly transport: HttpTransport) {}

  cancelClearingOrder(body: ClearingInstantOperationTypes["cancelClearingOrder"]["body"], requestOptions?: RequestOptions): Promise<ClearingInstantOperationTypes["cancelClearingOrder"]["response"]>;
  cancelClearingOrder(body: ClearingInstantOperationTypes["cancelClearingOrder"]["body"]): Promise<ClearingInstantOperationTypes["cancelClearingOrder"]["response"]>;
  cancelClearingOrder(body: ClearingInstantOperationTypes["cancelClearingOrder"]["body"], requestOptions?: RequestOptions): Promise<ClearingInstantOperationTypes["cancelClearingOrder"]["response"]> {
    const operation = CLEARING_INSTANT_OPERATIONS["cancelClearingOrder"];
    return executeRestOperation<ClearingInstantOperationTypes["cancelClearingOrder"]>(this.transport, operation, {
      body,
    }, requestOptions);
  }

  confirmClearingOrder(body: ClearingInstantOperationTypes["confirmClearingOrder"]["body"], requestOptions?: RequestOptions): Promise<ClearingInstantOperationTypes["confirmClearingOrder"]["response"]>;
  confirmClearingOrder(body: ClearingInstantOperationTypes["confirmClearingOrder"]["body"]): Promise<ClearingInstantOperationTypes["confirmClearingOrder"]["response"]>;
  confirmClearingOrder(body: ClearingInstantOperationTypes["confirmClearingOrder"]["body"], requestOptions?: RequestOptions): Promise<ClearingInstantOperationTypes["confirmClearingOrder"]["response"]> {
    const operation = CLEARING_INSTANT_OPERATIONS["confirmClearingOrder"];
    return executeRestOperation<ClearingInstantOperationTypes["confirmClearingOrder"]>(this.transport, operation, {
      body,
    }, requestOptions);
  }

  createNewBrokerOrder(body: ClearingInstantOperationTypes["createNewBrokerOrder"]["body"], requestOptions?: RequestOptions): Promise<ClearingInstantOperationTypes["createNewBrokerOrder"]["response"]>;
  createNewBrokerOrder(body: ClearingInstantOperationTypes["createNewBrokerOrder"]["body"]): Promise<ClearingInstantOperationTypes["createNewBrokerOrder"]["response"]>;
  createNewBrokerOrder(body: ClearingInstantOperationTypes["createNewBrokerOrder"]["body"], requestOptions?: RequestOptions): Promise<ClearingInstantOperationTypes["createNewBrokerOrder"]["response"]> {
    const operation = CLEARING_INSTANT_OPERATIONS["createNewBrokerOrder"];
    return executeRestOperation<ClearingInstantOperationTypes["createNewBrokerOrder"]>(this.transport, operation, {
      body,
    }, requestOptions);
  }

  createNewClearingOrder(body: ClearingInstantOperationTypes["createNewClearingOrder"]["body"], requestOptions?: RequestOptions): Promise<ClearingInstantOperationTypes["createNewClearingOrder"]["response"]>;
  createNewClearingOrder(body: ClearingInstantOperationTypes["createNewClearingOrder"]["body"]): Promise<ClearingInstantOperationTypes["createNewClearingOrder"]["response"]>;
  createNewClearingOrder(body: ClearingInstantOperationTypes["createNewClearingOrder"]["body"], requestOptions?: RequestOptions): Promise<ClearingInstantOperationTypes["createNewClearingOrder"]["response"]> {
    const operation = CLEARING_INSTANT_OPERATIONS["createNewClearingOrder"];
    return executeRestOperation<ClearingInstantOperationTypes["createNewClearingOrder"]>(this.transport, operation, {
      body,
    }, requestOptions);
  }

  executeInstantOrder(body: ClearingInstantOperationTypes["executeInstantOrder"]["body"], requestOptions?: RequestOptions): Promise<ClearingInstantOperationTypes["executeInstantOrder"]["response"]>;
  executeInstantOrder(body: ClearingInstantOperationTypes["executeInstantOrder"]["body"]): Promise<ClearingInstantOperationTypes["executeInstantOrder"]["response"]>;
  executeInstantOrder(body: ClearingInstantOperationTypes["executeInstantOrder"]["body"], requestOptions?: RequestOptions): Promise<ClearingInstantOperationTypes["executeInstantOrder"]["response"]> {
    const operation = CLEARING_INSTANT_OPERATIONS["executeInstantOrder"];
    return executeRestOperation<ClearingInstantOperationTypes["executeInstantOrder"]>(this.transport, operation, {
      body,
    }, requestOptions);
  }

  getClearingOrder(body: ClearingInstantOperationTypes["getClearingOrder"]["body"], requestOptions?: RequestOptions): Promise<ClearingInstantOperationTypes["getClearingOrder"]["response"]>;
  getClearingOrder(body: ClearingInstantOperationTypes["getClearingOrder"]["body"]): Promise<ClearingInstantOperationTypes["getClearingOrder"]["response"]>;
  getClearingOrder(body: ClearingInstantOperationTypes["getClearingOrder"]["body"], requestOptions?: RequestOptions): Promise<ClearingInstantOperationTypes["getClearingOrder"]["response"]> {
    const operation = CLEARING_INSTANT_OPERATIONS["getClearingOrder"];
    return executeRestOperation<ClearingInstantOperationTypes["getClearingOrder"]>(this.transport, operation, {
      body,
    }, requestOptions);
  }

  getInstantQuote(body: ClearingInstantOperationTypes["getInstantQuote"]["body"], requestOptions?: RequestOptions): Promise<ClearingInstantOperationTypes["getInstantQuote"]["response"]>;
  getInstantQuote(body: ClearingInstantOperationTypes["getInstantQuote"]["body"]): Promise<ClearingInstantOperationTypes["getInstantQuote"]["response"]>;
  getInstantQuote(body: ClearingInstantOperationTypes["getInstantQuote"]["body"], requestOptions?: RequestOptions): Promise<ClearingInstantOperationTypes["getInstantQuote"]["response"]> {
    const operation = CLEARING_INSTANT_OPERATIONS["getInstantQuote"];
    return executeRestOperation<ClearingInstantOperationTypes["getInstantQuote"]>(this.transport, operation, {
      body,
    }, requestOptions);
  }

  listClearingBrokers(body: ClearingInstantOperationTypes["listClearingBrokers"]["body"], requestOptions?: RequestOptions): Promise<ClearingInstantOperationTypes["listClearingBrokers"]["response"]>;
  listClearingBrokers(body: ClearingInstantOperationTypes["listClearingBrokers"]["body"]): Promise<ClearingInstantOperationTypes["listClearingBrokers"]["response"]>;
  listClearingBrokers(body: ClearingInstantOperationTypes["listClearingBrokers"]["body"], requestOptions?: RequestOptions): Promise<ClearingInstantOperationTypes["listClearingBrokers"]["response"]> {
    const operation = CLEARING_INSTANT_OPERATIONS["listClearingBrokers"];
    return executeRestOperation<ClearingInstantOperationTypes["listClearingBrokers"]>(this.transport, operation, {
      body,
    }, requestOptions);
  }

  listClearingOrders(body: ClearingInstantOperationTypes["listClearingOrders"]["body"], requestOptions?: RequestOptions): Promise<ClearingInstantOperationTypes["listClearingOrders"]["response"]>;
  listClearingOrders(body: ClearingInstantOperationTypes["listClearingOrders"]["body"]): Promise<ClearingInstantOperationTypes["listClearingOrders"]["response"]>;
  listClearingOrders(body: ClearingInstantOperationTypes["listClearingOrders"]["body"], requestOptions?: RequestOptions): Promise<ClearingInstantOperationTypes["listClearingOrders"]["response"]> {
    const operation = CLEARING_INSTANT_OPERATIONS["listClearingOrders"];
    return executeRestOperation<ClearingInstantOperationTypes["listClearingOrders"]>(this.transport, operation, {
      body,
    }, requestOptions);
  }

  listClearingTrades(body: ClearingInstantOperationTypes["listClearingTrades"]["body"], requestOptions?: RequestOptions): Promise<ClearingInstantOperationTypes["listClearingTrades"]["response"]>;
  listClearingTrades(body: ClearingInstantOperationTypes["listClearingTrades"]["body"]): Promise<ClearingInstantOperationTypes["listClearingTrades"]["response"]>;
  listClearingTrades(body: ClearingInstantOperationTypes["listClearingTrades"]["body"], requestOptions?: RequestOptions): Promise<ClearingInstantOperationTypes["listClearingTrades"]["response"]> {
    const operation = CLEARING_INSTANT_OPERATIONS["listClearingTrades"];
    return executeRestOperation<ClearingInstantOperationTypes["listClearingTrades"]>(this.transport, operation, {
      body,
    }, requestOptions);
  }
}
