import assert from "node:assert/strict";
import { hmacSha384Hex , fromBase64 } from "../../../utils/encoding.js";
import { test } from "node:test";

import { PredictionMarketsRest } from "../../../generated/rest.js";
import { HmacAuth, OAuthAuth } from "../../../server/index.js";
import {
  AcceptTermsRequired,
  EndpointMismatch,
  InsufficientFunds,
  InvalidRequest,
  MissingRole,
  RateLimitError,
  ServiceUnavailable,
  SdkError,
} from "../../../errors.js";
import { HttpTransport, type HttpMethod } from "../../../transport/http.js";
import type { BoundaryValue } from "../../../utils/boundary-value.js";
import { parseBoundaryRecord, streamingTextResponse } from "../../support/http-fixtures.js";

type Request = {
  url: string;
  init: { method: HttpMethod; headers: Record<string, string>; body?: string };
};

const jsonHeaders = { get: (name: string) => name.toLowerCase() === "content-type" ? "application/json" : null };

function invalidRequest(value: BoundaryValue): never {
  // SAFETY: These fixtures intentionally bypass the generated request type to test runtime field rejection.
  return value as never;
}

function jsonResponse(status: number, body: string) {
  return streamingTextResponse(body, status, jsonHeaders);
}

function client(
  requests: Request[],
  failure?: SdkError,
  responses: string[] = [],
  statuses: number[] = [],
): PredictionMarketsRest {
  const transport = new HttpTransport({
    env: "sandbox",
    fetchImpl: async (url, init) => {
      requests.push({ url, init });
      if (failure) throw failure;
      return jsonResponse(statuses.shift() ?? 200, responses.shift() ?? "{}");
    },
  });
  return new PredictionMarketsRest(transport);
}

void test("listEvents forwards filters and repeated array query parameters", async () => {
  const requests: Request[] = [];
  await client(requests).listEvents({
    status: ["active", "settled"],
    category: ["sports", "crypto"],
    sport: ["baseball", "american_football"],
    sports_market_type: ["spread", "prop"],
    sports_market_subject: ["team", "player"],
    sports_market_scope: ["inning", "full_contest"],
    sports_market_metric: ["runs", "passing_yards"],
    search: "nba finals",
    limit: 10,
    offset: 20,
  });

  assert.equal(
    requests[0]?.url,
      "https://api.sandbox.gemini.com/v1/prediction-markets/events" +
      "?status=active&status=settled&category=sports&category=crypto" +
      "&sport=baseball&sport=american_football" +
      "&sports_market_type=spread&sports_market_type=prop" +
      "&sports_market_subject=team&sports_market_subject=player" +
      "&sports_market_scope=inning&sports_market_scope=full_contest" +
      "&sports_market_metric=runs&sports_market_metric=passing_yards" +
      "&search=nba%20finals&limit=10&offset=20",
  );
});

void test("all 15 public wrappers make unsigned GET requests to their schema paths", async () => {
  const requests: Request[] = [];
  const rest = client(requests);

  await rest.listEvents();
  await rest.getEvent({ eventTicker: "NBA/260310 LAL-BOS" });
  await rest.getEventStrike({ eventTicker: "BTC/05M" });
  await rest.listNewlyListedEvents();
  await rest.listRecentlySettledEvents();
  await rest.listUpcomingEvents();
  await rest.getCategories();
  await rest.getPredictionMarketDailyVolume({ date: "2026-07-20" });
  await rest.getPredictionMarketHourlyVolume({ date: "2026-07-20" });
  await rest.getPredictionMarketsTerms();
  await rest.getComboByInstrumentSymbol({ instrumentSymbol: "GEMI:A/B" });
  await rest.getLiquidityRewardsConfig();
  await rest.getMakerRebateRates();
  await rest.listCombos();
  await rest.listLiquidityRewardsEvents();

  assert.deepEqual(
    requests.map(({ url }) => new URL(url).pathname),
    [
      "/v1/prediction-markets/events",
      "/v1/prediction-markets/events/NBA%2F260310%20LAL-BOS",
      "/v1/prediction-markets/events/BTC%2F05M/strike",
      "/v1/prediction-markets/events/newly-listed",
      "/v1/prediction-markets/events/recently-settled",
      "/v1/prediction-markets/events/upcoming",
      "/v1/prediction-markets/categories",
      "/v1/prediction-markets/volume/2026-07-20",
      "/v1/prediction-markets/volume/2026-07-20/hourly",
      "/v1/prediction-markets/terms",
      "/v1/prediction-markets/combos/GEMI:A%2FB",
      "/v1/prediction-markets/liquidity-rewards/config",
      "/v1/prediction-markets/maker-rebate/rates",
      "/v1/prediction-markets/combos",
      "/v1/prediction-markets/liquidity-rewards/events",
    ],
  );
  for (const { init } of requests) {
    assert.equal(init.method, "GET");
    assert.deepEqual(init.headers, { Accept: "application/json" });
    assert.equal(init.body, undefined);
  }
});

