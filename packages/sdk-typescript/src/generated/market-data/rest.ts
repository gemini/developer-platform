// Generated from rest.yaml#Market Data. Do not edit.

import type { HttpTransport } from "../../transport/http.js";
import type { RestPromise } from "../../transport/rest-promise.js";
import type { RequestOptions } from "../../utils/deadline.js";
import { executeRestOperation } from "../../transport/rest-operation.js";

import {
  MARKET_DATA_OPERATIONS,
  type MarketDataOperationTypes,
} from "./operations.js";

export class MarketDataRest {
  constructor(private readonly transport: HttpTransport) {}

  getAssetsForNetwork(input: MarketDataOperationTypes["getAssetsForNetwork"]["input"], requestOptions?: RequestOptions): RestPromise<MarketDataOperationTypes["getAssetsForNetwork"]["response"]> {
    const operation = MARKET_DATA_OPERATIONS["getAssetsForNetwork"];
    return executeRestOperation<MarketDataOperationTypes["getAssetsForNetwork"]>(this.transport, operation, input, requestOptions);
  }

  getCurrentOrderBook(input: MarketDataOperationTypes["getCurrentOrderBook"]["input"], requestOptions?: RequestOptions): RestPromise<MarketDataOperationTypes["getCurrentOrderBook"]["response"]> {
    const operation = MARKET_DATA_OPERATIONS["getCurrentOrderBook"];
    return executeRestOperation<MarketDataOperationTypes["getCurrentOrderBook"]>(this.transport, operation, input, requestOptions);
  }

  getFXRate(input: MarketDataOperationTypes["getFXRate"]["input"], requestOptions?: RequestOptions): RestPromise<MarketDataOperationTypes["getFXRate"]["response"]> {
    const operation = MARKET_DATA_OPERATIONS["getFXRate"];
    return executeRestOperation<MarketDataOperationTypes["getFXRate"]>(this.transport, operation, input, requestOptions);
  }

  getFundingAmount(input: MarketDataOperationTypes["getFundingAmount"]["input"], requestOptions?: RequestOptions): RestPromise<MarketDataOperationTypes["getFundingAmount"]["response"]> {
    const operation = MARKET_DATA_OPERATIONS["getFundingAmount"];
    return executeRestOperation<MarketDataOperationTypes["getFundingAmount"]>(this.transport, operation, input, requestOptions);
  }

  getFundingAmountReportFile(input: MarketDataOperationTypes["getFundingAmountReportFile"]["input"], requestOptions?: RequestOptions): RestPromise<MarketDataOperationTypes["getFundingAmountReportFile"]["response"]> {
    const operation = MARKET_DATA_OPERATIONS["getFundingAmountReportFile"];
    return executeRestOperation<MarketDataOperationTypes["getFundingAmountReportFile"]>(this.transport, operation, input, requestOptions);
  }

  getNextFundingTimestamp(input: MarketDataOperationTypes["getNextFundingTimestamp"]["input"], requestOptions?: RequestOptions): RestPromise<MarketDataOperationTypes["getNextFundingTimestamp"]["response"]> {
    const operation = MARKET_DATA_OPERATIONS["getNextFundingTimestamp"];
    return executeRestOperation<MarketDataOperationTypes["getNextFundingTimestamp"]>(this.transport, operation, input, requestOptions);
  }

  getSymbolDetails(input: MarketDataOperationTypes["getSymbolDetails"]["input"], requestOptions?: RequestOptions): RestPromise<MarketDataOperationTypes["getSymbolDetails"]["response"]> {
    const operation = MARKET_DATA_OPERATIONS["getSymbolDetails"];
    return executeRestOperation<MarketDataOperationTypes["getSymbolDetails"]>(this.transport, operation, input, requestOptions);
  }

  getTicker(input: MarketDataOperationTypes["getTicker"]["input"], requestOptions?: RequestOptions): RestPromise<MarketDataOperationTypes["getTicker"]["response"]> {
    const operation = MARKET_DATA_OPERATIONS["getTicker"];
    return executeRestOperation<MarketDataOperationTypes["getTicker"]>(this.transport, operation, input, requestOptions);
  }

  getTickerV2(input: MarketDataOperationTypes["getTickerV2"]["input"], requestOptions?: RequestOptions): RestPromise<MarketDataOperationTypes["getTickerV2"]["response"]> {
    const operation = MARKET_DATA_OPERATIONS["getTickerV2"];
    return executeRestOperation<MarketDataOperationTypes["getTickerV2"]>(this.transport, operation, input, requestOptions);
  }

  getTokenNetworkV2(input: MarketDataOperationTypes["getTokenNetworkV2"]["input"], requestOptions?: RequestOptions): RestPromise<MarketDataOperationTypes["getTokenNetworkV2"]["response"]> {
    const operation = MARKET_DATA_OPERATIONS["getTokenNetworkV2"];
    return executeRestOperation<MarketDataOperationTypes["getTokenNetworkV2"]>(this.transport, operation, input, requestOptions);
  }

  listCandles(input: MarketDataOperationTypes["listCandles"]["input"], requestOptions?: RequestOptions): RestPromise<MarketDataOperationTypes["listCandles"]["response"]> {
    const operation = MARKET_DATA_OPERATIONS["listCandles"];
    return executeRestOperation<MarketDataOperationTypes["listCandles"]>(this.transport, operation, input, requestOptions);
  }

  listDerivativeCandles(input: MarketDataOperationTypes["listDerivativeCandles"]["input"], requestOptions?: RequestOptions): RestPromise<MarketDataOperationTypes["listDerivativeCandles"]["response"]> {
    const operation = MARKET_DATA_OPERATIONS["listDerivativeCandles"];
    return executeRestOperation<MarketDataOperationTypes["listDerivativeCandles"]>(this.transport, operation, input, requestOptions);
  }

  listFeePromos(requestOptions?: RequestOptions): RestPromise<MarketDataOperationTypes["listFeePromos"]["response"]> {
    const operation = MARKET_DATA_OPERATIONS["listFeePromos"];
    return executeRestOperation<MarketDataOperationTypes["listFeePromos"]>(this.transport, operation, undefined, requestOptions);
  }

  listPrices(requestOptions?: RequestOptions): RestPromise<MarketDataOperationTypes["listPrices"]["response"]> {
    const operation = MARKET_DATA_OPERATIONS["listPrices"];
    return executeRestOperation<MarketDataOperationTypes["listPrices"]>(this.transport, operation, undefined, requestOptions);
  }

  listSymbols(requestOptions?: RequestOptions): RestPromise<MarketDataOperationTypes["listSymbols"]["response"]> {
    const operation = MARKET_DATA_OPERATIONS["listSymbols"];
    return executeRestOperation<MarketDataOperationTypes["listSymbols"]>(this.transport, operation, undefined, requestOptions);
  }

  listTrades(input: MarketDataOperationTypes["listTrades"]["input"], requestOptions?: RequestOptions): RestPromise<MarketDataOperationTypes["listTrades"]["response"]> {
    const operation = MARKET_DATA_OPERATIONS["listTrades"];
    return executeRestOperation<MarketDataOperationTypes["listTrades"]>(this.transport, operation, input, requestOptions);
  }
}
