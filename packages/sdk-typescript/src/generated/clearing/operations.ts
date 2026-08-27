// Generated from rest.yaml#Clearing. Do not edit.

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

export const CLEARING_OPERATIONS = {
  "cancelClearingOrder": {"responseMode":"json","operation":"clearing.cancelClearingOrder","method":"post","path":"/v1/clearing/cancel","access":"authenticated","parameters":[],"headers":[],"requestBody":true,"requestBodyRequired":true,"successStatuses":[200],"responseContentTypes":["application/json"],"responseInt64Paths":[],"requestInt64Paths":{"body":[{"path":["nonce"],"allowString":true}],"path":[],"query":[]},"retryable":false},
  "confirmClearingOrder": {"responseMode":"json","operation":"clearing.confirmClearingOrder","method":"post","path":"/v1/clearing/confirm","access":"authenticated","parameters":[],"headers":[],"requestBody":true,"requestBodyRequired":true,"successStatuses":[200],"responseContentTypes":["application/json"],"responseInt64Paths":[],"requestInt64Paths":{"body":[{"path":["nonce"],"allowString":true}],"path":[],"query":[]},"retryable":false},
  "createNewBrokerOrder": {"responseMode":"json","operation":"clearing.createNewBrokerOrder","method":"post","path":"/v1/clearing/broker/new","access":"authenticated","parameters":[],"headers":[],"requestBody":true,"requestBodyRequired":true,"successStatuses":[200],"responseContentTypes":["application/json"],"responseInt64Paths":[],"requestInt64Paths":{"body":[{"path":["nonce"],"allowString":true}],"path":[],"query":[]},"retryable":false},
  "createNewClearingOrder": {"responseMode":"json","operation":"clearing.createNewClearingOrder","method":"post","path":"/v1/clearing/new","access":"authenticated","parameters":[],"headers":[],"requestBody":true,"requestBodyRequired":true,"successStatuses":[200],"responseContentTypes":["application/json"],"responseInt64Paths":[],"requestInt64Paths":{"body":[{"path":["nonce"],"allowString":true}],"path":[],"query":[]},"retryable":false},
  "getClearingOrder": {"responseMode":"json","operation":"clearing.getClearingOrder","method":"post","path":"/v1/clearing/status","access":"authenticated","parameters":[],"headers":[],"requestBody":true,"requestBodyRequired":true,"successStatuses":[200],"responseContentTypes":["application/json"],"responseInt64Paths":[],"requestInt64Paths":{"body":[{"path":["nonce"],"allowString":true}],"path":[],"query":[]},"retryable":false},
  "listClearingBrokers": {"responseMode":"json","operation":"clearing.listClearingBrokers","method":"post","path":"/v1/clearing/broker/list","access":"authenticated","parameters":[],"headers":[],"requestBody":true,"requestBodyRequired":false,"successStatuses":[200],"responseContentTypes":["application/json"],"responseInt64Paths":[],"requestInt64Paths":{"body":[{"path":["expiration_end"],"allowString":true},{"path":["expiration_start"],"allowString":true},{"path":["nonce"],"allowString":true},{"path":["submission_end"],"allowString":true},{"path":["submission_start"],"allowString":true},{"path":["timestamp"],"allowString":true}],"path":[],"query":[]},"retryable":false},
  "listClearingOrders": {"responseMode":"json","operation":"clearing.listClearingOrders","method":"post","path":"/v1/clearing/list","access":"authenticated","parameters":[],"headers":[],"requestBody":true,"requestBodyRequired":false,"successStatuses":[200],"responseContentTypes":["application/json"],"responseInt64Paths":[],"requestInt64Paths":{"body":[{"path":["expiration_end"],"allowString":true},{"path":["expiration_start"],"allowString":true},{"path":["nonce"],"allowString":true},{"path":["submission_end"],"allowString":true},{"path":["submission_start"],"allowString":true},{"path":["timestamp"],"allowString":true}],"path":[],"query":[]},"retryable":false},
  "listClearingTrades": {"responseMode":"json","operation":"clearing.listClearingTrades","method":"post","path":"/v1/clearing/trades","access":"authenticated","parameters":[],"headers":[],"requestBody":true,"requestBodyRequired":false,"successStatuses":[200],"responseContentTypes":["application/json"],"responseInt64Paths":[],"requestInt64Paths":{"body":[{"path":["nonce"],"allowString":true},{"path":["timestamp"],"allowString":true}],"path":[],"query":[]},"retryable":false},
} as const;

export type ClearingOperationId = keyof typeof CLEARING_OPERATIONS;

