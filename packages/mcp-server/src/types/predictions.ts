export type EventStatus = 'approved' | 'active' | 'closed' | 'under_review' | 'settled' | 'invalid';

export type OrderStatus = 'open' | 'filled' | 'cancelled';

export type TimeInForce = 'good-til-cancel' | 'immediate-or-cancel' | 'fill-or-kill' | 'maker-or-cancel';

export interface Pagination {
  limit: number;
  offset: number;
  total?: number;
  count?: number;
}

export interface PredictionContract {
  id: string;
  symbol: string;
  outcome: string;
  bestBid?: string;
  bestAsk?: string;
  lastTradePrice?: string;
  volume?: string;
  openInterest?: string;
}

export interface PredictionEvent {
  id: string;
  ticker: string;
  title: string;
  category: string;
  status: EventStatus;
  contracts: PredictionContract[];
  volume?: string;
  liquidity?: string;
  openTime?: string;
  closeTime?: string;
  settlementTime?: string;
  settlementValue?: string;
  description?: string;
}

export interface EventStrike {
  value: string | null;
  type: 'reference' | 'above';
  availableAt: string;
}

export interface ContractMetadata {
  contractId: string;
  contractName: string;
  eventTicker: string;
  eventName: string;
  category: string;
}

export interface PredictionOrder {
  // String, not number: prediction-market order IDs are 17–18 digits in
  // prod (e.g. `145828833218573125`) — past JavaScript's
  // `Number.MAX_SAFE_INTEGER` (2^53 − 1, ≈ 16 digits). The HTTP client
  // parses responses with json-bigint storeAsString:true so this field
  // arrives as a precision-preserved string. Use it verbatim when calling
  // back into MCP tools that accept an `orderId` input.
  orderId: string;
  status: OrderStatus;
  symbol: string;
  side: 'buy' | 'sell';
  outcome: 'yes' | 'no';
  orderType: string;
  quantity: string;
  filledQuantity: string;
  remainingQuantity: string;
  price: string;
  avgExecutionPrice?: string;
  createdAt: string;
  updatedAt?: string;
  cancelledAt?: string;
  contractMetadata?: ContractMetadata;
}

export interface PredictionPosition {
  symbol: string;
  instrumentId: string;
  totalQuantity: string;
  avgPrice: string;
  outcome: 'yes' | 'no';
  contractMetadata?: ContractMetadata;
}

export interface ContractVolume {
  symbol: string;
  totalQty: string;
  userAggressorQty: string;
  userRestingQty: string;
}

export interface VolumeMetrics {
  eventTicker: string;
  contracts: ContractVolume[];
}

export interface EventsResponse {
  data: PredictionEvent[];
  pagination: Pagination;
}

export interface OrdersResponse {
  orders: PredictionOrder[];
  pagination: Pagination;
}

export interface PositionsResponse {
  positions: PredictionPosition[];
}

export interface CancelOrderResponse {
  result: string;
  message: string;
}