void test("T5c wrappers forward combo, maker-rate, and reward-event filters", async () => {
  const requests: Request[] = [];
  const rest = client(requests);

  await rest.listCombos({
    status: "Active",
    contractId: 2n,
    instrumentRegistered: true,
    limit: 25,
    offset: 50,
  });
  await rest.getMakerRebateRates({ category: "Sports" });
  await rest.listLiquidityRewardsEvents({
    category: "Sports,Crypto",
    search: "final",
    sort: "daily_pool_desc",
    limit: 10,
    offset: 20,
  });

  const [combos, rates, events] = requests.map(({ url }) => new URL(url).searchParams);
  assert.deepEqual(Object.fromEntries(combos ?? []), {
    status: "Active",
    contractId: "2",
    instrumentRegistered: "true",
    limit: "25",
    offset: "50",
  });
  assert.deepEqual(Object.fromEntries(rates ?? []), { category: "Sports" });
  assert.deepEqual(Object.fromEntries(events ?? []), {
    category: "Sports,Crypto",
    search: "final",
    sort: "daily_pool_desc",
    limit: "10",
    offset: "20",
  });
});

void test("T5c responses preserve bigint IDs, exact money strings, and snake_case", async () => {
  const responses = [
    '{"legs":[{"comboId":9007199254740993,"contractId":9007199254740995}]}',
    '{"rate_rules":[{"id":9007199254740997,"rebate_multiplier_bps":5000,"effective_from":"2026-03-19T00:00:00Z"}]}',
    '{"enabled":true,"min_payout_threshold_usd":"1.00"}',
    '{"events":[{"event_ticker":"BTC2605202100","title":"BTC final","category":"Crypto","daily_pool_usd":"500.00","pool_source":"category_default","ends_at":null,"qualifying_maker_count":14}],"pagination":{},"last_score_date":null}',
  ];
  const rest = client([], undefined, responses);

  const combo = await rest.getComboByInstrumentSymbol({ instrumentSymbol: "GEMI-COMBO" });
  const rates = await rest.getMakerRebateRates();
  const config = await rest.getLiquidityRewardsConfig();
  const events = await rest.listLiquidityRewardsEvents();

  assert.equal(combo.legs?.[0]?.comboId, 9007199254740993n);
  assert.equal(combo.legs?.[0]?.contractId, 9007199254740995n);
  assert.equal(rates.rate_rules[0]?.id, 9007199254740997n);
  assert.equal(rates.rate_rules[0]?.rebate_multiplier_bps, 5000);
  assert.equal(config.min_payout_threshold_usd, "1.00");
  assert.equal(events.events[0]?.daily_pool_usd, "500.00");
  assert.equal("dailyPoolUsd" in events.events[0]!, false);
});

void test("transport errors pass through generated wrappers unchanged", async () => {
  const expected = new SdkError("network unavailable");
  const rest = client([], expected);

  await assert.rejects(rest.getLiquidityRewardsConfig(), (error) => error === expected);
});

void test("T5c wrappers preserve mapped non-2xx transport errors", async () => {
  const body = '{"error":"MissingRole","message":"OrderStatus required"}';
  const rest = client([], undefined, [body], [403]);

  await assert.rejects(rest.getMakerRebateRates(), (error) => {
    assert.ok(error instanceof MissingRole);
    assert.equal(error.status, 403);
    assert.equal(error.reason, "MissingRole");
    assert.equal(error.message, "HTTP 403");
    assert.equal("body" in error, false);
    return true;
  });
});

