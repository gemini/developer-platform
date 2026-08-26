export const REST_OPERATION_OWNERSHIP = {
  modules: [
    {
      id: "predictionMarkets",
      specs: ["predictionMarkets"],
      tags: ["Combos", "Markets", "Positions", "Rewards", "Terms", "Trading", "Volume"],
      generation: {
        spec: "predictionMarkets",
        output: ".",
        banner: "// Generated from prediction-markets.yaml. Do not edit.\n\n",
        className: "PredictionMarketsRest",
        operationsConstName: "PREDICTION_MARKET_OPERATIONS",
        operationIdTypeName: "PredictionMarketOperationId",
        operationTypesName: "PredictionMarketOperationTypes",
        writeModels: true,
        modelsImportPath: "./models.js",
        transportImportPath: "../transport/http.js",
        executorImportPath: "../transport/rest-operation.js",
        deadlineImportPath: "../utils/deadline.js",
      },
    },
    {
      id: "marketData",
      specs: ["rest"],
      tags: ["Market Data"],
      generation: {
        spec: "rest",
        output: "market-data",
        banner: "// Generated from rest.yaml#Market Data. Do not edit.\n\n",
        className: "MarketDataRest",
        operationsConstName: "MARKET_DATA_OPERATIONS",
        operationIdTypeName: "MarketDataOperationId",
        operationTypesName: "MarketDataOperationTypes",
        writeModels: true,
        modelsImportPath: "./models.js",
        fileResponseImportPath: "../../transport/http.js",
        transportImportPath: "../../transport/http.js",
        executorImportPath: "../../transport/rest-operation.js",
        deadlineImportPath: "../../utils/deadline.js",
      },
    },
    {
      id: "trading",
      specs: ["rest"],
      tags: ["Orders", "Session"],
      generation: {
        spec: "rest",
        output: "trading",
        banner: "// Generated from rest.yaml#Trading. Do not edit.\n\n",
        className: "TradingRest",
        operationsConstName: "TRADING_OPERATIONS",
        operationIdTypeName: "TradingOperationId",
        operationTypesName: "TradingOperationTypes",
        writeModels: false,
        modelsImportPath: "../market-data/models.js",
        fileResponseImportPath: "../../transport/http.js",
        transportImportPath: "../../transport/http.js",
        executorImportPath: "../../transport/rest-operation.js",
        deadlineImportPath: "../../utils/deadline.js",
      },
    },
    {
      id: "margin",
      specs: ["rest"],
      tags: ["Margin Trading"],
      generation: {
        spec: "rest",
        output: "margin",
        banner: "// Generated from rest.yaml#Margin. Do not edit.\n\n",
        className: "MarginRest",
        operationsConstName: "MARGIN_OPERATIONS",
        operationIdTypeName: "MarginOperationId",
        operationTypesName: "MarginOperationTypes",
        writeModels: false,
        modelsImportPath: "../market-data/models.js",
        fileResponseImportPath: "../../transport/http.js",
        transportImportPath: "../../transport/http.js",
        executorImportPath: "../../transport/rest-operation.js",
        deadlineImportPath: "../../utils/deadline.js",
      },
    },
    {
      id: "perpetuals",
      specs: ["rest"],
      tags: ["Derivatives"],
      generation: {
        spec: "rest",
        output: "perpetuals",
        banner: "// Generated from rest.yaml#Perpetuals. Do not edit.\n\n",
        className: "PerpetualsRest",
        operationsConstName: "PERPETUALS_OPERATIONS",
        operationIdTypeName: "PerpetualsOperationId",
        operationTypesName: "PerpetualsOperationTypes",
        writeModels: false,
        modelsImportPath: "../market-data/models.js",
        fileResponseImportPath: "../../transport/http.js",
        transportImportPath: "../../transport/http.js",
        executorImportPath: "../../transport/rest-operation.js",
        deadlineImportPath: "../../utils/deadline.js",
      },
    },
    {
      id: "account",
      specs: ["rest"],
      operationIds: [
        "addBank",
        "addBankCAD",
        "createNewAccount",
        "createNewApprovedAddress",
        "createNewDepositAddress",
        "getAccountDetail",
        "getAvailableBalances",
        "getNotionalBalances",
        "getRoles",
        "listAccountsInGroup",
        "listApprovedAddresses",
        "listDepositAddresses",
        "listPaymentMethods",
        "removeApprovedAddress",
        "renameAccount",
        "revokeOAuthToken",
      ],
      generation: {
        spec: "rest",
        output: "account",
        banner: "// Generated from rest.yaml#Account. Do not edit.\n\n",
        className: "AccountRest",
        operationsConstName: "ACCOUNT_OPERATIONS",
        operationIdTypeName: "AccountOperationId",
        operationTypesName: "AccountOperationTypes",
        writeModels: false,
        modelsImportPath: "../market-data/models.js",
        fileResponseImportPath: "../../transport/http.js",
        transportImportPath: "../../transport/http.js",
        executorImportPath: "../../transport/rest-operation.js",
        deadlineImportPath: "../../utils/deadline.js",
      },
    },
    {
      id: "staking",
      specs: ["rest"],
      operationIds: [
        "listStakingBalances",
        "listStakingEventHistory",
        "listStakingRates",
        "listStakingRewards",
        "stakeCryptoFunds",
        "unstakeCryptoFunds",
      ],
      generation: {
        spec: "rest",
        output: "staking",
        banner: "// Generated from rest.yaml#Staking. Do not edit.\n\n",
        className: "StakingRest",
        operationsConstName: "STAKING_OPERATIONS",
        operationIdTypeName: "StakingOperationId",
        operationTypesName: "StakingOperationTypes",
        writeModels: false,
        modelsImportPath: "../market-data/models.js",
        fileResponseImportPath: "../../transport/http.js",
        transportImportPath: "../../transport/http.js",
        executorImportPath: "../../transport/rest-operation.js",
        deadlineImportPath: "../../utils/deadline.js",
      },
    },
    {
      id: "transfers",
      specs: ["rest"],
      operationIds: [
        "getGasFeeEstimation",
        "getTransactionHistory",
        "listCustodyFeeTransfers",
        "listPastTransfers",
        "transferBetweenAccounts",
        "withdrawCryptoFunds",
      ],
      generation: {
        spec: "rest",
        output: "transfers",
        banner: "// Generated from rest.yaml#Transfers. Do not edit.\n\n",
        className: "TransfersRest",
        operationsConstName: "TRANSFERS_OPERATIONS",
        operationIdTypeName: "TransfersOperationId",
        operationTypesName: "TransfersOperationTypes",
        writeModels: false,
        modelsImportPath: "../market-data/models.js",
        fileResponseImportPath: "../../transport/http.js",
        transportImportPath: "../../transport/http.js",
        executorImportPath: "../../transport/rest-operation.js",
        deadlineImportPath: "../../utils/deadline.js",
      },
    },
    {
      id: "clearing",
      specs: ["rest"],
      tags: ["Clearing"],
      generation: {
        spec: "rest",
        output: "clearing",
        banner: "// Generated from rest.yaml#Clearing. Do not edit.\n\n",
        className: "ClearingRest",
        operationsConstName: "CLEARING_OPERATIONS",
        operationIdTypeName: "ClearingOperationId",
        operationTypesName: "ClearingOperationTypes",
        writeModels: false,
        modelsImportPath: "../market-data/models.js",
        fileResponseImportPath: "../../transport/http.js",
        transportImportPath: "../../transport/http.js",
        executorImportPath: "../../transport/rest-operation.js",
        deadlineImportPath: "../../utils/deadline.js",
      },
    },
    {
      id: "instant",
      specs: ["rest"],
      tags: ["Instant"],
      generation: {
        spec: "rest",
        output: "instant",
        banner: "// Generated from rest.yaml#Instant. Do not edit.\n\n",
        className: "InstantRest",
        operationsConstName: "INSTANT_OPERATIONS",
        operationIdTypeName: "InstantOperationId",
        operationTypesName: "InstantOperationTypes",
        writeModels: false,
        modelsImportPath: "../market-data/models.js",
        fileResponseImportPath: "../../transport/http.js",
        transportImportPath: "../../transport/http.js",
        executorImportPath: "../../transport/rest-operation.js",
        deadlineImportPath: "../../utils/deadline.js",
      },
    },
  ],
  operationOverrides: {
    "predictionMarkets:acceptPredictionMarketsTerms": { methodName: "acceptTerms" },
    "rest:getFundingAmountReportFile": { responseMode: "file" },
    "rest:getFundingPaymentReportFile": { responseMode: "file", queryInRequest: true },
    "rest:getFundingPaymentReportJson": { queryInRequest: true },
    "rest:listFundingPayments": { queryInRequest: false },
  },
};

