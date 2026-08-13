// Generated from rest.yaml#Account Services. Do not edit.

import type { HttpTransport } from "../../core/http.js";
import type { RequestOptions } from "../../core/deadline.js";
import { executeRestOperation } from "../../core/rest-operation.js";

import {
  ACCOUNT_SERVICES_OPERATIONS,
  type AccountServicesOperationTypes,
} from "./operations.js";

export class AccountServicesRest {
  constructor(private readonly transport: HttpTransport) {}

  addBank(body: AccountServicesOperationTypes["addBank"]["body"], requestOptions?: RequestOptions): Promise<AccountServicesOperationTypes["addBank"]["response"]>;
  addBank(body: AccountServicesOperationTypes["addBank"]["body"]): Promise<AccountServicesOperationTypes["addBank"]["response"]>;
  addBank(body: AccountServicesOperationTypes["addBank"]["body"], requestOptions?: RequestOptions): Promise<AccountServicesOperationTypes["addBank"]["response"]> {
    const operation = ACCOUNT_SERVICES_OPERATIONS["addBank"];
    return executeRestOperation<AccountServicesOperationTypes["addBank"]>(this.transport, operation, {
      body,
    }, requestOptions);
  }

  addBankCAD(body: AccountServicesOperationTypes["addBankCAD"]["body"], requestOptions?: RequestOptions): Promise<AccountServicesOperationTypes["addBankCAD"]["response"]>;
  addBankCAD(body: AccountServicesOperationTypes["addBankCAD"]["body"]): Promise<AccountServicesOperationTypes["addBankCAD"]["response"]>;
  addBankCAD(body: AccountServicesOperationTypes["addBankCAD"]["body"], requestOptions?: RequestOptions): Promise<AccountServicesOperationTypes["addBankCAD"]["response"]> {
    const operation = ACCOUNT_SERVICES_OPERATIONS["addBankCAD"];
    return executeRestOperation<AccountServicesOperationTypes["addBankCAD"]>(this.transport, operation, {
      body,
    }, requestOptions);
  }

  createNewAccount(body: AccountServicesOperationTypes["createNewAccount"]["body"], requestOptions?: RequestOptions): Promise<AccountServicesOperationTypes["createNewAccount"]["response"]>;
  createNewAccount(body: AccountServicesOperationTypes["createNewAccount"]["body"]): Promise<AccountServicesOperationTypes["createNewAccount"]["response"]>;
  createNewAccount(body: AccountServicesOperationTypes["createNewAccount"]["body"], requestOptions?: RequestOptions): Promise<AccountServicesOperationTypes["createNewAccount"]["response"]> {
    const operation = ACCOUNT_SERVICES_OPERATIONS["createNewAccount"];
    return executeRestOperation<AccountServicesOperationTypes["createNewAccount"]>(this.transport, operation, {
      body,
    }, requestOptions);
  }

  createNewApprovedAddress(input: {
    path: AccountServicesOperationTypes["createNewApprovedAddress"]["path"];
    body: AccountServicesOperationTypes["createNewApprovedAddress"]["body"];
  }, requestOptions?: RequestOptions): Promise<AccountServicesOperationTypes["createNewApprovedAddress"]["response"]>;
  createNewApprovedAddress(input: {
    path: AccountServicesOperationTypes["createNewApprovedAddress"]["path"];
    body: AccountServicesOperationTypes["createNewApprovedAddress"]["body"];
  }): Promise<AccountServicesOperationTypes["createNewApprovedAddress"]["response"]>;
  createNewApprovedAddress(input: {
    path: AccountServicesOperationTypes["createNewApprovedAddress"]["path"];
    body: AccountServicesOperationTypes["createNewApprovedAddress"]["body"];
  }, requestOptions?: RequestOptions): Promise<AccountServicesOperationTypes["createNewApprovedAddress"]["response"]> {
    const operation = ACCOUNT_SERVICES_OPERATIONS["createNewApprovedAddress"];
    return executeRestOperation<AccountServicesOperationTypes["createNewApprovedAddress"]>(this.transport, operation, {
      path: input.path,
      body: input.body,
    }, requestOptions);
  }

