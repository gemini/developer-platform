import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { discoverOperationInventory, loadOpenApiDocument } from "./openapi-rest-generator.mjs";
import {
  REST_OPERATION_OWNERSHIP,
  createRestOperationOwnershipReport,
  validateRestOperationOwnership,
} from "./rest-operation-ownership.mjs";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const sdkDir = resolve(scriptDir, "..");
const snapshotPath = resolve(scriptDir, "rest-operation-ownership.snapshot.json");
const localPmSpec = resolve(sdkDir, "../../apis/prediction-markets.yaml");
const localRestSpec = resolve(sdkDir, "../../apis/rest.yaml");
const pmSpecPath = existsSync(localPmSpec) ? localPmSpec : "https://developer.gemini.com/specs/openapi/prediction-markets.yaml";
const restSpecPath = existsSync(localRestSpec) ? localRestSpec : "https://developer.gemini.com/specs/openapi/rest.yaml";

async function realOperations() {
  return (await Promise.all([
    ["predictionMarkets", pmSpecPath],
    ["rest", restSpecPath],
  ].map(async ([spec, specPath]) => discoverOperationInventory(await loadOpenApiDocument(specPath), { spec })))).flat();
}

function operation(overrides = {}) {
  return {
    spec: "rest",
    operationId: "getTicker",
    method: "get",
    path: "/v1/pubticker/{symbol}",
    tags: ["Market Data"],
    successResponses: [{ status: 200, contentTypes: ["application/json"] }],
    ...overrides,
  };
}

function manifest(overrides = {}) {
  return {
    modules: [{ id: "marketData", tags: ["Market Data"] }],
    operationOverrides: {},
    ...overrides,
  };
}

test("real specs validate to exactly 105 owned operations", async () => {
  assert.equal(validateRestOperationOwnership(await realOperations()).length, 105);
});

test("generated real-spec report matches the ownership snapshot", async () => {
  const report = createRestOperationOwnershipReport(await realOperations());
  assert.deepEqual(JSON.parse(readFileSync(snapshotPath, "utf8")), report);
});

test("unowned operation fails", () => {
  assert.throws(
    () => validateRestOperationOwnership([operation()], manifest({ modules: [] })),
    /Unowned REST operation: rest:getTicker/,
  );
});

test("duplicate ownership fails", () => {
  assert.throws(
    () => validateRestOperationOwnership([operation()], manifest({
      modules: [
        { id: "marketData", tags: ["Market Data"] },
        { id: "trading", tags: ["Market Data"] },
      ],
    })),
    /Duplicate REST operation ownership: rest:getTicker/,
  );
});

test("stale tag fails", () => {
  assert.throws(
    () => validateRestOperationOwnership([operation()], manifest({ modules: [{ id: "marketData", tags: ["Stale"] }] })),
    /REST tag not found: Stale/,
  );
});

test("stale operation id fails", () => {
  assert.throws(
    () => validateRestOperationOwnership([operation()], manifest({
      operationOverrides: { "rest:doesNotExist": { responseMode: "file" } },
    })),
    /REST operation not found: rest:doesNotExist/,
  );
});

test("missing operationId fails", () => {
  assert.throws(
    () => discoverOperationInventory({ paths: { "/v1/test": { get: { responses: {} } } } }, { spec: "rest" }),
    /GET \/v1\/test is missing operationId/,
  );
});

test("duplicate methodName within a module fails", () => {
  assert.throws(
    () => validateRestOperationOwnership([
      operation(),
      operation({ operationId: "getTickerV2", path: "/v2/ticker/{symbol}" }),
    ], manifest({
      operationOverrides: {
        "rest:getTicker": { methodName: "ticker" },
        "rest:getTickerV2": { methodName: "ticker" },
      },
    })),
    /Duplicate methodName in marketData: ticker/,
  );
});

test("non-JSON 2xx response without an explicit override uses file mode", () => {
  const [owned] = validateRestOperationOwnership([
    operation({ operationId: "download", successResponses: [{ status: 200, contentTypes: ["application/pdf"] }] }),
  ], manifest());

  assert.equal(owned.responseMode, "file");
});

test("mixed JSON and file response without an explicit override fails", () => {
  assert.throws(
    () => validateRestOperationOwnership([
      operation({ successResponses: [{ status: 200, contentTypes: ["application/json", "text/csv"] }] }),
    ], manifest()),
    /rest:getTicker must have exactly one 2xx application\/json response or an explicit file override/,
  );
});

test("explicit json override fails for mixed JSON and file content", () => {
  assert.throws(
    () => validateRestOperationOwnership([
      operation({ successResponses: [{ status: 200, contentTypes: ["application/json", "text/csv"] }] }),
    ], manifest({
      operationOverrides: { "rest:getTicker": { responseMode: "json" } },
    })),
    /rest:getTicker must have exactly one 2xx application\/json response/,
  );
});

test("spec-scoped tags do not duplicate-own operations in another spec", () => {
  const owned = validateRestOperationOwnership([
    operation({ spec: "predictionMarkets", operationId: "placeOrder", tags: ["Trading"] }),
    operation({ tags: ["Trading"] }),
  ], manifest({
    modules: [
      { id: "predictionMarkets", specs: ["predictionMarkets"], tags: ["Trading"] },
      { id: "trading", specs: ["rest"], tags: ["Trading"] },
    ],
  }));

  assert.equal(owned.find(({ spec }) => spec === "rest").module, "trading");
});

test("response overrides allow json and file modes", () => {
  const [json] = validateRestOperationOwnership([operation()], manifest({
    operationOverrides: { "rest:getTicker": { responseMode: "json" } },
  }));
  const [file] = validateRestOperationOwnership([
    operation({ operationId: "download", successResponses: [{ status: 200, contentTypes: ["text/csv"] }] }),
  ], manifest({
    operationOverrides: { "rest:download": { responseMode: "file" } },
  }));

  assert.equal(json.responseMode, "json");
  assert.equal(file.responseMode, "file");
});

test("invalid response override mode fails", () => {
  assert.throws(
    () => validateRestOperationOwnership([operation()], manifest({
      operationOverrides: { "rest:getTicker": { responseMode: "stream" } },
    })),
    /rest:getTicker responseMode must be json or file/,
  );
});

test("multiple JSON 2xx responses use json mode", () => {
  const [owned] = validateRestOperationOwnership([
    operation({
      successResponses: [
        { status: 200, contentTypes: ["application/json"] },
        { status: 201, contentTypes: ["application/json"] },
      ],
    }),
  ], manifest());

  assert.equal(owned.responseMode, "json");
});

test("explicit json override on multiple JSON 2xx responses uses json mode", () => {
  const [owned] = validateRestOperationOwnership([
    operation({
      successResponses: [
        { status: 200, contentTypes: ["application/json"] },
        { status: 201, contentTypes: ["application/json"] },
      ],
    }),
  ], manifest({
    operationOverrides: { "rest:getTicker": { responseMode: "json" } },
  }));

  assert.equal(owned.responseMode, "json");
});

test("production manifest owns all required module ids", () => {
  assert.deepEqual(REST_OPERATION_OWNERSHIP.modules.map(({ id }) => id), [
    "predictionMarkets", "marketData", "trading", "margin", "perpetuals", "accountServices", "clearingInstant",
  ]);
});
