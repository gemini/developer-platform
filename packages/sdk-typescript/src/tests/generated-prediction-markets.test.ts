import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";

import type { components } from "../generated/models.js";
import {
  PREDICTION_MARKET_OPERATIONS,
  type PredictionMarketOperationTypes,
} from "../generated/operations.js";
import { PredictionMarketsRest } from "../generated/rest.js";

type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends
  (<T>() => T extends B ? 1 : 2) ? true : false;
type Assert<T extends true> = T;

type OrderResponse = components["schemas"]["OrderResponse"];
type Position = components["schemas"]["Position"];
type Batch = components["schemas"]["PlaceOrderBatchRequest"];
type Reward = components["schemas"]["MakerRebatePayout"];
type RewardSummary = components["schemas"]["MakerRebateLifetimeSummary"];
type RewardEvent = components["schemas"]["LiquidityRewardEvent"];
type ComboLeg = components["schemas"]["ComboLeg"];
type ComboSummaryLeg = components["schemas"]["ComboSummaryLeg"];
type MakerRate = components["schemas"]["MakerRebateRateRule"];
type RewardsConfig = components["schemas"]["LiquidityRewardsConfig"];
type Event = components["schemas"]["Event"];
type SportsMarket = components["schemas"]["SportsMarket"];
type SportsMarketScope = components["schemas"]["SportsMarketScope"];

type _OrderId = Assert<Equal<OrderResponse["orderId"], bigint | undefined>>;
type _OrderPrice = Assert<Equal<OrderResponse["price"], string | undefined>>;
type _Pct = Assert<Equal<Position["unrealizedPct"], number | undefined>>;
type _BatchArray = Assert<Equal<Batch["orders"], components["schemas"]["OrderRequest"][]>>;
type _RewardId = Assert<Equal<Reward["id"], bigint>>;
type _RewardMoney = Assert<Equal<Reward["total_rebate_usd"], string>>;
type _PaidAt = Assert<Equal<Reward["paid_at"], string | null>>;
type _IconUrl = Assert<Equal<RewardEvent["icon_url"], string | undefined>>;
type _ComboId = Assert<Equal<ComboLeg["comboId"], bigint>>;
type _ComboContractId = Assert<Equal<ComboLeg["contractId"], string>>;
type _ComboSummaryLegContractId = Assert<Equal<ComboSummaryLeg["contractId"], string>>;
type _ComboSummaryLegOutcome = Assert<
  Equal<ComboSummaryLeg["legOutcome"], "Yes" | "No" | null | undefined>
>;
type _ComboSummaryLegResolvedAt = Assert<
  Equal<ComboSummaryLeg["resolvedAt"], string | null | undefined>
>;
type _MakerRateBps = Assert<Equal<MakerRate["rebate_multiplier_bps"], number>>;
type _RewardsThreshold = Assert<
  Equal<RewardsConfig["min_payout_threshold_usd"], string | undefined>
>;
type _RewardPool = Assert<Equal<RewardEvent["daily_pool_usd"], string>>;
type _NoRewardEventAliases = Assert<
  Equal<Extract<"eventTicker" | "dailyPoolUsd" | "poolSource", keyof RewardEvent>, never>
>;
type _MarketStatus = Assert<
  Equal<
    components["schemas"]["MarketStatus"],
    "approved" | "active" | "closed" | "under_review" | "settled" | "invalid"
  >
>;
type _SportsMarket = Assert<
  Equal<
    SportsMarket,
    {
      sport: components["schemas"]["SportsMarketSport"];
      type: components["schemas"]["SportsMarketType"];
      subject: components["schemas"]["SportsMarketSubject"];
      scope: SportsMarketScope;
      metric?: components["schemas"]["SportsMarketMetric"];
    }
  >
>;
type _SportsMarketScope = Assert<
  Equal<
    SportsMarketScope,
    {
      type: components["schemas"]["SportsMarketScopeType"];
      ordinal?: number;
      start?: number;
      end?: number;
    }
  >
>;
type _EventSportsMarket = Assert<Equal<Event["sportsMarket"], SportsMarket | undefined>>;
type _NoRewardAliases = Assert<
  Equal<
    Extract<"totalVolumeUsd" | "totalRebateUsd" | "paidAt" | "createdAt", keyof Reward>,
    never
  >
>;
type _NoRewardSummaryAliases = Assert<
  Equal<Extract<"totalEarnedUsd" | "firstPayoutDate" | "lastPayoutDate", keyof RewardSummary>, never>
