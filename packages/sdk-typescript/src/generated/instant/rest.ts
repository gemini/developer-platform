// Generated from rest.yaml#Instant. Do not edit.

import type { HttpTransport } from "../../transport/http.js";
import type { RestPromise } from "../../transport/rest-promise.js";
import type { RequestOptions } from "../../utils/deadline.js";
import { executeRestOperation } from "../../transport/rest-operation.js";

import {
  INSTANT_OPERATIONS,
  type InstantOperationTypes,
} from "./operations.js";

export class InstantRest {
  constructor(private readonly transport: HttpTransport) {}

  executeInstantOrder(input: InstantOperationTypes["executeInstantOrder"]["input"], requestOptions?: RequestOptions): RestPromise<InstantOperationTypes["executeInstantOrder"]["response"]> {
    const operation = INSTANT_OPERATIONS["executeInstantOrder"];
    return executeRestOperation<InstantOperationTypes["executeInstantOrder"]>(this.transport, operation, input, requestOptions);
  }

  getInstantQuote(input: InstantOperationTypes["getInstantQuote"]["input"], requestOptions?: RequestOptions): RestPromise<InstantOperationTypes["getInstantQuote"]["response"]> {
    const operation = INSTANT_OPERATIONS["getInstantQuote"];
    return executeRestOperation<InstantOperationTypes["getInstantQuote"]>(this.transport, operation, input, requestOptions);
  }
}
