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

const PUBLISHED_SPEC_URL = "https://developer.gemini.com/specs/openapi/rest.yaml";
const scriptDir = dirname(fileURLToPath(import.meta.url));
const localSpec = resolve(scriptDir, "../../../apis/rest.yaml");
const specPath = process.argv[2]
  ?? (existsSync(localSpec) ? localSpec : PUBLISHED_SPEC_URL);
const baseOutputDir = resolve(process.argv[3] ?? resolve(scriptDir, "../src/generated"));

const modules = [
  {
    module: "marketData",
    output: "market-data",
    banner: "// Generated from rest.yaml#Market Data. Do not edit.\n\n",
    className: "MarketDataRest",
    constName: "MARKET_DATA_OPERATIONS",
    operationIdTypeName: "MarketDataOperationId",
    operationTypesName: "MarketDataOperationTypes",
    writeModels: true,
  },
  {
    module: "trading",
    output: "trading",
    banner: "// Generated from rest.yaml#Trading. Do not edit.\n\n",
    className: "TradingRest",
    constName: "TRADING_OPERATIONS",
    operationIdTypeName: "TradingOperationId",
    operationTypesName: "TradingOperationTypes",
  },
  {
    module: "margin",
    output: "margin",
    banner: "// Generated from rest.yaml#Margin. Do not edit.\n\n",
    className: "MarginRest",
    constName: "MARGIN_OPERATIONS",
    operationIdTypeName: "MarginOperationId",
    operationTypesName: "MarginOperationTypes",
  },
  {
    module: "perpetuals",
    output: "perpetuals",
    banner: "// Generated from rest.yaml#Perpetuals. Do not edit.\n\n",
    className: "PerpetualsRest",
    constName: "PERPETUALS_OPERATIONS",
    operationIdTypeName: "PerpetualsOperationId",
    operationTypesName: "PerpetualsOperationTypes",
  },
  {
    module: "accountServices",
    output: "account-services",
    banner: "// Generated from rest.yaml#Account Services. Do not edit.\n\n",
    className: "AccountServicesRest",
    constName: "ACCOUNT_SERVICES_OPERATIONS",
    operationIdTypeName: "AccountServicesOperationId",
    operationTypesName: "AccountServicesOperationTypes",
  },
  {
    module: "clearingInstant",
    output: "clearing-instant",
    banner: "// Generated from rest.yaml#Clearing & Instant. Do not edit.\n\n",
    className: "ClearingInstantRest",
    constName: "CLEARING_INSTANT_OPERATIONS",
    operationIdTypeName: "ClearingInstantOperationId",
    operationTypesName: "ClearingInstantOperationTypes",
  },
];

const document = await loadOpenApiDocument(specPath);
const inventory = discoverOperationInventory(document, { spec: "rest" });

for (const config of modules) {
  const outputDir = resolve(baseOutputDir, config.output);
  const ownedOperations = ownedOperationsForModule(inventory, { module: config.module, spec: "rest" });
  const { operations } = await generateOpenApiRestTypes({
    specPath,
    outputDir,
    banner: config.banner,
    includeOperationIds: ownedOperations.map((operation) => operation.operationId),
    operationResponseModes: Object.fromEntries(ownedOperations.map((operation) => [
      operation.operationId,
      operation.responseMode,
    ])),
    fileResponseImportPath: "../../core/http.js",
    modelsImportPath: config.writeModels ? "./models.js" : "../market-data/models.js",
    writeModels: config.writeModels === true,
    operationsConstName: config.constName,
    operationIdTypeName: config.operationIdTypeName,
    operationTypesName: config.operationTypesName,
    operationNamespace: config.module,
  });
  const methodNames = new Map(ownedOperations.map((operation) => [operation.operationId, operation.methodName]));

  await writeFile(resolve(outputDir, "rest.ts"), renderRestClient(
    operations.map((operation) => ({
      ...operation,
      methodName: methodNames.get(operation.operationId),
    })),
    {
      banner: config.banner,
      className: config.className,
      operationsConstName: config.constName,
      operationTypesName: config.operationTypesName,
      operationsImportPath: "./operations.js",
      transportImportPath: "../../core/http.js",
      executorImportPath: "../../core/rest-operation.js",
      deadlineImportPath: "../../core/deadline.js",
    },
  ));
}
