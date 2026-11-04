// Generated from prediction-markets.yaml. Do not edit.

import type { HttpTransport } from "../transport/http.js";
import type { RestPromise } from "../transport/rest-promise.js";
import type { RequestOptions } from "../utils/deadline.js";
import { executeRestOperation } from "../transport/rest-operation.js";

import {
  PREDICTION_MARKET_OPERATIONS,
  type PredictionMarketOperationTypes,
} from "./operations.js";

export class PredictionMarketsRest {
  constructor(private readonly transport: HttpTransport) {}

  acceptTerms(requestOptions?: RequestOptions): RestPromise<PredictionMarketOperationTypes["acceptPredictionMarketsTerms"]["response"]> {
    const operation = PREDICTION_MARKET_OPERATIONS["acceptPredictionMarketsTerms"];
    return executeRestOperation<PredictionMarketOperationTypes["acceptPredictionMarketsTerms"]>(this.transport, operation, undefined, requestOptions);
  }

  cancelOrder(input: PredictionMarketOperationTypes["cancelOrder"]["input"], requestOptions?: RequestOptions): RestPromise<PredictionMarketOperationTypes["cancelOrder"]["response"]> {
    const operation = PREDICTION_MARKET_OPERATIONS["cancelOrder"];
    return executeRestOperation<PredictionMarketOperationTypes["cancelOrder"]>(this.transport, operation, input, requestOptions);
  }

  cancelOrderBatch(input: PredictionMarketOperationTypes["cancelOrderBatch"]["input"], requestOptions?: RequestOptions): RestPromise<PredictionMarketOperationTypes["cancelOrderBatch"]["response"]> {
    const operation = PREDICTION_MARKET_OPERATIONS["cancelOrderBatch"];
    return executeRestOperation<PredictionMarketOperationTypes["cancelOrderBatch"]>(this.transport, operation, input, requestOptions);
  }

  createCombo(input: PredictionMarketOperationTypes["createCombo"]["input"], requestOptions?: RequestOptions): RestPromise<PredictionMarketOperationTypes["createCombo"]["response"]> {
    const operation = PREDICTION_MARKET_OPERATIONS["createCombo"];
    return executeRestOperation<PredictionMarketOperationTypes["createCombo"]>(this.transport, operation, input, requestOptions);
  }

  getActiveOrders(input?: PredictionMarketOperationTypes["getActiveOrders"]["input"], requestOptions?: RequestOptions): RestPromise<PredictionMarketOperationTypes["getActiveOrders"]["response"]> {
    const operation = PREDICTION_MARKET_OPERATIONS["getActiveOrders"];
    return executeRestOperation<PredictionMarketOperationTypes["getActiveOrders"]>(this.transport, operation, input, requestOptions);
  }

  getCategories(input?: PredictionMarketOperationTypes["getCategories"]["input"], requestOptions?: RequestOptions): RestPromise<PredictionMarketOperationTypes["getCategories"]["response"]> {
    const operation = PREDICTION_MARKET_OPERATIONS["getCategories"];
    return executeRestOperation<PredictionMarketOperationTypes["getCategories"]>(this.transport, operation, input, requestOptions);
  }

  getComboByInstrumentSymbol(input: PredictionMarketOperationTypes["getComboByInstrumentSymbol"]["input"], requestOptions?: RequestOptions): RestPromise<PredictionMarketOperationTypes["getComboByInstrumentSymbol"]["response"]> {
    const operation = PREDICTION_MARKET_OPERATIONS["getComboByInstrumentSymbol"];
    return executeRestOperation<PredictionMarketOperationTypes["getComboByInstrumentSymbol"]>(this.transport, operation, input, requestOptions);
  }

  getEvent(input: PredictionMarketOperationTypes["getEvent"]["input"], requestOptions?: RequestOptions): RestPromise<PredictionMarketOperationTypes["getEvent"]["response"]> {
    const operation = PREDICTION_MARKET_OPERATIONS["getEvent"];
    return executeRestOperation<PredictionMarketOperationTypes["getEvent"]>(this.transport, operation, input, requestOptions);
  }

  getEventStrike(input: PredictionMarketOperationTypes["getEventStrike"]["input"], requestOptions?: RequestOptions): RestPromise<PredictionMarketOperationTypes["getEventStrike"]["response"]> {
    const operation = PREDICTION_MARKET_OPERATIONS["getEventStrike"];
    return executeRestOperation<PredictionMarketOperationTypes["getEventStrike"]>(this.transport, operation, input, requestOptions);
  }

  getLiquidityRewardsConfig(requestOptions?: RequestOptions): RestPromise<PredictionMarketOperationTypes["getLiquidityRewardsConfig"]["response"]> {
    const operation = PREDICTION_MARKET_OPERATIONS["getLiquidityRewardsConfig"];
    return executeRestOperation<PredictionMarketOperationTypes["getLiquidityRewardsConfig"]>(this.transport, operation, undefined, requestOptions);
  }