>;
type _PlaceOrderBody = Assert<
  Equal<PredictionMarketOperationTypes["placeOrder"]["body"], components["schemas"]["OrderRequest"]>
>;
type _PlaceOrderResponse = Assert<
  Equal<
    PredictionMarketOperationTypes["placeOrder"]["response"],
    components["schemas"]["OrderResponse"]
  >
>;
type _CancelOrderBody = Assert<
  Equal<PredictionMarketOperationTypes["cancelOrder"]["body"], { orderId: bigint | number }>
>;
type _CancelOrderResponse = Assert<
  Equal<
    PredictionMarketOperationTypes["cancelOrder"]["response"],
    { result?: string; message?: string }
  >
>;
type _GetActiveOrdersBody = Assert<
  Equal<
    PredictionMarketOperationTypes["getActiveOrders"]["body"],
    { symbol?: string; limit?: number; offset?: number } | undefined
  >
>;
type _GetOrderHistoryBody = Assert<
  Equal<
    PredictionMarketOperationTypes["getOrderHistory"]["body"],
    {
      status?: "filled" | "cancelled";
      symbol?: string;
      limit?: number;
      offset?: number;
      from?: bigint | number;
      to?: bigint | number;
    } | undefined
  >
>;
type _NoRequestBody = Assert<
  Equal<PredictionMarketOperationTypes["getEvent"]["body"], never>
>;
type _GetEventPath = Assert<
  Equal<PredictionMarketOperationTypes["getEvent"]["path"], { eventTicker: string }>
>;
type _ListEventsQuery = Assert<
  Equal<
    PredictionMarketOperationTypes["listEvents"]["query"],
    | {
        status?: components["schemas"]["MarketStatus"][];
        category?: string[];
        sport?: components["schemas"]["SportsMarketSport"][];
        sports_market_type?: components["schemas"]["SportsMarketType"][];
        sports_market_subject?: components["schemas"]["SportsMarketSubject"][];
        sports_market_scope?: components["schemas"]["SportsMarketScopeType"][];
        sports_market_metric?: components["schemas"]["SportsMarketMetric"][];
        search?: string;
        limit?: number;
        offset?: number;
      }
    | undefined
  >
>;
type _RestMethods = Assert<
  Equal<
    keyof PredictionMarketsRest,
    | "getComboByInstrumentSymbol"
    | "listEvents"
    | "getEvent"
    | "getEventStrike"
    | "listNewlyListedEvents"
    | "listRecentlySettledEvents"
    | "listUpcomingEvents"
    | "getCategories"
    | "getPredictionMarketDailyVolume"
    | "getPredictionMarketHourlyVolume"
    | "getPredictionMarketsTerms"
    | "getLiquidityRewardsConfig"
    | "getMakerRebateRates"
    | "listCombos"
    | "listLiquidityRewardsEvents"
    | "getPredictionMarketsTermsStatus"
    | "acceptPredictionMarketsTerms"
    | "createCombo"
    | "placeOrder"
    | "placeOrderBatch"
    | "cancelOrder"
    | "cancelOrderBatch"
    | "getActiveOrders"
    | "getOrderHistory"
    | "getPositions"
    | "getSettledPositions"
    | "getVolumeMetrics"
    | "listMakerRebatePayouts"
    | "getMakerRebateLifetimeSummary"
    | "getLiquidityRewardsDailySummary"
    | "getLiquidityRewardsLifetimeSummary"
  >
>;
type _TermsStatusArgs = Assert<
  Equal<Parameters<PredictionMarketsRest["getPredictionMarketsTermsStatus"]>, []>
>;
type _AcceptTermsArgs = Assert<
  Equal<Parameters<PredictionMarketsRest["acceptPredictionMarketsTerms"]>, []>
>;
type _PlaceOrderArgs = Assert<
  Equal<
    Parameters<PredictionMarketsRest["placeOrder"]>,
    [body: PredictionMarketOperationTypes["placeOrder"]["body"]]
  >
>;
type _CreateComboArgs = Assert<
  Equal<
    Parameters<PredictionMarketsRest["createCombo"]>,
    [body: PredictionMarketOperationTypes["createCombo"]["body"]]
  >
>;
type _CreateComboResult = Assert<
  Equal<
    Awaited<ReturnType<PredictionMarketsRest["createCombo"]>>,
    PredictionMarketOperationTypes["createCombo"]["response"]
  >
