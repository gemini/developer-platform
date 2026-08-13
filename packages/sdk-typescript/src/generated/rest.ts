// Generated from prediction-markets.yaml. Do not edit.

import type { HttpTransport } from "../core/http.js";
import type { RequestOptions } from "../core/deadline.js";
import { executeRestOperation } from "../core/rest-operation.js";

import {
  PREDICTION_MARKET_OPERATIONS,
  type PredictionMarketOperationTypes,
} from "./operations.js";

export class PredictionMarketsRest {
  constructor(private readonly transport: HttpTransport) {}

  acceptPredictionMarketsTerms(requestOptions?: RequestOptions): Promise<PredictionMarketOperationTypes["acceptPredictionMarketsTerms"]["response"]>;
  acceptPredictionMarketsTerms(): Promise<PredictionMarketOperationTypes["acceptPredictionMarketsTerms"]["response"]>;
  acceptPredictionMarketsTerms(requestOptions?: RequestOptions): Promise<PredictionMarketOperationTypes["acceptPredictionMarketsTerms"]["response"]> {
    const operation = PREDICTION_MARKET_OPERATIONS["acceptPredictionMarketsTerms"];
    return executeRestOperation<PredictionMarketOperationTypes["acceptPredictionMarketsTerms"]>(this.transport, operation, {}, requestOptions);
  }

  cancelOrder(body: PredictionMarketOperationTypes["cancelOrder"]["body"], requestOptions?: RequestOptions): Promise<PredictionMarketOperationTypes["cancelOrder"]["response"]>;
  cancelOrder(body: PredictionMarketOperationTypes["cancelOrder"]["body"]): Promise<PredictionMarketOperationTypes["cancelOrder"]["response"]>;
  cancelOrder(body: PredictionMarketOperationTypes["cancelOrder"]["body"], requestOptions?: RequestOptions): Promise<PredictionMarketOperationTypes["cancelOrder"]["response"]> {
    const operation = PREDICTION_MARKET_OPERATIONS["cancelOrder"];
    return executeRestOperation<PredictionMarketOperationTypes["cancelOrder"]>(this.transport, operation, {
      body,
    }, requestOptions);
  }

  cancelOrderBatch(body: PredictionMarketOperationTypes["cancelOrderBatch"]["body"], requestOptions?: RequestOptions): Promise<PredictionMarketOperationTypes["cancelOrderBatch"]["response"]>;
  cancelOrderBatch(body: PredictionMarketOperationTypes["cancelOrderBatch"]["body"]): Promise<PredictionMarketOperationTypes["cancelOrderBatch"]["response"]>;
  cancelOrderBatch(body: PredictionMarketOperationTypes["cancelOrderBatch"]["body"], requestOptions?: RequestOptions): Promise<PredictionMarketOperationTypes["cancelOrderBatch"]["response"]> {
    const operation = PREDICTION_MARKET_OPERATIONS["cancelOrderBatch"];
    return executeRestOperation<PredictionMarketOperationTypes["cancelOrderBatch"]>(this.transport, operation, {
      body,
    }, requestOptions);
  }

  createCombo(body: PredictionMarketOperationTypes["createCombo"]["body"], requestOptions?: RequestOptions): Promise<PredictionMarketOperationTypes["createCombo"]["response"]>;
  createCombo(body: PredictionMarketOperationTypes["createCombo"]["body"]): Promise<PredictionMarketOperationTypes["createCombo"]["response"]>;
  createCombo(body: PredictionMarketOperationTypes["createCombo"]["body"], requestOptions?: RequestOptions): Promise<PredictionMarketOperationTypes["createCombo"]["response"]> {
    const operation = PREDICTION_MARKET_OPERATIONS["createCombo"];
    return executeRestOperation<PredictionMarketOperationTypes["createCombo"]>(this.transport, operation, {
      body,
    }, requestOptions);
  }

