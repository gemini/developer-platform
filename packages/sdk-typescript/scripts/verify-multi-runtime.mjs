/**
 * Verify the SDK works across Node, Bun, Deno, and Cloudflare Workers.
 *
 * Packs the SDK tarball, installs it in a temp directory, then runs a minimal
 * consumer script under each runtime. Each consumer imports from both entry
 * points (where applicable), constructs core classes, and exercises Web Crypto.
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

// Deno: prefer PATH (CI uses setup-deno), fall back to ~/.deno/bin (local install)
function findDeno() {
  try { execFileSync("deno", ["--version"], { stdio: "pipe" }); return "deno"; } catch {}
  const local = join(process.env.HOME, ".deno", "bin", "deno");
  try { execFileSync(local, ["--version"], { stdio: "pipe" }); return local; } catch {}
  return null;
}
const DENO = process.env.DENO_BIN || findDeno();

// --- Consumer scripts ---

const BROWSER_CONSUMER = `
import {
  GeminiMarkets,
  GeminiWebSocket,
  WsSession,
  BrowserOAuthAuth,
  MarketDataRest,
  HttpTransport,
} from "gemini-markets/browser";

// Verify core construction works
const client = new GeminiMarkets({ env: "sandbox" });
assert(client.marketData instanceof MarketDataRest, "marketData must be MarketDataRest");
assert(typeof client.websocket.trades === "function", "websocket.trades must be a function");

// Verify BrowserOAuthAuth exists and is constructible (type-level restriction only)
assert(typeof BrowserOAuthAuth === "function", "BrowserOAuthAuth must be exported");

// Verify WebSocket classes exist
const ws = new GeminiWebSocket({ url: "wss://example.test" });
const session = new WsSession({ url: "wss://example.test" });

// Verify HttpTransport exists
assert(typeof HttpTransport === "function", "HttpTransport must be exported");

client.close();
ws.close();
session.close();
console.log("browser entry: OK");
`;

const SERVER_CONSUMER = `
import {
  HmacAuth,
  createClient,
  OAuthAuth,
  serverSocketFactory,
  initServerWebSocket,
} from "gemini-markets/server";

// Verify HMAC auth constructs and uses Web Crypto
const auth = new HmacAuth({ apiKey: "test-key", apiSecret: "test-secret" });
const headers = await auth.credentialHeaders("dGVzdA==");
assert(headers["X-GEMINI-APIKEY"] === "test-key", "HMAC must set API key header");
assert(typeof headers["X-GEMINI-SIGNATURE"] === "string" && headers["X-GEMINI-SIGNATURE"].length > 0, "HMAC must produce signature");

// Verify OAuthAuth is re-exported from server
assert(typeof OAuthAuth === "function", "OAuthAuth must be re-exported from server");

// Verify server-only exports exist
assert(typeof serverSocketFactory === "function", "serverSocketFactory must be exported");
assert(typeof initServerWebSocket === "function", "initServerWebSocket must be exported");

// Verify createClient works (REST-only, skip ws init)
const client = await createClient({ env: "sandbox", skipWsInit: true });
assert(typeof client.marketData === "object", "server client must have marketData");
client.close();

console.log("server entry: OK");
`;

// Workers can't use server entry (ws dep). Test browser entry only.
const WORKER_CONSUMER = `
import {
  GeminiMarkets,
  BrowserOAuthAuth,
  MarketDataRest,
  HttpTransport,
} from "gemini-markets/browser";

export default {
  async fetch() {
    const client = new GeminiMarkets({ env: "sandbox" });
    const checks = [
      client.marketData instanceof MarketDataRest,
      typeof client.websocket.trades === "function",
      typeof BrowserOAuthAuth === "function",
      typeof HttpTransport === "function",
    ];
    client.close();
    const ok = checks.every(Boolean);
    return new Response(ok ? "OK" : "FAIL: " + JSON.stringify(checks), {
      status: ok ? 200 : 500,
    });
  }
};
`;

// --- Helpers ---

function run(label, fn) {
  try {
    fn();
    console.log(`✔ ${label}`);
  } catch (error) {
    console.error(`✖ ${label}`);
    console.error(error.message || error);
    if (error.stderr) console.error(error.stderr.toString());
    process.exitCode = 1;
  }
}

function hasRuntime(name, binary) {
  try {
    execFileSync(binary, ["--version"], { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

// --- Main ---

const temp = mkdtempSync(join(tmpdir(), "gemini-multi-runtime-"));
try {
  // Pack the SDK
  const packed = JSON.parse(
    execFileSync("npm", ["pack", "--json", "--pack-destination", temp, "--cache", join(temp, ".npm")], {
      encoding: "utf8",
      cwd: resolve("."),
    }),
  )[0];

  // Set up a consumer project with the packed tarball
  writeFileSync(
    join(temp, "package.json"),
    JSON.stringify({ type: "module", dependencies: { "gemini-markets": `file:./${packed.filename}` } }),
  );
  execFileSync("npm", ["install", "--ignore-scripts", "--no-package-lock", "--cache", join(temp, ".npm")], {
    cwd: temp,
    stdio: "pipe",
  });

  // Write consumer scripts
  writeFileSync(join(temp, "browser-consumer.mjs"), `import assert from "node:assert/strict";\n${BROWSER_CONSUMER}`);
  writeFileSync(join(temp, "server-consumer.mjs"), `import assert from "node:assert/strict";\n${SERVER_CONSUMER}`);

  // --- Node ---
  run("Node (browser entry)", () => {
    execFileSync("node", ["browser-consumer.mjs"], { cwd: temp, stdio: "pipe" });
  });
  run("Node (server entry)", () => {
    execFileSync("node", ["server-consumer.mjs"], { cwd: temp, stdio: "pipe" });
  });

  // --- Bun ---
  if (hasRuntime("Bun", "bun")) {
    run("Bun (browser entry)", () => {
      execFileSync("bun", ["run", "browser-consumer.mjs"], { cwd: temp, stdio: "pipe" });
    });
    run("Bun (server entry)", () => {
      execFileSync("bun", ["run", "server-consumer.mjs"], { cwd: temp, stdio: "pipe" });
    });
  } else {
    console.log("⊘ Bun: not installed, skipping");
  }

  // --- Deno ---
  if (DENO && hasRuntime("Deno", DENO)) {
    // Deno 2.x with file: specifiers needs --node-modules-dir=manual
    run("Deno (browser entry)", () => {
      execFileSync(DENO, ["run", "--allow-all", "--node-modules-dir=manual", "browser-consumer.mjs"], {
        cwd: temp,
        stdio: "pipe",
      });
    });
    run("Deno (server entry)", () => {
      execFileSync(DENO, ["run", "--allow-all", "--node-modules-dir=manual", "server-consumer.mjs"], {
        cwd: temp,
        stdio: "pipe",
      });
    });
  } else {
    console.log("⊘ Deno: not installed, skipping");
  }

  // --- Cloudflare Workers (via Miniflare) ---
  await (async () => {
    try {
      const esbuildBin = join(process.cwd(), "node_modules", ".bin", "esbuild");

      // Write the worker source (no node:assert — use Response status)
      writeFileSync(join(temp, "worker-src.mjs"), WORKER_CONSUMER);

      // Bundle for workers with esbuild
      execFileSync(esbuildBin, [
        join(temp, "worker-src.mjs"),
        "--bundle",
        "--platform=browser",
        "--format=esm",
        "--target=es2022",
        `--outfile=${join(temp, "worker-bundle.mjs")}`,
      ], { stdio: "pipe" });

      // Read the bundle and pass as inline script to avoid workerd path issues
      const bundleScript = readFileSync(join(temp, "worker-bundle.mjs"), "utf8");

      const { Miniflare } = await import("miniflare");
      const mf = new Miniflare({
        modules: true,
        script: bundleScript,
        compatibilityDate: "2024-01-01",
      });

      try {
        const response = await mf.dispatchFetch("http://localhost/");
        const text = await response.text();
        assert.equal(response.status, 200, `Worker returned ${response.status}: ${text}`);
        console.log("✔ Cloudflare Workers (browser entry via Miniflare)");
      } finally {
        await mf.dispose();
      }
    } catch (error) {
      console.error("✖ Cloudflare Workers (browser entry via Miniflare)");
      console.error(error.message || error);
      process.exitCode = 1;
    }
  })();

  if (!process.exitCode) {
    console.log("\nAll multi-runtime checks passed.");
  }
} finally {
  rmSync(temp, { recursive: true, force: true });
}