void test("all eight T5d wrappers use authenticated schema methods and paths", async () => {
  const requests: Request[] = [];
  const auth = new HmacAuth({ apiKey: "key", apiSecret: "secret", now: () => 1000 });
  const transport = new HttpTransport({
    env: "sandbox",
    auth,
    fetchImpl: async (url, init) => {
      requests.push({ url, init });
      return jsonResponse(url.endsWith("/order") ? 201 : 200, "{}");
    },
  });
  const rest = new PredictionMarketsRest(transport);
  const order = {
    symbol: "GEMI-FEDJAN26-DN25",
    orderType: "limit" as const,
    side: "buy" as const,
    quantity: "10.00",
    price: "0.65",
    outcome: "yes" as const,
    makerOrCancel: false,
  };
  const originalOrder = structuredClone(order);

  await rest.getPredictionMarketsTermsStatus();
  await rest.acceptTerms();
  await rest.placeOrder(order);
  await rest.placeOrderBatch({ orders: [order] });
  await rest.cancelOrder({ orderId: 9007199254740993n });
  await rest.cancelOrderBatch({ orderIds: [9007199254740995n, "9007199254740997"] });
  await rest.getActiveOrders();
  await rest.getOrderHistory({ status: "cancelled", limit: 5 });

  assert.deepEqual(order, originalOrder);
  assert.deepEqual(requests.map(({ init }) => init.method), [
    "GET", "POST", "POST", "POST", "POST", "POST", "POST", "POST",
  ]);
  assert.deepEqual(requests.map(({ url }) => new URL(url).pathname), [
    "/v1/prediction-markets/terms/status",
    "/v1/prediction-markets/terms/accept",
    "/v1/prediction-markets/order",
    "/v1/prediction-markets/order/batch",
    "/v1/prediction-markets/order/cancel",
    "/v1/prediction-markets/order/batch/cancel",
    "/v1/prediction-markets/orders/active",
    "/v1/prediction-markets/orders/history",
  ]);
  const payloads = requests.map(({ init }) =>
    parseBoundaryRecord(fromBase64(init.headers["X-GEMINI-PAYLOAD"]!))
  );
  assert.equal("symbol" in payloads[6]!, false);
  assert.deepEqual(payloads[7]?.status, "cancelled");
  assert.deepEqual(payloads[3]?.orders, [order]);
  assert.deepEqual(payloads[5]?.orderIds, [9007199254740995n, "9007199254740997"]);
  for (const { init } of requests) {
    const payload = init.headers["X-GEMINI-PAYLOAD"]!;
    assert.equal(
      init.headers["X-GEMINI-SIGNATURE"],
      await hmacSha384Hex("secret", payload),
    );
  }
});

void test("T5d responses preserve partial batch results, bigint IDs, strings, and nulls", async () => {
  const responses = [
    '{"orderId":9007199254740993,"quantity":"10.00","price":"0.65","stopPrice":null}',
    '{"results":[{"order":{"orderId":9007199254740995,"status":"open","symbol":"GEMI-X","side":"buy","outcome":"yes","orderType":"limit","timeInForce":"good-til-cancel","quantity":"1.00","filledQuantity":"0.00","remainingQuantity":"1.00","price":"0.45","createdAt":"2026-07-21T00:00:00Z","updatedAt":"2026-07-21T00:00:00Z"}},{"error":"InsufficientFunds","message":"insufficient funds"}]}',
    '{"results":[{"orderId":9007199254740997,"result":"ok"},{"orderId":9007199254740999,"error":"OrderNotFound","message":"missing"}]}',
    '{"orders":[{"orderId":9007199254741001,"price":"0.25","avgExecutionPrice":null}]}',
    '{"orders":[{"orderId":9007199254741003,"quantity":"3.00","cancelledAt":null}]}',
  ];
  const auth = new HmacAuth({ apiKey: "key", apiSecret: "secret", now: () => 1000 });
  const rest = new PredictionMarketsRest(new HttpTransport({
    env: "sandbox",
    auth,
    fetchImpl: async (url) => jsonResponse(url.endsWith("/order") ? 201 : 200, responses.shift()!),
  }));
  const order = {
    symbol: "GEMI-X", orderType: "limit" as const, side: "buy" as const,
    quantity: "1.00", price: "0.45", outcome: "yes" as const, makerOrCancel: false,
  };

  const placed = await rest.placeOrder(order);
  const placedBatch = await rest.placeOrderBatch({ orders: [order] });
  const cancelledBatch = await rest.cancelOrderBatch({ orderIds: [1n, 2n] });
  const active = await rest.getActiveOrders();
  const history = await rest.getOrderHistory();

  assert.equal(placed.orderId, 9007199254740993n);
  assert.equal(placed.quantity, "10.00");
  assert.equal(placed.stopPrice, null);
  assert.equal("order" in placedBatch.results[0]!, true);
  assert.equal("error" in placedBatch.results[1]!, true);
  assert.equal("order" in placedBatch.results[0]! && placedBatch.results[0].order.orderId, 9007199254740995n);
  assert.deepEqual(cancelledBatch.results.map((result) => result.orderId), [
    9007199254740997n, 9007199254740999n,
  ]);
  assert.equal(active.orders?.[0]?.avgExecutionPrice, null);
  assert.equal(history.orders?.[0]?.cancelledAt, null);
});