  getActiveOrders(body?: PredictionMarketOperationTypes["getActiveOrders"]["body"], requestOptions?: RequestOptions): Promise<PredictionMarketOperationTypes["getActiveOrders"]["response"]>;
  getActiveOrders(body?: PredictionMarketOperationTypes["getActiveOrders"]["body"]): Promise<PredictionMarketOperationTypes["getActiveOrders"]["response"]>;
  getActiveOrders(body?: PredictionMarketOperationTypes["getActiveOrders"]["body"], requestOptions?: RequestOptions): Promise<PredictionMarketOperationTypes["getActiveOrders"]["response"]> {
    const operation = PREDICTION_MARKET_OPERATIONS["getActiveOrders"];
    return executeRestOperation<PredictionMarketOperationTypes["getActiveOrders"]>(this.transport, operation, {
      body,
    }, requestOptions);
  }

  getCategories(query?: PredictionMarketOperationTypes["getCategories"]["query"], requestOptions?: RequestOptions): Promise<PredictionMarketOperationTypes["getCategories"]["response"]>;
  getCategories(query?: PredictionMarketOperationTypes["getCategories"]["query"]): Promise<PredictionMarketOperationTypes["getCategories"]["response"]>;
  getCategories(query?: PredictionMarketOperationTypes["getCategories"]["query"], requestOptions?: RequestOptions): Promise<PredictionMarketOperationTypes["getCategories"]["response"]> {
    const operation = PREDICTION_MARKET_OPERATIONS["getCategories"];
    return executeRestOperation<PredictionMarketOperationTypes["getCategories"]>(this.transport, operation, {
      query,
    }, requestOptions);
  }

  getComboByInstrumentSymbol(path: PredictionMarketOperationTypes["getComboByInstrumentSymbol"]["path"], requestOptions?: RequestOptions): Promise<PredictionMarketOperationTypes["getComboByInstrumentSymbol"]["response"]>;
  getComboByInstrumentSymbol(path: PredictionMarketOperationTypes["getComboByInstrumentSymbol"]["path"]): Promise<PredictionMarketOperationTypes["getComboByInstrumentSymbol"]["response"]>;
  getComboByInstrumentSymbol(path: PredictionMarketOperationTypes["getComboByInstrumentSymbol"]["path"], requestOptions?: RequestOptions): Promise<PredictionMarketOperationTypes["getComboByInstrumentSymbol"]["response"]> {
    const operation = PREDICTION_MARKET_OPERATIONS["getComboByInstrumentSymbol"];
    return executeRestOperation<PredictionMarketOperationTypes["getComboByInstrumentSymbol"]>(this.transport, operation, {
      path,
    }, requestOptions);
  }

  getEvent(path: PredictionMarketOperationTypes["getEvent"]["path"], requestOptions?: RequestOptions): Promise<PredictionMarketOperationTypes["getEvent"]["response"]>;
  getEvent(path: PredictionMarketOperationTypes["getEvent"]["path"]): Promise<PredictionMarketOperationTypes["getEvent"]["response"]>;
  getEvent(path: PredictionMarketOperationTypes["getEvent"]["path"], requestOptions?: RequestOptions): Promise<PredictionMarketOperationTypes["getEvent"]["response"]> {
    const operation = PREDICTION_MARKET_OPERATIONS["getEvent"];
    return executeRestOperation<PredictionMarketOperationTypes["getEvent"]>(this.transport, operation, {
      path,
    }, requestOptions);
  }

  getEventStrike(path: PredictionMarketOperationTypes["getEventStrike"]["path"], requestOptions?: RequestOptions): Promise<PredictionMarketOperationTypes["getEventStrike"]["response"]>;
  getEventStrike(path: PredictionMarketOperationTypes["getEventStrike"]["path"]): Promise<PredictionMarketOperationTypes["getEventStrike"]["response"]>;
  getEventStrike(path: PredictionMarketOperationTypes["getEventStrike"]["path"], requestOptions?: RequestOptions): Promise<PredictionMarketOperationTypes["getEventStrike"]["response"]> {
    const operation = PREDICTION_MARKET_OPERATIONS["getEventStrike"];
    return executeRestOperation<PredictionMarketOperationTypes["getEventStrike"]>(this.transport, operation, {
      path,
    }, requestOptions);
  }

