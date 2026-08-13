import { existsSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { discoverOperationInventory, loadOpenApiDocument } from "./openapi-rest-generator.mjs";
import { createRestOperationOwnershipReport } from "./rest-operation-ownership.mjs";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const localPm = resolve(scriptDir, "../../../apis/prediction-markets.yaml");
const localRest = resolve(scriptDir, "../../../apis/rest.yaml");
const specs = [
  ["predictionMarkets", existsSync(localPm) ? localPm : "https://developer.gemini.com/specs/openapi/prediction-markets.yaml"],
  ["rest", existsSync(localRest) ? localRest : "https://developer.gemini.com/specs/openapi/rest.yaml"],
];
const operations = (await Promise.all(specs.map(async ([spec, specPath]) =>
  discoverOperationInventory(await loadOpenApiDocument(specPath), { spec })))).flat();
const snapshot = createRestOperationOwnershipReport(operations);
await writeFile(resolve(scriptDir, "rest-operation-ownership.snapshot.json"), `${JSON.stringify(snapshot, null, 2)}\n`);
