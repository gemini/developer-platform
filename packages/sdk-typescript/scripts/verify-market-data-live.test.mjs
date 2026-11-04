import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test, { describe } from "node:test";

import { copyVerifierFiles, exitCodeFor, forwardedNodeExecArgs, OPERATIONS, redact, runPackedVerifier, runVerification, verifyFileEvidence } from "./verify-market-data-live.mjs";

test("operation list covers the generated Market Data contract and file exception", () => {
  const operationsSource = readFileSync(new URL("../src/generated/market-data/operations.ts", import.meta.url), "utf8");
  const generatedNames = [...operationsSource.matchAll(/^  "([^"]+)": \{/gm)].map((match) => match[1]);
  assert.deepEqual(
    new Set(OPERATIONS.map(([name]) => name)),
    new Set([...generatedNames, "getFundingAmountReportFile"]),
  );
});

test("rewrites QA Node options for the packed consumer", () => {
  const root = join("/tmp", "sdk-package");
  assert.deepEqual(forwardedNodeExecArgs(["--use-system-ca", "--env-file=.env.qa", "--import", "./scripts/qa-bootstrap.mjs"], root), [
    "--use-system-ca",
    `--env-file=${join(root, ".env.qa")}`,
    "--import",
    new URL(`file://${join(root, "scripts", "qa-bootstrap.mjs")}`).href,
  ]);
});

test("does not add Node options in live mode", () => {
  assert.deepEqual(forwardedNodeExecArgs([], "/tmp/sdk-package"), []);
});

