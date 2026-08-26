// Generated from rest.yaml#Instant. Do not edit.

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

export const INSTANT_OPERATIONS = {
  "executeInstantOrder": {"responseMode":"json","operation":"instant.executeInstantOrder","method":"post","path":"/v1/instant/execute","access":"authenticated","parameters":[],"headers":[],"requestBody":true,"requestBodyRequired":true,"successStatuses":[200],"responseContentTypes":["application/json"],"responseInt64Paths":[],"requestInt64Paths":{"body":[{"path":["nonce"],"allowString":true}],"path":[],"query":[]},"retryable":false},
  "getInstantQuote": {"responseMode":"json","operation":"instant.getInstantQuote","method":"post","path":"/v1/instant/quote","access":"authenticated","parameters":[],"headers":[],"requestBody":true,"requestBodyRequired":true,"successStatuses":[200],"responseContentTypes":["application/json"],"responseInt64Paths":[],"requestInt64Paths":{"body":[{"path":["nonce"],"allowString":true}],"path":[],"query":[]},"retryable":false},
} as const;

export type InstantOperationId = keyof typeof INSTANT_OPERATIONS;

export type InstantOperationTypes = {
  "executeInstantOrder": {
    path: Int64Input<ParameterAt<OpenApiOperations["executeInstantOrder"], "path">>;
    query: Int64Input<ParameterAt<OpenApiOperations["executeInstantOrder"], "query">>;
    headers: never;
    body: CallerJsonBody<Int64Input<JsonBody<OpenApiOperations["executeInstantOrder"], true>>>;
    input: FlatInput<Int64Input<ParameterAt<OpenApiOperations["executeInstantOrder"], "path">>, Int64Input<ParameterAt<OpenApiOperations["executeInstantOrder"], "query">>, never, CallerJsonBody<Int64Input<JsonBody<OpenApiOperations["executeInstantOrder"], true>>>>;
    response: JsonResponse<OpenApiOperations["executeInstantOrder"], 200>;
  };
  "getInstantQuote": {
    path: Int64Input<ParameterAt<OpenApiOperations["getInstantQuote"], "path">>;
    query: Int64Input<ParameterAt<OpenApiOperations["getInstantQuote"], "query">>;
    headers: never;
    body: CallerJsonBody<Int64Input<JsonBody<OpenApiOperations["getInstantQuote"], true>>>;
    input: FlatInput<Int64Input<ParameterAt<OpenApiOperations["getInstantQuote"], "path">>, Int64Input<ParameterAt<OpenApiOperations["getInstantQuote"], "query">>, never, CallerJsonBody<Int64Input<JsonBody<OpenApiOperations["getInstantQuote"], true>>>>;
    response: JsonResponse<OpenApiOperations["getInstantQuote"], 200>;
  };
};
