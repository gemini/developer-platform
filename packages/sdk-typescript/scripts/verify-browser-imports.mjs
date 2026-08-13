/**
 * Verify the browser entry point's import graph contains no Node-only modules.
 * Recursively follows every import starting from dist/browser/index.js and fails
 * if any resolved file imports node:*, ws, or other server-only specifiers.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

const FORBIDDEN = [
  /^node:/,
  /^ws$/,
];

const root = resolve("dist");
const entry = join(root, "browser", "index.js");
const visited = new Set();
const violations = [];

function scan(filePath) {
  const resolved = resolve(filePath);
  if (visited.has(resolved)) return;
  visited.add(resolved);

  const source = readFileSync(resolved, "utf8");
  // Match both static imports and re-exports: import ... from "X" / export ... from "X"
  const importPattern = /(?:import|export)\s+.*?\s+from\s+["']([^"']+)["']/g;
  let match;
  while ((match = importPattern.exec(source)) !== null) {
    const specifier = match[1];

    // Check against forbidden patterns
    for (const pattern of FORBIDDEN) {
      if (pattern.test(specifier)) {
        violations.push({ file: resolved.replace(root + "/", "dist/"), specifier });
      }
    }

    // Follow relative imports into the dist tree
    if (specifier.startsWith(".")) {
      const target = resolve(dirname(resolved), specifier);
      // Try .js directly, or as-is if it already resolves
      for (const candidate of [target, target + ".js"]) {
        try {
          readFileSync(candidate);
          scan(candidate);
          break;
        } catch {
          // not found, try next candidate
        }
      }
    }
  }
}

scan(entry);

if (violations.length > 0) {
  console.error("Browser entry point import graph contains forbidden specifiers:");
  for (const { file, specifier } of violations) {
    console.error(`  ${file} → ${specifier}`);
  }
  process.exit(1);
}

// Also verify no HmacAuth reference in the browser dist output
const browserFiles = [...visited];
for (const filePath of browserFiles) {
  const source = readFileSync(filePath, "utf8");
  assert(!source.includes("HmacAuth"), `${filePath.replace(root + "/", "dist/")} references HmacAuth`);
}

console.log(`browser import graph clean: ${visited.size} files scanned, 0 forbidden imports`);
