// Generated from rest.yaml#Perpetuals. Do not edit.

import type { RestFileResponse } from "../../transport/http.js";
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

export const PERPETUALS_OPERATIONS = {
  "getAccountMargin": {"responseMode":"json","operation":"perpetuals.getAccountMargin","method":"post","path":"/v1/margin","access":"authenticated","parameters":[],"headers":[],"requestBody":true,"requestBodyRequired":true,"successStatuses":[200],"responseContentTypes":["application/json"],"responseInt64Paths":[],"requestInt64Paths":{"body":[{"path":["nonce"],"allowString":true}],"path":[],"query":[]},"retryable":false},
  "getFundingPaymentReportFile": {"responseMode":"file","operation":"perpetuals.getFundingPaymentReportFile","method":"get","path":"/v1/perpetuals/fundingpaymentreport/records.xlsx","access":"authenticated","parameters":[{"name":"fromDate","in":"query","required":false,"style":"form","explode":true,"valueType":"string","shape":"scalar","allowReserved":false},{"name":"toDate","in":"query","required":false,"style":"form","explode":true,"valueType":"string","shape":"scalar","allowReserved":false},{"name":"numRows","in":"query","required":false,"style":"form","explode":true,"valueType":"integer","shape":"scalar","allowReserved":false}],"headers":[],"requestBody":true,"requestBodyRequired":false,"successStatuses":[200],"responseContentTypes":["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],"responseInt64Paths":[],"requestInt64Paths":{"body":[{"path":["nonce"],"allowString":true}],"path":[],"query":[]},"queryInRequest":true,"retryable":true},
  "getFundingPaymentReportJson": {"responseMode":"json","operation":"perpetuals.getFundingPaymentReportJson","method":"post","path":"/v1/perpetuals/fundingpaymentreport/records.json","access":"authenticated","parameters":[{"name":"fromDate","in":"query","required":false,"style":"form","explode":true,"valueType":"string","shape":"scalar","allowReserved":false},{"name":"toDate","in":"query","required":false,"style":"form","explode":true,"valueType":"string","shape":"scalar","allowReserved":false},{"name":"numRows","in":"query","required":false,"style":"form","explode":true,"valueType":"integer","shape":"scalar","allowReserved":false}],"headers":[],"requestBody":true,"requestBodyRequired":false,"successStatuses":[200],"responseContentTypes":["application/json"],"responseInt64Paths":[],"requestInt64Paths":{"body":[{"path":["nonce"],"allowString":true}],"path":[],"query":[]},"queryInRequest":true,"retryable":false},
  "getOpenPositions": {"responseMode":"json","operation":"perpetuals.getOpenPositions","method":"post","path":"/v1/positions","access":"authenticated","parameters":[],"headers":[],"requestBody":true,"requestBodyRequired":false,"successStatuses":[200],"responseContentTypes":["application/json"],"responseInt64Paths":[],"requestInt64Paths":{"body":[{"path":["nonce"],"allowString":true}],"path":[],"query":[]},"retryable":false},
  "getRiskStats": {"responseMode":"json","operation":"perpetuals.getRiskStats","method":"get","path":"/v1/riskstats/{symbol}","access":"public","parameters":[{"name":"symbol","in":"path","required":true,"style":"simple","explode":false,"valueType":"string"}],"headers":[],"requestBody":false,"requestBodyRequired":false,"successStatuses":[200],"responseContentTypes":["application/json"],"responseInt64Paths":[],"requestInt64Paths":{"body":[],"path":[],"query":[]},"retryable":true},
  "listFundingPayments": {"responseMode":"json","operation":"perpetuals.listFundingPayments","method":"post","path":"/v1/perpetuals/fundingPayment","access":"authenticated","parameters":[{"name":"since","in":"query","required":false,"style":"form","explode":true,"valueTypes":["string","integer"],"shape":"scalar","allowReserved":false},{"name":"to","in":"query","required":false,"style":"form","explode":true,"valueTypes":["string","integer"],"shape":"scalar","allowReserved":false}],"headers":[],"requestBody":true,"requestBodyRequired":false,"successStatuses":[200],"responseContentTypes":["application/json"],"responseInt64Paths":[],"requestInt64Paths":{"body":[{"path":["nonce"],"allowString":true}],"path":[],"query":[{"path":["since"],"allowString":true},{"path":["to"],"allowString":true}]},"queryInRequest":false,"retryable":false},
} as const;

export type PerpetualsOperationId = keyof typeof PERPETUALS_OPERATIONS;

export type PerpetualsOperationTypes = {
  "getAccountMargin": {
    path: Int64Input<ParameterAt<OpenApiOperations["getAccountMargin"], "path">>;
    query: Int64Input<ParameterAt<OpenApiOperations["getAccountMargin"], "query">>;
    headers: never;
    body: CallerJsonBody<Int64Input<JsonBody<OpenApiOperations["getAccountMargin"], true>>>;
    input: FlatInput<Int64Input<ParameterAt<OpenApiOperations["getAccountMargin"], "path">>, Int64Input<ParameterAt<OpenApiOperations["getAccountMargin"], "query">>, never, CallerJsonBody<Int64Input<JsonBody<OpenApiOperations["getAccountMargin"], true>>>>;
    response: JsonResponse<OpenApiOperations["getAccountMargin"], 200>;
  };
  "getFundingPaymentReportFile": {
    path: Int64Input<ParameterAt<OpenApiOperations["getFundingPaymentReportFile"], "path">>;
    query: Int64Input<ParameterAt<OpenApiOperations["getFundingPaymentReportFile"], "query">>;
    headers: never;
    body: CallerJsonBody<Int64Input<JsonBody<OpenApiOperations["getFundingPaymentReportFile"], false>>>;
    input: FlatInput<Int64Input<ParameterAt<OpenApiOperations["getFundingPaymentReportFile"], "path">>, Int64Input<ParameterAt<OpenApiOperations["getFundingPaymentReportFile"], "query">>, never, CallerJsonBody<Int64Input<JsonBody<OpenApiOperations["getFundingPaymentReportFile"], false>>>>;
    response: RestFileResponse;
  };
  "getFundingPaymentReportJson": {
    path: Int64Input<ParameterAt<OpenApiOperations["getFundingPaymentReportJson"], "path">>;
    query: Int64Input<ParameterAt<OpenApiOperations["getFundingPaymentReportJson"], "query">>;
    headers: never;
    body: CallerJsonBody<Int64Input<JsonBody<OpenApiOperations["getFundingPaymentReportJson"], false>>>;
    input: FlatInput<Int64Input<ParameterAt<OpenApiOperations["getFundingPaymentReportJson"], "path">>, Int64Input<ParameterAt<OpenApiOperations["getFundingPaymentReportJson"], "query">>, never, CallerJsonBody<Int64Input<JsonBody<OpenApiOperations["getFundingPaymentReportJson"], false>>>>;
    response: JsonResponse<OpenApiOperations["getFundingPaymentReportJson"], 200>;
  };
  "getOpenPositions": {
    path: Int64Input<ParameterAt<OpenApiOperations["getOpenPositions"], "path">>;
    query: Int64Input<ParameterAt<OpenApiOperations["getOpenPositions"], "query">>;
    headers: never;
    body: CallerJsonBody<Int64Input<JsonBody<OpenApiOperations["getOpenPositions"], false>>>;
    input: FlatInput<Int64Input<ParameterAt<OpenApiOperations["getOpenPositions"], "path">>, Int64Input<ParameterAt<OpenApiOperations["getOpenPositions"], "query">>, never, CallerJsonBody<Int64Input<JsonBody<OpenApiOperations["getOpenPositions"], false>>>>;
    response: JsonResponse<OpenApiOperations["getOpenPositions"], 200>;
  };
  "getRiskStats": {
    path: Int64Input<ParameterAt<OpenApiOperations["getRiskStats"], "path">>;
    query: Int64Input<ParameterAt<OpenApiOperations["getRiskStats"], "query">>;
    headers: never;
    body: never;
    input: FlatInput<Int64Input<ParameterAt<OpenApiOperations["getRiskStats"], "path">>, Int64Input<ParameterAt<OpenApiOperations["getRiskStats"], "query">>, never, never>;
    response: JsonResponse<OpenApiOperations["getRiskStats"], 200>;
  };
  "listFundingPayments": {
    path: Int64Input<ParameterAt<OpenApiOperations["listFundingPayments"], "path">>;
    query: Int64Input<ParameterAt<OpenApiOperations["listFundingPayments"], "query">>;
    headers: never;
    body: CallerJsonBody<Int64Input<JsonBody<OpenApiOperations["listFundingPayments"], false>>>;
    input: FlatInput<Int64Input<ParameterAt<OpenApiOperations["listFundingPayments"], "path">>, Int64Input<ParameterAt<OpenApiOperations["listFundingPayments"], "query">>, never, CallerJsonBody<Int64Input<JsonBody<OpenApiOperations["listFundingPayments"], false>>>>;
    response: JsonResponse<OpenApiOperations["listFundingPayments"], 200>;
  };
};
