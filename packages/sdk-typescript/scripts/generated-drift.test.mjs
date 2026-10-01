import assert from "node:assert/strict";
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { generatePredictionMarkets } from "./generate-prediction-markets.mjs";
import { generateRestModules } from "./generate-rest-modules.mjs";
import { generateWebSocketTypes } from "./generate-ws-types.mjs";

const scriptsDir = dirname(fileURLToPath(import.meta.url));
const generatedDir = resolve(scriptsDir, "../src/generated");

function generatedFiles(root) {
  const files = [];
  const visit = (dir) => {
    for (const entry of readdirSync(dir)) {
      const path = join(dir, entry);
      if (statSync(path).isDirectory()) visit(path);
      else files.push(relative(root, path));
    }
  };
  visit(root);
  return files.sort();
}

test("generated artifacts are reproducible from vendored specifications", async (t) => {
  const outputDir = mkdtempSync(join(tmpdir(), "gemini-generated-drift-"));
  t.after(() => rmSync(outputDir, { recursive: true, force: true }));

  await generateRestModules({
    specPaths: { rest: "rest", predictionMarkets: "predictionMarkets" },
    baseOutputDir: outputDir,
    writeSnapshot: false,
  });
  await generatePredictionMarkets({ specPath: "predictionMarkets", outputDir });
  await generateWebSocketTypes({ specPath: "websocket", outputDir: join(outputDir, "websocket") });

  const produced = new Set(generatedFiles(outputDir));
  const committed = new Set(generatedFiles(generatedDir));
  const paths = [...new Set([...produced, ...committed])].sort();

  for (const relativePath of paths) {
    const producedPath = join(outputDir, relativePath);
    const committedPath = join(generatedDir, relativePath);
    if (
      !produced.has(relativePath) ||
      !committed.has(relativePath) ||
      !readFileSync(producedPath).equals(readFileSync(committedPath))
    ) {
      assert.fail(`generated drift in ${relativePath}; run npm run regenerate`);
    }
  }
});
