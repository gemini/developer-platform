/**
 * Bundle the browser entry point with esbuild and verify the output contains
 * no Node-only references. This catches dynamic imports, tree-shaking failures,
 * and issues the static import scanner (verify-browser-imports.mjs) misses.
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createRequire } from "node:module";

const FORBIDDEN_PATTERNS = [
  /\brequire\s*\(\s*["']node:/g,
  /\brequire\s*\(\s*["']ws["']\s*\)/g,
  /\bfrom\s+["']node:/g,
  /\bimport\s*\(\s*["']node:/g,
  /\bimport\s*\(\s*["']ws["']\s*\)/g,
];

const temp = mkdtempSync(join(tmpdir(), "gemini-browser-bundle-"));
const outfile = join(temp, "browser-bundle.js");

try {
  const entry = resolve("dist/browser/index.js");

  const moduleRequire = createRequire(import.meta.url);
  const esbuild = moduleRequire.resolve("esbuild/bin/esbuild");

  execFileSync(
    process.execPath,
    [esbuild,
      entry,
      "--bundle",
      "--platform=browser",
      "--format=esm",
      "--target=es2022",
      `--outfile=${outfile}`,
      // Don't error on missing externals — we want to see if they leak into output
      "--log-level=warning",
    ],
    { stdio: "pipe", encoding: "utf8" },
  );

  const bundle = readFileSync(outfile, "utf8");
  const violations = [];

  for (const pattern of FORBIDDEN_PATTERNS) {
    let match;
    // Reset lastIndex for global patterns
    pattern.lastIndex = 0;
    while ((match = pattern.exec(bundle)) !== null) {
      // Find the line for context
      const before = bundle.slice(Math.max(0, match.index - 60), match.index);
      violations.push(`${match[0]}  (near: …${before.split("\n").pop()}…)`);
    }
  }

  // Also check for HmacAuth class in the bundle
  if (/\bHmacAuth\b/.test(bundle)) {
    violations.push("HmacAuth reference found in browser bundle");
  }

  if (violations.length > 0) {
    console.error("Browser bundle contains forbidden references:");
    for (const v of violations) console.error(`  ${v}`);
    process.exit(1);
  }

  const sizeKb = (Buffer.byteLength(bundle) / 1024).toFixed(1);
  console.log(`browser bundle clean: ${sizeKb} KB, 0 forbidden references`);
} finally {
  rmSync(temp, { recursive: true, force: true });
}
