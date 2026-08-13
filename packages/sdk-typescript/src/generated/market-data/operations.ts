// Generated from rest.yaml#Market Data. Do not edit.

import type { RestFileResponse } from "../../core/http.js";
import type { operations as OpenApiOperations } from "./models.js";

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

type JsonResponse<O, Status extends PropertyKey> =
  O extends { responses: infer R }
    ? Status extends keyof R
      ? R[Status] extends { content: { "application/json": infer Body } } ? Body : never
      : never
    : never;

export const MARKET_DATA_OPERATIONS = {
  "getAssetsForNetwork": {"responseMode":"json","operation":"marketData.getAssetsForNetwork","method":"get","path":"/v2/networks/{network}/assets","access":"authenticated","parameters":[{"name":"network","in":"path","required":true,"style":"simple","explode":false}],"headers":[],"requestBody":false,"requestBodyRequired":false,"successStatuses":[200],"responseContentTypes":["application/json"],"responseInt64Paths":[],"requestInt64Paths":{"body":[],"path":[],"query":[]},"retryable":true},
  "getCurrentOrderBook": {"responseMode":"json","operation":"marketData.getCurrentOrderBook","method":"get","path":"/v1/book/{symbol}","access":"public","parameters":[{"name":"symbol","in":"path","required":true,"style":"simple","explode":false},{"name":"limit_bids","in":"query","required":false,"style":"form","explode":true,"shape":"scalar","allowReserved":false},{"name":"limit_asks","in":"query","required":false,"style":"form","explode":true,"shape":"scalar","allowReserved":false}],"headers":[],"requestBody":false,"requestBodyRequired":false,"successStatuses":[200],"responseContentTypes":["application/json"],"responseInt64Paths":[],"requestInt64Paths":{"body":[],"path":[],"query":[]},"retryable":true},
  "getFXRate": {"responseMode":"json","operation":"marketData.getFXRate","method":"get","path":"/v2/fxrate/{symbol}/{timestamp}","access":"authenticated","parameters":[{"name":"symbol","in":"path","required":true,"style":"simple","explode":false},{"name":"timestamp","in":"path","required":true,"style":"simple","explode":false}],"headers":[],"requestBody":false,"requestBodyRequired":false,"successStatuses":[200],"responseContentTypes":["application/json"],"responseInt64Paths":[],"requestInt64Paths":{"body":[],"path":[{"path":["timestamp"],"allowString":true}],"query":[]},"retryable":true},
  "getFundingAmount": {"responseMode":"json","operation":"marketData.getFundingAmount","method":"get","path":"/v1/fundingamount/{symbol}","access":"public","parameters":[{"name":"symbol","in":"path","required":true,"style":"simple","explode":false}],"headers":[],"requestBody":false,"requestBodyRequired":false,"successStatuses":[200],"responseContentTypes":["application/json"],"responseInt64Paths":[],"requestInt64Paths":{"body":[],"path":[],"query":[]},"retryable":true},
  "getFundingAmountReportFile": {"responseMode":"file","operation":"marketData.getFundingAmountReportFile","method":"get","path":"/v1/fundingamountreport/records.xlsx","access":"public","parameters":[{"name":"symbol","in":"query","required":true,"style":"form","explode":true,"shape":"scalar","allowReserved":false},{"name":"fromDate","in":"query","required":false,"style":"form","explode":true,"shape":"scalar","allowReserved":false},{"name":"toDate","in":"query","required":false,"style":"form","explode":true,"shape":"scalar","allowReserved":false},{"name":"numRows","in":"query","required":false,"style":"form","explode":true,"shape":"scalar","allowReserved":false}],"headers":[],"requestBody":false,"requestBodyRequired":false,"successStatuses":[200],"responseContentTypes":["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet","text/csv"],"responseInt64Paths":[],"requestInt64Paths":{"body":[],"path":[],"query":[]},"retryable":true},
  "getSymbolDetails": {"responseMode":"json","operation":"marketData.getSymbolDetails","method":"get","path":"/v1/symbols/details/{symbol}","access":"public","parameters":[{"name":"symbol","in":"path","required":true,"style":"simple","explode":false}],"headers":[],"requestBody":false,"requestBodyRequired":false,"successStatuses":[200],"responseContentTypes":["application/json"],"responseInt64Paths":[],"requestInt64Paths":{"body":[],"path":[],"query":[]},"retryable":true},
  "getTicker": {"responseMode":"json","operation":"marketData.getTicker","method":"get","path":"/v1/pubticker/{symbol}","access":"public","parameters":[{"name":"symbol","in":"path","required":true,"style":"simple","explode":false}],"headers":[],"requestBody":false,"requestBodyRequired":false,"successStatuses":[200],"responseContentTypes":["application/json"],"responseInt64Paths":[],"requestInt64Paths":{"body":[],"path":[],"query":[]},"retryable":true},
  "getTickerV2": {"responseMode":"json","operation":"marketData.getTickerV2","method":"get","path":"/v2/ticker/{symbol}","access":"public","parameters":[{"name":"symbol","in":"path","required":true,"style":"simple","explode":false}],"headers":[],"requestBody":false,"requestBodyRequired":false,"successStatuses":[200],"responseContentTypes":["application/json"],"responseInt64Paths":[],"requestInt64Paths":{"body":[],"path":[],"query":[]},"retryable":true},
  "getTokenNetworkV2": {"responseMode":"json","operation":"marketData.getTokenNetworkV2","method":"get","path":"/v2/network/{token}","access":"authenticated","parameters":[{"name":"token","in":"path","required":true,"style":"simple","explode":false}],"headers":[],"requestBody":false,"requestBodyRequired":false,"successStatuses":[200],"responseContentTypes":["application/json"],"responseInt64Paths":[],"requestInt64Paths":{"body":[],"path":[],"query":[]},"retryable":true},
  "listCandles": {"responseMode":"json","operation":"marketData.listCandles","method":"get","path":"/v2/candles/{symbol}/{time_frame}","access":"public","parameters":[{"name":"symbol","in":"path","required":true,"style":"simple","explode":false},{"name":"time_frame","in":"path","required":true,"style":"simple","explode":false}],"headers":[],"requestBody":false,"requestBodyRequired":false,"successStatuses":[200],"responseContentTypes":["application/json"],"responseInt64Paths":[],"requestInt64Paths":{"body":[],"path":[],"query":[]},"retryable":true},
  "listDerivativeCandles": {"responseMode":"json","operation":"marketData.listDerivativeCandles","method":"get","path":"/v2/derivatives/candles/{symbol}/{time_frame}","access":"public","parameters":[{"name":"symbol","in":"path","required":true,"style":"simple","explode":false},{"name":"time_frame","in":"path","required":true,"style":"simple","explode":false}],"headers":[],"requestBody":false,"requestBodyRequired":false,"successStatuses":[200],"responseContentTypes":["application/json"],"responseInt64Paths":[],"requestInt64Paths":{"body":[],"path":[],"query":[]},"retryable":true},
  "listFeePromos": {"responseMode":"json","operation":"marketData.listFeePromos","method":"get","path":"/v1/feepromos","access":"public","parameters":[],"headers":[],"requestBody":false,"requestBodyRequired":false,"successStatuses":[200],"responseContentTypes":["application/json"],"responseInt64Paths":[],"requestInt64Paths":{"body":[],"path":[],"query":[]},"retryable":true},
  "listPrices": {"responseMode":"json","operation":"marketData.listPrices","method":"get","path":"/v1/pricefeed","access":"public","parameters":[],"headers":[],"requestBody":false,"requestBodyRequired":false,"successStatuses":[200],"responseContentTypes":["application/json"],"responseInt64Paths":[],"requestInt64Paths":{"body":[],"path":[],"query":[]},"retryable":true},
  "listSymbols": {"responseMode":"json","operation":"marketData.listSymbols","method":"get","path":"/v1/symbols","access":"public","parameters":[],"headers":[],"requestBody":false,"requestBodyRequired":false,"successStatuses":[200],"responseContentTypes":["application/json"],"responseInt64Paths":[],"requestInt64Paths":{"body":[],"path":[],"query":[]},"retryable":true},
  "listTrades": {"responseMode":"json","operation":"marketData.listTrades","method":"get","path":"/v1/trades/{symbol}","access":"public","parameters":[{"name":"symbol","in":"path","required":true,"style":"simple","explode":false},{"name":"timestamp","in":"query","required":false,"style":"form","explode":true,"shape":"scalar","allowReserved":false},{"name":"since_tid","in":"query","required":false,"style":"form","explode":true,"shape":"scalar","allowReserved":false},{"name":"limit_trades","in":"query","required":false,"style":"form","explode":true,"shape":"scalar","allowReserved":false},{"name":"include_breaks","in":"query","required":false,"style":"form","explode":true,"shape":"scalar","allowReserved":false}],"headers":[],"requestBody":false,"requestBodyRequired":false,"successStatuses":[200],"responseContentTypes":["application/json"],"responseInt64Paths":[["*","tid"]],"requestInt64Paths":{"body":[],"path":[],"query":[{"path":["timestamp"],"allowString":true}]},"retryable":true},
} as const;