void test("T5d wrappers accept OAuth through the shared AuthStrategy seam", async () => {
  const requests: Request[] = [];
  const auth = new OAuthAuth({
    env: "sandbox",
    client: { type: "public", clientId: "client", redirectUri: "https://example.com/callback" },
    tokenStore: {
      async load() { return { accessToken: "access", refreshToken: "refresh", tokenType: "bearer" as const, scope: "orders", expiresAt: 100_000 }; },
      async save() {}, async clear() {}, async runExclusive<T>(operation: () => Promise<T>) { return operation(); },
      async consumeAuthorizationState() { return true; },
    },
    now: () => 1000,
  });
  const rest = new PredictionMarketsRest(new HttpTransport({
    env: "sandbox",
    auth,
    fetchImpl: async (url, init) => {
      requests.push({ url, init });
      return jsonResponse(200, '{"hasAcceptedLatest":true}');
    },
  }));

  assert.equal((await rest.getPredictionMarketsTermsStatus()).hasAcceptedLatest, true);
  assert.equal(requests[0]?.init.headers.Authorization, "Bearer access");
  assert.equal(requests[0]?.init.headers["X-GEMINI-APIKEY"], undefined);
  const payload = JSON.parse(fromBase64(requests[0]!.init.headers["X-GEMINI-PAYLOAD"]!));
  assert.equal("nonce" in payload, false);
});

void test("T5d wrappers preserve mapped order-management failures", async () => {
  const cases = [
    [403, "AcceptTermsRequired", AcceptTermsRequired],
    [403, "MissingRole", MissingRole],
    [406, "InsufficientFunds", InsufficientFunds],
    [429, "RateLimit", RateLimitError],
  ] as const;
  for (const [status, reason, Expected] of cases) {
    const auth = new HmacAuth({ apiKey: "key", apiSecret: "secret", now: () => 1000 });
    const rest = new PredictionMarketsRest(new HttpTransport({
      env: "sandbox", auth, maxRetries: 0,
      fetchImpl: async () => jsonResponse(status, JSON.stringify({ reason })),
    }));
    await assert.rejects(rest.cancelOrder({ orderId: 1n }), Expected);
  }
});

void test("T5d wrappers preserve transport and malformed-response failures", async () => {
  const failure = new SdkError("network unavailable");
  const auth = new HmacAuth({ apiKey: "key", apiSecret: "secret", now: () => 1000 });
  const networkRest = new PredictionMarketsRest(new HttpTransport({
    env: "sandbox", auth,
    fetchImpl: async () => { throw failure; },
  }));
  await assert.rejects(networkRest.getPredictionMarketsTermsStatus(), (error) => error === failure);

  const malformedRest = new PredictionMarketsRest(new HttpTransport({
    env: "sandbox", auth,
    fetchImpl: async () => jsonResponse(200, "not json"),
  }));
  await assert.rejects(malformedRest.acceptTerms(), SdkError);
});

void test("generated bodies cannot override the transport request path or nonce", async () => {
  let fetches = 0;
  const auth = new HmacAuth({ apiKey: "key", apiSecret: "secret", now: () => 1000 });
  const rest = new PredictionMarketsRest(new HttpTransport({
    env: "sandbox",
    auth,
    fetchImpl: async () => {
      fetches++;
      return jsonResponse(201, "{}");
    },
  }));
  const order = {
    symbol: "GEMI-X", orderType: "limit" as const, side: "buy" as const,
    quantity: "1.00", price: "0.45", outcome: "yes" as const, makerOrCancel: false,
  };

  await assert.rejects(
    rest.placeOrder(invalidRequest({ ...order, request: "/v1/other" })),
    EndpointMismatch,
  );
  await assert.rejects(
    rest.placeOrder(invalidRequest({ ...order, nonce: 1 })),
    SdkError,
  );
  assert.equal(fetches, 0);
});

