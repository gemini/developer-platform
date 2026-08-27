/**
 * Bundle the browser entry point with esbuild and verify the output contains
 * no Node-only references. This catches dynamic imports, tree-shaking failures,
 * and issues the static import scanner (verify-browser-imports.mjs) misses.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const NODE_BUILTINS = "assert|async_hooks|buffer|child_process|cluster|console|constants|crypto|dgram|diagnostics_channel|dns|domain|events|fs|http|http2|https|module|net|os|path|perf_hooks|process|punycode|querystring|readline|repl|stream|string_decoder|sys|timers|tls|trace_events|tty|url|util|v8|vm|wasi|worker_threads|zlib";
const FORBIDDEN_PATTERNS = [
  new RegExp(`\\b(?:require\\s*\\(|import\\s*\\()\\s*["'](?:node:(?:${NODE_BUILTINS})|(?:${NODE_BUILTINS})|ws(?:/[^"']*)?)["']`, "g"),
  new RegExp(`\\bfrom\\s+["'](?:node:(?:${NODE_BUILTINS})|(?:${NODE_BUILTINS})|ws(?:/[^"']*)?)["']`, "g"),
];
const FORBIDDEN_INPUTS = [
  { pattern: /(?:^|\/)websocket\/server\.js$/, label: "server WebSocket implementation" },
  { pattern: /(?:^|\/)websocket\/auth\.js$/, label: "server WebSocket authentication" },
  { pattern: /(?:^|\/)server\/ws-factory\.js$/, label: "server WebSocket factory" },
  { pattern: /(?:^|\/)server\/index\.js$/, label: "server entry point" },
  { pattern: /(?:^|\/)auth\/hmac\.js$/, label: "HMAC authentication" },
  { pattern: /(?:^|\/)(?:client\/server|gemini-markets)\.js$/, label: "server GeminiMarkets implementation" },
];

const temp = mkdtempSync(join(tmpdir(), "gemini-browser-bundle-"));
const outfile = join(temp, "browser-bundle.js");
const metafile = join(temp, "browser-bundle-meta.json");

try {
  const entry = resolve("dist/browser/index.js");

  execFileSync(
    join(process.cwd(), "node_modules", ".bin", "esbuild"),
    [
      entry,
      "--bundle",
      "--platform=browser",
      "--format=esm",
      "--target=es2022",
      `--outfile=${outfile}`,
      `--metafile=${metafile}`,
      // Don't error on missing externals — we want to see if they leak into output
      "--log-level=warning",
    ],
    { stdio: "pipe", encoding: "utf8" },
  );

  const bundle = readFileSync(outfile, "utf8");
  const inputs = Object.keys(JSON.parse(readFileSync(metafile, "utf8")).inputs);
  const violations = [];

  for (const input of inputs) {
    const forbidden = FORBIDDEN_INPUTS.find(({ pattern }) => pattern.test(input.replaceAll("\\", "/")));
    if (forbidden) {
      violations.push(`${forbidden.label} reached browser bundle: ${input}`);
    }
  }

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

  for (const symbol of ["order.place", "rfq.submit_quote", "X-GEMINI-NONCE", "privateSession"]) {
    if (bundle.includes(symbol)) violations.push(`private WebSocket symbol found in browser bundle: ${symbol}`);
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
