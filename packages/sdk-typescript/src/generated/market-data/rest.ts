// Generated from rest.yaml#Market Data. Do not edit.

import type { HttpTransport } from "../../core/http.js";
import type { RequestOptions } from "../../core/deadline.js";
import { executeRestOperation } from "../../core/rest-operation.js";

import {
  MARKET_DATA_OPERATIONS,
  type MarketDataOperationTypes,
} from "./operations.js";

export class MarketDataRest {
  constructor(private readonly transport: HttpTransport) {}

  getAssetsForNetwork(path: MarketDataOperationTypes["getAssetsForNetwork"]["path"], requestOptions?: RequestOptions): Promise<MarketDataOperationTypes["getAssetsForNetwork"]["response"]>;
  getAssetsForNetwork(path: MarketDataOperationTypes["getAssetsForNetwork"]["path"]): Promise<MarketDataOperationTypes["getAssetsForNetwork"]["response"]>;
  getAssetsForNetwork(path: MarketDataOperationTypes["getAssetsForNetwork"]["path"], requestOptions?: RequestOptions): Promise<MarketDataOperationTypes["getAssetsForNetwork"]["response"]> {
    const operation = MARKET_DATA_OPERATIONS["getAssetsForNetwork"];
    return executeRestOperation<MarketDataOperationTypes["getAssetsForNetwork"]>(this.transport, operation, {
      path,
    }, requestOptions);
  }

  getCurrentOrderBook(path: MarketDataOperationTypes["getCurrentOrderBook"]["path"], query?: MarketDataOperationTypes["getCurrentOrderBook"]["query"], requestOptions?: RequestOptions): Promise<MarketDataOperationTypes["getCurrentOrderBook"]["response"]>;
  getCurrentOrderBook(path: MarketDataOperationTypes["getCurrentOrderBook"]["path"], query?: MarketDataOperationTypes["getCurrentOrderBook"]["query"]): Promise<MarketDataOperationTypes["getCurrentOrderBook"]["response"]>;
  getCurrentOrderBook(path: MarketDataOperationTypes["getCurrentOrderBook"]["path"], query?: MarketDataOperationTypes["getCurrentOrderBook"]["query"], requestOptions?: RequestOptions): Promise<MarketDataOperationTypes["getCurrentOrderBook"]["response"]> {
    const operation = MARKET_DATA_OPERATIONS["getCurrentOrderBook"];
    return executeRestOperation<MarketDataOperationTypes["getCurrentOrderBook"]>(this.transport, operation, {
      path,
      query,
    }, requestOptions);
  }

  getFXRate(path: MarketDataOperationTypes["getFXRate"]["path"], requestOptions?: RequestOptions): Promise<MarketDataOperationTypes["getFXRate"]["response"]>;
  getFXRate(path: MarketDataOperationTypes["getFXRate"]["path"]): Promise<MarketDataOperationTypes["getFXRate"]["response"]>;
  getFXRate(path: MarketDataOperationTypes["getFXRate"]["path"], requestOptions?: RequestOptions): Promise<MarketDataOperationTypes["getFXRate"]["response"]> {
    const operation = MARKET_DATA_OPERATIONS["getFXRate"];
    return executeRestOperation<MarketDataOperationTypes["getFXRate"]>(this.transport, operation, {
      path,
    }, requestOptions);
  }

  getFundingAmount(path: MarketDataOperationTypes["getFundingAmount"]["path"], requestOptions?: RequestOptions): Promise<MarketDataOperationTypes["getFundingAmount"]["response"]>;
  getFundingAmount(path: MarketDataOperationTypes["getFundingAmount"]["path"]): Promise<MarketDataOperationTypes["getFundingAmount"]["response"]>;
  getFundingAmount(path: MarketDataOperationTypes["getFundingAmount"]["path"], requestOptions?: RequestOptions): Promise<MarketDataOperationTypes["getFundingAmount"]["response"]> {
    const operation = MARKET_DATA_OPERATIONS["getFundingAmount"];
    return executeRestOperation<MarketDataOperationTypes["getFundingAmount"]>(this.transport, operation, {
      path,
    }, requestOptions);
  }

