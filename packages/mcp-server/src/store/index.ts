import type {
  CachedPriceData,
  CachedOrderBook,
  CachedTrade,
  CachedBookTicker,
  CachedContractStatus,
  CachedOrderUpdate,
} from '../types/websocket.js';

export type MarketUpdateKind = 'price' | 'orderBook' | 'trade' | 'bookTicker' | 'contractStatus';

export interface MarketUpdateEvent {
  symbol: string;
  kind: MarketUpdateKind;
  timestamp: number;
}

export type MarketUpdateListener = (event: MarketUpdateEvent) => void;
export type OrderUpdateListener = (update: CachedOrderUpdate) => void;

/**
 * In-memory store for real-time market data from WebSocket feeds
 */
export class MarketDataStore {
  private prices: Map<string, CachedPriceData> = new Map();
  private orderBooks: Map<string, CachedOrderBook> = new Map();
  private trades: Map<string, CachedTrade[]> = new Map();
  private bookTickers: Map<string, CachedBookTicker> = new Map();
  private contractStatuses: Map<string, CachedContractStatus> = new Map();
  // Keyed by order ID, not symbol — one account has orders across many
  // symbols, so this (and its listener map below) deliberately doesn't
  // reuse the symbol-keyed lastUpdate/listeners/onUpdate machinery above.
  private orders: Map<string, CachedOrderUpdate> = new Map();
  private orderListeners: Map<string, Set<OrderUpdateListener>> = new Map();
  private subscriptions: Set<string> = new Set();
  private lastUpdate: Map<string, number> = new Map();
  private listeners: Map<string, Set<MarketUpdateListener>> = new Map();

  // Configuration
  private readonly maxTradesPerSymbol: number;
  private readonly maxOrders: number;

  constructor(maxTradesPerSymbol = 100, maxOrders = 1000) {
    this.maxTradesPerSymbol = maxTradesPerSymbol;
    this.maxOrders = maxOrders;
  }

  /**
   * Subscribe to in-process updates for a symbol. Returns an unsubscribe
   * function. A misbehaving listener cannot break market-data ingestion —
   * its exception is swallowed and logged to stderr.
   */
  onUpdate(symbol: string, listener: MarketUpdateListener): () => void {
    const key = symbol.toUpperCase();
    let set = this.listeners.get(key);
    if (!set) {
      set = new Set();
      this.listeners.set(key, set);
    }
    set.add(listener);
    return () => {
      const current = this.listeners.get(key);
      current?.delete(listener);
      if (current && current.size === 0) this.listeners.delete(key);
    };
  }

  private emit(event: MarketUpdateEvent): void {
    const set = this.listeners.get(event.symbol);
    if (!set || set.size === 0) return;
    for (const cb of set) {
      try {
        cb(event);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('MarketDataStore listener for %s threw:', event.symbol, err);
      }
    }
  }

  /**
   * Subscribe to updates for a single order ID. Returns an unsubscribe
   * function. Separate from onUpdate() above because orders are keyed by
   * order ID, not symbol.
   */
  onOrderUpdate(orderId: string, listener: OrderUpdateListener): () => void {
    let set = this.orderListeners.get(orderId);
    if (!set) {
      set = new Set();
      this.orderListeners.set(orderId, set);
    }
    set.add(listener);
    return () => {
      const current = this.orderListeners.get(orderId);
      current?.delete(listener);
      if (current && current.size === 0) this.orderListeners.delete(orderId);
    };
  }

  private emitOrderUpdate(update: CachedOrderUpdate): void {
    const set = this.orderListeners.get(update.orderId);
    if (!set || set.size === 0) return;
    for (const cb of set) {
      try {
        cb(update);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('MarketDataStore order listener for %s threw:', update.orderId, err);
      }
    }
  }

  /**
   * Update price data for a symbol
   */
  updatePrice(symbol: string, price: string, source: 'trade' | 'ticker' = 'trade'): void {
    const upperSymbol = symbol.toUpperCase();
    const timestamp = Date.now();
    this.prices.set(upperSymbol, {
      symbol: upperSymbol,
      price,
      timestamp,
      source,
    });
    this.lastUpdate.set(upperSymbol, timestamp);
    this.emit({ symbol: upperSymbol, kind: 'price', timestamp });
  }

