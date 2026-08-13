import { NOOP_LOGGER } from "./logging.js";
import type { GeminiMarketsOptions, LiveOrderBook as LiveOrderBookContract } from "./types/client.js";
import type { RequestOptions } from "./core/deadline.js";
import { HttpTransport, type FetchLike } from "./core/http.js";
import { GeminiWebSocket } from "./websocket.js";
import { PredictionMarkets } from "./prediction-markets.js";
import { AccountServicesRest } from "./generated/account-services/rest.js";
import { ClearingInstantRest } from "./generated/clearing-instant/rest.js";
import { MarginRest } from "./generated/margin/rest.js";
import { MarketDataRest } from "./generated/market-data/rest.js";
import { PerpetualsRest } from "./generated/perpetuals/rest.js";
import { TradingRest } from "./generated/trading/rest.js";
import { ManagedHeartbeat } from "./heartbeat.js";
import { ENVIRONMENT_URLS } from "./core/environment.js";

const DEFAULT_HEARTBEAT_INTERVAL_MS = 15_000;

interface RuntimeOptions extends GeminiMarketsOptions {
  fetchImpl?: FetchLike;
}

export class GeminiMarkets {
  readonly predictions: PredictionMarkets;
  readonly marketData: MarketDataRest;
  readonly trading: TradingRest;
  readonly margin: MarginRest;
  readonly perpetuals: PerpetualsRest;
  readonly accountServices: AccountServicesRest;
  readonly clearingInstant: ClearingInstantRest;
  readonly websocket: GeminiWebSocket;

  constructor(options?: GeminiMarketsOptions) {
    const settings = (options ?? {}) as RuntimeOptions;
    const env = settings.env ?? "production";
    const logger = settings.logger ?? NOOP_LOGGER;
    const restTransport = new HttpTransport({
      env,
      auth: settings.auth,
      logger,
      onDiagnostic: settings.onDiagnostic,
      fetchImpl: settings.fetch ?? settings.fetchImpl,
      maxRetries: settings.maxRetries,
      backoff: settings.backoff,
      timeoutMs: settings.timeoutMs,
    });

    this.predictions = new PredictionMarkets(restTransport);
    this.marketData = new MarketDataRest(restTransport);
    this.trading = new TradingRest(restTransport);
    this.margin = new MarginRest(restTransport);
    this.perpetuals = new PerpetualsRest(restTransport);
    this.accountServices = new AccountServicesRest(restTransport);
    this.clearingInstant = new ClearingInstantRest(restTransport);
    const websocketUrl = ENVIRONMENT_URLS[env].websocket;
    this.websocket = new GeminiWebSocket({
      url: websocketUrl,
      snapshotUrl: `${websocketUrl}?snapshot=-1`,
      auth: settings.auth,
      logger,
      onDiagnostic: settings.onDiagnostic,
      socketFactory: settings.webSocketFactory,
      snapshotStream: env === "sandbox",
      timeoutMs: settings.timeoutMs,
      liveness: settings.webSocketLiveness,
      maxMessageSizeBytes: settings.webSocketMaxMessageSizeBytes,
    });
  }

  orderBook(symbol: string, options?: RequestOptions): LiveOrderBookContract {
    return this.websocket.orderBook(symbol, options);
  }

  /** Create a stopped heartbeat handle; call start() explicitly to begin sending. */
  createHeartbeat(options?: {
    intervalMs?: number;
    onError?: (error: unknown) => void;
    requestOptions?: RequestOptions;
  }): ManagedHeartbeat {
    return new ManagedHeartbeat({
      intervalMs: options?.intervalMs ?? DEFAULT_HEARTBEAT_INTERVAL_MS,
      onError: options?.onError,
      requestOptions: options?.requestOptions,
      beat: (requestOptions) => this.trading.sendHeartbeat({}, requestOptions),
    });
  }

  /** @deprecated Use `createHeartbeat()` — this alias will be removed in a future release. */
  startHeartbeat(options?: {
    intervalMs?: number;
    onError?: (error: unknown) => void;
    requestOptions?: RequestOptions;
  }): ManagedHeartbeat {
    return this.createHeartbeat(options);
  }

  close(): void {
    this.websocket.close();
  }
}
