import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import type { components } from "../../../generated/market-data/models.js";
import type { RestFileResponse } from "../../../transport/http.js";
import type { RequestOptions } from "../../../utils/deadline.js";
import {
  MARKET_DATA_OPERATIONS,
  type MarketDataOperationTypes,
} from "../../../generated/market-data/operations.js";
import { MarketDataRest } from "../../../generated/market-data/rest.js";

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
    { limit_bids?: number; limit_asks?: number }
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
    }
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
    | "getNextFundingTimestamp"
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
    | "getNextFundingTimestamp"
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
type _ListSymbolsArgs = Assert<Equal<Parameters<MarketDataRest["listSymbols"]>, [requestOptions?: RequestOptions]>>;
type _TickerArgs = Assert<
  Parameters<MarketDataRest["getTicker"]>[0] extends MarketDataOperationTypes["getTicker"]["path"] ? true : false
>;
type _BookArgs = Assert<
  Parameters<MarketDataRest["getCurrentOrderBook"]>[0] extends MarketDataOperationTypes["getCurrentOrderBook"]["input"]
    ? true
    : false
>;
type _TradesArgs = Assert<
  Parameters<MarketDataRest["listTrades"]>[0] extends MarketDataOperationTypes["listTrades"]["input"]
    ? true
    : false
>;
type _FundingReportArgs = Assert<
  Parameters<MarketDataRest["getFundingAmountReportFile"]>[0] extends MarketDataOperationTypes["getFundingAmountReportFile"]["query"] ? true : false
>;
type _TickerResult = Assert<
  Equal<Awaited<ReturnType<MarketDataRest["getTicker"]>>, MarketDataOperationTypes["getTicker"]["response"]>
>;

test("generated operation metadata describes every Market Data operation", () => {
  const entries = Object.entries(MARKET_DATA_OPERATIONS);
  assert.equal(entries.length, 16);
  assert.equal(new Set(entries.map(([operationId]) => operationId)).size, 16);
  assert.equal(entries.filter(([, operation]) => operation.access === "authenticated").length, 3);
  assert.equal(entries.filter(([, operation]) => operation.access === "public").length, 13);

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
      { name: "symbol", in: "path", required: true, style: "simple", explode: false, valueType: "string" },
      { name: "limit_bids", in: "query", required: false, style: "form", explode: true, valueType: "number", "shape": "scalar", allowReserved: false },
      { name: "limit_asks", in: "query", required: false, style: "form", explode: true, valueType: "number", "shape": "scalar", allowReserved: false },
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
    { name: "symbol", in: "path", required: true, style: "simple", explode: false, valueType: "string" },
    { name: "timestamp", in: "query", required: false, style: "form", explode: true, valueTypes: ["string", "integer"], "shape": "scalar", allowReserved: false },
    { name: "since_tid", in: "query", required: false, style: "form", explode: true, valueType: "number", "shape": "scalar", allowReserved: false },
    { name: "limit_trades", in: "query", required: false, style: "form", explode: true, valueType: "number", "shape": "scalar", allowReserved: false },
    { name: "include_breaks", in: "query", required: false, style: "form", explode: true, valueType: "boolean", "shape": "scalar", allowReserved: false },
  ]);
  assert.deepEqual(MARKET_DATA_OPERATIONS.listCandles.parameters, [
    { name: "symbol", in: "path", required: true, style: "simple", explode: false, valueType: "string" },
    { name: "time_frame", in: "path", required: true, style: "simple", explode: false, valueType: "string" },
  ]);
  assert.deepEqual(MARKET_DATA_OPERATIONS.listCandles.responseInt64Paths, []);
  assert.deepEqual(MARKET_DATA_OPERATIONS.listDerivativeCandles.responseInt64Paths, []);
  assert.deepEqual(MARKET_DATA_OPERATIONS.getFundingAmount.parameters, [
    { name: "symbol", in: "path", required: true, style: "simple", explode: false, valueType: "string" },
  ]);
  assert.equal(MARKET_DATA_OPERATIONS.getAssetsForNetwork.access, "authenticated");
  assert.equal(MARKET_DATA_OPERATIONS.getTokenNetworkV2.access, "authenticated");
  assert.equal(MARKET_DATA_OPERATIONS.getFXRate.access, "authenticated");
});

test("Market Data generator output is deterministic and matches committed files", (t) => {
  const sdkDir = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
  const generatorPath = join(sdkDir, "scripts/generate-market-data.mjs");
  const specPath = "https://developer.gemini.com/specs/openapi/rest.yaml";
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