  createNewDepositAddress(input: {
    path: AccountServicesOperationTypes["createNewDepositAddress"]["path"];
    body: AccountServicesOperationTypes["createNewDepositAddress"]["body"];
  }, requestOptions?: RequestOptions): Promise<AccountServicesOperationTypes["createNewDepositAddress"]["response"]>;
  createNewDepositAddress(input: {
    path: AccountServicesOperationTypes["createNewDepositAddress"]["path"];
    body: AccountServicesOperationTypes["createNewDepositAddress"]["body"];
  }): Promise<AccountServicesOperationTypes["createNewDepositAddress"]["response"]>;
  createNewDepositAddress(input: {
    path: AccountServicesOperationTypes["createNewDepositAddress"]["path"];
    body: AccountServicesOperationTypes["createNewDepositAddress"]["body"];
  }, requestOptions?: RequestOptions): Promise<AccountServicesOperationTypes["createNewDepositAddress"]["response"]> {
    const operation = ACCOUNT_SERVICES_OPERATIONS["createNewDepositAddress"];
    return executeRestOperation<AccountServicesOperationTypes["createNewDepositAddress"]>(this.transport, operation, {
      path: input.path,
      body: input.body,
    }, requestOptions);
  }

  getAccountDetail(body: AccountServicesOperationTypes["getAccountDetail"]["body"], requestOptions?: RequestOptions): Promise<AccountServicesOperationTypes["getAccountDetail"]["response"]>;
  getAccountDetail(body: AccountServicesOperationTypes["getAccountDetail"]["body"]): Promise<AccountServicesOperationTypes["getAccountDetail"]["response"]>;
  getAccountDetail(body: AccountServicesOperationTypes["getAccountDetail"]["body"], requestOptions?: RequestOptions): Promise<AccountServicesOperationTypes["getAccountDetail"]["response"]> {
    const operation = ACCOUNT_SERVICES_OPERATIONS["getAccountDetail"];
    return executeRestOperation<AccountServicesOperationTypes["getAccountDetail"]>(this.transport, operation, {
      body,
    }, requestOptions);
  }

  getAvailableBalances(body: AccountServicesOperationTypes["getAvailableBalances"]["body"], requestOptions?: RequestOptions): Promise<AccountServicesOperationTypes["getAvailableBalances"]["response"]>;
  getAvailableBalances(body: AccountServicesOperationTypes["getAvailableBalances"]["body"]): Promise<AccountServicesOperationTypes["getAvailableBalances"]["response"]>;
  getAvailableBalances(body: AccountServicesOperationTypes["getAvailableBalances"]["body"], requestOptions?: RequestOptions): Promise<AccountServicesOperationTypes["getAvailableBalances"]["response"]> {
    const operation = ACCOUNT_SERVICES_OPERATIONS["getAvailableBalances"];
    return executeRestOperation<AccountServicesOperationTypes["getAvailableBalances"]>(this.transport, operation, {
      body,
    }, requestOptions);
  }

  getGasFeeEstimation(input: {
    path: AccountServicesOperationTypes["getGasFeeEstimation"]["path"];
    body: AccountServicesOperationTypes["getGasFeeEstimation"]["body"];
  }, requestOptions?: RequestOptions): Promise<AccountServicesOperationTypes["getGasFeeEstimation"]["response"]>;
  getGasFeeEstimation(input: {
    path: AccountServicesOperationTypes["getGasFeeEstimation"]["path"];
    body: AccountServicesOperationTypes["getGasFeeEstimation"]["body"];
  }): Promise<AccountServicesOperationTypes["getGasFeeEstimation"]["response"]>;
  getGasFeeEstimation(input: {
    path: AccountServicesOperationTypes["getGasFeeEstimation"]["path"];
    body: AccountServicesOperationTypes["getGasFeeEstimation"]["body"];
  }, requestOptions?: RequestOptions): Promise<AccountServicesOperationTypes["getGasFeeEstimation"]["response"]> {
    const operation = ACCOUNT_SERVICES_OPERATIONS["getGasFeeEstimation"];
    return executeRestOperation<AccountServicesOperationTypes["getGasFeeEstimation"]>(this.transport, operation, {
      path: input.path,
      body: input.body,
    }, requestOptions);
  }

