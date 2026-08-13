import { execFileSync, spawnSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const PREREQUISITE = "Prerequisite missing: gemini-markets GeminiMarkets.marketData facade is not available in the packed package.";
export const OPERATIONS = [
  ["listSymbols", "public JSON"],
  ["getSymbolDetails", "public JSON"],
  ["getTicker", "public JSON"],
  ["getTickerV2", "public JSON"],
  ["getCurrentOrderBook", "public JSON"],
  ["listTrades", "public JSON"],
  ["listPrices", "public JSON"],
  ["listCandles", "public JSON"],
  ["listDerivativeCandles", "public JSON"],
  ["listFeePromos", "public JSON"],
  ["getFundingAmount", "public JSON"],
  ["getAssetsForNetwork", "authenticated JSON"],
  ["getTokenNetworkV2", "authenticated JSON"],
  ["getFXRate", "authenticated JSON"],
  ["getFundingAmountReportFile", "public file"],
];
const AUTHENTICATED = new Set(["getAssetsForNetwork", "getTokenNetworkV2", "getFXRate"]);

export function redact(value, secrets = []) {
  if (Array.isArray(value)) return value.map((item) => redact(item, secrets));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => {
      const sensitive = /authorization|auth|api[-_]?key|api[-_]?secret|signature|payload/i.test(key);
      return sensitive ? [key, "[REDACTED]"] : [key, redact(item, secrets)];
    }));
  }
  if (typeof value !== "string") return value;
  let redacted = value;
  for (const secret of secrets) if (secret) redacted = redacted.replaceAll(secret, "[REDACTED]");
  return redacted
    .replace(/\b(authorization|auth|x-gemini-(?:api[-_]?key|apikey|payload|signature)|api[-_]?key|api[-_]?secret|signature|payload)(\s*[:=]\s*)(?:[a-z]+\s+)?[^\s,&|]+/gi, "$1$2[REDACTED]")
    .replace(/\b[a-z]+\s+[^\s,&|]+/gi, (match) => /^\s*(?:bearer|token|basic|hmac)\s+/i.test(match) ? match.replace(/\S+$/, "[REDACTED]") : match);
}

export function verifyFileEvidence(response) {
  const responseHeaders = response?.headers instanceof Headers
    ? Object.fromEntries(response.headers)
    : response?.headers ?? {};
  const headers = Object.fromEntries(Object.entries(responseHeaders).map(([key, value]) => [key.toLowerCase(), value]));
  const bytes = response?.bytes ?? response?.body ?? response;
  const byteLength = bytes?.byteLength;
  if (byteLength === undefined) throw new Error("file response has no byteLength");
  if (!Number.isInteger(byteLength) || byteLength <= 0) throw new Error("file response has empty bytes");
  const contentType = response?.contentType ?? headers["content-type"];
  if (!contentType) throw new Error("file response has no content type");
  const contentDisposition = response?.contentDisposition ?? headers["content-disposition"];
  if (!contentDisposition) throw new Error("file response has no content disposition");
  return { byteLength, contentType, contentDisposition };
}

export function exitCodeFor(operations) {
  if (operations.every(({ status }) => status === "passed")) return 0;
  return 1;
}

export function forwardedNodeExecArgs(execArgv, root) {
  const forwarded = [];
  const importSpecifier = (specifier) => {
    if (specifier.startsWith(".") || isAbsolute(specifier)) {
      return pathToFileURL(resolve(root, specifier)).href;
    }
    return specifier;
  };
  for (let index = 0; index < execArgv.length; index += 1) {
    const option = execArgv[index];
    if (option === "--use-system-ca") forwarded.push(option);
    else if (option.startsWith("--env-file=")) forwarded.push(`--env-file=${resolve(root, option.slice("--env-file=".length))}`);
    else if (option === "--env-file" && execArgv[index + 1]) forwarded.push(option, resolve(root, execArgv[++index]));
    else if (option === "--import" && execArgv[index + 1]) forwarded.push(option, importSpecifier(execArgv[++index]));
    else if (option.startsWith("--import=")) forwarded.push(`--import=${importSpecifier(option.slice("--import=".length))}`);
  }
  return forwarded;
}

function verificationFollowUp(operation, message) {
  return {
    title: `${operation} live verification ${message}`,
    body: `Operation: ${operation}\nResult: ${message}\nRe-run npm run verify:market-data:live after the SDK facade and endpoint configuration are available.`,
  };
}

function operationResult(name, kind, status, message, evidence) {
  return {
    name,
    kind,
    status,
    ...(message ? { message } : {}),
    ...(evidence ? { evidence: redact(evidence) } : {}),
    ...(status === "passed" ? {} : { followUp: verificationFollowUp(name, message) }),
  };
}