export type MarketDataOperationId = keyof typeof MARKET_DATA_OPERATIONS;

export type MarketDataOperationTypes = {
  "getAssetsForNetwork": {
    path: Int64Input<ParameterAt<OpenApiOperations["getAssetsForNetwork"], "path">>;
    query: Int64Input<ParameterAt<OpenApiOperations["getAssetsForNetwork"], "query">>;
    headers: never;
    body: never;
    response: JsonResponse<OpenApiOperations["getAssetsForNetwork"], 200>;
  };
  "getCurrentOrderBook": {
    path: Int64Input<ParameterAt<OpenApiOperations["getCurrentOrderBook"], "path">>;
    query: Int64Input<ParameterAt<OpenApiOperations["getCurrentOrderBook"], "query">>;
    headers: never;
    body: never;
    response: JsonResponse<OpenApiOperations["getCurrentOrderBook"], 200>;
  };
  "getFXRate": {
    path: Int64Input<ParameterAt<OpenApiOperations["getFXRate"], "path">>;
    query: Int64Input<ParameterAt<OpenApiOperations["getFXRate"], "query">>;
    headers: never;
    body: never;
    response: JsonResponse<OpenApiOperations["getFXRate"], 200>;
  };
  "getFundingAmount": {
    path: Int64Input<ParameterAt<OpenApiOperations["getFundingAmount"], "path">>;
    query: Int64Input<ParameterAt<OpenApiOperations["getFundingAmount"], "query">>;
    headers: never;
    body: never;
    response: JsonResponse<OpenApiOperations["getFundingAmount"], 200>;
  };
  "getFundingAmountReportFile": {
    path: Int64Input<ParameterAt<OpenApiOperations["getFundingAmountReportFile"], "path">>;
    query: Int64Input<ParameterAt<OpenApiOperations["getFundingAmountReportFile"], "query">>;
    headers: never;
    body: never;
    response: RestFileResponse;
  };
  "getSymbolDetails": {
    path: Int64Input<ParameterAt<OpenApiOperations["getSymbolDetails"], "path">>;
    query: Int64Input<ParameterAt<OpenApiOperations["getSymbolDetails"], "query">>;
    headers: never;
    body: never;
    response: JsonResponse<OpenApiOperations["getSymbolDetails"], 200>;
  };
  "getTicker": {
    path: Int64Input<ParameterAt<OpenApiOperations["getTicker"], "path">>;
    query: Int64Input<ParameterAt<OpenApiOperations["getTicker"], "query">>;
    headers: never;
    body: never;
    response: JsonResponse<OpenApiOperations["getTicker"], 200>;
  };
  "getTickerV2": {
    path: Int64Input<ParameterAt<OpenApiOperations["getTickerV2"], "path">>;
    query: Int64Input<ParameterAt<OpenApiOperations["getTickerV2"], "query">>;
    headers: never;
    body: never;
    response: JsonResponse<OpenApiOperations["getTickerV2"], 200>;
  };
  "getTokenNetworkV2": {
    path: Int64Input<ParameterAt<OpenApiOperations["getTokenNetworkV2"], "path">>;
    query: Int64Input<ParameterAt<OpenApiOperations["getTokenNetworkV2"], "query">>;
    headers: never;
    body: never;
    response: JsonResponse<OpenApiOperations["getTokenNetworkV2"], 200>;
  };
  "listCandles": {
    path: Int64Input<ParameterAt<OpenApiOperations["listCandles"], "path">>;
    query: Int64Input<ParameterAt<OpenApiOperations["listCandles"], "query">>;
    headers: never;
    body: never;
    response: JsonResponse<OpenApiOperations["listCandles"], 200>;
  };
  "listDerivativeCandles": {
    path: Int64Input<ParameterAt<OpenApiOperations["listDerivativeCandles"], "path">>;
    query: Int64Input<ParameterAt<OpenApiOperations["listDerivativeCandles"], "query">>;
    headers: never;
    body: never;
    response: JsonResponse<OpenApiOperations["listDerivativeCandles"], 200>;
  };
  "listFeePromos": {
    path: Int64Input<ParameterAt<OpenApiOperations["listFeePromos"], "path">>;
    query: Int64Input<ParameterAt<OpenApiOperations["listFeePromos"], "query">>;
    headers: never;
    body: never;
    response: JsonResponse<OpenApiOperations["listFeePromos"], 200>;
  };
  "listPrices": {
    path: Int64Input<ParameterAt<OpenApiOperations["listPrices"], "path">>;
    query: Int64Input<ParameterAt<OpenApiOperations["listPrices"], "query">>;
    headers: never;
    body: never;
    response: JsonResponse<OpenApiOperations["listPrices"], 200>;
  };
  "listSymbols": {
    path: Int64Input<ParameterAt<OpenApiOperations["listSymbols"], "path">>;
    query: Int64Input<ParameterAt<OpenApiOperations["listSymbols"], "query">>;
    headers: never;
    body: never;
    response: JsonResponse<OpenApiOperations["listSymbols"], 200>;
  };
  "listTrades": {
    path: Int64Input<ParameterAt<OpenApiOperations["listTrades"], "path">>;
    query: Int64Input<ParameterAt<OpenApiOperations["listTrades"], "query">>;
    headers: never;
    body: never;
    response: JsonResponse<OpenApiOperations["listTrades"], 200>;
  };
};
