export const REST_OPERATION_OWNERSHIP = {
  modules: [
    { id: "predictionMarkets", specs: ["predictionMarkets"], tags: ["Combos", "Markets", "Positions", "Rewards", "Terms", "Trading", "Volume"] },
    { id: "marketData", tags: ["Market Data"] },
    { id: "trading", tags: ["Orders", "Session"] },
    { id: "margin", tags: ["Margin Trading"] },
    { id: "perpetuals", tags: ["Derivatives"] },
    { id: "accountServices", tags: ["Account Administration", "Fund Management", "OAuth", "Staking"] },
    { id: "clearingInstant", tags: ["Clearing", "Instant"] },
  ],
  operationOverrides: {
    "rest:getFundingAmountReportFile": { responseMode: "file" },
    "rest:getFundingPaymentReportFile": { responseMode: "file" },
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

function moduleOwnsOperation(module, operation) {
  return (!module.specs || module.specs.includes(operation.spec)) &&
    module.tags.some((tag) => operation.tags.includes(tag));
}

export function validateRestOperationOwnership(operations, manifest = REST_OPERATION_OWNERSHIP) {
  const operationsByKey = new Map(operations.map((operation) => [operationKey(operation), operation]));
  const owned = [];

  for (const module of manifest.modules) {
    for (const tag of module.tags) {
      if (!operations.some((operation) => moduleOwnsOperation({ ...module, tags: [tag] }, operation))) {
        throw new Error(`REST tag not found: ${tag}`);
      }
    }
  }
  for (const key of Object.keys(manifest.operationOverrides ?? {})) {
    if (!operationsByKey.has(key)) throw new Error(`REST operation not found: ${key}`);
    responseModeFor(key, operationsByKey.get(key), manifest.operationOverrides[key]);
  }

  for (const operation of operations) {
    const key = operationKey(operation);
    const modules = manifest.modules.filter((module) => moduleOwnsOperation(module, operation));
    if (modules.length === 0) throw new Error(`Unowned REST operation: ${key}`);
    if (modules.length > 1) throw new Error(`Duplicate REST operation ownership: ${key}`);
    const override = manifest.operationOverrides?.[key] ?? {};
    const responseMode = responseModeFor(key, operation, override);
    if (!responseMode) {
      throw new Error(`${key} must have exactly one 2xx application/json response or an explicit file override`);
    }
    owned.push({ ...operation, module: modules[0].id, methodName: override.methodName ?? operation.operationId, responseMode });
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
    if (responseMode) {
      owned.push({ ...operation, module, methodName: override.methodName ?? operation.operationId, responseMode });
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