>;
type _PlaceBatchArgs = Assert<
  Equal<
    Parameters<PredictionMarketsRest["placeOrderBatch"]>,
    [body: PredictionMarketOperationTypes["placeOrderBatch"]["body"]]
  >
>;
type _CancelOrderArgs = Assert<
  Equal<
    Parameters<PredictionMarketsRest["cancelOrder"]>,
    [body: PredictionMarketOperationTypes["cancelOrder"]["body"]]
  >
>;
type _CancelBatchArgs = Assert<
  Equal<
    Parameters<PredictionMarketsRest["cancelOrderBatch"]>,
    [body: PredictionMarketOperationTypes["cancelOrderBatch"]["body"]]
  >
>;
type _ActiveOrdersArgs = Assert<
  Equal<
    Parameters<PredictionMarketsRest["getActiveOrders"]>,
    [body?: PredictionMarketOperationTypes["getActiveOrders"]["body"]]
  >
>;
type _OrderHistoryResult = Assert<
  Equal<
    Awaited<ReturnType<PredictionMarketsRest["getOrderHistory"]>>,
    PredictionMarketOperationTypes["getOrderHistory"]["response"]
  >
>;
type _PositionsArgs = Assert<
  Equal<
    Parameters<PredictionMarketsRest["getPositions"]>,
    [query?: PredictionMarketOperationTypes["getPositions"]["query"]]
  >
>;
type _SettledPositionsArgs = Assert<
  Equal<
    Parameters<PredictionMarketsRest["getSettledPositions"]>,
    [query?: PredictionMarketOperationTypes["getSettledPositions"]["query"]]
  >
>;
type _VolumeMetricsArgs = Assert<
  Equal<
    Parameters<PredictionMarketsRest["getVolumeMetrics"]>,
    [body: PredictionMarketOperationTypes["getVolumeMetrics"]["body"]]
  >
>;
type _PositionsResult = Assert<
  Equal<
    Awaited<ReturnType<PredictionMarketsRest["getPositions"]>>,
    PredictionMarketOperationTypes["getPositions"]["response"]
  >
>;
type _SettledPositionsResult = Assert<
  Equal<
    Awaited<ReturnType<PredictionMarketsRest["getSettledPositions"]>>,
    PredictionMarketOperationTypes["getSettledPositions"]["response"]
  >
>;
type _VolumeMetricsResult = Assert<
  Equal<
    Awaited<ReturnType<PredictionMarketsRest["getVolumeMetrics"]>>,
    PredictionMarketOperationTypes["getVolumeMetrics"]["response"]
  >
>;
type _MakerRebatePayoutsArgs = Assert<
  Equal<
    Parameters<PredictionMarketsRest["listMakerRebatePayouts"]>,
    [query?: PredictionMarketOperationTypes["listMakerRebatePayouts"]["query"]]
  >
>;
type _MakerRebatePayoutsResult = Assert<
  Equal<
    Awaited<ReturnType<PredictionMarketsRest["listMakerRebatePayouts"]>>,
    PredictionMarketOperationTypes["listMakerRebatePayouts"]["response"]
  >
>;
type _MakerRebateLifetimeArgs = Assert<
  Equal<
    Parameters<PredictionMarketsRest["getMakerRebateLifetimeSummary"]>,
    [query?: PredictionMarketOperationTypes["getMakerRebateLifetimeSummary"]["query"]]
  >
>;
type _MakerRebateLifetimeResult = Assert<
  Equal<
    Awaited<ReturnType<PredictionMarketsRest["getMakerRebateLifetimeSummary"]>>,
    PredictionMarketOperationTypes["getMakerRebateLifetimeSummary"]["response"]
  >
>;
type _LiquidityRewardsDailyArgs = Assert<
  Equal<
    Parameters<PredictionMarketsRest["getLiquidityRewardsDailySummary"]>,
    [query: PredictionMarketOperationTypes["getLiquidityRewardsDailySummary"]["query"]]
  >
>;
type _LiquidityRewardsDailyResult = Assert<
  Equal<
    Awaited<ReturnType<PredictionMarketsRest["getLiquidityRewardsDailySummary"]>>,
    PredictionMarketOperationTypes["getLiquidityRewardsDailySummary"]["response"]
  >
>;
type _LiquidityRewardsLifetimeArgs = Assert<
  Equal<
    Parameters<PredictionMarketsRest["getLiquidityRewardsLifetimeSummary"]>,
    [query?: PredictionMarketOperationTypes["getLiquidityRewardsLifetimeSummary"]["query"]]
  >