  getLiquidityRewardsDailySummary(input: PredictionMarketOperationTypes["getLiquidityRewardsDailySummary"]["input"], requestOptions?: RequestOptions): RestPromise<PredictionMarketOperationTypes["getLiquidityRewardsDailySummary"]["response"]> {
    const operation = PREDICTION_MARKET_OPERATIONS["getLiquidityRewardsDailySummary"];
    return executeRestOperation<PredictionMarketOperationTypes["getLiquidityRewardsDailySummary"]>(this.transport, operation, input, requestOptions);
  }

  getLiquidityRewardsLifetimeSummary(input?: PredictionMarketOperationTypes["getLiquidityRewardsLifetimeSummary"]["input"], requestOptions?: RequestOptions): RestPromise<PredictionMarketOperationTypes["getLiquidityRewardsLifetimeSummary"]["response"]> {
    const operation = PREDICTION_MARKET_OPERATIONS["getLiquidityRewardsLifetimeSummary"];
    return executeRestOperation<PredictionMarketOperationTypes["getLiquidityRewardsLifetimeSummary"]>(this.transport, operation, input, requestOptions);
  }

  getMakerRebateLifetimeSummary(input?: PredictionMarketOperationTypes["getMakerRebateLifetimeSummary"]["input"], requestOptions?: RequestOptions): RestPromise<PredictionMarketOperationTypes["getMakerRebateLifetimeSummary"]["response"]> {
    const operation = PREDICTION_MARKET_OPERATIONS["getMakerRebateLifetimeSummary"];
    return executeRestOperation<PredictionMarketOperationTypes["getMakerRebateLifetimeSummary"]>(this.transport, operation, input, requestOptions);
  }

  getMakerRebateRates(input?: PredictionMarketOperationTypes["getMakerRebateRates"]["input"], requestOptions?: RequestOptions): RestPromise<PredictionMarketOperationTypes["getMakerRebateRates"]["response"]> {
    const operation = PREDICTION_MARKET_OPERATIONS["getMakerRebateRates"];
    return executeRestOperation<PredictionMarketOperationTypes["getMakerRebateRates"]>(this.transport, operation, input, requestOptions);
  }

  getOrderHistory(input?: PredictionMarketOperationTypes["getOrderHistory"]["input"], requestOptions?: RequestOptions): RestPromise<PredictionMarketOperationTypes["getOrderHistory"]["response"]> {
    const operation = PREDICTION_MARKET_OPERATIONS["getOrderHistory"];
    return executeRestOperation<PredictionMarketOperationTypes["getOrderHistory"]>(this.transport, operation, input, requestOptions);
  }

  getPositions(input?: PredictionMarketOperationTypes["getPositions"]["input"], requestOptions?: RequestOptions): RestPromise<PredictionMarketOperationTypes["getPositions"]["response"]> {
    const operation = PREDICTION_MARKET_OPERATIONS["getPositions"];
    return executeRestOperation<PredictionMarketOperationTypes["getPositions"]>(this.transport, operation, input, requestOptions);
  }

  getPredictionMarketDailyVolume(input: PredictionMarketOperationTypes["getPredictionMarketDailyVolume"]["input"], requestOptions?: RequestOptions): RestPromise<PredictionMarketOperationTypes["getPredictionMarketDailyVolume"]["response"]> {
    const operation = PREDICTION_MARKET_OPERATIONS["getPredictionMarketDailyVolume"];
    return executeRestOperation<PredictionMarketOperationTypes["getPredictionMarketDailyVolume"]>(this.transport, operation, input, requestOptions);
  }

  getPredictionMarketHourlyVolume(input: PredictionMarketOperationTypes["getPredictionMarketHourlyVolume"]["input"], requestOptions?: RequestOptions): RestPromise<PredictionMarketOperationTypes["getPredictionMarketHourlyVolume"]["response"]> {
    const operation = PREDICTION_MARKET_OPERATIONS["getPredictionMarketHourlyVolume"];
    return executeRestOperation<PredictionMarketOperationTypes["getPredictionMarketHourlyVolume"]>(this.transport, operation, input, requestOptions);
  }

  getPredictionMarketsTerms(requestOptions?: RequestOptions): RestPromise<PredictionMarketOperationTypes["getPredictionMarketsTerms"]["response"]> {
    const operation = PREDICTION_MARKET_OPERATIONS["getPredictionMarketsTerms"];
    return executeRestOperation<PredictionMarketOperationTypes["getPredictionMarketsTerms"]>(this.transport, operation, undefined, requestOptions);
  }

  getPredictionMarketsTermsStatus(requestOptions?: RequestOptions): RestPromise<PredictionMarketOperationTypes["getPredictionMarketsTermsStatus"]["response"]> {
    const operation = PREDICTION_MARKET_OPERATIONS["getPredictionMarketsTermsStatus"];
    return executeRestOperation<PredictionMarketOperationTypes["getPredictionMarketsTermsStatus"]>(this.transport, operation, undefined, requestOptions);
  }

