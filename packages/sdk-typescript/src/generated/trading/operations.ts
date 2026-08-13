// Generated from rest.yaml#Trading. Do not edit.

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

export const TRADING_OPERATIONS = {
  "cancelAllActiveOrders": {"responseMode":"json","operation":"trading.cancelAllActiveOrders","method":"post","path":"/v1/order/cancel/all","access":"authenticated","parameters":[],"headers":[],"requestBody":true,"requestBodyRequired":true,"successStatuses":[200],"responseContentTypes":["application/json"],"responseInt64Paths":[],"requestInt64Paths":{"body":[{"path":["nonce"],"allowString":true}],"path":[],"query":[]},"retryable":false},
  "cancelAllSessionOrders": {"responseMode":"json","operation":"trading.cancelAllSessionOrders","method":"post","path":"/v1/order/cancel/session","access":"authenticated","parameters":[],"headers":[],"requestBody":true,"requestBodyRequired":true,"successStatuses":[200],"responseContentTypes":["application/json"],"responseInt64Paths":[],"requestInt64Paths":{"body":[{"path":["nonce"],"allowString":true}],"path":[],"query":[]},"retryable":false},
  "cancelOrder": {"responseMode":"json","operation":"trading.cancelOrder","method":"post","path":"/v1/order/cancel","access":"authenticated","parameters":[],"headers":[],"requestBody":true,"requestBodyRequired":true,"successStatuses":[200],"responseContentTypes":["application/json"],"responseInt64Paths":[],"requestInt64Paths":{"body":[{"path":["nonce"],"allowString":true},{"path":["order_id"],"unsigned":true}],"path":[],"query":[]},"retryable":false},
  "createNewOrder": {"responseMode":"json","operation":"trading.createNewOrder","method":"post","path":"/v1/order/new","access":"authenticated","parameters":[],"headers":[],"requestBody":true,"requestBodyRequired":true,"successStatuses":[200],"responseContentTypes":["application/json"],"responseInt64Paths":[],"requestInt64Paths":{"body":[],"path":[],"query":[]},"retryable":false},
  "getNotionalTradingVolume": {"responseMode":"json","operation":"trading.getNotionalTradingVolume","method":"post","path":"/v1/notionalvolume","access":"authenticated","parameters":[],"headers":[],"requestBody":true,"requestBodyRequired":true,"successStatuses":[200],"responseContentTypes":["application/json"],"responseInt64Paths":[],"requestInt64Paths":{"body":[{"path":["nonce"],"allowString":true}],"path":[],"query":[]},"retryable":false},
  "getOrderStatus": {"responseMode":"json","operation":"trading.getOrderStatus","method":"post","path":"/v1/order/status","access":"authenticated","parameters":[],"headers":[],"requestBody":true,"requestBodyRequired":true,"successStatuses":[200],"responseContentTypes":["application/json"],"responseInt64Paths":[],"requestInt64Paths":{"body":[{"path":["nonce"],"allowString":true},{"path":["order_id"],"unsigned":true}],"path":[],"query":[]},"retryable":false},
  "getTradingVolume": {"responseMode":"json","operation":"trading.getTradingVolume","method":"post","path":"/v1/tradevolume","access":"authenticated","parameters":[],"headers":[],"requestBody":true,"requestBodyRequired":true,"successStatuses":[200],"responseContentTypes":["application/json"],"responseInt64Paths":[],"requestInt64Paths":{"body":[{"path":["nonce"],"allowString":true}],"path":[],"query":[]},"retryable":false},
  "listActiveOrders": {"responseMode":"json","operation":"trading.listActiveOrders","method":"post","path":"/v1/orders","access":"authenticated","parameters":[],"headers":[],"requestBody":true,"requestBodyRequired":true,"successStatuses":[200],"responseContentTypes":["application/json"],"responseInt64Paths":[],"requestInt64Paths":{"body":[{"path":["nonce"],"allowString":true}],"path":[],"query":[]},"retryable":false},
  "listPastOrders": {"responseMode":"json","operation":"trading.listPastOrders","method":"post","path":"/v1/orders/history","access":"authenticated","parameters":[],"headers":[],"requestBody":true,"requestBodyRequired":true,"successStatuses":[200],"responseContentTypes":["application/json"],"responseInt64Paths":[],"requestInt64Paths":{"body":[{"path":["nonce"],"allowString":true},{"path":["timestamp"],"allowString":true}],"path":[],"query":[]},"retryable":false},
  "listPastTrades": {"responseMode":"json","operation":"trading.listPastTrades","method":"post","path":"/v1/mytrades","access":"authenticated","parameters":[],"headers":[],"requestBody":true,"requestBodyRequired":true,"successStatuses":[200],"responseContentTypes":["application/json"],"responseInt64Paths":[["*","tid"]],"requestInt64Paths":{"body":[{"path":["nonce"],"allowString":true},{"path":["timestamp"],"allowString":true}],"path":[],"query":[]},"retryable":false},
  "sendHeartbeat": {"responseMode":"json","operation":"trading.sendHeartbeat","method":"post","path":"/v1/heartbeat","access":"authenticated","parameters":[],"headers":[],"requestBody":true,"requestBodyRequired":true,"successStatuses":[200],"responseContentTypes":["application/json"],"responseInt64Paths":[],"requestInt64Paths":{"body":[{"path":["nonce"],"allowString":true}],"path":[],"query":[]},"retryable":false},
  "wrapOrder": {"responseMode":"json","operation":"trading.wrapOrder","method":"post","path":"/v1/wrap/{symbol}","access":"authenticated","parameters":[{"name":"symbol","in":"path","required":true,"style":"simple","explode":false}],"headers":[],"requestBody":true,"requestBodyRequired":true,"successStatuses":[200],"responseContentTypes":["application/json"],"responseInt64Paths":[],"requestInt64Paths":{"body":[{"path":["nonce"],"allowString":true}],"path":[],"query":[]},"retryable":false},
} as const;

