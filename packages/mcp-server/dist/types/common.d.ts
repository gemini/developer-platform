export type OrderSide = 'buy' | 'sell';
export type OrderType = 'exchange limit' | 'exchange stop limit' | 'exchange market' | 'limit' | 'market';
export type OrderStatus = 'live' | 'cancelled' | 'closed' | 'filling';
export interface ApiError {
    result: 'error';
    reason: string;
    message: string;
}