  /**
   * Update order book for a symbol
   */
  updateOrderBook(symbol: string, bids: [string, string][], asks: [string, string][]): void {
    const upperSymbol = symbol.toUpperCase();
    const timestamp = Date.now();
    this.orderBooks.set(upperSymbol, {
      symbol: upperSymbol,
      bids,
      asks,
      timestamp,
    });
    this.lastUpdate.set(upperSymbol, timestamp);
    this.emit({ symbol: upperSymbol, kind: 'orderBook', timestamp });
  }

  /**
   * Add a trade to the trade history (circular buffer)
   */
  addTrade(
    symbol: string,
    price: string,
    quantity: string,
    isMaker: boolean,
    tradeId: number,
    timestamp?: number
  ): void {
    const upperSymbol = symbol.toUpperCase();
    const trades = this.trades.get(upperSymbol) || [];

    trades.push({
      symbol: upperSymbol,
      price,
      quantity,
      isMaker,
      tradeId,
      timestamp: timestamp || Date.now(),
    });

    // Keep only the last N trades
    if (trades.length > this.maxTradesPerSymbol) {
      trades.shift();
    }

    this.trades.set(upperSymbol, trades);
    const tradeTs = Date.now();
    this.lastUpdate.set(upperSymbol, tradeTs);
    this.emit({ symbol: upperSymbol, kind: 'trade', timestamp: tradeTs });
  }

  /**
   * Update book ticker (best bid/ask)
   */
  updateBookTicker(
    symbol: string,
    bestBid: string,
    bestBidQty: string,
    bestAsk: string,
    bestAskQty: string
  ): void {
    const upperSymbol = symbol.toUpperCase();
    const timestamp = Date.now();
    this.bookTickers.set(upperSymbol, {
      symbol: upperSymbol,
      bestBid,
      bestBidQty,
      bestAsk,
      bestAskQty,
      timestamp,
    });
    this.lastUpdate.set(upperSymbol, timestamp);
    this.emit({ symbol: upperSymbol, kind: 'bookTicker', timestamp });
  }

  /**
   * Update contract status (prediction-market strike/settlement lifecycle event)
   */
  updateContractStatus(
    symbol: string,
    eventTicker: string,
    contractTicker: string,
    contractId: string,
    previousStatus: string,
    newStatus: string,
    strikePrice: string | undefined,
    eventTimeMs: number
  ): void {
    const upperSymbol = symbol.toUpperCase();
    const timestamp = Date.now();
    this.contractStatuses.set(upperSymbol, {
      symbol: upperSymbol,
      eventTicker,
      contractTicker,
      contractId,
      previousStatus,
      newStatus,
      strikePrice,
      eventTimeMs,
      timestamp,
    });
    this.lastUpdate.set(upperSymbol, timestamp);
    this.emit({ symbol: upperSymbol, kind: 'contractStatus', timestamp });
  }

  /**
   * Update (or insert) the latest known state for an order. Not
   * symbol-scoped — see the `orders` field comment.
   */
  updateOrder(update: Omit<CachedOrderUpdate, 'timestamp'>): void {
    // Bounded so a long-lived process with sustained order activity doesn't
    // grow this map forever — only relevant when this is a genuinely new
    // order ID; updating an existing one never grows the map. Map preserves
    // insertion order, so the first key is the oldest tracked order.
    if (!this.orders.has(update.orderId) && this.orders.size >= this.maxOrders) {
      const oldestOrderId = this.orders.keys().next().value;
      if (oldestOrderId !== undefined) {
        this.orders.delete(oldestOrderId);
      }
    }

    const record: CachedOrderUpdate = { ...update, timestamp: Date.now() };
    this.orders.set(update.orderId, record);
    this.emitOrderUpdate(record);
  }

  /**
   * Get current price for a symbol
   */
  getPrice(symbol: string): CachedPriceData | undefined {
    return this.prices.get(symbol.toUpperCase());
  }

  /**
   * Get order book for a symbol
   */
  getOrderBook(symbol: string): CachedOrderBook | undefined {
    return this.orderBooks.get(symbol.toUpperCase());
  }