export type TradingOperationId = keyof typeof TRADING_OPERATIONS;

export type TradingOperationTypes = {
  "cancelAllActiveOrders": {
    path: Int64Input<ParameterAt<OpenApiOperations["cancelAllActiveOrders"], "path">>;
    query: Int64Input<ParameterAt<OpenApiOperations["cancelAllActiveOrders"], "query">>;
    headers: never;
    body: CallerJsonBody<Int64Input<JsonBody<OpenApiOperations["cancelAllActiveOrders"], true>>>;
    response: JsonResponse<OpenApiOperations["cancelAllActiveOrders"], 200>;
  };
  "cancelAllSessionOrders": {
    path: Int64Input<ParameterAt<OpenApiOperations["cancelAllSessionOrders"], "path">>;
    query: Int64Input<ParameterAt<OpenApiOperations["cancelAllSessionOrders"], "query">>;
    headers: never;
    body: CallerJsonBody<Int64Input<JsonBody<OpenApiOperations["cancelAllSessionOrders"], true>>>;
    response: JsonResponse<OpenApiOperations["cancelAllSessionOrders"], 200>;
  };
  "cancelOrder": {
    path: Int64Input<ParameterAt<OpenApiOperations["cancelOrder"], "path">>;
    query: Int64Input<ParameterAt<OpenApiOperations["cancelOrder"], "query">>;
    headers: never;
    body: CallerJsonBody<Int64Input<JsonBody<OpenApiOperations["cancelOrder"], true>>>;
    response: JsonResponse<OpenApiOperations["cancelOrder"], 200>;
  };
  "createNewOrder": {
    path: Int64Input<ParameterAt<OpenApiOperations["createNewOrder"], "path">>;
    query: Int64Input<ParameterAt<OpenApiOperations["createNewOrder"], "query">>;
    headers: never;
    body: CallerJsonBody<Int64Input<JsonBody<OpenApiOperations["createNewOrder"], true>>>;
    response: JsonResponse<OpenApiOperations["createNewOrder"], 200>;
  };
  "getNotionalTradingVolume": {
    path: Int64Input<ParameterAt<OpenApiOperations["getNotionalTradingVolume"], "path">>;
    query: Int64Input<ParameterAt<OpenApiOperations["getNotionalTradingVolume"], "query">>;
    headers: never;
    body: CallerJsonBody<Int64Input<JsonBody<OpenApiOperations["getNotionalTradingVolume"], true>>>;
    response: JsonResponse<OpenApiOperations["getNotionalTradingVolume"], 200>;
  };
  "getOrderStatus": {
    path: Int64Input<ParameterAt<OpenApiOperations["getOrderStatus"], "path">>;
    query: Int64Input<ParameterAt<OpenApiOperations["getOrderStatus"], "query">>;
    headers: never;
    body: CallerJsonBody<Int64Input<JsonBody<OpenApiOperations["getOrderStatus"], true>>>;
    response: JsonResponse<OpenApiOperations["getOrderStatus"], 200>;
  };
  "getTradingVolume": {
    path: Int64Input<ParameterAt<OpenApiOperations["getTradingVolume"], "path">>;
    query: Int64Input<ParameterAt<OpenApiOperations["getTradingVolume"], "query">>;
    headers: never;
    body: CallerJsonBody<Int64Input<JsonBody<OpenApiOperations["getTradingVolume"], true>>>;
    response: JsonResponse<OpenApiOperations["getTradingVolume"], 200>;
  };
  "listActiveOrders": {
    path: Int64Input<ParameterAt<OpenApiOperations["listActiveOrders"], "path">>;
    query: Int64Input<ParameterAt<OpenApiOperations["listActiveOrders"], "query">>;
    headers: never;
    body: CallerJsonBody<Int64Input<JsonBody<OpenApiOperations["listActiveOrders"], true>>>;
    response: JsonResponse<OpenApiOperations["listActiveOrders"], 200>;
  };
  "listPastOrders": {
    path: Int64Input<ParameterAt<OpenApiOperations["listPastOrders"], "path">>;
    query: Int64Input<ParameterAt<OpenApiOperations["listPastOrders"], "query">>;
    headers: never;
    body: CallerJsonBody<Int64Input<JsonBody<OpenApiOperations["listPastOrders"], true>>>;
    response: JsonResponse<OpenApiOperations["listPastOrders"], 200>;
  };
  "listPastTrades": {
    path: Int64Input<ParameterAt<OpenApiOperations["listPastTrades"], "path">>;
    query: Int64Input<ParameterAt<OpenApiOperations["listPastTrades"], "query">>;
    headers: never;
    body: CallerJsonBody<Int64Input<JsonBody<OpenApiOperations["listPastTrades"], true>>>;
    response: JsonResponse<OpenApiOperations["listPastTrades"], 200>;
  };
  "sendHeartbeat": {
    path: Int64Input<ParameterAt<OpenApiOperations["sendHeartbeat"], "path">>;
    query: Int64Input<ParameterAt<OpenApiOperations["sendHeartbeat"], "query">>;
    headers: never;
    body: CallerJsonBody<Int64Input<JsonBody<OpenApiOperations["sendHeartbeat"], true>>>;
    response: JsonResponse<OpenApiOperations["sendHeartbeat"], 200>;
  };
  "wrapOrder": {
    path: Int64Input<ParameterAt<OpenApiOperations["wrapOrder"], "path">>;
    query: Int64Input<ParameterAt<OpenApiOperations["wrapOrder"], "query">>;
    headers: never;
    body: CallerJsonBody<Int64Input<JsonBody<OpenApiOperations["wrapOrder"], true>>>;
    response: JsonResponse<OpenApiOperations["wrapOrder"], 200>;
  };
};