void test("generated body fields cannot replace authentication headers", async () => {
  const requests: Request[] = [];
  const auth = new HmacAuth({ apiKey: "key", apiSecret: "secret", now: () => 1000 });
  const rest = new PredictionMarketsRest(new HttpTransport({
    env: "sandbox",
    auth,
    fetchImpl: async (url, init) => {
      requests.push({ url, init });
      return jsonResponse(201, "{}");
    },
  }));
  const body = {
    symbol: "GEMI-X", orderType: "limit" as const, side: "buy" as const,
    quantity: "1.00", price: "0.45", outcome: "yes" as const, makerOrCancel: false,
    Authorization: "attacker",
    "X-GEMINI-APIKEY": "attacker",
    "X-GEMINI-SIGNATURE": "attacker",
    "X-GEMINI-PAYLOAD": "attacker",
  };
  const original = structuredClone(body);

  await rest.placeOrder(body);

  assert.deepEqual(body, original);
  const headers = requests[0]!.init.headers;
  const payload = headers["X-GEMINI-PAYLOAD"]!;
  assert.equal(headers.Authorization, undefined);
  assert.equal(headers["X-GEMINI-APIKEY"], "key");
  assert.notEqual(payload, "attacker");
  assert.equal(
    headers["X-GEMINI-SIGNATURE"],
    await hmacSha384Hex("secret", payload),
  );
});

void test("T5e wrappers keep position filters in the query and volume fields in the signed body", async () => {
  const requests: Request[] = [];
  const auth = new HmacAuth({ apiKey: "key", apiSecret: "secret", now: () => 1000 });
  const rest = new PredictionMarketsRest(new HttpTransport({
    env: "sandbox",
    auth,
    fetchImpl: async (url, init) => {
      requests.push({ url, init });
      return jsonResponse(200, "{}");
    },
  }));
  const positionsQuery = {
    eventTicker: "FED JAN",
    limit: 25,
    offset: 50,
    sort: "+positionValue" as const,
  };
  const settledQuery = {
    eventTicker: "FEDJAN26",
    limit: 10,
    offset: 20,
    sort: "-payout" as const,
    search: "final four",
    category: "Sports",
    withCashOuts: false,
  };
  const volumeBody = {
    eventTicker: "FED260318",
    startTime: 9007199254740993n,
    endTime: 9007199254740995n,
  };
  const originalInputs = structuredClone({ positionsQuery, settledQuery, volumeBody });

  await rest.getPositions(positionsQuery);
  await rest.getSettledPositions(settledQuery);
  await rest.getVolumeMetrics(volumeBody);

  assert.deepEqual({ positionsQuery, settledQuery, volumeBody }, originalInputs);
  assert.deepEqual(requests.map(({ init }) => init.method), ["POST", "POST", "POST"]);
  assert.deepEqual(requests.map(({ url }) => new URL(url).pathname), [
    "/v1/prediction-markets/positions",
    "/v1/prediction-markets/positions/settled",
    "/v1/prediction-markets/metrics/volume",
  ]);
  assert.equal(
    new URL(requests[0]!.url).search,
    "?eventTicker=FED%20JAN&limit=25&offset=50&sort=%2BpositionValue",
  );
  assert.equal(
    new URL(requests[1]!.url).search,
    "?eventTicker=FEDJAN26&limit=10&offset=20&sort=-payout&search=final%20four&category=Sports&withCashOuts=false",
  );
  assert.equal(new URL(requests[2]!.url).search, "");

  const payloads = requests.map(({ init }) =>
    parseBoundaryRecord(fromBase64(init.headers["X-GEMINI-PAYLOAD"]!))
  );
  assert.deepEqual(Object.keys(payloads[0]!).sort(), ["nonce", "request"]);
  assert.deepEqual(Object.keys(payloads[1]!).sort(), ["nonce", "request"]);
  assert.deepEqual(payloads[2], { request: "/v1/prediction-markets/metrics/volume", ...volumeBody, nonce: 1002 });
  for (const { init } of requests) {
    const payload = init.headers["X-GEMINI-PAYLOAD"]!;
    assert.equal(
      init.headers["X-GEMINI-SIGNATURE"],
      await hmacSha384Hex("secret", payload),
    );
  }
});