>;
type _LiquidityRewardsLifetimeResult = Assert<
  Equal<
    Awaited<ReturnType<PredictionMarketsRest["getLiquidityRewardsLifetimeSummary"]>>,
    PredictionMarketOperationTypes["getLiquidityRewardsLifetimeSummary"]["response"]
  >
>;
type _ListEventsInput = Assert<
  Equal<
    Parameters<PredictionMarketsRest["listEvents"]>[0],
    PredictionMarketOperationTypes["listEvents"]["query"]
  >
>;
type _GetEventInput = Assert<
  Equal<
    Parameters<PredictionMarketsRest["getEvent"]>,
    [path: PredictionMarketOperationTypes["getEvent"]["path"]]
  >
>;
type _GetEventResult = Assert<
  Equal<
    Awaited<ReturnType<PredictionMarketsRest["getEvent"]>>,
    PredictionMarketOperationTypes["getEvent"]["response"]
  >
>;
type _StrikeMoney = Assert<
  Equal<
    PredictionMarketOperationTypes["getEventStrike"]["response"]["value"],
    string | null | undefined
  >
>;
type _TermsInput = Assert<
  Equal<Parameters<PredictionMarketsRest["getPredictionMarketsTerms"]>, []>
>;
type _PredictionMarketDailyVolumeInput = Assert<
  Equal<
    Parameters<PredictionMarketsRest["getPredictionMarketDailyVolume"]>,
    [path: PredictionMarketOperationTypes["getPredictionMarketDailyVolume"]["path"]]
  >
>;
type _PredictionMarketDailyVolumeResult = Assert<
  Equal<
    Awaited<ReturnType<PredictionMarketsRest["getPredictionMarketDailyVolume"]>>,
    PredictionMarketOperationTypes["getPredictionMarketDailyVolume"]["response"]
  >
>;
type _PredictionMarketHourlyVolumeInput = Assert<
  Equal<
    Parameters<PredictionMarketsRest["getPredictionMarketHourlyVolume"]>,
    [path: PredictionMarketOperationTypes["getPredictionMarketHourlyVolume"]["path"]]
  >
>;
type _PredictionMarketHourlyVolumeResult = Assert<
  Equal<
    Awaited<ReturnType<PredictionMarketsRest["getPredictionMarketHourlyVolume"]>>,
    PredictionMarketOperationTypes["getPredictionMarketHourlyVolume"]["response"]
  >
>;
type _ListCombosResult = Assert<
  Equal<
    Awaited<ReturnType<PredictionMarketsRest["listCombos"]>>,
    PredictionMarketOperationTypes["listCombos"]["response"]
  >
>;
type _ComboInput = Assert<
  Equal<
    Parameters<PredictionMarketsRest["getComboByInstrumentSymbol"]>[0],
    PredictionMarketOperationTypes["getComboByInstrumentSymbol"]["path"]
  >
>;
type _MakerRatesResult = Assert<
  Equal<
    Awaited<ReturnType<PredictionMarketsRest["getMakerRebateRates"]>>,
    PredictionMarketOperationTypes["getMakerRebateRates"]["response"]
  >
>;
type _RewardsConfigArgs = Assert<
  Equal<Parameters<PredictionMarketsRest["getLiquidityRewardsConfig"]>, []>
>;
type _RewardsEventsResult = Assert<
  Equal<
    Awaited<ReturnType<PredictionMarketsRest["listLiquidityRewardsEvents"]>>,
    PredictionMarketOperationTypes["listLiquidityRewardsEvents"]["response"]
  >
>;

