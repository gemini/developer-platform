import { GeminiWebSocketClient, isTradeMessage, isDepthMessage, isBookTickerMessage, isTickerMessage, isSubscribeResponse } from '../client/websocket.js';
import { MarketDataStore } from '../store/index.js';
import { config } from '../config.js';
import type { SdkClient } from '../client/sdk.js';
import type { ContractStatus, OrderUpdate, WebSocketStream } from '@gemini-markets/sdk/server';
import type { WSMessage, WSConnectionStatus, WSManagerState, WSChannel, CachedOrderUpdate } from '../types/websocket.js';

/**
 * Normalize a symbol into the casing Gemini's WS channel names expect.
 * Spot pairs are lowercase (`btcusd@bookTicker`), but prediction-market
 * contract tickers are uppercase with hyphens (`GEMI-PRES2028-VANCE@bookTicker`)
 * and matched case-sensitively server-side — lowercasing them sends a channel
 * name that never matches, so the caller silently never gets a tick.
 */
export function toChannelSymbol(symbol: string): string {
  return symbol.toUpperCase().startsWith('GEMI-') ? symbol.toUpperCase() : symbol.toLowerCase();
}

// Order-event `E` is nanoseconds in real production traffic today (confirmed
// live — see the wire-level tests in manager.test.ts and the note on
// WSOrderUpdateMessage in types/websocket.ts) — but rather than assuming
// that unconditionally, detect it by magnitude so a millisecond-scale value
// is used as-is instead of being wrongly divided. A millisecond epoch
// timestamp won't reach 1e15 until the year 33658; a nanosecond one is
// already ~1.79e18 today, six orders of magnitude apart, so this is not a
// close call either way.
const NANOSECOND_MAGNITUDE_THRESHOLD = 1e15;

export function toEventTimeMs(rawTimestamp: number): number {
  return rawTimestamp >= NANOSECOND_MAGNITUDE_THRESHOLD ? Math.floor(rawTimestamp / 1_000_000) : rawTimestamp;
}

// bigint-safe variant for the SDK's `number | bigint` timestamp fields.
// Narrowing a nanosecond-scale bigint to `number` *before* dividing (as
// toEventTimeMs does for its plain-number legacy callers) can round the
// value across a millisecond boundary — nanosecond epoch values are ~1.79e18
// today, which only has ~256ns of spacing between representable doubles, so
// a raw value within that spacing of a millisecond boundary rounds up before
// the division ever happens. Dividing in bigint space first, and narrowing
// only the much smaller millisecond quotient, avoids that.
function sdkEventTimeMs(rawTimestamp: number | bigint): number {
  if (typeof rawTimestamp === 'bigint') {
    return rawTimestamp >= BigInt(NANOSECOND_MAGNITUDE_THRESHOLD)
      ? Number(rawTimestamp / 1_000_000n)
      : Number(rawTimestamp);
  }
  return toEventTimeMs(rawTimestamp);
}

// The SDK's lossless WebSocket parser types large integer fields (contract/
// order/trade IDs) as `number | bigint` to avoid the precision loss a plain
// JSON.parse would cause on 17-18 digit values — see stream.ts's
// estimateFrameBytes and the SDK's own websocket.test.ts. `String()` on
// either a safe-integer `number` or a `bigint` yields the exact decimal
// digits with no exponential notation, which is exactly what this package's
// Cached*/store types (string IDs) need.
function idToString(id: number | bigint): string {
  return String(id);
}

/**
 * Reshape the SDK's `ContractStatus` push frame into the positional args
 * `MarketDataStore.updateContractStatus` expects. Contract status's `E` is
 * milliseconds already (unlike order/trade/bookTicker's nanosecond-scale
 * `E`), so it's passed straight through — no toEventTimeMs conversion, same
 * as the legacy wire handler this replaces.
 */
function contractStatusArgsFromSdk(msg: ContractStatus): Parameters<MarketDataStore['updateContractStatus']> {
  return [msg.s, msg.k, msg.c, idToString(msg.i), msg.o, msg.n, msg.p, Number(msg.E)];
}

/**
 * Reshape the SDK's `OrderUpdate` push frame into the object
 * `MarketDataStore.updateOrder` expects. The enum-typed fields (`S`/`o`/`X`/
 * `O`) carry the same literal string values as this package's Cached*
 * unions at runtime; the cast just bridges the generated enum's nominal
 * type to those plain string-literal unions.
 */
