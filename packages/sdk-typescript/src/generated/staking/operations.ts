// Generated from rest.yaml#Staking. Do not edit.

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

export const STAKING_OPERATIONS = {
  "listStakingBalances": {"responseMode":"json","operation":"staking.listStakingBalances","method":"post","path":"/v1/balances/staking","access":"authenticated","parameters":[],"headers":[],"requestBody":true,"requestBodyRequired":false,"successStatuses":[200],"responseContentTypes":["application/json"],"responseInt64Paths":[],"requestInt64Paths":{"body":[{"path":["nonce"],"allowString":true}],"path":[],"query":[]},"retryable":false},
  "listStakingEventHistory": {"responseMode":"json","operation":"staking.listStakingEventHistory","method":"post","path":"/v1/staking/history","access":"authenticated","parameters":[],"headers":[],"requestBody":true,"requestBodyRequired":false,"successStatuses":[200],"responseContentTypes":["application/json"],"responseInt64Paths":[],"requestInt64Paths":{"body":[{"path":["nonce"],"allowString":true},{"path":["since"],"allowString":true},{"path":["until"],"allowString":true}],"path":[],"query":[]},"retryable":false},
  "listStakingRates": {"responseMode":"json","operation":"staking.listStakingRates","method":"get","path":"/v1/staking/rates","access":"public","parameters":[],"headers":[],"requestBody":false,"requestBodyRequired":false,"successStatuses":[200],"responseContentTypes":["application/json"],"responseInt64Paths":[],"requestInt64Paths":{"body":[],"path":[],"query":[]},"retryable":true},
  "listStakingRewards": {"responseMode":"json","operation":"staking.listStakingRewards","method":"post","path":"/v1/staking/rewards","access":"authenticated","parameters":[],"headers":[],"requestBody":true,"requestBodyRequired":true,"successStatuses":[200],"responseContentTypes":["application/json"],"responseInt64Paths":[],"requestInt64Paths":{"body":[{"path":["nonce"],"allowString":true}],"path":[],"query":[]},"retryable":false},
  "stakeCryptoFunds": {"responseMode":"json","operation":"staking.stakeCryptoFunds","method":"post","path":"/v1/staking/stake","access":"authenticated","parameters":[],"headers":[],"requestBody":true,"requestBodyRequired":true,"successStatuses":[200],"responseContentTypes":["application/json"],"responseInt64Paths":[],"requestInt64Paths":{"body":[{"path":["nonce"],"allowString":true}],"path":[],"query":[]},"retryable":false},
  "unstakeCryptoFunds": {"responseMode":"json","operation":"staking.unstakeCryptoFunds","method":"post","path":"/v1/staking/unstake","access":"authenticated","parameters":[],"headers":[],"requestBody":true,"requestBodyRequired":true,"successStatuses":[200],"responseContentTypes":["application/json"],"responseInt64Paths":[],"requestInt64Paths":{"body":[{"path":["nonce"],"allowString":true}],"path":[],"query":[]},"retryable":false},
} as const;

export type StakingOperationId = keyof typeof STAKING_OPERATIONS;