  getNotionalBalances(input: {
    path: AccountServicesOperationTypes["getNotionalBalances"]["path"];
    body: AccountServicesOperationTypes["getNotionalBalances"]["body"];
  }, requestOptions?: RequestOptions): Promise<AccountServicesOperationTypes["getNotionalBalances"]["response"]>;
  getNotionalBalances(input: {
    path: AccountServicesOperationTypes["getNotionalBalances"]["path"];
    body: AccountServicesOperationTypes["getNotionalBalances"]["body"];
  }): Promise<AccountServicesOperationTypes["getNotionalBalances"]["response"]>;
  getNotionalBalances(input: {
    path: AccountServicesOperationTypes["getNotionalBalances"]["path"];
    body: AccountServicesOperationTypes["getNotionalBalances"]["body"];
  }, requestOptions?: RequestOptions): Promise<AccountServicesOperationTypes["getNotionalBalances"]["response"]> {
    const operation = ACCOUNT_SERVICES_OPERATIONS["getNotionalBalances"];
    return executeRestOperation<AccountServicesOperationTypes["getNotionalBalances"]>(this.transport, operation, {
      path: input.path,
      body: input.body,
    }, requestOptions);
  }

  getRoles(body: AccountServicesOperationTypes["getRoles"]["body"], requestOptions?: RequestOptions): Promise<AccountServicesOperationTypes["getRoles"]["response"]>;
  getRoles(body: AccountServicesOperationTypes["getRoles"]["body"]): Promise<AccountServicesOperationTypes["getRoles"]["response"]>;
  getRoles(body: AccountServicesOperationTypes["getRoles"]["body"], requestOptions?: RequestOptions): Promise<AccountServicesOperationTypes["getRoles"]["response"]> {
    const operation = ACCOUNT_SERVICES_OPERATIONS["getRoles"];
    return executeRestOperation<AccountServicesOperationTypes["getRoles"]>(this.transport, operation, {
      body,
    }, requestOptions);
  }

  getTransactionHistory(body: AccountServicesOperationTypes["getTransactionHistory"]["body"], requestOptions?: RequestOptions): Promise<AccountServicesOperationTypes["getTransactionHistory"]["response"]>;
  getTransactionHistory(body: AccountServicesOperationTypes["getTransactionHistory"]["body"]): Promise<AccountServicesOperationTypes["getTransactionHistory"]["response"]>;
  getTransactionHistory(body: AccountServicesOperationTypes["getTransactionHistory"]["body"], requestOptions?: RequestOptions): Promise<AccountServicesOperationTypes["getTransactionHistory"]["response"]> {
    const operation = ACCOUNT_SERVICES_OPERATIONS["getTransactionHistory"];
    return executeRestOperation<AccountServicesOperationTypes["getTransactionHistory"]>(this.transport, operation, {
      body,
    }, requestOptions);
  }

  listAccountsInGroup(body: AccountServicesOperationTypes["listAccountsInGroup"]["body"], requestOptions?: RequestOptions): Promise<AccountServicesOperationTypes["listAccountsInGroup"]["response"]>;
  listAccountsInGroup(body: AccountServicesOperationTypes["listAccountsInGroup"]["body"]): Promise<AccountServicesOperationTypes["listAccountsInGroup"]["response"]>;
  listAccountsInGroup(body: AccountServicesOperationTypes["listAccountsInGroup"]["body"], requestOptions?: RequestOptions): Promise<AccountServicesOperationTypes["listAccountsInGroup"]["response"]> {
    const operation = ACCOUNT_SERVICES_OPERATIONS["listAccountsInGroup"];
    return executeRestOperation<AccountServicesOperationTypes["listAccountsInGroup"]>(this.transport, operation, {
      body,
    }, requestOptions);
  }

