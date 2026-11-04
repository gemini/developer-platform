import assert from "node:assert/strict";
import test from "node:test";

import { SdkError, ResyncRequiredError } from "../../../errors.js";
import * as sdk from "../../../server/index.js";
import { createClient as createBrowserClient } from "../../../browser/index.js";
import type {
  PredictionMarketsPaths,
  PredictionMarketsComponents,
  PredictionMarketsOpenApiOperations,
  PredictionMarketOperationTypes,
  PredictionMarketOperationId,
  MarketDataOperationTypes,
  MarketDataOperationId,
} from "../../../server/index.js";
import { ConsoleLogger, NOOP_LOGGER } from "../../../observability/logging.js";
import { boundaryValueKind } from "../../../utils/boundary-value.js";
import type { DiagnosticEvent } from "../../../observability/diagnostics.js";

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
function captureConsole(fn: () => void) {
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

test("NOOP_LOGGER emits nothing", () => {
  const logger = NOOP_LOGGER;
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

test("implementation helpers are not part of the package barrel", () => {
  assert.equal(Object.hasOwn(sdk, "parseLosslessJson"), false);
  assert.equal(Object.hasOwn(sdk, "HttpTransport"), false);
  assert.equal(Object.hasOwn(sdk, "GeminiMarkets"), false);
  assert.equal(Object.hasOwn(sdk, "GeminiWebSocket"), false);
  assert.equal(Object.hasOwn(sdk, "WebSocketSession"), false);
});

test("browser createClient is asynchronous and returns the public facade", async () => {
  const client = await createBrowserClient({ env: "sandbox" });
  assert.ok(client.marketData);
  assert.ok(client.account);
  assert.ok(client.staking);
  assert.ok(client.transfers);
  assert.equal(boundaryValueKind(client.websocket.public.trades), "function");
  const first = client.generateClientOrderId();
  const second = client.generateClientOrderId("test");
  assert.match(first, /^gem_[A-Za-z0-9_-]{16}$/);
  assert.match(second, /^test_[A-Za-z0-9_-]{16}$/);
  assert.notEqual(first, second);
  client.close();
});

test("generated prediction market contracts are reachable from the package barrel", () => {
  assert.equal(knownPredictionMarketOperation, "placeOrder");
  assert.equal(sdk.PREDICTION_MARKET_OPERATIONS.placeOrder.method, "post");
  assert.equal(Object.hasOwn(sdk, "PredictionMarketsRest"), false);
});

test("generated Market Data contracts are reachable from the package barrel", () => {
  assert.equal(knownMarketDataOperation, "getTicker");
  assert.equal(sdk.MARKET_DATA_OPERATIONS.getTicker.method, "get");
  assert.equal(Object.hasOwn(sdk, "MarketDataRest"), false);
  assert.equal(Object.hasOwn(sdk, "MarketDataClient"), false);
});
