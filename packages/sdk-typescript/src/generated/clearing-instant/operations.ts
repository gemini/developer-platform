// Generated from rest.yaml#Clearing & Instant. Do not edit.

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

export const CLEARING_INSTANT_OPERATIONS = {
  "cancelClearingOrder": {"responseMode":"json","operation":"clearingInstant.cancelClearingOrder","method":"post","path":"/v1/clearing/cancel","access":"authenticated","parameters":[],"headers":[],"requestBody":true,"requestBodyRequired":true,"successStatuses":[200],"responseContentTypes":["application/json"],"responseInt64Paths":[],"requestInt64Paths":{"body":[{"path":["nonce"],"allowString":true}],"path":[],"query":[]},"retryable":false},
  "confirmClearingOrder": {"responseMode":"json","operation":"clearingInstant.confirmClearingOrder","method":"post","path":"/v1/clearing/confirm","access":"authenticated","parameters":[],"headers":[],"requestBody":true,"requestBodyRequired":true,"successStatuses":[200],"responseContentTypes":["application/json"],"responseInt64Paths":[],"requestInt64Paths":{"body":[{"path":["nonce"],"allowString":true}],"path":[],"query":[]},"retryable":false},
  "createNewBrokerOrder": {"responseMode":"json","operation":"clearingInstant.createNewBrokerOrder","method":"post","path":"/v1/clearing/broker/new","access":"authenticated","parameters":[],"headers":[],"requestBody":true,"requestBodyRequired":true,"successStatuses":[200],"responseContentTypes":["application/json"],"responseInt64Paths":[],"requestInt64Paths":{"body":[{"path":["nonce"],"allowString":true}],"path":[],"query":[]},"retryable":false},
  "createNewClearingOrder": {"responseMode":"json","operation":"clearingInstant.createNewClearingOrder","method":"post","path":"/v1/clearing/new","access":"authenticated","parameters":[],"headers":[],"requestBody":true,"requestBodyRequired":true,"successStatuses":[200],"responseContentTypes":["application/json"],"responseInt64Paths":[],"requestInt64Paths":{"body":[{"path":["nonce"],"allowString":true}],"path":[],"query":[]},"retryable":false},
  "executeInstantOrder": {"responseMode":"json","operation":"clearingInstant.executeInstantOrder","method":"post","path":"/v1/instant/execute","access":"authenticated","parameters":[],"headers":[],"requestBody":true,"requestBodyRequired":true,"successStatuses":[200],"responseContentTypes":["application/json"],"responseInt64Paths":[],"requestInt64Paths":{"body":[{"path":["nonce"],"allowString":true}],"path":[],"query":[]},"retryable":false},
  "getClearingOrder": {"responseMode":"json","operation":"clearingInstant.getClearingOrder","method":"post","path":"/v1/clearing/status","access":"authenticated","parameters":[],"headers":[],"requestBody":true,"requestBodyRequired":true,"successStatuses":[200],"responseContentTypes":["application/json"],"responseInt64Paths":[],"requestInt64Paths":{"body":[{"path":["nonce"],"allowString":true}],"path":[],"query":[]},"retryable":false},
  "getInstantQuote": {"responseMode":"json","operation":"clearingInstant.getInstantQuote","method":"post","path":"/v1/instant/quote","access":"authenticated","parameters":[],"headers":[],"requestBody":true,"requestBodyRequired":true,"successStatuses":[200],"responseContentTypes":["application/json"],"responseInt64Paths":[],"requestInt64Paths":{"body":[{"path":["nonce"],"allowString":true}],"path":[],"query":[]},"retryable":false},
  "listClearingBrokers": {"responseMode":"json","operation":"clearingInstant.listClearingBrokers","method":"post","path":"/v1/clearing/broker/list","access":"authenticated","parameters":[],"headers":[],"requestBody":true,"requestBodyRequired":true,"successStatuses":[200],"responseContentTypes":["application/json"],"responseInt64Paths":[],"requestInt64Paths":{"body":[{"path":["expiration_end"],"allowString":true},{"path":["expiration_start"],"allowString":true},{"path":["nonce"],"allowString":true},{"path":["submission_end"],"allowString":true},{"path":["submission_start"],"allowString":true},{"path":["timestamp"],"allowString":true}],"path":[],"query":[]},"retryable":false},
  "listClearingOrders": {"responseMode":"json","operation":"clearingInstant.listClearingOrders","method":"post","path":"/v1/clearing/list","access":"authenticated","parameters":[],"headers":[],"requestBody":true,"requestBodyRequired":true,"successStatuses":[200],"responseContentTypes":["application/json"],"responseInt64Paths":[],"requestInt64Paths":{"body":[{"path":["expiration_end"],"allowString":true},{"path":["expiration_start"],"allowString":true},{"path":["nonce"],"allowString":true},{"path":["submission_end"],"allowString":true},{"path":["submission_start"],"allowString":true},{"path":["timestamp"],"allowString":true}],"path":[],"query":[]},"retryable":false},
  "listClearingTrades": {"responseMode":"json","operation":"clearingInstant.listClearingTrades","method":"post","path":"/v1/clearing/trades","access":"authenticated","parameters":[],"headers":[],"requestBody":true,"requestBodyRequired":true,"successStatuses":[200],"responseContentTypes":["application/json"],"responseInt64Paths":[],"requestInt64Paths":{"body":[{"path":["nonce"],"allowString":true},{"path":["timestamp"],"allowString":true}],"path":[],"query":[]},"retryable":false},
} as const;