  /**
   * Get recent trades for a symbol
   */
  getTrades(symbol: string, limit?: number): CachedTrade[] {
    const trades = this.trades.get(symbol.toUpperCase()) || [];
    if (limit && limit < trades.length) {
      return trades.slice(-limit);
    }
    return trades;
  }

  /**
   * Get book ticker for a symbol
   */
  getBookTicker(symbol: string): CachedBookTicker | undefined {
    return this.bookTickers.get(symbol.toUpperCase());
  }

  /**
   * Get the latest known contract status for a symbol
   */
  getContractStatus(symbol: string): CachedContractStatus | undefined {
    return this.contractStatuses.get(symbol.toUpperCase());
  }

  /**
   * Get the latest known state for an order by ID
   */
  getOrder(orderId: string): CachedOrderUpdate | undefined {
    return this.orders.get(orderId);
  }

  /**
   * Get all cached symbols
   */
  getSymbols(): string[] {
    return Array.from(this.lastUpdate.keys());
  }

  /**
   * Get snapshot of all data for a symbol
   */
  getSnapshot(symbol: string): {
    price?: CachedPriceData;
    orderBook?: CachedOrderBook;
    trades: CachedTrade[];
    bookTicker?: CachedBookTicker;
    lastUpdate?: number;
  } {
    const upperSymbol = symbol.toUpperCase();
    return {
      price: this.getPrice(upperSymbol),
      orderBook: this.getOrderBook(upperSymbol),
      trades: this.getTrades(upperSymbol),
      bookTicker: this.getBookTicker(upperSymbol),
      lastUpdate: this.lastUpdate.get(upperSymbol),
    };
  }

  /**
   * Clear all data for a symbol
   */
  clear(symbol: string): void {
    const upperSymbol = symbol.toUpperCase();
    this.prices.delete(upperSymbol);
    this.orderBooks.delete(upperSymbol);
    this.trades.delete(upperSymbol);
    this.bookTickers.delete(upperSymbol);
    this.contractStatuses.delete(upperSymbol);
    this.lastUpdate.delete(upperSymbol);
  }

  /**
   * Clear all data
   */
  clearAll(): void {
    this.prices.clear();
    this.orderBooks.clear();
    this.trades.clear();
    this.bookTickers.clear();
    this.contractStatuses.clear();
    this.orders.clear();
    this.lastUpdate.clear();
  }

  /**
   * Add a subscription
   */
  addSubscription(channel: string): void {
    this.subscriptions.add(channel);
  }

  /**
   * Remove a subscription
   */
  removeSubscription(channel: string): void {
    this.subscriptions.delete(channel);
  }

  /**
   * Get all active subscriptions
   */
  getSubscriptions(): string[] {
    return Array.from(this.subscriptions);
  }

  /**
   * Check if subscribed to a channel
   */
  hasSubscription(channel: string): boolean {
    return this.subscriptions.has(channel);
  }

  /**
   * Get data freshness for a symbol (milliseconds since last update)
   */
  getDataAge(symbol: string): number | null {
    const lastUpd = this.lastUpdate.get(symbol.toUpperCase());
    if (!lastUpd) return null;
    return Date.now() - lastUpd;
  }

  /**
   * Check if data is fresh (updated within threshold ms)
   */
  isFresh(symbol: string, thresholdMs = 5000): boolean {
    const age = this.getDataAge(symbol);
    return age !== null && age < thresholdMs;
  }

  /**
   * Get store statistics
   */
  getStats(): {
    symbolCount: number;
    priceCount: number;
    orderBookCount: number;
    tradeSymbolCount: number;
    totalTradeCount: number;
    bookTickerCount: number;
    contractStatusCount: number;
    orderCount: number;
    subscriptionCount: number;
  } {
    let totalTradeCount = 0;
    for (const trades of this.trades.values()) {
      totalTradeCount += trades.length;
    }

    return {
      symbolCount: this.lastUpdate.size,
      priceCount: this.prices.size,
      orderBookCount: this.orderBooks.size,
      tradeSymbolCount: this.trades.size,
      totalTradeCount,
      bookTickerCount: this.bookTickers.size,
      contractStatusCount: this.contractStatuses.size,
      orderCount: this.orders.size,
      subscriptionCount: this.subscriptions.size,
    };
  }
}
