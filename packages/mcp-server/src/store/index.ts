import type {
  CachedPriceData,
  CachedOrderBook,
  CachedTrade,
  CachedBookTicker,
} from '../types/websocket.js';

/**
 * In-memory store for real-time market data from WebSocket feeds
 */
export class MarketDataStore {
  private prices: Map<string, CachedPriceData> = new Map();
  private orderBooks: Map<string, CachedOrderBook> = new Map();
  private trades: Map<string, CachedTrade[]> = new Map();
  private bookTickers: Map<string, CachedBookTicker> = new Map();
  private subscriptions: Set<string> = new Set();
  private lastUpdate: Map<string, number> = new Map();

  // Configuration
  private readonly maxTradesPerSymbol: number;

  constructor(maxTradesPerSymbol = 100) {
    this.maxTradesPerSymbol = maxTradesPerSymbol;
  }

  /**
   * Update price data for a symbol
   */
  updatePrice(symbol: string, price: string, source: 'trade' | 'ticker' = 'trade'): void {
    const timestamp = Date.now();
    this.prices.set(symbol.toUpperCase(), {
      symbol: symbol.toUpperCase(),
      price,
      timestamp,
      source,
    });
    this.lastUpdate.set(symbol.toUpperCase(), timestamp);
  }

  /**
   * Update order book for a symbol
   */
  updateOrderBook(symbol: string, bids: [string, string][], asks: [string, string][]): void {
    const timestamp = Date.now();
    this.orderBooks.set(symbol.toUpperCase(), {
      symbol: symbol.toUpperCase(),
      bids,
      asks,
      timestamp,
    });
    this.lastUpdate.set(symbol.toUpperCase(), timestamp);
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
    this.lastUpdate.set(upperSymbol, Date.now());
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
    const timestamp = Date.now();
    this.bookTickers.set(symbol.toUpperCase(), {
      symbol: symbol.toUpperCase(),
      bestBid,
      bestBidQty,
      bestAsk,
      bestAskQty,
      timestamp,
    });
    this.lastUpdate.set(symbol.toUpperCase(), timestamp);
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
      subscriptionCount: this.subscriptions.size,
    };
  }
}