void test("T5e responses preserve bigint IDs, exact money and volume strings, nulls, and omissions", async () => {
  const responses = [
    '{"positions":[{"symbol":"GEMI-X","instrumentId":9007199254740993,"totalQuantity":"10.00","avgPrice":"0.45","realizedPl":null,"prices":null}],"total":1}',
    '{"positions":[{"accountId":9007199254740995,"instrumentId":9007199254740997,"position":"-3.00","positionQuantity":"3.00","payout":"0.00","costBasis":null,"realizedPnl":"1.25","netProfit":null}],"total":1,"cashOuts":[{"accountId":9007199254740999,"instrumentId":9007199254741001,"instrumentSymbol":"GEMI-Y","timestamp":"2026-07-21T00:00:00Z","filledQuantity":"2.00","side":"sell","proceeds":"1.50","costBasis":"1.00","netProfit":"0.50"}],"totalCashOutProceeds":"1.50","totalCashOutCostBasis":"1.00","totalCashOutNetProfit":"0.50"}',
    '{"eventTicker":"FED260318","contracts":[{"symbol":"GEMI-Z","totalQty":"94625.00","userAggressorQty":null,"userRestingQty":"0.00"}]}',
  ];
  const auth = new HmacAuth({ apiKey: "key", apiSecret: "secret", now: () => 1000 });
  const rest = new PredictionMarketsRest(new HttpTransport({
    env: "sandbox",
    auth,
    fetchImpl: async () => jsonResponse(200, responses.shift()!),
  }));

  const active = await rest.getPositions();
  const settled = await rest.getSettledPositions({ withCashOuts: true });
  const volume = await rest.getVolumeMetrics({ eventTicker: "FED260318" });

  assert.equal(active.positions?.[0]?.instrumentId, 9007199254740993n);
  assert.equal(active.positions?.[0]?.totalQuantity, "10.00");
  assert.equal(active.positions?.[0]?.realizedPl, null);
  assert.equal("marketValue" in active.positions![0]!, false);
  assert.equal(settled.positions?.[0]?.accountId, 9007199254740995n);
  assert.equal(settled.positions?.[0]?.instrumentId, 9007199254740997n);
  assert.equal(settled.positions?.[0]?.payout, "0.00");
  assert.equal(settled.cashOuts?.[0]?.accountId, 9007199254740999n);
  assert.equal(settled.cashOuts?.[0]?.instrumentId, 9007199254741001n);
  assert.equal(settled.totalCashOutNetProfit, "0.50");
  assert.equal("totalPayout" in settled, false);
  assert.equal(volume.contracts?.[0]?.totalQty, "94625.00");
  assert.equal(volume.contracts?.[0]?.userAggressorQty, null);
});

void test("T5e wrappers preserve mapped transport failures", async () => {
  const cases = [
    [503, "ServiceUnavailable", ServiceUnavailable, "positions"],
    [403, "MissingRole", MissingRole, "settled"],
    [400, "InvalidRequest", InvalidRequest, "volume"],
  ] as const;
  for (const [status, reason, Expected, operation] of cases) {
    const auth = new HmacAuth({ apiKey: "key", apiSecret: "secret", now: () => 1000 });
    const rest = new PredictionMarketsRest(new HttpTransport({
      env: "sandbox",
      auth,
      fetchImpl: async () => jsonResponse(status, JSON.stringify({ reason })),
    }));
    const request = operation === "positions"
      ? rest.getPositions()
      : operation === "settled"
        ? rest.getSettledPositions()
        : rest.getVolumeMetrics({ eventTicker: "FED260318" });
    await assert.rejects(request, Expected);
  }
});