  getLiquidityRewardsConfig(requestOptions?: RequestOptions): Promise<PredictionMarketOperationTypes["getLiquidityRewardsConfig"]["response"]>;
  getLiquidityRewardsConfig(): Promise<PredictionMarketOperationTypes["getLiquidityRewardsConfig"]["response"]>;
  getLiquidityRewardsConfig(requestOptions?: RequestOptions): Promise<PredictionMarketOperationTypes["getLiquidityRewardsConfig"]["response"]> {
    const operation = PREDICTION_MARKET_OPERATIONS["getLiquidityRewardsConfig"];
    return executeRestOperation<PredictionMarketOperationTypes["getLiquidityRewardsConfig"]>(this.transport, operation, {}, requestOptions);
  }

  getLiquidityRewardsDailySummary(query: PredictionMarketOperationTypes["getLiquidityRewardsDailySummary"]["query"], requestOptions?: RequestOptions): Promise<PredictionMarketOperationTypes["getLiquidityRewardsDailySummary"]["response"]>;
  getLiquidityRewardsDailySummary(query: PredictionMarketOperationTypes["getLiquidityRewardsDailySummary"]["query"]): Promise<PredictionMarketOperationTypes["getLiquidityRewardsDailySummary"]["response"]>;
  getLiquidityRewardsDailySummary(query: PredictionMarketOperationTypes["getLiquidityRewardsDailySummary"]["query"], requestOptions?: RequestOptions): Promise<PredictionMarketOperationTypes["getLiquidityRewardsDailySummary"]["response"]> {
    const operation = PREDICTION_MARKET_OPERATIONS["getLiquidityRewardsDailySummary"];
    return executeRestOperation<PredictionMarketOperationTypes["getLiquidityRewardsDailySummary"]>(this.transport, operation, {
      query,
    }, requestOptions);
  }

  getLiquidityRewardsLifetimeSummary(query?: PredictionMarketOperationTypes["getLiquidityRewardsLifetimeSummary"]["query"], requestOptions?: RequestOptions): Promise<PredictionMarketOperationTypes["getLiquidityRewardsLifetimeSummary"]["response"]>;
  getLiquidityRewardsLifetimeSummary(query?: PredictionMarketOperationTypes["getLiquidityRewardsLifetimeSummary"]["query"]): Promise<PredictionMarketOperationTypes["getLiquidityRewardsLifetimeSummary"]["response"]>;
  getLiquidityRewardsLifetimeSummary(query?: PredictionMarketOperationTypes["getLiquidityRewardsLifetimeSummary"]["query"], requestOptions?: RequestOptions): Promise<PredictionMarketOperationTypes["getLiquidityRewardsLifetimeSummary"]["response"]> {
    const operation = PREDICTION_MARKET_OPERATIONS["getLiquidityRewardsLifetimeSummary"];
    return executeRestOperation<PredictionMarketOperationTypes["getLiquidityRewardsLifetimeSummary"]>(this.transport, operation, {
      query,
    }, requestOptions);
  }

  getMakerRebateLifetimeSummary(query?: PredictionMarketOperationTypes["getMakerRebateLifetimeSummary"]["query"], requestOptions?: RequestOptions): Promise<PredictionMarketOperationTypes["getMakerRebateLifetimeSummary"]["response"]>;
  getMakerRebateLifetimeSummary(query?: PredictionMarketOperationTypes["getMakerRebateLifetimeSummary"]["query"]): Promise<PredictionMarketOperationTypes["getMakerRebateLifetimeSummary"]["response"]>;
  getMakerRebateLifetimeSummary(query?: PredictionMarketOperationTypes["getMakerRebateLifetimeSummary"]["query"], requestOptions?: RequestOptions): Promise<PredictionMarketOperationTypes["getMakerRebateLifetimeSummary"]["response"]> {
    const operation = PREDICTION_MARKET_OPERATIONS["getMakerRebateLifetimeSummary"];
    return executeRestOperation<PredictionMarketOperationTypes["getMakerRebateLifetimeSummary"]>(this.transport, operation, {
      query,
    }, requestOptions);
  }