  getFundingAmountReportFile(query: MarketDataOperationTypes["getFundingAmountReportFile"]["query"], requestOptions?: RequestOptions): Promise<MarketDataOperationTypes["getFundingAmountReportFile"]["response"]>;
  getFundingAmountReportFile(query: MarketDataOperationTypes["getFundingAmountReportFile"]["query"]): Promise<MarketDataOperationTypes["getFundingAmountReportFile"]["response"]>;
  getFundingAmountReportFile(query: MarketDataOperationTypes["getFundingAmountReportFile"]["query"], requestOptions?: RequestOptions): Promise<MarketDataOperationTypes["getFundingAmountReportFile"]["response"]> {
    const operation = MARKET_DATA_OPERATIONS["getFundingAmountReportFile"];
    return executeRestOperation<MarketDataOperationTypes["getFundingAmountReportFile"]>(this.transport, operation, {
      query,
    }, requestOptions);
  }

  getSymbolDetails(path: MarketDataOperationTypes["getSymbolDetails"]["path"], requestOptions?: RequestOptions): Promise<MarketDataOperationTypes["getSymbolDetails"]["response"]>;
  getSymbolDetails(path: MarketDataOperationTypes["getSymbolDetails"]["path"]): Promise<MarketDataOperationTypes["getSymbolDetails"]["response"]>;
  getSymbolDetails(path: MarketDataOperationTypes["getSymbolDetails"]["path"], requestOptions?: RequestOptions): Promise<MarketDataOperationTypes["getSymbolDetails"]["response"]> {
    const operation = MARKET_DATA_OPERATIONS["getSymbolDetails"];
    return executeRestOperation<MarketDataOperationTypes["getSymbolDetails"]>(this.transport, operation, {
      path,
    }, requestOptions);
  }

  getTicker(path: MarketDataOperationTypes["getTicker"]["path"], requestOptions?: RequestOptions): Promise<MarketDataOperationTypes["getTicker"]["response"]>;
  getTicker(path: MarketDataOperationTypes["getTicker"]["path"]): Promise<MarketDataOperationTypes["getTicker"]["response"]>;
  getTicker(path: MarketDataOperationTypes["getTicker"]["path"], requestOptions?: RequestOptions): Promise<MarketDataOperationTypes["getTicker"]["response"]> {
    const operation = MARKET_DATA_OPERATIONS["getTicker"];
    return executeRestOperation<MarketDataOperationTypes["getTicker"]>(this.transport, operation, {
      path,
    }, requestOptions);
  }

  getTickerV2(path: MarketDataOperationTypes["getTickerV2"]["path"], requestOptions?: RequestOptions): Promise<MarketDataOperationTypes["getTickerV2"]["response"]>;
  getTickerV2(path: MarketDataOperationTypes["getTickerV2"]["path"]): Promise<MarketDataOperationTypes["getTickerV2"]["response"]>;
  getTickerV2(path: MarketDataOperationTypes["getTickerV2"]["path"], requestOptions?: RequestOptions): Promise<MarketDataOperationTypes["getTickerV2"]["response"]> {
    const operation = MARKET_DATA_OPERATIONS["getTickerV2"];
    return executeRestOperation<MarketDataOperationTypes["getTickerV2"]>(this.transport, operation, {
      path,
    }, requestOptions);
  }

  getTokenNetworkV2(path: MarketDataOperationTypes["getTokenNetworkV2"]["path"], requestOptions?: RequestOptions): Promise<MarketDataOperationTypes["getTokenNetworkV2"]["response"]>;
  getTokenNetworkV2(path: MarketDataOperationTypes["getTokenNetworkV2"]["path"]): Promise<MarketDataOperationTypes["getTokenNetworkV2"]["response"]>;
  getTokenNetworkV2(path: MarketDataOperationTypes["getTokenNetworkV2"]["path"], requestOptions?: RequestOptions): Promise<MarketDataOperationTypes["getTokenNetworkV2"]["response"]> {
    const operation = MARKET_DATA_OPERATIONS["getTokenNetworkV2"];
    return executeRestOperation<MarketDataOperationTypes["getTokenNetworkV2"]>(this.transport, operation, {
      path,
    }, requestOptions);
  }