void test("T5f wrappers authenticate exact reward methods, paths, and query strings", async () => {
  const requests: Request[] = [];
  const auth = new HmacAuth({ apiKey: "key", apiSecret: "secret", now: () => 1000 });
  const rest = new PredictionMarketsRest(new HttpTransport({
    env: "sandbox",
    auth,
    fetchImpl: async (url, init) => {
      requests.push({ url, init });
      return jsonResponse(200, "{}");
    },
  }));
  const payoutsQuery = { limit: 100, offset: 200 };
  const dailyQuery = { dateFrom: "2026-05-01", dateTo: "2026-05-07" };
  const lifetimeQuery = { dateFrom: "2026-04-01", dateTo: "2026-05-01" };
  const originalQueries = structuredClone({ payoutsQuery, dailyQuery, lifetimeQuery });

  await rest.listMakerRebatePayouts(payoutsQuery);
  await rest.getMakerRebateLifetimeSummary();
  await rest.getLiquidityRewardsDailySummary(dailyQuery);
  await rest.getLiquidityRewardsLifetimeSummary(lifetimeQuery);

  assert.deepEqual({ payoutsQuery, dailyQuery, lifetimeQuery }, originalQueries);
  assert.deepEqual(requests.map(({ init }) => init.method), ["POST", "GET", "GET", "GET"]);
  assert.deepEqual(requests.map(({ url }) => new URL(url).pathname), [
    "/v1/prediction-markets/maker-rebate/payouts",
    "/v1/prediction-markets/maker-rebate/summary/total",
    "/v1/prediction-markets/liquidity-rewards/summary/daily",
    "/v1/prediction-markets/liquidity-rewards/summary/total",
  ]);
  assert.deepEqual(requests.map(({ url }) => new URL(url).search), [
    "?limit=100&offset=200",
    "",
    "?dateFrom=2026-05-01&dateTo=2026-05-07",
    "?dateFrom=2026-04-01&dateTo=2026-05-01",
  ]);
  const payloads = requests.map(({ init }) =>
    parseBoundaryRecord(fromBase64(init.headers["X-GEMINI-PAYLOAD"]!))
  );
  assert.deepEqual(payloads, [
    { request: "/v1/prediction-markets/maker-rebate/payouts?limit=100&offset=200", nonce: 1000 },
    { request: "/v1/prediction-markets/maker-rebate/summary/total", nonce: 1001 },
    { request: "/v1/prediction-markets/liquidity-rewards/summary/daily?dateFrom=2026-05-01&dateTo=2026-05-07", nonce: 1002 },
    { request: "/v1/prediction-markets/liquidity-rewards/summary/total?dateFrom=2026-04-01&dateTo=2026-05-01", nonce: 1003 },
  ]);
  for (const { init } of requests) {
    const payload = init.headers["X-GEMINI-PAYLOAD"]!;
    assert.equal(
      init.headers["X-GEMINI-SIGNATURE"],
      await hmacSha384Hex("secret", payload),
    );
  }
});

void test("T5f responses preserve reward bigints, decimal strings, snake_case, and nulls", async () => {
  const responses = [
    '{"payouts":[{"id":9007199254740993,"total_volume_usd":"12450.00","total_rebate_usd":"6.23","total_fill_count":187,"status":"PENDING","paid_at":null,"created_at":null}]}',
    '{"total_earned_usd":"152.40","total_fill_count":9007199254740995,"total_volume_usd":"304800.00","payout_count":27,"first_payout_date":null,"last_payout_date":null}',
    '{"daily_summaries":[{"payout_date":"2026-05-07","total_reward_usd":"12.45","payout_status":"PAID","paid_at":null,"events":[{"event_id":9007199254740997,"event_name":"BTC final","category_name":"Crypto","normalized_score":"0.4521","snapshot_count":1180,"total_snapshots":1440,"event_reward_usd":"8.20"}]}]}',
    '{"total_earned_usd":"0","payout_count":0,"first_payout_date":null,"last_payout_date":null}',
  ];
  const auth = new HmacAuth({ apiKey: "key", apiSecret: "secret", now: () => 1000 });
  const rest = new PredictionMarketsRest(new HttpTransport({
    env: "sandbox",
    auth,
    fetchImpl: async () => jsonResponse(200, responses.shift()!),
  }));

  const payouts = await rest.listMakerRebatePayouts();
  const makerLifetime = await rest.getMakerRebateLifetimeSummary();
  const daily = await rest.getLiquidityRewardsDailySummary({
    dateFrom: "2026-05-01",
    dateTo: "2026-05-07",
  });
  const rewardsLifetime = await rest.getLiquidityRewardsLifetimeSummary();

  assert.equal(payouts.payouts[0]?.id, 9007199254740993n);
  assert.equal(payouts.payouts[0]?.total_volume_usd, "12450.00");
  assert.equal(payouts.payouts[0]?.total_rebate_usd, "6.23");
  assert.equal(payouts.payouts[0]?.paid_at, null);
  assert.equal("totalRebateUsd" in payouts.payouts[0]!, false);
  assert.equal(makerLifetime.total_fill_count, 9007199254740995n);
  assert.equal(makerLifetime.total_earned_usd, "152.40");
  assert.equal(makerLifetime.first_payout_date, null);
  assert.equal(daily.daily_summaries[0]?.total_reward_usd, "12.45");
  assert.equal(daily.daily_summaries[0]?.payout_status, "PAID");
  assert.equal(daily.daily_summaries[0]?.events[0]?.event_id, 9007199254740997n);
  assert.equal(daily.daily_summaries[0]?.events[0]?.normalized_score, "0.4521");
  assert.equal(daily.daily_summaries[0]?.events[0]?.event_reward_usd, "8.20");
  assert.equal("dailySummaries" in daily, false);
  assert.equal(rewardsLifetime.total_earned_usd, "0");
  assert.equal(rewardsLifetime.last_payout_date, null);
});

