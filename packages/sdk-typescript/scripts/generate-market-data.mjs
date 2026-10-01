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

const BANNER = "// Generated from rest.yaml#Market Data. Do not edit.\n\n";
const scriptDir = dirname(fileURLToPath(import.meta.url));

async function generateMarketData({ specPath, outputDir }) {
  const document = await loadOpenApiDocument(specPath);
  const ownedOperations = ownedOperationsForModule(
    discoverOperationInventory(document, { spec: "rest" }),
    { module: "marketData", spec: "rest" },
  );
  const { operations } = await generateOpenApiRestTypes({
    specPath,
    outputDir,
    banner: BANNER,
    includeOperationIds: ownedOperations.map((operation) => operation.operationId),
    operationResponseModes: Object.fromEntries(ownedOperations.map((operation) => [
      operation.operationId,
      operation.responseMode,
    ])),
    fileResponseImportPath: "../../transport/http.js",
    operationsConstName: "MARKET_DATA_OPERATIONS",
    operationIdTypeName: "MarketDataOperationId",
    operationTypesName: "MarketDataOperationTypes",
    operationNamespace: "marketData",
  });
  const methodNames = new Map(ownedOperations.map((operation) => [operation.operationId, operation.methodName]));

  await writeFile(resolve(outputDir, "rest.ts"), renderRestClient(
    operations.map((operation) => ({
      ...operation,
      methodName: methodNames.get(operation.operationId),
    })),
    {
      banner: BANNER,
      className: "MarketDataRest",
      operationsConstName: "MARKET_DATA_OPERATIONS",
      operationTypesName: "MarketDataOperationTypes",
      operationsImportPath: "./operations.js",
      transportImportPath: "../../transport/http.js",
      executorImportPath: "../../transport/rest-operation.js",
      deadlineImportPath: "../../utils/deadline.js",
    },
  ));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const specPath = process.argv[2] ?? "rest";
  const outputDir = resolve(process.argv[3] ?? resolve(scriptDir, "../src/generated/market-data"));
  await generateMarketData({ specPath, outputDir });
}