  listCandles(path: MarketDataOperationTypes["listCandles"]["path"], requestOptions?: RequestOptions): Promise<MarketDataOperationTypes["listCandles"]["response"]>;
  listCandles(path: MarketDataOperationTypes["listCandles"]["path"]): Promise<MarketDataOperationTypes["listCandles"]["response"]>;
  listCandles(path: MarketDataOperationTypes["listCandles"]["path"], requestOptions?: RequestOptions): Promise<MarketDataOperationTypes["listCandles"]["response"]> {
    const operation = MARKET_DATA_OPERATIONS["listCandles"];
    return executeRestOperation<MarketDataOperationTypes["listCandles"]>(this.transport, operation, {
      path,
    }, requestOptions);
  }

  listDerivativeCandles(path: MarketDataOperationTypes["listDerivativeCandles"]["path"], requestOptions?: RequestOptions): Promise<MarketDataOperationTypes["listDerivativeCandles"]["response"]>;
  listDerivativeCandles(path: MarketDataOperationTypes["listDerivativeCandles"]["path"]): Promise<MarketDataOperationTypes["listDerivativeCandles"]["response"]>;
  listDerivativeCandles(path: MarketDataOperationTypes["listDerivativeCandles"]["path"], requestOptions?: RequestOptions): Promise<MarketDataOperationTypes["listDerivativeCandles"]["response"]> {
    const operation = MARKET_DATA_OPERATIONS["listDerivativeCandles"];
    return executeRestOperation<MarketDataOperationTypes["listDerivativeCandles"]>(this.transport, operation, {
      path,
    }, requestOptions);
  }

  listFeePromos(requestOptions?: RequestOptions): Promise<MarketDataOperationTypes["listFeePromos"]["response"]>;
  listFeePromos(): Promise<MarketDataOperationTypes["listFeePromos"]["response"]>;
  listFeePromos(requestOptions?: RequestOptions): Promise<MarketDataOperationTypes["listFeePromos"]["response"]> {
    const operation = MARKET_DATA_OPERATIONS["listFeePromos"];
    return executeRestOperation<MarketDataOperationTypes["listFeePromos"]>(this.transport, operation, {}, requestOptions);
  }

  listPrices(requestOptions?: RequestOptions): Promise<MarketDataOperationTypes["listPrices"]["response"]>;
  listPrices(): Promise<MarketDataOperationTypes["listPrices"]["response"]>;
  listPrices(requestOptions?: RequestOptions): Promise<MarketDataOperationTypes["listPrices"]["response"]> {
    const operation = MARKET_DATA_OPERATIONS["listPrices"];
    return executeRestOperation<MarketDataOperationTypes["listPrices"]>(this.transport, operation, {}, requestOptions);
  }

  listSymbols(requestOptions?: RequestOptions): Promise<MarketDataOperationTypes["listSymbols"]["response"]>;
  listSymbols(): Promise<MarketDataOperationTypes["listSymbols"]["response"]>;
  listSymbols(requestOptions?: RequestOptions): Promise<MarketDataOperationTypes["listSymbols"]["response"]> {
    const operation = MARKET_DATA_OPERATIONS["listSymbols"];
    return executeRestOperation<MarketDataOperationTypes["listSymbols"]>(this.transport, operation, {}, requestOptions);
  }

  listTrades(path: MarketDataOperationTypes["listTrades"]["path"], query?: MarketDataOperationTypes["listTrades"]["query"], requestOptions?: RequestOptions): Promise<MarketDataOperationTypes["listTrades"]["response"]>;
  listTrades(path: MarketDataOperationTypes["listTrades"]["path"], query?: MarketDataOperationTypes["listTrades"]["query"]): Promise<MarketDataOperationTypes["listTrades"]["response"]>;
  listTrades(path: MarketDataOperationTypes["listTrades"]["path"], query?: MarketDataOperationTypes["listTrades"]["query"], requestOptions?: RequestOptions): Promise<MarketDataOperationTypes["listTrades"]["response"]> {
    const operation = MARKET_DATA_OPERATIONS["listTrades"];
    return executeRestOperation<MarketDataOperationTypes["listTrades"]>(this.transport, operation, {
      path,
      query,
    }, requestOptions);
  }
}
