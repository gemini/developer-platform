import type { OrderSide } from './common.js';
export type { OrderSide };
export interface Order {
    order_id: string;
    id: string;
    symbol: string;
    exchange: string;
    avg_execution_price: string;
    side: OrderSide;
    type: string;
    timestamp: string;
    timestampms: number;
    is_live: boolean;
    is_cancelled: boolean;
    is_hidden: boolean;
    was_forced: boolean;
    executed_amount: string;
    remaining_amount: string;
    client_order_id?: string;
    options: string[];
    price: string;
    original_amount: string;
    status: string;
}
export interface MyTrade {
    price: string;
    amount: string;
    timestamp: number;
    timestampms: number;
    type: string;
    aggressor: boolean;
    fee_currency: string;
    fee_amount: string;
    tid: number;
    order_id: string;
    exchange: string;
    is_auction_fill: boolean;
    is_clearing_fill: boolean;
    symbol: string;
    client_order_id?: string;
    break?: string;
}
export interface OrderStatusDetail extends Order {
    trades?: MyTrade[];
}
export interface TradeVolume {
    symbol: string;
    base_currency: string;
    notional_currency: string;
    data_date: string;
    total_volume_base: number;
    maker_buy_sell_ratio: number;
    buy_maker_base: number;
    buy_maker_notional: number;
    buy_maker_count: number;
    sell_maker_base: number;
    sell_maker_notional: number;
    sell_maker_count: number;
    buy_taker_base: number;
    buy_taker_notional: number;
    buy_taker_count: number;
    sell_taker_base: number;
    sell_taker_notional: number;
    sell_taker_count: number;
}
export interface NotionalVolume {
    web_maker_fee_bps: number;
    web_taker_fee_bps: number;
    web_auction_fee_bps: number;
    api_maker_fee_bps: number;
    api_taker_fee_bps: number;
    api_auction_fee_bps: number;
    fix_maker_fee_bps: number;
    fix_taker_fee_bps: number;
    fix_auction_fee_bps: number;
    block_maker_fee_bps: number;
    block_taker_fee_bps: number;
    notional_30d_volume: number;
    last_updated_ms: number;
    date: string;
    notional_1d_volume: Array<{
        date: string;
        notional_volume: number;
    }>;
}
