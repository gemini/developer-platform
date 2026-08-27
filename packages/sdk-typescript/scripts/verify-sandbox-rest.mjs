import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { redact, verifyFileEvidence } from "./verify-market-data-live.mjs";
import { boundaryValueKind } from "./runtime-value.mjs";

const INVENTORY = JSON.parse(readFileSync(new URL("./rest-operation-ownership.snapshot.json", import.meta.url), "utf8"));
const MISSING_FIXTURE = Symbol("missing fixture");

function account(context) {
  return context.env.GEMINI_ACCOUNT || "primary";
}

function reportDates(context) {
  return {
    fromDate: context.env.GEMINI_REPORT_FROM_DATE || "2026-01-01",
    toDate: context.env.GEMINI_REPORT_TO_DATE || "2026-01-31",
  };
}

function preferredSymbol(symbols, derivative = false) {
  const candidates = symbols.filter((symbol) => derivative === symbol.toUpperCase().includes("PERP"));
  const bitcoin = candidates.find((symbol) => symbol.toLowerCase() === (derivative ? "btcgusdperp" : "btcusd"));
  return bitcoin ?? firstString(candidates);
}

export function priceSymbols(response) {
  const source = response?.data ?? response;
  if (Array.isArray(source)) return source
    .map((entry) => boundaryValueKind(entry)=== "string" ? entry : entry?.symbol ?? entry?.pair)
    .filter(Boolean);
  if (!source || boundaryValueKind(source)!== "object") return [];
  return Object.keys(source).filter((key) => key !== "data" && key !== "timestamp");
}

const QUERY_FIXTURES = {
  "marketData:getCurrentOrderBook": (_context) => ({ limit_bids: 1, limit_asks: 1 }),
  "marketData:listTrades": () => ({ limit_trades: 1 }),
  "marketData:getFundingAmountReportFile": (_context) => ({ symbol: _context.derivativeSymbol, numRows: 1 }),
  "predictionMarkets:listEvents": () => ({ status: ["active"], limit: 10 }),
  "predictionMarkets:getPositions": () => ({ limit: 10 }),
  "predictionMarkets:getSettledPositions": () => ({ limit: 10 }),
  "predictionMarkets:listMakerRebatePayouts": () => ({ limit: 10 }),
  "predictionMarkets:getLiquidityRewardsDailySummary": (_context) => ({ dateFrom: "2026-05-01", dateTo: "2026-05-07" }),
  "predictionMarkets:getLiquidityRewardsLifetimeSummary": () => ({ dateFrom: "2026-04-01", dateTo: "2026-05-01" }),
  "predictionMarkets:getMakerRebateLifetimeSummary": () => ({ dateFrom: "2026-04-01", dateTo: "2026-05-01" }),
  "perpetuals:listFundingPayments": (context) => ({
    since: BigInt(context.timestamp - 86_400_000),
    to: BigInt(context.timestamp),
  }),
  "perpetuals:getFundingPaymentReportFile": (context) => ({ ...reportDates(context), numRows: 1 }),
  "perpetuals:getFundingPaymentReportJson": (context) => ({ ...reportDates(context), numRows: 1 }),
};