  getMakerRebateRates(query?: PredictionMarketOperationTypes["getMakerRebateRates"]["query"], requestOptions?: RequestOptions): Promise<PredictionMarketOperationTypes["getMakerRebateRates"]["response"]>;
  getMakerRebateRates(query?: PredictionMarketOperationTypes["getMakerRebateRates"]["query"]): Promise<PredictionMarketOperationTypes["getMakerRebateRates"]["response"]>;
  getMakerRebateRates(query?: PredictionMarketOperationTypes["getMakerRebateRates"]["query"], requestOptions?: RequestOptions): Promise<PredictionMarketOperationTypes["getMakerRebateRates"]["response"]> {
    const operation = PREDICTION_MARKET_OPERATIONS["getMakerRebateRates"];
    return executeRestOperation<PredictionMarketOperationTypes["getMakerRebateRates"]>(this.transport, operation, {
      query,
    }, requestOptions);
  }

  getOrderHistory(body?: PredictionMarketOperationTypes["getOrderHistory"]["body"], requestOptions?: RequestOptions): Promise<PredictionMarketOperationTypes["getOrderHistory"]["response"]>;
  getOrderHistory(body?: PredictionMarketOperationTypes["getOrderHistory"]["body"]): Promise<PredictionMarketOperationTypes["getOrderHistory"]["response"]>;
  getOrderHistory(body?: PredictionMarketOperationTypes["getOrderHistory"]["body"], requestOptions?: RequestOptions): Promise<PredictionMarketOperationTypes["getOrderHistory"]["response"]> {
    const operation = PREDICTION_MARKET_OPERATIONS["getOrderHistory"];
    return executeRestOperation<PredictionMarketOperationTypes["getOrderHistory"]>(this.transport, operation, {
      body,
    }, requestOptions);
  }

  getPositions(query?: PredictionMarketOperationTypes["getPositions"]["query"], requestOptions?: RequestOptions): Promise<PredictionMarketOperationTypes["getPositions"]["response"]>;
  getPositions(query?: PredictionMarketOperationTypes["getPositions"]["query"]): Promise<PredictionMarketOperationTypes["getPositions"]["response"]>;
  getPositions(query?: PredictionMarketOperationTypes["getPositions"]["query"], requestOptions?: RequestOptions): Promise<PredictionMarketOperationTypes["getPositions"]["response"]> {
    const operation = PREDICTION_MARKET_OPERATIONS["getPositions"];
    return executeRestOperation<PredictionMarketOperationTypes["getPositions"]>(this.transport, operation, {
      query,
    }, requestOptions);
  }

  getPredictionMarketDailyVolume(path: PredictionMarketOperationTypes["getPredictionMarketDailyVolume"]["path"], requestOptions?: RequestOptions): Promise<PredictionMarketOperationTypes["getPredictionMarketDailyVolume"]["response"]>;
  getPredictionMarketDailyVolume(path: PredictionMarketOperationTypes["getPredictionMarketDailyVolume"]["path"]): Promise<PredictionMarketOperationTypes["getPredictionMarketDailyVolume"]["response"]>;
  getPredictionMarketDailyVolume(path: PredictionMarketOperationTypes["getPredictionMarketDailyVolume"]["path"], requestOptions?: RequestOptions): Promise<PredictionMarketOperationTypes["getPredictionMarketDailyVolume"]["response"]> {
    const operation = PREDICTION_MARKET_OPERATIONS["getPredictionMarketDailyVolume"];
    return executeRestOperation<PredictionMarketOperationTypes["getPredictionMarketDailyVolume"]>(this.transport, operation, {
      path,
    }, requestOptions);
  }