  listApprovedAddresses(input: {
    path: AccountServicesOperationTypes["listApprovedAddresses"]["path"];
    body: AccountServicesOperationTypes["listApprovedAddresses"]["body"];
  }, requestOptions?: RequestOptions): Promise<AccountServicesOperationTypes["listApprovedAddresses"]["response"]>;
  listApprovedAddresses(input: {
    path: AccountServicesOperationTypes["listApprovedAddresses"]["path"];
    body: AccountServicesOperationTypes["listApprovedAddresses"]["body"];
  }): Promise<AccountServicesOperationTypes["listApprovedAddresses"]["response"]>;
  listApprovedAddresses(input: {
    path: AccountServicesOperationTypes["listApprovedAddresses"]["path"];
    body: AccountServicesOperationTypes["listApprovedAddresses"]["body"];
  }, requestOptions?: RequestOptions): Promise<AccountServicesOperationTypes["listApprovedAddresses"]["response"]> {
    const operation = ACCOUNT_SERVICES_OPERATIONS["listApprovedAddresses"];
    return executeRestOperation<AccountServicesOperationTypes["listApprovedAddresses"]>(this.transport, operation, {
      path: input.path,
      body: input.body,
    }, requestOptions);
  }

  listCustodyFeeTransfers(body: AccountServicesOperationTypes["listCustodyFeeTransfers"]["body"], requestOptions?: RequestOptions): Promise<AccountServicesOperationTypes["listCustodyFeeTransfers"]["response"]>;
  listCustodyFeeTransfers(body: AccountServicesOperationTypes["listCustodyFeeTransfers"]["body"]): Promise<AccountServicesOperationTypes["listCustodyFeeTransfers"]["response"]>;
  listCustodyFeeTransfers(body: AccountServicesOperationTypes["listCustodyFeeTransfers"]["body"], requestOptions?: RequestOptions): Promise<AccountServicesOperationTypes["listCustodyFeeTransfers"]["response"]> {
    const operation = ACCOUNT_SERVICES_OPERATIONS["listCustodyFeeTransfers"];
    return executeRestOperation<AccountServicesOperationTypes["listCustodyFeeTransfers"]>(this.transport, operation, {
      body,
    }, requestOptions);
  }

  listDepositAddresses(input: {
    path: AccountServicesOperationTypes["listDepositAddresses"]["path"];
    body: AccountServicesOperationTypes["listDepositAddresses"]["body"];
  }, requestOptions?: RequestOptions): Promise<AccountServicesOperationTypes["listDepositAddresses"]["response"]>;
  listDepositAddresses(input: {
    path: AccountServicesOperationTypes["listDepositAddresses"]["path"];
    body: AccountServicesOperationTypes["listDepositAddresses"]["body"];
  }): Promise<AccountServicesOperationTypes["listDepositAddresses"]["response"]>;
  listDepositAddresses(input: {
    path: AccountServicesOperationTypes["listDepositAddresses"]["path"];
    body: AccountServicesOperationTypes["listDepositAddresses"]["body"];
  }, requestOptions?: RequestOptions): Promise<AccountServicesOperationTypes["listDepositAddresses"]["response"]> {
    const operation = ACCOUNT_SERVICES_OPERATIONS["listDepositAddresses"];
    return executeRestOperation<AccountServicesOperationTypes["listDepositAddresses"]>(this.transport, operation, {
      path: input.path,
      body: input.body,
    }, requestOptions);
  }

