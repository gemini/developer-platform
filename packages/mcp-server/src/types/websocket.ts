/**
 * WebSocket channel types for Gemini API
 */
export type WSChannel =
  | 'trade'
  | 'depth'
  | 'bookTicker'
  | 'ticker'
  | 'contractStatus';

/**
 * WebSocket subscription request
 */
export interface WSSubscribeRequest {
  id: string;
  method: 'subscribe' | 'unsubscribe';
  params: string[];
}

/**
 * WebSocket subscription response
 */
export interface WSSubscribeResponse {
  id: string;
  result: string[] | null;
  error?: {
    code: number;
    message: string;
  };
}

/**
 * Trade message from WebSocket
 */
export interface WSTradeMessage {
  s: string;      // symbol (e.g., "BTCUSD")
  p: string;      // price
  q: string;      // quantity
  m: boolean;     // is maker
  E: number;      // timestamp (nanoseconds)
  t: number;      // trade ID
}

/**
 * Order book depth message
 */
export interface WSDepthMessage {
  s: string;      // symbol
  b: [string, string][]; // bids [[price, quantity], ...]
  a: [string, string][]; // asks [[price, quantity], ...]
  E: number;      // timestamp
}

/**
 * Book ticker message (best bid/ask)
 */
export interface WSBookTickerMessage {
  s: string;      // symbol
  b: string;      // best bid price
  B: string;      // best bid quantity
  a: string;      // best ask price
  A: string;      // best ask quantity
  E: number;      // timestamp
}

/**
 * 24h ticker message
 */
export interface WSTickerMessage {
  s: string;      // symbol
  o: string;      // open price
  h: string;      // high price
  l: string;      // low price
  c: string;      // close price
  v: string;      // volume
  q: string;      // quote volume
  E: number;      // timestamp
}

/**
 * Contract status message (for prediction markets)
 */
export interface WSContractStatusMessage {
  s: string;      // symbol
  c: string;      // contract type
  o: string;      // old status
  n: string;      // new status
  p?: string;     // strike price (optional)
  E: number;      // timestamp
}

/**
 * Union of all possible WebSocket messages
 */
export type WSMessage =
  | WSTradeMessage
  | WSDepthMessage
  | WSBookTickerMessage
  | WSTickerMessage
  | WSContractStatusMessage
  | WSSubscribeResponse;

/**
 * Stored price data in cache
 */
export interface CachedPriceData {
  symbol: string;
  price: string;
  timestamp: number;
  source: 'trade' | 'ticker';
}

/**
 * Stored order book data
 */
export interface CachedOrderBook {
  symbol: string;
  bids: [string, string][];
  asks: [string, string][];
  timestamp: number;
}

/**
 * Stored trade data
 */
export interface CachedTrade {
  symbol: string;
  price: string;
  quantity: string;
  isMaker: boolean;
  timestamp: number;
  tradeId: number;
}

/**
 * Stored book ticker data
 */
export interface CachedBookTicker {
  symbol: string;
  bestBid: string;
  bestBidQty: string;
  bestAsk: string;
  bestAskQty: string;
  timestamp: number;
}

/**
 * WebSocket connection status
 */
export type WSConnectionStatus =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'error';

/**
 * WebSocket manager state
 */
export interface WSManagerState {
  status: WSConnectionStatus;
  subscriptions: string[];
  lastConnected?: number;
  lastError?: string;
  reconnectAttempts: number;
}