function orderUpdateFromSdk(msg: OrderUpdate): Omit<CachedOrderUpdate, 'timestamp'> {
  return {
    orderId: idToString(msg.i),
    clientOrderId: msg.c,
    symbol: msg.s,
    side: msg.S as unknown as 'BUY' | 'SELL' | undefined,
    orderType: msg.o as unknown as string | undefined,
    status: msg.X as unknown as string,
    outcome: msg.O as unknown as 'YES' | 'NO' | undefined,
    price: msg.p,
    stopPrice: msg.P,
    quantity: msg.q,
    remainingQty: msg.z,
    executedQty: msg.Z,
    lastExecutedPrice: msg.L,
    tradeId: msg.t !== undefined ? idToString(msg.t) : undefined,
    feeAmount: msg.n,
    isMaker: msg.m,
    rejectReason: msg.r,
    // sdkEventTimeMs, not toEventTimeMs(Number(msg.E)) — see its doc
    // comment for why narrowing to Number before dividing loses precision.
    eventTimeMs: sdkEventTimeMs(msg.E),
  };
}

/**
 * WebSocket manager that integrates client and store
 */
export class WebSocketManager {
  private client: GeminiWebSocketClient;
  private sdkClient: SdkClient;
  private store: MarketDataStore;
  private status: WSConnectionStatus = 'disconnected';
  private lastConnected?: number;
  private lastError?: string;
  private reconnectAttempts = 0;
  // Tracks in-flight subscribe() calls per channel. Without this, two
  // concurrent callers for the same channel both see no subscription yet
  // (the store isn't updated until the wire call resolves), so both send a
  // subscribe request — Gemini can deliver duplicate events or reject the
  // second one. Concurrent callers now await the same in-flight promise.
  // Shared by both the legacy wire subscribe() path and the SDK-backed
  // contractStatus/orders@account streams below — the channel-name keys
  // ('btcusd@bookTicker' vs 'contractStatus'/'orders@account') never
  // collide, so one map safely dedupes both.
  private pendingSubscriptions: Map<string, Promise<void>> = new Map();
  // SDK-backed public/private streams for contractStatus and orders@account.
  // Kept so disconnect() can release them; only set once subscribed
  // successfully (see subscribeOnce below).
  private contractStatusStream?: WebSocketStream<ContractStatus>;
  private orderUpdateStream?: WebSocketStream<OrderUpdate>;

  constructor(wsUrl: string, sdkClient: SdkClient, store?: MarketDataStore) {
    this.client = new GeminiWebSocketClient(wsUrl);
    this.sdkClient = sdkClient;
    this.store = store || new MarketDataStore();

    // Register message handler
    this.client.addMessageHandler(this.handleMessage.bind(this));
  }

  /**
   * Initialize and connect to WebSocket
   */
  async initialize(): Promise<void> {
    try {
      this.status = 'connecting';
      await this.client.connect();
      this.status = 'connected';
      this.lastConnected = Date.now();
      this.reconnectAttempts = 0;
      this.lastError = undefined;
    } catch (err) {
      this.status = 'error';
      this.lastError = err instanceof Error ? err.message : String(err);
      this.reconnectAttempts++;
      throw err;
    }
  }

  /**
   * Subscribe to a single channel, deduplicating concurrent callers and
   * recording the subscription only once the wire call actually succeeds.
   * `doSubscribe` performs the actual subscribe — defaulting to the legacy
   * wire client for bookTicker/trade/depth/ticker channels — so
   * contractStatus/orders@account can plug in the SDK-backed streams below
   * while sharing this same dedup guard.
   */
  private subscribeOnce(channelStr: string, doSubscribe?: () => Promise<void>): Promise<void> {
    if (this.store.hasSubscription(channelStr)) {
      console.error(`[WSManager] Already subscribed to ${channelStr}`);
      return Promise.resolve();
    }

    const pending = this.pendingSubscriptions.get(channelStr);
    if (pending) return pending;

    const subscribeAction = doSubscribe ?? (() => this.client.subscribe([channelStr]).then(() => undefined));

    const promise = subscribeAction()
      .then(() => {
        this.store.addSubscription(channelStr);
        console.error(`[WSManager] Subscribed to ${channelStr}`);
      })
      .catch((err) => {
        console.error('[WSManager] Failed to subscribe to %s:', channelStr, err);
        throw err;
      })
      .finally(() => {
        this.pendingSubscriptions.delete(channelStr);
      });

    this.pendingSubscriptions.set(channelStr, promise);
    return promise;
  }

