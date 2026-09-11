// A field the API spec declares as int64. The HTTP client parses responses
// with json-bigint `storeAsString: true`, which converts an integer to a
// string only when it exceeds Number.MAX_SAFE_INTEGER (2^53 - 1, ~16 digits)
// and leaves smaller integers as JS numbers. Fields whose magnitude is not
// guaranteed therefore arrive as either type, so consumers must not assume
// one. Prediction-market `orderId` is the exception: prod IDs are always
// 17-18 digits, so `src/types/predictions.ts` declares it as `string`.
export type Int64 = string | number;

export type OrderSide = 'buy' | 'sell';
export type OrderType = 'exchange limit' | 'exchange stop limit' | 'exchange market' | 'limit' | 'market';
export type OrderStatus = 'live' | 'cancelled' | 'closed' | 'filling';

export interface ApiError {
  result: 'error';
  reason: string;
  message: string;
}