const BODY_FIXTURES = {
  "predictionMarkets:getVolumeMetrics": (context) => ({
    eventTicker: context.eventTicker,
    startTime: context.timestamp - 86_400_000,
    endTime: context.timestamp,
  }),
  "trading:getOrderStatus": (context) => {
    if (context.env.GEMINI_ORDER_ID) return { order_id: context.env.GEMINI_ORDER_ID, account: account(context) };
    if (context.env.GEMINI_CLIENT_ORDER_ID) return { client_order_id: context.env.GEMINI_CLIENT_ORDER_ID, account: account(context) };
    return MISSING_FIXTURE;
  },
  "account:getAccountDetail": (context) => ({ account: account(context) }),
  "account:getAvailableBalances": (context) => ({ account: account(context), showPendingBalances: false }),
  "transfers:getGasFeeEstimation": (context) => context.env.GEMINI_MD_ADDRESS
    ? { address: context.env.GEMINI_MD_ADDRESS, amount: "1", account: account(context) }
    : MISSING_FIXTURE,
  "account:getNotionalBalances": (context) => ({ account: account(context) }),
  "account:getRoles": () => ({}),
  "transfers:getTransactionHistory": (context) => ({ timestamp_nanos: BigInt(context.timestamp) * 1_000_000n, limit: 1 }),
  "account:listAccountsInGroup": () => ({ limit_accounts: 1 }),
  "account:listApprovedAddresses": (context) => ({ account: account(context) }),
  "transfers:listCustodyFeeTransfers": (context) => ({ limit_transfers: 1, account: account(context) }),
  "account:listDepositAddresses": (context) => ({ timestamp: String(context.timestamp), account: account(context) }),
  "transfers:listPastTransfers": (context) => ({ currency: "eth", network: context.network, limit_transfers: 1, account: account(context) }),
  "account:listPaymentMethods": (context) => ({ account: account(context) }),
  "staking:listStakingBalances": (context) => ({ account: account(context) }),
  "staking:listStakingEventHistory": (context) => ({ account: account(context), limit: 1, sortAsc: false }),
  "staking:listStakingRewards": (context) => ({ account: account(context), since: "2026-01-01T00:00:00.000Z" }),
  "clearingInstant:getClearingOrder": (context) => context.env.GEMINI_CLEARING_ID
    ? { clearing_id: context.env.GEMINI_CLEARING_ID, account: account(context) }
    : MISSING_FIXTURE,
  "clearingInstant:getInstantQuote": (context) => context.env.GEMINI_INSTANT_SYMBOL
    ? {
      side: "buy",
      symbol: context.env.GEMINI_INSTANT_SYMBOL,
      totalSpend: context.env.GEMINI_INSTANT_TOTAL_SPEND ?? "1",
      account: account(context),
    }
    : MISSING_FIXTURE,
  "clearingInstant:listClearingBrokers": (context) => context.env.GEMINI_CLEARING_SYMBOL
    ? { symbol: context.env.GEMINI_CLEARING_SYMBOL, limit_orders: 1, account: account(context) }
    : MISSING_FIXTURE,
  "clearingInstant:listClearingOrders": (context) => context.env.GEMINI_CLEARING_SYMBOL
    ? { symbol: context.env.GEMINI_CLEARING_SYMBOL, limit_orders: 1, account: account(context) }
    : MISSING_FIXTURE,
  "clearingInstant:listClearingTrades": (context) => context.env.GEMINI_CLEARING_SYMBOL
    ? { symbol: context.env.GEMINI_CLEARING_SYMBOL, limit_per_account: 1, account: account(context) }
    : MISSING_FIXTURE,
  "margin:getMarginAccount": (context) => ({ account: account(context) }),
  "margin:getMarginRates": (context) => ({ account: account(context) }),
  "margin:previewMarginOrder": (context) => ({
    symbol: context.symbol,
    side: "buy",
    type: "limit",
    amount: "0.5",
    price: "100",
    account: account(context),
  }),
  "perpetuals:getAccountMargin": (context) => ({ account: account(context), symbol: context.derivativeSymbol }),
  "perpetuals:getFundingPaymentReportFile": (context) => ({ account: account(context) }),
  "perpetuals:getFundingPaymentReportJson": (context) => ({ account: account(context) }),
  "perpetuals:getOpenPositions": (context) => ({ account: account(context) }),
  "perpetuals:listFundingPayments": (context) => ({ account: account(context) }),
  "trading:getNotionalTradingVolume": (context) => ({ account: account(context) }),
  "trading:getTradingVolume": (context) => ({ account: account(context) }),
  "trading:listActiveOrders": (context) => ({ account: account(context) }),
  "trading:listPastOrders": (context) => ({ symbol: context.symbol, limit_orders: 1, timestamp: String(context.timestamp), account: account(context) }),
  "trading:listPastTrades": (context) => ({ symbol: context.symbol, limit_trades: 1, timestamp: String(context.timestamp), account: account(context) }),
};

function operationKey(operation) {
  return `${operation.module}:${operation.methodName}`;
}

function facadeName(operation) {
  return operation.module === "predictionMarkets" ? "predictions" : operation.module;
}

export function isReadOnlyOperation(operation) {
  return /^(?:get|list)/u.test(operation.methodName ?? "");
}

function requireFixture(value, name) {
  if (value === undefined || value === null || value === "" || value === MISSING_FIXTURE) {
    throw new Error(`missing runtime fixture: ${name}`);
  }
  return value;
}

function pathInput(operation, context) {
  const names = [...operation.path.matchAll(/\{([^}]+)\}/gu)].map((match) => match[1]);
  if (names.length === 0) return undefined;
  const values = {};
  for (const name of names) {
    let value;
    if (name === "symbol") {
      value = operation.module === "perpetuals" ? context.derivativeSymbol : context.symbol;
      if (operation.methodName === "getFundingAmount") value = context.derivativeSymbol;
      if (operation.methodName === "getFXRate") value = context.env.GEMINI_MD_FX_SYMBOL;
    } else if (name === "time_frame") {
      value = context.env.GEMINI_MD_TIMEFRAME ?? "1m";
    } else if (name === "eventTicker") {
      value = context.eventTicker;
    } else if (name === "instrumentSymbol") {
      value = context.comboSymbol;
    } else if (name === "date") {
      value = context.date;
    } else if (name === "network") {
      value = context.network;
    } else if (name === "token") {
      value = context.token;
    } else if (name === "ticker") {
      value = context.env.GEMINI_MD_TICKER;
    } else if (name === "currency") {
      value = context.currency;
    } else if (name === "timestamp") {
      value = context.timestamp;
    }
    values[name] = requireFixture(value, name);
  }
  return values;
}

