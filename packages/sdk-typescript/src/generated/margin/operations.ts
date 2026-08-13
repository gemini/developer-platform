// Generated from rest.yaml#Margin. Do not edit.

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

export const MARGIN_OPERATIONS = {
  "getMarginAccount": {"responseMode":"json","operation":"margin.getMarginAccount","method":"post","path":"/v1/margin/account","access":"authenticated","parameters":[],"headers":[],"requestBody":true,"requestBodyRequired":true,"successStatuses":[200],"responseContentTypes":["application/json"],"responseInt64Paths":[],"requestInt64Paths":{"body":[{"path":["nonce"],"allowString":true}],"path":[],"query":[]},"retryable":false},
  "getMarginRates": {"responseMode":"json","operation":"margin.getMarginRates","method":"post","path":"/v1/margin/rates","access":"authenticated","parameters":[],"headers":[],"requestBody":true,"requestBodyRequired":true,"successStatuses":[200],"responseContentTypes":["application/json"],"responseInt64Paths":[["rates","*","lastUpdated"]],"requestInt64Paths":{"body":[{"path":["nonce"],"allowString":true}],"path":[],"query":[]},"retryable":false},
  "previewMarginOrder": {"responseMode":"json","operation":"margin.previewMarginOrder","method":"post","path":"/v1/margin/order/preview","access":"authenticated","parameters":[],"headers":[],"requestBody":true,"requestBodyRequired":true,"successStatuses":[200],"responseContentTypes":["application/json"],"responseInt64Paths":[],"requestInt64Paths":{"body":[{"path":["nonce"],"allowString":true}],"path":[],"query":[]},"retryable":false},
} as const;

export type MarginOperationId = keyof typeof MARGIN_OPERATIONS;

export type MarginOperationTypes = {
  "getMarginAccount": {
    path: Int64Input<ParameterAt<OpenApiOperations["getMarginAccount"], "path">>;
    query: Int64Input<ParameterAt<OpenApiOperations["getMarginAccount"], "query">>;
    headers: never;
    body: CallerJsonBody<Int64Input<JsonBody<OpenApiOperations["getMarginAccount"], true>>>;
    response: JsonResponse<OpenApiOperations["getMarginAccount"], 200>;
  };
  "getMarginRates": {
    path: Int64Input<ParameterAt<OpenApiOperations["getMarginRates"], "path">>;
    query: Int64Input<ParameterAt<OpenApiOperations["getMarginRates"], "query">>;
    headers: never;
    body: CallerJsonBody<Int64Input<JsonBody<OpenApiOperations["getMarginRates"], true>>>;
    response: JsonResponse<OpenApiOperations["getMarginRates"], 200>;
  };
  "previewMarginOrder": {
    path: Int64Input<ParameterAt<OpenApiOperations["previewMarginOrder"], "path">>;
    query: Int64Input<ParameterAt<OpenApiOperations["previewMarginOrder"], "query">>;
    headers: never;
    body: CallerJsonBody<Int64Input<JsonBody<OpenApiOperations["previewMarginOrder"], true>>>;
    response: JsonResponse<OpenApiOperations["previewMarginOrder"], 200>;
  };
};
