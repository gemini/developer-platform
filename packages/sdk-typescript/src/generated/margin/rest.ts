// Generated from rest.yaml#Margin. Do not edit.

import type { HttpTransport } from "../../core/http.js";
import type { RequestOptions } from "../../core/deadline.js";
import { executeRestOperation } from "../../core/rest-operation.js";

import {
  MARGIN_OPERATIONS,
  type MarginOperationTypes,
} from "./operations.js";

export class MarginRest {
  constructor(private readonly transport: HttpTransport) {}

  getMarginAccount(body: MarginOperationTypes["getMarginAccount"]["body"], requestOptions?: RequestOptions): Promise<MarginOperationTypes["getMarginAccount"]["response"]>;
  getMarginAccount(body: MarginOperationTypes["getMarginAccount"]["body"]): Promise<MarginOperationTypes["getMarginAccount"]["response"]>;
  getMarginAccount(body: MarginOperationTypes["getMarginAccount"]["body"], requestOptions?: RequestOptions): Promise<MarginOperationTypes["getMarginAccount"]["response"]> {
    const operation = MARGIN_OPERATIONS["getMarginAccount"];
    return executeRestOperation<MarginOperationTypes["getMarginAccount"]>(this.transport, operation, {
      body,
    }, requestOptions);
  }

  getMarginRates(body: MarginOperationTypes["getMarginRates"]["body"], requestOptions?: RequestOptions): Promise<MarginOperationTypes["getMarginRates"]["response"]>;
  getMarginRates(body: MarginOperationTypes["getMarginRates"]["body"]): Promise<MarginOperationTypes["getMarginRates"]["response"]>;
  getMarginRates(body: MarginOperationTypes["getMarginRates"]["body"], requestOptions?: RequestOptions): Promise<MarginOperationTypes["getMarginRates"]["response"]> {
    const operation = MARGIN_OPERATIONS["getMarginRates"];
    return executeRestOperation<MarginOperationTypes["getMarginRates"]>(this.transport, operation, {
      body,
    }, requestOptions);
  }

  previewMarginOrder(body: MarginOperationTypes["previewMarginOrder"]["body"], requestOptions?: RequestOptions): Promise<MarginOperationTypes["previewMarginOrder"]["response"]>;
  previewMarginOrder(body: MarginOperationTypes["previewMarginOrder"]["body"]): Promise<MarginOperationTypes["previewMarginOrder"]["response"]>;
  previewMarginOrder(body: MarginOperationTypes["previewMarginOrder"]["body"], requestOptions?: RequestOptions): Promise<MarginOperationTypes["previewMarginOrder"]["response"]> {
    const operation = MARGIN_OPERATIONS["previewMarginOrder"];
    return executeRestOperation<MarginOperationTypes["previewMarginOrder"]>(this.transport, operation, {
      body,
    }, requestOptions);
  }
}
