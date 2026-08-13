// Generated from prediction-markets.yaml. Do not edit.

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

type StripTransportFields<T> = T extends object ? Omit<T, "request" | "nonce"> : T;

type CallerJsonBody<T> = StripTransportFields<T>;

type JsonResponse<O, Status extends PropertyKey> =
  O extends { responses: infer R }
    ? Status extends keyof R
      ? R[Status] extends { content: { "application/json": infer Body } } ? Body : never
      : never
    : never;

export const PREDICTION_MARKET_OPERATIONS = {
  "acceptPredictionMarketsTerms": {"responseMode":"json","operation":"predictionMarkets.acceptPredictionMarketsTerms","method":"post","path":"/v1/prediction-markets/terms/accept","access":"authenticated","parameters":[],"headers":[],"requestBody":false,"requestBodyRequired":false,"successStatuses":[200],"responseContentTypes":["application/json"],"responseInt64Paths":[],"requestInt64Paths":{"body":[],"path":[],"query":[]},"retryable":false},
  "cancelOrder": {"responseMode":"json","operation":"predictionMarkets.cancelOrder","method":"post","path":"/v1/prediction-markets/order/cancel","access":"authenticated","parameters":[],"headers":[],"requestBody":true,"requestBodyRequired":true,"successStatuses":[200],"responseContentTypes":["application/json"],"responseInt64Paths":[],"requestInt64Paths":{"body":[{"path":["orderId"]}],"path":[],"query":[]},"retryable":false},
  "cancelOrderBatch": {"responseMode":"json","operation":"predictionMarkets.cancelOrderBatch","method":"post","path":"/v1/prediction-markets/order/batch/cancel","access":"authenticated","parameters":[],"headers":[],"requestBody":true,"requestBodyRequired":true,"successStatuses":[200],"responseContentTypes":["application/json"],"responseInt64Paths":[["results","*","orderId"]],"requestInt64Paths":{"body":[{"path":["orderIds","*"],"allowString":true}],"path":[],"query":[]},"retryable":false},
  "createCombo": {"responseMode":"json","operation":"predictionMarkets.createCombo","method":"post","path":"/v1/prediction-markets/combos","access":"authenticated","parameters":[],"headers":[],"requestBody":true,"requestBodyRequired":true,"successStatuses":[200,201],"responseContentTypes":["application/json"],"responseInt64Paths":[["combo","id"],["combo","instrumentId"],["combo","legs","*","comboId"]],"requestInt64Paths":{"body":[],"path":[],"query":[]},"retryable":false},
  "getActiveOrders": {"responseMode":"json","operation":"predictionMarkets.getActiveOrders","method":"post","path":"/v1/prediction-markets/orders/active","access":"authenticated","parameters":[],"headers":[],"requestBody":true,"requestBodyRequired":false,"successStatuses":[200],"responseContentTypes":["application/json"],"responseInt64Paths":[["orders","*","orderId"]],"requestInt64Paths":{"body":[],"path":[],"query":[]},"retryable":false},
  "getCategories": {"responseMode":"json","operation":"predictionMarkets.getCategories","method":"get","path":"/v1/prediction-markets/categories","access":"public","parameters":[{"name":"status","in":"query","required":false,"style":"form","explode":true,"shape":"array","allowReserved":false}],"headers":[],"requestBody":false,"requestBodyRequired":false,"successStatuses":[200],"responseContentTypes":["application/json"],"responseInt64Paths":[],"requestInt64Paths":{"body":[],"path":[],"query":[]},"retryable":true},
  "getComboByInstrumentSymbol": {"responseMode":"json","operation":"predictionMarkets.getComboByInstrumentSymbol","method":"get","path":"/v1/prediction-markets/combos/{instrumentSymbol}","access":"public","parameters":[{"name":"instrumentSymbol","in":"path","required":true,"style":"simple","explode":false}],"headers":[],"requestBody":false,"requestBodyRequired":false,"successStatuses":[200],"responseContentTypes":["application/json"],"responseInt64Paths":[["legs","*","comboId"]],"requestInt64Paths":{"body":[],"path":[],"query":[]},"retryable":true},
  "getEvent": {"responseMode":"json","operation":"predictionMarkets.getEvent","method":"get","path":"/v1/prediction-markets/events/{eventTicker}","access":"public","parameters":[{"name":"eventTicker","in":"path","required":true,"style":"simple","explode":false}],"headers":[],"requestBody":false,"requestBodyRequired":false,"successStatuses":[200],"responseContentTypes":["application/json"],"responseInt64Paths":[],"requestInt64Paths":{"body":[],"path":[],"query":[]},"retryable":true},
  "getEventStrike": {"responseMode":"json","operation":"predictionMarkets.getEventStrike","method":"get","path":"/v1/prediction-markets/events/{eventTicker}/strike","access":"public","parameters":[{"name":"eventTicker","in":"path","required":true,"style":"simple","explode":false}],"headers":[],"requestBody":false,"requestBodyRequired":false,"successStatuses":[200],"responseContentTypes":["application/json"],"responseInt64Paths":[],"requestInt64Paths":{"body":[],"path":[],"query":[]},"retryable":true},
  "getLiquidityRewardsConfig": {"responseMode":"json","operation":"predictionMarkets.getLiquidityRewardsConfig","method":"get","path":"/v1/prediction-markets/liquidity-rewards/config","access":"public","parameters":[],"headers":[],"requestBody":false,"requestBodyRequired":false,"successStatuses":[200],"responseContentTypes":["application/json"],"responseInt64Paths":[],"requestInt64Paths":{"body":[],"path":[],"query":[]},"retryable":true},
  "getLiquidityRewardsDailySummary": {"responseMode":"json","operation":"predictionMarkets.getLiquidityRewardsDailySummary","method":"get","path":"/v1/prediction-markets/liquidity-rewards/summary/daily","access":"authenticated","parameters":[{"name":"dateFrom","in":"query","required":true,"style":"form","explode":true,"shape":"scalar","allowReserved":false},{"name":"dateTo","in":"query","required":true,"style":"form","explode":true,"shape":"scalar","allowReserved":false}],"headers":[],"requestBody":false,"requestBodyRequired":false,"successStatuses":[200],"responseContentTypes":["application/json"],"responseInt64Paths":[["daily_summaries","*","events","*","event_id"]],"requestInt64Paths":{"body":[],"path":[],"query":[]},"retryable":true},
  "getLiquidityRewardsLifetimeSummary": {"responseMode":"json","operation":"predictionMarkets.getLiquidityRewardsLifetimeSummary","method":"get","path":"/v1/prediction-markets/liquidity-rewards/summary/total","access":"authenticated","parameters":[{"name":"dateFrom","in":"query","required":false,"style":"form","explode":true,"shape":"scalar","allowReserved":false},{"name":"dateTo","in":"query","required":false,"style":"form","explode":true,"shape":"scalar","allowReserved":false}],"headers":[],"requestBody":false,"requestBodyRequired":false,"successStatuses":[200],"responseContentTypes":["application/json"],"responseInt64Paths":[],"requestInt64Paths":{"body":[],"path":[],"query":[]},"retryable":true},
  "getMakerRebateLifetimeSummary": {"responseMode":"json","operation":"predictionMarkets.getMakerRebateLifetimeSummary","method":"get","path":"/v1/prediction-markets/maker-rebate/summary/total","access":"authenticated","parameters":[{"name":"dateFrom","in":"query","required":false,"style":"form","explode":true,"shape":"scalar","allowReserved":false},{"name":"dateTo","in":"query","required":false,"style":"form","explode":true,"shape":"scalar","allowReserved":false}],"headers":[],"requestBody":false,"requestBodyRequired":false,"successStatuses":[200],"responseContentTypes":["application/json"],"responseInt64Paths":[["total_fill_count"]],"requestInt64Paths":{"body":[],"path":[],"query":[]},"retryable":true},
  "getMakerRebateRates": {"responseMode":"json","operation":"predictionMarkets.getMakerRebateRates","method":"get","path":"/v1/prediction-markets/maker-rebate/rates","access":"public","parameters":[{"name":"category","in":"query","required":false,"style":"form","explode":true,"shape":"scalar","allowReserved":false}],"headers":[],"requestBody":false,"requestBodyRequired":false,"successStatuses":[200],"responseContentTypes":["application/json"],"responseInt64Paths":[["rate_rules","*","id"]],"requestInt64Paths":{"body":[],"path":[],"query":[]},"retryable":true},
  "getOrderHistory": {"responseMode":"json","operation":"predictionMarkets.getOrderHistory","method":"post","path":"/v1/prediction-markets/orders/history","access":"authenticated","parameters":[],"headers":[],"requestBody":true,"requestBodyRequired":false,"successStatuses":[200],"responseContentTypes":["application/json"],"responseInt64Paths":[["orders","*","orderId"]],"requestInt64Paths":{"body":[{"path":["from"]},{"path":["to"]}],"path":[],"query":[]},"retryable":false},
  "getPositions": {"responseMode":"json","operation":"predictionMarkets.getPositions","method":"post","path":"/v1/prediction-markets/positions","access":"authenticated","parameters":[{"name":"eventTicker","in":"query","required":false,"style":"form","explode":true,"shape":"scalar","allowReserved":false},{"name":"limit","in":"query","required":false,"style":"form","explode":true,"shape":"scalar","allowReserved":false},{"name":"offset","in":"query","required":false,"style":"form","explode":true,"shape":"scalar","allowReserved":false},{"name":"sort","in":"query","required":false,"style":"form","explode":true,"shape":"scalar","allowReserved":false}],"headers":[],"requestBody":false,"requestBodyRequired":false,"successStatuses":[200],"responseContentTypes":["application/json"],"responseInt64Paths":[["positions","*","instrumentId"]],"requestInt64Paths":{"body":[],"path":[],"query":[]},"retryable":false},
  "getPredictionMarketDailyVolume": {"responseMode":"json","operation":"predictionMarkets.getPredictionMarketDailyVolume","method":"get","path":"/v1/prediction-markets/volume/{date}","access":"public","parameters":[{"name":"date","in":"path","required":true,"style":"simple","explode":false}],"headers":[],"requestBody":false,"requestBodyRequired":false,"successStatuses":[200],"responseContentTypes":["application/json"],"responseInt64Paths":[],"requestInt64Paths":{"body":[],"path":[],"query":[]},"retryable":true},
  "getPredictionMarketHourlyVolume": {"responseMode":"json","operation":"predictionMarkets.getPredictionMarketHourlyVolume","method":"get","path":"/v1/prediction-markets/volume/{date}/hourly","access":"public","parameters":[{"name":"date","in":"path","required":true,"style":"simple","explode":false}],"headers":[],"requestBody":false,"requestBodyRequired":false,"successStatuses":[200],"responseContentTypes":["application/json"],"responseInt64Paths":[],"requestInt64Paths":{"body":[],"path":[],"query":[]},"retryable":true},
  "getPredictionMarketsTerms": {"responseMode":"json","operation":"predictionMarkets.getPredictionMarketsTerms","method":"get","path":"/v1/prediction-markets/terms","access":"public","parameters":[],"headers":[],"requestBody":false,"requestBodyRequired":false,"successStatuses":[200],"responseContentTypes":["application/json"],"responseInt64Paths":[],"requestInt64Paths":{"body":[],"path":[],"query":[]},"retryable":true},
  "getPredictionMarketsTermsStatus": {"responseMode":"json","operation":"predictionMarkets.getPredictionMarketsTermsStatus","method":"get","path":"/v1/prediction-markets/terms/status","access":"authenticated","parameters":[],"headers":[],"requestBody":false,"requestBodyRequired":false,"successStatuses":[200],"responseContentTypes":["application/json"],"responseInt64Paths":[],"requestInt64Paths":{"body":[],"path":[],"query":[]},"retryable":true},
  "getSettledPositions": {"responseMode":"json","operation":"predictionMarkets.getSettledPositions","method":"post","path":"/v1/prediction-markets/positions/settled","access":"authenticated","parameters":[{"name":"eventTicker","in":"query","required":false,"style":"form","explode":true,"shape":"scalar","allowReserved":false},{"name":"limit","in":"query","required":false,"style":"form","explode":true,"shape":"scalar","allowReserved":false},{"name":"offset","in":"query","required":false,"style":"form","explode":true,"shape":"scalar","allowReserved":false},{"name":"sort","in":"query","required":false,"style":"form","explode":true,"shape":"scalar","allowReserved":false},{"name":"search","in":"query","required":false,"style":"form","explode":true,"shape":"scalar","allowReserved":false},{"name":"category","in":"query","required":false,"style":"form","explode":true,"shape":"scalar","allowReserved":false},{"name":"withCashOuts","in":"query","required":false,"style":"form","explode":true,"shape":"scalar","allowReserved":false}],"headers":[],"requestBody":false,"requestBodyRequired":false,"successStatuses":[200],"responseContentTypes":["application/json"],"responseInt64Paths":[["cashOuts","*","accountId"],["cashOuts","*","instrumentId"],["positions","*","accountId"],["positions","*","instrumentId"]],"requestInt64Paths":{"body":[],"path":[],"query":[]},"retryable":false},
  "getVolumeMetrics": {"responseMode":"json","operation":"predictionMarkets.getVolumeMetrics","method":"post","path":"/v1/prediction-markets/metrics/volume","access":"authenticated","parameters":[],"headers":[],"requestBody":true,"requestBodyRequired":true,"successStatuses":[200],"responseContentTypes":["application/json"],"responseInt64Paths":[],"requestInt64Paths":{"body":[{"path":["endTime"]},{"path":["startTime"]}],"path":[],"query":[]},"retryable":false},
  "listCombos": {"responseMode":"json","operation":"predictionMarkets.listCombos","method":"get","path":"/v1/prediction-markets/combos","access":"public","parameters":[{"name":"status","in":"query","required":false,"style":"form","explode":true,"shape":"scalar","allowReserved":false},{"name":"contractId","in":"query","required":false,"style":"form","explode":true,"shape":"scalar","allowReserved":false},{"name":"instrumentRegistered","in":"query","required":false,"style":"form","explode":true,"shape":"scalar","allowReserved":false},{"name":"limit","in":"query","required":false,"style":"form","explode":true,"shape":"scalar","allowReserved":false},{"name":"offset","in":"query","required":false,"style":"form","explode":true,"shape":"scalar","allowReserved":false}],"headers":[],"requestBody":false,"requestBodyRequired":false,"successStatuses":[200],"responseContentTypes":["application/json"],"responseInt64Paths":[["combos","*","legs","*","comboId"]],"requestInt64Paths":{"body":[],"path":[],"query":[{"path":["contractId"]}]},"retryable":true},
  "listEvents": {"responseMode":"json","operation":"predictionMarkets.listEvents","method":"get","path":"/v1/prediction-markets/events","access":"public","parameters":[{"name":"status","in":"query","required":false,"style":"form","explode":true,"shape":"array","allowReserved":false},{"name":"category","in":"query","required":false,"style":"form","explode":true,"shape":"array","allowReserved":false},{"name":"sport","in":"query","required":false,"style":"form","explode":true,"shape":"array","allowReserved":false},{"name":"sports_market_type","in":"query","required":false,"style":"form","explode":true,"shape":"array","allowReserved":false},{"name":"sports_market_subject","in":"query","required":false,"style":"form","explode":true,"shape":"array","allowReserved":false},{"name":"sports_market_scope","in":"query","required":false,"style":"form","explode":true,"shape":"array","allowReserved":false},{"name":"sports_market_metric","in":"query","required":false,"style":"form","explode":true,"shape":"array","allowReserved":false},{"name":"search","in":"query","required":false,"style":"form","explode":true,"shape":"scalar","allowReserved":false},{"name":"limit","in":"query","required":false,"style":"form","explode":true,"shape":"scalar","allowReserved":false},{"name":"offset","in":"query","required":false,"style":"form","explode":true,"shape":"scalar","allowReserved":false}],"headers":[],"requestBody":false,"requestBodyRequired":false,"successStatuses":[200],"responseContentTypes":["application/json"],"responseInt64Paths":[],"requestInt64Paths":{"body":[],"path":[],"query":[]},"retryable":true},
  "listLiquidityRewardsEvents": {"responseMode":"json","operation":"predictionMarkets.listLiquidityRewardsEvents","method":"get","path":"/v1/prediction-markets/liquidity-rewards/events","access":"public","parameters":[{"name":"category","in":"query","required":false,"style":"form","explode":true,"shape":"scalar","allowReserved":false},{"name":"search","in":"query","required":false,"style":"form","explode":true,"shape":"scalar","allowReserved":false},{"name":"sort","in":"query","required":false,"style":"form","explode":true,"shape":"scalar","allowReserved":false},{"name":"limit","in":"query","required":false,"style":"form","explode":true,"shape":"scalar","allowReserved":false},{"name":"offset","in":"query","required":false,"style":"form","explode":true,"shape":"scalar","allowReserved":false}],"headers":[],"requestBody":false,"requestBodyRequired":false,"successStatuses":[200],"responseContentTypes":["application/json"],"responseInt64Paths":[],"requestInt64Paths":{"body":[],"path":[],"query":[]},"retryable":true},
  "listMakerRebatePayouts": {"responseMode":"json","operation":"predictionMarkets.listMakerRebatePayouts","method":"post","path":"/v1/prediction-markets/maker-rebate/payouts","access":"authenticated","parameters":[{"name":"limit","in":"query","required":false,"style":"form","explode":true,"shape":"scalar","allowReserved":false},{"name":"offset","in":"query","required":false,"style":"form","explode":true,"shape":"scalar","allowReserved":false}],"headers":[],"requestBody":false,"requestBodyRequired":false,"successStatuses":[200],"responseContentTypes":["application/json"],"responseInt64Paths":[["payouts","*","id"]],"requestInt64Paths":{"body":[],"path":[],"query":[]},"retryable":false},
  "listNewlyListedEvents": {"responseMode":"json","operation":"predictionMarkets.listNewlyListedEvents","method":"get","path":"/v1/prediction-markets/events/newly-listed","access":"public","parameters":[{"name":"category","in":"query","required":false,"style":"form","explode":true,"shape":"array","allowReserved":false},{"name":"sport","in":"query","required":false,"style":"form","explode":true,"shape":"array","allowReserved":false},{"name":"sports_market_type","in":"query","required":false,"style":"form","explode":true,"shape":"array","allowReserved":false},{"name":"sports_market_subject","in":"query","required":false,"style":"form","explode":true,"shape":"array","allowReserved":false},{"name":"sports_market_scope","in":"query","required":false,"style":"form","explode":true,"shape":"array","allowReserved":false},{"name":"sports_market_metric","in":"query","required":false,"style":"form","explode":true,"shape":"array","allowReserved":false},{"name":"limit","in":"query","required":false,"style":"form","explode":true,"shape":"scalar","allowReserved":false},{"name":"offset","in":"query","required":false,"style":"form","explode":true,"shape":"scalar","allowReserved":false}],"headers":[],"requestBody":false,"requestBodyRequired":false,"successStatuses":[200],"responseContentTypes":["application/json"],"responseInt64Paths":[],"requestInt64Paths":{"body":[],"path":[],"query":[]},"retryable":true},
  "listRecentlySettledEvents": {"responseMode":"json","operation":"predictionMarkets.listRecentlySettledEvents","method":"get","path":"/v1/prediction-markets/events/recently-settled","access":"public","parameters":[{"name":"category","in":"query","required":false,"style":"form","explode":true,"shape":"array","allowReserved":false},{"name":"sport","in":"query","required":false,"style":"form","explode":true,"shape":"array","allowReserved":false},{"name":"sports_market_type","in":"query","required":false,"style":"form","explode":true,"shape":"array","allowReserved":false},{"name":"sports_market_subject","in":"query","required":false,"style":"form","explode":true,"shape":"array","allowReserved":false},{"name":"sports_market_scope","in":"query","required":false,"style":"form","explode":true,"shape":"array","allowReserved":false},{"name":"sports_market_metric","in":"query","required":false,"style":"form","explode":true,"shape":"array","allowReserved":false},{"name":"limit","in":"query","required":false,"style":"form","explode":true,"shape":"scalar","allowReserved":false},{"name":"offset","in":"query","required":false,"style":"form","explode":true,"shape":"scalar","allowReserved":false}],"headers":[],"requestBody":false,"requestBodyRequired":false,"successStatuses":[200],"responseContentTypes":["application/json"],"responseInt64Paths":[],"requestInt64Paths":{"body":[],"path":[],"query":[]},"retryable":true},
  "listUpcomingEvents": {"responseMode":"json","operation":"predictionMarkets.listUpcomingEvents","method":"get","path":"/v1/prediction-markets/events/upcoming","access":"public","parameters":[{"name":"category","in":"query","required":false,"style":"form","explode":true,"shape":"array","allowReserved":false},{"name":"sport","in":"query","required":false,"style":"form","explode":true,"shape":"array","allowReserved":false},{"name":"sports_market_type","in":"query","required":false,"style":"form","explode":true,"shape":"array","allowReserved":false},{"name":"sports_market_subject","in":"query","required":false,"style":"form","explode":true,"shape":"array","allowReserved":false},{"name":"sports_market_scope","in":"query","required":false,"style":"form","explode":true,"shape":"array","allowReserved":false},{"name":"sports_market_metric","in":"query","required":false,"style":"form","explode":true,"shape":"array","allowReserved":false},{"name":"limit","in":"query","required":false,"style":"form","explode":true,"shape":"scalar","allowReserved":false},{"name":"offset","in":"query","required":false,"style":"form","explode":true,"shape":"scalar","allowReserved":false}],"headers":[],"requestBody":false,"requestBodyRequired":false,"successStatuses":[200],"responseContentTypes":["application/json"],"responseInt64Paths":[],"requestInt64Paths":{"body":[],"path":[],"query":[]},"retryable":true},
  "placeOrder": {"responseMode":"json","operation":"predictionMarkets.placeOrder","method":"post","path":"/v1/prediction-markets/order","access":"authenticated","parameters":[],"headers":[],"requestBody":true,"requestBodyRequired":true,"successStatuses":[201],"responseContentTypes":["application/json"],"responseInt64Paths":[["orderId"]],"requestInt64Paths":{"body":[],"path":[],"query":[]},"retryable":false},
  "placeOrderBatch": {"responseMode":"json","operation":"predictionMarkets.placeOrderBatch","method":"post","path":"/v1/prediction-markets/order/batch","access":"authenticated","parameters":[],"headers":[],"requestBody":true,"requestBodyRequired":true,"successStatuses":[200],"responseContentTypes":["application/json"],"responseInt64Paths":[["results","*","order","orderId"]],"requestInt64Paths":{"body":[],"path":[],"query":[]},"retryable":false},
} as const;