  getPredictionMarketHourlyVolume(path: PredictionMarketOperationTypes["getPredictionMarketHourlyVolume"]["path"], requestOptions?: RequestOptions): Promise<PredictionMarketOperationTypes["getPredictionMarketHourlyVolume"]["response"]>;
  getPredictionMarketHourlyVolume(path: PredictionMarketOperationTypes["getPredictionMarketHourlyVolume"]["path"]): Promise<PredictionMarketOperationTypes["getPredictionMarketHourlyVolume"]["response"]>;
  getPredictionMarketHourlyVolume(path: PredictionMarketOperationTypes["getPredictionMarketHourlyVolume"]["path"], requestOptions?: RequestOptions): Promise<PredictionMarketOperationTypes["getPredictionMarketHourlyVolume"]["response"]> {
    const operation = PREDICTION_MARKET_OPERATIONS["getPredictionMarketHourlyVolume"];
    return executeRestOperation<PredictionMarketOperationTypes["getPredictionMarketHourlyVolume"]>(this.transport, operation, {
      path,
    }, requestOptions);
  }

  getPredictionMarketsTerms(requestOptions?: RequestOptions): Promise<PredictionMarketOperationTypes["getPredictionMarketsTerms"]["response"]>;
  getPredictionMarketsTerms(): Promise<PredictionMarketOperationTypes["getPredictionMarketsTerms"]["response"]>;
  getPredictionMarketsTerms(requestOptions?: RequestOptions): Promise<PredictionMarketOperationTypes["getPredictionMarketsTerms"]["response"]> {
    const operation = PREDICTION_MARKET_OPERATIONS["getPredictionMarketsTerms"];
    return executeRestOperation<PredictionMarketOperationTypes["getPredictionMarketsTerms"]>(this.transport, operation, {}, requestOptions);
  }

  getPredictionMarketsTermsStatus(requestOptions?: RequestOptions): Promise<PredictionMarketOperationTypes["getPredictionMarketsTermsStatus"]["response"]>;
  getPredictionMarketsTermsStatus(): Promise<PredictionMarketOperationTypes["getPredictionMarketsTermsStatus"]["response"]>;
  getPredictionMarketsTermsStatus(requestOptions?: RequestOptions): Promise<PredictionMarketOperationTypes["getPredictionMarketsTermsStatus"]["response"]> {
    const operation = PREDICTION_MARKET_OPERATIONS["getPredictionMarketsTermsStatus"];
    return executeRestOperation<PredictionMarketOperationTypes["getPredictionMarketsTermsStatus"]>(this.transport, operation, {}, requestOptions);
  }

  getSettledPositions(query?: PredictionMarketOperationTypes["getSettledPositions"]["query"], requestOptions?: RequestOptions): Promise<PredictionMarketOperationTypes["getSettledPositions"]["response"]>;
  getSettledPositions(query?: PredictionMarketOperationTypes["getSettledPositions"]["query"]): Promise<PredictionMarketOperationTypes["getSettledPositions"]["response"]>;
  getSettledPositions(query?: PredictionMarketOperationTypes["getSettledPositions"]["query"], requestOptions?: RequestOptions): Promise<PredictionMarketOperationTypes["getSettledPositions"]["response"]> {
    const operation = PREDICTION_MARKET_OPERATIONS["getSettledPositions"];
    return executeRestOperation<PredictionMarketOperationTypes["getSettledPositions"]>(this.transport, operation, {
      query,
    }, requestOptions);
  }

  getVolumeMetrics(body: PredictionMarketOperationTypes["getVolumeMetrics"]["body"], requestOptions?: RequestOptions): Promise<PredictionMarketOperationTypes["getVolumeMetrics"]["response"]>;
  getVolumeMetrics(body: PredictionMarketOperationTypes["getVolumeMetrics"]["body"]): Promise<PredictionMarketOperationTypes["getVolumeMetrics"]["response"]>;
  getVolumeMetrics(body: PredictionMarketOperationTypes["getVolumeMetrics"]["body"], requestOptions?: RequestOptions): Promise<PredictionMarketOperationTypes["getVolumeMetrics"]["response"]> {
    const operation = PREDICTION_MARKET_OPERATIONS["getVolumeMetrics"];
    return executeRestOperation<PredictionMarketOperationTypes["getVolumeMetrics"]>(this.transport, operation, {
      body,
    }, requestOptions);
  }