void test("T5f wrappers accept OAuth through the shared AuthStrategy seam", async () => {
  const requests: Request[] = [];
  const auth = new OAuthAuth({
    env: "sandbox",
    client: { type: "public", clientId: "client", redirectUri: "https://example.com/callback" },
    tokenStore: {
      async load() { return { accessToken: "access", refreshToken: "refresh", tokenType: "bearer" as const, scope: "orders", expiresAt: 100_000 }; },
      async save() {}, async clear() {}, async runExclusive<T>(operation: () => Promise<T>) { return operation(); },
      async consumeAuthorizationState() { return true; },
    },
    now: () => 1000,
  });
  const rest = new PredictionMarketsRest(new HttpTransport({
    env: "sandbox",
    auth,
    fetchImpl: async (url, init) => {
      requests.push({ url, init });
      return jsonResponse(200, '{"daily_summaries":[]}');
    },
  }));

  await rest.getLiquidityRewardsDailySummary({ dateFrom: "2026-05-01", dateTo: "2026-05-07" });

  assert.equal(requests[0]?.init.headers.Authorization, "Bearer access");
  assert.equal(requests[0]?.init.headers["X-GEMINI-APIKEY"], undefined);
  const payload = JSON.parse(fromBase64(requests[0]!.init.headers["X-GEMINI-PAYLOAD"]!));
  assert.equal("nonce" in payload, false);
});

void test("T5f wrappers preserve mapped reward failures", async () => {
  const cases = [
    [403, "AcceptTermsRequired", AcceptTermsRequired],
    [403, "MissingRole", MissingRole],
    [400, "InvalidRequest", InvalidRequest],
    [429, "RateLimit", RateLimitError],
    [503, "ServiceUnavailable", ServiceUnavailable],
  ] as const;
  for (const [status, reason, Expected] of cases) {
    const auth = new HmacAuth({ apiKey: "key", apiSecret: "secret", now: () => 1000 });
    const rest = new PredictionMarketsRest(new HttpTransport({
      env: "sandbox",
      auth,
      maxRetries: 0,
      fetchImpl: async () => jsonResponse(status, JSON.stringify({ reason })),
    }));
    await assert.rejects(rest.getLiquidityRewardsLifetimeSummary(), Expected);
  }
});

void test("T5f wrappers preserve transport and malformed-response failures", async () => {
  const failure = new SdkError("network unavailable");
  const auth = new HmacAuth({ apiKey: "key", apiSecret: "secret", now: () => 1000 });
  const networkRest = new PredictionMarketsRest(new HttpTransport({
    env: "sandbox",
    auth,
    fetchImpl: async () => { throw failure; },
  }));
  await assert.rejects(networkRest.listMakerRebatePayouts(), (error) => error === failure);

  const malformedRest = new PredictionMarketsRest(new HttpTransport({
    env: "sandbox",
    auth,
    fetchImpl: async () => jsonResponse(200, "not json"),
  }));
  await assert.rejects(
    malformedRest.getLiquidityRewardsDailySummary({ dateFrom: "2026-05-01", dateTo: "2026-05-07" }),
    SdkError,
  );
});