  /**
   * Subscribe to a channel
   */
  async subscribe(symbol: string, channel: WSChannel): Promise<void> {
    return this.subscribeOnce(`${toChannelSymbol(symbol)}@${channel}`);
  }

  /**
   * Subscribe to multiple symbols for a channel
   */
  async subscribeMultiple(symbols: string[], channel: WSChannel): Promise<void> {
    const channels = symbols.map((s) => `${toChannelSymbol(s)}@${channel}`);
    const newChannels = channels.filter((ch) => !this.store.hasSubscription(ch));

    if (newChannels.length === 0) {
      console.error('[WSManager] All channels already subscribed');
      return;
    }

    try {
      await this.client.subscribe(newChannels);
      for (const ch of newChannels) {
        this.store.addSubscription(ch);
      }
      console.error(`[WSManager] Subscribed to ${newChannels.length} channels`);
    } catch (err) {
      console.error('[WSManager] Failed to subscribe to channels:', err);
      throw err;
    }
  }

  /**
   * Unsubscribe from a channel
   */
  async unsubscribe(symbol: string, channel: WSChannel): Promise<void> {
    const channelStr = `${toChannelSymbol(symbol)}@${channel}`;

    if (!this.store.hasSubscription(channelStr)) {
      console.error(`[WSManager] Not subscribed to ${channelStr}`);
      return;
    }

    try {
      await this.client.unsubscribe([channelStr]);
      this.store.removeSubscription(channelStr);
      console.error(`[WSManager] Unsubscribed from ${channelStr}`);
    } catch (err) {
      console.error('[WSManager] Failed to unsubscribe from %s:', channelStr, err);
      throw err;
    }
  }

  /**
   * Unsubscribe from all channels for a symbol
   */
  async unsubscribeSymbol(symbol: string): Promise<void> {
    const normalizedSymbol = toChannelSymbol(symbol);
    const subscriptions = this.store.getSubscriptions();
    const symbolChannels = subscriptions.filter((ch) => ch.startsWith(`${normalizedSymbol}@`));

    if (symbolChannels.length === 0) {
      console.error(`[WSManager] No subscriptions for ${symbol}`);
      return;
    }

    try {
      await this.client.unsubscribe(symbolChannels);
      for (const ch of symbolChannels) {
        this.store.removeSubscription(ch);
      }
      this.store.clear(symbol);
      console.error(`[WSManager] Unsubscribed from all ${symbol} channels`);
    } catch (err) {
      console.error('[WSManager] Failed to unsubscribe from %s:', symbol, err);
      throw err;
    }
  }

  /**
   * Subscribe to the global contractStatus channel (prediction-market
   * strike/settlement lifecycle events) via the SDK's public
   * `client.websocket.public.contractStatus()` stream. Unlike bookTicker/
   * trade/depth, this has no per-symbol wire subscription — Gemini pushes
   * every contract's status changes on one shared channel (confirmed
   * against sdk-go's SubscribeContractStatus, which sends the literal
   * channel name "contractStatus" regardless of the symbol callers filter
   * by). Callers read a specific symbol's latest status back out of the
   * store. Reconnect/backoff for this stream is handled inside the SDK.
   */
  async subscribeContractStatus(): Promise<void> {
    return this.subscribeOnce('contractStatus', () => this.startContractStatusStream());
  }

  private async startContractStatusStream(): Promise<void> {
    const stream = this.sdkClient.websocket.public.contractStatus();
    stream.on('message', (msg) => this.handleContractStatusMessage(msg));
    try {
      await stream.ready;
    } catch (err) {
      void stream.close();
      throw err;
    }
    // Only retained once the subscribe ack lands, matching subscribeOnce's
    // "record the subscription only once the wire call actually succeeds".
    this.contractStatusStream = stream;
  }

  private handleContractStatusMessage(msg: ContractStatus): void {
    try {
      this.store.updateContractStatus(...contractStatusArgsFromSdk(msg));
    } catch (err) {
      console.error('[WSManager] Error handling contractStatus message:', err);
    }
  }

