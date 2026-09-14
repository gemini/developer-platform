import type { Int64 } from './common.js';

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

// A historically settled position in a resolved prediction market contract.
// Every field is optional per spec — the API omits fields it cannot compute
// rather than sending null, so render "unavailable" states rather than
// assuming any field is always present.
export interface SettledPosition {
  accountId?: Int64;
  contractMetadata?: ContractMetadata;
  costBasis?: string;
  instrumentId?: Int64;
  instrumentSymbol?: string;
  netProfit?: string;
  outcome?: 'yes' | 'no';
  payout?: string;
  // Signed position held at settlement: positive = yes, negative = no.
  // Declared `*string` in the generated spec, but confirmed against a real
  // production response to arrive as a JSON number (e.g. `4`, `-2.96`), not
  // a quoted string — typed as a union to match observed behavior.
  position?: string | number;
  positionQuantity?: string;
  realizedPnl?: string;
  resolutionSide?: 'yes' | 'no';
  settledAt?: string;
}

// A cash-out (early sell before contract resolution) surfaced only when
// withCashOuts=true is passed on the settled-positions request. Distinct
// from SettledPosition — a cash-out has no `payout` or `resolutionSide`
// since the contract hadn't resolved when the position was sold.
export interface CashedOutPosition {
  accountId: Int64;
  contractMetadata?: ContractMetadata;
  costBasis: string;
  filledQuantity: string;
  instrumentId: Int64;
  instrumentSymbol: string;
  netProfit: string;
  proceeds: string;
  side: 'sell';
  timestamp: string;
}

export interface SettledPositionsResponse {
  positions?: SettledPosition[];
  // Present only when withCashOuts=true was passed on the request.
  cashOuts?: CashedOutPosition[];
  total?: number;
  // These four roll-up totals are frequently ABSENT on the current backend
  // (computing them requires a separate aggregate query the backend doesn't
  // always run) — treat their absence as "not computed", not zero. If a
  // caller needs a total, sum `positions[]`/`cashOuts[]` directly rather
  // than trusting these to be present.
  totalCostBasis?: string;
  totalNetProfit?: string;
  totalPayout?: string;
  totalCashOutCostBasis?: string;
  totalCashOutNetProfit?: string;
  totalCashOutProceeds?: string;
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

export interface ComboLeg {
  comboId: Int64;
  contract?: ContractMetadata;
  // Decimal string per spec, NOT Int64 — the underlying contract's ID as a
  // literal decimal string, distinct from comboId's int64 encoding.
  contractId: string;
  legIndex: number;
  // Capitalized per the actual API wire format — NOT the lowercase 'yes'/'no'
  // used everywhere else in this codebase. See the gotcha note above.
  requiredOutcome: 'Yes' | 'No';
  // The outcome this leg has settled to, if resolved. Null/absent while active.
  legOutcome?: 'Yes' | 'No';
  resolvedAt?: string;
}

export interface ComboResponse {
  contract: ContractMetadata;
  legs: ComboLeg[];
}

export interface ListCombosResponse {
  combos: ComboResponse[];
  pagination: Pagination;
}

// The exact shape of a leg nested inside ComboSummary.legs (the create/register
// response) is not confirmed from the generated spec available in this project
// — only the top-level ComboSummary fields and the request-side leg shape are.
// Modeled loosely here as the subset we're confident about (contractId,
// requiredOutcome — same wire format as ComboLeg above) rather than guessing
// fields with no evidence. Extend once the actual response shape is confirmed.
export interface ComboSummaryLeg {
  contractId: string;
  requiredOutcome: 'Yes' | 'No';
}

export interface ComboSummary {
  canonicalLegKey: string;
  createdAt?: string;
  displayName?: string;
  id: Int64;
  instrumentId?: Int64;
  instrumentRegistered: boolean;
  instrumentSymbol?: string;
  latestExpiryDate?: string;
  legCount: number;
  legs: ComboSummaryLeg[];
  status?: string;
  updatedAt?: string;
}

export interface CreateComboResponse {
  alreadyExisted: boolean;
  combo: ComboSummary;
}

export interface CancelOrderResponse {
  result: string;
  message: string;
}

export interface BatchOrderResult {
  // String, not number: same 17-18 digit precision reasoning as
  // PredictionOrder.orderId above.
  orderId: string;
  hashOrderId?: string;
  clientOrderId?: string;
  globalOrderId?: string;
  // The batch API's status enum has one more value than the single-order
  // OrderStatus: 'closed', returned when a successful IOC/FOK order didn't
  // fill (accepted and immediately closed, distinct from a resting 'open'
  // order or an explicitly 'cancelled' one). Confirmed against the spec's
  // dedicated BatchOrderResponseStatus enum, not present on OrderStatus.
  status: OrderStatus | 'closed';
  symbol: string;
  side: 'buy' | 'sell';
  outcome: 'yes' | 'no';
  orderType: string;
  quantity: string;
  filledQuantity: string;
  remainingQuantity: string;
  price: string;
  avgExecutionPrice?: string;
  fundsOnHold?: string;
  createdAt: string;
  updatedAt?: string;
  cancelledAt?: string;
  contractMetadata?: ContractMetadata;
}

// Discriminated by the presence of `order` vs `error`/`message`. Results are
// positional (same order as the request) and may mix successes and
// rejections in one response — never assume a 200 means every entry succeeded.
export type PlaceOrderBatchResult =
  | { order: BatchOrderResult }
  | { error: string; message: string };

export interface PlaceOrderBatchResponse {
  results: PlaceOrderBatchResult[];
}

// Same positional-mixed-results caveat as PlaceOrderBatchResponse.
export type CancelOrderBatchResult =
  | { orderId: string; result: string }
  | { orderId: string; error: string; message: string };

export interface CancelOrderBatchResponse {
  results: CancelOrderBatchResult[];
}
