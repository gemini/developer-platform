/**
 * Verify the browser entry point's import graph contains no Node-only modules.
 * Recursively follows every import starting from dist/browser/index.js and fails
 * if any resolved file imports node:*, ws, or other server-only specifiers.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";

const NODE_BUILTINS = new Set([
  "assert", "async_hooks", "buffer", "child_process", "cluster", "console", "constants", "crypto",
  "dgram", "diagnostics_channel", "dns", "domain", "events", "fs", "http", "http2", "https",
  "module", "net", "os", "path", "perf_hooks", "process", "punycode", "querystring", "readline",
  "repl", "stream", "string_decoder", "sys", "timers", "tls", "trace_events", "tty", "url", "util",
  "v8", "vm", "wasi", "worker_threads", "zlib",
]);

function forbiddenSpecifier(specifier) {
  if (specifier === "ws" || specifier.startsWith("ws/")) return true;
  if (specifier.startsWith("node:")) return true;
  return NODE_BUILTINS.has(specifier.split("/", 1)[0]);
}

const FORBIDDEN_MODULES = [
  { pattern: /(?:^|\/)websocket\/server\.js$/, label: "server WebSocket implementation" },
  { pattern: /(?:^|\/)websocket\/auth\.js$/, label: "server WebSocket authentication" },
  { pattern: /(?:^|\/)server\/ws-factory\.js$/, label: "server WebSocket factory" },
  { pattern: /(?:^|\/)server\/index\.js$/, label: "server entry point" },
  { pattern: /(?:^|\/)auth\/hmac\.js$/, label: "HMAC authentication" },
  { pattern: /(?:^|\/)(?:client\/server|gemini-markets)\.js$/, label: "server GeminiMarkets implementation" },
];

function forbiddenModule(filePath) {
  const relativePath = relative(root, filePath).split(sep).join("/");
  return FORBIDDEN_MODULES.find(({ pattern }) => pattern.test(relativePath));
}

const root = resolve("dist");
const entry = join(root, "browser", "index.js");
const visited = new Set();
const violations = [];

function scan(filePath) {
  const resolved = resolve(filePath);
  if (visited.has(resolved)) return;
  visited.add(resolved);

  const forbidden = forbiddenModule(resolved);
  if (forbidden) {
    violations.push({ file: resolved.replace(root + "/", "dist/"), specifier: forbidden.label });
  }

  const source = readFileSync(resolved, "utf8");
  // Match both static imports and re-exports: import ... from "X" / export ... from "X"
  const importPattern = /(?:import|export)\s+(?:[\s\S]*?\s+from\s+)?["']([^"']+)["']|import\s*\(\s*["']([^"']+)["']\s*\)/g;
  let match;
  while ((match = importPattern.exec(source)) !== null) {
    const specifier = match[1] ?? match[2];

    if (forbiddenSpecifier(specifier)) {
      violations.push({ file: resolved.replace(root + "/", "dist/"), specifier });
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