  listPastTransfers(body: AccountServicesOperationTypes["listPastTransfers"]["body"], requestOptions?: RequestOptions): Promise<AccountServicesOperationTypes["listPastTransfers"]["response"]>;
  listPastTransfers(body: AccountServicesOperationTypes["listPastTransfers"]["body"]): Promise<AccountServicesOperationTypes["listPastTransfers"]["response"]>;
  listPastTransfers(body: AccountServicesOperationTypes["listPastTransfers"]["body"], requestOptions?: RequestOptions): Promise<AccountServicesOperationTypes["listPastTransfers"]["response"]> {
    const operation = ACCOUNT_SERVICES_OPERATIONS["listPastTransfers"];
    return executeRestOperation<AccountServicesOperationTypes["listPastTransfers"]>(this.transport, operation, {
      body,
    }, requestOptions);
  }

  listPaymentMethods(body: AccountServicesOperationTypes["listPaymentMethods"]["body"], requestOptions?: RequestOptions): Promise<AccountServicesOperationTypes["listPaymentMethods"]["response"]>;
  listPaymentMethods(body: AccountServicesOperationTypes["listPaymentMethods"]["body"]): Promise<AccountServicesOperationTypes["listPaymentMethods"]["response"]>;
  listPaymentMethods(body: AccountServicesOperationTypes["listPaymentMethods"]["body"], requestOptions?: RequestOptions): Promise<AccountServicesOperationTypes["listPaymentMethods"]["response"]> {
    const operation = ACCOUNT_SERVICES_OPERATIONS["listPaymentMethods"];
    return executeRestOperation<AccountServicesOperationTypes["listPaymentMethods"]>(this.transport, operation, {
      body,
    }, requestOptions);
  }

  listStakingBalances(body: AccountServicesOperationTypes["listStakingBalances"]["body"], requestOptions?: RequestOptions): Promise<AccountServicesOperationTypes["listStakingBalances"]["response"]>;
  listStakingBalances(body: AccountServicesOperationTypes["listStakingBalances"]["body"]): Promise<AccountServicesOperationTypes["listStakingBalances"]["response"]>;
  listStakingBalances(body: AccountServicesOperationTypes["listStakingBalances"]["body"], requestOptions?: RequestOptions): Promise<AccountServicesOperationTypes["listStakingBalances"]["response"]> {
    const operation = ACCOUNT_SERVICES_OPERATIONS["listStakingBalances"];
    return executeRestOperation<AccountServicesOperationTypes["listStakingBalances"]>(this.transport, operation, {
      body,
    }, requestOptions);
  }

  listStakingEventHistory(body: AccountServicesOperationTypes["listStakingEventHistory"]["body"], requestOptions?: RequestOptions): Promise<AccountServicesOperationTypes["listStakingEventHistory"]["response"]>;
  listStakingEventHistory(body: AccountServicesOperationTypes["listStakingEventHistory"]["body"]): Promise<AccountServicesOperationTypes["listStakingEventHistory"]["response"]>;
  listStakingEventHistory(body: AccountServicesOperationTypes["listStakingEventHistory"]["body"], requestOptions?: RequestOptions): Promise<AccountServicesOperationTypes["listStakingEventHistory"]["response"]> {
    const operation = ACCOUNT_SERVICES_OPERATIONS["listStakingEventHistory"];
    return executeRestOperation<AccountServicesOperationTypes["listStakingEventHistory"]>(this.transport, operation, {
      body,
    }, requestOptions);
  }

  listStakingRates(requestOptions?: RequestOptions): Promise<AccountServicesOperationTypes["listStakingRates"]["response"]>;
  listStakingRates(): Promise<AccountServicesOperationTypes["listStakingRates"]["response"]>;
  listStakingRates(requestOptions?: RequestOptions): Promise<AccountServicesOperationTypes["listStakingRates"]["response"]> {
    const operation = ACCOUNT_SERVICES_OPERATIONS["listStakingRates"];
    return executeRestOperation<AccountServicesOperationTypes["listStakingRates"]>(this.transport, operation, {}, requestOptions);
  }

