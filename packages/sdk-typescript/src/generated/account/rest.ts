// Generated from rest.yaml#Account. Do not edit.

import type { HttpTransport } from "../../transport/http.js";
import type { RestPromise } from "../../transport/rest-promise.js";
import type { RequestOptions } from "../../utils/deadline.js";
import { executeRestOperation } from "../../transport/rest-operation.js";

import {
  ACCOUNT_OPERATIONS,
  type AccountOperationTypes,
} from "./operations.js";

export class AccountRest {
  constructor(private readonly transport: HttpTransport) {}

  addBank(input: AccountOperationTypes["addBank"]["input"], requestOptions?: RequestOptions): RestPromise<AccountOperationTypes["addBank"]["response"]> {
    const operation = ACCOUNT_OPERATIONS["addBank"];
    return executeRestOperation<AccountOperationTypes["addBank"]>(this.transport, operation, input, requestOptions);
  }

  addBankCAD(input: AccountOperationTypes["addBankCAD"]["input"], requestOptions?: RequestOptions): RestPromise<AccountOperationTypes["addBankCAD"]["response"]> {
    const operation = ACCOUNT_OPERATIONS["addBankCAD"];
    return executeRestOperation<AccountOperationTypes["addBankCAD"]>(this.transport, operation, input, requestOptions);
  }

  createNewAccount(input: AccountOperationTypes["createNewAccount"]["input"], requestOptions?: RequestOptions): RestPromise<AccountOperationTypes["createNewAccount"]["response"]> {
    const operation = ACCOUNT_OPERATIONS["createNewAccount"];
    return executeRestOperation<AccountOperationTypes["createNewAccount"]>(this.transport, operation, input, requestOptions);
  }

  createNewApprovedAddress(input: AccountOperationTypes["createNewApprovedAddress"]["input"], requestOptions?: RequestOptions): RestPromise<AccountOperationTypes["createNewApprovedAddress"]["response"]> {
    const operation = ACCOUNT_OPERATIONS["createNewApprovedAddress"];
    return executeRestOperation<AccountOperationTypes["createNewApprovedAddress"]>(this.transport, operation, input, requestOptions);
  }

  createNewDepositAddress(input: AccountOperationTypes["createNewDepositAddress"]["input"], requestOptions?: RequestOptions): RestPromise<AccountOperationTypes["createNewDepositAddress"]["response"]> {
    const operation = ACCOUNT_OPERATIONS["createNewDepositAddress"];
    return executeRestOperation<AccountOperationTypes["createNewDepositAddress"]>(this.transport, operation, input, requestOptions);
  }

  getAccountDetail(input?: AccountOperationTypes["getAccountDetail"]["input"], requestOptions?: RequestOptions): RestPromise<AccountOperationTypes["getAccountDetail"]["response"]> {
    const operation = ACCOUNT_OPERATIONS["getAccountDetail"];
    return executeRestOperation<AccountOperationTypes["getAccountDetail"]>(this.transport, operation, input, requestOptions);
  }

  getAvailableBalances(input: AccountOperationTypes["getAvailableBalances"]["input"], requestOptions?: RequestOptions): RestPromise<AccountOperationTypes["getAvailableBalances"]["response"]> {
    const operation = ACCOUNT_OPERATIONS["getAvailableBalances"];
    return executeRestOperation<AccountOperationTypes["getAvailableBalances"]>(this.transport, operation, input, requestOptions);
  }

  getNotionalBalances(input: AccountOperationTypes["getNotionalBalances"]["input"], requestOptions?: RequestOptions): RestPromise<AccountOperationTypes["getNotionalBalances"]["response"]> {
    const operation = ACCOUNT_OPERATIONS["getNotionalBalances"];
    return executeRestOperation<AccountOperationTypes["getNotionalBalances"]>(this.transport, operation, input, requestOptions);
  }

  getRoles(input?: AccountOperationTypes["getRoles"]["input"], requestOptions?: RequestOptions): RestPromise<AccountOperationTypes["getRoles"]["response"]> {
    const operation = ACCOUNT_OPERATIONS["getRoles"];
    return executeRestOperation<AccountOperationTypes["getRoles"]>(this.transport, operation, input, requestOptions);
  }

  listAccountsInGroup(input?: AccountOperationTypes["listAccountsInGroup"]["input"], requestOptions?: RequestOptions): RestPromise<AccountOperationTypes["listAccountsInGroup"]["response"]> {
    const operation = ACCOUNT_OPERATIONS["listAccountsInGroup"];
    return executeRestOperation<AccountOperationTypes["listAccountsInGroup"]>(this.transport, operation, input, requestOptions);
  }

  listApprovedAddresses(input: AccountOperationTypes["listApprovedAddresses"]["input"], requestOptions?: RequestOptions): RestPromise<AccountOperationTypes["listApprovedAddresses"]["response"]> {
    const operation = ACCOUNT_OPERATIONS["listApprovedAddresses"];
    return executeRestOperation<AccountOperationTypes["listApprovedAddresses"]>(this.transport, operation, input, requestOptions);
  }

  listDepositAddresses(input: AccountOperationTypes["listDepositAddresses"]["input"], requestOptions?: RequestOptions): RestPromise<AccountOperationTypes["listDepositAddresses"]["response"]> {
    const operation = ACCOUNT_OPERATIONS["listDepositAddresses"];
    return executeRestOperation<AccountOperationTypes["listDepositAddresses"]>(this.transport, operation, input, requestOptions);
  }

  listPaymentMethods(input?: AccountOperationTypes["listPaymentMethods"]["input"], requestOptions?: RequestOptions): RestPromise<AccountOperationTypes["listPaymentMethods"]["response"]> {
    const operation = ACCOUNT_OPERATIONS["listPaymentMethods"];
    return executeRestOperation<AccountOperationTypes["listPaymentMethods"]>(this.transport, operation, input, requestOptions);
  }

  removeApprovedAddress(input: AccountOperationTypes["removeApprovedAddress"]["input"], requestOptions?: RequestOptions): RestPromise<AccountOperationTypes["removeApprovedAddress"]["response"]> {
    const operation = ACCOUNT_OPERATIONS["removeApprovedAddress"];
    return executeRestOperation<AccountOperationTypes["removeApprovedAddress"]>(this.transport, operation, input, requestOptions);
  }

  renameAccount(input?: AccountOperationTypes["renameAccount"]["input"], requestOptions?: RequestOptions): RestPromise<AccountOperationTypes["renameAccount"]["response"]> {
    const operation = ACCOUNT_OPERATIONS["renameAccount"];
    return executeRestOperation<AccountOperationTypes["renameAccount"]>(this.transport, operation, input, requestOptions);
  }

  revokeOAuthToken(input?: AccountOperationTypes["revokeOAuthToken"]["input"], requestOptions?: RequestOptions): RestPromise<AccountOperationTypes["revokeOAuthToken"]["response"]> {
    const operation = ACCOUNT_OPERATIONS["revokeOAuthToken"];
    return executeRestOperation<AccountOperationTypes["revokeOAuthToken"]>(this.transport, operation, input, requestOptions);
  }
}
