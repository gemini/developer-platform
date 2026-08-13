import { existsSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  discoverOperationInventory,
  generateOpenApiRestTypes,
  loadOpenApiDocument,
  renderRestClient,
} from "./openapi-rest-generator.mjs";
import { ownedOperationsForModule } from "./rest-operation-ownership.mjs";

const PUBLISHED_SPEC_URL = "https://developer.gemini.com/specs/openapi/prediction-markets.yaml";
const BANNER = "// Generated from prediction-markets.yaml. Do not edit.\n\n";
const scriptDir = dirname(fileURLToPath(import.meta.url));
const localSpec = resolve(scriptDir, "../../../apis/prediction-markets.yaml");
const specPath = process.argv[2] ?? (existsSync(localSpec) ? localSpec : PUBLISHED_SPEC_URL);
const outputDir = resolve(process.argv[3] ?? resolve(scriptDir, "../src/generated"));

const document = await loadOpenApiDocument(specPath);
const inventory = discoverOperationInventory(document, { spec: "predictionMarkets" });
const ownedOperations = ownedOperationsForModule(
  inventory,
  { module: "predictionMarkets", spec: "predictionMarkets" },
);
const { operations } = await generateOpenApiRestTypes({
  specPath,
  outputDir,
  banner: BANNER,
  includeOperationIds: ownedOperations.length > 0
    ? ownedOperations.map((operation) => operation.operationId)
    : undefined,
  operationResponseModes: Object.fromEntries(ownedOperations.map((operation) => [
    operation.operationId,
    operation.responseMode,
  ])),
  operationsConstName: "PREDICTION_MARKET_OPERATIONS",
  operationIdTypeName: "PredictionMarketOperationId",
  operationTypesName: "PredictionMarketOperationTypes",
  operationNamespace: "predictionMarkets",
});
const methodNames = new Map(ownedOperations.map((operation) => [operation.operationId, operation.methodName]));

await writeFile(resolve(outputDir, "rest.ts"), renderRestClient(
  operations.map((operation) => ({
    ...operation,
    methodName: methodNames.get(operation.operationId),
  })),
  {
    banner: BANNER,
    className: "PredictionMarketsRest",
    operationsConstName: "PREDICTION_MARKET_OPERATIONS",
    operationTypesName: "PredictionMarketOperationTypes",
    operationsImportPath: "./operations.js",
    transportImportPath: "../core/http.js",
    executorImportPath: "../core/rest-operation.js",
    deadlineImportPath: "../core/deadline.js",
  },
));