test("generated operation metadata describes every prediction-market operation", () => {
  const entries = Object.entries(PREDICTION_MARKET_OPERATIONS);
  assert.equal(entries.length, 31);
  assert.equal(new Set(entries.map(([operationId]) => operationId)).size, 31);
  assert.equal(entries.filter(([, operation]) => operation.access === "public").length, 15);
  assert.equal(entries.filter(([, operation]) => operation.access === "authenticated").length, 16);

  const metadataKeys = [
    "access", "headers", "method", "operation", "parameters", "path", "requestBody", "requestBodyRequired",
    "requestInt64Paths", "responseContentTypes", "responseInt64Paths", "responseMode", "retryable", "successStatuses",
  ];
  for (const [, operation] of entries) assert.deepEqual(Object.keys(operation).sort(), metadataKeys);

  assert.deepEqual(PREDICTION_MARKET_OPERATIONS.listEvents, {
    responseMode: "json",
    operation: "predictionMarkets.listEvents",
    method: "get",
    path: "/v1/prediction-markets/events",
    access: "public",
    parameters: [
      { name: "status", in: "query", required: false, style: "form", explode: true, shape: "array", allowReserved: false },
      { name: "category", in: "query", required: false, style: "form", explode: true, shape: "array", allowReserved: false },
      { name: "sport", in: "query", required: false, style: "form", explode: true, shape: "array", allowReserved: false },
      { name: "sports_market_type", in: "query", required: false, style: "form", explode: true, shape: "array", allowReserved: false },
      { name: "sports_market_subject", in: "query", required: false, style: "form", explode: true, shape: "array", allowReserved: false },
      { name: "sports_market_scope", in: "query", required: false, style: "form", explode: true, shape: "array", allowReserved: false },
      { name: "sports_market_metric", in: "query", required: false, style: "form", explode: true, shape: "array", allowReserved: false },
      { name: "search", in: "query", required: false, style: "form", explode: true, shape: "scalar", allowReserved: false },
      { name: "limit", in: "query", required: false, style: "form", explode: true, shape: "scalar", allowReserved: false },
      { name: "offset", in: "query", required: false, style: "form", explode: true, shape: "scalar", allowReserved: false },
    ],
    headers: [],
    requestBody: false,
    requestBodyRequired: false,
    successStatuses: [200],
    responseContentTypes: ["application/json"],
    responseInt64Paths: [],
    requestInt64Paths: { body: [], path: [], query: [] },
    retryable: true,
  });
  assert.deepEqual(PREDICTION_MARKET_OPERATIONS.getComboByInstrumentSymbol.parameters, [
    { name: "instrumentSymbol", in: "path", required: true, style: "simple", explode: false },
  ]);
  assert.deepEqual(PREDICTION_MARKET_OPERATIONS.getPredictionMarketDailyVolume, {
    responseMode: "json",
    operation: "predictionMarkets.getPredictionMarketDailyVolume",
    method: "get",
    path: "/v1/prediction-markets/volume/{date}",
    access: "public",
    parameters: [{ name: "date", in: "path", required: true, style: "simple", explode: false }],
    headers: [],
    requestBody: false,
    requestBodyRequired: false,
    successStatuses: [200],
    responseContentTypes: ["application/json"],
    responseInt64Paths: [],
    requestInt64Paths: { body: [], path: [], query: [] },
    retryable: true,
  });
  assert.deepEqual(PREDICTION_MARKET_OPERATIONS.getPredictionMarketHourlyVolume, {
    responseMode: "json",
    operation: "predictionMarkets.getPredictionMarketHourlyVolume",
    method: "get",
    path: "/v1/prediction-markets/volume/{date}/hourly",
    access: "public",
    parameters: [{ name: "date", in: "path", required: true, style: "simple", explode: false }],
    headers: [],
    requestBody: false,
    requestBodyRequired: false,
    successStatuses: [200],
    responseContentTypes: ["application/json"],
    responseInt64Paths: [],
    requestInt64Paths: { body: [], path: [], query: [] },
    retryable: true,
  });
  assert.deepEqual(PREDICTION_MARKET_OPERATIONS.placeOrder, {
    responseMode: "json",
    operation: "predictionMarkets.placeOrder",
    method: "post",
    path: "/v1/prediction-markets/order",
    access: "authenticated",
    parameters: [],
    headers: [],
    requestBody: true,
    requestBodyRequired: true,
    successStatuses: [201],
    responseContentTypes: ["application/json"],
    responseInt64Paths: [["orderId"]],
    requestInt64Paths: { body: [], path: [], query: [] },
    retryable: false,
  });
  assert.deepEqual(PREDICTION_MARKET_OPERATIONS.cancelOrder, {
    responseMode: "json",
    operation: "predictionMarkets.cancelOrder",
    method: "post",
    path: "/v1/prediction-markets/order/cancel",
    access: "authenticated",
    parameters: [],
    headers: [],
    requestBody: true,
    requestBodyRequired: true,
    successStatuses: [200],
    responseContentTypes: ["application/json"],
    responseInt64Paths: [],
    requestInt64Paths: { body: [{ path: ["orderId"] }], path: [], query: [] },
    retryable: false,
  });
  assert.deepEqual(PREDICTION_MARKET_OPERATIONS.listCombos.responseInt64Paths, [
    ["combos", "*", "legs", "*", "comboId"],
  ]);
  assert.deepEqual(PREDICTION_MARKET_OPERATIONS.createCombo, {
    responseMode: "json",
    operation: "predictionMarkets.createCombo",
    method: "post",
    path: "/v1/prediction-markets/combos",
    access: "authenticated",
    parameters: [],
    headers: [],
    requestBody: true,
    requestBodyRequired: true,
    successStatuses: [200, 201],
    responseContentTypes: ["application/json"],
    responseInt64Paths: [["combo", "id"], ["combo", "instrumentId"], ["combo", "legs", "*", "comboId"]],
    requestInt64Paths: { body: [], path: [], query: [] },
    retryable: false,
  });
  assert.equal(PREDICTION_MARKET_OPERATIONS.getActiveOrders.requestBody, true);
  assert.equal(PREDICTION_MARKET_OPERATIONS.getActiveOrders.requestBodyRequired, false);
  assert.equal(PREDICTION_MARKET_OPERATIONS.getOrderHistory.requestBodyRequired, false);

  assert.doesNotMatch(
    JSON.stringify(PREDICTION_MARKET_OPERATIONS),
    /hmac|oauth|signature|apiKey/i,
  );
});