  listCombos(query?: PredictionMarketOperationTypes["listCombos"]["query"], requestOptions?: RequestOptions): Promise<PredictionMarketOperationTypes["listCombos"]["response"]>;
  listCombos(query?: PredictionMarketOperationTypes["listCombos"]["query"]): Promise<PredictionMarketOperationTypes["listCombos"]["response"]>;
  listCombos(query?: PredictionMarketOperationTypes["listCombos"]["query"], requestOptions?: RequestOptions): Promise<PredictionMarketOperationTypes["listCombos"]["response"]> {
    const operation = PREDICTION_MARKET_OPERATIONS["listCombos"];
    return executeRestOperation<PredictionMarketOperationTypes["listCombos"]>(this.transport, operation, {
      query,
    }, requestOptions);
  }

  listEvents(query?: PredictionMarketOperationTypes["listEvents"]["query"], requestOptions?: RequestOptions): Promise<PredictionMarketOperationTypes["listEvents"]["response"]>;
  listEvents(query?: PredictionMarketOperationTypes["listEvents"]["query"]): Promise<PredictionMarketOperationTypes["listEvents"]["response"]>;
  listEvents(query?: PredictionMarketOperationTypes["listEvents"]["query"], requestOptions?: RequestOptions): Promise<PredictionMarketOperationTypes["listEvents"]["response"]> {
    const operation = PREDICTION_MARKET_OPERATIONS["listEvents"];
    return executeRestOperation<PredictionMarketOperationTypes["listEvents"]>(this.transport, operation, {
      query,
    }, requestOptions);
  }

  listLiquidityRewardsEvents(query?: PredictionMarketOperationTypes["listLiquidityRewardsEvents"]["query"], requestOptions?: RequestOptions): Promise<PredictionMarketOperationTypes["listLiquidityRewardsEvents"]["response"]>;
  listLiquidityRewardsEvents(query?: PredictionMarketOperationTypes["listLiquidityRewardsEvents"]["query"]): Promise<PredictionMarketOperationTypes["listLiquidityRewardsEvents"]["response"]>;
  listLiquidityRewardsEvents(query?: PredictionMarketOperationTypes["listLiquidityRewardsEvents"]["query"], requestOptions?: RequestOptions): Promise<PredictionMarketOperationTypes["listLiquidityRewardsEvents"]["response"]> {
    const operation = PREDICTION_MARKET_OPERATIONS["listLiquidityRewardsEvents"];
    return executeRestOperation<PredictionMarketOperationTypes["listLiquidityRewardsEvents"]>(this.transport, operation, {
      query,
    }, requestOptions);
  }

  listMakerRebatePayouts(query?: PredictionMarketOperationTypes["listMakerRebatePayouts"]["query"], requestOptions?: RequestOptions): Promise<PredictionMarketOperationTypes["listMakerRebatePayouts"]["response"]>;
  listMakerRebatePayouts(query?: PredictionMarketOperationTypes["listMakerRebatePayouts"]["query"]): Promise<PredictionMarketOperationTypes["listMakerRebatePayouts"]["response"]>;
  listMakerRebatePayouts(query?: PredictionMarketOperationTypes["listMakerRebatePayouts"]["query"], requestOptions?: RequestOptions): Promise<PredictionMarketOperationTypes["listMakerRebatePayouts"]["response"]> {
    const operation = PREDICTION_MARKET_OPERATIONS["listMakerRebatePayouts"];
    return executeRestOperation<PredictionMarketOperationTypes["listMakerRebatePayouts"]>(this.transport, operation, {
      query,
    }, requestOptions);
  }

  listNewlyListedEvents(query?: PredictionMarketOperationTypes["listNewlyListedEvents"]["query"], requestOptions?: RequestOptions): Promise<PredictionMarketOperationTypes["listNewlyListedEvents"]["response"]>;
  listNewlyListedEvents(query?: PredictionMarketOperationTypes["listNewlyListedEvents"]["query"]): Promise<PredictionMarketOperationTypes["listNewlyListedEvents"]["response"]>;
  listNewlyListedEvents(query?: PredictionMarketOperationTypes["listNewlyListedEvents"]["query"], requestOptions?: RequestOptions): Promise<PredictionMarketOperationTypes["listNewlyListedEvents"]["response"]> {
    const operation = PREDICTION_MARKET_OPERATIONS["listNewlyListedEvents"];
    return executeRestOperation<PredictionMarketOperationTypes["listNewlyListedEvents"]>(this.transport, operation, {
      query,
    }, requestOptions);
  }