  listStakingRewards(body: AccountServicesOperationTypes["listStakingRewards"]["body"], requestOptions?: RequestOptions): Promise<AccountServicesOperationTypes["listStakingRewards"]["response"]>;
  listStakingRewards(body: AccountServicesOperationTypes["listStakingRewards"]["body"]): Promise<AccountServicesOperationTypes["listStakingRewards"]["response"]>;
  listStakingRewards(body: AccountServicesOperationTypes["listStakingRewards"]["body"], requestOptions?: RequestOptions): Promise<AccountServicesOperationTypes["listStakingRewards"]["response"]> {
    const operation = ACCOUNT_SERVICES_OPERATIONS["listStakingRewards"];
    return executeRestOperation<AccountServicesOperationTypes["listStakingRewards"]>(this.transport, operation, {
      body,
    }, requestOptions);
  }

  removeApprovedAddress(input: {
    path: AccountServicesOperationTypes["removeApprovedAddress"]["path"];
    body: AccountServicesOperationTypes["removeApprovedAddress"]["body"];
  }, requestOptions?: RequestOptions): Promise<AccountServicesOperationTypes["removeApprovedAddress"]["response"]>;
  removeApprovedAddress(input: {
    path: AccountServicesOperationTypes["removeApprovedAddress"]["path"];
    body: AccountServicesOperationTypes["removeApprovedAddress"]["body"];
  }): Promise<AccountServicesOperationTypes["removeApprovedAddress"]["response"]>;
  removeApprovedAddress(input: {
    path: AccountServicesOperationTypes["removeApprovedAddress"]["path"];
    body: AccountServicesOperationTypes["removeApprovedAddress"]["body"];
  }, requestOptions?: RequestOptions): Promise<AccountServicesOperationTypes["removeApprovedAddress"]["response"]> {
    const operation = ACCOUNT_SERVICES_OPERATIONS["removeApprovedAddress"];
    return executeRestOperation<AccountServicesOperationTypes["removeApprovedAddress"]>(this.transport, operation, {
      path: input.path,
      body: input.body,
    }, requestOptions);
  }

  renameAccount(body: AccountServicesOperationTypes["renameAccount"]["body"], requestOptions?: RequestOptions): Promise<AccountServicesOperationTypes["renameAccount"]["response"]>;
  renameAccount(body: AccountServicesOperationTypes["renameAccount"]["body"]): Promise<AccountServicesOperationTypes["renameAccount"]["response"]>;
  renameAccount(body: AccountServicesOperationTypes["renameAccount"]["body"], requestOptions?: RequestOptions): Promise<AccountServicesOperationTypes["renameAccount"]["response"]> {
    const operation = ACCOUNT_SERVICES_OPERATIONS["renameAccount"];
    return executeRestOperation<AccountServicesOperationTypes["renameAccount"]>(this.transport, operation, {
      body,
    }, requestOptions);
  }

  revokeOAuthToken(body: AccountServicesOperationTypes["revokeOAuthToken"]["body"], requestOptions?: RequestOptions): Promise<AccountServicesOperationTypes["revokeOAuthToken"]["response"]>;
  revokeOAuthToken(body: AccountServicesOperationTypes["revokeOAuthToken"]["body"]): Promise<AccountServicesOperationTypes["revokeOAuthToken"]["response"]>;
  revokeOAuthToken(body: AccountServicesOperationTypes["revokeOAuthToken"]["body"], requestOptions?: RequestOptions): Promise<AccountServicesOperationTypes["revokeOAuthToken"]["response"]> {
    const operation = ACCOUNT_SERVICES_OPERATIONS["revokeOAuthToken"];
    return executeRestOperation<AccountServicesOperationTypes["revokeOAuthToken"]>(this.transport, operation, {
      body,
    }, requestOptions);
  }

  stakeCryptoFunds(body: AccountServicesOperationTypes["stakeCryptoFunds"]["body"], requestOptions?: RequestOptions): Promise<AccountServicesOperationTypes["stakeCryptoFunds"]["response"]>;
  stakeCryptoFunds(body: AccountServicesOperationTypes["stakeCryptoFunds"]["body"]): Promise<AccountServicesOperationTypes["stakeCryptoFunds"]["response"]>;
  stakeCryptoFunds(body: AccountServicesOperationTypes["stakeCryptoFunds"]["body"], requestOptions?: RequestOptions): Promise<AccountServicesOperationTypes["stakeCryptoFunds"]["response"]> {
    const operation = ACCOUNT_SERVICES_OPERATIONS["stakeCryptoFunds"];
    return executeRestOperation<AccountServicesOperationTypes["stakeCryptoFunds"]>(this.transport, operation, {
      body,
    }, requestOptions);
  }