export type ClearingInstantOperationId = keyof typeof CLEARING_INSTANT_OPERATIONS;

export type ClearingInstantOperationTypes = {
  "cancelClearingOrder": {
    path: Int64Input<ParameterAt<OpenApiOperations["cancelClearingOrder"], "path">>;
    query: Int64Input<ParameterAt<OpenApiOperations["cancelClearingOrder"], "query">>;
    headers: never;
    body: CallerJsonBody<Int64Input<JsonBody<OpenApiOperations["cancelClearingOrder"], true>>>;
    response: JsonResponse<OpenApiOperations["cancelClearingOrder"], 200>;
  };
  "confirmClearingOrder": {
    path: Int64Input<ParameterAt<OpenApiOperations["confirmClearingOrder"], "path">>;
    query: Int64Input<ParameterAt<OpenApiOperations["confirmClearingOrder"], "query">>;
    headers: never;
    body: CallerJsonBody<Int64Input<JsonBody<OpenApiOperations["confirmClearingOrder"], true>>>;
    response: JsonResponse<OpenApiOperations["confirmClearingOrder"], 200>;
  };
  "createNewBrokerOrder": {
    path: Int64Input<ParameterAt<OpenApiOperations["createNewBrokerOrder"], "path">>;
    query: Int64Input<ParameterAt<OpenApiOperations["createNewBrokerOrder"], "query">>;
    headers: never;
    body: CallerJsonBody<Int64Input<JsonBody<OpenApiOperations["createNewBrokerOrder"], true>>>;
    response: JsonResponse<OpenApiOperations["createNewBrokerOrder"], 200>;
  };
  "createNewClearingOrder": {
    path: Int64Input<ParameterAt<OpenApiOperations["createNewClearingOrder"], "path">>;
    query: Int64Input<ParameterAt<OpenApiOperations["createNewClearingOrder"], "query">>;
    headers: never;
    body: CallerJsonBody<Int64Input<JsonBody<OpenApiOperations["createNewClearingOrder"], true>>>;
    response: JsonResponse<OpenApiOperations["createNewClearingOrder"], 200>;
  };
  "executeInstantOrder": {
    path: Int64Input<ParameterAt<OpenApiOperations["executeInstantOrder"], "path">>;
    query: Int64Input<ParameterAt<OpenApiOperations["executeInstantOrder"], "query">>;
    headers: never;
    body: CallerJsonBody<Int64Input<JsonBody<OpenApiOperations["executeInstantOrder"], true>>>;
    response: JsonResponse<OpenApiOperations["executeInstantOrder"], 200>;
  };
  "getClearingOrder": {
    path: Int64Input<ParameterAt<OpenApiOperations["getClearingOrder"], "path">>;
    query: Int64Input<ParameterAt<OpenApiOperations["getClearingOrder"], "query">>;
    headers: never;
    body: CallerJsonBody<Int64Input<JsonBody<OpenApiOperations["getClearingOrder"], true>>>;
    response: JsonResponse<OpenApiOperations["getClearingOrder"], 200>;
  };
  "getInstantQuote": {
    path: Int64Input<ParameterAt<OpenApiOperations["getInstantQuote"], "path">>;
    query: Int64Input<ParameterAt<OpenApiOperations["getInstantQuote"], "query">>;
    headers: never;
    body: CallerJsonBody<Int64Input<JsonBody<OpenApiOperations["getInstantQuote"], true>>>;
    response: JsonResponse<OpenApiOperations["getInstantQuote"], 200>;
  };
  "listClearingBrokers": {
    path: Int64Input<ParameterAt<OpenApiOperations["listClearingBrokers"], "path">>;
    query: Int64Input<ParameterAt<OpenApiOperations["listClearingBrokers"], "query">>;
    headers: never;
    body: CallerJsonBody<Int64Input<JsonBody<OpenApiOperations["listClearingBrokers"], true>>>;
    response: JsonResponse<OpenApiOperations["listClearingBrokers"], 200>;
  };
  "listClearingOrders": {
    path: Int64Input<ParameterAt<OpenApiOperations["listClearingOrders"], "path">>;
    query: Int64Input<ParameterAt<OpenApiOperations["listClearingOrders"], "query">>;
    headers: never;
    body: CallerJsonBody<Int64Input<JsonBody<OpenApiOperations["listClearingOrders"], true>>>;
    response: JsonResponse<OpenApiOperations["listClearingOrders"], 200>;
  };
  "listClearingTrades": {
    path: Int64Input<ParameterAt<OpenApiOperations["listClearingTrades"], "path">>;
    query: Int64Input<ParameterAt<OpenApiOperations["listClearingTrades"], "query">>;
    headers: never;
    body: CallerJsonBody<Int64Input<JsonBody<OpenApiOperations["listClearingTrades"], true>>>;
    response: JsonResponse<OpenApiOperations["listClearingTrades"], 200>;
  };
};
