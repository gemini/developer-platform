// Generated from rest.yaml#Account. Do not edit.

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

export const ACCOUNT_OPERATIONS = {
  "addBank": {"responseMode":"json","operation":"account.addBank","method":"post","path":"/v1/payments/addbank","access":"authenticated","parameters":[],"headers":[],"requestBody":true,"requestBodyRequired":true,"successStatuses":[200],"responseContentTypes":["application/json"],"responseInt64Paths":[],"requestInt64Paths":{"body":[{"path":["nonce"],"allowString":true}],"path":[],"query":[]},"retryable":false},
  "addBankCAD": {"responseMode":"json","operation":"account.addBankCAD","method":"post","path":"/v1/payments/addbank/cad","access":"authenticated","parameters":[],"headers":[],"requestBody":true,"requestBodyRequired":true,"successStatuses":[200],"responseContentTypes":["application/json"],"responseInt64Paths":[],"requestInt64Paths":{"body":[{"path":["nonce"],"allowString":true}],"path":[],"query":[]},"retryable":false},
  "createNewAccount": {"responseMode":"json","operation":"account.createNewAccount","method":"post","path":"/v1/account/create","access":"authenticated","parameters":[],"headers":[],"requestBody":true,"requestBodyRequired":true,"successStatuses":[200],"responseContentTypes":["application/json"],"responseInt64Paths":[],"requestInt64Paths":{"body":[{"path":["nonce"],"allowString":true}],"path":[],"query":[]},"retryable":false},
  "createNewApprovedAddress": {"responseMode":"json","operation":"account.createNewApprovedAddress","method":"post","path":"/v1/approvedAddresses/{network}/request","access":"authenticated","parameters":[{"name":"network","in":"path","required":true,"style":"simple","explode":false,"valueType":"string"}],"headers":[],"requestBody":true,"requestBodyRequired":true,"successStatuses":[200],"responseContentTypes":["application/json"],"responseInt64Paths":[],"requestInt64Paths":{"body":[{"path":["nonce"],"allowString":true}],"path":[],"query":[]},"retryable":false},
  "createNewDepositAddress": {"responseMode":"json","operation":"account.createNewDepositAddress","method":"post","path":"/v1/deposit/{network}/newAddress","access":"authenticated","parameters":[{"name":"network","in":"path","required":true,"style":"simple","explode":false,"valueType":"string"}],"headers":[],"requestBody":true,"requestBodyRequired":false,"successStatuses":[200],"responseContentTypes":["application/json"],"responseInt64Paths":[],"requestInt64Paths":{"body":[{"path":["nonce"],"allowString":true}],"path":[],"query":[]},"retryable":false},
  "getAccountDetail": {"responseMode":"json","operation":"account.getAccountDetail","method":"post","path":"/v1/account","access":"authenticated","parameters":[],"headers":[],"requestBody":true,"requestBodyRequired":false,"successStatuses":[200],"responseContentTypes":["application/json"],"responseInt64Paths":[],"requestInt64Paths":{"body":[{"path":["nonce"],"allowString":true}],"path":[],"query":[]},"retryable":false},
  "getAvailableBalances": {"responseMode":"json","operation":"account.getAvailableBalances","method":"post","path":"/v1/balances","access":"authenticated","parameters":[],"headers":[],"requestBody":true,"requestBodyRequired":true,"successStatuses":[200],"responseContentTypes":["application/json"],"responseInt64Paths":[],"requestInt64Paths":{"body":[{"path":["nonce"],"allowString":true}],"path":[],"query":[]},"retryable":false},
  "getNotionalBalances": {"responseMode":"json","operation":"account.getNotionalBalances","method":"post","path":"/v1/notionalbalances/{currency}","access":"authenticated","parameters":[{"name":"currency","in":"path","required":true,"style":"simple","explode":false,"valueType":"string"}],"headers":[],"requestBody":true,"requestBodyRequired":false,"successStatuses":[200],"responseContentTypes":["application/json"],"responseInt64Paths":[],"requestInt64Paths":{"body":[{"path":["nonce"],"allowString":true}],"path":[],"query":[]},"retryable":false},
  "getRoles": {"responseMode":"json","operation":"account.getRoles","method":"post","path":"/v1/roles","access":"authenticated","parameters":[],"headers":[],"requestBody":true,"requestBodyRequired":false,"successStatuses":[200],"responseContentTypes":["application/json"],"responseInt64Paths":[],"requestInt64Paths":{"body":[{"path":["nonce"],"allowString":true}],"path":[],"query":[]},"retryable":false},
  "listAccountsInGroup": {"responseMode":"json","operation":"account.listAccountsInGroup","method":"post","path":"/v1/account/list","access":"authenticated","parameters":[],"headers":[],"requestBody":true,"requestBodyRequired":false,"successStatuses":[200],"responseContentTypes":["application/json"],"responseInt64Paths":[],"requestInt64Paths":{"body":[{"path":["nonce"],"allowString":true},{"path":["timestamp"],"allowString":true}],"path":[],"query":[]},"retryable":false},
  "listApprovedAddresses": {"responseMode":"json","operation":"account.listApprovedAddresses","method":"post","path":"/v1/approvedAddresses/account/{network}","access":"authenticated","parameters":[{"name":"network","in":"path","required":true,"style":"simple","explode":false,"valueType":"string"}],"headers":[],"requestBody":true,"requestBodyRequired":false,"successStatuses":[200],"responseContentTypes":["application/json"],"responseInt64Paths":[],"requestInt64Paths":{"body":[{"path":["nonce"],"allowString":true}],"path":[],"query":[]},"retryable":false},
  "listDepositAddresses": {"responseMode":"json","operation":"account.listDepositAddresses","method":"post","path":"/v1/addresses/{network}","access":"authenticated","parameters":[{"name":"network","in":"path","required":true,"style":"simple","explode":false,"valueType":"string"}],"headers":[],"requestBody":true,"requestBodyRequired":false,"successStatuses":[200],"responseContentTypes":["application/json"],"responseInt64Paths":[],"requestInt64Paths":{"body":[{"path":["nonce"],"allowString":true},{"path":["timestamp"],"allowString":true}],"path":[],"query":[]},"retryable":false},
  "listPaymentMethods": {"responseMode":"json","operation":"account.listPaymentMethods","method":"post","path":"/v1/payments/methods","access":"authenticated","parameters":[],"headers":[],"requestBody":true,"requestBodyRequired":false,"successStatuses":[200],"responseContentTypes":["application/json"],"responseInt64Paths":[],"requestInt64Paths":{"body":[{"path":["nonce"],"allowString":true}],"path":[],"query":[]},"retryable":false},
  "removeApprovedAddress": {"responseMode":"json","operation":"account.removeApprovedAddress","method":"post","path":"/v1/approvedAddresses/{network}/remove","access":"authenticated","parameters":[{"name":"network","in":"path","required":true,"style":"simple","explode":false,"valueType":"string"}],"headers":[],"requestBody":true,"requestBodyRequired":true,"successStatuses":[200],"responseContentTypes":["application/json"],"responseInt64Paths":[],"requestInt64Paths":{"body":[{"path":["nonce"],"allowString":true}],"path":[],"query":[]},"retryable":false},
  "renameAccount": {"responseMode":"json","operation":"account.renameAccount","method":"post","path":"/v1/account/rename","access":"authenticated","parameters":[],"headers":[],"requestBody":true,"requestBodyRequired":false,"successStatuses":[200],"responseContentTypes":["application/json"],"responseInt64Paths":[],"requestInt64Paths":{"body":[{"path":["nonce"],"allowString":true}],"path":[],"query":[]},"retryable":false},
  "revokeOAuthToken": {"responseMode":"json","operation":"account.revokeOAuthToken","method":"post","path":"/v1/oauth/revokeByToken","access":"authenticated","parameters":[],"headers":[],"requestBody":true,"requestBodyRequired":false,"successStatuses":[200],"responseContentTypes":["application/json"],"responseInt64Paths":[],"requestInt64Paths":{"body":[],"path":[],"query":[]},"retryable":false},
} as const;

