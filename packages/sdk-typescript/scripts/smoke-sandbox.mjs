import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import { boundaryValueKind } from "./runtime-value.mjs";

export async function placeWithCleanup(predictions, order, verify = async () => {}) {
  let orderId;
  try {
    const placed = await predictions.placeOrder(order);
    orderId = placed.orderId;
    await verify(placed);
  } finally {
    if (orderId !== undefined) await predictions.cancelOrder({ orderId });
  }
}

export function smokeEnvironment(value = "sandbox") {
  if (value !== "production" && value !== "sandbox") throw new Error("smoke environment must be production or sandbox");
  return value;
}

export function smokeMarketType(args = process.argv.slice(2)) {
  const value = args.find((arg) => arg.startsWith("--market-type="))?.slice("--market-type=".length);
  if (value !== "market-data" && value !== "prediction-markets") {
    throw new Error("pass --market-type=market-data or --market-type=prediction-markets");
  }
  return value;
}

export function predictionMarketSymbols(response) {
  const events = Array.isArray(response) ? response : response?.data ?? response?.events ?? [];
  return [...new Set(events.flatMap((event) => [...(event?.markets ?? []), ...(event?.contracts ?? [])])
    .map((market) => boundaryValueKind(market)=== "string" ? market : market?.symbol ?? market?.instrumentSymbol)
    .filter(Boolean))];
}

export function marketDataSymbols(response) {
  const symbols = Array.isArray(response) ? response : response?.data ?? response?.symbols ?? [];
  return [...new Set(symbols
    .map((entry) => boundaryValueKind(entry)=== "string" ? entry : entry?.symbol ?? entry?.pair)
    .filter((symbol) => boundaryValueKind(symbol)=== "string" && symbol.toUpperCase().includes("BTC")))];
}

async function liveSnapshot(client, symbols) {
  for (const symbol of symbols) {
    console.log(`Sandbox order book: trying ${symbol} (10s timeout)`);
    const book = client.orderBook(symbol);
    try {
      await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error("live book timeout")), 10_000);
        book.on("update", () => { clearTimeout(timer); resolve(); });
        book.on("error", (error) => { clearTimeout(timer); reject(error); });
      });
      assert(book.snapshot().bids.length + book.snapshot().asks.length > 0, "empty live book");
      console.log(`Sandbox order book: received update for ${symbol}`);
      return book;
    } catch (error) {
      book.close();
      if (error.message !== "live book timeout") throw error;
      console.log(`Sandbox order book: ${symbol} timed out; trying next`);
    }
  }
  throw new Error("no live book updates for the selected symbols");
}

async function main() {
  const { createClient, HmacAuth } = await import("../dist/server/index.js");
  const environment = smokeEnvironment(process.env.GEMINI_SMOKE_ENV);
  const marketType = smokeMarketType();
  const label = process.env.GEMINI_SMOKE_LABEL ?? environment;
  const apiKey = process.env.GEMINI_API_KEY;
  const apiSecret = process.env.GEMINI_API_SECRET;
  if (!apiKey || !apiSecret) throw new Error("GEMINI_API_KEY and GEMINI_API_SECRET are required");
  const accept = process.argv.includes("--accept-terms");
  const place = process.argv.includes("--place-order");
  const client = await createClient({ env: environment, auth: new HmacAuth({ apiKey, apiSecret }) });
  let book;
  try {
    const events = marketType === "prediction-markets"
      ? await client.predictions.listEvents({ status: ["active"], limit: 10 })
      : undefined;
    const symbols = marketType === "prediction-markets"
      ? predictionMarketSymbols(events)
      : marketDataSymbols(await client.marketData.listSymbols());
    if (!symbols.length) throw new Error(`No active ${marketType} symbol was discovered`);
    console.log(`Sandbox order book: type=${marketType}, discovered ${symbols.length} symbol(s)`);
    book = await liveSnapshot(client, symbols);
    if (marketType === "prediction-markets") {
      const terms = await client.predictions.getPredictionMarketsTermsStatus();
      if (accept && !terms.hasAcceptedLatest) await client.predictions.acceptTerms();
      const positions = await client.predictions.getPositions({ limit: 1 });
      const rebates = await client.predictions.getMakerRebateLifetimeSummary();
      const rewards = await client.predictions.getLiquidityRewardsLifetimeSummary();
      console.log(`${label} read-only smoke passed`, { events: events.data?.length ?? events.events?.length ?? 0, positions: positions.positions?.length ?? 0, rebates: Boolean(rebates), rewards: Boolean(rewards) });
    } else {
      console.log(`${label} market-data order-book smoke passed`);
    }
    if (place) {
      if (marketType !== "prediction-markets") throw new Error("--place-order requires --market-type=prediction-markets");
      for (const name of ["GEMINI_PM_SIDE", "GEMINI_PM_OUTCOME", "GEMINI_PM_QUANTITY", "GEMINI_PM_PRICE"]) if (!process.env[name]) throw new Error(`${name} is required with --place-order`);
      await placeWithCleanup(client.predictions, { symbol: symbols[0], orderType: "limit", side: process.env.GEMINI_PM_SIDE, outcome: process.env.GEMINI_PM_OUTCOME, quantity: process.env.GEMINI_PM_QUANTITY, price: process.env.GEMINI_PM_PRICE, makerOrCancel: false });
      console.log(`${label} order placed and cancelled`);
    }
  } finally { book?.close(); client.close(); }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) await main();