export type StakingOperationTypes = {
  "listStakingBalances": {
    path: Int64Input<ParameterAt<OpenApiOperations["listStakingBalances"], "path">>;
    query: Int64Input<ParameterAt<OpenApiOperations["listStakingBalances"], "query">>;
    headers: never;
    body: CallerJsonBody<Int64Input<JsonBody<OpenApiOperations["listStakingBalances"], false>>>;
    input: FlatInput<Int64Input<ParameterAt<OpenApiOperations["listStakingBalances"], "path">>, Int64Input<ParameterAt<OpenApiOperations["listStakingBalances"], "query">>, never, CallerJsonBody<Int64Input<JsonBody<OpenApiOperations["listStakingBalances"], false>>>>;
    response: JsonResponse<OpenApiOperations["listStakingBalances"], 200>;
  };
  "listStakingEventHistory": {
    path: Int64Input<ParameterAt<OpenApiOperations["listStakingEventHistory"], "path">>;
    query: Int64Input<ParameterAt<OpenApiOperations["listStakingEventHistory"], "query">>;
    headers: never;
    body: CallerJsonBody<Int64Input<JsonBody<OpenApiOperations["listStakingEventHistory"], false>>>;
    input: FlatInput<Int64Input<ParameterAt<OpenApiOperations["listStakingEventHistory"], "path">>, Int64Input<ParameterAt<OpenApiOperations["listStakingEventHistory"], "query">>, never, CallerJsonBody<Int64Input<JsonBody<OpenApiOperations["listStakingEventHistory"], false>>>>;
    response: JsonResponse<OpenApiOperations["listStakingEventHistory"], 200>;
  };
  "listStakingRates": {
    path: Int64Input<ParameterAt<OpenApiOperations["listStakingRates"], "path">>;
    query: Int64Input<ParameterAt<OpenApiOperations["listStakingRates"], "query">>;
    headers: never;
    body: never;
    input: FlatInput<Int64Input<ParameterAt<OpenApiOperations["listStakingRates"], "path">>, Int64Input<ParameterAt<OpenApiOperations["listStakingRates"], "query">>, never, never>;
    response: JsonResponse<OpenApiOperations["listStakingRates"], 200>;
  };
  "listStakingRewards": {
    path: Int64Input<ParameterAt<OpenApiOperations["listStakingRewards"], "path">>;
    query: Int64Input<ParameterAt<OpenApiOperations["listStakingRewards"], "query">>;
    headers: never;
    body: CallerJsonBody<Int64Input<JsonBody<OpenApiOperations["listStakingRewards"], true>>>;
    input: FlatInput<Int64Input<ParameterAt<OpenApiOperations["listStakingRewards"], "path">>, Int64Input<ParameterAt<OpenApiOperations["listStakingRewards"], "query">>, never, CallerJsonBody<Int64Input<JsonBody<OpenApiOperations["listStakingRewards"], true>>>>;
    response: JsonResponse<OpenApiOperations["listStakingRewards"], 200>;
  };
  "stakeCryptoFunds": {
    path: Int64Input<ParameterAt<OpenApiOperations["stakeCryptoFunds"], "path">>;
    query: Int64Input<ParameterAt<OpenApiOperations["stakeCryptoFunds"], "query">>;
    headers: never;
    body: CallerJsonBody<Int64Input<JsonBody<OpenApiOperations["stakeCryptoFunds"], true>>>;
    input: FlatInput<Int64Input<ParameterAt<OpenApiOperations["stakeCryptoFunds"], "path">>, Int64Input<ParameterAt<OpenApiOperations["stakeCryptoFunds"], "query">>, never, CallerJsonBody<Int64Input<JsonBody<OpenApiOperations["stakeCryptoFunds"], true>>>>;
    response: JsonResponse<OpenApiOperations["stakeCryptoFunds"], 200>;
  };
  "unstakeCryptoFunds": {
    path: Int64Input<ParameterAt<OpenApiOperations["unstakeCryptoFunds"], "path">>;
    query: Int64Input<ParameterAt<OpenApiOperations["unstakeCryptoFunds"], "query">>;
    headers: never;
    body: CallerJsonBody<Int64Input<JsonBody<OpenApiOperations["unstakeCryptoFunds"], true>>>;
    input: FlatInput<Int64Input<ParameterAt<OpenApiOperations["unstakeCryptoFunds"], "path">>, Int64Input<ParameterAt<OpenApiOperations["unstakeCryptoFunds"], "query">>, never, CallerJsonBody<Int64Input<JsonBody<OpenApiOperations["unstakeCryptoFunds"], true>>>>;
    response: JsonResponse<OpenApiOperations["unstakeCryptoFunds"], 200>;
  };
};