describe("packed verifier setup", () => {
  test("copies every module required by the packed verifier", () => {
    const root = new URL("..", import.meta.url);
    const tempDir = mkdtempSync(join(tmpdir(), "market-data-verifier-"));
    try {
      copyVerifierFiles(fileURLToPath(root), tempDir);
      execFileSync(process.execPath, [
        "--input-type=module",
        "--eval",
        'const { boundaryValueKind } = await import("./runtime-value.mjs"); await import("./verify-market-data-live.mjs"); if (boundaryValueKind("ok") !== "string") process.exit(1);',
      ], { cwd: tempDir, stdio: "pipe" });
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test("packed verifier caller prepares the shared runtime files", () => {
    let copied = false;
    const status = runPackedVerifier({
      execFile: (_command, args) => args[0] === "pack" ? JSON.stringify([{ filename: "sdk.tgz" }]) : "",
      copyFiles: () => { copied = true; },
      spawn: () => ({ status: 0 }),
    });

    assert.equal(status, 0);
    assert.equal(copied, true);
  });
});

test("redact removes credentials and request authentication fields", () => {
  const value = redact({ authorization: "Bearer secret", auth: "Token secret", "X-GEMINI-APIKEY": "key", "X-GEMINI-SIGNATURE": "signature", payload: "payload", nested: "apiSecret=secret" });
  assert.deepEqual(value, { authorization: "[REDACTED]", auth: "[REDACTED]", "X-GEMINI-APIKEY": "[REDACTED]", "X-GEMINI-SIGNATURE": "[REDACTED]", payload: "[REDACTED]", nested: "apiSecret=[REDACTED]" });
});

test("redact removes colon-form authentication strings and supplied secrets", () => {
  const value = redact("Authorization: Token bearer-secret auth: Basic basic-secret X-GEMINI-PAYLOAD: payload-secret X-GEMINI-SIGNATURE: signature-secret X-GEMINI-APIKEY: key-secret direct-secret", ["direct-secret"]);
  assert.doesNotMatch(value, /bearer-secret|basic-secret|payload-secret|signature-secret|key-secret|direct-secret/);
  assert.match(value, /\[REDACTED\]/);
});

test("missing marketData blocks all operations and writes reports", async () => {
  const reportDir = mkdtempSync(join(tmpdir(), "market-data-test-"));
  try {
    const results = await runVerification({ reportDir, loadSdk: async () => ({ createClient: async () => ({ close() {} }) }) });
    assert.equal(results.operations.length, 16);
    assert(results.operations.every((operation) => operation.status === "blocked" && operation.message === "Prerequisite missing: @gemini-markets/sdk createClient marketData facade is not available in the packed package."));
    assert.equal(JSON.parse(readFileSync(join(reportDir, "results.json"))).operations.length, 16);
    assert.match(readFileSync(join(reportDir, "summary.md"), "utf8"), /16 blocked/);
  } finally { rmSync(reportDir, { recursive: true, force: true }); }
});

test("missing credentials block exactly authenticated operations", async () => {
  const reportDir = mkdtempSync(join(tmpdir(), "market-data-test-"));
  const methods = Object.fromEntries(["listSymbols", "getSymbolDetails", "getTicker", "getTickerV2", "getCurrentOrderBook", "listTrades", "listPrices", "listCandles", "listDerivativeCandles", "listFeePromos", "getFundingAmount", "getNextFundingTimestamp", "getFundingAmountReportFile"].map((name) => [name, async () => name === "listSymbols" ? ["btcusd", "btcgusdperp"] : name === "getFundingAmountReportFile" ? { bytes: new Uint8Array([1]), contentType: "application/octet-stream", contentDisposition: "attachment; filename=report.xlsx" } : {}]));
  try {
    const results = await runVerification({ reportDir, env: {}, loadSdk: async () => ({ createClient: async () => ({ marketData: methods, close() {} }) }) });
    assert.deepEqual(results.operations.filter((operation) => operation.status === "blocked").map((operation) => operation.name), ["getAssetsForNetwork", "getTokenNetworkV2", "getFXRate"]);
  } finally { rmSync(reportDir, { recursive: true, force: true }); }
});

test("missing facade methods are blocked, not failed", async () => {
  const reportDir = mkdtempSync(join(tmpdir(), "market-data-test-"));
  const methods = { async listSymbols() { return ["btcusd", "btcgusdperp"]; } };
  try {
    const results = await runVerification({ reportDir, env: {}, loadSdk: async () => ({ createClient: async () => ({ marketData: methods, close() {} }) }) });
    assert.equal(results.operations.find((operation) => operation.name === "getTicker").status, "blocked");
  } finally { rmSync(reportDir, { recursive: true, force: true }); }
});

test("uses generated Market Data arguments and runs FX when token lookup fails", async () => {
  const reportDir = mkdtempSync(join(tmpdir(), "market-data-test-"));
  const calls = [];
  const originalNow = Date.now;
  const methods = Object.fromEntries(["listSymbols", "getSymbolDetails", "getTicker", "getTickerV2", "getCurrentOrderBook", "listTrades", "listPrices", "listCandles", "listDerivativeCandles", "listFeePromos", "getFundingAmount", "getNextFundingTimestamp", "getFundingAmountReportFile", "getAssetsForNetwork", "getTokenNetworkV2", "getFXRate"].map((name) => [name, async (...args) => {
    calls.push([name, args]);
    if (name === "listSymbols") return ["btcusd", "btcgusdperp"];
    if (name === "getTokenNetworkV2") throw new Error("token lookup failed");
    if (name === "getFundingAmountReportFile") return { bytes: new Uint8Array([1]), contentType: "application/octet-stream", contentDisposition: "attachment; filename=report.xlsx" };
    return {};
  }]));
  try {
    Date.now = () => 1770000000000;
    await runVerification({ reportDir, env: { GEMINI_API_KEY: "key-secret", GEMINI_API_SECRET: "secret-value", GEMINI_MD_DERIVATIVE_SYMBOL: "btcgusdperp" }, loadSdk: async () => ({ createClient: async () => ({ marketData: methods, close() {} }), HmacAuth: class {} }) });
    assert.deepEqual(Object.fromEntries(calls), {
      listSymbols: [], getSymbolDetails: [{ symbol: "btcusd" }], getTicker: [{ symbol: "btcusd" }], getTickerV2: [{ symbol: "btcusd" }], getCurrentOrderBook: [{ symbol: "btcusd", limit_bids: 1, limit_asks: 1 }], listTrades: [{ symbol: "btcusd", limit_trades: 1 }], listPrices: [], listCandles: [{ symbol: "btcusd", time_frame: "1m" }], listDerivativeCandles: [{ symbol: "btcgusdperp", time_frame: "1m" }], listFeePromos: [], getFundingAmount: [{ symbol: "btcgusdperp" }], getNextFundingTimestamp: [{ symbol: "btcgusdperp" }], getFundingAmountReportFile: [{ symbol: "btcgusdperp" }], getTokenNetworkV2: [{ token: "USDC" }], getFXRate: [{ symbol: "EURUSD", timestamp: 1770000000000 }],
    });
    assert(!calls.some(([name]) => name === "getAssetsForNetwork"));
  } finally { Date.now = originalNow; rmSync(reportDir, { recursive: true, force: true }); }
});

test("discovers lowercase derivative symbols by default", async () => {
  const reportDir = mkdtempSync(join(tmpdir(), "market-data-test-"));
  const calls = [];
  const methods = Object.fromEntries(["listSymbols", "getSymbolDetails", "getTicker", "getTickerV2", "getCurrentOrderBook", "listTrades", "listPrices", "listCandles", "listDerivativeCandles", "listFeePromos", "getFundingAmount", "getFundingAmountReportFile"].map((name) => [name, async (...args) => {
    calls.push([name, args]);
    if (name === "listSymbols") return ["btcusd", "avaxgusdperp"];
    if (name === "getFundingAmountReportFile") return { bytes: new Uint8Array([1]), contentType: "application/octet-stream", contentDisposition: "attachment; filename=report.xlsx" };
    return {};
  }]));
  try {
    const results = await runVerification({ reportDir, env: {}, loadSdk: async () => ({ createClient: async () => ({ marketData: methods, close() {} }) }) });
    assert.deepEqual(calls.find(([name]) => name === "listDerivativeCandles"), ["listDerivativeCandles", [{ symbol: "avaxgusdperp", time_frame: "1m" }]]);
    assert.deepEqual(calls.find(([name]) => name === "getFundingAmount"), ["getFundingAmount", [{ symbol: "avaxgusdperp" }]]);
    assert.deepEqual(calls.find(([name]) => name === "getFundingAmountReportFile"), ["getFundingAmountReportFile", [{ symbol: "avaxgusdperp" }]]);
    assert.equal(results.operations.find((operation) => operation.name === "listDerivativeCandles").status, "passed");
    assert.equal(results.operations.find((operation) => operation.name === "getFundingAmountReportFile").status, "passed");
  } finally { rmSync(reportDir, { recursive: true, force: true }); }
});

test("symbol discovery failure still exercises symbol-free public operations", async () => {
  const reportDir = mkdtempSync(join(tmpdir(), "market-data-test-"));
  const calls = [];
  const methods = {
    async listSymbols() { calls.push("listSymbols"); throw new Error("symbols unavailable"); },
    async listPrices() { calls.push("listPrices"); return {}; },
    async listFeePromos() { calls.push("listFeePromos"); return {}; },
  };
  try {
    const results = await runVerification({ reportDir, env: {}, loadSdk: async () => ({ createClient: async () => ({ marketData: methods, close() {} }) }) });
    assert.deepEqual(calls, ["listSymbols", "listPrices", "listFeePromos"]);
    assert.equal(results.operations.find((operation) => operation.name === "listPrices").status, "passed");
    assert.equal(results.operations.find((operation) => operation.name === "listFeePromos").status, "passed");
  } finally { rmSync(reportDir, { recursive: true, force: true }); }
});

test("reports redact authentication headers and environment secrets", async () => {
  const reportDir = mkdtempSync(join(tmpdir(), "market-data-test-"));
  const secret = "direct-secret";
  const methods = Object.fromEntries(["listSymbols", "getSymbolDetails", "getTicker", "getTickerV2", "getCurrentOrderBook", "listTrades", "listPrices", "listCandles", "listDerivativeCandles", "listFeePromos", "getFundingAmount", "getFundingAmountReportFile"].map((name) => [name, async () => {
    if (name === "listSymbols") return ["btcusd", "btcgusdperp"];
    throw new Error(`Authorization: Bearer bearer-secret X-GEMINI-PAYLOAD: payload-secret X-GEMINI-SIGNATURE: signature-secret X-GEMINI-APIKEY: key-secret ${secret}`);
  }]));
  try {
    await runVerification({ reportDir, env: { GEMINI_API_KEY: "key-secret", GEMINI_API_SECRET: secret }, loadSdk: async () => ({ createClient: async () => ({ marketData: methods, close() {} }), HmacAuth: class {} }) });
    for (const report of [readFileSync(join(reportDir, "results.json"), "utf8"), readFileSync(join(reportDir, "summary.md"), "utf8")]) {
      assert.doesNotMatch(report, /bearer-secret|payload-secret|signature-secret|key-secret|direct-secret/);
      assert.match(report, /\[REDACTED\]/);
    }
  } finally { rmSync(reportDir, { recursive: true, force: true }); }
});

test("file evidence rejects empty bytes and retains only metadata", async () => {
  assert.throws(() => verifyFileEvidence({ bytes: new Uint8Array(), headers: { "content-type": "application/vnd.ms-excel", "content-disposition": "attachment; filename=report.xlsx" } }), /empty/);
  assert.throws(() => verifyFileEvidence({ body: new ReadableStream(), headers: { "content-type": "application/vnd.ms-excel", "content-disposition": "attachment; filename=report.xlsx" } }), /byteLength/);
  assert.throws(() => verifyFileEvidence({ bytes: new Uint8Array([1]), headers: { "content-type": "application/vnd.ms-excel" } }), /content disposition/);
  assert.deepEqual(verifyFileEvidence({ bytes: new Uint8Array([1]), contentType: "application/vnd.ms-excel", contentDisposition: "attachment; filename=report.xlsx" }), { byteLength: 1, contentType: "application/vnd.ms-excel", contentDisposition: "attachment; filename=report.xlsx" });
  assert.deepEqual(verifyFileEvidence({ bytes: new Uint8Array([1]), headers: { "Content-Type": "application/vnd.ms-excel", "Content-Disposition": "attachment; filename=report.xlsx" } }), { byteLength: 1, contentType: "application/vnd.ms-excel", contentDisposition: "attachment; filename=report.xlsx" });
  assert.deepEqual(verifyFileEvidence({ bytes: new Uint8Array([1]), headers: { "content-type": "application/vnd.ms-excel", "content-disposition": "attachment; filename=report.xlsx" } }), { byteLength: 1, contentType: "application/vnd.ms-excel", contentDisposition: "attachment; filename=report.xlsx" });
});

test("exit aggregation fails for blocked or failed operations", () => {
  assert.equal(exitCodeFor([{ status: "passed" }]), 0);
  assert.equal(exitCodeFor([{ status: "blocked" }]), 1);
  assert.equal(exitCodeFor([{ status: "failed" }]), 1);
});