export type PredictionMarketOperationId = keyof typeof PREDICTION_MARKET_OPERATIONS;

export type PredictionMarketOperationTypes = {
  "acceptPredictionMarketsTerms": {
    path: Int64Input<ParameterAt<OpenApiOperations["acceptPredictionMarketsTerms"], "path">>;
    query: Int64Input<ParameterAt<OpenApiOperations["acceptPredictionMarketsTerms"], "query">>;
    headers: never;
    body: never;
    response: JsonResponse<OpenApiOperations["acceptPredictionMarketsTerms"], 200>;
  };
  "cancelOrder": {
    path: Int64Input<ParameterAt<OpenApiOperations["cancelOrder"], "path">>;
    query: Int64Input<ParameterAt<OpenApiOperations["cancelOrder"], "query">>;
    headers: never;
    body: CallerJsonBody<Int64Input<JsonBody<OpenApiOperations["cancelOrder"], true>>>;
    response: JsonResponse<OpenApiOperations["cancelOrder"], 200>;
  };
  "cancelOrderBatch": {
    path: Int64Input<ParameterAt<OpenApiOperations["cancelOrderBatch"], "path">>;
    query: Int64Input<ParameterAt<OpenApiOperations["cancelOrderBatch"], "query">>;
    headers: never;
    body: CallerJsonBody<Int64Input<JsonBody<OpenApiOperations["cancelOrderBatch"], true>>>;
    response: JsonResponse<OpenApiOperations["cancelOrderBatch"], 200>;
  };
  "createCombo": {
    path: Int64Input<ParameterAt<OpenApiOperations["createCombo"], "path">>;
    query: Int64Input<ParameterAt<OpenApiOperations["createCombo"], "query">>;
    headers: never;
    body: CallerJsonBody<Int64Input<JsonBody<OpenApiOperations["createCombo"], true>>>;
    response: JsonResponse<OpenApiOperations["createCombo"], 200 | 201>;
  };
  "getActiveOrders": {
    path: Int64Input<ParameterAt<OpenApiOperations["getActiveOrders"], "path">>;
    query: Int64Input<ParameterAt<OpenApiOperations["getActiveOrders"], "query">>;
    headers: never;
    body: CallerJsonBody<Int64Input<JsonBody<OpenApiOperations["getActiveOrders"], false>>>;
    response: JsonResponse<OpenApiOperations["getActiveOrders"], 200>;
  };
  "getCategories": {
    path: Int64Input<ParameterAt<OpenApiOperations["getCategories"], "path">>;
    query: Int64Input<ParameterAt<OpenApiOperations["getCategories"], "query">>;
    headers: never;
    body: never;
    response: JsonResponse<OpenApiOperations["getCategories"], 200>;
  };
  "getComboByInstrumentSymbol": {
    path: Int64Input<ParameterAt<OpenApiOperations["getComboByInstrumentSymbol"], "path">>;
    query: Int64Input<ParameterAt<OpenApiOperations["getComboByInstrumentSymbol"], "query">>;
    headers: never;
    body: never;
    response: JsonResponse<OpenApiOperations["getComboByInstrumentSymbol"], 200>;
  };
  "getEvent": {
    path: Int64Input<ParameterAt<OpenApiOperations["getEvent"], "path">>;
    query: Int64Input<ParameterAt<OpenApiOperations["getEvent"], "query">>;
    headers: never;
    body: never;
    response: JsonResponse<OpenApiOperations["getEvent"], 200>;
  };
  "getEventStrike": {
    path: Int64Input<ParameterAt<OpenApiOperations["getEventStrike"], "path">>;
    query: Int64Input<ParameterAt<OpenApiOperations["getEventStrike"], "query">>;
    headers: never;
    body: never;
    response: JsonResponse<OpenApiOperations["getEventStrike"], 200>;
  };
  "getLiquidityRewardsConfig": {
    path: Int64Input<ParameterAt<OpenApiOperations["getLiquidityRewardsConfig"], "path">>;
    query: Int64Input<ParameterAt<OpenApiOperations["getLiquidityRewardsConfig"], "query">>;
    headers: never;
    body: never;
    response: JsonResponse<OpenApiOperations["getLiquidityRewardsConfig"], 200>;
  };
  "getLiquidityRewardsDailySummary": {
    path: Int64Input<ParameterAt<OpenApiOperations["getLiquidityRewardsDailySummary"], "path">>;
    query: Int64Input<ParameterAt<OpenApiOperations["getLiquidityRewardsDailySummary"], "query">>;
    headers: never;
    body: never;
    response: JsonResponse<OpenApiOperations["getLiquidityRewardsDailySummary"], 200>;
  };
  "getLiquidityRewardsLifetimeSummary": {
    path: Int64Input<ParameterAt<OpenApiOperations["getLiquidityRewardsLifetimeSummary"], "path">>;
    query: Int64Input<ParameterAt<OpenApiOperations["getLiquidityRewardsLifetimeSummary"], "query">>;
    headers: never;
    body: never;
    response: JsonResponse<OpenApiOperations["getLiquidityRewardsLifetimeSummary"], 200>;
  };
  "getMakerRebateLifetimeSummary": {
    path: Int64Input<ParameterAt<OpenApiOperations["getMakerRebateLifetimeSummary"], "path">>;
    query: Int64Input<ParameterAt<OpenApiOperations["getMakerRebateLifetimeSummary"], "query">>;
    headers: never;
    body: never;
    response: JsonResponse<OpenApiOperations["getMakerRebateLifetimeSummary"], 200>;
  };
  "getMakerRebateRates": {
    path: Int64Input<ParameterAt<OpenApiOperations["getMakerRebateRates"], "path">>;
    query: Int64Input<ParameterAt<OpenApiOperations["getMakerRebateRates"], "query">>;
    headers: never;
    body: never;
    response: JsonResponse<OpenApiOperations["getMakerRebateRates"], 200>;
  };
  "getOrderHistory": {
    path: Int64Input<ParameterAt<OpenApiOperations["getOrderHistory"], "path">>;
    query: Int64Input<ParameterAt<OpenApiOperations["getOrderHistory"], "query">>;
    headers: never;
    body: CallerJsonBody<Int64Input<JsonBody<OpenApiOperations["getOrderHistory"], false>>>;
    response: JsonResponse<OpenApiOperations["getOrderHistory"], 200>;
  };
  "getPositions": {
    path: Int64Input<ParameterAt<OpenApiOperations["getPositions"], "path">>;
    query: Int64Input<ParameterAt<OpenApiOperations["getPositions"], "query">>;
    headers: never;
    body: never;
    response: JsonResponse<OpenApiOperations["getPositions"], 200>;
  };
  "getPredictionMarketDailyVolume": {
    path: Int64Input<ParameterAt<OpenApiOperations["getPredictionMarketDailyVolume"], "path">>;
    query: Int64Input<ParameterAt<OpenApiOperations["getPredictionMarketDailyVolume"], "query">>;
    headers: never;
    body: never;
    response: JsonResponse<OpenApiOperations["getPredictionMarketDailyVolume"], 200>;
  };
  "getPredictionMarketHourlyVolume": {
    path: Int64Input<ParameterAt<OpenApiOperations["getPredictionMarketHourlyVolume"], "path">>;
    query: Int64Input<ParameterAt<OpenApiOperations["getPredictionMarketHourlyVolume"], "query">>;
    headers: never;
    body: never;
    response: JsonResponse<OpenApiOperations["getPredictionMarketHourlyVolume"], 200>;
  };
  "getPredictionMarketsTerms": {
    path: Int64Input<ParameterAt<OpenApiOperations["getPredictionMarketsTerms"], "path">>;
    query: Int64Input<ParameterAt<OpenApiOperations["getPredictionMarketsTerms"], "query">>;
    headers: never;
    body: never;
    response: JsonResponse<OpenApiOperations["getPredictionMarketsTerms"], 200>;
  };
  "getPredictionMarketsTermsStatus": {
    path: Int64Input<ParameterAt<OpenApiOperations["getPredictionMarketsTermsStatus"], "path">>;
    query: Int64Input<ParameterAt<OpenApiOperations["getPredictionMarketsTermsStatus"], "query">>;
    headers: never;
    body: never;
    response: JsonResponse<OpenApiOperations["getPredictionMarketsTermsStatus"], 200>;
  };
  "getSettledPositions": {
    path: Int64Input<ParameterAt<OpenApiOperations["getSettledPositions"], "path">>;
    query: Int64Input<ParameterAt<OpenApiOperations["getSettledPositions"], "query">>;
    headers: never;
    body: never;
    response: JsonResponse<OpenApiOperations["getSettledPositions"], 200>;
  };
  "getVolumeMetrics": {
    path: Int64Input<ParameterAt<OpenApiOperations["getVolumeMetrics"], "path">>;
    query: Int64Input<ParameterAt<OpenApiOperations["getVolumeMetrics"], "query">>;
    headers: never;
    body: CallerJsonBody<Int64Input<JsonBody<OpenApiOperations["getVolumeMetrics"], true>>>;
    response: JsonResponse<OpenApiOperations["getVolumeMetrics"], 200>;
  };
  "listCombos": {
    path: Int64Input<ParameterAt<OpenApiOperations["listCombos"], "path">>;
    query: Int64Input<ParameterAt<OpenApiOperations["listCombos"], "query">>;
    headers: never;
    body: never;
    response: JsonResponse<OpenApiOperations["listCombos"], 200>;
  };
  "listEvents": {
    path: Int64Input<ParameterAt<OpenApiOperations["listEvents"], "path">>;
    query: Int64Input<ParameterAt<OpenApiOperations["listEvents"], "query">>;
    headers: never;
    body: never;
    response: JsonResponse<OpenApiOperations["listEvents"], 200>;
  };
  "listLiquidityRewardsEvents": {
    path: Int64Input<ParameterAt<OpenApiOperations["listLiquidityRewardsEvents"], "path">>;
    query: Int64Input<ParameterAt<OpenApiOperations["listLiquidityRewardsEvents"], "query">>;
    headers: never;
    body: never;
    response: JsonResponse<OpenApiOperations["listLiquidityRewardsEvents"], 200>;
  };
  "listMakerRebatePayouts": {
    path: Int64Input<ParameterAt<OpenApiOperations["listMakerRebatePayouts"], "path">>;
    query: Int64Input<ParameterAt<OpenApiOperations["listMakerRebatePayouts"], "query">>;
    headers: never;
    body: never;
    response: JsonResponse<OpenApiOperations["listMakerRebatePayouts"], 200>;
  };
  "listNewlyListedEvents": {
    path: Int64Input<ParameterAt<OpenApiOperations["listNewlyListedEvents"], "path">>;
    query: Int64Input<ParameterAt<OpenApiOperations["listNewlyListedEvents"], "query">>;
    headers: never;
    body: never;
    response: JsonResponse<OpenApiOperations["listNewlyListedEvents"], 200>;
  };
  "listRecentlySettledEvents": {
    path: Int64Input<ParameterAt<OpenApiOperations["listRecentlySettledEvents"], "path">>;
    query: Int64Input<ParameterAt<OpenApiOperations["listRecentlySettledEvents"], "query">>;
    headers: never;
    body: never;
    response: JsonResponse<OpenApiOperations["listRecentlySettledEvents"], 200>;
  };
  "listUpcomingEvents": {
    path: Int64Input<ParameterAt<OpenApiOperations["listUpcomingEvents"], "path">>;
    query: Int64Input<ParameterAt<OpenApiOperations["listUpcomingEvents"], "query">>;
    headers: never;
    body: never;
    response: JsonResponse<OpenApiOperations["listUpcomingEvents"], 200>;
  };
  "placeOrder": {
    path: Int64Input<ParameterAt<OpenApiOperations["placeOrder"], "path">>;
    query: Int64Input<ParameterAt<OpenApiOperations["placeOrder"], "query">>;
    headers: never;
    body: CallerJsonBody<Int64Input<JsonBody<OpenApiOperations["placeOrder"], true>>>;
    response: JsonResponse<OpenApiOperations["placeOrder"], 201>;
  };
  "placeOrderBatch": {
    path: Int64Input<ParameterAt<OpenApiOperations["placeOrderBatch"], "path">>;
    query: Int64Input<ParameterAt<OpenApiOperations["placeOrderBatch"], "query">>;
    headers: never;
    body: CallerJsonBody<Int64Input<JsonBody<OpenApiOperations["placeOrderBatch"], true>>>;
    response: JsonResponse<OpenApiOperations["placeOrderBatch"], 200>;
  };
};
