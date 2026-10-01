import { writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { discoverOperationInventory, loadOpenApiDocument } from "./openapi-rest-generator.mjs";
import { createRestOperationOwnershipReport } from "./rest-operation-ownership.mjs";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const specs = [
  ["predictionMarkets", "predictionMarkets"],
  ["rest", "rest"],
];

async function generateRestOwnership() {
  const operations = (await Promise.all(specs.map(async ([spec, specPath]) =>
    discoverOperationInventory(await loadOpenApiDocument(specPath), { spec })))).flat();
  const snapshot = createRestOperationOwnershipReport(operations);
  await writeFile(resolve(scriptDir, "rest-operation-ownership.snapshot.json"), `${JSON.stringify(snapshot, null, 2)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await generateRestOwnership();
}
