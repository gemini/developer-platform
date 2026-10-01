import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const SPEC_IDS = Object.freeze(["rest", "predictionMarkets", "websocket"]);

const SPEC_PATHS = Object.freeze({
  rest: "openapi/rest.yaml",
  predictionMarkets: "openapi/prediction-markets.yaml",
  websocket: "asyncapi/websocket.yaml",
});

function assertSpecId(specId) {
  if (!SPEC_IDS.includes(specId)) {
    throw new Error(`unknown specification id: ${specId}`);
  }
}

export function specsRoot() {
  const startDir = dirname(fileURLToPath(import.meta.url));
  let currentDir = startDir;
  while (true) {
    if (existsSync(join(currentDir, "specs", "SOURCES.json"))) {
      return join(currentDir, "specs");
    }
    const parentDir = dirname(currentDir);
    if (parentDir === currentDir) break;
    currentDir = parentDir;
  }
  throw new Error(`specs/SOURCES.json not found above ${startDir}`);
}

export function vendoredSpecPath(specId) {
  assertSpecId(specId);
  return join(specsRoot(), SPEC_PATHS[specId]);
}

export async function loadVendoredSpecText(specId) {
  assertSpecId(specId);
  const root = specsRoot();
  const manifest = JSON.parse(await readFile(join(root, "SOURCES.json"), "utf8"));
  const entry = manifest.specs.find(({ id }) => id === specId);
  if (!entry) throw new Error(`unknown specification id: ${specId}`);

  const bytes = await readFile(join(root, entry.path));
  const actual = createHash("sha256").update(bytes).digest("hex");
  if (actual !== entry.sha256) {
    throw new Error(
      `vendored specification digest mismatch for ${entry.path}: expected ${entry.sha256}, got ${actual}; run node specs/refresh.mjs`,
    );
  }
  return bytes.toString("utf8");
}