function operationKey(operation) {
  return `${operation.spec}:${operation.operationId}`;
}

function isJsonResponse(operation) {
  return operation.successResponses.length > 0 &&
    operation.successResponses.every((response) =>
      response.contentTypes.length === 1 && response.contentTypes[0] === "application/json");
}

function isFileResponse(operation) {
  return operation.successResponses.length === 1 &&
    operation.successResponses[0].contentTypes.length > 0 &&
    !operation.successResponses[0].contentTypes.includes("application/json");
}

function responseModeFor(key, operation, override = {}) {
  if (override.responseMode && override.responseMode !== "json" && override.responseMode !== "file") {
    throw new Error(`${key} responseMode must be json or file`);
  }
  if (override.responseMode === "json" && !isJsonResponse(operation)) {
    throw new Error(`${key} must have exactly one 2xx application/json response`);
  }
  if (override.responseMode === "file" && !isFileResponse(operation)) {
    throw new Error(`${key} must have exactly one 2xx file response`);
  }
  if (override.responseMode) return override.responseMode;
  if (isJsonResponse(operation)) return "json";
  if (isFileResponse(operation)) return "file";
  return undefined;
}

function queryInRequestFor(key, override = {}) {
  if (override.queryInRequest !== undefined && typeof override.queryInRequest !== "boolean") {
    throw new Error(`${key} queryInRequest must be a boolean`);
  }
  return override.queryInRequest;
}

