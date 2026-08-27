// Generated from rest.yaml#Transfers. Do not edit.

import type { operations as OpenApiOperations } from "../market-data/models.js";

type ParameterAt<O, Location extends PropertyKey> =
  O extends { parameters: infer P }
    ? Location extends keyof P
      ? [NonNullable<P[Location]>] extends [never]
        ? never
        : NonNullable<P[Location]>
      : never
    : never;

type Int64Input<T> =
  T extends bigint ? bigint | number :
  T extends readonly (infer Item)[] ? Int64Input<Item>[] :
  T extends object ? { [K in keyof T]: Int64Input<T[K]> } : T;

type Simplify<T> = { [K in keyof T]: T[K] } & {};

type FlatInput<Path, Query, Headers, Body> =
  [Path, Query, Headers, Body] extends [never, never, never, never]
    ? never
    : Simplify<
        ([Path] extends [never | undefined] ? unknown : Path) &
        ([Query] extends [never | undefined] ? unknown : Query) &
        ([Headers] extends [never | undefined] ? unknown : Headers) &
        ([Body] extends [never | undefined] ? unknown : Body)
      >;

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

export const TRANSFERS_OPERATIONS = {
  "getGasFeeEstimation": {"responseMode":"json","operation":"transfers.getGasFeeEstimation","method":"post","path":"/v2/withdraw/{network}/{ticker}/feeEstimate","access":"authenticated","parameters":[{"name":"network","in":"path","required":true,"style":"simple","explode":false,"valueType":"string"},{"name":"ticker","in":"path","required":true,"style":"simple","explode":false,"valueType":"string"}],"headers":[],"requestBody":true,"requestBodyRequired":true,"successStatuses":[200],"responseContentTypes":["application/json"],"responseInt64Paths":[],"requestInt64Paths":{"body":[{"path":["nonce"],"allowString":true}],"path":[],"query":[]},"retryable":false},
  "getTransactionHistory": {"responseMode":"json","operation":"transfers.getTransactionHistory","method":"post","path":"/v1/transactions","access":"authenticated","parameters":[],"headers":[],"requestBody":true,"requestBodyRequired":false,"successStatuses":[200],"responseContentTypes":["application/json"],"responseInt64Paths":[["results","*","advanceEid"],["results","*","correlationId"],["results","*","eid"],["results","*","orderId"],["results","*","pendingEid"],["results","*","tid"],["results","*","withdrawalEid"]],"requestInt64Paths":{"body":[{"path":["nonce"],"allowString":true},{"path":["timestamp_nanos"],"allowString":true}],"path":[],"query":[]},"retryable":false},
  "listCustodyFeeTransfers": {"responseMode":"json","operation":"transfers.listCustodyFeeTransfers","method":"post","path":"/v1/custodyaccountfees","access":"authenticated","parameters":[],"headers":[],"requestBody":true,"requestBodyRequired":false,"successStatuses":[200],"responseContentTypes":["application/json"],"responseInt64Paths":[],"requestInt64Paths":{"body":[{"path":["nonce"],"allowString":true},{"path":["timestamp"],"allowString":true}],"path":[],"query":[]},"retryable":false},
  "listPastTransfers": {"responseMode":"json","operation":"transfers.listPastTransfers","method":"post","path":"/v2/transfers","access":"authenticated","parameters":[],"headers":[],"requestBody":true,"requestBodyRequired":false,"successStatuses":[200],"responseContentTypes":["application/json"],"responseInt64Paths":[["*","eid"]],"requestInt64Paths":{"body":[{"path":["nonce"],"allowString":true},{"path":["timestamp"],"allowString":true}],"path":[],"query":[]},"retryable":false},
  "transferBetweenAccounts": {"responseMode":"json","operation":"transfers.transferBetweenAccounts","method":"post","path":"/v1/account/transfer/{currency}","access":"authenticated","parameters":[{"name":"currency","in":"path","required":true,"style":"simple","explode":false,"valueType":"string"}],"headers":[],"requestBody":true,"requestBodyRequired":true,"successStatuses":[200],"responseContentTypes":["application/json"],"responseInt64Paths":[],"requestInt64Paths":{"body":[{"path":["nonce"],"allowString":true}],"path":[],"query":[]},"retryable":false},
  "withdrawCryptoFunds": {"responseMode":"json","operation":"transfers.withdrawCryptoFunds","method":"post","path":"/v2/withdraw/{network}/{ticker}","access":"authenticated","parameters":[{"name":"network","in":"path","required":true,"style":"simple","explode":false,"valueType":"string"},{"name":"ticker","in":"path","required":true,"style":"simple","explode":false,"valueType":"string"}],"headers":[],"requestBody":true,"requestBodyRequired":true,"successStatuses":[200],"responseContentTypes":["application/json"],"responseInt64Paths":[],"requestInt64Paths":{"body":[],"path":[],"query":[]},"retryable":false},
} as const;

export type TransfersOperationId = keyof typeof TRANSFERS_OPERATIONS;