test("OpenAPI, operation manifest, and REST wrappers contain the same 31 unique operations", async () => {
  const sdkDir = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
  const localSpec = resolve(sdkDir, "../../apis/prediction-markets.yaml");
  const specText = existsSync(localSpec)
    ? readFileSync(localSpec, "utf8")
    : await fetch("https://developer.gemini.com/specs/openapi/prediction-markets.yaml").then((r) => r.text());
  const document = parse(specText) as {
    paths?: Record<string, Record<string, { operationId?: unknown } | undefined>>;
  };
  const methods = ["get", "put", "post", "delete", "options", "head", "patch", "trace"];
  const specIds = Object.values(document.paths ?? {}).flatMap((pathItem) =>
    methods.flatMap((method) => {
      const operationId = pathItem[method]?.operationId;
      if (operationId === undefined) return [];
      assert.equal(typeof operationId, "string");
      return [operationId as string];
    })
  );
  const manifestIds = Object.keys(PREDICTION_MARKET_OPERATIONS);
  const wrapperIds = Object.getOwnPropertyNames(PredictionMarketsRest.prototype)
    .filter((name) => name !== "constructor");

  assert.equal(specIds.length, 31);
  assert.equal(new Set(specIds).size, specIds.length);
  const expectedIds = [...specIds].sort();
  assert.deepEqual([...manifestIds].sort(), expectedIds);
  assert.deepEqual([...wrapperIds].sort(), expectedIds);
});

test("generator rejects multiple 2xx JSON responses even when one omits its schema", (t) => {
  const sdkDir = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
  const directory = mkdtempSync(join(tmpdir(), "pm-generator-invalid-"));
  const specPath = join(directory, "spec.yaml");
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  writeFileSync(specPath, `openapi: 3.0.3
info:
  title: test
  version: 1.0.0
paths:
  /test:
    get:
      operationId: testOperation
      responses:
        "200":
          description: first
          content:
            application/json:
              schema:
                type: object
        "201":
          description: second
          content:
            application/json: {}
`);
  assert.throws(() => execFileSync(process.execPath, [
    join(sdkDir, "scripts/generate-prediction-markets.mjs"), specPath, join(directory, "output"),
  ]));
});

test("generator output is deterministic and matches committed files", (t) => {
  const sdkDir = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
  const generatorPath = join(sdkDir, "scripts/generate-prediction-markets.mjs");
  const localSpec = resolve(sdkDir, "../../apis/prediction-markets.yaml");
  const specPath = existsSync(localSpec) ? localSpec : "https://developer.gemini.com/specs/openapi/prediction-markets.yaml";
  const generatedDir = join(sdkDir, "src/generated");
  const first = mkdtempSync(join(tmpdir(), "pm-generator-first-"));
  const second = mkdtempSync(join(tmpdir(), "pm-generator-second-"));

  t.after(() => {
    rmSync(first, { recursive: true, force: true });
    rmSync(second, { recursive: true, force: true });
  });

  execFileSync(process.execPath, [generatorPath, specPath, first]);
  execFileSync(process.execPath, [generatorPath, specPath, second]);

  for (const filename of ["models.ts", "operations.ts", "rest.ts"]) {
    const firstBytes = readFileSync(join(first, filename));
    const secondBytes = readFileSync(join(second, filename));
    const committedBytes = readFileSync(join(generatedDir, filename));
    assert.deepEqual(firstBytes, secondBytes);
    assert.deepEqual(firstBytes, committedBytes);
  }
});
