import assert from "node:assert/strict";
import { execFile as execFileCallback } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { promisify } from "node:util";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { generateOpenApiRestTypes, renderRestClient } from "./openapi-rest-generator.mjs";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const sdkDir = resolve(scriptDir, "..");
const restSpecPath = "https://developer.gemini.com/specs/openapi/rest.yaml";
const predictionMarketsSpecPath = "https://developer.gemini.com/specs/openapi/prediction-markets.yaml";
const execFile = promisify(execFileCallback);

function operationIds(source) {
  const registry = source.match(/export const \w+ = \{\n(?<body>[\s\S]*?)\n\} as const;/)?.groups?.body;
  assert(registry, "generated operations registry not found");
  return [...registry.matchAll(/^  "([^"]+)":/gm)].map(([, id]) => id);
}

test("generator can emit Market Data operations by tag including file downloads", async (t) => {
  const directory = mkdtempSync(join(tmpdir(), "market-data-generator-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));

  await generateOpenApiRestTypes({
    specPath: restSpecPath,
    outputDir: directory,
    banner: "// Generated from apis/rest.yaml. Do not edit.\n\n",
    includeTags: ["Market Data"],
    operationResponseModes: { getFundingAmountReportFile: "file" },
    operationsConstName: "MARKET_DATA_OPERATIONS",
    operationIdTypeName: "MarketDataOperationId",
    operationTypesName: "MarketDataOperationTypes",
  });

  const operations = readFileSync(join(directory, "operations.ts"), "utf8");
  const models = readFileSync(join(directory, "models.ts"), "utf8");
  const ids = operationIds(operations);

  assert.match(models, /Generated from apis\/rest\.yaml/);
  assert.equal(ids.length, 16);
  assert(ids.includes("getTicker"));
  assert(ids.includes("listDerivativeCandles"));
  assert(ids.includes("getFundingAmountReportFile"));
  assert(!ids.includes("createNewOrder"));
  assert.match(operations, /export const MARKET_DATA_OPERATIONS/);
  assert.match(operations, /export type MarketDataOperationTypes/);
  assert.match(operations, /import type \{ RestFileResponse \} from "\.\.\/transport\/http\.js";/);
  assert.match(operations, /"getFundingAmountReportFile": \{[\s\S]*"responseContentTypes":\["application\/vnd\.openxmlformats-officedocument\.spreadsheetml\.sheet","text\/csv"\]/);
  assert.match(operations, /response: RestFileResponse;/);
});

test("generator fails loudly when a success response mixes json and file content without override", async (t) => {
  const directory = mkdtempSync(join(tmpdir(), "rest-generator-mixed-response-"));
  const specPath = join(directory, "mixed.yaml");
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  writeFileSync(specPath, `openapi: 3.0.3
info: { title: mixed, version: 1 }
paths:
  /v1/items:
    get:
      operationId: listItems
      responses:
        "200":
          description: ok
          content:
            application/json: { schema: { type: object } }
            text/csv: { schema: { type: string, format: binary } }
`);

  await assert.rejects(
    generateOpenApiRestTypes({
      specPath,
      outputDir: directory,
      banner: "// generated\n",
      operationsConstName: "OPERATIONS",
      operationIdTypeName: "OperationId",
      operationTypesName: "OperationTypes",
    }),
    /listItems response contract is unsupported or ambiguous/,
  );
});

test("generator fails loudly when a requested tag matches no operations", async (t) => {
  const directory = mkdtempSync(join(tmpdir(), "market-data-generator-missing-tag-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));

  await assert.rejects(
    generateOpenApiRestTypes({
      specPath: restSpecPath,
      outputDir: directory,
      banner: "// Generated from apis/rest.yaml. Do not edit.\n\n",
      includeTags: ["Market Datas"],
      operationsConstName: "MARKET_DATA_OPERATIONS",
      operationIdTypeName: "MarketDataOperationId",
      operationTypesName: "MarketDataOperationTypes",
    }),
    /REST tag not found: Market Datas/,
  );
});

test("generator supports matching JSON schemas across multiple success statuses", async (t) => {
  const directory = mkdtempSync(join(tmpdir(), "rest-generator-multiple-json-successes-"));
  const specPath = join(directory, "multiple-json-successes.yaml");
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  writeFileSync(specPath, `openapi: 3.0.3
info: { title: ambiguous, version: 1 }
paths:
  /v1/items:
    get:
      operationId: listItems
      responses:
        "200": { description: ok, content: { application/json: { schema: { type: object } } } }
        "201": { description: created, content: { application/json: { schema: { type: object } } } }
`);

  await generateOpenApiRestTypes({
    specPath,
    outputDir: directory,
    banner: "// generated\n",
    operationsConstName: "OPERATIONS",
    operationIdTypeName: "OperationId",
    operationTypesName: "OperationTypes",
  });

  const operations = readFileSync(join(directory, "operations.ts"), "utf8");
  assert.match(operations, /"listItems": \{"responseMode":"json"[\s\S]*"successStatuses":\[200,201\]/);
  assert.match(operations, /response: JsonResponse<OpenApiOperations\["listItems"\], 200 \| 201>;/);
});

test("generator emits all compatible file success statuses and media types", async (t) => {
  const directory = mkdtempSync(join(tmpdir(), "rest-generator-multiple-file-successes-"));
  const specPath = join(directory, "multiple-file-successes.yaml");
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  writeFileSync(specPath, `openapi: 3.0.3
info: { title: files, version: 1 }
paths:
  /v1/report:
    get:
      operationId: getReport
      responses:
        "200": { description: ok, content: { application/vnd.openxmlformats-officedocument.spreadsheetml.sheet: { schema: { type: string, format: binary } } } }
        "206": { description: partial, content: { text/csv: { schema: { type: string, format: binary } } } }
`);

  await generateOpenApiRestTypes({
    specPath,
    outputDir: directory,
    banner: "// generated\n",
    operationsConstName: "OPERATIONS",
    operationIdTypeName: "OperationId",
    operationTypesName: "OperationTypes",
  });

  const operations = readFileSync(join(directory, "operations.ts"), "utf8");
  assert.match(operations, /"getReport": \{"responseMode":"file"[\s\S]*"successStatuses":\[200,206\]/);
  assert.match(operations, /"responseContentTypes":\["application\/vnd\.openxmlformats-officedocument\.spreadsheetml\.sheet","text\/csv"\]/);
});

test("generator emits request int64 metadata and bigint-compatible input types", async (t) => {
  const directory = mkdtempSync(join(tmpdir(), "rest-generator-request-int64-"));
  const specPath = join(directory, "request-int64.yaml");
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  writeFileSync(specPath, `openapi: 3.0.3
info: { title: request-int64, version: 1 }
paths:
  /v1/items/{itemId}:
    post:
      operationId: updateItem
      parameters:
        - name: itemId
          in: path
          required: true
          schema: { type: integer, format: int64 }
        - name: since
          in: query
          required: false
          schema: { type: integer, format: int64 }
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required: [orderId]
              properties:
                orderId: { type: integer, format: int64, x-unsigned-int64: true }
                legacyId:
                  oneOf:
                    - { type: integer, format: int64 }
                    - { type: string }
      responses:
        "200": { description: ok, content: { application/json: { schema: { type: object } } } }
`);

  await generateOpenApiRestTypes({
    specPath,
    outputDir: directory,
    banner: "// generated\n",
    operationsConstName: "OPERATIONS",
    operationIdTypeName: "OperationId",
    operationTypesName: "OperationTypes",
    operationSignQuery: { updateItem: true },
  });

  const operations = readFileSync(join(directory, "operations.ts"), "utf8");
  assert.match(operations, /requestInt64Paths/);
  assert.match(operations, /"signQuery":true/);
  assert.match(operations, /"body":\[\{"path":\["legacyId"\],"allowString":true\},\{"path":\["orderId"\],"unsigned":true\}\]/);
  assert.match(operations, /"path":\[\{"path":\["itemId"\]\}\]/);
  assert.match(operations, /"query":\[\{"path":\["since"\]\}\]/);
  assert.match(operations, /type Int64Input<T>/);
  assert.match(operations, /bigint \| number/);
});

test("generator does not normalize response int64 fields with a string variant", async (t) => {
  const directory = mkdtempSync(join(tmpdir(), "rest-generator-response-int64-string-"));
  const specPath = join(directory, "response-int64-string.yaml");
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  writeFileSync(specPath, `openapi: 3.0.3
info: { title: response-int64-string, version: 1 }
paths:
  /v1/items:
    get:
      operationId: listItems
      responses:
        "200":
          description: ok
          content:
            application/json:
              schema:
                type: array
                items:
                  type: object
                  properties:
                    timestamp:
                      oneOf:
                        - { type: integer, format: int64 }
                        - { type: string, format: date-time }
`);

  await generateOpenApiRestTypes({
    specPath,
    outputDir: directory,
    banner: "// generated\n",
    operationsConstName: "OPERATIONS",
    operationIdTypeName: "OperationId",
    operationTypesName: "OperationTypes",
  });

  const operations = readFileSync(join(directory, "operations.ts"), "utf8");
  assert.match(operations, /responseInt64Paths":\[\]/);
});

test("generator rejects unsupported parameter styles and object shapes", async (t) => {
  const directory = mkdtempSync(join(tmpdir(), "rest-generator-parameter-contract-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const spec = (parameter) => `openapi: 3.0.3
info: { title: invalid, version: 1 }
paths:
  /v1/items:
    get:
      operationId: listItems
      parameters:
        - ${parameter}
      responses:
        "200": { description: ok, content: { application/json: { schema: { type: object } } } }
`;
  const options = (specPath) => ({
    specPath,
    outputDir: directory,
    banner: "// generated\n",
    operationsConstName: "OPERATIONS",
    operationIdTypeName: "OperationId",
    operationTypesName: "OperationTypes",
  });
  const stylePath = join(directory, "unsupported-style.yaml");
  writeFileSync(stylePath, spec("{ name: filter, in: query, style: deepObject, explode: true, schema: { type: string } }"));
  await assert.rejects(generateOpenApiRestTypes(options(stylePath)), /query parameter filter has an unsupported schema/);

  const objectPath = join(directory, "unsupported-object.yaml");
  writeFileSync(objectPath, spec("{ name: filter, in: query, style: form, explode: true, schema: { type: object } }"));
  await assert.rejects(generateOpenApiRestTypes(options(objectPath)), /query parameter filter has an unsupported schema/);

  const incompatibleComposedPath = join(directory, "incompatible-composed.yaml");
  writeFileSync(incompatibleComposedPath, spec("{ name: filter, in: query, schema: { allOf: [{ type: string }, { type: integer }] } }"));
  await assert.rejects(generateOpenApiRestTypes(options(incompatibleComposedPath)), /unsupported composed primitive schema/);
});

test("generator emits metadata for every supported query serialization style", async (t) => {
  const directory = mkdtempSync(join(tmpdir(), "rest-generator-query-styles-"));
  const specPath = join(directory, "query-styles.yaml");
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  writeFileSync(specPath, `openapi: 3.0.3
info: { title: query styles, version: 1 }
paths:
  /v1/items:
    get:
      operationId: listItems
      parameters:
        - { name: formDefault, in: query, schema: { type: string } }
        - { name: integerScalar, in: query, schema: { type: integer } }
        - { name: booleanScalar, in: query, schema: { type: boolean } }
        - { name: unionScalar, in: query, schema: { oneOf: [{ type: string }, { type: integer }] } }
        - { name: formArray, in: query, schema: { type: array, items: { type: string } }, style: form, explode: false }
        - { name: integerArray, in: query, schema: { type: array, items: { type: integer } }, style: form, explode: false }
        - { name: unionArray, in: query, schema: { oneOf: [{ type: array, items: { type: boolean } }, { type: array, items: { type: integer } }] }, style: form, explode: false }
        - { name: formObject, in: query, schema: { type: object, properties: { status: { type: string } } }, style: form, explode: true, allowReserved: true }
        - { name: spaceArray, in: query, schema: { type: array, items: { type: string } }, style: spaceDelimited }
        - { name: pipeArray, in: query, schema: { type: array, items: { type: string } }, style: pipeDelimited }
        - { name: deepObject, in: query, schema: { type: object, properties: { status: { type: string } } }, style: deepObject, explode: true }
      responses:
        "200": { description: ok, content: { application/json: { schema: { type: object } } } }
`);

  await generateOpenApiRestTypes({
    specPath,
    outputDir: directory,
    banner: "// generated\n",
    operationsConstName: "OPERATIONS",
    operationIdTypeName: "OperationId",
    operationTypesName: "OperationTypes",
  });

  const operations = readFileSync(join(directory, "operations.ts"), "utf8");
  assert.match(operations, /"formDefault","in":"query","required":false,"style":"form","explode":true,"valueType":"string","shape":"scalar","allowReserved":false/);
  assert.match(operations, /"integerScalar","in":"query","required":false,"style":"form","explode":true,"valueType":"integer","shape":"scalar","allowReserved":false/);
  assert.match(operations, /"booleanScalar","in":"query","required":false,"style":"form","explode":true,"valueType":"boolean","shape":"scalar","allowReserved":false/);
  assert.match(operations, /"unionScalar","in":"query","required":false,"style":"form","explode":true,"valueTypes":\["string","integer"\],"shape":"scalar","allowReserved":false/);
  assert.match(operations, /"formArray","in":"query","required":false,"style":"form","explode":false,"itemType":"string","shape":"array","allowReserved":false/);
  assert.match(operations, /"integerArray","in":"query","required":false,"style":"form","explode":false,"itemType":"integer","shape":"array","allowReserved":false/);
  assert.match(operations, /"unionArray","in":"query","required":false,"style":"form","explode":false,"itemTypes":\["boolean","integer"\],"shape":"array","allowReserved":false/);
  assert.match(operations, /"formObject","in":"query","required":false,"style":"form","explode":true,"shape":"object","allowReserved":true/);
  assert.match(operations, /"spaceArray","in":"query","required":false,"style":"spaceDelimited","explode":false,"itemType":"string","shape":"array","allowReserved":false/);
  assert.match(operations, /"pipeArray","in":"query","required":false,"style":"pipeDelimited","explode":false,"itemType":"string","shape":"array","allowReserved":false/);
  assert.match(operations, /"deepObject","in":"query","required":false,"style":"deepObject","explode":true,"shape":"object","allowReserved":false/);
});

test("generator rejects invalid query serialization combinations", async (t) => {
  const directory = mkdtempSync(join(tmpdir(), "rest-generator-invalid-query-styles-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const spec = (parameter) => `openapi: 3.0.3
info: { title: invalid query styles, version: 1 }
paths:
  /v1/items:
    get:
      operationId: listItems
      parameters:
        - ${parameter}
      responses:
        "200": { description: ok, content: { application/json: { schema: { type: object } } } }
`;
  const options = (specPath) => ({
    specPath,
    outputDir: directory,
    banner: "// generated\n",
    operationsConstName: "OPERATIONS",
    operationIdTypeName: "OperationId",
    operationTypesName: "OperationTypes",
  });
  const cases = [
    ["spaceDelimited scalar", "{ name: value, in: query, style: spaceDelimited, schema: { type: string } }", /query parameter value has an unsupported schema/],
    ["pipeDelimited exploded", "{ name: value, in: query, style: pipeDelimited, explode: true, schema: { type: array, items: { type: string } } }", /query parameter value uses unsupported style/],
    ["deepObject not exploded", "{ name: value, in: query, style: deepObject, schema: { type: object, properties: { status: { type: string } } } }", /query parameter value uses unsupported style/],
    ["deepObject array", "{ name: value, in: query, style: deepObject, explode: true, schema: { type: array, items: { type: string } } }", /query parameter value has an unsupported schema/],
    ["nested object", "{ name: value, in: query, style: deepObject, explode: true, schema: { type: object, properties: { nested: { type: object } } } }", /query parameter value has an unsupported schema/],
    ["content parameter", "{ name: value, in: query, content: { application/json: { schema: { type: string } } } }", /uses unsupported content serialization/],
  ];
  for (const [name, parameter, error] of cases) {
    const specPath = join(directory, `${name.replaceAll(" ", "-")}.yaml`);
    writeFileSync(specPath, spec(parameter));
    await assert.rejects(generateOpenApiRestTypes(options(specPath)), error);
  }
});

test("generator rejects multiple JSON success responses with different schemas", async (t) => {
  const directory = mkdtempSync(join(tmpdir(), "rest-generator-mismatched-json-successes-"));
  const specPath = join(directory, "mismatched-json-successes.yaml");
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  writeFileSync(specPath, `openapi: 3.0.3
info: { title: mismatched, version: 1 }
paths:
  /v1/items:
    get:
      operationId: listItems
      responses:
        "200": { description: ok, content: { application/json: { schema: { type: object } } } }
        "201": { description: created, content: { application/json: { schema: { type: string } } } }
`);

  await assert.rejects(
    generateOpenApiRestTypes({
      specPath,
      outputDir: directory,
      banner: "// generated\n",
      operationResponseModes: { listItems: "json" },
      operationsConstName: "OPERATIONS",
      operationIdTypeName: "OperationId",
      operationTypesName: "OperationTypes",
    }),
    /listItems 2xx application\/json responses must use the same schema/,
  );
});

test("generator json override rejects a mixed-content success response", async (t) => {
  const directory = mkdtempSync(join(tmpdir(), "rest-generator-json-override-"));
  const specPath = join(directory, "mixed.yaml");
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  writeFileSync(specPath, `openapi: 3.0.3
info: { title: mixed, version: 1 }
paths:
  /v1/items:
    get:
      operationId: listItems
      responses:
        "200":
          description: ok
          content:
            application/json: { schema: { type: object } }
            text/csv: { schema: { type: string, format: binary } }
`);

  await assert.rejects(
    generateOpenApiRestTypes({
      specPath,
      outputDir: directory,
      banner: "// generated\n",
      operationResponseModes: { listItems: "json" },
      operationsConstName: "OPERATIONS",
      operationIdTypeName: "OperationId",
      operationTypesName: "OperationTypes",
    }),
    /listItems must have only application\/json 2xx responses/,
  );
});

test("generator retains caller-owned header parameters and excludes transport headers", async (t) => {
  const directory = mkdtempSync(join(tmpdir(), "rest-generator-headers-"));
  const specPath = join(directory, "headers.yaml");
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  writeFileSync(specPath, `openapi: 3.0.3
info: { title: headers, version: 1 }
paths:
  /v1/items:
    get:
      operationId: listItems
      parameters:
        - { name: X-Request-Id, in: header, required: true, schema: { type: string } }
        - { name: Authorization, in: header, required: true, schema: { type: string } }
        - { name: X-GEMINI-APIKEY, in: header, required: true, schema: { type: string } }
        - { name: Content-Type, in: header, required: true, schema: { type: string } }
      responses:
        "200": { description: ok, content: { application/json: { schema: { type: object } } } }
`);

  await generateOpenApiRestTypes({
    specPath,
    outputDir: directory,
    banner: "// generated\n",
    operationsConstName: "OPERATIONS",
    operationIdTypeName: "OperationId",
    operationTypesName: "OperationTypes",
  });

  const operations = readFileSync(join(directory, "operations.ts"), "utf8");
  assert.match(operations, /"headers":\[\{"name":"X-Request-Id","in":"header","required":true,"explode":false}\]/);
  assert.match(operations, /headers: Pick<NonNullable<ParameterAt<OpenApiOperations\["listItems"\], "header">>, "X-Request-Id">;/);
  assert.doesNotMatch(operations, /Authorization|X-GEMINI-APIKEY|Content-Type/);
});

test("Prediction Markets REST wrappers delegate through executeRestOperation", async (t) => {
  const directory = mkdtempSync(join(tmpdir(), "prediction-markets-rest-generator-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));

  await execFile(process.execPath, [join(scriptDir, "generate-prediction-markets.mjs"), predictionMarketsSpecPath, directory]);

  const rest = readFileSync(join(directory, "rest.ts"), "utf8");
  assert.match(rest, /import \{ executeRestOperation \} from "\.\.\/transport\/rest-operation\.js";/);
  assert.match(rest, /import type \{ RestPromise \} from "\.\.\/transport\/rest-promise\.js";/);
  assert.match(rest, /return executeRestOperation<PredictionMarketOperationTypes\[/);
  assert.doesNotMatch(rest, /this\.transport\.(?:requestPublic|request)\(/);
});

test("Prediction Markets REST wrappers forward typed caller-owned headers", async (t) => {
  const directory = mkdtempSync(join(tmpdir(), "prediction-markets-rest-headers-"));
  const specPath = join(directory, "prediction-markets.yaml");
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  writeFileSync(
    specPath,
    (await (await fetch(predictionMarketsSpecPath)).text()).replace(
      "      parameters:\n        - name: status",
      "      parameters:\n        - name: X-Request-Id\n          in: header\n          required: false\n          schema:\n            type: string\n        - name: status",
    ),
  );

  await execFile(process.execPath, [join(scriptDir, "generate-prediction-markets.mjs"), specPath, directory]);

  const rest = readFileSync(join(directory, "rest.ts"), "utf8");
  assert.match(rest, /listEvents\(input\??: PredictionMarketOperationTypes\["listEvents"\]\["input"\], requestOptions\?: RequestOptions\): RestPromise<PredictionMarketOperationTypes\["listEvents"\]\["response"\]>/);
  assert.match(rest, /return executeRestOperation<PredictionMarketOperationTypes\["listEvents"\]>\(this\.transport, operation, input, requestOptions\);/);
});

test("generic REST client renderer emits callable module methods", async (t) => {
  const directory = mkdtempSync(join(tmpdir(), "market-data-rest-client-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));

  const { operations } = await generateOpenApiRestTypes({
    specPath: restSpecPath,
    outputDir: directory,
    banner: "// generated\n",
    includeOperationIds: ["getCurrentOrderBook", "listSymbols"],
    operationsConstName: "MARKET_DATA_OPERATIONS",
    operationIdTypeName: "MarketDataOperationId",
    operationTypesName: "MarketDataOperationTypes",
  });

  const rest = renderRestClient(operations, {
    banner: "// generated\n",
    className: "MarketDataRest",
    operationsConstName: "MARKET_DATA_OPERATIONS",
    operationTypesName: "MarketDataOperationTypes",
    operationsImportPath: "./operations.js",
    transportImportPath: "../../transport/http.js",
    executorImportPath: "../../transport/rest-operation.js",
  });

  assert.match(rest, /export class MarketDataRest/);
  assert.match(rest, /import type \{ RestPromise \} from "\.\.\/\.\.\/transport\/rest-promise\.js";/);
  assert.match(rest, /listSymbols\(requestOptions\?: RequestOptions\): RestPromise<MarketDataOperationTypes\["listSymbols"\]\["response"\]>/);
  assert.equal((rest.match(/^  listSymbols\(/gm) ?? []).length, 1);
  assert.doesNotMatch(rest, /^  listSymbols\([^\n]*\): Promise<[^\n]+>;\s*$/m);
  assert.match(rest, /getCurrentOrderBook\(input: MarketDataOperationTypes\["getCurrentOrderBook"\]\["input"\], requestOptions\?: RequestOptions\): RestPromise<MarketDataOperationTypes\["getCurrentOrderBook"\]\["response"\]>/);
  assert.match(rest, /return executeRestOperation<MarketDataOperationTypes\["getCurrentOrderBook"\]>\(this\.transport, operation, input, requestOptions\);/);
  assert.doesNotMatch(rest, /this\.transport\.(?:requestPublic|request)\(/);

  const customPromiseRest = renderRestClient(operations, {
    banner: "// generated\n",
    className: "MarketDataRest",
    operationsConstName: "MARKET_DATA_OPERATIONS",
    operationTypesName: "MarketDataOperationTypes",
    operationsImportPath: "./operations.js",
    transportImportPath: "../../transport/http.js",
    executorImportPath: "../../transport/rest-operation.js",
    promiseImportPath: "./custom-promise.js",
  });
  assert.match(customPromiseRest, /import type \{ RestPromise \} from "\.\/custom-promise\.js";/);
});

test("generic REST client renderer rejects duplicate public method names", async (t) => {
  const directory = mkdtempSync(join(tmpdir(), "market-data-rest-collision-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));

  const { operations } = await generateOpenApiRestTypes({
    specPath: restSpecPath,
    outputDir: directory,
    banner: "// generated\n",
    includeOperationIds: ["getTicker", "getTickerV2"],
    operationsConstName: "MARKET_DATA_OPERATIONS",
    operationIdTypeName: "MarketDataOperationId",
    operationTypesName: "MarketDataOperationTypes",
  });

  assert.throws(
    () => renderRestClient(
      operations.map((operation) => ({ ...operation, methodName: "getTicker" })),
      {
        banner: "// generated\n",
        className: "MarketDataRest",
        operationsConstName: "MARKET_DATA_OPERATIONS",
        operationTypesName: "MarketDataOperationTypes",
        operationsImportPath: "./operations.js",
        transportImportPath: "../../transport/http.js",
        executorImportPath: "../../transport/rest-operation.js",
      },
    ),
    /Duplicate methodName in MarketDataRest: getTicker/,
  );
});
