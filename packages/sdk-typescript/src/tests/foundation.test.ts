import assert from "node:assert/strict";
import test from "node:test";

import { SdkError, ResyncRequiredError } from "../errors.js";
import * as sdk from "../server/index.js";
import type {
  PredictionMarketsPaths,
  PredictionMarketsComponents,
  PredictionMarketsOpenApiOperations,
  PredictionMarketOperationTypes,
  PredictionMarketOperationId,
  MarketDataOperationTypes,
  MarketDataOperationId,
} from "../server/index.js";
import { ConsoleLogger, NoopLogger } from "../logging.js";
import type { DiagnosticEvent } from "../diagnostics.js";

const generatedContractTypes: [
  PredictionMarketsPaths,
  PredictionMarketsComponents,
  PredictionMarketsOpenApiOperations,
  PredictionMarketOperationTypes,
  MarketDataOperationTypes,
] | undefined = undefined;
void generatedContractTypes;

const knownPredictionMarketOperation: PredictionMarketOperationId = "placeOrder";
// @ts-expect-error Unknown operation IDs must not be accepted.
const unknownPredictionMarketOperation: PredictionMarketOperationId = "unknownOperation";
void unknownPredictionMarketOperation;
const knownMarketDataOperation: MarketDataOperationId = "getTicker";
const knownMarketDataFileOperation: MarketDataOperationId = "getFundingAmountReportFile";
void knownMarketDataFileOperation;

// Run fn with console.log/error replaced by counters; restore afterward.
function captureConsole(fn: () => void): { logs: number; errors: number } {
  const origLog = console.log;
  const origError = console.error;
  let logs = 0;
  let errors = 0;
  console.log = () => {
    logs++;
  };
  console.error = () => {
    errors++;
  };
  try {
    fn();
  } finally {
    console.log = origLog;
    console.error = origError;
  }
  return { logs, errors };
}

test("ConsoleLogger drops messages below minLevel", () => {
  const logger = new ConsoleLogger({ minLevel: "error" });
  const event: DiagnosticEvent = { level: "info", component: "rest", name: "test.info" };
  const errorEvent: DiagnosticEvent = { level: "error", component: "rest", name: "test.error" };
  const { logs, errors } = captureConsole(() => {
    logger.info(event.name, event);
    logger.error(errorEvent.name, errorEvent);
  });
  assert.equal(logs, 0, "info must be dropped when minLevel is error");
  assert.equal(errors, 1, "error must be emitted");
});

test("NoopLogger emits nothing", () => {
  const logger = new NoopLogger();
  const event = (level: DiagnosticEvent["level"]): DiagnosticEvent => ({ level, component: "rest", name: `test.${level}` });
  const { logs, errors } = captureConsole(() => {
    logger.debug("test.debug", event("debug"));
    logger.info("test.info", event("info"));
    logger.warn("test.warn", event("warn"));
    logger.error("test.error", event("error"));
  });
  assert.equal(logs, 0);
  assert.equal(errors, 0);
});

test("ResyncRequiredError is an SdkError and carries the gap ids", () => {
  const err = new ResyncRequiredError(1n, 5n);
  assert.ok(err instanceof SdkError);
  assert.ok(err instanceof Error);
  assert.equal(err.name, "ResyncRequiredError");
  assert.equal(err.lastUpdateId, 1n);
  assert.equal(err.firstUpdateId, 5n);
});

test("parseLosslessJson is reachable from the package barrel", () => {
  // The root-only exports map means anything public must be re-exported from index.
  const exported = (sdk as Record<string, unknown>).parseLosslessJson;
  assert.equal(typeof exported, "function", "parser must be exported from the barrel");
});

test("generated prediction market contracts are reachable from the package barrel", () => {
  assert.equal(knownPredictionMarketOperation, "placeOrder");
  assert.equal(sdk.PREDICTION_MARKET_OPERATIONS.placeOrder.method, "post");
  assert.equal(typeof sdk.PredictionMarketsRest, "function");
});

test("generated Market Data contracts are reachable from the package barrel", () => {
  assert.equal(knownMarketDataOperation, "getTicker");
  assert.equal(sdk.MARKET_DATA_OPERATIONS.getTicker.method, "get");
  assert.equal(typeof sdk.MarketDataRest, "function");
  assert.equal(typeof sdk.MarketDataClient, "function");
});
