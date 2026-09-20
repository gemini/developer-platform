import { writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  discoverOperationInventory,
  generateOpenApiRestTypes,
  loadOpenApiDocument,
  renderRestClient,
} from "./openapi-rest-generator.mjs";
import { ownedOperationsForModule } from "./rest-operation-ownership.mjs";

const BANNER = "// Generated from prediction-markets.yaml. Do not edit.\n\n";
const scriptDir = dirname(fileURLToPath(import.meta.url));

export async function generatePredictionMarkets({ specPath, outputDir }) {
  const document = await loadOpenApiDocument(specPath);
  const inventory = discoverOperationInventory(document, { spec: "predictionMarkets" });
  const ownedOperations = ownedOperationsForModule(
    inventory,
    { module: "predictionMarkets", spec: "predictionMarkets" },
  );
  const { operations } = await generateOpenApiRestTypes({
    document,
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
  const methodNames = new Map(ownedOperations.map((operation) => [
    operation.operationId,
    operation.operationId === "acceptPredictionMarketsTerms" ? "acceptTerms" : operation.methodName,
  ]));

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
      transportImportPath: "../transport/http.js",
      executorImportPath: "../transport/rest-operation.js",
      deadlineImportPath: "../utils/deadline.js",
    },
  ));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const specPath = process.argv[2] ?? "predictionMarkets";
  const outputDir = resolve(process.argv[3] ?? resolve(scriptDir, "../src/generated"));
  await generatePredictionMarkets({ specPath, outputDir });
}
