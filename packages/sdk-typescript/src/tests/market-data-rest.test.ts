import assert from "node:assert/strict";
import { hmacSha384Hex } from "../core/encoding.js";
import test from "node:test";

import { MarketDataRest } from "../generated/market-data/rest.js";
import {
  HmacAuth,
  type HttpMethod,
  HttpTransport,
  OAuthAuth,
  parseLosslessJson,
  SdkError,
} from "../server/index.js";
import { fromBase64 } from "../core/encoding.js";

type Request = {
  url: string;
  init: { method: HttpMethod; headers: Record<string, string>; body?: string };
};

const jsonHeaders = { get: (name: string) => name.toLowerCase() === "content-type" ? "application/json" : null };

test("all Market Data wrappers route to their documented REST endpoints", async () => {
  const requests: Request[] = [];
  const auth = new HmacAuth({ apiKey: "key", apiSecret: "secret", now: () => 1000 });
  const rest = new MarketDataRest(new HttpTransport({
    env: "sandbox",
    auth,
    fetchImpl: async (url, init) => {
      requests.push({ url, init });
      if (url.includes("/v1/trades/")) {
        return { status: 200, headers: jsonHeaders, async text() { return "[]"; } };
      }
      if (url.includes("records.xlsx")) {
        return {
          status: 200,
          headers: { get: (name: string) => name.toLowerCase() === "content-type" ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" : null },
          async arrayBuffer() { return new Uint8Array([1]).buffer; },
          async text() { throw new Error("file endpoint verification should not read text"); },
        };
      }
      return { status: 200, headers: jsonHeaders, async text() { return "{}"; } };
    },
  }));

  const cases: {
    name: string;
    signed: boolean;
    url: string;
    call: () => Promise<unknown>;
  }[] = [
    {
      name: "listSymbols",
      signed: false,
      url: "https://api.sandbox.gemini.com/v1/symbols",
      call: () => rest.listSymbols(),
    },
    {
      name: "getSymbolDetails",
      signed: false,
      url: "https://api.sandbox.gemini.com/v1/symbols/details/BTC%2FUSD",
      call: () => rest.getSymbolDetails({ symbol: "BTC/USD" }),
    },
    {
      name: "getAssetsForNetwork",
      signed: true,
      url: "https://api.sandbox.gemini.com/v2/networks/base%2Fmain/assets",
      call: () => rest.getAssetsForNetwork({ network: "base/main" }),
    },
    {
      name: "getTokenNetworkV2",
      signed: true,
      url: "https://api.sandbox.gemini.com/v2/network/USDC",
      call: () => rest.getTokenNetworkV2({ token: "USDC" }),
    },
    {
      name: "getTicker",
      signed: false,
      url: "https://api.sandbox.gemini.com/v1/pubticker/BTCUSD",
      call: () => rest.getTicker({ symbol: "BTCUSD" }),
    },
    {
      name: "listFeePromos",
      signed: false,
      url: "https://api.sandbox.gemini.com/v1/feepromos",
      call: () => rest.listFeePromos(),
    },
    {
      name: "getCurrentOrderBook",
      signed: false,
      url: "https://api.sandbox.gemini.com/v1/book/BTCUSD?limit_bids=1&limit_asks=2",
      call: () => rest.getCurrentOrderBook({ symbol: "BTCUSD" }, { limit_bids: 1, limit_asks: 2 }),
    },
    {
      name: "listTrades",
      signed: false,
      url: "https://api.sandbox.gemini.com/v1/trades/ETHUSD?timestamp=1700000000000&since_tid=123&include_breaks=true",
      call: () => rest.listTrades(
        { symbol: "ETHUSD" },
        { timestamp: 1700000000000n, since_tid: 123, include_breaks: true },
      ),
    },
    {
      name: "listPrices",
      signed: false,
      url: "https://api.sandbox.gemini.com/v1/pricefeed",
      call: () => rest.listPrices(),
    },
    {
      name: "getFundingAmount",
      signed: false,
      url: "https://api.sandbox.gemini.com/v1/fundingamount/BTCGUSDPERP",
      call: () => rest.getFundingAmount({ symbol: "BTCGUSDPERP" }),
    },
    {
      name: "getFundingAmountReportFile",
      signed: false,
      url: "https://api.sandbox.gemini.com/v1/fundingamountreport/records.xlsx?symbol=BTCGUSDPERP&fromDate=2026-01-01&toDate=2026-01-31&numRows=10",
      call: () => rest.getFundingAmountReportFile({
        symbol: "BTCGUSDPERP",
        fromDate: "2026-01-01",
        toDate: "2026-01-31",
        numRows: 10,
      }),
    },
    {
      name: "getTickerV2",
      signed: false,
      url: "https://api.sandbox.gemini.com/v2/ticker/BTCUSD",
      call: () => rest.getTickerV2({ symbol: "BTCUSD" }),
    },
    {
      name: "listCandles",
      signed: false,
      url: "https://api.sandbox.gemini.com/v2/candles/BTCUSD/1m",
      call: () => rest.listCandles({ symbol: "BTCUSD", time_frame: "1m" }),
    },
    {
      name: "listDerivativeCandles",
      signed: false,
      url: "https://api.sandbox.gemini.com/v2/derivatives/candles/BTCGUSDPERP/1m",
      call: () => rest.listDerivativeCandles({ symbol: "BTCGUSDPERP", time_frame: "1m" }),
    },
    {
      name: "getFXRate",
      signed: true,
      url: "https://api.sandbox.gemini.com/v2/fxrate/EURUSD/1591084414622",
      call: () => rest.getFXRate({ symbol: "EURUSD", timestamp: 1591084414622n }),
    },
  ];

  for (const [index, route] of cases.entries()) {
    await route.call();
    const request = requests[index]!;
    assert.equal(request.init.method, "GET", route.name);
    assert.equal(request.url, route.url, route.name);
    assert.equal(request.init.body, undefined, route.name);
    assert.ok(request.init.headers.Accept, route.name);
    if (!route.signed) continue;
    const encoded = request.init.headers["X-GEMINI-PAYLOAD"]!;
    const payload = parseLosslessJson(fromBase64(encoded)) as Record<string, unknown>;
    assert.equal(payload.request, new URL(route.url).pathname, route.name);
    assert.equal(payload.nonce, 1000 + requests.slice(0, index).filter(({ init }) =>
      "X-GEMINI-PAYLOAD" in init.headers
    ).length);
    assert.equal(request.init.headers["X-GEMINI-APIKEY"], "key", route.name);
    assert.equal(
      request.init.headers["X-GEMINI-SIGNATURE"],
      await hmacSha384Hex("secret", encoded),
      route.name,
    );
  }

  assert.equal(requests.length, cases.length);
});

test("order book snapshots preserve documented dummy timestamp strings", async () => {
  const rest = new MarketDataRest(new HttpTransport({
    env: "sandbox",
    fetchImpl: async () => ({
      status: 200,
      headers: jsonHeaders,
      async text() {
        return JSON.stringify({
          asks: [{ price: "3607.86", amount: "14.68205084", timestamp: "1547147541" }],
          bids: [{ price: "3607.85", amount: "6.643373", timestamp: "1547147541" }],
        });
      },
    }),
  }));

  const book = await rest.getCurrentOrderBook({ symbol: "BTCUSD" });

  assert.equal(book.asks?.[0]?.timestamp, "1547147541");
  assert.equal(book.bids?.[0]?.timestamp, "1547147541");
});

test("candle operations return top-level candle arrays", async () => {
  const candles = [[1559755800000, 7781.6, 7820.23, 7776.56, 7819.39, 34.7624802159]];
  const rest = new MarketDataRest(new HttpTransport({
    env: "sandbox",
    fetchImpl: async () => ({
      status: 200,
      headers: jsonHeaders,
      async text() { return JSON.stringify(candles); },
    }),
  }));

  assert.deepEqual(await rest.listCandles({ symbol: "BTCUSD", time_frame: "1m" }), candles);
  assert.deepEqual(await rest.listDerivativeCandles({ symbol: "BTCGUSDPERP", time_frame: "1m" }), candles);
});

test("public Market Data file operations return bytes and response metadata", async () => {
  const requests: Request[] = [];
  const fileBytes = new Uint8Array([0, 1, 255]);
  const rest = new MarketDataRest(new HttpTransport({
    env: "sandbox",
    fetchImpl: async (url, init) => {
      requests.push({ url, init });
      return {
        status: 200,
        headers: {
          get(name: string) {
            const headers: Record<string, string> = {
              "content-disposition": "attachment; filename=report.xlsx",
              "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            };
            return headers[name.toLowerCase()] ?? null;
          },
        },
        async text() { throw new Error("file success responses should not be read as text"); },
        async arrayBuffer() { return fileBytes.buffer.slice(fileBytes.byteOffset, fileBytes.byteOffset + fileBytes.byteLength); },
      };
    },
  }));

  const response = await rest.getFundingAmountReportFile({ symbol: "BTCGUSDPERP" });

  assert.deepEqual(response.bytes, fileBytes);
  assert.equal(
    response.contentType,
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  );
  assert.equal(response.contentDisposition, "attachment; filename=report.xlsx");
  assert.equal(
    requests[0]?.url,
    "https://api.sandbox.gemini.com/v1/fundingamountreport/records.xlsx?symbol=BTCGUSDPERP",
  );
  assert.equal(requests[0]?.init.method, "GET");
      assert.ok(requests[0]?.init.headers.Accept);
  assert.equal(requests[0]?.init.body, undefined);
});

test("public Market Data file operations preserve CSV bytes without decoding", async () => {
  const csv = new TextEncoder().encode("symbol,amount\nBTCGUSDPERP,1.25\n");
  const rest = new MarketDataRest(new HttpTransport({
    env: "sandbox",
    fetchImpl: async () => ({
      status: 200,
      headers: {
        get(name: string) {
          const headers: Record<string, string> = {
            "content-disposition": "attachment; filename=report.csv",
            "content-type": "text/csv",
          };
          return headers[name.toLowerCase()] ?? null;
        },
      },
      async text() { throw new Error("csv file responses should not be read as text"); },
      async arrayBuffer() { return csv.buffer.slice(csv.byteOffset, csv.byteOffset + csv.byteLength); },
    }),
  }));

  const response = await rest.getFundingAmountReportFile({ symbol: "BTCGUSDPERP" });

  assert.deepEqual(response.bytes, csv);
  assert.equal(response.contentType, "text/csv");
  assert.equal(response.contentDisposition, "attachment; filename=report.csv");
});

test("authenticated Market Data operations use HMAC through the transport", async () => {
  const requests: Request[] = [];
  const auth = new HmacAuth({ apiKey: "key", apiSecret: "secret", now: () => 1000 });
  const rest = new MarketDataRest(new HttpTransport({
    env: "sandbox",
    auth,
    fetchImpl: async (url, init) => {
      requests.push({ url, init });
      return { status: 200, headers: jsonHeaders, async text() { return "{}"; } };
    },
  }));

  await rest.getAssetsForNetwork({ network: "base/main" });
  await rest.getTokenNetworkV2({ token: "USDC" });
  await rest.getFXRate({ symbol: "EURUSD", timestamp: "2025-04-16T23:07:27.189Z" });
  await rest.getFXRate({ symbol: "EURUSD", timestamp: 1591084414622n });

  assert.deepEqual(requests.map(({ init }) => init.method), ["GET", "GET", "GET", "GET"]);
  assert.deepEqual(requests.map(({ url }) => new URL(url).pathname), [
    "/v2/networks/base%2Fmain/assets",
    "/v2/network/USDC",
    "/v2/fxrate/EURUSD/2025-04-16T23:07:27.189Z",
    "/v2/fxrate/EURUSD/1591084414622",
  ]);
  const payloads = requests.map(({ init }) =>
    parseLosslessJson(fromBase64(init.headers["X-GEMINI-PAYLOAD"]!)) as Record<string, unknown>
  );
  assert.deepEqual(payloads.map((payload) => payload.request), [
    "/v2/networks/base%2Fmain/assets",
    "/v2/network/USDC",
    "/v2/fxrate/EURUSD/2025-04-16T23:07:27.189Z",
    "/v2/fxrate/EURUSD/1591084414622",
  ]);
  assert.deepEqual(payloads.map((payload) => payload.nonce), [1000, 1001, 1002, 1003]);
  for (const { init } of requests) {
    const payload = init.headers["X-GEMINI-PAYLOAD"]!;
    assert.equal(init.headers["X-GEMINI-APIKEY"], "key");
    assert.equal(
      init.headers["X-GEMINI-SIGNATURE"],
      await hmacSha384Hex("secret", payload),
    );
  }
});

test("authenticated Market Data operations fail before fetch without auth", async () => {
  let fetches = 0;
  const rest = new MarketDataRest(new HttpTransport({
    env: "sandbox",
    fetchImpl: async () => {
      fetches++;
      return { status: 200, headers: jsonHeaders, async text() { return "{}"; } };
    },
  }));

  await assert.rejects(
    rest.getFXRate({ symbol: "EURUSD", timestamp: "2025-04-16T23:07:27.189Z" }),
    SdkError,
  );
  assert.equal(fetches, 0);
});

test("authenticated Market Data operations accept OAuth through AuthStrategy", async () => {
  const requests: Request[] = [];
  const auth = new OAuthAuth({
    client: { type: "public", clientId: "client", redirectUri: "https://example.com/callback" },
    tokenStore: {
      async load() { return { accessToken: "access", refreshToken: "refresh", tokenType: "bearer" as const, scope: "auditor", expiresAt: 100_000 }; },
      async save() {}, async clear() {}, async runExclusive<T>(operation: () => Promise<T>) { return operation(); },
    },
    now: () => 1000,
  });
  const rest = new MarketDataRest(new HttpTransport({
    env: "sandbox",
    auth,
    fetchImpl: async (url, init) => {
      requests.push({ url, init });
      return { status: 200, headers: jsonHeaders, async text() { return "{}"; } };
    },
  }));

  await rest.getAssetsForNetwork({ network: "ethereum" });

  assert.equal(requests[0]?.init.headers.Authorization, "Bearer access");
  assert.equal(requests[0]?.init.headers["X-GEMINI-APIKEY"], undefined);
  const payload = JSON.parse(fromBase64(requests[0]!.init.headers["X-GEMINI-PAYLOAD"]!));
  assert.equal("nonce" in payload, false);
});

test("getFXRate preserves generated asOf bigint normalization", async () => {
  const auth = new HmacAuth({ apiKey: "key", apiSecret: "secret", now: () => 1000 });
  const rest = new MarketDataRest(new HttpTransport({
    env: "sandbox",
    auth,
    fetchImpl: async () => ({
      status: 200,
      headers: jsonHeaders,
      async text() {
        return '{"fxPair":"EURUSD","rate":"0.69","asOf":9007199254740993,"provider":"bcb","benchmark":"Spot"}';
      },
    }),
  }));

  const rate = await rest.getFXRate({
    symbol: "EURUSD",
    timestamp: "2025-04-16T23:07:27.189Z",
  });

  assert.equal(rate.asOf, 9007199254740993n);
  assert.equal(rate.rate, "0.69");
});