  /**
   * Subscribe to the authenticated orders@account channel (fill/cancel/
   * reject confirmation for every order on the account) via the SDK's
   * `client.websocket.private.orders({ scope: 'account' })` stream. Like
   * contractStatus, this is one global channel — no per-symbol wire
   * subscription. Throws immediately if credentials aren't configured,
   * mirroring GeminiHttpClient.authenticatedPost's guard, rather than
   * attempting the subscribe and getting a confusing late rejection from
   * either Gemini or the SDK's own "authenticated WebSocket operation
   * requires auth" error.
   */
  async subscribeAccountOrders(): Promise<void> {
    if (!config.apiKey || !config.apiSecret) {
      throw new Error(
        'Authentication required for orders@account: GEMINI_API_KEY and GEMINI_API_SECRET ' +
          'must be set in the MCP server environment. This tool is unavailable in public-only mode.'
      );
    }
    return this.subscribeOnce('orders@account', () => this.startAccountOrdersStream());
  }

  private async startAccountOrdersStream(): Promise<void> {
    const stream = this.sdkClient.websocket.private.orders({ scope: 'account' });
    stream.on('message', (msg) => this.handleOrderUpdateMessage(msg));
    try {
      await stream.ready;
    } catch (err) {
      void stream.close();
      throw err;
    }
    this.orderUpdateStream = stream;
  }

  private handleOrderUpdateMessage(msg: OrderUpdate): void {
    try {
      this.store.updateOrder(orderUpdateFromSdk(msg));
    } catch (err) {
      console.error('[WSManager] Error handling orderUpdate message:', err);
    }
  }

  /**
   * Handle incoming WebSocket message
   */
  private handleMessage(message: WSMessage): void {
    try {
      // Skip subscription responses
      if (isSubscribeResponse(message)) {
        return;
      }

      // contractStatus and orderUpdate/order messages no longer arrive here —
      // subscribeContractStatus()/subscribeAccountOrders() now push those
      // through the SDK's own WebSocketStream objects (see
      // startContractStatusStream/startAccountOrdersStream above), which
      // route straight to handleContractStatusMessage/handleOrderUpdateMessage
      // without going through the legacy client's message handler at all.

      // Handle trade messages
      if (isTradeMessage(message)) {
        this.store.updatePrice(message.s, message.p, 'trade');
        this.store.addTrade(
          message.s,
          message.p,
          message.q,
          message.m,
          message.t,
          Math.floor(message.E / 1_000_000) // Convert nanoseconds to milliseconds
        );
        return;
      }

      // Handle depth messages (order book)
      if (isDepthMessage(message)) {
        this.store.updateOrderBook(message.s, message.b, message.a);
        return;
      }

      // Handle book ticker messages
      if (isBookTickerMessage(message)) {
        this.store.updateBookTicker(message.s, message.b, message.B, message.a, message.A);
        // Also update price from best bid/ask midpoint
        const midPrice = (
          (parseFloat(message.b) + parseFloat(message.a)) / 2
        ).toString();
        this.store.updatePrice(message.s, midPrice, 'ticker');
        return;
      }

      // Handle ticker messages
      if (isTickerMessage(message)) {
        this.store.updatePrice(message.s, message.c, 'ticker');
        return;
      }

      // Unknown message type
      console.error('[WSManager] Unknown message type:', message);
    } catch (err) {
      console.error('[WSManager] Error handling message:', err);
    }
  }

  /**
   * Get manager state
   */
  getState(): WSManagerState {
    return {
      status: this.status,
      subscriptions: this.store.getSubscriptions(),
      lastConnected: this.lastConnected,
      lastError: this.lastError,
      reconnectAttempts: this.reconnectAttempts,
    };
  }

  /**
   * Get the store instance
   */
  getStore(): MarketDataStore {
    return this.store;
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.client.isConnected();
  }

  /**
   * Disconnect WebSocket
   */
  disconnect(): void {
    this.client.disconnect();
    // Release the SDK-backed contractStatus/orders@account streams too, if
    // any were ever established — otherwise their underlying WebSocket
    // sessions (and the SDK's own reconnect loop for them) would outlive
    // this manager.
    void this.contractStatusStream?.close();
    void this.orderUpdateStream?.close();
    this.status = 'disconnected';
    console.error('[WSManager] Disconnected');
  }

  /**
   * Get store statistics
   */
  getStats() {
    return this.store.getStats();
  }
}