export type ClearingOperationTypes = {
  "cancelClearingOrder": {
    path: Int64Input<ParameterAt<OpenApiOperations["cancelClearingOrder"], "path">>;
    query: Int64Input<ParameterAt<OpenApiOperations["cancelClearingOrder"], "query">>;
    headers: never;
    body: CallerJsonBody<Int64Input<JsonBody<OpenApiOperations["cancelClearingOrder"], true>>>;
    input: FlatInput<Int64Input<ParameterAt<OpenApiOperations["cancelClearingOrder"], "path">>, Int64Input<ParameterAt<OpenApiOperations["cancelClearingOrder"], "query">>, never, CallerJsonBody<Int64Input<JsonBody<OpenApiOperations["cancelClearingOrder"], true>>>>;
    response: JsonResponse<OpenApiOperations["cancelClearingOrder"], 200>;
  };
  "confirmClearingOrder": {
    path: Int64Input<ParameterAt<OpenApiOperations["confirmClearingOrder"], "path">>;
    query: Int64Input<ParameterAt<OpenApiOperations["confirmClearingOrder"], "query">>;
    headers: never;
    body: CallerJsonBody<Int64Input<JsonBody<OpenApiOperations["confirmClearingOrder"], true>>>;
    input: FlatInput<Int64Input<ParameterAt<OpenApiOperations["confirmClearingOrder"], "path">>, Int64Input<ParameterAt<OpenApiOperations["confirmClearingOrder"], "query">>, never, CallerJsonBody<Int64Input<JsonBody<OpenApiOperations["confirmClearingOrder"], true>>>>;
    response: JsonResponse<OpenApiOperations["confirmClearingOrder"], 200>;
  };
  "createNewBrokerOrder": {
    path: Int64Input<ParameterAt<OpenApiOperations["createNewBrokerOrder"], "path">>;
    query: Int64Input<ParameterAt<OpenApiOperations["createNewBrokerOrder"], "query">>;
    headers: never;
    body: CallerJsonBody<Int64Input<JsonBody<OpenApiOperations["createNewBrokerOrder"], true>>>;
    input: FlatInput<Int64Input<ParameterAt<OpenApiOperations["createNewBrokerOrder"], "path">>, Int64Input<ParameterAt<OpenApiOperations["createNewBrokerOrder"], "query">>, never, CallerJsonBody<Int64Input<JsonBody<OpenApiOperations["createNewBrokerOrder"], true>>>>;
    response: JsonResponse<OpenApiOperations["createNewBrokerOrder"], 200>;
  };
  "createNewClearingOrder": {
    path: Int64Input<ParameterAt<OpenApiOperations["createNewClearingOrder"], "path">>;
    query: Int64Input<ParameterAt<OpenApiOperations["createNewClearingOrder"], "query">>;
    headers: never;
    body: CallerJsonBody<Int64Input<JsonBody<OpenApiOperations["createNewClearingOrder"], true>>>;
    input: FlatInput<Int64Input<ParameterAt<OpenApiOperations["createNewClearingOrder"], "path">>, Int64Input<ParameterAt<OpenApiOperations["createNewClearingOrder"], "query">>, never, CallerJsonBody<Int64Input<JsonBody<OpenApiOperations["createNewClearingOrder"], true>>>>;
    response: JsonResponse<OpenApiOperations["createNewClearingOrder"], 200>;
  };
  "getClearingOrder": {
    path: Int64Input<ParameterAt<OpenApiOperations["getClearingOrder"], "path">>;
    query: Int64Input<ParameterAt<OpenApiOperations["getClearingOrder"], "query">>;
    headers: never;
    body: CallerJsonBody<Int64Input<JsonBody<OpenApiOperations["getClearingOrder"], true>>>;
    input: FlatInput<Int64Input<ParameterAt<OpenApiOperations["getClearingOrder"], "path">>, Int64Input<ParameterAt<OpenApiOperations["getClearingOrder"], "query">>, never, CallerJsonBody<Int64Input<JsonBody<OpenApiOperations["getClearingOrder"], true>>>>;
    response: JsonResponse<OpenApiOperations["getClearingOrder"], 200>;
  };
  "listClearingBrokers": {
    path: Int64Input<ParameterAt<OpenApiOperations["listClearingBrokers"], "path">>;
    query: Int64Input<ParameterAt<OpenApiOperations["listClearingBrokers"], "query">>;
    headers: never;
    body: CallerJsonBody<Int64Input<JsonBody<OpenApiOperations["listClearingBrokers"], false>>>;
    input: FlatInput<Int64Input<ParameterAt<OpenApiOperations["listClearingBrokers"], "path">>, Int64Input<ParameterAt<OpenApiOperations["listClearingBrokers"], "query">>, never, CallerJsonBody<Int64Input<JsonBody<OpenApiOperations["listClearingBrokers"], false>>>>;
    response: JsonResponse<OpenApiOperations["listClearingBrokers"], 200>;
  };
  "listClearingOrders": {
    path: Int64Input<ParameterAt<OpenApiOperations["listClearingOrders"], "path">>;
    query: Int64Input<ParameterAt<OpenApiOperations["listClearingOrders"], "query">>;
    headers: never;
    body: CallerJsonBody<Int64Input<JsonBody<OpenApiOperations["listClearingOrders"], false>>>;
    input: FlatInput<Int64Input<ParameterAt<OpenApiOperations["listClearingOrders"], "path">>, Int64Input<ParameterAt<OpenApiOperations["listClearingOrders"], "query">>, never, CallerJsonBody<Int64Input<JsonBody<OpenApiOperations["listClearingOrders"], false>>>>;
    response: JsonResponse<OpenApiOperations["listClearingOrders"], 200>;
  };
  "listClearingTrades": {
    path: Int64Input<ParameterAt<OpenApiOperations["listClearingTrades"], "path">>;
    query: Int64Input<ParameterAt<OpenApiOperations["listClearingTrades"], "query">>;
    headers: never;
    body: CallerJsonBody<Int64Input<JsonBody<OpenApiOperations["listClearingTrades"], false>>>;
    input: FlatInput<Int64Input<ParameterAt<OpenApiOperations["listClearingTrades"], "path">>, Int64Input<ParameterAt<OpenApiOperations["listClearingTrades"], "query">>, never, CallerJsonBody<Int64Input<JsonBody<OpenApiOperations["listClearingTrades"], false>>>>;
    response: JsonResponse<OpenApiOperations["listClearingTrades"], 200>;
  };
};