function writeReports(reportDir, operations, secrets) {
  mkdirSync(reportDir, { recursive: true });
  const redactedOperations = redact(operations, secrets);
  const counts = Object.fromEntries(
    ["passed", "failed", "blocked"].map((status) => [
      status,
      redactedOperations.filter((operation) => operation.status === status).length,
    ]),
  );
  writeFileSync(
    join(reportDir, "results.json"),
    `${JSON.stringify({ generatedAt: new Date().toISOString(), operations: redactedOperations, counts }, null, 2)}\n`,
  );
  writeFileSync(
    join(reportDir, "summary.md"),
    `# Market Data live verification\n\n${counts.passed} passed, ${counts.failed} failed, ${counts.blocked} blocked.\n\n| Operation | Status | Detail |\n| --- | --- | --- |\n${redactedOperations.map((operation) => `| ${operation.name} | ${operation.status} | ${operation.message ?? ""} |`).join("\n")}\n`,
  );
  return { operations: redactedOperations, counts, reportDir };
}

function firstSymbol(symbols) {
  return Array.isArray(symbols) ? symbols.find((symbol) => typeof symbol === "string") : undefined;
}

function networks(networkResponse) {
  return networkResponse?.network ?? networkResponse?.networks ?? [];
}

async function responseBytes(response) {
  if (response instanceof Response) return { bytes: new Uint8Array(await response.arrayBuffer()), headers: response.headers };
  return response;
}

export async function runVerification({ reportDir, env = process.env, loadSdk = () => import(process.argv.includes("--consumer") ? "gemini-markets/server" : "../dist/server/index.js") } = {}) {
  const results = new Map(OPERATIONS.map(([name, kind]) => [name, operationResult(name, kind, "blocked", "Verification did not run.")]));
  const secrets = [env.GEMINI_API_KEY, env.GEMINI_API_SECRET];
  const safeError = (error) => redact(error?.message ?? String(error), secrets);
  let sdk;
  try {
    sdk = await loadSdk();
  } catch (error) {
    for (const [name, kind] of OPERATIONS) results.set(name, operationResult(name, kind, "blocked", `Unable to import gemini-markets: ${safeError(error)}`));
    return writeReports(reportDir, [...results.values()], secrets);
  }
  const publicClient = new sdk.GeminiMarkets({ env: env.GEMINI_MD_ENV ?? "production" });
  if (!publicClient.marketData) {
    publicClient.close?.();
    return writeReports(reportDir, OPERATIONS.map(([name, kind]) => operationResult(name, kind, "blocked", PREREQUISITE)), secrets);
  }
  const call = async (client, name, args = []) => {
    if (typeof client.marketData[name] !== "function") throw new Error("method is not available on GeminiMarkets.marketData");
    return client.marketData[name](...args);
  };
  let symbols;
  try {
    symbols = await call(publicClient, "listSymbols");
    results.set("listSymbols", operationResult("listSymbols", "public JSON", "passed"));
  } catch (error) {
    results.set("listSymbols", operationResult("listSymbols", "public JSON", "failed", safeError(error)));
  }
  const symbol = env.GEMINI_MD_SYMBOL ?? firstSymbol(symbols);
  const derivativeSymbol = env.GEMINI_MD_DERIVATIVE_SYMBOL ?? (Array.isArray(symbols)
    ? symbols.find((candidate) => typeof candidate === "string" && candidate.toUpperCase().includes("PERP"))
    : undefined);
  const publicCalls = [
    ["getSymbolDetails", [{ symbol }], Boolean(symbol), "Required symbol discovery returned no usable symbol."],
    ["getTicker", [{ symbol }], Boolean(symbol), "Required symbol discovery returned no usable symbol."],
    ["getTickerV2", [{ symbol }], Boolean(symbol), "Required symbol discovery returned no usable symbol."],
    ["getCurrentOrderBook", [{ symbol }, { limit_bids: 1, limit_asks: 1 }], Boolean(symbol), "Required symbol discovery returned no usable symbol."],
    ["listTrades", [{ symbol }, { limit_trades: 1 }], Boolean(symbol), "Required symbol discovery returned no usable symbol."],
    ["listPrices", [], true],
    ["listCandles", [{ symbol, time_frame: "1m" }], Boolean(symbol), "Required symbol discovery returned no usable symbol."],
    ["listDerivativeCandles", [{ symbol: derivativeSymbol, time_frame: "1m" }], Boolean(derivativeSymbol), "Required derivative symbol discovery returned no usable symbol."],
    ["listFeePromos", [], true],
    ["getFundingAmount", [{ symbol: derivativeSymbol }], Boolean(derivativeSymbol), "Required derivative symbol discovery returned no usable symbol."],
    ["getFundingAmountReportFile", [{ symbol: derivativeSymbol }], Boolean(derivativeSymbol), "Required derivative symbol discovery returned no usable symbol."],
  ];
  for (const [name, args, canRun, missingReason] of publicCalls) {
    const category = name === "getFundingAmountReportFile" ? "public file" : "public JSON";
    if (!canRun) {
      results.set(name, operationResult(name, category, "blocked", missingReason));
      continue;
    }
    try {
      const response = await call(publicClient, name, args);
      const evidence = name === "getFundingAmountReportFile" ? verifyFileEvidence(await responseBytes(response)) : undefined;
      results.set(name, operationResult(name, category, "passed", undefined, evidence));
    } catch (error) {
      const message = safeError(error);
      const status = message.includes("method is not available") ? "blocked" : "failed";
      results.set(name, operationResult(name, category, status, message));
    }
  }
  const key = env.GEMINI_API_KEY;
  const secret = env.GEMINI_API_SECRET;
  if (!key || !secret) {
    for (const name of AUTHENTICATED) results.set(name, operationResult(name, "authenticated JSON", "blocked", "GEMINI_API_KEY and GEMINI_API_SECRET are required for authenticated verification."));
  } else {
    const authenticatedClient = new sdk.GeminiMarkets({ env: env.GEMINI_MD_ENV ?? "production", auth: new sdk.HmacAuth({ apiKey: key, apiSecret: secret }) });
    try {
      let network;
      try {
        const tokenNetworks = await call(authenticatedClient, "getTokenNetworkV2", [{ token: env.GEMINI_MD_TOKEN ?? "USDC" }]);
        results.set("getTokenNetworkV2", operationResult("getTokenNetworkV2", "authenticated JSON", "passed"));
        network = env.GEMINI_MD_NETWORK ?? firstSymbol(networks(tokenNetworks));
      } catch (error) {
        results.set("getTokenNetworkV2", operationResult("getTokenNetworkV2", "authenticated JSON", "failed", safeError(error)));
        results.set("getAssetsForNetwork", operationResult("getAssetsForNetwork", "authenticated JSON", "failed", "Token network discovery failed."));
      }
      if (results.get("getAssetsForNetwork").status === "blocked") {
        if (!network) {
          results.set("getAssetsForNetwork", operationResult("getAssetsForNetwork", "authenticated JSON", "blocked", "Token network discovery returned no usable network."));
        } else {
          try {
            await call(authenticatedClient, "getAssetsForNetwork", [{ network }]);
            results.set("getAssetsForNetwork", operationResult("getAssetsForNetwork", "authenticated JSON", "passed"));
          } catch (error) {
            results.set("getAssetsForNetwork", operationResult("getAssetsForNetwork", "authenticated JSON", "failed", safeError(error)));
          }
        }
      }
      try {
        await call(authenticatedClient, "getFXRate", [{
          symbol: env.GEMINI_MD_FX_SYMBOL ?? "EURUSD",
          timestamp: env.GEMINI_MD_FX_TIMESTAMP ?? Date.now(),
        }]);
        results.set("getFXRate", operationResult("getFXRate", "authenticated JSON", "passed"));
      } catch (error) {
        results.set("getFXRate", operationResult("getFXRate", "authenticated JSON", "failed", safeError(error)));
      }
    } finally {
      authenticatedClient.close?.();
    }
  }
  publicClient.close?.();
  return writeReports(reportDir, OPERATIONS.map(([name]) => results.get(name)), secrets);
}