export type AccountOperationId = keyof typeof ACCOUNT_OPERATIONS;

export type AccountOperationTypes = {
  "addBank": {
    path: Int64Input<ParameterAt<OpenApiOperations["addBank"], "path">>;
    query: Int64Input<ParameterAt<OpenApiOperations["addBank"], "query">>;
    headers: never;
    body: CallerJsonBody<Int64Input<JsonBody<OpenApiOperations["addBank"], true>>>;
    input: FlatInput<Int64Input<ParameterAt<OpenApiOperations["addBank"], "path">>, Int64Input<ParameterAt<OpenApiOperations["addBank"], "query">>, never, CallerJsonBody<Int64Input<JsonBody<OpenApiOperations["addBank"], true>>>>;
    response: JsonResponse<OpenApiOperations["addBank"], 200>;
  };
  "addBankCAD": {
    path: Int64Input<ParameterAt<OpenApiOperations["addBankCAD"], "path">>;
    query: Int64Input<ParameterAt<OpenApiOperations["addBankCAD"], "query">>;
    headers: never;
    body: CallerJsonBody<Int64Input<JsonBody<OpenApiOperations["addBankCAD"], true>>>;
    input: FlatInput<Int64Input<ParameterAt<OpenApiOperations["addBankCAD"], "path">>, Int64Input<ParameterAt<OpenApiOperations["addBankCAD"], "query">>, never, CallerJsonBody<Int64Input<JsonBody<OpenApiOperations["addBankCAD"], true>>>>;
    response: JsonResponse<OpenApiOperations["addBankCAD"], 200>;
  };
  "createNewAccount": {
    path: Int64Input<ParameterAt<OpenApiOperations["createNewAccount"], "path">>;
    query: Int64Input<ParameterAt<OpenApiOperations["createNewAccount"], "query">>;
    headers: never;
    body: CallerJsonBody<Int64Input<JsonBody<OpenApiOperations["createNewAccount"], true>>>;
    input: FlatInput<Int64Input<ParameterAt<OpenApiOperations["createNewAccount"], "path">>, Int64Input<ParameterAt<OpenApiOperations["createNewAccount"], "query">>, never, CallerJsonBody<Int64Input<JsonBody<OpenApiOperations["createNewAccount"], true>>>>;
    response: JsonResponse<OpenApiOperations["createNewAccount"], 200>;
  };
  "createNewApprovedAddress": {
    path: Int64Input<ParameterAt<OpenApiOperations["createNewApprovedAddress"], "path">>;
    query: Int64Input<ParameterAt<OpenApiOperations["createNewApprovedAddress"], "query">>;
    headers: never;
    body: CallerJsonBody<Int64Input<JsonBody<OpenApiOperations["createNewApprovedAddress"], true>>>;
    input: FlatInput<Int64Input<ParameterAt<OpenApiOperations["createNewApprovedAddress"], "path">>, Int64Input<ParameterAt<OpenApiOperations["createNewApprovedAddress"], "query">>, never, CallerJsonBody<Int64Input<JsonBody<OpenApiOperations["createNewApprovedAddress"], true>>>>;
    response: JsonResponse<OpenApiOperations["createNewApprovedAddress"], 200>;
  };
  "createNewDepositAddress": {
    path: Int64Input<ParameterAt<OpenApiOperations["createNewDepositAddress"], "path">>;
    query: Int64Input<ParameterAt<OpenApiOperations["createNewDepositAddress"], "query">>;
    headers: never;
    body: CallerJsonBody<Int64Input<JsonBody<OpenApiOperations["createNewDepositAddress"], false>>>;
    input: FlatInput<Int64Input<ParameterAt<OpenApiOperations["createNewDepositAddress"], "path">>, Int64Input<ParameterAt<OpenApiOperations["createNewDepositAddress"], "query">>, never, CallerJsonBody<Int64Input<JsonBody<OpenApiOperations["createNewDepositAddress"], false>>>>;
    response: JsonResponse<OpenApiOperations["createNewDepositAddress"], 200>;
  };
  "getAccountDetail": {
    path: Int64Input<ParameterAt<OpenApiOperations["getAccountDetail"], "path">>;
    query: Int64Input<ParameterAt<OpenApiOperations["getAccountDetail"], "query">>;
    headers: never;
    body: CallerJsonBody<Int64Input<JsonBody<OpenApiOperations["getAccountDetail"], false>>>;
    input: FlatInput<Int64Input<ParameterAt<OpenApiOperations["getAccountDetail"], "path">>, Int64Input<ParameterAt<OpenApiOperations["getAccountDetail"], "query">>, never, CallerJsonBody<Int64Input<JsonBody<OpenApiOperations["getAccountDetail"], false>>>>;
    response: JsonResponse<OpenApiOperations["getAccountDetail"], 200>;
  };
  "getAvailableBalances": {
    path: Int64Input<ParameterAt<OpenApiOperations["getAvailableBalances"], "path">>;
    query: Int64Input<ParameterAt<OpenApiOperations["getAvailableBalances"], "query">>;
    headers: never;
    body: CallerJsonBody<Int64Input<JsonBody<OpenApiOperations["getAvailableBalances"], true>>>;
    input: FlatInput<Int64Input<ParameterAt<OpenApiOperations["getAvailableBalances"], "path">>, Int64Input<ParameterAt<OpenApiOperations["getAvailableBalances"], "query">>, never, CallerJsonBody<Int64Input<JsonBody<OpenApiOperations["getAvailableBalances"], true>>>>;
    response: JsonResponse<OpenApiOperations["getAvailableBalances"], 200>;
  };
  "getNotionalBalances": {
    path: Int64Input<ParameterAt<OpenApiOperations["getNotionalBalances"], "path">>;
    query: Int64Input<ParameterAt<OpenApiOperations["getNotionalBalances"], "query">>;
    headers: never;
    body: CallerJsonBody<Int64Input<JsonBody<OpenApiOperations["getNotionalBalances"], false>>>;
    input: FlatInput<Int64Input<ParameterAt<OpenApiOperations["getNotionalBalances"], "path">>, Int64Input<ParameterAt<OpenApiOperations["getNotionalBalances"], "query">>, never, CallerJsonBody<Int64Input<JsonBody<OpenApiOperations["getNotionalBalances"], false>>>>;
    response: JsonResponse<OpenApiOperations["getNotionalBalances"], 200>;
  };
  "getRoles": {
    path: Int64Input<ParameterAt<OpenApiOperations["getRoles"], "path">>;
    query: Int64Input<ParameterAt<OpenApiOperations["getRoles"], "query">>;
    headers: never;
    body: CallerJsonBody<Int64Input<JsonBody<OpenApiOperations["getRoles"], false>>>;
    input: FlatInput<Int64Input<ParameterAt<OpenApiOperations["getRoles"], "path">>, Int64Input<ParameterAt<OpenApiOperations["getRoles"], "query">>, never, CallerJsonBody<Int64Input<JsonBody<OpenApiOperations["getRoles"], false>>>>;
    response: JsonResponse<OpenApiOperations["getRoles"], 200>;
  };
  "listAccountsInGroup": {
    path: Int64Input<ParameterAt<OpenApiOperations["listAccountsInGroup"], "path">>;
    query: Int64Input<ParameterAt<OpenApiOperations["listAccountsInGroup"], "query">>;
    headers: never;
    body: CallerJsonBody<Int64Input<JsonBody<OpenApiOperations["listAccountsInGroup"], false>>>;
    input: FlatInput<Int64Input<ParameterAt<OpenApiOperations["listAccountsInGroup"], "path">>, Int64Input<ParameterAt<OpenApiOperations["listAccountsInGroup"], "query">>, never, CallerJsonBody<Int64Input<JsonBody<OpenApiOperations["listAccountsInGroup"], false>>>>;
    response: JsonResponse<OpenApiOperations["listAccountsInGroup"], 200>;
  };
  "listApprovedAddresses": {
    path: Int64Input<ParameterAt<OpenApiOperations["listApprovedAddresses"], "path">>;
    query: Int64Input<ParameterAt<OpenApiOperations["listApprovedAddresses"], "query">>;
    headers: never;
    body: CallerJsonBody<Int64Input<JsonBody<OpenApiOperations["listApprovedAddresses"], false>>>;
    input: FlatInput<Int64Input<ParameterAt<OpenApiOperations["listApprovedAddresses"], "path">>, Int64Input<ParameterAt<OpenApiOperations["listApprovedAddresses"], "query">>, never, CallerJsonBody<Int64Input<JsonBody<OpenApiOperations["listApprovedAddresses"], false>>>>;
    response: JsonResponse<OpenApiOperations["listApprovedAddresses"], 200>;
  };
  "listDepositAddresses": {
    path: Int64Input<ParameterAt<OpenApiOperations["listDepositAddresses"], "path">>;
    query: Int64Input<ParameterAt<OpenApiOperations["listDepositAddresses"], "query">>;
    headers: never;
    body: CallerJsonBody<Int64Input<JsonBody<OpenApiOperations["listDepositAddresses"], false>>>;
    input: FlatInput<Int64Input<ParameterAt<OpenApiOperations["listDepositAddresses"], "path">>, Int64Input<ParameterAt<OpenApiOperations["listDepositAddresses"], "query">>, never, CallerJsonBody<Int64Input<JsonBody<OpenApiOperations["listDepositAddresses"], false>>>>;
    response: JsonResponse<OpenApiOperations["listDepositAddresses"], 200>;
  };
  "listPaymentMethods": {
    path: Int64Input<ParameterAt<OpenApiOperations["listPaymentMethods"], "path">>;
    query: Int64Input<ParameterAt<OpenApiOperations["listPaymentMethods"], "query">>;
    headers: never;
    body: CallerJsonBody<Int64Input<JsonBody<OpenApiOperations["listPaymentMethods"], false>>>;
    input: FlatInput<Int64Input<ParameterAt<OpenApiOperations["listPaymentMethods"], "path">>, Int64Input<ParameterAt<OpenApiOperations["listPaymentMethods"], "query">>, never, CallerJsonBody<Int64Input<JsonBody<OpenApiOperations["listPaymentMethods"], false>>>>;
    response: JsonResponse<OpenApiOperations["listPaymentMethods"], 200>;
  };
  "removeApprovedAddress": {
    path: Int64Input<ParameterAt<OpenApiOperations["removeApprovedAddress"], "path">>;
    query: Int64Input<ParameterAt<OpenApiOperations["removeApprovedAddress"], "query">>;
    headers: never;
    body: CallerJsonBody<Int64Input<JsonBody<OpenApiOperations["removeApprovedAddress"], true>>>;
    input: FlatInput<Int64Input<ParameterAt<OpenApiOperations["removeApprovedAddress"], "path">>, Int64Input<ParameterAt<OpenApiOperations["removeApprovedAddress"], "query">>, never, CallerJsonBody<Int64Input<JsonBody<OpenApiOperations["removeApprovedAddress"], true>>>>;
    response: JsonResponse<OpenApiOperations["removeApprovedAddress"], 200>;
  };
  "renameAccount": {
    path: Int64Input<ParameterAt<OpenApiOperations["renameAccount"], "path">>;
    query: Int64Input<ParameterAt<OpenApiOperations["renameAccount"], "query">>;
    headers: never;
    body: CallerJsonBody<Int64Input<JsonBody<OpenApiOperations["renameAccount"], false>>>;
    input: FlatInput<Int64Input<ParameterAt<OpenApiOperations["renameAccount"], "path">>, Int64Input<ParameterAt<OpenApiOperations["renameAccount"], "query">>, never, CallerJsonBody<Int64Input<JsonBody<OpenApiOperations["renameAccount"], false>>>>;
    response: JsonResponse<OpenApiOperations["renameAccount"], 200>;
  };
  "revokeOAuthToken": {
    path: Int64Input<ParameterAt<OpenApiOperations["revokeOAuthToken"], "path">>;
    query: Int64Input<ParameterAt<OpenApiOperations["revokeOAuthToken"], "query">>;
    headers: never;
    body: CallerJsonBody<Int64Input<JsonBody<OpenApiOperations["revokeOAuthToken"], false>>>;
    input: FlatInput<Int64Input<ParameterAt<OpenApiOperations["revokeOAuthToken"], "path">>, Int64Input<ParameterAt<OpenApiOperations["revokeOAuthToken"], "query">>, never, CallerJsonBody<Int64Input<JsonBody<OpenApiOperations["revokeOAuthToken"], false>>>>;
    response: JsonResponse<OpenApiOperations["revokeOAuthToken"], 200>;
  };
};