function moduleOwnsOperation(module, operation) {
  if (module.specs && !module.specs.includes(operation.spec)) return false;
  const matchesTag = module.tags?.some((tag) => operation.tags.includes(tag)) ?? false;
  const matchesOperationId = module.operationIds?.includes(operation.operationId) ?? false;
  return matchesTag || matchesOperationId;
}

export function validateRestOperationOwnership(operations, manifest = REST_OPERATION_OWNERSHIP) {
  const operationsByKey = new Map(operations.map((operation) => [operationKey(operation), operation]));
  const owned = [];

  for (const module of manifest.modules) {
    for (const tag of module.tags ?? []) {
      if (!operations.some((operation) => moduleOwnsOperation({ ...module, tags: [tag] }, operation))) {
        throw new Error(`REST tag not found: ${tag}`);
      }
    }
    for (const operationId of module.operationIds ?? []) {
      if (!operations.some((operation) =>
        operation.operationId === operationId && (!module.specs || module.specs.includes(operation.spec)))) {
        throw new Error(`REST operation not found in ${module.id}: ${operationId}`);
      }
    }
  }
  for (const key of Object.keys(manifest.operationOverrides ?? {})) {
    if (!operationsByKey.has(key)) throw new Error(`REST operation not found: ${key}`);
    const override = manifest.operationOverrides[key];
    responseModeFor(key, operationsByKey.get(key), override);
    queryInRequestFor(key, override);
  }

  for (const operation of operations) {
    const key = operationKey(operation);
    const modules = manifest.modules.filter((module) => moduleOwnsOperation(module, operation));
    if (modules.length === 0) throw new Error(`Unowned REST operation: ${key}`);
    if (modules.length > 1) throw new Error(`Duplicate REST operation ownership: ${key}`);
    const override = manifest.operationOverrides?.[key] ?? {};
    const responseMode = responseModeFor(key, operation, override);
    const queryInRequest = queryInRequestFor(key, override);
    if (!responseMode) {
      throw new Error(`${key} must have exactly one 2xx application/json response or an explicit file override`);
    }
    owned.push({ ...operation, module: modules[0].id, methodName: override.methodName ?? operation.operationId, responseMode, queryInRequest });
  }

  const methodNames = new Set();
  for (const operation of owned) {
    const key = `${operation.module}:${operation.methodName}`;
    if (methodNames.has(key)) throw new Error(`Duplicate methodName in ${operation.module}: ${operation.methodName}`);
    methodNames.add(key);
  }
  return owned;
}

export function ownedOperationsForModule(operations, { module, spec }, manifest = REST_OPERATION_OWNERSHIP) {
  const selectedModule = manifest.modules.find((candidate) => candidate.id === module);
  if (!selectedModule) throw new Error(`REST module not found: ${module}`);
  const owned = [];
  for (const operation of operations) {
    if (operation.spec !== spec || !moduleOwnsOperation(selectedModule, operation)) continue;
    const key = operationKey(operation);
    const override = manifest.operationOverrides?.[key] ?? {};
    const responseMode = responseModeFor(key, operation, override);
    const queryInRequest = queryInRequestFor(key, override);
    if (responseMode) {
      owned.push({ ...operation, module, methodName: override.methodName ?? operation.operationId, responseMode, queryInRequest });
    }
  }
  return owned;
}

export function createRestOperationOwnershipReport(operations, manifest = REST_OPERATION_OWNERSHIP) {
  return validateRestOperationOwnership(operations, manifest)
    .map(({ spec, module, operationId, methodName, responseMode, method, path, tags }) => ({
      spec, module, operationId, methodName, responseMode, method, path, tags,
    }))
    .sort((left, right) => {
      const leftKey = `${left.spec}:${left.module}:${left.operationId}`;
      const rightKey = `${right.spec}:${right.module}:${right.operationId}`;
      return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0;
    });
}
