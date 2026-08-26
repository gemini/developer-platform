import type { GeminiMarketsOptions, LiveOrderBook as LiveOrderBookContract } from "../types/client.js";
import type { RequestOptions } from "../utils/deadline.js";
import { PublicGeminiWebSocket } from "../websocket/public.js";
import { ManagedHeartbeat } from "../services/trading/heartbeat.js";
import { toBase64Url } from "../utils/encoding.js";
import { createClientCore } from "./core.js";
import type { AccountRest } from "../generated/account/rest.js";
import type { ClearingRest } from "../generated/clearing/rest.js";
import type { InstantRest } from "../generated/instant/rest.js";
import type { MarginRest } from "../generated/margin/rest.js";
import type { MarketDataRest } from "../generated/market-data/rest.js";
import type { PerpetualsRest } from "../generated/perpetuals/rest.js";
import type { PredictionMarkets } from "../services/predictions.js";
import type { StakingRest } from "../generated/staking/rest.js";
import type { TransfersRest } from "../generated/transfers/rest.js";
import type { TradingRest } from "../generated/trading/rest.js";

const DEFAULT_HEARTBEAT_INTERVAL_MS = 15_000;

/** Browser WebSocket root. Browser clients deliberately expose no private namespace. */
export class BrowserWebSocket {
  readonly public: PublicGeminiWebSocket;

  constructor(options: ConstructorParameters<typeof PublicGeminiWebSocket>[0]) {
    this.public = new PublicGeminiWebSocket(options);
  }

  close(): void {
    this.public.close();
  }

  [Symbol.dispose](): void {
    this.close();
  }

  async [Symbol.asyncDispose](): Promise<void> {
    this.close();
  }
}

/** Browser-safe client composition. Its module graph contains public WebSockets only. */
export class BrowserGeminiMarkets {
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
  readonly websocket: BrowserWebSocket;

  constructor(options: GeminiMarketsOptions) {
    const core = createClientCore(options);
    this.predictions = core.predictions;
    this.marketData = core.marketData;
    this.trading = core.trading;
    this.margin = core.margin;
    this.perpetuals = core.perpetuals;
    this.account = core.account;
    this.staking = core.staking;
    this.transfers = core.transfers;
    this.clearing = core.clearing;
    this.instant = core.instant;
    this.websocket = new BrowserWebSocket({
      url: core.websocketUrl,
      snapshotUrl: `${core.websocketUrl}?snapshot=-1`,
      logger: core.logger,
      onDiagnostic: options?.onDiagnostic,
      socketFactory: options?.webSocketFactory,
      snapshotStream: core.env === "sandbox",
      timeoutMs: options?.timeoutMs,
      liveness: options?.webSocketLiveness,
      maxMessageSizeBytes: options?.webSocketMaxMessageSizeBytes,
      backoff: options?.webSocketBackoff,
      reconnect: options?.webSocketReconnect,
      handshakeTimeoutMs: options?.webSocketHandshakeTimeoutMs,
      perMessageDeflate: options?.webSocketPerMessageDeflate,
    });
  }

  orderBook(symbol: string, options?: RequestOptions): LiveOrderBookContract {
    return this.websocket.public.orderBook(symbol, options);
  }

  generateClientOrderId(prefix = "gem"): string {
    const bytes = new Uint8Array(12);
    crypto.getRandomValues(bytes);
    return `${prefix}_${toBase64Url(bytes)}`;
  }

  createHeartbeat(options?: { intervalMs?: number; onError?: (cause: unknown) => void; requestOptions?: RequestOptions }): ManagedHeartbeat {
    return new ManagedHeartbeat({
      intervalMs: options?.intervalMs ?? DEFAULT_HEARTBEAT_INTERVAL_MS,
      onError: options?.onError,
      requestOptions: options?.requestOptions,
      beat: (requestOptions) => this.trading.sendHeartbeat(undefined, requestOptions),
    });
  }

  close(): void {
    this.websocket.close();
  }

  [Symbol.dispose](): void {
    this.close();
  }

  async [Symbol.asyncDispose](): Promise<void> {
    this.close();
  }
}
