// Generated from rest.yaml#Account Services. Do not edit.

import type { operations as OpenApiOperations } from "../market-data/models.js";

type ParameterAt<O, Location extends PropertyKey> =
  O extends { parameters: infer P }
    ? Location extends keyof P ? P[Location] : never
    : never;

type Int64Input<T> =
  T extends bigint ? bigint | number :
  T extends readonly (infer Item)[] ? Int64Input<Item>[] :
  T extends object ? { [K in keyof T]: Int64Input<T[K]> } : T;

type JsonBody<O, Required extends boolean> =
  NonNullable<O extends { requestBody?: infer B } ? B : never> extends
  { content: { "application/json": infer Body } }
    ? Required extends true ? Body : Body | undefined
    : never;

type StripTransportFields<T> = T extends object ? Omit<T, "request" | "nonce"> : T;

type CallerJsonBody<T> = StripTransportFields<T>;

type JsonResponse<O, Status extends PropertyKey> =
  O extends { responses: infer R }
    ? Status extends keyof R
      ? R[Status] extends { content: { "application/json": infer Body } } ? Body : never
      : never
    : never;

export const ACCOUNT_SERVICES_OPERATIONS = {
  "addBank": {"responseMode":"json","operation":"accountServices.addBank","method":"post","path":"/v1/payments/addbank","access":"authenticated","parameters":[],"headers":[],"requestBody":true,"requestBodyRequired":true,"successStatuses":[200],"responseContentTypes":["application/json"],"responseInt64Paths":[],"requestInt64Paths":{"body":[{"path":["nonce"],"allowString":true}],"path":[],"query":[]},"retryable":false},
  "addBankCAD": {"responseMode":"json","operation":"accountServices.addBankCAD","method":"post","path":"/v1/payments/addbank/cad","access":"authenticated","parameters":[],"headers":[],"requestBody":true,"requestBodyRequired":true,"successStatuses":[200],"responseContentTypes":["application/json"],"responseInt64Paths":[],"requestInt64Paths":{"body":[{"path":["nonce"],"allowString":true}],"path":[],"query":[]},"retryable":false},
  "createNewAccount": {"responseMode":"json","operation":"accountServices.createNewAccount","method":"post","path":"/v1/account/create","access":"authenticated","parameters":[],"headers":[],"requestBody":true,"requestBodyRequired":true,"successStatuses":[200],"responseContentTypes":["application/json"],"responseInt64Paths":[],"requestInt64Paths":{"body":[{"path":["nonce"],"allowString":true}],"path":[],"query":[]},"retryable":false},
  "createNewApprovedAddress": {"responseMode":"json","operation":"accountServices.createNewApprovedAddress","method":"post","path":"/v1/approvedAddresses/{network}/request","access":"authenticated","parameters":[{"name":"network","in":"path","required":true,"style":"simple","explode":false}],"headers":[],"requestBody":true,"requestBodyRequired":true,"successStatuses":[200],"responseContentTypes":["application/json"],"responseInt64Paths":[],"requestInt64Paths":{"body":[{"path":["nonce"],"allowString":true}],"path":[],"query":[]},"retryable":false},
  "createNewDepositAddress": {"responseMode":"json","operation":"accountServices.createNewDepositAddress","method":"post","path":"/v1/deposit/{network}/newAddress","access":"authenticated","parameters":[{"name":"network","in":"path","required":true,"style":"simple","explode":false}],"headers":[],"requestBody":true,"requestBodyRequired":true,"successStatuses":[200],"responseContentTypes":["application/json"],"responseInt64Paths":[],"requestInt64Paths":{"body":[{"path":["nonce"],"allowString":true}],"path":[],"query":[]},"retryable":false},
  "getAccountDetail": {"responseMode":"json","operation":"accountServices.getAccountDetail","method":"post","path":"/v1/account","access":"authenticated","parameters":[],"headers":[],"requestBody":true,"requestBodyRequired":true,"successStatuses":[200],"responseContentTypes":["application/json"],"responseInt64Paths":[],"requestInt64Paths":{"body":[{"path":["nonce"],"allowString":true}],"path":[],"query":[]},"retryable":false},
  "getAvailableBalances": {"responseMode":"json","operation":"accountServices.getAvailableBalances","method":"post","path":"/v1/balances","access":"authenticated","parameters":[],"headers":[],"requestBody":true,"requestBodyRequired":true,"successStatuses":[200],"responseContentTypes":["application/json"],"responseInt64Paths":[],"requestInt64Paths":{"body":[{"path":["nonce"],"allowString":true}],"path":[],"query":[]},"retryable":false},
  "getGasFeeEstimation": {"responseMode":"json","operation":"accountServices.getGasFeeEstimation","method":"post","path":"/v2/withdraw/{network}/{ticker}/feeEstimate","access":"authenticated","parameters":[{"name":"network","in":"path","required":true,"style":"simple","explode":false},{"name":"ticker","in":"path","required":true,"style":"simple","explode":false}],"headers":[],"requestBody":true,"requestBodyRequired":true,"successStatuses":[200],"responseContentTypes":["application/json"],"responseInt64Paths":[],"requestInt64Paths":{"body":[{"path":["nonce"],"allowString":true}],"path":[],"query":[]},"retryable":false},
  "getNotionalBalances": {"responseMode":"json","operation":"accountServices.getNotionalBalances","method":"post","path":"/v1/notionalbalances/{currency}","access":"authenticated","parameters":[{"name":"currency","in":"path","required":true,"style":"simple","explode":false}],"headers":[],"requestBody":true,"requestBodyRequired":true,"successStatuses":[200],"responseContentTypes":["application/json"],"responseInt64Paths":[],"requestInt64Paths":{"body":[{"path":["nonce"],"allowString":true}],"path":[],"query":[]},"retryable":false},
  "getRoles": {"responseMode":"json","operation":"accountServices.getRoles","method":"post","path":"/v1/roles","access":"authenticated","parameters":[],"headers":[],"requestBody":true,"requestBodyRequired":true,"successStatuses":[200],"responseContentTypes":["application/json"],"responseInt64Paths":[],"requestInt64Paths":{"body":[{"path":["nonce"],"allowString":true}],"path":[],"query":[]},"retryable":false},
  "getTransactionHistory": {"responseMode":"json","operation":"accountServices.getTransactionHistory","method":"post","path":"/v1/transactions","access":"authenticated","parameters":[],"headers":[],"requestBody":true,"requestBodyRequired":true,"successStatuses":[200],"responseContentTypes":["application/json"],"responseInt64Paths":[["results","*","advanceEid"],["results","*","correlationId"],["results","*","eid"],["results","*","orderId"],["results","*","pendingEid"],["results","*","tid"],["results","*","withdrawalEid"]],"requestInt64Paths":{"body":[{"path":["nonce"],"allowString":true},{"path":["timestamp_nanos"],"allowString":true}],"path":[],"query":[]},"retryable":false},
  "listAccountsInGroup": {"responseMode":"json","operation":"accountServices.listAccountsInGroup","method":"post","path":"/v1/account/list","access":"authenticated","parameters":[],"headers":[],"requestBody":true,"requestBodyRequired":true,"successStatuses":[200],"responseContentTypes":["application/json"],"responseInt64Paths":[],"requestInt64Paths":{"body":[{"path":["nonce"],"allowString":true},{"path":["timestamp"],"allowString":true}],"path":[],"query":[]},"retryable":false},
  "listApprovedAddresses": {"responseMode":"json","operation":"accountServices.listApprovedAddresses","method":"post","path":"/v1/approvedAddresses/account/{network}","access":"authenticated","parameters":[{"name":"network","in":"path","required":true,"style":"simple","explode":false}],"headers":[],"requestBody":true,"requestBodyRequired":true,"successStatuses":[200],"responseContentTypes":["application/json"],"responseInt64Paths":[],"requestInt64Paths":{"body":[{"path":["nonce"],"allowString":true}],"path":[],"query":[]},"retryable":false},
  "listCustodyFeeTransfers": {"responseMode":"json","operation":"accountServices.listCustodyFeeTransfers","method":"post","path":"/v1/custodyaccountfees","access":"authenticated","parameters":[],"headers":[],"requestBody":true,"requestBodyRequired":true,"successStatuses":[200],"responseContentTypes":["application/json"],"responseInt64Paths":[],"requestInt64Paths":{"body":[{"path":["nonce"],"allowString":true},{"path":["timestamp"],"allowString":true}],"path":[],"query":[]},"retryable":false},
  "listDepositAddresses": {"responseMode":"json","operation":"accountServices.listDepositAddresses","method":"post","path":"/v1/addresses/{network}","access":"authenticated","parameters":[{"name":"network","in":"path","required":true,"style":"simple","explode":false}],"headers":[],"requestBody":true,"requestBodyRequired":true,"successStatuses":[200],"responseContentTypes":["application/json"],"responseInt64Paths":[],"requestInt64Paths":{"body":[{"path":["nonce"],"allowString":true},{"path":["timestamp"],"allowString":true}],"path":[],"query":[]},"retryable":false},
  "listPastTransfers": {"responseMode":"json","operation":"accountServices.listPastTransfers","method":"post","path":"/v2/transfers","access":"authenticated","parameters":[],"headers":[],"requestBody":true,"requestBodyRequired":true,"successStatuses":[200],"responseContentTypes":["application/json"],"responseInt64Paths":[["*","eid"]],"requestInt64Paths":{"body":[{"path":["nonce"],"allowString":true},{"path":["timestamp"],"allowString":true}],"path":[],"query":[]},"retryable":false},
  "listPaymentMethods": {"responseMode":"json","operation":"accountServices.listPaymentMethods","method":"post","path":"/v1/payments/methods","access":"authenticated","parameters":[],"headers":[],"requestBody":true,"requestBodyRequired":true,"successStatuses":[200],"responseContentTypes":["application/json"],"responseInt64Paths":[],"requestInt64Paths":{"body":[{"path":["nonce"],"allowString":true}],"path":[],"query":[]},"retryable":false},
  "listStakingBalances": {"responseMode":"json","operation":"accountServices.listStakingBalances","method":"post","path":"/v1/balances/staking","access":"authenticated","parameters":[],"headers":[],"requestBody":true,"requestBodyRequired":true,"successStatuses":[200],"responseContentTypes":["application/json"],"responseInt64Paths":[],"requestInt64Paths":{"body":[{"path":["nonce"],"allowString":true}],"path":[],"query":[]},"retryable":false},
  "listStakingEventHistory": {"responseMode":"json","operation":"accountServices.listStakingEventHistory","method":"post","path":"/v1/staking/history","access":"authenticated","parameters":[],"headers":[],"requestBody":true,"requestBodyRequired":true,"successStatuses":[200],"responseContentTypes":["application/json"],"responseInt64Paths":[],"requestInt64Paths":{"body":[{"path":["nonce"],"allowString":true},{"path":["since"],"allowString":true},{"path":["until"],"allowString":true}],"path":[],"query":[]},"retryable":false},
  "listStakingRates": {"responseMode":"json","operation":"accountServices.listStakingRates","method":"get","path":"/v1/staking/rates","access":"public","parameters":[],"headers":[],"requestBody":false,"requestBodyRequired":false,"successStatuses":[200],"responseContentTypes":["application/json"],"responseInt64Paths":[],"requestInt64Paths":{"body":[],"path":[],"query":[]},"retryable":true},
  "listStakingRewards": {"responseMode":"json","operation":"accountServices.listStakingRewards","method":"post","path":"/v1/staking/rewards","access":"authenticated","parameters":[],"headers":[],"requestBody":true,"requestBodyRequired":true,"successStatuses":[200],"responseContentTypes":["application/json"],"responseInt64Paths":[],"requestInt64Paths":{"body":[{"path":["nonce"],"allowString":true}],"path":[],"query":[]},"retryable":false},
  "removeApprovedAddress": {"responseMode":"json","operation":"accountServices.removeApprovedAddress","method":"post","path":"/v1/approvedAddresses/{network}/remove","access":"authenticated","parameters":[{"name":"network","in":"path","required":true,"style":"simple","explode":false}],"headers":[],"requestBody":true,"requestBodyRequired":true,"successStatuses":[200],"responseContentTypes":["application/json"],"responseInt64Paths":[],"requestInt64Paths":{"body":[{"path":["nonce"],"allowString":true}],"path":[],"query":[]},"retryable":false},
  "renameAccount": {"responseMode":"json","operation":"accountServices.renameAccount","method":"post","path":"/v1/account/rename","access":"authenticated","parameters":[],"headers":[],"requestBody":true,"requestBodyRequired":true,"successStatuses":[200],"responseContentTypes":["application/json"],"responseInt64Paths":[],"requestInt64Paths":{"body":[{"path":["nonce"],"allowString":true}],"path":[],"query":[]},"retryable":false},
  "revokeOAuthToken": {"responseMode":"json","operation":"accountServices.revokeOAuthToken","method":"post","path":"/v1/oauth/revokeByToken","access":"authenticated","parameters":[],"headers":[],"requestBody":true,"requestBodyRequired":true,"successStatuses":[200],"responseContentTypes":["application/json"],"responseInt64Paths":[],"requestInt64Paths":{"body":[],"path":[],"query":[]},"retryable":false},
  "stakeCryptoFunds": {"responseMode":"json","operation":"accountServices.stakeCryptoFunds","method":"post","path":"/v1/staking/stake","access":"authenticated","parameters":[],"headers":[],"requestBody":true,"requestBodyRequired":true,"successStatuses":[200],"responseContentTypes":["application/json"],"responseInt64Paths":[],"requestInt64Paths":{"body":[{"path":["nonce"],"allowString":true}],"path":[],"query":[]},"retryable":false},
  "transferBetweenAccounts": {"responseMode":"json","operation":"accountServices.transferBetweenAccounts","method":"post","path":"/v1/account/transfer/{currency}","access":"authenticated","parameters":[{"name":"currency","in":"path","required":true,"style":"simple","explode":false}],"headers":[],"requestBody":true,"requestBodyRequired":true,"successStatuses":[200],"responseContentTypes":["application/json"],"responseInt64Paths":[],"requestInt64Paths":{"body":[{"path":["nonce"],"allowString":true}],"path":[],"query":[]},"retryable":false},
  "unstakeCryptoFunds": {"responseMode":"json","operation":"accountServices.unstakeCryptoFunds","method":"post","path":"/v1/staking/unstake","access":"authenticated","parameters":[],"headers":[],"requestBody":true,"requestBodyRequired":true,"successStatuses":[200],"responseContentTypes":["application/json"],"responseInt64Paths":[],"requestInt64Paths":{"body":[{"path":["nonce"],"allowString":true}],"path":[],"query":[]},"retryable":false},
  "withdrawCryptoFunds": {"responseMode":"json","operation":"accountServices.withdrawCryptoFunds","method":"post","path":"/v2/withdraw/{network}/{ticker}","access":"authenticated","parameters":[{"name":"network","in":"path","required":true,"style":"simple","explode":false},{"name":"ticker","in":"path","required":true,"style":"simple","explode":false}],"headers":[],"requestBody":true,"requestBodyRequired":true,"successStatuses":[200],"responseContentTypes":["application/json"],"responseInt64Paths":[],"requestInt64Paths":{"body":[],"path":[],"query":[]},"retryable":false},
} as const;

