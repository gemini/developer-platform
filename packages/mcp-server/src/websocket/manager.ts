import { GeminiWebSocketClient, isTradeMessage, isDepthMessage, isBookTickerMessage, isTickerMessage, isSubscribeResponse } from '../client/websocket.js';
import { MarketDataStore } from '../store/index.js';
import type { WSMessage, WSConnectionStatus, WSManagerState, WSChannel } from '../types/websocket.js';

/**
 * WebSocket manager that integrates client and store
 */
export class WebSocketManager {
  private client: GeminiWebSocketClient;
  private store: MarketDataStore;
  private status: WSConnectionStatus = 'disconnected';
  private lastConnected?: number;
  private lastError?: string;
  private reconnectAttempts = 0;

  constructor(wsUrl: string, store?: MarketDataStore) {
    this.client = new GeminiWebSocketClient(wsUrl);
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
   * Subscribe to a channel
   */
  async subscribe(symbol: string, channel: WSChannel): Promise<void> {
    const channelStr = `${symbol.toLowerCase()}@${channel}`;

    if (this.store.hasSubscription(channelStr)) {
      console.error(`[WSManager] Already subscribed to ${channelStr}`);
      return;
    }

    try {
      await this.client.subscribe([channelStr]);
      this.store.addSubscription(channelStr);
      console.error(`[WSManager] Subscribed to ${channelStr}`);
    } catch (err) {
      console.error(`[WSManager] Failed to subscribe to ${channelStr}:`, err);
      throw err;
    }
  }

  /**
   * Subscribe to multiple symbols for a channel
   */
  async subscribeMultiple(symbols: string[], channel: WSChannel): Promise<void> {
    const channels = symbols.map((s) => `${s.toLowerCase()}@${channel}`);
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
    const channelStr = `${symbol.toLowerCase()}@${channel}`;

    if (!this.store.hasSubscription(channelStr)) {
      console.error(`[WSManager] Not subscribed to ${channelStr}`);
      return;
    }

    try {
      await this.client.unsubscribe([channelStr]);
      this.store.removeSubscription(channelStr);
      console.error(`[WSManager] Unsubscribed from ${channelStr}`);
    } catch (err) {
      console.error(`[WSManager] Failed to unsubscribe from ${channelStr}:`, err);
      throw err;
    }
  }

  /**
   * Unsubscribe from all channels for a symbol
   */
  async unsubscribeSymbol(symbol: string): Promise<void> {
    const lowerSymbol = symbol.toLowerCase();
    const subscriptions = this.store.getSubscriptions();
    const symbolChannels = subscriptions.filter((ch) => ch.startsWith(`${lowerSymbol}@`));

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
      console.error(`[WSManager] Failed to unsubscribe from ${symbol}:`, err);
      throw err;
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
