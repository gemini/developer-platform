import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import type { components } from "../generated/market-data/models.js";
import type { RestFileResponse } from "../core/http.js";
import {
  MARKET_DATA_OPERATIONS,
  type MarketDataOperationTypes,
} from "../generated/market-data/operations.js";
import { MarketDataRest } from "../generated/market-data/rest.js";

type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends
  (<T>() => T extends B ? 1 : 2) ? true : false;
type Assert<T extends true> = T;

type _GetBookPath = Assert<
  Equal<MarketDataOperationTypes["getCurrentOrderBook"]["path"], { symbol: string }>
>;
type _GetBookQuery = Assert<
  Equal<
    MarketDataOperationTypes["getCurrentOrderBook"]["query"],
    { limit_bids?: number; limit_asks?: number } | undefined
  >
>;
type _ListTradesQuery = Assert<
  Equal<
    MarketDataOperationTypes["listTrades"]["query"],
    {
      timestamp?: string | bigint | number;
      since_tid?: number;
      limit_trades?: number;
      include_breaks?: boolean;
    } | undefined
  >
>;
type _ListCandlesPath = Assert<
  Equal<
    MarketDataOperationTypes["listCandles"]["path"],
    { symbol: string; time_frame: "1m" | "5m" | "15m" | "30m" | "1h" | "6h" | "1d" }
  >
>;
type _GetFundingAmountPath = Assert<
  Equal<MarketDataOperationTypes["getFundingAmount"]["path"], { symbol: string }>
>;
type _GetTickerResponse = Assert<
  Equal<MarketDataOperationTypes["getTicker"]["response"], components["schemas"]["Ticker"]>
>;
type _GetBookResponse = Assert<
  Equal<MarketDataOperationTypes["getCurrentOrderBook"]["response"], components["schemas"]["OrderBook"]>
>;
type _ListCandlesResponse = Assert<
  Equal<
    MarketDataOperationTypes["listCandles"]["response"],
    components["schemas"]["CandleResponse"]
  >
>;
type _GetFundingAmountResponse = Assert<
  Equal<
    MarketDataOperationTypes["getFundingAmount"]["response"],
    components["schemas"]["FundingAmountResponse"]
  >
>;
type _GetFXRatePath = Assert<
  Equal<
    MarketDataOperationTypes["getFXRate"]["path"],
    { symbol: string; timestamp: string | bigint | number }
  >
>;
type _MarketDataRestMethods = Assert<
  Equal<
    keyof MarketDataRest,
    | "listSymbols"
    | "getSymbolDetails"
    | "getAssetsForNetwork"
    | "getTokenNetworkV2"
    | "getTicker"
    | "listFeePromos"
    | "getCurrentOrderBook"
    | "listTrades"
    | "listPrices"
    | "getFundingAmount"
    | "getFundingAmountReportFile"
    | "getTickerV2"
    | "listCandles"
    | "listDerivativeCandles"
    | "getFXRate"
  >
>;
type _NoMarketDataBodies = Assert<
  Equal<MarketDataOperationTypes[keyof MarketDataOperationTypes]["body"], never>
>;
type _FundingReportResponse = Assert<
  Equal<MarketDataOperationTypes["getFundingAmountReportFile"]["response"], RestFileResponse>
>;
type _RestMethods = Assert<
  Equal<
    keyof MarketDataRest,
    | "getAssetsForNetwork"
    | "getCurrentOrderBook"
    | "getFXRate"
    | "getFundingAmount"
    | "getFundingAmountReportFile"
    | "getSymbolDetails"
    | "getTicker"
    | "getTickerV2"
    | "getTokenNetworkV2"
    | "listCandles"
    | "listDerivativeCandles"
    | "listFeePromos"
    | "listPrices"
    | "listSymbols"
    | "listTrades"
  >
>;
type _ListSymbolsArgs = Assert<Equal<Parameters<MarketDataRest["listSymbols"]>, []>>;
type _TickerArgs = Assert<
  Equal<Parameters<MarketDataRest["getTicker"]>, [path: MarketDataOperationTypes["getTicker"]["path"]]>
>;
type _BookArgs = Assert<
  Equal<
    Parameters<MarketDataRest["getCurrentOrderBook"]>,
    [
      path: MarketDataOperationTypes["getCurrentOrderBook"]["path"],
      query?: MarketDataOperationTypes["getCurrentOrderBook"]["query"],
    ]
  >
>;
type _TradesArgs = Assert<
  Equal<
    Parameters<MarketDataRest["listTrades"]>,
    [
      path: MarketDataOperationTypes["listTrades"]["path"],
      query?: MarketDataOperationTypes["listTrades"]["query"],
    ]
  >