export type TransfersOperationTypes = {
  "getGasFeeEstimation": {
    path: Int64Input<ParameterAt<OpenApiOperations["getGasFeeEstimation"], "path">>;
    query: Int64Input<ParameterAt<OpenApiOperations["getGasFeeEstimation"], "query">>;
    headers: never;
    body: CallerJsonBody<Int64Input<JsonBody<OpenApiOperations["getGasFeeEstimation"], true>>>;
    input: FlatInput<Int64Input<ParameterAt<OpenApiOperations["getGasFeeEstimation"], "path">>, Int64Input<ParameterAt<OpenApiOperations["getGasFeeEstimation"], "query">>, never, CallerJsonBody<Int64Input<JsonBody<OpenApiOperations["getGasFeeEstimation"], true>>>>;
    response: JsonResponse<OpenApiOperations["getGasFeeEstimation"], 200>;
  };
  "getTransactionHistory": {
    path: Int64Input<ParameterAt<OpenApiOperations["getTransactionHistory"], "path">>;
    query: Int64Input<ParameterAt<OpenApiOperations["getTransactionHistory"], "query">>;
    headers: never;
    body: CallerJsonBody<Int64Input<JsonBody<OpenApiOperations["getTransactionHistory"], false>>>;
    input: FlatInput<Int64Input<ParameterAt<OpenApiOperations["getTransactionHistory"], "path">>, Int64Input<ParameterAt<OpenApiOperations["getTransactionHistory"], "query">>, never, CallerJsonBody<Int64Input<JsonBody<OpenApiOperations["getTransactionHistory"], false>>>>;
    response: JsonResponse<OpenApiOperations["getTransactionHistory"], 200>;
  };
  "listCustodyFeeTransfers": {
    path: Int64Input<ParameterAt<OpenApiOperations["listCustodyFeeTransfers"], "path">>;
    query: Int64Input<ParameterAt<OpenApiOperations["listCustodyFeeTransfers"], "query">>;
    headers: never;
    body: CallerJsonBody<Int64Input<JsonBody<OpenApiOperations["listCustodyFeeTransfers"], false>>>;
    input: FlatInput<Int64Input<ParameterAt<OpenApiOperations["listCustodyFeeTransfers"], "path">>, Int64Input<ParameterAt<OpenApiOperations["listCustodyFeeTransfers"], "query">>, never, CallerJsonBody<Int64Input<JsonBody<OpenApiOperations["listCustodyFeeTransfers"], false>>>>;
    response: JsonResponse<OpenApiOperations["listCustodyFeeTransfers"], 200>;
  };
  "listPastTransfers": {
    path: Int64Input<ParameterAt<OpenApiOperations["listPastTransfers"], "path">>;
    query: Int64Input<ParameterAt<OpenApiOperations["listPastTransfers"], "query">>;
    headers: never;
    body: CallerJsonBody<Int64Input<JsonBody<OpenApiOperations["listPastTransfers"], false>>>;
    input: FlatInput<Int64Input<ParameterAt<OpenApiOperations["listPastTransfers"], "path">>, Int64Input<ParameterAt<OpenApiOperations["listPastTransfers"], "query">>, never, CallerJsonBody<Int64Input<JsonBody<OpenApiOperations["listPastTransfers"], false>>>>;
    response: JsonResponse<OpenApiOperations["listPastTransfers"], 200>;
  };
  "transferBetweenAccounts": {
    path: Int64Input<ParameterAt<OpenApiOperations["transferBetweenAccounts"], "path">>;
    query: Int64Input<ParameterAt<OpenApiOperations["transferBetweenAccounts"], "query">>;
    headers: never;
    body: CallerJsonBody<Int64Input<JsonBody<OpenApiOperations["transferBetweenAccounts"], true>>>;
    input: FlatInput<Int64Input<ParameterAt<OpenApiOperations["transferBetweenAccounts"], "path">>, Int64Input<ParameterAt<OpenApiOperations["transferBetweenAccounts"], "query">>, never, CallerJsonBody<Int64Input<JsonBody<OpenApiOperations["transferBetweenAccounts"], true>>>>;
    response: JsonResponse<OpenApiOperations["transferBetweenAccounts"], 200>;
  };
  "withdrawCryptoFunds": {
    path: Int64Input<ParameterAt<OpenApiOperations["withdrawCryptoFunds"], "path">>;
    query: Int64Input<ParameterAt<OpenApiOperations["withdrawCryptoFunds"], "query">>;
    headers: never;
    body: CallerJsonBody<Int64Input<JsonBody<OpenApiOperations["withdrawCryptoFunds"], true>>>;
    input: FlatInput<Int64Input<ParameterAt<OpenApiOperations["withdrawCryptoFunds"], "path">>, Int64Input<ParameterAt<OpenApiOperations["withdrawCryptoFunds"], "query">>, never, CallerJsonBody<Int64Input<JsonBody<OpenApiOperations["withdrawCryptoFunds"], true>>>>;
    response: JsonResponse<OpenApiOperations["withdrawCryptoFunds"], 200>;
  };
};
