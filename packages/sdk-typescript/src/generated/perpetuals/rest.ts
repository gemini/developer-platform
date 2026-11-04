// Generated from rest.yaml#Perpetuals. Do not edit.

import type { HttpTransport } from "../../transport/http.js";
import type { RestPromise } from "../../transport/rest-promise.js";
import type { RequestOptions } from "../../utils/deadline.js";
import { executeRestOperation } from "../../transport/rest-operation.js";

import {
  PERPETUALS_OPERATIONS,
  type PerpetualsOperationTypes,
} from "./operations.js";

export class PerpetualsRest {
  constructor(private readonly transport: HttpTransport) {}

  getAccountMargin(input: PerpetualsOperationTypes["getAccountMargin"]["input"], requestOptions?: RequestOptions): RestPromise<PerpetualsOperationTypes["getAccountMargin"]["response"]> {
    const operation = PERPETUALS_OPERATIONS["getAccountMargin"];
    return executeRestOperation<PerpetualsOperationTypes["getAccountMargin"]>(this.transport, operation, input, requestOptions);
  }

  getFundingPaymentReportFile(input?: PerpetualsOperationTypes["getFundingPaymentReportFile"]["input"], requestOptions?: RequestOptions): RestPromise<PerpetualsOperationTypes["getFundingPaymentReportFile"]["response"]> {
    const operation = PERPETUALS_OPERATIONS["getFundingPaymentReportFile"];
    return executeRestOperation<PerpetualsOperationTypes["getFundingPaymentReportFile"]>(this.transport, operation, input, requestOptions);
  }

  getFundingPaymentReportJson(input?: PerpetualsOperationTypes["getFundingPaymentReportJson"]["input"], requestOptions?: RequestOptions): RestPromise<PerpetualsOperationTypes["getFundingPaymentReportJson"]["response"]> {
    const operation = PERPETUALS_OPERATIONS["getFundingPaymentReportJson"];
    return executeRestOperation<PerpetualsOperationTypes["getFundingPaymentReportJson"]>(this.transport, operation, input, requestOptions);
  }

  getOpenPositions(input?: PerpetualsOperationTypes["getOpenPositions"]["input"], requestOptions?: RequestOptions): RestPromise<PerpetualsOperationTypes["getOpenPositions"]["response"]> {
    const operation = PERPETUALS_OPERATIONS["getOpenPositions"];
    return executeRestOperation<PerpetualsOperationTypes["getOpenPositions"]>(this.transport, operation, input, requestOptions);
  }

  getRiskStats(input: PerpetualsOperationTypes["getRiskStats"]["input"], requestOptions?: RequestOptions): RestPromise<PerpetualsOperationTypes["getRiskStats"]["response"]> {
    const operation = PERPETUALS_OPERATIONS["getRiskStats"];
    return executeRestOperation<PerpetualsOperationTypes["getRiskStats"]>(this.transport, operation, input, requestOptions);
  }

  listFundingPayments(input?: PerpetualsOperationTypes["listFundingPayments"]["input"], requestOptions?: RequestOptions): RestPromise<PerpetualsOperationTypes["listFundingPayments"]["response"]> {
    const operation = PERPETUALS_OPERATIONS["listFundingPayments"];
    return executeRestOperation<PerpetualsOperationTypes["listFundingPayments"]>(this.transport, operation, input, requestOptions);
  }
}
