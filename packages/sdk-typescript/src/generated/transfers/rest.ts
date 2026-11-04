// Generated from rest.yaml#Transfers. Do not edit.

import type { HttpTransport } from "../../transport/http.js";
import type { RestPromise } from "../../transport/rest-promise.js";
import type { RequestOptions } from "../../utils/deadline.js";
import { executeRestOperation } from "../../transport/rest-operation.js";

import {
  TRANSFERS_OPERATIONS,
  type TransfersOperationTypes,
} from "./operations.js";

export class TransfersRest {
  constructor(private readonly transport: HttpTransport) {}

  getGasFeeEstimation(input: TransfersOperationTypes["getGasFeeEstimation"]["input"], requestOptions?: RequestOptions): RestPromise<TransfersOperationTypes["getGasFeeEstimation"]["response"]> {
    const operation = TRANSFERS_OPERATIONS["getGasFeeEstimation"];
    return executeRestOperation<TransfersOperationTypes["getGasFeeEstimation"]>(this.transport, operation, input, requestOptions);
  }

  getTransactionHistory(input?: TransfersOperationTypes["getTransactionHistory"]["input"], requestOptions?: RequestOptions): RestPromise<TransfersOperationTypes["getTransactionHistory"]["response"]> {
    const operation = TRANSFERS_OPERATIONS["getTransactionHistory"];
    return executeRestOperation<TransfersOperationTypes["getTransactionHistory"]>(this.transport, operation, input, requestOptions);
  }

  listCustodyFeeTransfers(input?: TransfersOperationTypes["listCustodyFeeTransfers"]["input"], requestOptions?: RequestOptions): RestPromise<TransfersOperationTypes["listCustodyFeeTransfers"]["response"]> {
    const operation = TRANSFERS_OPERATIONS["listCustodyFeeTransfers"];
    return executeRestOperation<TransfersOperationTypes["listCustodyFeeTransfers"]>(this.transport, operation, input, requestOptions);
  }

  listPastTransfers(input?: TransfersOperationTypes["listPastTransfers"]["input"], requestOptions?: RequestOptions): RestPromise<TransfersOperationTypes["listPastTransfers"]["response"]> {
    const operation = TRANSFERS_OPERATIONS["listPastTransfers"];
    return executeRestOperation<TransfersOperationTypes["listPastTransfers"]>(this.transport, operation, input, requestOptions);
  }

  transferBetweenAccounts(input: TransfersOperationTypes["transferBetweenAccounts"]["input"], requestOptions?: RequestOptions): RestPromise<TransfersOperationTypes["transferBetweenAccounts"]["response"]> {
    const operation = TRANSFERS_OPERATIONS["transferBetweenAccounts"];
    return executeRestOperation<TransfersOperationTypes["transferBetweenAccounts"]>(this.transport, operation, input, requestOptions);
  }

  withdrawCryptoFunds(input: TransfersOperationTypes["withdrawCryptoFunds"]["input"], requestOptions?: RequestOptions): RestPromise<TransfersOperationTypes["withdrawCryptoFunds"]["response"]> {
    const operation = TRANSFERS_OPERATIONS["withdrawCryptoFunds"];
    return executeRestOperation<TransfersOperationTypes["withdrawCryptoFunds"]>(this.transport, operation, input, requestOptions);
  }
}