function queryInput(operation, context) {
  const fixture = QUERY_FIXTURES[operationKey(operation)];
  return fixture ? fixture(context) : undefined;
}

function bodyInput(operation, context) {
  const fixture = BODY_FIXTURES[operationKey(operation)];
  if (fixture) return fixture(context);
  return operation.method.toLowerCase() === "post" ? {} : undefined;
}

export function operationArgs(operation, context) {
  const key = operationKey(operation);
  const path = pathInput(operation, context);
  const query = queryInput(operation, context);
  const body = bodyInput(operation, context);

  if (body === MISSING_FIXTURE) {
    throw new Error(`missing runtime fixture for ${key}`);
  }
  const available = [path, query, body].filter((value) => value !== undefined);
  if (available.length === 0) return [];
  const input = Object.assign({}, ...available);
  return [input];
}

function responseArray(response, keys = []) {
  if (Array.isArray(response)) return response;
  for (const key of keys) if (Array.isArray(response?.[key])) return response[key];
  return [];
}

function firstString(values) {
  return values.find((value) => boundaryValueKind(value)=== "string" && value.length > 0);
}

function eventTickerFrom(response) {
  const events = responseArray(response, ["data", "events"]);
  const event = events.find((candidate) => candidate && boundaryValueKind(candidate)=== "object");
  return event?.eventTicker ?? event?.event_ticker ?? event?.ticker;
}

function instrumentSymbolFrom(response) {
  const events = responseArray(response, ["data", "events"]);
  for (const event of events) {
    for (const market of [...(event?.markets ?? []), ...(event?.contracts ?? [])]) {
      const symbol = boundaryValueKind(market)=== "string" ? market : market?.symbol ?? market?.instrumentSymbol;
      if (symbol) return symbol;
    }
  }
  return undefined;
}

function comboSymbolFrom(response) {
  const combos = responseArray(response, ["data", "combos"]);
  for (const combo of combos) {
    const symbol = boundaryValueKind(combo)=== "string" ? combo : combo?.instrumentSymbol ?? combo?.symbol;
    if (symbol) return symbol;
  }
  return undefined;
}

function updateContext(operation, response, context) {
  const key = operationKey(operation);
  if (key === "marketData:listSymbols") {
    const symbols = responseArray(response, ["data", "symbols"]);
    context.symbols = symbols.filter((symbol) => boundaryValueKind(symbol)=== "string");
    context.symbol = context.env.GEMINI_MD_SYMBOL || preferredSymbol(context.symbols) || context.symbol;
    context.derivativeSymbol = context.env.GEMINI_MD_DERIVATIVE_SYMBOL || preferredSymbol(context.symbols, true) || context.derivativeSymbol;
  } else if (key === "marketData:listPrices") {
    const symbols = priceSymbols(response);
    context.symbol = context.env.GEMINI_MD_SYMBOL || preferredSymbol(symbols) || context.symbol;
    context.derivativeSymbol = context.env.GEMINI_MD_DERIVATIVE_SYMBOL || preferredSymbol(symbols, true) || context.derivativeSymbol;
  } else if (key === "predictionMarkets:listEvents") {
    context.eventTicker = context.env.GEMINI_PM_EVENT_TICKER || context.eventTicker || eventTickerFrom(response);
    context.instrumentSymbol = context.env.GEMINI_PM_SYMBOL || context.instrumentSymbol || instrumentSymbolFrom(response);
  } else if (key === "predictionMarkets:listCombos") {
    context.comboSymbol = context.env.GEMINI_PM_COMBO_SYMBOL || context.comboSymbol || comboSymbolFrom(response);
  }
}

function operationResult(operation, status, message) {
  const result = {
    module: operation.module,
    methodName: operation.methodName,
    method: operation.method,
    path: operation.path,
    status,
  };
  if (message) result.message = message;
  return result;
}

function safeMessage(error, env) {
  const details = [
    error?.message ?? String(error),
    error?.reason ? `reason=${error.reason}` : undefined,
    error?.code ? `code=${error.code}` : undefined,
    error?.serverCode ? `serverCode=${error.serverCode}` : undefined,
  ].filter(Boolean).join("; ");
  return redact(details, [env.GEMINI_API_KEY, env.GEMINI_API_SECRET]);
}

function blockedMessage(message) {
  return /auth|credential|permission|forbidden|unauthorized|status 401|status 403|missing runtime fixture|method is not available|invalidapikey|service_unavailable|endpointnotfound|not_found|no data|maintenance|sandboxunsupportednetwork|accountnotoftype/iu.test(message);
}