>;
type _FundingReportArgs = Assert<
  Equal<
    Parameters<MarketDataRest["getFundingAmountReportFile"]>,
    [query: MarketDataOperationTypes["getFundingAmountReportFile"]["query"]]
  >
>;
type _TickerResult = Assert<
  Equal<Awaited<ReturnType<MarketDataRest["getTicker"]>>, MarketDataOperationTypes["getTicker"]["response"]>
>;

test("generated operation metadata describes every Market Data operation", () => {
  const entries = Object.entries(MARKET_DATA_OPERATIONS);
  assert.equal(entries.length, 15);
  assert.equal(new Set(entries.map(([operationId]) => operationId)).size, 15);
  assert.equal(entries.filter(([, operation]) => operation.access === "authenticated").length, 3);
  assert.equal(entries.filter(([, operation]) => operation.access === "public").length, 12);

  const metadataKeys = [
    "access", "headers", "method", "operation", "parameters", "path", "requestBody", "requestBodyRequired",
    "requestInt64Paths", "responseContentTypes", "responseInt64Paths", "responseMode", "retryable", "successStatuses",
  ];
  for (const [, operation] of entries) {
    assert.deepEqual(Object.keys(operation).sort(), metadataKeys);
    assert.equal(operation.method, "get");
    assert.deepEqual(operation.headers, []);
    assert.equal(operation.requestBody, false);
    assert.equal(operation.requestBodyRequired, false);
  }

  assert.deepEqual(MARKET_DATA_OPERATIONS.getCurrentOrderBook, {
    responseMode: "json",
    operation: "marketData.getCurrentOrderBook",
    method: "get",
    path: "/v1/book/{symbol}",
    access: "public",
    parameters: [
      { name: "symbol", in: "path", required: true, style: "simple", explode: false },
      { name: "limit_bids", in: "query", required: false, style: "form", explode: true, shape: "scalar", allowReserved: false },
      { name: "limit_asks", in: "query", required: false, style: "form", explode: true, shape: "scalar", allowReserved: false },
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
  assert.deepEqual(MARKET_DATA_OPERATIONS.getFundingAmountReportFile.responseContentTypes, [
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "text/csv",
  ]);
  assert.equal(MARKET_DATA_OPERATIONS.getFundingAmountReportFile.responseMode, "file");
  assert.deepEqual(MARKET_DATA_OPERATIONS.listTrades.parameters, [
    { name: "symbol", in: "path", required: true, style: "simple", explode: false },
    { name: "timestamp", in: "query", required: false, style: "form", explode: true, shape: "scalar", allowReserved: false },
    { name: "since_tid", in: "query", required: false, style: "form", explode: true, shape: "scalar", allowReserved: false },
    { name: "limit_trades", in: "query", required: false, style: "form", explode: true, shape: "scalar", allowReserved: false },
    { name: "include_breaks", in: "query", required: false, style: "form", explode: true, shape: "scalar", allowReserved: false },
  ]);
  assert.deepEqual(MARKET_DATA_OPERATIONS.listCandles.parameters, [
    { name: "symbol", in: "path", required: true, style: "simple", explode: false },
    { name: "time_frame", in: "path", required: true, style: "simple", explode: false },
  ]);
  assert.deepEqual(MARKET_DATA_OPERATIONS.listCandles.responseInt64Paths, []);
  assert.deepEqual(MARKET_DATA_OPERATIONS.listDerivativeCandles.responseInt64Paths, []);
  assert.deepEqual(MARKET_DATA_OPERATIONS.getFundingAmount.parameters, [
    { name: "symbol", in: "path", required: true, style: "simple", explode: false },
  ]);
  assert.equal(MARKET_DATA_OPERATIONS.getAssetsForNetwork.access, "authenticated");
  assert.equal(MARKET_DATA_OPERATIONS.getTokenNetworkV2.access, "authenticated");
  assert.equal(MARKET_DATA_OPERATIONS.getFXRate.access, "authenticated");
});

test("Market Data generator output is deterministic and matches committed files", (t) => {
  const sdkDir = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
  const generatorPath = join(sdkDir, "scripts/generate-market-data.mjs");
  const localSpec = resolve(sdkDir, "../../apis/rest.yaml");
  const specPath = existsSync(localSpec) ? localSpec : "https://developer.gemini.com/specs/openapi/rest.yaml";
  const generatedDir = join(sdkDir, "src/generated/market-data");
  const first = mkdtempSync(join(tmpdir(), "market-data-generator-first-"));
  const second = mkdtempSync(join(tmpdir(), "market-data-generator-second-"));

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