export type AccountServicesOperationId = keyof typeof ACCOUNT_SERVICES_OPERATIONS;

export type AccountServicesOperationTypes = {
  "addBank": {
    path: Int64Input<ParameterAt<OpenApiOperations["addBank"], "path">>;
    query: Int64Input<ParameterAt<OpenApiOperations["addBank"], "query">>;
    headers: never;
    body: CallerJsonBody<Int64Input<JsonBody<OpenApiOperations["addBank"], true>>>;
    response: JsonResponse<OpenApiOperations["addBank"], 200>;
  };
  "addBankCAD": {
    path: Int64Input<ParameterAt<OpenApiOperations["addBankCAD"], "path">>;
    query: Int64Input<ParameterAt<OpenApiOperations["addBankCAD"], "query">>;
    headers: never;
    body: CallerJsonBody<Int64Input<JsonBody<OpenApiOperations["addBankCAD"], true>>>;
    response: JsonResponse<OpenApiOperations["addBankCAD"], 200>;
  };
  "createNewAccount": {
    path: Int64Input<ParameterAt<OpenApiOperations["createNewAccount"], "path">>;
    query: Int64Input<ParameterAt<OpenApiOperations["createNewAccount"], "query">>;
    headers: never;
    body: CallerJsonBody<Int64Input<JsonBody<OpenApiOperations["createNewAccount"], true>>>;
    response: JsonResponse<OpenApiOperations["createNewAccount"], 200>;
  };
  "createNewApprovedAddress": {
    path: Int64Input<ParameterAt<OpenApiOperations["createNewApprovedAddress"], "path">>;
    query: Int64Input<ParameterAt<OpenApiOperations["createNewApprovedAddress"], "query">>;
    headers: never;
    body: CallerJsonBody<Int64Input<JsonBody<OpenApiOperations["createNewApprovedAddress"], true>>>;
    response: JsonResponse<OpenApiOperations["createNewApprovedAddress"], 200>;
  };
  "createNewDepositAddress": {
    path: Int64Input<ParameterAt<OpenApiOperations["createNewDepositAddress"], "path">>;
    query: Int64Input<ParameterAt<OpenApiOperations["createNewDepositAddress"], "query">>;
    headers: never;
    body: CallerJsonBody<Int64Input<JsonBody<OpenApiOperations["createNewDepositAddress"], true>>>;
    response: JsonResponse<OpenApiOperations["createNewDepositAddress"], 200>;
  };
  "getAccountDetail": {
    path: Int64Input<ParameterAt<OpenApiOperations["getAccountDetail"], "path">>;
    query: Int64Input<ParameterAt<OpenApiOperations["getAccountDetail"], "query">>;
    headers: never;
    body: CallerJsonBody<Int64Input<JsonBody<OpenApiOperations["getAccountDetail"], true>>>;
    response: JsonResponse<OpenApiOperations["getAccountDetail"], 200>;
  };
  "getAvailableBalances": {
    path: Int64Input<ParameterAt<OpenApiOperations["getAvailableBalances"], "path">>;
    query: Int64Input<ParameterAt<OpenApiOperations["getAvailableBalances"], "query">>;
    headers: never;
    body: CallerJsonBody<Int64Input<JsonBody<OpenApiOperations["getAvailableBalances"], true>>>;
    response: JsonResponse<OpenApiOperations["getAvailableBalances"], 200>;
  };
  "getGasFeeEstimation": {
    path: Int64Input<ParameterAt<OpenApiOperations["getGasFeeEstimation"], "path">>;
    query: Int64Input<ParameterAt<OpenApiOperations["getGasFeeEstimation"], "query">>;
    headers: never;
    body: CallerJsonBody<Int64Input<JsonBody<OpenApiOperations["getGasFeeEstimation"], true>>>;
    response: JsonResponse<OpenApiOperations["getGasFeeEstimation"], 200>;
  };
  "getNotionalBalances": {
    path: Int64Input<ParameterAt<OpenApiOperations["getNotionalBalances"], "path">>;
    query: Int64Input<ParameterAt<OpenApiOperations["getNotionalBalances"], "query">>;
    headers: never;
    body: CallerJsonBody<Int64Input<JsonBody<OpenApiOperations["getNotionalBalances"], true>>>;
    response: JsonResponse<OpenApiOperations["getNotionalBalances"], 200>;
  };
  "getRoles": {
    path: Int64Input<ParameterAt<OpenApiOperations["getRoles"], "path">>;
    query: Int64Input<ParameterAt<OpenApiOperations["getRoles"], "query">>;
    headers: never;
    body: CallerJsonBody<Int64Input<JsonBody<OpenApiOperations["getRoles"], true>>>;
    response: JsonResponse<OpenApiOperations["getRoles"], 200>;
  };
  "getTransactionHistory": {
    path: Int64Input<ParameterAt<OpenApiOperations["getTransactionHistory"], "path">>;
    query: Int64Input<ParameterAt<OpenApiOperations["getTransactionHistory"], "query">>;
    headers: never;
    body: CallerJsonBody<Int64Input<JsonBody<OpenApiOperations["getTransactionHistory"], true>>>;
    response: JsonResponse<OpenApiOperations["getTransactionHistory"], 200>;
  };
  "listAccountsInGroup": {
    path: Int64Input<ParameterAt<OpenApiOperations["listAccountsInGroup"], "path">>;
    query: Int64Input<ParameterAt<OpenApiOperations["listAccountsInGroup"], "query">>;
    headers: never;
    body: CallerJsonBody<Int64Input<JsonBody<OpenApiOperations["listAccountsInGroup"], true>>>;
    response: JsonResponse<OpenApiOperations["listAccountsInGroup"], 200>;
  };
  "listApprovedAddresses": {
    path: Int64Input<ParameterAt<OpenApiOperations["listApprovedAddresses"], "path">>;
    query: Int64Input<ParameterAt<OpenApiOperations["listApprovedAddresses"], "query">>;
    headers: never;
    body: CallerJsonBody<Int64Input<JsonBody<OpenApiOperations["listApprovedAddresses"], true>>>;
    response: JsonResponse<OpenApiOperations["listApprovedAddresses"], 200>;
  };
  "listCustodyFeeTransfers": {
    path: Int64Input<ParameterAt<OpenApiOperations["listCustodyFeeTransfers"], "path">>;
    query: Int64Input<ParameterAt<OpenApiOperations["listCustodyFeeTransfers"], "query">>;
    headers: never;
    body: CallerJsonBody<Int64Input<JsonBody<OpenApiOperations["listCustodyFeeTransfers"], true>>>;
    response: JsonResponse<OpenApiOperations["listCustodyFeeTransfers"], 200>;
  };
  "listDepositAddresses": {
    path: Int64Input<ParameterAt<OpenApiOperations["listDepositAddresses"], "path">>;
    query: Int64Input<ParameterAt<OpenApiOperations["listDepositAddresses"], "query">>;
    headers: never;
    body: CallerJsonBody<Int64Input<JsonBody<OpenApiOperations["listDepositAddresses"], true>>>;
    response: JsonResponse<OpenApiOperations["listDepositAddresses"], 200>;
  };
  "listPastTransfers": {
    path: Int64Input<ParameterAt<OpenApiOperations["listPastTransfers"], "path">>;
    query: Int64Input<ParameterAt<OpenApiOperations["listPastTransfers"], "query">>;
    headers: never;
    body: CallerJsonBody<Int64Input<JsonBody<OpenApiOperations["listPastTransfers"], true>>>;
    response: JsonResponse<OpenApiOperations["listPastTransfers"], 200>;
  };
  "listPaymentMethods": {
    path: Int64Input<ParameterAt<OpenApiOperations["listPaymentMethods"], "path">>;
    query: Int64Input<ParameterAt<OpenApiOperations["listPaymentMethods"], "query">>;
    headers: never;
    body: CallerJsonBody<Int64Input<JsonBody<OpenApiOperations["listPaymentMethods"], true>>>;
    response: JsonResponse<OpenApiOperations["listPaymentMethods"], 200>;
  };
  "listStakingBalances": {
    path: Int64Input<ParameterAt<OpenApiOperations["listStakingBalances"], "path">>;
    query: Int64Input<ParameterAt<OpenApiOperations["listStakingBalances"], "query">>;
    headers: never;
    body: CallerJsonBody<Int64Input<JsonBody<OpenApiOperations["listStakingBalances"], true>>>;
    response: JsonResponse<OpenApiOperations["listStakingBalances"], 200>;
  };
  "listStakingEventHistory": {
    path: Int64Input<ParameterAt<OpenApiOperations["listStakingEventHistory"], "path">>;
    query: Int64Input<ParameterAt<OpenApiOperations["listStakingEventHistory"], "query">>;
    headers: never;
    body: CallerJsonBody<Int64Input<JsonBody<OpenApiOperations["listStakingEventHistory"], true>>>;
    response: JsonResponse<OpenApiOperations["listStakingEventHistory"], 200>;
  };
  "listStakingRates": {
    path: Int64Input<ParameterAt<OpenApiOperations["listStakingRates"], "path">>;
    query: Int64Input<ParameterAt<OpenApiOperations["listStakingRates"], "query">>;
    headers: never;
    body: never;
    response: JsonResponse<OpenApiOperations["listStakingRates"], 200>;
  };
  "listStakingRewards": {
    path: Int64Input<ParameterAt<OpenApiOperations["listStakingRewards"], "path">>;
    query: Int64Input<ParameterAt<OpenApiOperations["listStakingRewards"], "query">>;
    headers: never;
    body: CallerJsonBody<Int64Input<JsonBody<OpenApiOperations["listStakingRewards"], true>>>;
    response: JsonResponse<OpenApiOperations["listStakingRewards"], 200>;
  };
  "removeApprovedAddress": {
    path: Int64Input<ParameterAt<OpenApiOperations["removeApprovedAddress"], "path">>;
    query: Int64Input<ParameterAt<OpenApiOperations["removeApprovedAddress"], "query">>;
    headers: never;
    body: CallerJsonBody<Int64Input<JsonBody<OpenApiOperations["removeApprovedAddress"], true>>>;
    response: JsonResponse<OpenApiOperations["removeApprovedAddress"], 200>;
  };
  "renameAccount": {
    path: Int64Input<ParameterAt<OpenApiOperations["renameAccount"], "path">>;
    query: Int64Input<ParameterAt<OpenApiOperations["renameAccount"], "query">>;
    headers: never;
    body: CallerJsonBody<Int64Input<JsonBody<OpenApiOperations["renameAccount"], true>>>;
    response: JsonResponse<OpenApiOperations["renameAccount"], 200>;
  };
  "revokeOAuthToken": {
    path: Int64Input<ParameterAt<OpenApiOperations["revokeOAuthToken"], "path">>;
    query: Int64Input<ParameterAt<OpenApiOperations["revokeOAuthToken"], "query">>;
    headers: never;
    body: CallerJsonBody<Int64Input<JsonBody<OpenApiOperations["revokeOAuthToken"], true>>>;
    response: JsonResponse<OpenApiOperations["revokeOAuthToken"], 200>;
  };
  "stakeCryptoFunds": {
    path: Int64Input<ParameterAt<OpenApiOperations["stakeCryptoFunds"], "path">>;
    query: Int64Input<ParameterAt<OpenApiOperations["stakeCryptoFunds"], "query">>;
    headers: never;
    body: CallerJsonBody<Int64Input<JsonBody<OpenApiOperations["stakeCryptoFunds"], true>>>;
    response: JsonResponse<OpenApiOperations["stakeCryptoFunds"], 200>;
  };
  "transferBetweenAccounts": {
    path: Int64Input<ParameterAt<OpenApiOperations["transferBetweenAccounts"], "path">>;
    query: Int64Input<ParameterAt<OpenApiOperations["transferBetweenAccounts"], "query">>;
    headers: never;
    body: CallerJsonBody<Int64Input<JsonBody<OpenApiOperations["transferBetweenAccounts"], true>>>;
    response: JsonResponse<OpenApiOperations["transferBetweenAccounts"], 200>;
  };
  "unstakeCryptoFunds": {
    path: Int64Input<ParameterAt<OpenApiOperations["unstakeCryptoFunds"], "path">>;
    query: Int64Input<ParameterAt<OpenApiOperations["unstakeCryptoFunds"], "query">>;
    headers: never;
    body: CallerJsonBody<Int64Input<JsonBody<OpenApiOperations["unstakeCryptoFunds"], true>>>;
    response: JsonResponse<OpenApiOperations["unstakeCryptoFunds"], 200>;
  };
  "withdrawCryptoFunds": {
    path: Int64Input<ParameterAt<OpenApiOperations["withdrawCryptoFunds"], "path">>;
    query: Int64Input<ParameterAt<OpenApiOperations["withdrawCryptoFunds"], "query">>;
    headers: never;
    body: CallerJsonBody<Int64Input<JsonBody<OpenApiOperations["withdrawCryptoFunds"], true>>>;
    response: JsonResponse<OpenApiOperations["withdrawCryptoFunds"], 200>;
  };
};
