import { writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  discoverOperationInventory,
  generateOpenApiRestModule,
  loadOpenApiDocument,
} from "./openapi-rest-generator.mjs";
import {
  REST_OPERATION_OWNERSHIP,
  createRestOperationOwnershipReport,
  ownedOperationsForModule,
  validateRestOperationOwnership,
} from "./rest-operation-ownership.mjs";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const publishedSpecs = {
  predictionMarkets: "https://developer.gemini.com/specs/openapi/prediction-markets.yaml",
  rest: "https://developer.gemini.com/specs/openapi/rest.yaml",
};
const restSpecOverride = process.argv[2];
const baseOutputDir = resolve(process.argv[3] ?? resolve(scriptDir, "../src/generated"));
const specPaths = { ...publishedSpecs };
if (restSpecOverride) specPaths.rest = restSpecOverride;

const documents = new Map();
const inventories = new Map();
for (const spec of new Set(REST_OPERATION_OWNERSHIP.modules.map(({ generation }) => generation?.spec))) {
  if (!spec) continue;
  const specPath = specPaths[spec];
  if (!specPath) throw new Error(`No REST spec configured for ${spec}`);
  const document = await loadOpenApiDocument(specPath);
  documents.set(spec, document);
  inventories.set(spec, discoverOperationInventory(document, { spec }));
}

const allOperations = [...inventories.values()].flat();
validateRestOperationOwnership(allOperations);

for (const module of REST_OPERATION_OWNERSHIP.modules) {
  const generation = module.generation;
  if (!generation) continue;
  await generateOpenApiRestModule({
    ...generation,
    document: documents.get(generation.spec),
    specPath: specPaths[generation.spec],
    outputDir: resolve(baseOutputDir, generation.output),
    operationNamespace: module.id,
    ownedOperations: ownedOperationsForModule(inventories.get(generation.spec), {
      module: module.id,
      spec: generation.spec,
    }),
  });
}

await writeFile(
  resolve(scriptDir, "rest-operation-ownership.snapshot.json"),
  `${JSON.stringify(createRestOperationOwnershipReport(allOperations), null, 2)}\n`,
);