  getSettledPositions(input?: PredictionMarketOperationTypes["getSettledPositions"]["input"], requestOptions?: RequestOptions): RestPromise<PredictionMarketOperationTypes["getSettledPositions"]["response"]> {
    const operation = PREDICTION_MARKET_OPERATIONS["getSettledPositions"];
    return executeRestOperation<PredictionMarketOperationTypes["getSettledPositions"]>(this.transport, operation, input, requestOptions);
  }

  getVolumeMetrics(input: PredictionMarketOperationTypes["getVolumeMetrics"]["input"], requestOptions?: RequestOptions): RestPromise<PredictionMarketOperationTypes["getVolumeMetrics"]["response"]> {
    const operation = PREDICTION_MARKET_OPERATIONS["getVolumeMetrics"];
    return executeRestOperation<PredictionMarketOperationTypes["getVolumeMetrics"]>(this.transport, operation, input, requestOptions);
  }

  listCombos(input?: PredictionMarketOperationTypes["listCombos"]["input"], requestOptions?: RequestOptions): RestPromise<PredictionMarketOperationTypes["listCombos"]["response"]> {
    const operation = PREDICTION_MARKET_OPERATIONS["listCombos"];
    return executeRestOperation<PredictionMarketOperationTypes["listCombos"]>(this.transport, operation, input, requestOptions);
  }

  listEvents(input?: PredictionMarketOperationTypes["listEvents"]["input"], requestOptions?: RequestOptions): RestPromise<PredictionMarketOperationTypes["listEvents"]["response"]> {
    const operation = PREDICTION_MARKET_OPERATIONS["listEvents"];
    return executeRestOperation<PredictionMarketOperationTypes["listEvents"]>(this.transport, operation, input, requestOptions);
  }

  listLiquidityRewardsEvents(input?: PredictionMarketOperationTypes["listLiquidityRewardsEvents"]["input"], requestOptions?: RequestOptions): RestPromise<PredictionMarketOperationTypes["listLiquidityRewardsEvents"]["response"]> {
    const operation = PREDICTION_MARKET_OPERATIONS["listLiquidityRewardsEvents"];
    return executeRestOperation<PredictionMarketOperationTypes["listLiquidityRewardsEvents"]>(this.transport, operation, input, requestOptions);
  }

  listMakerRebatePayouts(input?: PredictionMarketOperationTypes["listMakerRebatePayouts"]["input"], requestOptions?: RequestOptions): RestPromise<PredictionMarketOperationTypes["listMakerRebatePayouts"]["response"]> {
    const operation = PREDICTION_MARKET_OPERATIONS["listMakerRebatePayouts"];
    return executeRestOperation<PredictionMarketOperationTypes["listMakerRebatePayouts"]>(this.transport, operation, input, requestOptions);
  }

  listNewlyListedEvents(input?: PredictionMarketOperationTypes["listNewlyListedEvents"]["input"], requestOptions?: RequestOptions): RestPromise<PredictionMarketOperationTypes["listNewlyListedEvents"]["response"]> {
    const operation = PREDICTION_MARKET_OPERATIONS["listNewlyListedEvents"];
    return executeRestOperation<PredictionMarketOperationTypes["listNewlyListedEvents"]>(this.transport, operation, input, requestOptions);
  }

  listRecentlySettledEvents(input?: PredictionMarketOperationTypes["listRecentlySettledEvents"]["input"], requestOptions?: RequestOptions): RestPromise<PredictionMarketOperationTypes["listRecentlySettledEvents"]["response"]> {
    const operation = PREDICTION_MARKET_OPERATIONS["listRecentlySettledEvents"];
    return executeRestOperation<PredictionMarketOperationTypes["listRecentlySettledEvents"]>(this.transport, operation, input, requestOptions);
  }

  listUpcomingEvents(input?: PredictionMarketOperationTypes["listUpcomingEvents"]["input"], requestOptions?: RequestOptions): RestPromise<PredictionMarketOperationTypes["listUpcomingEvents"]["response"]> {
    const operation = PREDICTION_MARKET_OPERATIONS["listUpcomingEvents"];
    return executeRestOperation<PredictionMarketOperationTypes["listUpcomingEvents"]>(this.transport, operation, input, requestOptions);
  }

  placeOrder(input: PredictionMarketOperationTypes["placeOrder"]["input"], requestOptions?: RequestOptions): RestPromise<PredictionMarketOperationTypes["placeOrder"]["response"]> {
    const operation = PREDICTION_MARKET_OPERATIONS["placeOrder"];
    return executeRestOperation<PredictionMarketOperationTypes["placeOrder"]>(this.transport, operation, input, requestOptions);
  }

  placeOrderBatch(input: PredictionMarketOperationTypes["placeOrderBatch"]["input"], requestOptions?: RequestOptions): RestPromise<PredictionMarketOperationTypes["placeOrderBatch"]["response"]> {
    const operation = PREDICTION_MARKET_OPERATIONS["placeOrderBatch"];
    return executeRestOperation<PredictionMarketOperationTypes["placeOrderBatch"]>(this.transport, operation, input, requestOptions);
  }
}
