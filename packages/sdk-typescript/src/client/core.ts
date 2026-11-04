import { NOOP_LOGGER } from "../observability/logging.js";
import { SdkError } from "../errors.js";
import type { Environment, GeminiMarketsOptions } from "../types/client.js";
import type { Logger } from "../observability/logging.js";
import { HttpTransport } from "../transport/http.js";
import { PredictionMarkets } from "../services/predictions.js";
import { AccountRest } from "../generated/account/rest.js";
import { ClearingRest } from "../generated/clearing/rest.js";
import { InstantRest } from "../generated/instant/rest.js";
import { MarginRest } from "../generated/margin/rest.js";
import { MarketDataRest } from "../generated/market-data/rest.js";
import { PerpetualsRest } from "../generated/perpetuals/rest.js";
import { StakingRest } from "../generated/staking/rest.js";
import { TransfersRest } from "../generated/transfers/rest.js";
import { TradingRest } from "../generated/trading/rest.js";

const ENVIRONMENT_URLS = {
  production: {
    rest: "https://api.gemini.com",
    websocket: "wss://ws.gemini.com",
  },
  sandbox: {
    rest: "https://api.sandbox.gemini.com",
    websocket: "wss://ws.sandbox.gemini.com",
  },
} as const satisfies Record<Environment, { rest: string; websocket: string }>;

/** Shared REST and environment state used by browser and server clients. */
export interface ClientCore {
  readonly env: Environment;
  readonly logger: Logger;
  readonly websocketUrl: string;
  readonly restTransport: HttpTransport;
  readonly predictions: PredictionMarkets;
  readonly marketData: MarketDataRest;
  readonly trading: TradingRest;
  readonly margin: MarginRest;
  readonly perpetuals: PerpetualsRest;
  readonly account: AccountRest;
  readonly staking: StakingRest;
  readonly transfers: TransfersRest;
  readonly clearing: ClearingRest;
  readonly instant: InstantRest;
}

/**
 * Construct the shared REST clients once for either runtime entry point.
 * WebSocket construction remains in the entry-specific client modules so the
 * browser graph cannot acquire authenticated server WebSocket code.
 */
export function createClientCore(options: GeminiMarketsOptions): ClientCore {
  const settings = options;
  if (!settings?.env) throw new SdkError("env is required; choose \"sandbox\" or \"production\"");
  const env = settings.env;
  const logger = settings.logger ?? NOOP_LOGGER;
  const environmentUrls = ENVIRONMENT_URLS[env];
  const restTransport = new HttpTransport({
    env,
    baseUrl: environmentUrls.rest,
    auth: settings.auth,
    logger,
    onDiagnostic: settings.onDiagnostic,
    fetchImpl: settings.fetch,
    maxRetries: settings.maxRetries,
    maxResponseSizeBytes: settings.maxResponseSizeBytes,
    backoff: settings.backoff,
    timeoutMs: settings.timeoutMs,
    onRequest: settings.onRequest,
    onResponse: settings.onResponse,
  });

  return {
    env,
    logger,
    websocketUrl: environmentUrls.websocket,
    restTransport,
    predictions: new PredictionMarkets(restTransport),
    marketData: new MarketDataRest(restTransport),
    trading: new TradingRest(restTransport),
    margin: new MarginRest(restTransport),
    perpetuals: new PerpetualsRest(restTransport),
    account: new AccountRest(restTransport),
    staking: new StakingRest(restTransport),
    transfers: new TransfersRest(restTransport),
    clearing: new ClearingRest(restTransport),
    instant: new InstantRest(restTransport),
  };
}