function runPackedVerifier() {
  const root = dirname(dirname(fileURLToPath(import.meta.url)));
  const tempDir = mkdtempSync(join(tmpdir(), "gemini-sdk-market-data-"));
  const reportDir = join(root, ".market-data-verification", new Date().toISOString().replace(/[:.]/g, "-"));
  try {
    const packed = JSON.parse(execFileSync("npm", ["pack", "--json", "--pack-destination", tempDir, "--cache", join(tempDir, ".npm")], { cwd: root, encoding: "utf8" }))[0];
    writeFileSync(join(tempDir, "package.json"), JSON.stringify({ type: "module", dependencies: { "gemini-markets": `file:./${packed.filename}` } }));
    execFileSync("npm", ["install", "--ignore-scripts", "--no-package-lock", "--cache", join(tempDir, ".npm")], { cwd: tempDir, stdio: "inherit" });
    cpSync(fileURLToPath(import.meta.url), join(tempDir, "verify-market-data-live.mjs"));
    const verificationProcess = spawnSync(
      process.execPath,
      [...forwardedNodeExecArgs(process.execArgv, root), "verify-market-data-live.mjs", "--consumer", "--report-dir", reportDir],
      { cwd: tempDir, stdio: "inherit", env: process.env },
    );
    if (verificationProcess.error) throw verificationProcess.error;
    return verificationProcess.status ?? 1;
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

async function main() {
  if (process.argv.includes("--consumer")) {
    const reportDir = process.argv[process.argv.indexOf("--report-dir") + 1];
    const verification = await runVerification({ reportDir });
    console.log(`Market Data live verification report: ${verification.reportDir}`);
    process.exitCode = exitCodeFor(verification.operations);
    return;
  }
  process.exitCode = runPackedVerifier();
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) await main();