  listRecentlySettledEvents(query?: PredictionMarketOperationTypes["listRecentlySettledEvents"]["query"], requestOptions?: RequestOptions): Promise<PredictionMarketOperationTypes["listRecentlySettledEvents"]["response"]>;
  listRecentlySettledEvents(query?: PredictionMarketOperationTypes["listRecentlySettledEvents"]["query"]): Promise<PredictionMarketOperationTypes["listRecentlySettledEvents"]["response"]>;
  listRecentlySettledEvents(query?: PredictionMarketOperationTypes["listRecentlySettledEvents"]["query"], requestOptions?: RequestOptions): Promise<PredictionMarketOperationTypes["listRecentlySettledEvents"]["response"]> {
    const operation = PREDICTION_MARKET_OPERATIONS["listRecentlySettledEvents"];
    return executeRestOperation<PredictionMarketOperationTypes["listRecentlySettledEvents"]>(this.transport, operation, {
      query,
    }, requestOptions);
  }

  listUpcomingEvents(query?: PredictionMarketOperationTypes["listUpcomingEvents"]["query"], requestOptions?: RequestOptions): Promise<PredictionMarketOperationTypes["listUpcomingEvents"]["response"]>;
  listUpcomingEvents(query?: PredictionMarketOperationTypes["listUpcomingEvents"]["query"]): Promise<PredictionMarketOperationTypes["listUpcomingEvents"]["response"]>;
  listUpcomingEvents(query?: PredictionMarketOperationTypes["listUpcomingEvents"]["query"], requestOptions?: RequestOptions): Promise<PredictionMarketOperationTypes["listUpcomingEvents"]["response"]> {
    const operation = PREDICTION_MARKET_OPERATIONS["listUpcomingEvents"];
    return executeRestOperation<PredictionMarketOperationTypes["listUpcomingEvents"]>(this.transport, operation, {
      query,
    }, requestOptions);
  }

  placeOrder(body: PredictionMarketOperationTypes["placeOrder"]["body"], requestOptions?: RequestOptions): Promise<PredictionMarketOperationTypes["placeOrder"]["response"]>;
  placeOrder(body: PredictionMarketOperationTypes["placeOrder"]["body"]): Promise<PredictionMarketOperationTypes["placeOrder"]["response"]>;
  placeOrder(body: PredictionMarketOperationTypes["placeOrder"]["body"], requestOptions?: RequestOptions): Promise<PredictionMarketOperationTypes["placeOrder"]["response"]> {
    const operation = PREDICTION_MARKET_OPERATIONS["placeOrder"];
    return executeRestOperation<PredictionMarketOperationTypes["placeOrder"]>(this.transport, operation, {
      body,
    }, requestOptions);
  }

  placeOrderBatch(body: PredictionMarketOperationTypes["placeOrderBatch"]["body"], requestOptions?: RequestOptions): Promise<PredictionMarketOperationTypes["placeOrderBatch"]["response"]>;
  placeOrderBatch(body: PredictionMarketOperationTypes["placeOrderBatch"]["body"]): Promise<PredictionMarketOperationTypes["placeOrderBatch"]["response"]>;
  placeOrderBatch(body: PredictionMarketOperationTypes["placeOrderBatch"]["body"], requestOptions?: RequestOptions): Promise<PredictionMarketOperationTypes["placeOrderBatch"]["response"]> {
    const operation = PREDICTION_MARKET_OPERATIONS["placeOrderBatch"];
    return executeRestOperation<PredictionMarketOperationTypes["placeOrderBatch"]>(this.transport, operation, {
      body,
    }, requestOptions);
  }
}
