// Generated from rest.yaml#Perpetuals. Do not edit.

import type { HttpTransport } from "../../core/http.js";
import type { RequestOptions } from "../../core/deadline.js";
import { executeRestOperation } from "../../core/rest-operation.js";

import {
  PERPETUALS_OPERATIONS,
  type PerpetualsOperationTypes,
} from "./operations.js";

export class PerpetualsRest {
  constructor(private readonly transport: HttpTransport) {}

  getAccountMargin(body: PerpetualsOperationTypes["getAccountMargin"]["body"], requestOptions?: RequestOptions): Promise<PerpetualsOperationTypes["getAccountMargin"]["response"]>;
  getAccountMargin(body: PerpetualsOperationTypes["getAccountMargin"]["body"]): Promise<PerpetualsOperationTypes["getAccountMargin"]["response"]>;
  getAccountMargin(body: PerpetualsOperationTypes["getAccountMargin"]["body"], requestOptions?: RequestOptions): Promise<PerpetualsOperationTypes["getAccountMargin"]["response"]> {
    const operation = PERPETUALS_OPERATIONS["getAccountMargin"];
    return executeRestOperation<PerpetualsOperationTypes["getAccountMargin"]>(this.transport, operation, {
      body,
    }, requestOptions);
  }

  getFundingPaymentReportFile(input?: {
    query?: PerpetualsOperationTypes["getFundingPaymentReportFile"]["query"];
    body?: PerpetualsOperationTypes["getFundingPaymentReportFile"]["body"];
  }, requestOptions?: RequestOptions): Promise<PerpetualsOperationTypes["getFundingPaymentReportFile"]["response"]>;
  getFundingPaymentReportFile(input?: {
    query?: PerpetualsOperationTypes["getFundingPaymentReportFile"]["query"];
    body?: PerpetualsOperationTypes["getFundingPaymentReportFile"]["body"];
  }): Promise<PerpetualsOperationTypes["getFundingPaymentReportFile"]["response"]>;
  getFundingPaymentReportFile(input?: {
    query?: PerpetualsOperationTypes["getFundingPaymentReportFile"]["query"];
    body?: PerpetualsOperationTypes["getFundingPaymentReportFile"]["body"];
  }, requestOptions?: RequestOptions): Promise<PerpetualsOperationTypes["getFundingPaymentReportFile"]["response"]> {
    const operation = PERPETUALS_OPERATIONS["getFundingPaymentReportFile"];
    return executeRestOperation<PerpetualsOperationTypes["getFundingPaymentReportFile"]>(this.transport, operation, {
      query: input?.query,
      body: input?.body,
    }, requestOptions);
  }

  getFundingPaymentReportJson(input: {
    query?: PerpetualsOperationTypes["getFundingPaymentReportJson"]["query"];
    body: PerpetualsOperationTypes["getFundingPaymentReportJson"]["body"];
  }, requestOptions?: RequestOptions): Promise<PerpetualsOperationTypes["getFundingPaymentReportJson"]["response"]>;
  getFundingPaymentReportJson(input: {
    query?: PerpetualsOperationTypes["getFundingPaymentReportJson"]["query"];
    body: PerpetualsOperationTypes["getFundingPaymentReportJson"]["body"];
  }): Promise<PerpetualsOperationTypes["getFundingPaymentReportJson"]["response"]>;
  getFundingPaymentReportJson(input: {
    query?: PerpetualsOperationTypes["getFundingPaymentReportJson"]["query"];
    body: PerpetualsOperationTypes["getFundingPaymentReportJson"]["body"];
  }, requestOptions?: RequestOptions): Promise<PerpetualsOperationTypes["getFundingPaymentReportJson"]["response"]> {
    const operation = PERPETUALS_OPERATIONS["getFundingPaymentReportJson"];
    return executeRestOperation<PerpetualsOperationTypes["getFundingPaymentReportJson"]>(this.transport, operation, {
      query: input.query,
      body: input.body,
    }, requestOptions);
  }

  getOpenPositions(body: PerpetualsOperationTypes["getOpenPositions"]["body"], requestOptions?: RequestOptions): Promise<PerpetualsOperationTypes["getOpenPositions"]["response"]>;
  getOpenPositions(body: PerpetualsOperationTypes["getOpenPositions"]["body"]): Promise<PerpetualsOperationTypes["getOpenPositions"]["response"]>;
  getOpenPositions(body: PerpetualsOperationTypes["getOpenPositions"]["body"], requestOptions?: RequestOptions): Promise<PerpetualsOperationTypes["getOpenPositions"]["response"]> {
    const operation = PERPETUALS_OPERATIONS["getOpenPositions"];
    return executeRestOperation<PerpetualsOperationTypes["getOpenPositions"]>(this.transport, operation, {
      body,
    }, requestOptions);
  }

  getRiskStats(path: PerpetualsOperationTypes["getRiskStats"]["path"], requestOptions?: RequestOptions): Promise<PerpetualsOperationTypes["getRiskStats"]["response"]>;
  getRiskStats(path: PerpetualsOperationTypes["getRiskStats"]["path"]): Promise<PerpetualsOperationTypes["getRiskStats"]["response"]>;
  getRiskStats(path: PerpetualsOperationTypes["getRiskStats"]["path"], requestOptions?: RequestOptions): Promise<PerpetualsOperationTypes["getRiskStats"]["response"]> {
    const operation = PERPETUALS_OPERATIONS["getRiskStats"];
    return executeRestOperation<PerpetualsOperationTypes["getRiskStats"]>(this.transport, operation, {
      path,
    }, requestOptions);
  }

  listFundingPayments(input: {
    query?: PerpetualsOperationTypes["listFundingPayments"]["query"];
    body: PerpetualsOperationTypes["listFundingPayments"]["body"];
  }, requestOptions?: RequestOptions): Promise<PerpetualsOperationTypes["listFundingPayments"]["response"]>;
  listFundingPayments(input: {
    query?: PerpetualsOperationTypes["listFundingPayments"]["query"];
    body: PerpetualsOperationTypes["listFundingPayments"]["body"];
  }): Promise<PerpetualsOperationTypes["listFundingPayments"]["response"]>;
  listFundingPayments(input: {
    query?: PerpetualsOperationTypes["listFundingPayments"]["query"];
    body: PerpetualsOperationTypes["listFundingPayments"]["body"];
  }, requestOptions?: RequestOptions): Promise<PerpetualsOperationTypes["listFundingPayments"]["response"]> {
    const operation = PERPETUALS_OPERATIONS["listFundingPayments"];
    return executeRestOperation<PerpetualsOperationTypes["listFundingPayments"]>(this.transport, operation, {
      query: input.query,
      body: input.body,
    }, requestOptions);
  }
}