async function responseEvidence(operation, response) {
  if (operation.responseMode !== "file") return undefined;
  return verifyFileEvidence(response);
}

export function exitCodeFor(operations) {
  return operations.some((operation) => operation.status === "failed" || operation.status === "blocked") ? 1 : 0;
}

export async function runVerification({
  operations = INVENTORY,
  env = process.env,
  loadSdk = () => import("../dist/server/index.js"),
  log = console.log,
} = {}) {
  const context = {
    env,
    date: env.GEMINI_PM_DATE ?? new Date().toISOString().slice(0, 10),
    timestamp: Date.now(),
    symbol: env.GEMINI_MD_SYMBOL || undefined,
    derivativeSymbol: env.GEMINI_MD_DERIVATIVE_SYMBOL || undefined,
    eventTicker: env.GEMINI_PM_EVENT_TICKER || undefined,
    comboSymbol: env.GEMINI_PM_COMBO_SYMBOL || undefined,
    instrumentSymbol: env.GEMINI_PM_SYMBOL || undefined,
    instantSymbol: env.GEMINI_INSTANT_SYMBOL || env.GEMINI_MD_SYMBOL || undefined,
    network: env.GEMINI_MD_NETWORK,
    token: env.GEMINI_MD_TOKEN,
    currency: env.GEMINI_MD_CURRENCY || "USD",
  };
  const results = new Map(operations.map((operation) => [operationKey(operation), operationResult(operation, "skipped", "write or control operation"),]));
  const eligible = operations.filter(isReadOnlyOperation);
  const ordered = [
    ...eligible.filter((operation) => ["marketData:listSymbols", "marketData:listPrices", "predictionMarkets:listEvents", "predictionMarkets:listCombos"].includes(operationKey(operation))),
    ...eligible.filter((operation) => !["marketData:listSymbols", "marketData:listPrices", "predictionMarkets:listEvents", "predictionMarkets:listCombos"].includes(operationKey(operation))),
  ];
  let sdk;
  try {
    sdk = await loadSdk();
  } catch (error) {
    for (const operation of eligible) results.set(operationKey(operation), operationResult(operation, "blocked", `SDK import failed: ${safeMessage(error, env)}`));
    return { operations: [...results.values()], counts: countResults(results) };
  }

  const auth = env.GEMINI_API_KEY && env.GEMINI_API_SECRET && sdk.HmacAuth
    ? new sdk.HmacAuth({ apiKey: env.GEMINI_API_KEY, apiSecret: env.GEMINI_API_SECRET, nonceMode: env.GEMINI_NONCE_MODE })
    : undefined;
  let client;
  try {
    client = await sdk.createClient({ env: env.GEMINI_SMOKE_ENV ?? "sandbox", auth });
    log(`Sandbox REST: checking ${eligible.length} read-only operation(s)`);
    for (const operation of ordered) {
      const key = operationKey(operation);
      log(`Sandbox REST: ${key}`);
      try {
        const facade = client[facadeName(operation)];
        if (!facade || boundaryValueKind(facade[operation.methodName])!== "function") {
          throw new Error("method is not available on the client facade");
        }
        const response = await facade[operation.methodName](...operationArgs(operation, context));
        const evidence = await responseEvidence(operation, response);
        updateContext(operation, response, context);
        const result = operationResult(operation, "passed");
        if (evidence) result.evidence = evidence;
        results.set(key, result);
        log(`Sandbox REST: ${key} passed`);
      } catch (error) {
        const message = safeMessage(error, env);
        results.set(key, operationResult(operation, blockedMessage(message) ? "blocked" : "failed", message));
        log(`Sandbox REST: ${key} ${results.get(key).status} - ${message}`);
      }
    }
  } catch (error) {
    const message = safeMessage(error, env);
    for (const operation of eligible) {
      if (results.get(operationKey(operation)).status === "skipped") {
        results.set(operationKey(operation), operationResult(operation, "blocked", message));
      }
    }
  } finally {
    client?.close?.();
  }
  const orderedResults = operations.map((operation) => results.get(operationKey(operation)));
  const counts = countResults(new Map(orderedResults.map((operation) => [operationKey(operation), operation])));
  log(`Sandbox REST: ${counts.passed} passed, ${counts.blocked} blocked, ${counts.failed} failed, ${counts.skipped} skipped`);
  return { operations: orderedResults, counts };
}

function countResults(results) {
  return Object.fromEntries(["passed", "blocked", "failed", "skipped"].map((status) => [
    status,
    [...results.values()].filter((operation) => operation.status === status).length,
  ]));
}

async function main() {
  const result = await runVerification();
  process.exitCode = exitCodeFor(result.operations);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) await main();
