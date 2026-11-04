// Generated from rest.yaml#Margin. Do not edit.

import type { HttpTransport } from "../../transport/http.js";
import type { RestPromise } from "../../transport/rest-promise.js";
import type { RequestOptions } from "../../utils/deadline.js";
import { executeRestOperation } from "../../transport/rest-operation.js";

import {
  MARGIN_OPERATIONS,
  type MarginOperationTypes,
} from "./operations.js";

export class MarginRest {
  constructor(private readonly transport: HttpTransport) {}

  getMarginAccount(input?: MarginOperationTypes["getMarginAccount"]["input"], requestOptions?: RequestOptions): RestPromise<MarginOperationTypes["getMarginAccount"]["response"]> {
    const operation = MARGIN_OPERATIONS["getMarginAccount"];
    return executeRestOperation<MarginOperationTypes["getMarginAccount"]>(this.transport, operation, input, requestOptions);
  }

  getMarginRates(input?: MarginOperationTypes["getMarginRates"]["input"], requestOptions?: RequestOptions): RestPromise<MarginOperationTypes["getMarginRates"]["response"]> {
    const operation = MARGIN_OPERATIONS["getMarginRates"];
    return executeRestOperation<MarginOperationTypes["getMarginRates"]>(this.transport, operation, input, requestOptions);
  }

  previewMarginOrder(input: MarginOperationTypes["previewMarginOrder"]["input"], requestOptions?: RequestOptions): RestPromise<MarginOperationTypes["previewMarginOrder"]["response"]> {
    const operation = MARGIN_OPERATIONS["previewMarginOrder"];
    return executeRestOperation<MarginOperationTypes["previewMarginOrder"]>(this.transport, operation, input, requestOptions);
  }
}