  transferBetweenAccounts(input: {
    path: AccountServicesOperationTypes["transferBetweenAccounts"]["path"];
    body: AccountServicesOperationTypes["transferBetweenAccounts"]["body"];
  }, requestOptions?: RequestOptions): Promise<AccountServicesOperationTypes["transferBetweenAccounts"]["response"]>;
  transferBetweenAccounts(input: {
    path: AccountServicesOperationTypes["transferBetweenAccounts"]["path"];
    body: AccountServicesOperationTypes["transferBetweenAccounts"]["body"];
  }): Promise<AccountServicesOperationTypes["transferBetweenAccounts"]["response"]>;
  transferBetweenAccounts(input: {
    path: AccountServicesOperationTypes["transferBetweenAccounts"]["path"];
    body: AccountServicesOperationTypes["transferBetweenAccounts"]["body"];
  }, requestOptions?: RequestOptions): Promise<AccountServicesOperationTypes["transferBetweenAccounts"]["response"]> {
    const operation = ACCOUNT_SERVICES_OPERATIONS["transferBetweenAccounts"];
    return executeRestOperation<AccountServicesOperationTypes["transferBetweenAccounts"]>(this.transport, operation, {
      path: input.path,
      body: input.body,
    }, requestOptions);
  }

  unstakeCryptoFunds(body: AccountServicesOperationTypes["unstakeCryptoFunds"]["body"], requestOptions?: RequestOptions): Promise<AccountServicesOperationTypes["unstakeCryptoFunds"]["response"]>;
  unstakeCryptoFunds(body: AccountServicesOperationTypes["unstakeCryptoFunds"]["body"]): Promise<AccountServicesOperationTypes["unstakeCryptoFunds"]["response"]>;
  unstakeCryptoFunds(body: AccountServicesOperationTypes["unstakeCryptoFunds"]["body"], requestOptions?: RequestOptions): Promise<AccountServicesOperationTypes["unstakeCryptoFunds"]["response"]> {
    const operation = ACCOUNT_SERVICES_OPERATIONS["unstakeCryptoFunds"];
    return executeRestOperation<AccountServicesOperationTypes["unstakeCryptoFunds"]>(this.transport, operation, {
      body,
    }, requestOptions);
  }

  withdrawCryptoFunds(input: {
    path: AccountServicesOperationTypes["withdrawCryptoFunds"]["path"];
    body: AccountServicesOperationTypes["withdrawCryptoFunds"]["body"];
  }, requestOptions?: RequestOptions): Promise<AccountServicesOperationTypes["withdrawCryptoFunds"]["response"]>;
  withdrawCryptoFunds(input: {
    path: AccountServicesOperationTypes["withdrawCryptoFunds"]["path"];
    body: AccountServicesOperationTypes["withdrawCryptoFunds"]["body"];
  }): Promise<AccountServicesOperationTypes["withdrawCryptoFunds"]["response"]>;
  withdrawCryptoFunds(input: {
    path: AccountServicesOperationTypes["withdrawCryptoFunds"]["path"];
    body: AccountServicesOperationTypes["withdrawCryptoFunds"]["body"];
  }, requestOptions?: RequestOptions): Promise<AccountServicesOperationTypes["withdrawCryptoFunds"]["response"]> {
    const operation = ACCOUNT_SERVICES_OPERATIONS["withdrawCryptoFunds"];
    return executeRestOperation<AccountServicesOperationTypes["withdrawCryptoFunds"]>(this.transport, operation, {
      path: input.path,
      body: input.body,
    }, requestOptions);
  }
}
